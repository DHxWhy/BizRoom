// backend/src/orchestrator/VoiceLiveOrchestrator.ts
// Wires TurnManager <-> VoiceLiveSessionManager <-> SignalR
// Includes Sophia background pipeline (visual gen, key points relay, mention routing)
// Ref: Design Spec §2, §7, §4

import { turnManager } from "./TurnManager.js";
import { voiceLiveManager } from "../services/VoiceLiveSessionManager.js";
import { broadcastEvent } from "../services/SignalRService.js";
import { sophiaAgent } from "../agents/SophiaAgent.js";
import type { SophiaTaskQueueItem } from "../agents/SophiaAgent.js";
import { parseStructuredOutput } from "./ResponseParser.js";
import { AGENT_CONFIGS } from "../agents/agentConfigs.js";
import { SOPHIA_VISUAL_SYSTEM_PROMPT } from "../agents/prompts/sophia.js";
import { searchBing, formatSearchContext } from "../services/BingSearchService.js";
import { addSearchResult } from "./ContextBroker.js";
import {
  getModelForTask,
  getAnthropicClient,
  getOpenAIClient as getOpenAIClientFromRouter,
  getFoundryClient,
} from "../services/ModelRouter.js";
import type { AgentRole, VisualHint, VisualType, BigScreenRenderData } from "../models/index.js";

// ── Visual Intent Detection (Option C) ──
// In VoiceLive mode, agents respond via Realtime API audio which outputs plain text,
// not structured JSON. This means ResponseParser always falls to Tier 3 (fallback)
// where visual_hint is null. To work around this, we detect visual intent directly
// from the user's original input using keyword matching and synthesize a VisualHint.

/** Keyword groups mapped to VisualType for user-input visual-intent detection */
const VISUAL_KEYWORD_MAP: Array<{ type: VisualType; title: string; keywords: RegExp }> = [
  {
    type: "comparison",
    title: "비교 분석",
    keywords: /비교|대조|versus|vs\b|차이점|장단점|pros?\s*(?:and|&)?\s*cons?|비교해|비교 ?분석|어떤 게 나|뭐가 나/i,
  },
  {
    type: "pie-chart",
    title: "비율 분석",
    keywords: /비율|비중|점유율|파이|구성비|퍼센트|%|pie|proportion|share|분포/i,
  },
  {
    type: "bar-chart",
    title: "데이터 차트",
    keywords: /차트|그래프|막대|바차트|수치|통계|시장.*규모|규모.*파악|우선순위.*시각|chart|graph|bar|stat|데이터.*(?:보여|보이|표시|시각)/i,
  },
  {
    type: "timeline",
    title: "일정 타임라인",
    keywords: /타임라인|일정|로드맵|마일스톤|단계.*계획|언제.*까지|timeline|roadmap|milestone|schedule|스케줄/i,
  },
  {
    type: "checklist",
    title: "체크리스트",
    keywords: /체크리스트|할.*일|목록|리스트.*(?:정리|만들)|checklist|to-?do|task.*list/i,
  },
  {
    type: "summary",
    title: "논의 요약",
    keywords: /요약|정리|핵심.*(?:정리|요약)|지금까지.*정리|summary|summarize|wrap.*up|종합/i,
  },
  {
    type: "architecture",
    title: "아키텍처 다이어그램",
    keywords: /아키텍처|구조도|시스템.*구조|다이어그램|architecture|diagram|system.*design|플로우.*차트|flowchart/i,
  },
];

/** Catch-all visual keywords — trigger summary as default when user explicitly asks for visuals */
const GENERIC_VISUAL_REQUEST = /시각화|빅스크린|화면.*(?:보여|띄워|표시)|보여.*줘|visuali[sz]e|show.*(?:on|me)|display|big\s*screen/i;

/**
 * Detect visual intent from user input text.
 * Returns a synthesized VisualHint if visual keywords are found, null otherwise.
 * Also incorporates the agent's speech to refine the title when possible.
 */
