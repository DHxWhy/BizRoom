import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from "react";
import type { Message, Participant, MeetingPhase, Artifact } from "../types";

interface MeetingState {
  roomId: string;
  roomName: string;
  messages: Message[];
  participants: Participant[];
  meetingPhase: MeetingPhase;
  typingAgents: string[];
  artifacts: Artifact[];
  isRecording: boolean;
}

type MeetingAction =
  | { type: "ADD_MESSAGE"; payload: Message }
  | { type: "SET_MESSAGES"; payload: Message[] }
  | { type: "SET_TYPING"; payload: { agentName: string; isTyping: boolean } }
  | { type: "SET_PHASE"; payload: MeetingPhase }
  | { type: "ADD_ARTIFACT"; payload: Artifact }
  | { type: "SET_RECORDING"; payload: boolean }
  | { type: "SET_PARTICIPANTS"; payload: Participant[] };

const initialState: MeetingState = {
  roomId: "room-default",
  roomName: "임원회의",
  messages: [],
  participants: [],
  meetingPhase: "idle",
  typingAgents: [],
  artifacts: [],
  isRecording: false,
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
    case "SET_PHASE":
      return { ...state, meetingPhase: action.payload };
    case "ADD_ARTIFACT":
      return { ...state, artifacts: [...state.artifacts, action.payload] };
    case "SET_RECORDING":
      return { ...state, isRecording: action.payload };
    case "SET_PARTICIPANTS":
      return { ...state, participants: action.payload };
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
