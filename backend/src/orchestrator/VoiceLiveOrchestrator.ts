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

  // VoiceLive -> TurnManager: speech events
  addRoomListener(roomId, voiceLiveManager, "speechStarted", (rid: string, userId: string) => {
    if (rid === roomId) turnManager.onSpeechStart(rid, userId);
  });

  addRoomListener(roomId, voiceLiveManager, "speechStopped", (rid: string, userId: string) => {
    if (rid === roomId) turnManager.onSpeechEnd(rid, userId);
  });

  // Fix I7: use chairmanName param instead of hardcoded "Chairman"
  addRoomListener(roomId, voiceLiveManager, "transcript", (rid: string, userId: string, text: string) => {
    if (rid === roomId) turnManager.onTranscript(rid, userId, chairmanName, text);
  });

  // VoiceLive -> SignalR: agent streaming events (fix C1: use broadcastEvent, not broadcastToRoom)
  addRoomListener(roomId, voiceLiveManager, "agentAudioDelta", (rid: string, role: AgentRole, audioBase64: string) => {
    if (rid === roomId) {
      broadcastEvent(rid, {
        type: "agentAudioDelta",
        payload: { role, audioBase64, format: "pcm16_24k" },
      });
    }
  });

  addRoomListener(roomId, voiceLiveManager, "agentTextDelta", (rid: string, role: AgentRole, text: string) => {
    if (rid === roomId) {
      broadcastEvent(rid, {
        type: "agentTranscriptDelta",
        payload: { role, text, isFinal: false },
      });
    }
  });

  addRoomListener(roomId, voiceLiveManager, "agentVisemeDelta", (rid: string, role: AgentRole, visemeId: number, audioOffsetMs: number) => {
    if (rid === roomId) {
      broadcastEvent(rid, {
        type: "agentVisemeDelta",
        payload: { role, visemeId, audioOffsetMs },
      });
    }
  });

  addRoomListener(roomId, voiceLiveManager, "agentDone", (rid: string, role: AgentRole, fullText: string) => {
    if (rid === roomId) {
      broadcastEvent(rid, {
        type: "agentResponseDone",
        payload: { role, fullText },
      });
      // Notify TurnManager
      turnManager.onAgentDone(rid, role, fullText);
    }
  });

  // TurnManager -> VoiceLive: trigger/cancel agents
  addRoomListener(roomId, turnManager, "triggerAgent", (rid: string, role: AgentRole, instructions: string) => {
    if (rid === roomId) {
      voiceLiveManager.triggerAgentResponse(rid, role, instructions);
      broadcastEvent(rid, {
        type: "agentTyping",
        payload: { agentId: `agent-${role}`, agentName: role, isTyping: true },
      });
    }
  });

  addRoomListener(roomId, turnManager, "cancelAgent", (rid: string, role: AgentRole) => {
    if (rid === roomId) {
      voiceLiveManager.cancelAgentResponse(rid, role);
      broadcastEvent(rid, {
        type: "agentTyping",
        payload: { agentId: `agent-${role}`, agentName: role, isTyping: false },
      });
    }
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