export function detectVisualIntent(userInput: string, agentSpeech?: string): VisualHint | null {
  // Check USER INPUT first (higher priority — matches user's actual request)
  for (const entry of VISUAL_KEYWORD_MAP) {
    if (entry.keywords.test(userInput)) {
      const title = extractVisualTitle(userInput, entry.title);
      return { type: entry.type, title };
    }
  }

  // Then check agent speech as fallback (lower priority)
  if (agentSpeech) {
    for (const entry of VISUAL_KEYWORD_MAP) {
      if (entry.keywords.test(agentSpeech)) {
        const title = extractVisualTitle(userInput, entry.title);
        return { type: entry.type, title };
      }
    }
  }

  // Check generic visual request — default to summary
  if (GENERIC_VISUAL_REQUEST.test(userInput)) {
    return { type: "summary", title: extractVisualTitle(userInput, "논의 요약") };
  }

  return null;
}

/**
 * Extract a contextual title from user input, falling back to default.
 * Tries to pull the topic/subject from the input for a meaningful title.
 */
function extractVisualTitle(input: string, defaultTitle: string): string {
  // Strip common visual request prefixes to isolate the topic
  const cleaned = input
    .replace(/\[.*?\]:\s*/g, "") // Remove "[Username]: " prefixes
    .replace(/시각화|차트|그래프|비교|요약|정리|보여.*줘|해.*줘|만들어.*줘|빅스크린/g, "")
    .trim();

  // If we extracted a meaningful topic (3+ chars), use it in the title
  if (cleaned.length >= 3 && cleaned.length <= 40) {
    return `${cleaned} ${defaultTitle}`;
  }
  return defaultTitle;
}

// Track which rooms have already triggered visual-intent detection this turn.
// Prevents duplicate visuals when multiple agents respond in the same turn.
const visualIntentChecked = new Set<string>();

// Track which rooms had sophiaDirect fire this turn.
// Prevents agentsDone from enqueuing a second visual for the same user request
// when Sophia was directly addressed (sophiaDirect already enqueued one).
const sophiaDirectFired = new Set<string>();

// Track per-room event listeners for cleanup
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RoomListener = (...args: any[]) => void;

const roomListeners = new Map<
  string,
  Array<{
    emitter: NodeJS.EventEmitter;
    event: string;
    fn: RoomListener;
  }>
>();

function addRoomListener(
  roomId: string,
  emitter: NodeJS.EventEmitter,
  event: string,
  fn: RoomListener,
): void {
  if (!roomListeners.has(roomId)) roomListeners.set(roomId, []);
  roomListeners.get(roomId)!.push({ emitter, event, fn });
  emitter.on(event, fn);
}

/**
 * Initialize bidirectional event wiring for a room.
 * Idempotent: calling twice for the same roomId is a no-op (prevents duplicate listeners).
 */
