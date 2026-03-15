import type { Message, MeetingPhase, BrandMemorySet } from "../models/index.js";
import * as MessageService from "../services/MessageService.js";

const MAX_CONTEXT_MESSAGES = 50;
const DUAL_WRITE = process.env.MIGRATE_DUAL_WRITE === "true";

interface Decision {
  id: string;
  description: string;
  decidedBy: string;
  timestamp: string;
}

interface ActionItem {
  id: string;
  description: string;
  assignee: string;
  status: "pending" | "in_progress" | "done";
}

interface RoomContext {
  roomId: string;
  sessionId?: string;
  phase: MeetingPhase;
  agenda: string;
  messages: Message[];
  decisions: Decision[];
  actionItems: ActionItem[];
  brandMemory?: BrandMemorySet;
}

// In-memory context store (per room)
const rooms: Map<string, RoomContext> = new Map();

/** Fire-and-forget Cosmos write (logs errors but never throws) */
function enqueueWrite(fn: () => Promise<unknown>): void {
  if (!DUAL_WRITE) return;
  fn().catch((err) => console.error("[DualWrite] Cosmos write failed:", err));
}

/** Get existing room context or create a new one */
export function getOrCreateRoom(roomId: string): RoomContext {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      roomId,
      phase: "idle",
      agenda: "",
      messages: [],
      decisions: [],
      actionItems: [],
    });
  }
  return rooms.get(roomId)!;
}

/** Set the sessionId for dual-write correlation */
export function setSessionId(roomId: string, sessionId: string): void {
  const room = getOrCreateRoom(roomId);
  room.sessionId = sessionId;
}

/** Add a message to the room context, capping at MAX_CONTEXT_MESSAGES */
export function addMessage(roomId: string, message: Message): void {
  const room = getOrCreateRoom(roomId);
  room.messages.push(message);
  // Cap at MAX_CONTEXT_MESSAGES
  if (room.messages.length > MAX_CONTEXT_MESSAGES) {
    room.messages = room.messages.slice(-MAX_CONTEXT_MESSAGES);
  }

  // Dual-write to Cosmos DB
  enqueueWrite(() =>
    MessageService.saveMessage({
      type: "meeting-message",
      sessionId: room.sessionId ?? roomId,
      roomId,
      senderId: message.senderId,
      senderType: message.senderType,
      senderName: message.senderName,
      senderRole: message.senderRole,
      content: message.content,
      timestamp: message.timestamp,
    }),
  );
}

/** Set the current meeting phase for a room */
export function setPhase(roomId: string, phase: MeetingPhase): void {
  const room = getOrCreateRoom(roomId);
  room.phase = phase;
}

/** Set the meeting agenda for a room */
export function setAgenda(roomId: string, agenda: string): void {
  const room = getOrCreateRoom(roomId);
  room.agenda = agenda;
}

/** Set brand memory for a room */
export function setBrandMemory(roomId: string, brandMemory: BrandMemorySet): void {
  const room = getOrCreateRoom(roomId);
  room.brandMemory = brandMemory;
}

/** Get brand memory for a room */
export function getBrandMemory(roomId: string): BrandMemorySet | undefined {
  return getOrCreateRoom(roomId).brandMemory;
}

/** Record a decision made during the meeting */
export function addDecision(roomId: string, decision: Decision): void {
  const room = getOrCreateRoom(roomId);
  room.decisions.push(decision);
}

/** Add an action item to the room context */
export function addActionItem(roomId: string, item: ActionItem): void {
  const room = getOrCreateRoom(roomId);
  room.actionItems.push(item);
}

/** Build a compressed context string for agent consumption */
export function getContextForAgent(roomId: string, _role: string): string {
  const room = getOrCreateRoom(roomId);
  const recentMessages = room.messages.slice(-20);

  const history = recentMessages
    .map((m) => `[${m.senderName}(${m.senderRole})]: ${m.content}`)
    .join("\n");

  const decisionsStr = room.decisions.length
    ? room.decisions.map((d) => `- ${d.description} (${d.decidedBy})`).join("\n")
    : "없음";

  const actionsStr = room.actionItems.length
    ? room.actionItems.map((a) => `- [${a.status}] ${a.description} → ${a.assignee}`).join("\n")
    : "없음";

  return `## 현재 단계: ${room.phase}
## 안건: ${room.agenda || "일반 회의"}
## 결정사항:
${decisionsStr}
## 액션아이템:
${actionsStr}
## 최근 대화:
${history}`;
}

/** Inject Sophia search results into room context so subsequent agents can reference them */
export function addSearchResult(roomId: string, query: string, results: Array<{ name: string; snippet: string; url: string }>): void {
  const room = getOrCreateRoom(roomId);
  const formatted = results
    .map((r, i) => `${i + 1}. **${r.name}**: ${r.snippet}`)
    .join("\n");

  const searchMessage: Message = {
    id: `sophia-search-${Date.now()}`,
    roomId,
    senderId: "sophia",
    senderType: "agent",
    senderName: "Sophia",
    senderRole: "sophia",
    content: `[소피아 조사 결과: "${query}"]\n${formatted}`,
    timestamp: new Date().toISOString(),
  };
  room.messages.push(searchMessage);

  // Cap at MAX_CONTEXT_MESSAGES
  if (room.messages.length > MAX_CONTEXT_MESSAGES) {
    room.messages = room.messages.slice(-MAX_CONTEXT_MESSAGES);
  }
}

/** Remove all context for a room */
export function clearRoom(roomId: string): void {
  rooms.delete(roomId);
}
