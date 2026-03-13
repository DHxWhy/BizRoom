import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from "react";
import type {
  Message,
  Participant,
  MeetingPhase,
  MeetingMode,
  Artifact,
  AgentRole,
  BigScreenUpdateEvent,
  MonitorUpdateEvent,
  SophiaMessageEvent,
  ArtifactsReadyEvent,
  HumanCalloutEvent,
  BrandMemorySet,
} from "../types";

/** Human participant in the 3D scene (max 2 extra besides Chairman) */
export interface HumanParticipant {
  name: string;
  color?: string;
}

interface MeetingState {
  roomId: string;
  roomName: string;
  /** Unique user ID persisted in localStorage */
  userId: string;
  /** Display name entered in lobby */
  userName: string;
  /** true = room creator (Chairman), false = joined member */
  isChairman: boolean;
  /** Whether the user has entered a room (past the lobby) */
  inRoom: boolean;
  messages: Message[];
  participants: Participant[];
  meetingPhase: MeetingPhase;
  meetingMode: MeetingMode;
  /** DM mode: target agent role (e.g. "coo", "cfo") */
  dmTarget: string | null;
  typingAgents: string[];
  speakingAgent: string | null;
  artifacts: Artifact[];
  isRecording: boolean;
  /** 현재 스트리밍 중인 메시지 ID 집합 */
  streamingMessageIds: Set<string>;
  /** Additional human participants in the 3D scene (max 2) */
  humanParticipants: HumanParticipant[];
  /** Big screen visualization history (max 20, FIFO) */
  bigScreenHistory: BigScreenUpdateEvent[];
  /** Index into bigScreenHistory: -1 = auto-follow latest */
  bigScreenIndex: number;
  /** Per-agent/chairman monitor data */
  monitorData: Record<string, MonitorUpdateEvent>;
  /** Sophia secretary messages */
  sophiaMessages: SophiaMessageEvent[];
  /** Meeting artifacts ready for download */
  readyArtifacts: ArtifactsReadyEvent | null;
  /** Agents currently thinking */
  thinkingAgents: AgentRole[];
  /** Active human callout (opinion/confirm request from agent) */
  humanCallout: HumanCalloutEvent | null;
  /** Brand memory for current meeting session */
  brandMemory: BrandMemorySet | null;
  /** Agenda set in lobby (used by handleStartMeeting in App.tsx) */
  lobbyAgenda: string;
}

/** START_STREAM 페이로드: 빈 메시지 stub를 생성 */
export interface StartStreamPayload {
  messageId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  senderType: "agent";
}

/** APPEND_MESSAGE_DELTA 페이로드: 기존 메시지에 텍스트 delta 추가 */
export interface AppendDeltaPayload {
  messageId: string;
  delta: string;
}

/** END_STREAM 페이로드: 스트리밍 완료 표시 */
export interface EndStreamPayload {
  messageId: string;
}

