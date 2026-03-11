// backend/src/orchestrator/TurnManager.ts
// Event-driven state machine for turn-taking
// Ref: Design Spec §2

import { EventEmitter } from "events";
import type { AgentRole, BufferedMessage, AgentTurn, TurnState, Message } from "../models/index.js";
import { classifyTopic, parseMentions } from "./TopicClassifier.js";
import { getContextForAgent, addMessage, getOrCreateRoom } from "./ContextBroker.js";
import {
  CHAIRMAN_FLUSH_MS,
  MEMBER_FLUSH_MS,
  INTER_AGENT_GAP_MS,
  MAX_AGENTS_PER_TURN,
  MAX_FOLLOW_UP_ROUNDS,
} from "../constants/turnConfig.js";
import { v4 as uuidv4 } from "uuid";

interface RoomTurnState {
  state: TurnState;
  inputBuffer: BufferedMessage[];
  flushTimer: ReturnType<typeof setTimeout> | null;
  agentQueue: AgentTurn[];
  activeAgent: AgentRole | null;
  interruptFlag: boolean;
  aiPaused: boolean;
  combinedInput: string;           // cached for triggerNextAgent
  chairmanUserId: string | null;   // MVP: single mic = chairman
}

// Preserved from original TurnManager — DialogLab priority queue
type Priority = 0 | 1 | 2 | 3 | 4;

interface TurnEntry {
  role: AgentRole;
  priority: Priority;
}

/**
 * Event-driven TurnManager — the intelligent orchestrator.
 *
 * Events emitted:
 *  - "triggerAgent"  (roomId, role, instructions) — VoiceLiveSessionManager should send response.create
 *  - "cancelAgent"   (roomId, role) — cancel current agent response
 *  - "stateChanged"  (roomId, state) — for debugging / UI feedback
 *  - "agentsDone"    (roomId) — all agents finished, back to IDLE
 */
export class TurnManager extends EventEmitter {
  private rooms = new Map<string, RoomTurnState>();

