import { lazy, Suspense } from "react";
import { MeetingProvider, useMeetingState, useMeetingDispatch } from "./context/MeetingContext";
import { useSignalR } from "./hooks/useSignalR";
import type { ConnectionStatus } from "./hooks/useSignalR";
import { ChatRoom } from "./components/chat/ChatRoom";
import { InputArea } from "./components/input/InputArea";
import { QuickActions } from "./components/input/QuickActions";
import { MeetingBanner } from "./components/meeting/MeetingBanner";
import { ModeSelector } from "./components/meeting/ModeSelector";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ChatOverlay } from "./components/meeting3d/ChatOverlay";
import { LoadingScreen } from "./components/meeting3d/LoadingScreen";
import { S } from "./constants/strings";
import type { Message, MeetingPhase, MeetingMode, Participant, QuickActionType } from "./types";
import type { ArtifactData } from "./components/meeting3d/ArtifactScreen3D";
import { useCallback, useEffect, useRef, useMemo } from "react";

// Lazy-load the heavy 3D scene (Three.js + R3F + drei)
const MeetingRoom3D = lazy(() =>
  import("./components/meeting3d/MeetingRoom3D").then((m) => ({
    default: m.MeetingRoom3D,
  })),
);

// Map agent names to roles for 3D avatar lookup
const NAME_TO_ROLE: Record<string, string> = {
  Hudson: "coo",
  Amelia: "cfo",
  Yusef: "cmo",
};

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
    <div className="flex items-center gap-1.5 text-xs text-neutral-400">
      <span className={`w-1.5 h-1.5 rounded-full ${colorMap[status]}`} />
      <span>{labelMap[status]}</span>
    </div>
  );
}