export function wireVoiceLiveForRoom(
  roomId: string,
  ceoUserId: string,
  ceoName: string,
): void {
  // Idempotency guard: if listeners are already registered for this room, skip.
  // Without this guard, calling wireVoiceLiveForRoom twice (e.g., from a double
  // HTTP request or React dev-mode double-invoke) would register duplicate
  // EventEmitter listeners, causing Sophia audio and agent responses to broadcast twice.
  if (roomListeners.has(roomId)) {
    console.warn(`[VoiceLive] wireVoiceLiveForRoom called twice for room ${roomId} — skipping duplicate wiring`);
    return;
  }

  // Set CEO in TurnManager
  turnManager.setCeo(roomId, ceoUserId);

  // Initialize Sophia buffer for this room
  sophiaAgent.initRoom(roomId);

  // VoiceLive -> TurnManager: speech events (room-scoped — no filtering needed)
  addRoomListener(
    roomId,
    voiceLiveManager,
    "speechStarted:" + roomId,
    (_rid: string, userId: string) => {
      turnManager.onSpeechStart(roomId, userId);
    },
  );

  addRoomListener(
    roomId,
    voiceLiveManager,
    "speechStopped:" + roomId,
    (_rid: string, userId: string) => {
      turnManager.onSpeechEnd(roomId, userId);
    },
  );

  // Fix I7: use ceoName param instead of hardcoded "CEO"
  addRoomListener(
    roomId,
    voiceLiveManager,
    "transcript:" + roomId,
    (_rid: string, userId: string, text: string) => {
      turnManager.onTranscript(roomId, userId, ceoName, text);
    },
  );

  // VoiceLive -> SignalR: agent streaming events (room-scoped — no filtering needed)
  addRoomListener(
    roomId,
    voiceLiveManager,
    "agentAudioDelta:" + roomId,
    (_rid: string, role: AgentRole, audioBase64: string) => {
      broadcastEvent(roomId, {
        type: "agentAudioDelta",
        payload: { role, audioBase64, format: "pcm16_24k" },
      });
    },
  );

  addRoomListener(
    roomId,
    voiceLiveManager,
    "agentTextDelta:" + roomId,
    (_rid: string, role: AgentRole, text: string) => {
      broadcastEvent(roomId, {
        type: "agentTranscriptDelta",
        payload: { role, text, isFinal: false },
      });
    },
  );

  addRoomListener(
    roomId,
    voiceLiveManager,
    "agentVisemeDelta:" + roomId,
    (_rid: string, role: AgentRole, visemeId: number, audioOffsetMs: number) => {
      broadcastEvent(roomId, {
        type: "agentVisemeDelta",
        payload: { role, visemeId, audioOffsetMs },
      });
    },
  );

  addRoomListener(
    roomId,
    voiceLiveManager,
    "agentDone:" + roomId,
    (_rid: string, role: AgentRole, fullText: string) => {
      // Clear typing indicator for this agent
      const doneDisplayName = AGENT_CONFIGS[role]?.name ?? role;
      broadcastEvent(roomId, {
        type: "agentTyping",
        payload: { agentId: `agent-${role}`, agentName: doneDisplayName, isTyping: false },
      });

      // Sophia voice announcements bypass the C-Suite pipeline entirely
      if ((role as string) === "sophia") return;

      // Parse structured output FIRST — extract speech from JSON
      const parsed = parseStructuredOutput(fullText, role);

      // Broadcast only the speech text (not raw JSON) to frontend chat
      broadcastEvent(roomId, {
        type: "agentResponseDone",
        payload: { role, fullText: parsed.data.speech },
      });

      // 1. Buffer accumulation (always)
      sophiaAgent.addToBuffer(roomId, {
        speaker: AGENT_CONFIGS[role]?.name ?? role,
        role,
        speech: parsed.data.speech,
        keyPoints: parsed.data.key_points,
        visualHint: parsed.data.visual_hint,
        timestamp: Date.now(),
      });

      // 2. Key points relay to CEO monitor (no GPT call)
      if (parsed.data.key_points.length > 0) {
        broadcastEvent(roomId, {
          type: "monitorUpdate",
          payload: {
            target: "ceo",
            mode: "keyPoints",
            content: { type: "keyPoints", agentRole: role, points: parsed.data.key_points },
          },
        });
      }

      // 3. Mention routing (agent-to-agent or human callout)
      turnManager.handleMentionRouting(roomId, parsed.data, role);

      // 4. Enqueue visual generation (FIFO queue — sequential processing)
      //    Primary path: structured JSON visual_hint from ResponseParser (Tier 1/2)
      //    Fallback path: keyword-based visual-intent detection from user input
      //    The fallback is needed because VoiceLive Realtime API returns plain text,
      //    so ResponseParser always falls to Tier 3 where visual_hint = null.
      let visualTriggered = false;

      if (sophiaAgent.hasVisualHint(parsed.data)) {
        // Tier 1/2 structured output — use the LLM-generated visual_hint
        sophiaAgent.enqueueVisual(roomId, parsed.data.visual_hint!);
        processVisualQueue(roomId);
        visualTriggered = true;
      }

      // Fallback: keyword-based visual-intent detection (once per turn)
      if (!visualTriggered && !visualIntentChecked.has(roomId)) {
        visualIntentChecked.add(roomId);
        const userInput = turnManager.getCombinedInput(roomId);
        const detectedHint = detectVisualIntent(userInput, parsed.data.speech);
        if (detectedHint) {
          console.log(`[Sophia] Visual intent detected from user input: type=${detectedHint.type}, title="${detectedHint.title}"`);
          sophiaAgent.enqueueVisual(roomId, detectedHint);
          processVisualQueue(roomId);
        }
      }

      // 5. Sophia task request — agents delegate research/search/analysis to Sophia
      if (parsed.data.sophia_request) {
        const req = parsed.data.sophia_request;
        console.log(`[Sophia] Task request from ${role}: type=${req.type}, query="${req.query}"`);
        sophiaAgent.enqueueTask(roomId, {
          type: req.type,
          query: req.query,
          requestedBy: role,
          addedAt: Date.now(),
        });
        processSophiaTaskQueue(roomId);
      }

      // Notify TurnManager with speech text (not raw JSON) so stored messages are clean
      turnManager.onAgentDone(roomId, role, parsed.data.speech, true);
    },
  );

  // When all agents finish responding for this turn:
  // 1. Reset visual-intent flag and sophiaDirect flag
  // 2. Sophia keyword detection — trigger search/visual if user's original message
  //    contains Sophia-related keywords (mirrors SSE path Sophia turn logic)
  addRoomListener(
    roomId,
    turnManager,
    "agentsDone:" + roomId,
    async (_rid: string) => {
      visualIntentChecked.delete(roomId);

      // If sophiaDirect already handled this turn, skip the agentsDone visual path
      // to prevent double TTS (Sophia would announce twice for the same request).
      if (sophiaDirectFired.has(roomId)) {
        sophiaDirectFired.delete(roomId);
        return;
      }

      // Sophia keyword detection (same as SSE path)
      const userInput = turnManager.getCombinedInput(roomId);
      const SOPHIA_KEYWORDS = /시각화|차트|그래프|보여|정리|웹서칭|웹검색|조사|리서치/i;
      if (!SOPHIA_KEYWORDS.test(userInput)) return;

      const wantsSearch = /웹|서칭|검색|조사|리서치|search|research/i.test(userInput);
      const wantsVisual = /시각화|차트|그래프|보여|정리|visualize|chart|graph/i.test(userInput);

      if (!wantsSearch && !wantsVisual) return;

      // Announce Sophia activity
      const tasks: string[] = [];
      if (wantsSearch) tasks.push("웹 자료 조사");
      if (wantsVisual) tasks.push("시각화 생성");
      if (tasks.length === 0) tasks.push("자료 정리");

      broadcastEvent(roomId, {
        type: "sophiaMessage",
        payload: { text: `${tasks.join(" 후 ")}을 진행하겠습니다.` },
      });
      voiceLiveManager.triggerSophiaVoice(roomId, `${tasks.join(" 후 ")}을 진행하겠습니다.`);

      // Show Sophia Thinking UI on CEO monitor
      broadcastEvent(roomId, {
        type: "monitorUpdate",
        payload: {
          target: "ceo",
          mode: "thinking",
          content: { type: "thinking", text: `Sophia: ${tasks.join(" + ")} 중...` },
        },
      });

      // Search
      if (wantsSearch) {
        try {
          // Strip user name prefixes to extract the core query
          const searchQuery = userInput.replace(/\[.*?\]:\s*/g, "").trim() || userInput;
          const results = await searchBing(searchQuery, 5);
          if (results.length > 0) {
            addSearchResult(roomId, searchQuery, results);
            broadcastEvent(roomId, {
              type: "monitorUpdate",
              payload: {
                target: "ceo",
                mode: "searchResults",
                content: {
                  type: "searchResults",
                  query: searchQuery,
                  requestedBy: "user",
                  results: results.map((r) => ({ name: r.name, snippet: r.snippet, url: r.url })),
                },
              },
            });
            broadcastEvent(roomId, {
              type: "sophiaMessage",
              payload: { text: `조사 완료: ${results.length}건의 결과를 찾았습니다.` },
            });
            voiceLiveManager.triggerSophiaVoice(roomId, `조사 완료했습니다. ${results.length}건의 결과를 찾았습니다.`);
          }
        } catch (err) {
          console.error("[Sophia] agentsDone search failed:", err);
        }
      }

      // Visualize — let LLM decide the type based on user's actual request
      if (wantsVisual) {
        const userRequest = userInput.replace(/\[.*?\]:\s*/g, "").trim();
        const hint = { type: "summary" as const, title: userRequest.slice(0, 60) || "요약" };
        sophiaAgent.enqueueVisual(roomId, hint);
        processVisualQueue(roomId);
      }
    },
  );

  // TurnManager -> Sophia: direct call from user (e.g., "소피아 시각화 해줘" or "소피아 조사해줘")
  addRoomListener(
    roomId,
    turnManager,
    "sophiaDirect:" + roomId,
    (_rid: string, userInput: string) => {
      // Mark that sophiaDirect handled this turn so agentsDone won't double-trigger.
      sophiaDirectFired.add(roomId);

      // Detect if user is requesting search/research
      const SEARCH_INTENT = /조사해|찾아봐|알아봐|리서치해|검색해|search|look up|find out|research/i;
      const isSearchRequest = SEARCH_INTENT.test(userInput);

      // Show Sophia Thinking UI on CEO monitor
      broadcastEvent(roomId, {
        type: "monitorUpdate",
        payload: {
          target: "ceo",
          mode: "thinking",
          content: { type: "thinking", text: isSearchRequest ? "Sophia 조사 중..." : "Sophia 시각화 생성 중..." },
        },
      });

      if (isSearchRequest) {
        // Sophia search mode
        voiceLiveManager.triggerSophiaVoice(roomId, "네, 조사를 진행하겠습니다. 잠시만 기다려 주세요.");
        broadcastEvent(roomId, {
          type: "sophiaMessage",
          payload: { text: "조사를 진행하겠습니다. 잠시만 기다려 주세요." },
        });

        // Extract query: strip the Sophia mention and search keywords
        const query = userInput
          .replace(/\[.*?\]:\s*/g, "")
          .replace(/소피아|sophia|소피야/gi, "")
          .replace(/조사해|찾아봐|알아봐|리서치해|검색해|search|look up|find out|research|줘|해/gi, "")
          .trim() || userInput;

        sophiaAgent.enqueueTask(roomId, {
          type: "search",
          query,
          requestedBy: "user",
          addedAt: Date.now(),
        });
        processSophiaTaskQueue(roomId);
      } else {
        // Sophia visual mode (existing behavior)
        voiceLiveManager.triggerSophiaVoice(roomId, "네, 시각화 작업을 진행하겠습니다. 잠시만 기다려 주세요.");
        broadcastEvent(roomId, {
          type: "sophiaMessage",
          payload: { text: "시각화 작업을 진행하겠습니다. 잠시만 기다려 주세요." },
        });

        // Detect visual intent from user input and trigger generation.
        // Pass fromDirect=true so processVisualQueue skips the post-generation
        // voice announcement (the acknowledgment line above already plays TTS).
        const hint = detectVisualIntent(userInput) ?? { type: "summary" as const, title: "요청 시각화" };
        sophiaAgent.enqueueVisual(roomId, hint, true);
        processVisualQueue(roomId);
      }
    },
  );

  // TurnManager -> VoiceLive: trigger/cancel agents (room-scoped — no filtering needed)
  addRoomListener(
    roomId,
    turnManager,
    "triggerAgent:" + roomId,
    (_rid: string, role: AgentRole, instructions: string) => {
      voiceLiveManager.triggerAgentResponse(roomId, role, instructions);
      broadcastEvent(roomId, {
        type: "agentTyping",
        payload: { agentId: `agent-${role}`, agentName: AGENT_CONFIGS[role]?.name ?? role, isTyping: true },
      });
    },
  );

  addRoomListener(roomId, turnManager, "cancelAgent:" + roomId, (_rid: string, role: AgentRole) => {
    voiceLiveManager.cancelAgentResponse(roomId, role);
    broadcastEvent(roomId, {
      type: "agentTyping",
      payload: { agentId: `agent-${role}`, agentName: AGENT_CONFIGS[role]?.name ?? role, isTyping: false },
    });
  });
}