  private getRoom(roomId: string): RoomTurnState {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        state: "idle",
        inputBuffer: [],
        flushTimer: null,
        agentQueue: [],
        activeAgent: null,
        interruptFlag: false,
        aiPaused: false,
        combinedInput: "",
        chairmanUserId: null,
      });
    }
    return this.rooms.get(roomId)!;
  }

  /** Set the chairman userId for a room (call on room creation) */
  setChairman(roomId: string, userId: string): void {
    const room = this.getRoom(roomId);
    room.chairmanUserId = userId;
  }

  /** Toggle AI pause — Spec §2.5 */
  setAiPaused(roomId: string, paused: boolean): void {
    const room = this.getRoom(roomId);
    room.aiPaused = paused;
    if (paused && room.state === "speaking") {
      // Cancel current agent and clear queue
      if (room.activeAgent) {
        this.emit("cancelAgent", roomId, room.activeAgent);
      }
      room.agentQueue = [];
      room.activeAgent = null;
      this.transition(roomId, "idle");
    }
  }

  // ── Event Handlers (Spec §2.3) ──

  /** Human started speaking via voice — Spec §2.3 onSpeechStart */
  onSpeechStart(roomId: string, userId: string): void {
    const room = this.getRoom(roomId);

    if (room.state === "idle") {
      this.transition(roomId, "hearing");
      this.clearFlushTimer(room);
    } else if (room.state === "hearing") {
      this.clearFlushTimer(room);
    } else if (room.state === "speaking") {
      // Voice interrupt — Spec §2.4
      room.interruptFlag = true;
      if (room.activeAgent) {
        this.emit("cancelAgent", roomId, room.activeAgent);
      }
      room.agentQueue = [];
      room.inputBuffer = [];
      room.activeAgent = null;
      this.transition(roomId, "hearing");
    }
  }

  /** Human stopped speaking via voice — Spec §2.3 onSpeechEnd */
  onSpeechEnd(roomId: string, userId: string): void {
    const room = this.getRoom(roomId);
    if (room.state !== "hearing") return;

    const isChairman = userId === room.chairmanUserId;
    const delay = isChairman ? CHAIRMAN_FLUSH_MS : MEMBER_FLUSH_MS;
    this.startFlushTimer(roomId, room, delay);
  }

  /** Voice transcription completed — Spec §2.3 onTranscript */
  onTranscript(roomId: string, userId: string, userName: string, text: string): void {
    const room = this.getRoom(roomId);
    if (room.state !== "hearing") return;

    const isChairman = userId === room.chairmanUserId;
    room.inputBuffer.push({
      userId,
      userName,
      isChairman,
      source: "voice",
      content: text,
      timestamp: Date.now(),
    });

    // Start flush timer if not already running
    if (!room.flushTimer) {
      const delay = isChairman ? CHAIRMAN_FLUSH_MS : MEMBER_FLUSH_MS;
      this.startFlushTimer(roomId, room, delay);
    }
  }

  /** Chat message received — Spec §2.3 onChatMessage */
  onChatMessage(roomId: string, userId: string, userName: string, text: string, isChairman: boolean): void {
    const room = this.getRoom(roomId);

    if (room.aiPaused) return; // AI paused, ignore

    if (room.state === "idle") {
      this.transition(roomId, "hearing");
    }

    if (room.state === "hearing") {
      room.inputBuffer.push({
        userId,
        userName,
        isChairman,
        source: "chat",
        content: text,
        timestamp: Date.now(),
      });
      const delay = isChairman ? CHAIRMAN_FLUSH_MS : MEMBER_FLUSH_MS;
      this.startFlushTimer(roomId, room, delay);
    } else if (room.state === "speaking") {
      // Chat during speaking — queue for next turn, do NOT interrupt
      room.inputBuffer.push({
        userId,
        userName,
        isChairman,
        source: "chat",
        content: text,
        timestamp: Date.now(),
      });
    }
  }

  /** Chairman requests immediate AI opinion — Spec §2.5 */
  requestAiOpinion(roomId: string): void {
    const room = this.getRoom(roomId);
    if (room.aiPaused) return;

    if (room.state === "idle" || room.state === "hearing") {
      this.transition(roomId, "hearing");
      // Immediate flush with 0ms delay
      this.clearFlushTimer(room);
      this.onFlush(roomId);
    }
  }

  /** Agent finished responding — Spec §2.3 onAgentDone */
  onAgentDone(roomId: string, agentRole: AgentRole, fullText: string): void {
    const room = this.getRoom(roomId);
    if (room.state !== "speaking") return;

    // Save agent response to ContextBroker
    const agentMessage: Message = {
      id: uuidv4(),
      roomId,
      senderId: `agent-${agentRole}`,
      senderType: "agent",
      senderName: agentRole, // Will be enriched by caller
      senderRole: agentRole,
      content: fullText,
      timestamp: new Date().toISOString(),
    };
    addMessage(roomId, agentMessage);

    // A2A follow-up check (preserved from original TurnManager)
    // C2 fix: deduplicate — don't queue an agent that's already in the queue
    const followUpRole = checkFollowUp({ role: agentRole, content: fullText });
    if (
      followUpRole &&
      room.agentQueue.length < MAX_AGENTS_PER_TURN &&
      !room.agentQueue.some((q) => q.role === followUpRole)
    ) {
      room.agentQueue.push({ role: followUpRole, priority: 3 });
    }

    // Next agent or back to IDLE
    if (room.agentQueue.length > 0) {
      setTimeout(() => this.triggerNextAgent(roomId), INTER_AGENT_GAP_MS);
    } else {
      room.activeAgent = null;
      this.transition(roomId, "idle");
      this.emit("agentsDone", roomId);
    }
  }

  /** Clean up room state */
  destroyRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      this.clearFlushTimer(room);
      this.rooms.delete(roomId);
    }
  }

  // ── Private Methods ──

  private onFlush(roomId: string): void {
    const room = this.getRoom(roomId);
    this.transition(roomId, "routing");

    // 1. Merge buffered messages
    room.combinedInput = room.inputBuffer
      .map((m) => `[${m.userName}]: ${m.content}`)
      .join("\n");

    // If buffer is empty (e.g., AI opinion with no new input), use last context
    if (!room.combinedInput.trim()) {
      room.combinedInput = "[Chairman requested AI opinion on current topic]";
    }

    // 2. Save to ContextBroker FIRST (Spec §2.3 step 3, fix for race condition)
    for (const msg of room.inputBuffer) {
      const message: Message = {
        id: uuidv4(),
        roomId,
        senderId: msg.userId,
        senderType: "human",
        senderName: msg.userName,
        senderRole: msg.isChairman ? "chairman" : "member",
        content: msg.content,
        timestamp: new Date(msg.timestamp).toISOString(),
        isVoiceInput: msg.source === "voice",
      };
      addMessage(roomId, message);
    }

    // 3. Determine agents via TopicClassifier
    const mentions = parseMentions(room.combinedInput);
    const { primaryAgent, secondaryAgents } = classifyTopic(room.combinedInput);
    room.agentQueue = determineAgentOrder(room.combinedInput, mentions, primaryAgent, secondaryAgents)
      .slice(0, MAX_AGENTS_PER_TURN);

    // 4. Clear buffer
    room.inputBuffer = [];
    room.interruptFlag = false;

    // 5. Trigger first agent
    if (room.agentQueue.length > 0) {
      this.transition(roomId, "speaking");
      this.triggerNextAgent(roomId);
    } else {
      this.transition(roomId, "idle");
    }
  }

  private triggerNextAgent(roomId: string): void {
    const room = this.getRoom(roomId);
    if (room.agentQueue.length === 0) {
      room.activeAgent = null;
      this.transition(roomId, "idle");
      this.emit("agentsDone", roomId);
      return;
    }

    const next = room.agentQueue.shift()!;
    room.activeAgent = next.role;

    const contextStr = getContextForAgent(roomId, next.role);
    const roomData = getOrCreateRoom(roomId);

    // Build instructions for Voice Live response.create
    const instructions = buildAgentPrompt(next.role, contextStr, room.combinedInput, roomData.agenda || "");

    this.emit("triggerAgent", roomId, next.role, instructions);
  }

  private transition(roomId: string, newState: TurnState): void {
    const room = this.getRoom(roomId);
    room.state = newState;
    this.emit("stateChanged", roomId, newState);
  }

  private startFlushTimer(roomId: string, room: RoomTurnState, delayMs: number): void {
    this.clearFlushTimer(room);
    room.flushTimer = setTimeout(() => {
      room.flushTimer = null;
      this.onFlush(roomId);
    }, delayMs);
  }

  private clearFlushTimer(room: RoomTurnState): void {
    if (room.flushTimer) {
      clearTimeout(room.flushTimer);
      room.flushTimer = null;
    }
  }
}