type MeetingAction =
  | { type: "ADD_MESSAGE"; payload: Message }
  | { type: "SET_MESSAGES"; payload: Message[] }
  | { type: "SET_TYPING"; payload: { agentName: string; isTyping: boolean } }
  | { type: "SET_SPEAKING"; payload: string | null }
  | { type: "SET_PHASE"; payload: MeetingPhase }
  | { type: "ADD_ARTIFACT"; payload: Artifact }
  | { type: "SET_RECORDING"; payload: boolean }
  | { type: "SET_PARTICIPANTS"; payload: Participant[] }
  | { type: "SET_MODE"; payload: MeetingMode }
  | { type: "SET_DM_TARGET"; payload: string | null }
  | { type: "START_STREAM"; payload: StartStreamPayload }
  | { type: "APPEND_MESSAGE_DELTA"; payload: AppendDeltaPayload }
  | { type: "END_STREAM"; payload: EndStreamPayload }
  | { type: "SET_USER"; payload: { userId: string; userName: string } }
  | { type: "SET_ROOM"; payload: { roomId: string; isChairman: boolean } }
  | { type: "ENTER_ROOM" }
  | { type: "LEAVE_ROOM" }
  | { type: "ADD_HUMAN_PARTICIPANT"; payload: HumanParticipant }
  | { type: "REMOVE_HUMAN_PARTICIPANT"; payload: string }
  | { type: "PUSH_BIG_SCREEN"; payload: BigScreenUpdateEvent }
  | { type: "NAV_BIG_SCREEN"; payload: "prev" | "next" }
  | { type: "SET_MONITOR"; payload: MonitorUpdateEvent }
  | { type: "ADD_SOPHIA_MESSAGE"; payload: SophiaMessageEvent }
  | { type: "SET_READY_ARTIFACTS"; payload: ArtifactsReadyEvent }
  | { type: "SET_THINKING_AGENTS"; payload: { roles: AgentRole[] } }
  | { type: "SET_HUMAN_CALLOUT"; payload: HumanCalloutEvent | null }
  | { type: "SET_BRAND_MEMORY"; payload: BrandMemorySet | null }
  | { type: "SET_LOBBY_AGENDA"; payload: string };

const initialState: MeetingState = {
  roomId: "",
  roomName: "임원회의",
  userId: "",
  userName: "",
  isChairman: false,
  inRoom: false,
  messages: [],
  participants: [],
  meetingPhase: "idle",
  meetingMode: "live",
  dmTarget: null,
  typingAgents: [],
  speakingAgent: null,
  artifacts: [],
  isRecording: false,
  streamingMessageIds: new Set<string>(),
  humanParticipants: [],
  bigScreenHistory: [],
  bigScreenIndex: -1,
  monitorData: {},
  sophiaMessages: [],
  readyArtifacts: null,
  thinkingAgents: [],
  humanCallout: null,
  brandMemory: null,
  lobbyAgenda: "",
};

