// backend/src/orchestrator/VoiceLiveOrchestrator.ts
// Wires TurnManager <-> VoiceLiveSessionManager <-> SignalR
// Ref: Design Spec §2, §7

import { turnManager } from "./TurnManager.js";
import { voiceLiveManager } from "../services/VoiceLiveSessionManager.js";
import { broadcastEvent } from "../services/SignalRService.js";
import type { AgentRole } from "../models/index.js";

// Track per-room event listeners for cleanup (fix I5: event listener leak)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyListener = (...args: any[]) => void;

const roomListeners = new Map<
  string,
  Array<{
    emitter: NodeJS.EventEmitter;
    event: string;
    fn: AnyListener;
  }>
>();

function addRoomListener(
  roomId: string,
  emitter: NodeJS.EventEmitter,
  event: string,
  fn: AnyListener,
): void {
  if (!roomListeners.has(roomId)) roomListeners.set(roomId, []);
  roomListeners.get(roomId)!.push({ emitter, event, fn });
  emitter.on(event, fn);
}

/**
 * Initialize bidirectional event wiring for a room.
 * Call once per room at meeting start.
 */
export function wireVoiceLiveForRoom(roomId: string, chairmanUserId: string, chairmanName: string): void {
  // Set chairman in TurnManager
  turnManager.setChairman(roomId, chairmanUserId);

  // VoiceLive -> TurnManager: speech events (room-scoped — no filtering needed)
  addRoomListener(roomId, voiceLiveManager, "speechStarted:" + roomId, (_rid: string, userId: string) => {
    turnManager.onSpeechStart(roomId, userId);
  });

  addRoomListener(roomId, voiceLiveManager, "speechStopped:" + roomId, (_rid: string, userId: string) => {
    turnManager.onSpeechEnd(roomId, userId);
  });

  // Fix I7: use chairmanName param instead of hardcoded "Chairman"
  addRoomListener(roomId, voiceLiveManager, "transcript:" + roomId, (_rid: string, userId: string, text: string) => {
    turnManager.onTranscript(roomId, userId, chairmanName, text);
  });

  // VoiceLive -> SignalR: agent streaming events (room-scoped — no filtering needed)
  addRoomListener(roomId, voiceLiveManager, "agentAudioDelta:" + roomId, (_rid: string, role: AgentRole, audioBase64: string) => {
    broadcastEvent(roomId, {
      type: "agentAudioDelta",
      payload: { role, audioBase64, format: "pcm16_24k" },
    });
  });

  addRoomListener(roomId, voiceLiveManager, "agentTextDelta:" + roomId, (_rid: string, role: AgentRole, text: string) => {
    broadcastEvent(roomId, {
      type: "agentTranscriptDelta",
      payload: { role, text, isFinal: false },
    });
  });

  addRoomListener(roomId, voiceLiveManager, "agentVisemeDelta:" + roomId, (_rid: string, role: AgentRole, visemeId: number, audioOffsetMs: number) => {
    broadcastEvent(roomId, {
      type: "agentVisemeDelta",
      payload: { role, visemeId, audioOffsetMs },
    });
  });

  addRoomListener(roomId, voiceLiveManager, "agentDone:" + roomId, (_rid: string, role: AgentRole, fullText: string) => {
    broadcastEvent(roomId, {
      type: "agentResponseDone",
      payload: { role, fullText },
    });
    // Notify TurnManager
    turnManager.onAgentDone(roomId, role, fullText);
  });

  // TurnManager -> VoiceLive: trigger/cancel agents (room-scoped — no filtering needed)
  addRoomListener(roomId, turnManager, "triggerAgent:" + roomId, (_rid: string, role: AgentRole, instructions: string) => {
    voiceLiveManager.triggerAgentResponse(roomId, role, instructions);
    broadcastEvent(roomId, {
      type: "agentTyping",
      payload: { agentId: `agent-${role}`, agentName: role, isTyping: true },
    });
  });

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
}
