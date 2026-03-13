// Viseme + audio pipeline — agentVisemeDelta and agentAudioDelta events
// deliver phoneme-level articulation data and PCM16 audio chunks from
// backend speech synthesis, enabling real-time lip-sync and spatial playback.

import { useEffect, useRef, useState, useCallback } from "react";
import {
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
} from "@microsoft/signalr";
import type { HubConnection } from "@microsoft/signalr";
import type { Message, MeetingPhase, Artifact, HumanCalloutEvent, BigScreenUpdateEvent, MonitorUpdateEvent, SophiaMessageEvent, ArtifactsReadyEvent } from "../types";
import type {
  StartStreamPayload,
  AppendDeltaPayload,
  EndStreamPayload,
} from "../context/MeetingContext";
import { API_BASE } from "../config/api";

/** Possible states for the SignalR connection lifecycle. */
export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

/** SSE 스트리밍 delta 이벤트의 JSON 구조 */
interface SSEDeltaEvent {
  messageId: string;
  role: string;
  name: string;
  delta: string;
}

/** Callback options for reacting to SignalR hub events. */
interface UseSignalROptions {
  /** Called when a new chat message arrives from the hub. */
  onMessage?: (message: Message) => void;
  /** Called when an agent starts or stops typing. */
  onTyping?: (agentName: string, isTyping: boolean) => void;
  /** Called when the meeting phase transitions. */
  onPhaseChanged?: (phase: MeetingPhase) => void;
  /** Called when a new artifact is created during the meeting. */
  onArtifactCreated?: (artifact: Artifact) => void;
  /** Called whenever the connection status changes. */
  onStatusChange?: (status: ConnectionStatus) => void;

  // ── 스트리밍 콜백 ──

  /** 새 에이전트 메시지 스트림이 시작될 때 호출 */
  onStreamStart?: (payload: StartStreamPayload) => void;
  /** 스트리밍 중 텍스트 delta가 도착할 때 호출 */
  onStreamDelta?: (payload: AppendDeltaPayload) => void;
  /** 에이전트 메시지 스트림이 완료될 때 호출 */
  onStreamEnd?: (payload: EndStreamPayload) => void;

  // ── Meeting interaction callbacks ──

  /** Called when agents begin thinking */
  onAgentThinking?: (payload: { roles: string[] }) => void;
  /** Called when an agent requests human input */
  onHumanCallout?: (payload: HumanCalloutEvent) => void;
  /** Called when BigScreen content should be updated */
  onBigScreenUpdate?: (payload: BigScreenUpdateEvent) => void;
  /** Called when a monitor should show new content */
  onMonitorUpdate?: (payload: MonitorUpdateEvent) => void;
  /** Called when Sophia sends a secretary message */
  onSophiaMessage?: (payload: SophiaMessageEvent) => void;
  /** Called when meeting artifacts are ready for download */
  onArtifactsReady?: (payload: ArtifactsReadyEvent) => void;

  // ── Viseme + Audio pipeline callbacks ──

  /** Called when a viseme delta arrives for agent lip-sync */
  onAgentVisemeDelta?: (payload: { role: string; visemeId: number }) => void;
  /** Called when an audio chunk arrives for agent speech playback */
  onAgentAudioDelta?: (payload: { role: string; audioBase64: string }) => void;
}

/** Return type of the useSignalR hook. */
interface UseSignalRReturn {
  /** Current connection status. */
  status: ConnectionStatus;
  /** Send a message to a room via SignalR or REST fallback. */
  sendMessage: (
    roomId: string,
    content: string,
    senderName: string,
  ) => Promise<void>;
  /** SSE 스트리밍으로 메시지를 전송하고 delta를 실시간 수신 */
  sendMessageStream: (
    roomId: string,
    content: string,
    senderName: string,
    modeOptions?: { mode?: string; dmTarget?: string | null },
  ) => Promise<void>;
}

// SignalR hub URL — client auto-appends /negotiate, so this must NOT end with /negotiate
const NEGOTIATE_URL = `${API_BASE}/api`;

