// Shared types between frontend and backend
// Ref: docs/TECH_SPEC.md §5

export type AgentRole = "coo" | "cfo" | "cmo" | "cto" | "cdo" | "clo";
export type SenderType = "human" | "agent";
export type MeetingPhase =
  | "idle"
  | "opening"
  | "briefing"
  | "discussion"
  | "decision"
  | "action"
  | "closing";
export type ParticipantStatus = "online" | "away" | "busy" | "typing";
export type ArtifactType = "excel" | "markdown" | "image";
export type QuickActionType = "agree" | "disagree" | "next" | "hold";
export type MeetingMode = "live" | "auto" | "dm";

export interface Message {
  id: string;
  roomId: string;
  senderId: string;
  senderType: SenderType;
  senderName: string;
  senderRole: string;
  content: string;
  artifacts?: Artifact[];
  replyTo?: string;
  timestamp: string;
  isVoiceInput?: boolean;
}

export interface Artifact {
  id: string;
  type: ArtifactType;
  name: string;
  url: string;
  size: number;
  mimeType: string;
}

export interface Participant {
  id: string;
  name: string;
  type: SenderType;
  role: string;
  status: ParticipantStatus;
  avatar: string;
  inspiredBy?: string;
}

export interface Room {
  id: string;
  name: string;
  type: "meeting" | "channel" | "dm";
  participants: Participant[];
  phase: MeetingPhase;
  createdAt: string;
}

export interface Decision {
  id: string;
  description: string;
  decidedBy: string;
  timestamp: string;
  relatedAgendaItem: number;
}

export interface ActionItem {
  id: string;
  description: string;
  assignee: string;
  deadline?: string;
  status: "pending" | "in_progress" | "done";
}

// ──────────────────────────────────────────────
// Voice Live API Types
// Ref: docs/superpowers/specs/2026-03-12-voice-live-turnmanager-design.md §2.2
// ──────────────────────────────────────────────
export type TurnState = "idle" | "hearing" | "routing" | "speaking";

export interface BufferedMessage {
  userId: string;
  userName: string;
  isChairman: boolean;
  source: "voice" | "chat";
  content: string;
  timestamp: number;
}

export interface AgentTurn {
  role: AgentRole;
  priority: number;
}

/** SignalR voice streaming events — Spec §8.4 */
export interface AgentAudioDeltaEvent {
  role: AgentRole;
  audioBase64: string;
  format: "pcm16_24k";
}

export interface AgentTranscriptDeltaEvent {
  role: AgentRole;
  text: string;
  isFinal: boolean;
}

export interface AgentVisemeDeltaEvent {
  role: AgentRole;
  visemeId: number;
  audioOffsetMs: number;
}

export interface AgentResponseDoneEvent {
  role: AgentRole;
  fullText: string;
}

export interface AgentTypingEvent {
  agentId: string;
  agentName: string;
  isTyping: boolean;
}

export interface PhaseChangedEvent {
  phase: MeetingPhase;
  agendaItem?: string;
}
