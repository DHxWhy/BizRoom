// Shared types between frontend and backend
// Ref: docs/TECH_SPEC.md §5

// ──────────────────────────────────────────────
// Cosmos DB Document Types — Migration Plan §2
// ──────────────────────────────────────────────

export interface UserDocument {
  id: string;
  type: "user";
  email: string;
  displayName: string;
  createdAt: string;
  brandMemory?: BrandMemorySet;
  preferences?: {
    language: "ko" | "en";
    defaultMeetingMode: "live" | "auto";
  };
}

export interface RoomDocument {
  id: string;
  type: "room";
  name: string;
  createdBy: string;
  createdAt: string;
  joinCode: string;
  joinCodeExpiresAt?: string;
  maxParticipants: number;
  isActive: boolean;
  participants: Array<{
    userId: string;
    role: "chairman" | "member";
    joinedAt: string;
  }>;
  currentSessionId?: string;
  totalSessions: number;
}

export interface SessionDocument {
  id: string;
  type: "session";
  roomId: string;
  startedAt: string;
  endedAt?: string;
  duration?: number;
  agenda: string;
  phase: MeetingPhase;
  mode: MeetingMode;
  brandMemorySnapshot?: BrandMemorySet;
  summary?: {
    keyPoints: string[];
    decisions: string[];
    actionItems: Array<{
      task: string;
      assignee: string;
      deadline?: string;
    }>;
  };
  visualizations: Array<{
    timestamp: string;
    type: string;
    title: string;
    renderData?: unknown;
    blobUrl?: string;
  }>;
  artifactIds: string[];
  participants: Array<{
    userId: string;
    role: string;
  }>;
}

export interface MessageDocument {
  id: string;
  type: "meeting-message" | "dm-message";
  sessionId: string;
  roomId: string;
  senderId: string;
  senderType: SenderType;
  senderName: string;
  senderRole?: string;
  content: string;
  timestamp: string;
  structured?: StructuredAgentOutput | null;
  dmTarget?: string;
  _ttl?: number;
}

export interface ArtifactDocument {
  id: string;
  type: "artifact";
  roomId: string;
  sessionId: string;
  fileName: string;
  fileType: "pptx" | "xlsx" | "pdf" | "planner";
  fileSize?: number;
  storage: "onedrive" | "blob";
  storageUrl: string;
  driveItemId?: string;
  createdAt: string;
  createdBy: string;
  plannerTaskIds?: string[];
}

// ──────────────────────────────────────────────

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
export type ArtifactType = "excel" | "markdown" | "image" | "powerpoint" | "planner";
export type ArtifactFileType = "pptx" | "xlsx" | "planner";
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
export type TurnState = "idle" | "hearing" | "routing" | "speaking" | "awaiting";

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

// ──────────────────────────────────────────────
// Agent Context — shared between AgentFactory, agentConfigs, prompts
// ──────────────────────────────────────────────
export interface AgentContext {
  participants: string;
  agenda: string;
  history: string;
  brandMemory?: BrandMemorySet;
}

// ──────────────────────────────────────────────
// SignalR Broadcast Event — discriminated union
// ──────────────────────────────────────────────
export type RoomBroadcastEvent =
  | { type: "agentAudioDelta"; payload: AgentAudioDeltaEvent }
  | { type: "agentTranscriptDelta"; payload: AgentTranscriptDeltaEvent }
  | { type: "agentVisemeDelta"; payload: AgentVisemeDeltaEvent }
  | { type: "agentResponseDone"; payload: AgentResponseDoneEvent }
  | { type: "agentTyping"; payload: AgentTypingEvent }
  | { type: "phaseChanged"; payload: PhaseChangedEvent };

// ──────────────────────────────────────────────
// Voice Live WebSocket Event — discriminated unions
// ──────────────────────────────────────────────
export type ListenerWsEvent =
  | { type: "input_audio_buffer.speech_started" }
  | { type: "input_audio_buffer.speech_stopped" }
  | { type: "conversation.item.input_audio_transcription.completed"; transcript: string };

export type AgentWsEvent =
  | { type: "response.audio.delta"; delta: string }
  | { type: "response.audio_transcript.delta"; delta: string }
  /** Text-modality delta (no audio) — emitted when modalities includes "text" */
  | { type: "response.text.delta"; delta: string }
  | { type: "response.animation_viseme.delta"; viseme_id: number; audio_offset_ms: number }
  | {
      type: "response.done";
      response: {
        output: Array<{
          type: string;
          content?: Array<{
            type: string;
            text?: string;
            /** Audio content item transcript (OpenAI Realtime) */
            transcript?: string;
          }>;
        }>;
      };
    };

// ──────────────────────────────────────────────
// Response Quality Logging
// ──────────────────────────────────────────────
export interface ResponseLog {
  _type: "ResponseLog";
  timestamp: string;
  agent: { role: AgentRole; name: string };
  response: { sentenceCount: number; tokenEstimate: number; latencyMs: number };
  qualityChecks: { sentenceCountPass: boolean };
}