/**
 * React hook that manages a SignalR HubConnection lifecycle.
 *
 * - Connects on mount with an automatic reconnect policy
 * - Registers handlers for: newMessage, agentTyping, phaseChanged, artifactCreated
 * - Dispatches events via the provided callbacks (typically wired to MeetingContext)
 * - Cleanly disconnects on unmount
 * - Falls back to REST POST when SignalR is not available (MVP mode)
 */
export function useSignalR(
  options: UseSignalROptions = {},
): UseSignalRReturn {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const connectionRef = useRef<HubConnection | null>(null);

  // Keep a stable ref to the latest options so event handlers always
  // call the most recent callbacks without re-registering listeners.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    let mounted = true;

    /** Update both React state and the external status callback. */
    function updateStatus(next: ConnectionStatus): void {
      if (!mounted) return;
      setStatus(next);
      optionsRef.current.onStatusChange?.(next);
    }

    async function connect(): Promise<void> {
      try {
        if (!mounted) return;
        updateStatus("connecting");

        const connection = new HubConnectionBuilder()
          .withUrl(NEGOTIATE_URL)
          .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
          .configureLogging(LogLevel.Information)
          .build();

        // --- Hub event handlers ---

        connection.on("newMessage", (message: Message) => {
          optionsRef.current.onMessage?.(message);
        });

        connection.on(
          "agentTyping",
          (agentName: string, isTyping: boolean) => {
            optionsRef.current.onTyping?.(agentName, isTyping);
          },
        );

        connection.on("phaseChanged", (phase: MeetingPhase) => {
          optionsRef.current.onPhaseChanged?.(phase);
        });

        connection.on("artifactCreated", (artifact: Artifact) => {
          optionsRef.current.onArtifactCreated?.(artifact);
        });

        // --- Meeting interaction event handlers ---

        connection.on("agentThinking", (payload: { roles: string[] }) => {
          optionsRef.current.onAgentThinking?.(payload);
        });

        connection.on("humanCallout", (payload: HumanCalloutEvent) => {
          optionsRef.current.onHumanCallout?.(payload);
        });

        connection.on("bigScreenUpdate", (payload: BigScreenUpdateEvent) => {
          optionsRef.current.onBigScreenUpdate?.(payload);
        });

        connection.on("monitorUpdate", (payload: MonitorUpdateEvent) => {
          optionsRef.current.onMonitorUpdate?.(payload);
        });

        connection.on("sophiaMessage", (payload: SophiaMessageEvent) => {
          optionsRef.current.onSophiaMessage?.(payload);
        });

        connection.on("artifactsReady", (payload: ArtifactsReadyEvent) => {
          optionsRef.current.onArtifactsReady?.(payload);
        });

        // --- Viseme + Audio pipeline event handlers ---

        connection.on("agentVisemeDelta", (payload: { role: string; visemeId: number }) => {
          optionsRef.current.onAgentVisemeDelta?.(payload);
        });

        connection.on("agentAudioDelta", (payload: { role: string; audioBase64: string }) => {
          optionsRef.current.onAgentAudioDelta?.(payload);
        });

        // --- Reconnection lifecycle handlers ---

        connection.onreconnecting(() => {
          updateStatus("reconnecting");
        });

        connection.onreconnected(() => {
          updateStatus("connected");
        });

        connection.onclose(() => {
          updateStatus("disconnected");
        });

        // Start the connection
        await connection.start();
        connectionRef.current = connection;
        updateStatus("connected");
      } catch (err: unknown) {
        console.warn(
          "SignalR connection failed, falling back to REST mode:",
          err,
        );
        updateStatus("disconnected");
      }
    }

    void connect();

    return () => {
      mounted = false;
      const conn = connectionRef.current;
      if (conn?.state === HubConnectionState.Connected) {
        void conn.stop();
      }
    };
  }, []);

  /**
   * Send a user message to the given room.
   * Uses SignalR invoke when connected, otherwise falls back to a REST POST.
   */
  const sendMessage = useCallback(
    async (
      roomId: string,
      content: string,
      senderName: string,
    ): Promise<void> => {
      const connection = connectionRef.current;

      if (connection?.state === HubConnectionState.Connected) {
        // Real-time path: invoke the hub method directly
        await connection.invoke("SendMessage", roomId, content, senderName);
      } else {
        // REST fallback for MVP (when SignalR backend is not configured)
        // Show typing indicator before API call
        optionsRef.current.onTyping?.("Hudson", true);

        const response = await fetch(`${API_BASE}/api/message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content,
            roomId,
            senderId: "user-1",
            senderName,
          }),
        });

        // Clear typing indicator after response arrives
        optionsRef.current.onTyping?.("Hudson", false);

        if (response.ok) {
          const data: unknown = await response.json();

          // Dispatch each message returned from the REST endpoint
          if (
            data !== null &&
            typeof data === "object" &&
            "messages" in data &&
            Array.isArray((data as { messages: unknown }).messages)
          ) {
            for (const msg of (data as { messages: Message[] }).messages) {
              optionsRef.current.onMessage?.(msg);
            }
          }
        }
      }
    },
    [],
  );

  /**
   * SSE 스트리밍으로 메시지를 전송한다.
   * POST /api/message?stream=true 호출 후 ReadableStream으로 delta를 수신하며
   * onStreamStart / onStreamDelta / onStreamEnd 콜백을 호출한다.
   */
  const sendMessageStream = useCallback(
    async (
      roomId: string,
      content: string,
      senderName: string,
      modeOptions?: { mode?: string; dmTarget?: string | null },
    ): Promise<void> => {
      const response = await fetch(`${API_BASE}/api/message?stream=true`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          roomId,
          senderId: "user-1",
          senderName,
          ...(modeOptions?.mode && { mode: modeOptions.mode }),
          ...(modeOptions?.dmTarget && { dmTarget: modeOptions.dmTarget }),
        }),
      });

      if (!response.ok || !response.body) {
        console.error("SSE stream request failed:", response.status);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // 현재 스트리밍 중인 메시지 ID 추적 (START_STREAM 호출 여부 판단)
      const startedMessages = new Set<string>();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // SSE 이벤트는 \n\n 으로 구분
          const parts = buffer.split("\n\n");
          // 마지막 요소는 아직 완료되지 않은 부분일 수 있음
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed) continue;

            // "data: ..." 프리픽스 제거
            if (!trimmed.startsWith("data: ")) continue;
            const payload = trimmed.slice(6); // "data: " 이후

            // [DONE] 시그널: 모든 스트림 완료
            if (payload === "[DONE]") {
              // 아직 END_STREAM을 받지 못한 메시지가 있으면 종료 처리
              for (const msgId of startedMessages) {
                optionsRef.current.onStreamEnd?.({ messageId: msgId });
              }
              startedMessages.clear();
              return;
            }

            // JSON delta 이벤트 파싱
            let event: SSEDeltaEvent;
            try {
              event = JSON.parse(payload) as SSEDeltaEvent;
            } catch {
              console.warn("SSE parse error, skipping chunk:", payload);
              continue;
            }

            const { messageId, role, name, delta } = event;

            // 해당 messageId의 첫 delta → START_STREAM 호출
            if (!startedMessages.has(messageId)) {
              startedMessages.add(messageId);

              // 이전 메시지가 있으면 END_STREAM 호출 (에이전트 전환)
              for (const prevId of startedMessages) {
                if (prevId !== messageId) {
                  optionsRef.current.onStreamEnd?.({ messageId: prevId });
                  startedMessages.delete(prevId);
                }
              }

              optionsRef.current.onStreamStart?.({
                messageId,
                senderId: `agent-${role}`,
                senderName: name,
                senderRole: role,
                senderType: "agent",
              });
            }

            // APPEND_MESSAGE_DELTA 호출
            optionsRef.current.onStreamDelta?.({ messageId, delta });
          }
        }
      } catch (err: unknown) {
        console.error("SSE stream reading error:", err);
      } finally {
        // 정리: 남아있는 스트리밍 메시지 종료 처리
        for (const msgId of startedMessages) {
          optionsRef.current.onStreamEnd?.({ messageId: msgId });
        }
        reader.releaseLock();
      }
    },
    [],
  );

  return { status, sendMessage, sendMessageStream };
}