/** Clean up room event wiring -- removes all listeners to prevent leaks (fix I5) */
export function unwireVoiceLiveForRoom(roomId: string): void {
  const listeners = roomListeners.get(roomId);
  if (listeners) {
    for (const { emitter, event, fn } of listeners) {
      emitter.removeListener(event, fn);
    }
    roomListeners.delete(roomId);
  }
  visualIntentChecked.delete(roomId);
  sophiaDirectFired.delete(roomId);
  turnManager.destroyRoom(roomId);
  voiceLiveManager.teardownRoom(roomId);
  sophiaAgent.destroyRoom(roomId);
}

// ── Sophia Visual Generation Pipeline ──
// Primary: Azure AI Foundry Model Router
// Fallback: Anthropic Sonnet 4.6 (fast + high-quality visualization)
// See ModelRouter.ts for provider selection logic

/**
 * Determine task type for Sophia visual generation based on hint complexity.
 * Simple types (summary, checklist) → Haiku (fast, ~1.6s)
 * Complex types (architecture, comparison, charts) → Sonnet (quality, ~5s)
 */
function classifyVisualComplexity(hint: VisualHint, contextLength: number): "visual-gen" | "visual-gen-fast" {
  // Simple types that need minimal reasoning
  const fastTypes = new Set(["summary", "checklist"]);
  if (fastTypes.has(hint.type)) return "visual-gen-fast";

  // Short context + simple chart → fast model is sufficient
  const basicChartTypes = new Set(["pie-chart", "bar-chart"]);
  if (basicChartTypes.has(hint.type) && contextLength < 500) return "visual-gen-fast";

  // Complex types that need spatial reasoning or data extraction
  // architecture, comparison, timeline, or charts with long context
  return "visual-gen";
}

