// backend/src/orchestrator/VoiceLiveOrchestrator.ts
// Wires TurnManager <-> VoiceLiveSessionManager <-> SignalR
// Includes Sophia background pipeline (visual gen, key points relay, mention routing)
// Ref: Design Spec §2, §7, §4

import { turnManager } from "./TurnManager.js";
import { voiceLiveManager } from "../services/VoiceLiveSessionManager.js";
import { broadcastEvent } from "../services/SignalRService.js";
import { sophiaAgent } from "../agents/SophiaAgent.js";
import { parseStructuredOutput } from "./ResponseParser.js";
import { AGENT_CONFIGS } from "../agents/agentConfigs.js";
import { SOPHIA_VISUAL_SYSTEM_PROMPT } from "../agents/prompts/sophia.js";
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
    keywords: /차트|그래프|막대|바차트|수치|통계|chart|graph|bar|stat|데이터.*(?:보여|보이|표시|시각)/i,
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
  const combinedText = userInput + (agentSpeech ? " " + agentSpeech : "");

  // Check specific visual type keywords first
  for (const entry of VISUAL_KEYWORD_MAP) {
    if (entry.keywords.test(combinedText)) {
      // Try to extract a more specific title from the user input
      const title = extractVisualTitle(userInput, entry.title);
      return { type: entry.type, title };
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
  chairmanUserId: string,
  chairmanName: string,
): void {
  // Idempotency guard: if listeners are already registered for this room, skip.
  // Without this guard, calling wireVoiceLiveForRoom twice (e.g., from a double
  // HTTP request or React dev-mode double-invoke) would register duplicate
  // EventEmitter listeners, causing Sophia audio and agent responses to broadcast twice.
  if (roomListeners.has(roomId)) {
    console.warn(`[VoiceLive] wireVoiceLiveForRoom called twice for room ${roomId} — skipping duplicate wiring`);
    return;
  }

  // Set chairman in TurnManager
  turnManager.setChairman(roomId, chairmanUserId);

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

  // Fix I7: use chairmanName param instead of hardcoded "Chairman"
  addRoomListener(
    roomId,
    voiceLiveManager,
    "transcript:" + roomId,
    (_rid: string, userId: string, text: string) => {
      turnManager.onTranscript(roomId, userId, chairmanName, text);
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

      // 2. Key points relay to chairman monitor (no GPT call)
      if (parsed.data.key_points.length > 0) {
        broadcastEvent(roomId, {
          type: "monitorUpdate",
          payload: {
            target: "chairman",
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

      // Notify TurnManager with speech text (not raw JSON) so stored messages are clean
      turnManager.onAgentDone(roomId, role, parsed.data.speech, true);
    },
  );

  // Reset visual-intent flag when all agents finish responding for this turn
  addRoomListener(
    roomId,
    turnManager,
    "agentsDone:" + roomId,
    (_rid: string) => {
      visualIntentChecked.delete(roomId);
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
  const userContent = `visual_hint: ${JSON.stringify(hint)}\n\n최근 대화:\n${recentContext}\n\ntype="${hint.type}"에 맞는 BigScreenRenderData JSON을 생성하세요.`;
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

  const parsed = JSON.parse(content) as Record<string, unknown>;
  // Basic structural validation — ensure type field matches hint
  if (typeof parsed.type !== "string") {
    parsed.type = hint.type;
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
      // Sophia voice announcement — brief TTS
      voiceLiveManager.triggerSophiaVoice(roomId, `${item.hint.title}를 빅스크린에 띄웠습니다`);
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