/** Sidebar mini-panel for participants (overlaid on the 3D scene left side) */
function ParticipantOverlay({
  participants,
  speakingAgent,
  typingAgents,
  connectionStatus,
}: {
  participants: Participant[];
  speakingAgent: string | null;
  typingAgents: string[];
  connectionStatus: ConnectionStatus;
}) {
  return (
    <div className="absolute left-4 top-4 z-10">
      <div className="bg-neutral-950/70 backdrop-blur-xl rounded-xl border border-neutral-700/30 p-3 min-w-[180px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
            참여 임원
          </h3>
          <ConnectionStatusBadge status={connectionStatus} />
        </div>

        {/* Participant list */}
        <div className="space-y-2">
          {participants.map((p) => {
            const role = NAME_TO_ROLE[p.name] ?? p.role;
            const isSpeaking = speakingAgent === role;
            const isThinking = typingAgents.includes(p.name);

            return (
              <div
                key={p.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all ${
                  isSpeaking
                    ? "bg-indigo-500/20 border border-indigo-500/30"
                    : isThinking
                      ? "bg-amber-500/10 border border-amber-500/20"
                      : "border border-transparent"
                }`}
              >
                {/* Avatar */}
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
                    p.type === "human"
                      ? "bg-indigo-600"
                      : "bg-neutral-800"
                  }`}
                >
                  {p.type === "human" ? p.name.charAt(0) : p.avatar}
                </div>

                {/* Name + status */}
                <div className="min-w-0">
                  <div className="text-xs font-medium text-neutral-200 truncate">
                    {p.name}
                  </div>
                  <div className="text-[10px] text-neutral-500 uppercase">
                    {p.role}
                    {isSpeaking && (
                      <span className="ml-1 text-indigo-400">발언 중</span>
                    )}
                    {isThinking && !isSpeaking && (
                      <span className="ml-1 text-amber-400">생각 중...</span>
                    )}
                  </div>
                </div>

                {/* Status dot */}
                <div
                  className={`w-1.5 h-1.5 rounded-full ml-auto flex-shrink-0 ${
                    isSpeaking
                      ? "bg-indigo-400 animate-pulse"
                      : isThinking
                        ? "bg-amber-400 animate-pulse"
                        : "bg-green-500"
                  }`}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Inner component that consumes MeetingContext and wires up everything. */
function MeetingRoom() {
  const state = useMeetingState();
  const dispatch = useMeetingDispatch();
  const speakingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Initialize default participants on mount
  useEffect(() => {
    dispatch({ type: "SET_PARTICIPANTS", payload: DEFAULT_PARTICIPANTS });
  }, [dispatch]);

  // SignalR connection with event handlers + streaming callbacks
  const { sendMessage, sendMessageStream, status: connectionStatus } = useSignalR({
    onMessage: useCallback(
      (message: Message) => {
        dispatch({ type: "ADD_MESSAGE", payload: message });

        // Set speaking agent when agent message arrives
        if (message.senderType === "agent") {
          const role = NAME_TO_ROLE[message.senderName] ?? message.senderRole;
          dispatch({ type: "SET_SPEAKING", payload: role });

          // Clear speaking after a delay proportional to message length
          if (speakingTimeoutRef.current) {
            clearTimeout(speakingTimeoutRef.current);
          }
          const duration = Math.min(
            Math.max(message.content.length * 50, 2000),
            8000,
          );
          speakingTimeoutRef.current = setTimeout(() => {
            dispatch({ type: "SET_SPEAKING", payload: null });
          }, duration);
        }
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
    // ── 스트리밍 콜백 ──
    onStreamStart: useCallback(
      (payload) => {
        dispatch({ type: "START_STREAM", payload });
        // 스트리밍 시작 시 해당 에이전트를 speaking 상태로
        const role = NAME_TO_ROLE[payload.senderName] ?? payload.senderRole;
        dispatch({ type: "SET_SPEAKING", payload: role });
      },
      [dispatch],
    ),
    onStreamDelta: useCallback(
      (payload) => {
        dispatch({ type: "APPEND_MESSAGE_DELTA", payload });
      },
      [dispatch],
    ),
    onStreamEnd: useCallback(
      (payload) => {
        dispatch({ type: "END_STREAM", payload });
        // 스트리밍 완료 후 일정 시간 뒤 speaking 해제
        if (speakingTimeoutRef.current) {
          clearTimeout(speakingTimeoutRef.current);
        }
        speakingTimeoutRef.current = setTimeout(() => {
          dispatch({ type: "SET_SPEAKING", payload: null });
        }, 1500);
      },
      [dispatch],
    ),
  });

  // Derive thinking agent roles from typing agent names
  const thinkingAgentRoles = state.typingAgents
    .map((name) => NAME_TO_ROLE[name] ?? name.toLowerCase())
    .filter(Boolean);

  // Send a user message to the room (uses streaming when available)
  const handleSend = useCallback(
    async (content: string, isVoiceInput?: boolean) => {
      const userMessage: Message = {
        id: crypto.randomUUID(),
        roomId: state.roomId,
        senderId: "user-1",
        senderType: "human",
        senderName: "Chairman",
        senderRole: "chairman",
        content,
        timestamp: new Date().toISOString(),
        isVoiceInput,
      };
      dispatch({ type: "ADD_MESSAGE", payload: userMessage });

      // Show typing indicators for all agents
      const agentNames = ["Hudson", "Amelia", "Yusef"];
      for (const name of agentNames) {
        dispatch({ type: "SET_TYPING", payload: { agentName: name, isTyping: true } });
      }

      try {
        // 스트리밍 모드: 실시간 텍스트 표시 (onStreamStart/Delta/End 콜백이 처리)
        await sendMessageStream(state.roomId, content, "Chairman");
      } catch {
        // 스트리밍 실패 시 기존 REST 폴백
        await sendMessage(state.roomId, content, "Chairman");
      }

      for (const name of agentNames) {
        dispatch({ type: "SET_TYPING", payload: { agentName: name, isTyping: false } });
      }
    },
    [dispatch, sendMessage, sendMessageStream, state.roomId],
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

          // COO speaks the opening
          dispatch({ type: "SET_SPEAKING", payload: "coo" });
          setTimeout(() => {
            dispatch({ type: "SET_SPEAKING", payload: null });
          }, 5000);
        }
        dispatch({ type: "SET_PHASE", payload: "briefing" });
      }
    } catch (err: unknown) {
      console.error("Failed to start meeting:", err);
    }
  }, [dispatch]);

  const handleModeChange = useCallback(
    (mode: MeetingMode) => {
      dispatch({ type: "SET_MODE", payload: mode });
    },
    [dispatch],
  );

  // 최근 아티팩트를 3D 스크린에 표시
  const currentArtifact: ArtifactData | null = useMemo(() => {
    if (state.artifacts.length === 0) return null;
    const latest = state.artifacts[state.artifacts.length - 1];
    return {
      type: latest.type as "excel" | "markdown" | "image",
      name: latest.name,
      content: typeof latest.content === "string" ? latest.content : undefined,
    };
  }, [state.artifacts]);

  const isIdle = state.meetingPhase === "idle";
  const isActive = !isIdle;

  return (
    <div className="h-screen w-screen bg-neutral-950 overflow-hidden relative">
      {/* ═══ 3D MEETING ROOM (full screen, lazy loaded) ═══ */}
      <div className="absolute inset-0">
        <Suspense fallback={<LoadingScreen />}>
          <MeetingRoom3D
            speakingAgent={state.speakingAgent}
            thinkingAgents={thinkingAgentRoles}
            meetingPhase={state.meetingPhase}
            currentArtifact={currentArtifact}
          />
        </Suspense>
      </div>

      {/* ═══ TOP BAR ═══ */}
      <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none">
        <div className="pointer-events-auto flex items-center justify-between">
          <MeetingBanner phase={state.meetingPhase} />
          {isActive && (
            <div className="mr-4 mt-2">
              <ModeSelector
                currentMode={state.meetingMode}
                onModeChange={handleModeChange}
              />
            </div>
          )}
        </div>
      </div>

      {/* ═══ PARTICIPANT SIDEBAR (overlay) ═══ */}
      <ParticipantOverlay
        participants={
          state.participants.length > 0 ? state.participants : DEFAULT_PARTICIPANTS
        }
        speakingAgent={state.speakingAgent}
        typingAgents={state.typingAgents}
        connectionStatus={connectionStatus}
      />

      {/* ═══ START MEETING BUTTON + MODE SELECTOR (when idle) ═══ */}
      {isIdle && (
        <div className="absolute inset-0 flex items-center justify-center z-30">
          <div className="text-center">
            <div className="mb-8">
              <h1 className="text-4xl font-bold text-white mb-2 drop-shadow-lg">
                BizRoom
              </h1>
              <p className="text-neutral-400 text-lg">
                AI C-Suite Virtual Office
              </p>
            </div>

            {/* Mode selector */}
            <div className="mb-6 flex justify-center">
              <ModeSelector
                currentMode={state.meetingMode}
                onModeChange={handleModeChange}
              />
            </div>

            <button
              onClick={() => void handleStartMeeting()}
              className="group relative px-8 py-4 bg-indigo-600 hover:bg-indigo-500 rounded-2xl text-lg font-semibold transition-all
                         shadow-lg shadow-indigo-600/30 hover:shadow-xl hover:shadow-indigo-500/40
                         hover:scale-105 active:scale-95"
            >
              <span className="relative z-10">{S.meeting.start}</span>
              <div className="absolute inset-0 rounded-2xl bg-indigo-400/20 animate-ping opacity-20" />
            </button>
          </div>
        </div>
      )}

      {/* ═══ CHAT OVERLAY (right side) ═══ */}
      <ChatOverlay isActive={isActive}>
        <ChatRoom
          messages={state.messages}
          typingAgents={state.typingAgents}
        />
        <QuickActions onAction={handleQuickAction} disabled={isIdle} />
        <InputArea
          onSend={(content, isVoiceInput) => void handleSend(content, isVoiceInput)}
          disabled={isIdle}
        />
      </ChatOverlay>
    </div>
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