/** Call LLM to generate BigScreenRenderData from a visual hint */
async function callSophiaVisualLLM(roomId: string, hint: VisualHint): Promise<BigScreenRenderData> {
  const recentContext = sophiaAgent.getRecentSpeeches(roomId, 5).join("\n");
  const userContent = `사용자 요청: "${hint.title}"\n\n최근 대화:\n${recentContext}\n\n위 맥락에서 가장 적합한 시각화 type을 직접 선택하고(comparison, pie-chart, bar-chart, timeline, checklist, summary, architecture 중 하나) BigScreenRenderData JSON을 생성하세요. items/columns/rows에 반드시 실제 내용을 채우세요.`;
  const taskType = classifyVisualComplexity(hint, recentContext.length);
  const selection = getModelForTask(taskType);

  let content: string;

  if (selection.provider === "anthropic") {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: selection.model,
      max_tokens: selection.maxTokens,
      temperature: selection.temperature,
      system: SOPHIA_VISUAL_SYSTEM_PROMPT + "\n\nRespond with valid JSON only.",
      messages: [{ role: "user", content: userContent }],
    });
    const block = response.content[0];
    content = block.type === "text" ? block.text : "{}";
  } else {
    // OpenAI or Foundry (OpenAI-compatible)
    const client =
      selection.provider === "foundry" ? getFoundryClient() : getOpenAIClientFromRouter();
    const response = await client.chat.completions.create({
      model: selection.model,
      temperature: selection.temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SOPHIA_VISUAL_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    });
    content = response.choices[0]?.message?.content ?? "{}";
  }

  // Strip markdown code fences (```json ... ```) that LLMs often wrap around JSON
  const cleaned = content.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  const parsed = JSON.parse(cleaned || "{}") as Record<string, unknown>;
  // Ensure type field matches hint
  if (typeof parsed.type !== "string") {
    parsed.type = hint.type;
  }
  // Sanitize: ensure required array fields are always present
  const t = parsed.type as string;
  if (["pie-chart", "bar-chart", "timeline", "checklist", "summary"].includes(t)) {
    if (!Array.isArray(parsed.items)) parsed.items = [];
  }
  if (t === "comparison") {
    if (!Array.isArray(parsed.columns)) parsed.columns = ["항목", "A", "B"];
    if (!Array.isArray(parsed.rows)) parsed.rows = [];
  }
  if (t === "architecture") {
    if (!Array.isArray(parsed.nodes)) parsed.nodes = [];
    if (!Array.isArray(parsed.edges)) parsed.edges = [];
  }
  return parsed as unknown as BigScreenRenderData;
}

