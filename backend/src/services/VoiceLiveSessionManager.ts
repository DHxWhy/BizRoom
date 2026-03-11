// 7-session lifecycle manager for Voice Live API
// Ref: Design Spec §7

import { EventEmitter } from "events";
import WebSocket from "ws";
import type { AgentRole } from "../models/index.js";
import { AGENT_VOICES } from "../constants/agentVoices.js";

const VOICE_LIVE_ENDPOINT = process.env.AZURE_VOICE_LIVE_ENDPOINT || "";
const VOICE_LIVE_KEY = process.env.AZURE_VOICE_LIVE_KEY || "";
const HEARTBEAT_INTERVAL_MS = 30_000;

interface RoomSessions {
  listener: WebSocket | null;
  agents: Map<AgentRole, WebSocket>;
  heartbeats: Map<string, ReturnType<typeof setInterval>>;
}

/**
 * Manages Voice Live WebSocket sessions per room.
 *
 * Events emitted:
 *  - "speechStarted"  (roomId, userId)
 *  - "speechStopped"  (roomId, userId)
 *  - "transcript"     (roomId, userId, text)
 *  - "agentAudioDelta"  (roomId, role, audioBase64)
 *  - "agentTextDelta"   (roomId, role, text)
 *  - "agentVisemeDelta" (roomId, role, visemeId, audioOffsetMs)
 *  - "agentDone"        (roomId, role, fullText)
 */
export class VoiceLiveSessionManager extends EventEmitter {
  private rooms = new Map<string, RoomSessions>();

  /** Initialize room — opens Listener session immediately, agents lazily */
  async initializeRoom(
    roomId: string,
    chairmanUserId: string,
  ): Promise<void> {
    if (this.rooms.has(roomId)) return;

    const sessions: RoomSessions = {
      listener: null,
      agents: new Map(),
      heartbeats: new Map(),
    };
    this.rooms.set(roomId, sessions);

    // Open Listener session immediately (critical path)
    if (VOICE_LIVE_ENDPOINT) {
      try {
        sessions.listener = await this.createListenerSession(
          roomId,
          chairmanUserId,
        );
      } catch (err) {
        console.error(
          `[VoiceLive] Failed to create Listener session for room ${roomId}:`,
          err,
        );
        // Degrade to text-only mode
      }
    }
  }

  /** Tear down all sessions for a room */
  async teardownRoom(roomId: string): Promise<void> {
    const sessions = this.rooms.get(roomId);
    if (!sessions) return;

    // Clear heartbeats
    for (const interval of sessions.heartbeats.values()) {
      clearInterval(interval);
    }

    // Close all WebSockets
    sessions.listener?.close();
    for (const ws of sessions.agents.values()) {
      ws.close();
    }

    this.rooms.delete(roomId);
  }

  /** Relay audio from client to Listener session — Spec §7.3 */
  relayAudio(roomId: string, audioBase64: string): void {
    const sessions = this.rooms.get(roomId);
    if (
      !sessions?.listener ||
      sessions.listener.readyState !== WebSocket.OPEN
    )
      return;

    sessions.listener.send(
      JSON.stringify({
        type: "input_audio_buffer.append",
        audio: audioBase64,
      }),
    );
  }

  /** Trigger agent response — Spec §1.3 */
  async triggerAgentResponse(
    roomId: string,
    role: AgentRole,
    instructions: string,
  ): Promise<void> {
    const sessions = this.rooms.get(roomId);
    if (!sessions) return;

    // Lazy agent session creation
    let ws = sessions.agents.get(role);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      try {
        ws = await this.createAgentSession(roomId, role);
        sessions.agents.set(role, ws);
      } catch (err) {
        console.error(
          `[VoiceLive] Failed to create agent session ${role}:`,
          err,
        );
        return; // Degrade: skip this agent's voice response
      }
    }