function meetingReducer(state: MeetingState, action: MeetingAction): MeetingState {
  switch (action.type) {
    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.payload] };
    case "SET_MESSAGES":
      return { ...state, messages: action.payload };
    case "SET_TYPING": {
      const { agentName, isTyping } = action.payload;
      const typingAgents = isTyping
        ? [...state.typingAgents.filter((n) => n !== agentName), agentName]
        : state.typingAgents.filter((n) => n !== agentName);
      return { ...state, typingAgents };
    }
    case "SET_SPEAKING":
      return { ...state, speakingAgent: action.payload };
    case "SET_PHASE":
      return { ...state, meetingPhase: action.payload };
    case "ADD_ARTIFACT":
      return { ...state, artifacts: [...state.artifacts, action.payload] };
    case "SET_RECORDING":
      return { ...state, isRecording: action.payload };
    case "SET_PARTICIPANTS":
      return { ...state, participants: action.payload };
    case "SET_MODE":
      return { ...state, meetingMode: action.payload };
    case "SET_DM_TARGET":
      return { ...state, dmTarget: action.payload };

    // ── 스트리밍 액션 ──

    case "START_STREAM": {
      const { messageId, senderId, senderName, senderRole, senderType } = action.payload;
      const stubMessage: Message = {
        id: messageId,
        roomId: state.roomId,
        senderId,
        senderType,
        senderName,
        senderRole,
        content: "",
        timestamp: new Date().toISOString(),
      };
      const nextStreamIds = new Set(state.streamingMessageIds);
      nextStreamIds.add(messageId);
      return {
        ...state,
        messages: [...state.messages, stubMessage],
        streamingMessageIds: nextStreamIds,
      };
    }

    case "APPEND_MESSAGE_DELTA": {
      const { messageId, delta } = action.payload;
      const idx = state.messages.findIndex((m) => m.id === messageId);
      if (idx === -1) return state;
      const updatedMessages = [...state.messages];
      updatedMessages[idx] = {
        ...updatedMessages[idx],
        content: updatedMessages[idx].content + delta,
      };
      return { ...state, messages: updatedMessages };
    }

    case "END_STREAM": {
      const endStreamIds = new Set(state.streamingMessageIds);
      endStreamIds.delete(action.payload.messageId);
      return { ...state, streamingMessageIds: endStreamIds };
    }

    // ── Room/user session actions ──

    case "SET_USER":
      return { ...state, userId: action.payload.userId, userName: action.payload.userName };

    case "SET_ROOM":
      return { ...state, roomId: action.payload.roomId, isChairman: action.payload.isChairman };

    case "ENTER_ROOM":
      return { ...state, inRoom: true };

    case "LEAVE_ROOM":
      return {
        ...state,
        inRoom: false,
        roomId: "",
        messages: [],
        meetingPhase: "idle",
        humanParticipants: [],
        artifacts: [],
        typingAgents: [],
        speakingAgent: null,
        streamingMessageIds: new Set<string>(),
        bigScreenHistory: [],
        bigScreenIndex: -1,
        monitorData: {},
        sophiaMessages: [],
        readyArtifacts: null,
        thinkingAgents: [],
        humanCallout: null,
        brandMemory: null,
        lobbyAgenda: "",
      };

    case "ADD_HUMAN_PARTICIPANT": {
      if (state.humanParticipants.length >= 2) return state;
      if (state.humanParticipants.some((p) => p.name === action.payload.name)) return state;
      return { ...state, humanParticipants: [...state.humanParticipants, action.payload] };
    }

    case "REMOVE_HUMAN_PARTICIPANT":
      return {
        ...state,
        humanParticipants: state.humanParticipants.filter((p) => p.name !== action.payload),
      };

    // ── Meeting interaction actions ──

    case "PUSH_BIG_SCREEN": {
      const MAX_HISTORY = 20;
      const next = [...state.bigScreenHistory, action.payload];
      const trimmed = next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
      return { ...state, bigScreenHistory: trimmed, bigScreenIndex: -1 };
    }
    case "NAV_BIG_SCREEN": {
      const len = state.bigScreenHistory.length;
      if (len === 0) return state;
      const current = state.bigScreenIndex === -1 ? len - 1 : state.bigScreenIndex;
      const nextIdx =
        action.payload === "prev" ? Math.max(0, current - 1) : Math.min(len - 1, current + 1);
      return { ...state, bigScreenIndex: nextIdx === len - 1 ? -1 : nextIdx };
    }
    case "SET_MONITOR":
      return {
        ...state,
        monitorData: { ...state.monitorData, [action.payload.target]: action.payload },
      };
    case "ADD_SOPHIA_MESSAGE": {
      const next = [...state.sophiaMessages, action.payload];
      return { ...state, sophiaMessages: next.length > 50 ? next.slice(-50) : next };
    }
    case "SET_READY_ARTIFACTS":
      return { ...state, readyArtifacts: action.payload };
    case "SET_THINKING_AGENTS":
      return { ...state, thinkingAgents: action.payload.roles };
    case "SET_HUMAN_CALLOUT":
      return { ...state, humanCallout: action.payload };
    case "SET_BRAND_MEMORY":
      return { ...state, brandMemory: action.payload };
    case "SET_LOBBY_AGENDA":
      return { ...state, lobbyAgenda: action.payload };

    default:
      return state;
  }
}

const MeetingStateContext = createContext<MeetingState>(initialState);
const MeetingDispatchContext = createContext<Dispatch<MeetingAction>>(() => {});

export function MeetingProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(meetingReducer, initialState);
  return (
    <MeetingStateContext.Provider value={state}>
      <MeetingDispatchContext.Provider value={dispatch}>{children}</MeetingDispatchContext.Provider>
    </MeetingStateContext.Provider>
  );
}

export function useMeetingState() {
  return useContext(MeetingStateContext);
}

export function useMeetingDispatch() {
  return useContext(MeetingDispatchContext);
}