/** Process the visual queue for a room — sequential, one at a time */
function processVisualQueue(roomId: string): void {
  if (sophiaAgent.isProcessingVisual(roomId)) return;

  const item = sophiaAgent.dequeueVisual(roomId);
  if (!item) return;

  sophiaAgent.setProcessingVisual(roomId, true);

  callSophiaVisualLLM(roomId, item.hint)
    .then((renderData) => {
      // Guard: room may have been destroyed while GPT call was in-flight
      if (!sophiaAgent.getRoomState(roomId)) return;
      broadcastEvent(roomId, {
        type: "bigScreenUpdate",
        payload: { visualType: item.hint.type, title: item.hint.title, renderData },
      });
      broadcastEvent(roomId, {
        type: "sophiaMessage",
        payload: { text: `${item.hint.title}를 빅스크린에 띄웠습니다` },
      });
      // Update CEO monitor: visual complete
      broadcastEvent(roomId, {
        type: "monitorUpdate",
        payload: {
          target: "ceo",
          mode: "keyPoints",
          content: { type: "keyPoints", agentRole: "sophia" as AgentRole, points: [`${item.hint.title} — 빅스크린 표시 완료`] },
        },
      });
      // Note: sophiaDirect handler already fired an acknowledgment voice line.
      // Only trigger a completion voice here when NOT initiated by sophiaDirect
      // (i.e., when triggered by structured visual_hint or keyword detection from
      // agent response — not a direct user request to Sophia).
      // The item carries a flag to distinguish these paths.
      if (!item.fromDirect) {
        voiceLiveManager.triggerSophiaVoice(roomId, `${item.hint.title}를 빅스크린에 띄웠습니다`);
      }
      sophiaAgent.addVisualToHistory(roomId, {
        type: item.hint.type,
        title: item.hint.title,
        renderData,
        timestamp: Date.now(),
        agendaItem: "",
      });
    })
    .catch((err) => {
      console.error("[Sophia] Visual generation failed:", err);
    })
    .finally(() => {
      sophiaAgent.setProcessingVisual(roomId, false);
      processVisualQueue(roomId);
    });
}