    // Send response.create with conversation: "none" — Spec §1.3
    ws.send(
      JSON.stringify({
        type: "response.create",
        response: {
          conversation: "none",
          modalities: ["audio", "text"],
          instructions,
        },
      }),
    );
  }

  /** Cancel current agent response */
  cancelAgentResponse(roomId: string, role: AgentRole): void {
    const sessions = this.rooms.get(roomId);
    const ws = sessions?.agents.get(role);
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({ type: "response.cancel" }));
  }

  // ── Private: Session Creation ──

  private async createListenerSession(
    roomId: string,
    chairmanUserId: string,
  ): Promise<WebSocket> {
    const ws = new WebSocket(VOICE_LIVE_ENDPOINT, {
      headers: { "api-key": VOICE_LIVE_KEY },
    });

    return new Promise((resolve, reject) => {
      ws.on("open", () => {
        // Send session.update — Spec §1.2
        ws.send(
          JSON.stringify({
            type: "session.update",
            session: {
              turn_detection: {
                type: "azure_semantic_vad",
                silence_duration_ms: 500,
                remove_filler_words: true,
                languages: ["ko", "en"],
                create_response: false,
              },
              input_audio_noise_reduction: {
                type: "azure_deep_noise_suppression",
              },
              input_audio_echo_cancellation: {
                type: "server_echo_cancellation",
              },
              input_audio_transcription: {
                model: "azure-speech",
                language: "ko",
              },
              modalities: ["text"],
            },
          }),
        );
        this.setupHeartbeat(roomId, "listener", ws);
        resolve(ws);
      });

      ws.on("message", (data) => {
        try {
          const event = JSON.parse(data.toString());
          this.handleListenerEvent(roomId, chairmanUserId, event);
        } catch {
          /* ignore parse errors */
        }
      });

      ws.on("error", (err) => reject(err));
      ws.on("close", () => this.handleSessionClose(roomId, "listener"));
    });
  }

  private async createAgentSession(
    roomId: string,
    role: AgentRole,
  ): Promise<WebSocket> {
    const voiceConfig = AGENT_VOICES[role];
    const ws = new WebSocket(VOICE_LIVE_ENDPOINT, {
      headers: { "api-key": VOICE_LIVE_KEY },
    });

    return new Promise((resolve, reject) => {
      ws.on("open", () => {
        // Send session.update — Spec §1.3
        ws.send(
          JSON.stringify({
            type: "session.update",
            session: {
              instructions: `You are the ${role.toUpperCase()} agent.`,
              turn_detection: { type: "none" },
              voice: {
                name: voiceConfig.voiceName,
                type: "azure-standard",
                temperature: voiceConfig.temperature,
              },
              modalities: ["audio", "text"],
              output_audio_timestamp_types: ["word"],
              animation: { outputs: ["viseme_id"] },
            },
          }),
        );
        this.setupHeartbeat(roomId, role, ws);
        resolve(ws);
      });

      ws.on("message", (data) => {
        try {
          const event = JSON.parse(data.toString());
          this.handleAgentEvent(roomId, role, event);
        } catch {
          /* ignore parse errors */
        }
      });

      ws.on("error", (err) => reject(err));
      ws.on("close", () => this.handleSessionClose(roomId, role));
    });
  }

  // ── Private: Event Handlers ──

  private handleListenerEvent(
    roomId: string,
    chairmanUserId: string,
    event: Record<string, unknown>,
  ): void {
    switch (event.type) {
      case "input_audio_buffer.speech_started":
        this.emit("speechStarted", roomId, chairmanUserId);
        break;
      case "input_audio_buffer.speech_stopped":
        this.emit("speechStopped", roomId, chairmanUserId);
        break;
      case "conversation.item.input_audio_transcription.completed":
        this.emit(
          "transcript",
          roomId,
          chairmanUserId,
          (event as Record<string, unknown>).transcript || "",
        );
        break;
    }
  }

  private handleAgentEvent(
    roomId: string,
    role: AgentRole,
    event: Record<string, unknown>,
  ): void {
    switch (event.type) {
      case "response.audio.delta": {
        const delta = event.delta as string;
        if (delta) this.emit("agentAudioDelta", roomId, role, delta);
        break;
      }
      case "response.audio_transcript.delta": {
        const delta = event.delta as string;
        if (delta) this.emit("agentTextDelta", roomId, role, delta);
        break;
      }
      case "response.animation_viseme.delta": {
        const visemeId = event.viseme_id as number;
        const offsetMs = event.audio_offset_ms as number;
        this.emit(
          "agentVisemeDelta",
          roomId,
          role,
          visemeId,
          offsetMs ?? 0,
        );
        break;
      }
      case "response.done": {
        // Extract full text from response
        const output = event.response as Record<string, unknown>;
        let fullText = "";
        if (output?.output && Array.isArray(output.output)) {
          for (const item of output.output) {
            if (item.type === "message" && item.content) {
              for (const c of item.content) {
                if (c.type === "text") fullText += c.text || "";
                if (c.transcript) fullText += c.transcript;
              }
            }
          }
        }
        this.emit("agentDone", roomId, role, fullText);
        break;
      }
    }
  }

  private setupHeartbeat(
    roomId: string,
    sessionKey: string,
    ws: WebSocket,
  ): void {
    const sessions = this.rooms.get(roomId);
    if (!sessions) return;

    const interval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, HEARTBEAT_INTERVAL_MS);

    sessions.heartbeats.set(sessionKey, interval);
  }

  private handleSessionClose(roomId: string, sessionKey: string): void {
    const sessions = this.rooms.get(roomId);
    if (!sessions) return;

    const heartbeat = sessions.heartbeats.get(sessionKey);
    if (heartbeat) {
      clearInterval(heartbeat);
      sessions.heartbeats.delete(sessionKey);
    }

    // TODO: Reconnection with exponential backoff (Spec §7.4)
    console.warn(
      `[VoiceLive] Session ${sessionKey} closed for room ${roomId}`,
    );
  }
}

// Singleton instance
export const voiceLiveManager = new VoiceLiveSessionManager();
