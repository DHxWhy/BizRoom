import { useEffect, useRef, useState, useCallback } from "react";
import {
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
} from "@microsoft/signalr";
import type { HubConnection } from "@microsoft/signalr";
import type { Message, MeetingPhase, Artifact } from "../types";

/** Possible states for the SignalR connection lifecycle. */
export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

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
}

// For MVP: negotiate endpoint for SignalR; falls back to REST polling if unavailable
const NEGOTIATE_URL = "/api/negotiate";

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
        const response = await fetch("/api/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content,
            roomId,
            senderId: "user-1",
            senderName,
          }),
        });

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

  return { status, sendMessage };
}