// ── Sophia Unified Task Queue Processor ──
// Processes search, analyze, and visualize tasks dispatched by agents via sophia_request.
// Tasks are processed in FIFO order, one at a time to avoid race conditions.

// Track per-room task processing state (separate from visual processing)
const processingTask = new Set<string>();

/**
 * Process the unified Sophia task queue for a room.
 * Handles search, analyze, and visualize task types:
 *  - search: calls Bing, injects results into ContextBroker, broadcasts to CEO monitor
 *  - analyze: treated as search (Bing grounding) + summary visual generation
 *  - visualize: enqueues a visual hint into the existing visual pipeline
 */
function processSophiaTaskQueue(roomId: string): void {
  if (processingTask.has(roomId)) return;

  const task = sophiaAgent.dequeueTask(roomId);
  if (!task) return;

  processingTask.add(roomId);

  executeSophiaTask(roomId, task)
    .catch((err) => {
      console.error(`[Sophia] Task processing failed (type=${task.type}, query="${task.query}"):`, err);
    })
    .finally(() => {
      processingTask.delete(roomId);
      // Process next task in queue
      processSophiaTaskQueue(roomId);
    });
}

/** Execute a single Sophia task */
async function executeSophiaTask(roomId: string, task: SophiaTaskQueueItem): Promise<void> {
  // Guard: room may have been destroyed
  if (!sophiaAgent.getRoomState(roomId)) return;

  switch (task.type) {
    case "search":
      await executeSophiaSearch(roomId, task);
      break;
    case "analyze":
      await executeSophiaAnalyze(roomId, task);
      break;
    case "visualize":
      // Delegate to existing visual pipeline
      sophiaAgent.enqueueVisual(roomId, { type: "summary", title: task.query });
      processVisualQueue(roomId);
      break;
  }
}

