// 7-session lifecycle manager for Voice Live API
// Supports Azure Voice Live (primary) + OpenAI Realtime API (fallback)
// Ref: Design Spec §7

import { EventEmitter } from "events";
import WebSocket from "ws";
import type { AgentRole, AllAgentRole, ListenerWsEvent, AgentWsEvent } from "../models/index.js";
import { AGENT_VOICES, SOPHIA_VOICE } from "../constants/agentVoices.js";

// Azure Voice Live (primary)
const VOICE_LIVE_ENDPOINT = process.env.AZURE_VOICE_LIVE_ENDPOINT || "";
const VOICE_LIVE_KEY = process.env.AZURE_VOICE_LIVE_KEY || "";

// OpenAI Realtime API (fallback when Azure endpoint is not set)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_REALTIME_MODEL = process.env.OPENAI_MODEL_REALTIME || "gpt-realtime-1.5";
const OPENAI_REALTIME_URL = `wss://api.openai.com/v1/realtime?model=${OPENAI_REALTIME_MODEL}`;

const USE_AZURE = !!VOICE_LIVE_ENDPOINT;
const HEARTBEAT_INTERVAL_MS = 30_000;

interface RoomSessions {
  listener: WebSocket | null;
  agents: Map<AllAgentRole, WebSocket>;
  heartbeats: Map<string, ReturnType<typeof setInterval>>;
  /** Accumulated transcript text per agent (used as fallback when response.done output is empty) */
  transcriptBuffers: Map<AllAgentRole, string>;
}

/**
 * Manages Voice Live WebSocket sessions per room.
 * Auto-selects Azure Voice Live or OpenAI Realtime based on env config.
 *
 * Events emitted:
 *  - "speechStarted"    (roomId, userId)
 *  - "speechStopped"    (roomId, userId)
 *  - "transcript"       (roomId, userId, text)
 *  - "agentAudioDelta"  (roomId, role, audioBase64)
 *  - "agentTextDelta"   (roomId, role, text)
 *  - "agentVisemeDelta" (roomId, role, visemeId, audioOffsetMs)
 *  - "agentDone"        (roomId, role, fullText)
 */
export class VoiceLiveSessionManager extends EventEmitter {
  private rooms = new Map<string, RoomSessions>();

