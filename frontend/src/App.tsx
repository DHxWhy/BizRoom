import { MeetingProvider, useMeetingState, useMeetingDispatch } from "./context/MeetingContext";
import { useSignalR } from "./hooks/useSignalR";
import type { ConnectionStatus } from "./hooks/useSignalR";
import { AppShell } from "./components/layout/AppShell";
import { Sidebar } from "./components/layout/Sidebar";
import { ChatRoom } from "./components/chat/ChatRoom";
import { InputArea } from "./components/input/InputArea";
import { QuickActions } from "./components/input/QuickActions";
import { MeetingBanner } from "./components/meeting/MeetingBanner";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { S } from "./constants/strings";
import type { Message, MeetingPhase, Participant, QuickActionType } from "./types";
import { useCallback, useEffect } from "react";

const DEFAULT_PARTICIPANTS: Participant[] = [
  { id: "agent-coo", name: "Hudson", type: "agent", role: "coo", status: "online", avatar: "📋" },
  { id: "agent-cfo", name: "Amelia", type: "agent", role: "cfo", status: "online", avatar: "💰" },
  { id: "agent-cmo", name: "Yusef", type: "agent", role: "cmo", status: "online", avatar: "📣" },
  { id: "user-1", name: "Chairman", type: "human", role: "chairman", status: "online", avatar: "" },
];

/** Small indicator showing the current SignalR / REST connection state. */
function ConnectionStatusBadge({ status }: { status: ConnectionStatus }) {
  const colorMap: Record<ConnectionStatus, string> = {
    connected: "bg-green-500",
    connecting: "bg-yellow-500 animate-pulse",
    reconnecting: "bg-yellow-500 animate-pulse",
    disconnected: "bg-red-500",
  };

  const labelMap: Record<ConnectionStatus, string> = {
    connected: "Connected",
    connecting: "Connecting...",
    reconnecting: "Reconnecting...",
    disconnected: "REST mode",
  };

  return (
    <div className="flex items-center gap-1.5 px-3 py-1 text-xs text-neutral-400">
      <span className={`w-1.5 h-1.5 rounded-full ${colorMap[status]}`} />
      <span>{labelMap[status]}</span>
    </div>
  );
}

/** Inner component that consumes MeetingContext and wires up SignalR. */
function MeetingRoom() {
  const state = useMeetingState();
  const dispatch = useMeetingDispatch();

  // Initialize default participants on mount
  useEffect(() => {
    dispatch({ type: "SET_PARTICIPANTS", payload: DEFAULT_PARTICIPANTS });
  }, [dispatch]);

  // SignalR connection with event handlers
  const { sendMessage, status: connectionStatus } = useSignalR({
    onMessage: useCallback(
      (message: Message) => {
        dispatch({ type: "ADD_MESSAGE", payload: message });
      },
      [dispatch],
    ),
    onTyping: useCallback(
      (agentName: string, isTyping: boolean) => {
        dispatch({ type: "SET_TYPING", payload: { agentName, isTyping } });
      },
      [dispatch],
    ),
    onPhaseChanged: useCallback(
      (phase: MeetingPhase) => {
        dispatch({ type: "SET_PHASE", payload: phase });
      },
      [dispatch],
    ),
  });

  // Send a user message to the room
  const handleSend = useCallback(
    async (content: string) => {
      const userMessage: Message = {
        id: crypto.randomUUID(),
        roomId: state.roomId,
        senderId: "user-1",
        senderType: "human",
        senderName: "Chairman",
        senderRole: "chairman",
        content,
        timestamp: new Date().toISOString(),
      };
      dispatch({ type: "ADD_MESSAGE", payload: userMessage });
      await sendMessage(state.roomId, content, "Chairman");
    },
    [dispatch, sendMessage, state.roomId],
  );

  // Translate a quick action into a chat message
  const handleQuickAction = useCallback(
    (action: QuickActionType) => {
      const actionText = S.quickActions[action];
      void handleSend(actionText);
    },
    [handleSend],
  );

  // Start the meeting via REST endpoint
  const handleStartMeeting = useCallback(async () => {
    dispatch({ type: "SET_PHASE", payload: "opening" });
    try {
      const res = await fetch("/api/meeting/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "user-1", userName: "Chairman" }),
      });
      if (res.ok) {
        const data: unknown = await res.json();
        if (
          data !== null &&
          typeof data === "object" &&
          "openingMessage" in data
        ) {
          const typed = data as { openingMessage: Message };
          dispatch({ type: "ADD_MESSAGE", payload: typed.openingMessage });
        }
        dispatch({ type: "SET_PHASE", payload: "briefing" });
      }
    } catch (err: unknown) {
      console.error("Failed to start meeting:", err);
    }
  }, [dispatch]);

  const isIdle = state.meetingPhase === "idle";

  return (
    <AppShell
      sidebar={
        <>
          <Sidebar
            participants={
              state.participants.length > 0
                ? state.participants
                : DEFAULT_PARTICIPANTS
            }
            roomName={state.roomName}
          />
          <div className="mt-auto border-t border-neutral-800">
            <ConnectionStatusBadge status={connectionStatus} />
          </div>
        </>
      }
      main={
        <>
          <MeetingBanner phase={state.meetingPhase} />
          {isIdle ? (
            <div className="flex-1 flex items-center justify-center">
              <button
                onClick={() => void handleStartMeeting()}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-lg font-semibold transition-colors"
              >
                {S.meeting.start}
              </button>
            </div>
          ) : (
            <>
              <ChatRoom
                messages={state.messages}
                typingAgents={state.typingAgents}
              />
              <QuickActions onAction={handleQuickAction} disabled={isIdle} />
              <InputArea
                onSend={(content) => void handleSend(content)}
                disabled={isIdle}
              />
            </>
          )}
        </>
      }
    />
  );
}

function App() {
  return (
    <ErrorBoundary>
      <MeetingProvider>
        <MeetingRoom />
      </MeetingProvider>
    </ErrorBoundary>
  );
}

export default App;