/** Execute Sophia search task: Bing search → ContextBroker injection → monitor broadcast */
async function executeSophiaSearch(roomId: string, task: SophiaTaskQueueItem): Promise<void> {
  const results = await searchBing(task.query, 5);

  if (results.length === 0) {
    // No results — silent degradation (Bing key not set or no matches)
    console.log(`[Sophia] Search returned no results for "${task.query}" (Bing key may not be configured)`);

    broadcastEvent(roomId, {
      type: "sophiaMessage",
      payload: { text: `"${task.query}" 관련 검색 결과를 찾지 못했습니다.` },
    });
    return;
  }

  // 1. Inject search results into ContextBroker so ALL subsequent agents see them
  addSearchResult(roomId, task.query, results);

  // 2. Broadcast search results to CEO monitor
  broadcastEvent(roomId, {
    type: "monitorUpdate",
    payload: {
      target: "ceo",
      mode: "searchResults",
      content: {
        type: "searchResults",
        query: task.query,
        requestedBy: task.requestedBy,
        results: results.map((r) => ({ name: r.name, snippet: r.snippet, url: r.url })),
      },
    },
  });

  // 3. Broadcast sophia message notification
  const requestedByName = AGENT_CONFIGS[task.requestedBy as keyof typeof AGENT_CONFIGS]?.name ?? task.requestedBy;
  broadcastEvent(roomId, {
    type: "sophiaMessage",
    payload: { text: `${requestedByName}의 요청으로 "${task.query}" 조사를 완료했습니다. (${results.length}건)` },
  });

  // 4. Voice announcement (only for direct user requests, not agent-initiated)
  if (task.requestedBy === "user") {
    voiceLiveManager.triggerSophiaVoice(roomId, `조사 완료했습니다. ${results.length}건의 결과를 찾았습니다.`);
  }
}

/** Execute Sophia analyze task: Bing search for grounding + summary visual generation */
async function executeSophiaAnalyze(roomId: string, task: SophiaTaskQueueItem): Promise<void> {
  // Step 1: Search for grounding data
  const results = await searchBing(task.query, 5);

  if (results.length > 0) {
    // Inject search results into context for the analysis
    addSearchResult(roomId, task.query, results);
  }

  // Step 2: Generate a summary visual using the enriched context
  sophiaAgent.enqueueVisual(roomId, { type: "summary", title: `${task.query} 분석` });
  processVisualQueue(roomId);

  // Step 3: Broadcast notification
  const requestedByName = AGENT_CONFIGS[task.requestedBy as keyof typeof AGENT_CONFIGS]?.name ?? task.requestedBy;
  broadcastEvent(roomId, {
    type: "sophiaMessage",
    payload: { text: `${requestedByName}의 요청으로 "${task.query}" 분석을 진행합니다.` },
  });
}