  constructor() {
    super();
    if (USE_AZURE) {
      console.log("[VoiceLive] Using Azure Voice Live API");
    } else if (OPENAI_API_KEY) {
      console.log(`[VoiceLive] Using OpenAI Realtime API (${OPENAI_REALTIME_MODEL})`);
    } else {
      console.warn("[VoiceLive] No voice endpoint configured — text-only mode");
    }
  }

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
      transcriptBuffers: new Map(),
    };
    this.rooms.set(roomId, sessions);

    // Open Listener session immediately (critical path)
    if (USE_AZURE || OPENAI_API_KEY) {
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
        // Emit agentDone to prevent TurnManager dead-lock
        this.emit("agentDone:" + roomId, roomId, role, "");
        return;
      }
    }

    // Clear any stale transcript buffer for this role before new response
    sessions.transcriptBuffers.set(role, "");

    if (USE_AZURE) {
      // Azure Voice Live: uses top-level instructions field
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
    } else {
      // OpenAI Realtime API: conversation: "none" requires instructions
      // passed as a system message inside the `input` array.
      // Passing `instructions` at top level is silently ignored.
      ws.send(
        JSON.stringify({
          type: "response.create",
          response: {
            conversation: "none",
            modalities: ["audio", "text"],
            input: [
              {
                type: "message",
                role: "system",
                content: [{ type: "input_text", text: instructions }],
              },
            ],
          },
        }),
      );
    }
  }

  /** Trigger Sophia voice announcement — short TTS-only, no turn management */
  async triggerSophiaVoice(roomId: string, text: string): Promise<void> {
    const sessions = this.rooms.get(roomId);
    if (!sessions) return;

    const sophiaKey: AllAgentRole = "sophia";
    let ws = sessions.agents.get(sophiaKey);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      try {
        ws = await this.createSophiaSession(roomId);
        sessions.agents.set(sophiaKey, ws);
      } catch (err) {
        console.error("[VoiceLive] Failed to create Sophia voice session:", err);
        return;
      }
    }

    // Cancel any in-flight Sophia response to avoid race condition
    ws.send(JSON.stringify({ type: "response.cancel" }));

    const sophiaInstructions = `당신은 Sophia, BizRoom.ai의 AI 비서입니다. 아래 안내를 한국어로 짧고 자연스럽게 말하세요 (1문장, 15자 이내):\n${text}`;

    // Clear Sophia transcript buffer (sophiaKey already declared above)
    sessions.transcriptBuffers.set(sophiaKey, "");

    if (USE_AZURE) {
      ws.send(
        JSON.stringify({
          type: "response.create",
          response: {
            conversation: "none",
            modalities: ["audio", "text"],
            instructions: sophiaInstructions,
          },
        }),
      );
    } else {
      ws.send(
        JSON.stringify({
          type: "response.create",
          response: {
            conversation: "none",
            modalities: ["audio", "text"],
            input: [
              {
                type: "message",
                role: "system",
                content: [{ type: "input_text", text: sophiaInstructions }],
              },
            ],
          },
        }),
      );
    }
  }

  /** Cancel current agent response */
  cancelAgentResponse(roomId: string, role: AgentRole): void {
    const sessions = this.rooms.get(roomId);
    const ws = sessions?.agents.get(role);
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({ type: "response.cancel" }));
  }

  // ── Private: WebSocket Connection ──

  /** Create a WebSocket connection with appropriate auth for Azure or OpenAI */
  private createWebSocket(): WebSocket {
    if (USE_AZURE) {
      console.log("[VoiceLive] Creating Azure WebSocket");
      return new WebSocket(VOICE_LIVE_ENDPOINT, {
        headers: { "api-key": VOICE_LIVE_KEY },
      });
    }
    console.log("[VoiceLive] Creating OpenAI WebSocket:", OPENAI_REALTIME_URL);
    const ws = new WebSocket(OPENAI_REALTIME_URL, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });
    ws.on("error", (err) => console.error("[VoiceLive] WebSocket error:", err.message));
    ws.on("close", (code, reason) => console.log("[VoiceLive] WebSocket closed:", code, reason?.toString() ?? ""));
    return ws;
  }

  // ── Private: Session Creation ──

  private async createListenerSession(
    roomId: string,
    chairmanUserId: string,
  ): Promise<WebSocket> {
    const ws = this.createWebSocket();

    return new Promise((resolve, reject) => {
      ws.on("open", () => {
        if (USE_AZURE) {
          // Azure Voice Live — full featured
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
        } else {
          // OpenAI Realtime API — server_vad + whisper
          ws.send(
            JSON.stringify({
              type: "session.update",
              session: {
                turn_detection: {
                  type: "server_vad",
                  threshold: 0.5,
                  prefix_padding_ms: 300,
                  silence_duration_ms: 500,
                  create_response: false,
                },
                input_audio_transcription: {
                  model: "whisper-1",
                },
                modalities: ["text"],
              },
            }),
          );
        }
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
    const ws = this.createWebSocket();
    let resolved = false;

    return new Promise((resolve, reject) => {
      ws.on("open", () => {
        if (USE_AZURE) {
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
        } else {
          ws.send(
            JSON.stringify({
              type: "session.update",
              session: {
                instructions: `You are the ${role.toUpperCase()} agent.`,
                turn_detection: null,
                voice: voiceConfig.openaiVoice,
                modalities: ["audio", "text"],
              },
            }),
          );
        }
        this.setupHeartbeat(roomId, role, ws);
        // Fallback: resolve after 2s if session.updated never arrives
        setTimeout(() => { if (!resolved) { resolved = true; resolve(ws); } }, 2000);
      });

      ws.on("message", (data) => {
        try {
          const event = JSON.parse(data.toString());
          // Wait for session.updated before resolving — prevents race condition
          // where response.create is sent before session config is applied
          if (event.type === "session.updated" && !resolved) {
            resolved = true;
            console.log(`[VoiceLive] Agent ${role} session configured`);
            resolve(ws);
          }
          // Handle error events from OpenAI
          if (event.type === "error") {
            console.error(`[VoiceLive] Agent ${role} error:`, event.error);
            if (!resolved) { resolved = true; reject(new Error(event.error?.message || "session error")); }
            // Emit agentDone to prevent TurnManager dead-lock
            this.emit("agentDone:" + roomId, roomId, role, "");
          }
          this.handleAgentEvent(roomId, role, event);
        } catch {
          /* ignore parse errors */
        }
      });

      ws.on("error", (err) => {
        if (!resolved) { resolved = true; reject(err); }
      });
      ws.on("close", () => this.handleSessionClose(roomId, role));
    });
  }

  /** Sophia-specific voice session — uses alloy voice, broadcasts as "sophia" role */
  private async createSophiaSession(roomId: string): Promise<WebSocket> {
    const ws = this.createWebSocket();
    const sophiaRole: AllAgentRole = "sophia";

    return new Promise((resolve, reject) => {
      ws.on("open", () => {
        if (USE_AZURE) {
          ws.send(
            JSON.stringify({
              type: "session.update",
              session: {
                instructions: "You are Sophia, a brief AI secretary.",
                turn_detection: { type: "none" },
                voice: {
                  name: SOPHIA_VOICE.voiceName,
                  type: "azure-standard",
                  temperature: SOPHIA_VOICE.temperature,
                },
                modalities: ["audio", "text"],
              },
            }),
          );
        } else {
          ws.send(
            JSON.stringify({
              type: "session.update",
              session: {
                instructions: "You are Sophia, a brief AI secretary.",
                turn_detection: null,
                voice: SOPHIA_VOICE.openaiVoice,
                modalities: ["audio", "text"],
              },
            }),
          );
        }
        this.setupHeartbeat(roomId, "sophia", ws);
        resolve(ws);
      });

      ws.on("message", (data) => {
        try {
          const event = JSON.parse(data.toString());
          this.handleAgentEvent(roomId, sophiaRole, event);
        } catch {
          /* ignore parse errors */
        }
      });

      ws.on("error", (err) => reject(err));
      ws.on("close", () => this.handleSessionClose(roomId, "sophia"));
    });
  }

  // ── Private: Event Handlers ──

  private handleListenerEvent(
    roomId: string,
    chairmanUserId: string,
    event: ListenerWsEvent,
  ): void {
    switch (event.type) {
      case "input_audio_buffer.speech_started":
        this.emit("speechStarted:" + roomId, roomId, chairmanUserId);
        break;
      case "input_audio_buffer.speech_stopped":
        this.emit("speechStopped:" + roomId, roomId, chairmanUserId);
        break;
      case "conversation.item.input_audio_transcription.completed":
        this.emit("transcript:" + roomId, roomId, chairmanUserId, event.transcript || "");
        break;
    }
  }

  private handleAgentEvent(
    roomId: string,
    role: AllAgentRole,
    event: AgentWsEvent,
  ): void {
    const sessions = this.rooms.get(roomId);

    // Log all events for debugging (remove after stabilization)
    if (event.type !== "response.audio.delta" && event.type !== "response.audio_transcript.delta" && event.type !== "response.text.delta") {
      console.log(`[VoiceLive] Agent ${String(role)} event: ${event.type}`);
    }

    switch (event.type) {
      case "response.audio.delta":
        if (event.delta) this.emit("agentAudioDelta:" + roomId, roomId, role, event.delta);
        break;
      case "response.audio_transcript.delta":
        if (event.delta) {
          // Buffer the streaming transcript for use as fallback in response.done
          if (sessions) {
            const current = sessions.transcriptBuffers.get(role) ?? "";
            sessions.transcriptBuffers.set(role, current + event.delta);
          }
          this.emit("agentTextDelta:" + roomId, roomId, role, event.delta);
        }
        break;
      case "response.text.delta":
        // Text-only modality delta (no audio) — also buffer this
        if (event.delta) {
          if (sessions) {
            const current = sessions.transcriptBuffers.get(role) ?? "";
            sessions.transcriptBuffers.set(role, current + event.delta);
          }
          this.emit("agentTextDelta:" + roomId, roomId, role, event.delta);
        }
        break;
      case "response.animation_viseme.delta":
        // Azure-only — OpenAI won't send this event
        this.emit("agentVisemeDelta:" + roomId, roomId, role, event.viseme_id, event.audio_offset_ms ?? 0);
        break;
      case "response.done": {
        // Primary: extract text from response.done output items
        let fullText = "";
        if (event.response?.output) {
          for (const item of event.response.output) {
            if (item.type === "message" && item.content) {
              for (const c of item.content) {
                if (c.type === "text" && c.text) fullText += c.text;
                // audio content items carry the transcript in c.transcript
                if (c.type === "audio" && c.transcript) fullText += c.transcript;
              }
            }
          }
        }
        // Fallback: use the buffered streaming transcript if output was empty
        // (OpenAI Realtime sometimes omits transcript from response.done)
        if (!fullText.trim() && sessions) {
          fullText = sessions.transcriptBuffers.get(role) ?? "";
        }
        // Reset transcript buffer for this role
        if (sessions) sessions.transcriptBuffers.set(role, "");

        this.emit("agentDone:" + roomId, roomId, role, fullText);
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
