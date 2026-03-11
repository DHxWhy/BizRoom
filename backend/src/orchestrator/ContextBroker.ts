import type { Message, MeetingPhase } from "../models/index.js";

const MAX_CONTEXT_MESSAGES = 50;

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
  phase: MeetingPhase;
  agenda: string;
  messages: Message[];
  decisions: Decision[];
  actionItems: ActionItem[];
}

// In-memory context store (per room)
const rooms: Map<string, RoomContext> = new Map();

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

/** Add a message to the room context, capping at MAX_CONTEXT_MESSAGES */
export function addMessage(roomId: string, message: Message): void {
  const room = getOrCreateRoom(roomId);
  room.messages.push(message);
  // Cap at MAX_CONTEXT_MESSAGES
  if (room.messages.length > MAX_CONTEXT_MESSAGES) {
    room.messages = room.messages.slice(-MAX_CONTEXT_MESSAGES);
  }
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
    ? room.actionItems
        .map((a) => `- [${a.status}] ${a.description} → ${a.assignee}`)
        .join("\n")
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

/** Remove all context for a room */
export function clearRoom(roomId: string): void {
  rooms.delete(roomId);
}
