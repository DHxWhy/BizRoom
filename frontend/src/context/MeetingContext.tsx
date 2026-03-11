import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from "react";
import type { Message, Participant, MeetingPhase, MeetingMode, Artifact } from "../types";

interface MeetingState {
  roomId: string;
  roomName: string;
  messages: Message[];
  participants: Participant[];
  meetingPhase: MeetingPhase;
  meetingMode: MeetingMode;
  typingAgents: string[];
  speakingAgent: string | null;
  artifacts: Artifact[];
  isRecording: boolean;
  /** 현재 스트리밍 중인 메시지 ID 집합 */
  streamingMessageIds: Set<string>;
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
  | { type: "START_STREAM"; payload: StartStreamPayload }
  | { type: "APPEND_MESSAGE_DELTA"; payload: AppendDeltaPayload }
  | { type: "END_STREAM"; payload: EndStreamPayload };

const initialState: MeetingState = {
  roomId: "room-default",
  roomName: "임원회의",
  messages: [],
  participants: [],
  meetingPhase: "idle",
  meetingMode: "meeting",
  typingAgents: [],
  speakingAgent: null,
  artifacts: [],
  isRecording: false,
  streamingMessageIds: new Set<string>(),
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
      <MeetingDispatchContext.Provider value={dispatch}>
        {children}
      </MeetingDispatchContext.Provider>
    </MeetingStateContext.Provider>
  );
}

export function useMeetingState() {
  return useContext(MeetingStateContext);
}

export function useMeetingDispatch() {
  return useContext(MeetingDispatchContext);
}