// ── Preserved logic from original TurnManager ──

/** Agent response order — DialogLab priority queue (from original TurnManager) */
export function determineAgentOrder(
  _message: string,
  mentions: AgentRole[],
  primaryAgent: AgentRole,
  secondaryAgents: AgentRole[],
): AgentTurn[] {
  const entries: AgentTurn[] = [];
  const added = new Set<AgentRole>();

  // P1: COO always responds (meeting orchestrator)
  if (!mentions.length || mentions.includes("coo")) {
    entries.push({ role: "coo", priority: 1 });
    added.add("coo");
  }

  // P2: Mentioned agents
  for (const role of mentions) {
    if (!added.has(role)) {
      entries.push({ role, priority: 2 });
      added.add(role);
    }
  }

  // P3: Primary agent from topic classification
  if (!added.has(primaryAgent)) {
    entries.push({ role: primaryAgent, priority: 3 });
    added.add(primaryAgent);
  }

  // P3: Secondary agents
  for (const role of secondaryAgents) {
    if (!added.has(role)) {
      entries.push({ role, priority: 3 });
      added.add(role);
    }
  }

  return entries.sort((a, b) => a.priority - b.priority);
}

/** A2A follow-up check — preserved from original TurnManager */
function checkFollowUp(response: { role: AgentRole; content: string }): AgentRole | null {
  const content = response.content.toLowerCase();

  if (response.role !== "cfo" && /예산|비용|투자|만원|억원|roi|budget|cost|invest|revenue|financ/i.test(content)) return "cfo";
  if (response.role !== "cmo" && /마케팅|캠페인|고객|브랜드|시장점유|marketing|campaign|customer|brand|market share/i.test(content)) return "cmo";
  if (response.role !== "cto" && /서버|아키텍처|api|개발|인프라|기술 부채|server|architect|develop|infra|tech debt/i.test(content)) return "cto";
  if (response.role !== "clo" && /계약|법적|규제|개인정보|라이선스|contract|legal|regulat|privacy|license|complian/i.test(content)) return "clo";
  if (response.role !== "cdo" && /디자인|ux|사용성|접근성|design|usability|accessib|user experience/i.test(content)) return "cdo";

  return null;
}

/** Build prompt for Voice Live response.create — combines persona + context + input */
function buildAgentPrompt(role: AgentRole, contextStr: string, humanInput: string, agenda: string): string {
  return [
    `You are the ${role.toUpperCase()} agent in a BizRoom meeting.`,
    `Current agenda: ${agenda || "General discussion"}`,
    "",
    "Recent conversation context:",
    contextStr,
    "",
    "Human input to respond to:",
    humanInput,
    "",
    "Respond concisely (max 200 tokens). Focus on your domain expertise.",
  ].join("\n");
}

// Singleton instance
export const turnManager = new TurnManager();
