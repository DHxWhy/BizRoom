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
import type { AgentRole, VisualHint, BigScreenRenderData } from "../models/index.js";

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
 * Call once per room at meeting start.
 */
export function wireVoiceLiveForRoom(
  roomId: string,
  chairmanUserId: string,
  chairmanName: string,
): void {
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
      broadcastEvent(roomId, {
        type: "agentResponseDone",
        payload: { role, fullText },
      });

      // Sophia background pipeline — parse, buffer, route, visualize
      const parsed = parseStructuredOutput(fullText, role);

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
      if (sophiaAgent.hasVisualHint(parsed.data)) {
        sophiaAgent.enqueueVisual(roomId, parsed.data.visual_hint!);
        processVisualQueue(roomId);
      }

      // Notify TurnManager (skipFollowUp=true: handleMentionRouting already handled routing)
      turnManager.onAgentDone(roomId, role, fullText, true);
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
        payload: { agentId: `agent-${role}`, agentName: role, isTyping: true },
      });
    },
  );

  addRoomListener(roomId, turnManager, "cancelAgent:" + roomId, (_rid: string, role: AgentRole) => {
    voiceLiveManager.cancelAgentResponse(roomId, role);
    broadcastEvent(roomId, {
      type: "agentTyping",
      payload: { agentId: `agent-${role}`, agentName: role, isTyping: false },
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