// ──────────────────────────────────────────────
// Meeting Interaction Types — Spec §2-4
// ──────────────────────────────────────────────
export interface Mention {
  target: AgentRole | "chairman" | `member:${string}`;
  intent: "opinion" | "confirm";
  options?: string[];
}

export interface VisualHint {
  type: VisualType;
  title: string;
}

export interface StructuredAgentOutput {
  speech: string;
  key_points: string[];
  mention: Mention | null;
  visual_hint: VisualHint | null;
}

export type VisualType =
  | "comparison"
  | "pie-chart"
  | "bar-chart"
  | "timeline"
  | "checklist"
  | "summary"
  | "architecture";

export type SecretaryRole = "sophia";
export type AllAgentRole = AgentRole | SecretaryRole;

// ──────────────────────────────────────────────
// Meeting Interaction Events — Spec §9
// ──────────────────────────────────────────────
export interface AgentThinkingEvent {
  roles: AgentRole[];
}

export interface HumanCalloutEvent {
  target: "chairman" | `member:${string}`;
  intent: "opinion" | "confirm";
  options?: string[];
  fromAgent: AgentRole;
}

export type BigScreenRenderData =
  | { type: "comparison"; columns: string[]; rows: string[][] }
  | { type: "pie-chart"; items: Array<{ label: string; value: number; color: string }> }
  | { type: "bar-chart"; items: Array<{ label: string; value: number }> }
  | { type: "timeline"; items: Array<{ date: string; label: string; status: "done" | "current" | "pending" }> }
  | { type: "checklist"; items: Array<{ text: string; checked: boolean }> }
  | { type: "summary"; items: string[] }
  | { type: "architecture"; nodes: Array<{ id: string; label: string; x: number; y: number }>; edges: Array<{ from: string; to: string }> };

export interface BigScreenUpdateEvent {
  visualType: VisualType;
  title: string;
  renderData: BigScreenRenderData;
}

export type MonitorContent =
  | { type: "idle"; text: string }
  | { type: "keyPoints"; agentRole: AgentRole; points: string[] }
  | { type: "confirm"; options: string[]; fromAgent: AgentRole }
  | { type: "callout"; message: string; fromAgent: AgentRole }
  | { type: "actionItems"; items: Array<{ description: string; assignee: string }> }
  | { type: "thinking"; text: string }
  | { type: "speaking"; text: string };

export interface MonitorUpdateEvent {
  target: "chairman" | `member:${string}` | AgentRole;
  mode: "idle" | "keyPoints" | "confirm" | "callout" | "actionItems" | "thinking" | "speaking";
  content: MonitorContent;
}

export interface SophiaMessageEvent {
  text: string;
  visualRef?: string;
}

export interface ArtifactsReadyEvent {
  files: Array<{
    name: string;
    type: ArtifactFileType;
    webUrl: string;
    driveItemId?: string;
  }>;
}

// Extend RoomBroadcastEvent with meeting interaction events
export type MeetingBroadcastEvent =
  | RoomBroadcastEvent
  | { type: "agentThinking"; payload: AgentThinkingEvent }
  | { type: "humanCallout"; payload: HumanCalloutEvent }
  | { type: "bigScreenUpdate"; payload: BigScreenUpdateEvent }
  | { type: "monitorUpdate"; payload: MonitorUpdateEvent }
  | { type: "sophiaMessage"; payload: SophiaMessageEvent }
  | { type: "artifactsReady"; payload: ArtifactsReadyEvent };

// ──────────────────────────────────────────────
// Brand Memory Set — Spec §1
// ──────────────────────────────────────────────

export interface PricingTier {
  name: string;
  price: string;
  features: string;
}

export interface CompetitorInfo {
  name: string;
  weakness: string;
}

export interface ExternalLink {
  label: string;
  url: string;
}

export interface BrandMemorySet {
  // Required (3)
  companyName: string;
  industry: string;
  productName: string;
  // Basic info
  foundedDate?: string;
  founderName?: string;
  teamSize?: string;
  mission?: string;
  vision?: string;
  // Product
  productDescription?: string;
  coreFeatures?: string[];
  targetCustomer?: string;
  techStack?: string;
  revenueModel?: string;
  pricing?: PricingTier[];
  // Market
  marketSize?: string;
  marketStats?: string[];
  competitors?: CompetitorInfo[];
  differentiation?: string[];
  // Finance
  currentStage?: string;
  funding?: string;
  goals?: string;
  // Links
  links?: ExternalLink[];
  // Challenges
  challenges?: string[];
  quarterGoal?: string;
  meetingObjective?: string;
  // Brand copy
  brandCopy?: string;
  subCopy?: string;
  positioning?: string;
}
