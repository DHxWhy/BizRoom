// backend/src/orchestrator/TurnManager.ts
// Event-driven state machine for turn-taking
// Ref: Design Spec §2

import { EventEmitter } from "events";
import type { AgentRole, BufferedMessage, AgentTurn, TurnState, Message, StructuredAgentOutput } from "../models/index.js";
import { classifyTopic, parseMentions } from "./TopicClassifier.js";
import { getContextForAgent, addMessage, getOrCreateRoom } from "./ContextBroker.js";
import {
  CEO_FLUSH_MS,
  MEMBER_FLUSH_MS,
  INTER_AGENT_GAP_MS,
  MAX_AGENTS_PER_TURN,
  MAX_FOLLOW_UP_ROUNDS,
  HUMAN_CALLOUT_TIMEOUT_MS,
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
  combinedInput: string; // cached for triggerNextAgent
  ceoUserId: string | null; // MVP: single mic = ceo
  followUpRound: number; // track A2A follow-up rounds
  agentResponseCount: number; // total agents responded this turn (hard stop at MAX)
  awaitingTimer: ReturnType<typeof setTimeout> | null;
  awaitingGeneration: number;
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

  constructor() {
    super();
    // Multiple rooms × multiple event types can exceed default maxListeners(10)
    this.setMaxListeners(0);
  }

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
        ceoUserId: null,
        followUpRound: 0,
        agentResponseCount: 0,
        awaitingTimer: null,
        awaitingGeneration: 0,
      });
    }
    return this.rooms.get(roomId)!;
  }

  /** Set the CEO userId for a room (call on room creation) */
  setCeo(roomId: string, userId: string): void {
    const room = this.getRoom(roomId);
    room.ceoUserId = userId;
  }

  /** Toggle AI pause — Spec §2.5 */
  setAiPaused(roomId: string, paused: boolean): void {
    const room = this.getRoom(roomId);
    room.aiPaused = paused;
    if (paused && room.state === "speaking") {
      // Cancel current agent and clear queue
      if (room.activeAgent) {
        this.emit("cancelAgent:" + roomId, roomId, room.activeAgent);
      }
      room.agentQueue = [];
      room.activeAgent = null;
      this.transition(roomId, "idle");
    }
  }

  // ── Event Handlers (Spec §2.3) ──

  /** Human started speaking via voice — Spec §2.3 onSpeechStart */
  onSpeechStart(roomId: string, _userId: string): void {
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
        this.emit("cancelAgent:" + roomId, roomId, room.activeAgent);
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

    const isCeo = userId === room.ceoUserId;
    const delay = isCeo ? CEO_FLUSH_MS : MEMBER_FLUSH_MS;
    this.startFlushTimer(roomId, room, delay);
  }

  /** Voice transcription completed — Spec §2.3 onTranscript */
  onTranscript(roomId: string, userId: string, userName: string, text: string): void {
    const room = this.getRoom(roomId);
    if (room.state !== "hearing") return;

    const isCeo = userId === room.ceoUserId;
    room.inputBuffer.push({
      userId,
      userName,
      isCeo,
      source: "voice",
      content: text,
      timestamp: Date.now(),
    });

    // Start flush timer if not already running
    if (!room.flushTimer) {
      const delay = isCeo ? CEO_FLUSH_MS : MEMBER_FLUSH_MS;
      this.startFlushTimer(roomId, room, delay);
    }
  }

  /** Chat message received — Spec §2.3 onChatMessage */
  onChatMessage(
    roomId: string,
    userId: string,
    userName: string,
    text: string,
    isCeo: boolean,
  ): void {
    const room = this.getRoom(roomId);

    if (room.aiPaused) return; // AI paused, ignore

    if (room.state === "idle") {
      this.transition(roomId, "hearing");
    }

    if (room.state === "hearing") {
      room.inputBuffer.push({
        userId,
        userName,
        isCeo,
        source: "chat",
        content: text,
        timestamp: Date.now(),
      });
      const delay = isCeo ? CEO_FLUSH_MS : MEMBER_FLUSH_MS;
      this.startFlushTimer(roomId, room, delay);
    } else if (room.state === "speaking") {
      // Chat during speaking — queue for next turn, do NOT interrupt
      room.inputBuffer.push({
        userId,
        userName,
        isCeo,
        source: "chat",
        content: text,
        timestamp: Date.now(),
      });
    }
  }

  /** CEO requests immediate AI opinion — Spec §2.5 */
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

  /** Agent finished responding — Spec §2.3 onAgentDone
   *  @param skipFollowUp - When true, skip keyword-based checkFollowUp
   *    (use when handleMentionRouting has already processed structured output)
   */
  onAgentDone(roomId: string, agentRole: AgentRole, fullText: string, skipFollowUp = false): void {
    const room = this.getRoom(roomId);
    if (room.state !== "speaking") return;

    // Track total agent responses this turn
    room.agentResponseCount++;

    // Save agent response to ContextBroker
    const agentMessage: Message = {
      id: uuidv4(),
      roomId,
      senderId: `agent-${agentRole}`,
      senderType: "agent",
      senderName: agentRole,
      senderRole: agentRole,
      content: fullText,
      timestamp: new Date().toISOString(),
    };
    addMessage(roomId, agentMessage);

    // HARD STOP for initial agents: limit the first batch from TopicClassifier.
    // Only apply when still in the initial round (followUpRound === 0) so that
    // mention-routed follow-up agents (added by handleMentionRouting before
    // onAgentDone is called) are NOT cleared. Follow-up agents are instead
    // bounded by MAX_FOLLOW_UP_ROUNDS below.
    if (room.agentResponseCount >= MAX_AGENTS_PER_TURN && room.followUpRound === 0 && room.agentQueue.length === 0) {
      room.activeAgent = null;
      this.emit("agentsDone:" + roomId, roomId);
      if (room.inputBuffer.length > 0) {
        this.onFlush(roomId);
      } else {
        this.transition(roomId, "idle");
      }
      return;
    }

    // A2A follow-up check — only if under the hard limit
    if (!skipFollowUp) {
      room.followUpRound++;
      if (room.followUpRound <= MAX_FOLLOW_UP_ROUNDS) {
        const followUpRole = checkFollowUp({ role: agentRole, content: fullText });
        if (
          followUpRole &&
          !room.agentQueue.some((q) => q.role === followUpRole)
        ) {
          room.agentQueue.push({ role: followUpRole, priority: 3 });
        }
      }
    }

    // Next agent or back to IDLE
    if (room.agentQueue.length > 0) {
      setTimeout(() => this.triggerNextAgent(roomId), INTER_AGENT_GAP_MS);
    } else {
      room.activeAgent = null;
      this.emit("agentsDone:" + roomId, roomId);
      if (room.inputBuffer.length > 0) {
        this.onFlush(roomId);
      } else {
        this.transition(roomId, "idle");
      }
    }
  }

  /** Get the combined user input for the current turn (used by visual-intent detection) */
  getCombinedInput(roomId: string): string {
    const room = this.rooms.get(roomId);
    return room?.combinedInput ?? "";
  }

  /** Initialize a room explicitly (for tests and external setup) */
  initRoom(roomId: string, ceoUserId: string): void {
    const room = this.getRoom(roomId);
    room.ceoUserId = ceoUserId;
  }

  /** Enter awaiting state for human callout — Spec §2 */
  enterAwaitingState(
    roomId: string,
    callout: { target: string; intent: string; options?: string[]; fromAgent: AgentRole },
  ): void {
    const room = this.getRoom(roomId);
    if (room.state !== "speaking") return;

    this.transition(roomId, "awaiting");
    room.awaitingGeneration++;

    this.emit("humanCallout:" + roomId, roomId, callout);

    const gen = room.awaitingGeneration;
    room.awaitingTimer = setTimeout(() => {
      if (room.awaitingGeneration !== gen) return;
      if (room.state !== "awaiting") return;
      this.resumeFromAwaiting(roomId, "[대표님이 응답하지 않아 계속 진행합니다]");
    }, HUMAN_CALLOUT_TIMEOUT_MS);
  }

  /** Handle human response during awaiting state */
  onHumanResponse(roomId: string, _userId: string, text: string): void {
    const room = this.getRoom(roomId);
    if (room.state !== "awaiting") return;

    if (room.awaitingTimer) {
      clearTimeout(room.awaitingTimer);
      room.awaitingTimer = null;
    }

    this.clearFlushTimer(room);
    room.inputBuffer = [];

    this.resumeFromAwaiting(roomId, text);
  }

  /** Route based on structured mention output — Spec §3 */
  handleMentionRouting(
    roomId: string,
    output: StructuredAgentOutput,
    fromAgent: AgentRole,
  ): void {
    const room = this.getRoom(roomId);

    if (output.mention) {
      const { target, intent, options } = output.mention;

      if (target === "ceo" || target.startsWith("member:")) {
        this.enterAwaitingState(roomId, { target, intent, options, fromAgent });
        return;
      }

      // Agent-to-agent mention
      const VALID_AGENT_ROLES = new Set<string>(["coo", "cfo", "cmo", "cto", "cdo", "clo"]);
      if (VALID_AGENT_ROLES.has(target)) {
        room.agentQueue.push({ role: target as AgentRole, priority: 1 });
      }
    } else {
      // Fallback: keyword-based checkFollowUp
      const followUp = checkFollowUp({ role: fromAgent, content: output.speech });
      if (followUp) {
        room.agentQueue.push({ role: followUp, priority: 2 });
      }
    }
  }

  private resumeFromAwaiting(roomId: string, responseText: string): void {
    const room = this.getRoom(roomId);
    this.emit("humanResponseReceived:" + roomId, roomId, responseText);

    if (room.agentQueue.length > 0) {
      this.transition(roomId, "speaking");
      this.triggerNextAgent(roomId);
    } else {
      this.transition(roomId, "idle");
    }
  }

  /** Clean up room state */
  destroyRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      this.clearFlushTimer(room);
      if (room.awaitingTimer) {
        clearTimeout(room.awaitingTimer);
        room.awaitingTimer = null;
      }
      this.rooms.delete(roomId);
    }
  }

  // ── Private Methods ──

  private onFlush(roomId: string): void {
    const room = this.getRoom(roomId);
    this.transition(roomId, "routing");

    // 1. Merge buffered messages
    room.combinedInput = room.inputBuffer.map((m) => `[${m.userName}]: ${m.content}`).join("\n");

    // If buffer is empty (e.g., AI opinion with no new input), use last context
    if (!room.combinedInput.trim()) {
      room.combinedInput = "[CEO requested AI opinion on current topic]";
    }

    // 2. Save to ContextBroker FIRST (Spec §2.3 step 3, fix for race condition)
    for (const msg of room.inputBuffer) {
      const message: Message = {
        id: uuidv4(),
        roomId,
        senderId: msg.userId,
        senderType: "human",
        senderName: msg.userName,
        senderRole: msg.isCeo ? "ceo" : "member",
        content: msg.content,
        timestamp: new Date(msg.timestamp).toISOString(),
        isVoiceInput: msg.source === "voice",
      };
      addMessage(roomId, message);
    }

    // 3. Check if user is directly calling Sophia
    const sophiaMention = /소피아|sophia|소피야/i.test(room.combinedInput);
    if (sophiaMention) {
      // Emit sophia-direct event — VoiceLiveOrchestrator handles Sophia routing
      this.emit("sophiaDirect:" + roomId, roomId, room.combinedInput);
      room.inputBuffer = [];
      room.interruptFlag = false;
      room.followUpRound = 0;
      this.transition(roomId, "idle");
      return;
    }

    // 4. Determine agents via TopicClassifier
    const mentions = parseMentions(room.combinedInput);
    const { primaryAgent, secondaryAgents } = classifyTopic(room.combinedInput);
    room.agentQueue = determineAgentOrder(
      room.combinedInput,
      mentions,
      primaryAgent,
      secondaryAgents,
    ).slice(0, MAX_AGENTS_PER_TURN);

    // 4. Clear buffer + reset counters
    room.inputBuffer = [];
    room.interruptFlag = false;
    room.followUpRound = 0;
    room.agentResponseCount = 0;

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
      this.emit("agentsDone:" + roomId, roomId);
      return;
    }

    const next = room.agentQueue.shift()!;
    room.activeAgent = next.role;

    const contextStr = getContextForAgent(roomId, next.role);
    const roomData = getOrCreateRoom(roomId);

    // Build instructions for Voice Live response.create
    const instructions = buildAgentPrompt(
      next.role,
      contextStr,
      room.combinedInput,
      roomData.agenda || "",
    );

    this.emit("triggerAgent:" + roomId, roomId, next.role, instructions);
  }

  private transition(roomId: string, newState: TurnState): void {
    const room = this.getRoom(roomId);
    room.state = newState;
    this.emit("stateChanged:" + roomId, roomId, newState);
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

/** Agent response order — DialogLab priority queue
 *
 * Priority scheme (matches test spec and Design Spec §2):
 *  P1 — COO always leads the room (orchestrator role), UNLESS mentions are
 *        present that do NOT include COO. When COO is explicitly mentioned,
 *        it still receives P1 via the mentions path.
 *  P2 — Explicitly @mentioned agents (parsed from user input)
 *  P3 — Primary topic agent (from TopicClassifier) + secondary agents
 *  P4 — Remaining agents (available as overflow)
 */
export function determineAgentOrder(
  _message: string,
  mentions: AgentRole[],
  primaryAgent: AgentRole,
  secondaryAgents: AgentRole[],
): AgentTurn[] {
  const entries: AgentTurn[] = [];
  const added = new Set<AgentRole>();

  // P1: COO always leads — the room orchestrator speaks first.
  // Exception: when there are explicit mentions that do NOT include COO,
  // the user is directly addressing specific agents and COO should not
  // be forced to the front.
  const hasNonCooMentions = mentions.length > 0 && !mentions.includes("coo");
  if (!hasNonCooMentions) {
    entries.push({ role: "coo", priority: 1 });
    added.add("coo");
  }

  // P2: Explicitly mentioned agents
  for (const role of mentions) {
    if (!added.has(role)) {
      entries.push({ role, priority: 2 });
      added.add(role);
    }
  }

  // P3: Primary topic agent from TopicClassifier
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

  // P4: Remaining agents — available if needed
  const allRoles: AgentRole[] = ["coo", "cfo", "cmo", "cto", "cdo", "clo"];
  for (const role of allRoles) {
    if (!added.has(role)) {
      entries.push({ role, priority: 4 });
      added.add(role);
    }
  }

  return entries.sort((a, b) => a.priority - b.priority);
}

// Negative context patterns — skip A2A when keyword appears in negation
const NEGATION_PATTERN =
  /(?:필요\s*(?:없|않)|하지\s*않|안\s*해도|불필요|제외|빼고|without|no need|not require)/i;

/** Check if a keyword match is negated by nearby context (within same sentence) */
function isNegatedMatch(content: string, keywordMatch: RegExpMatchArray): boolean {
  const matchIndex = keywordMatch.index ?? 0;
  // Extract the sentence containing the match (look back up to 40 chars for negation)
  const windowStart = Math.max(0, matchIndex - 40);
  const window = content.slice(windowStart, matchIndex);
  return NEGATION_PATTERN.test(window);
}

/** A2A follow-up check — only triggers when agent explicitly delegates to another domain.
 *  Requires delegation language (e.g., "확인이 필요", "의견을 듣고 싶", "검토해 주")
 *  alongside domain keywords. Plain keyword mention is NOT enough. */
function checkFollowUp(response: { role: AgentRole; content: string }): AgentRole | null {
  const content = response.content.toLowerCase();

  // Delegation signal — agent must be explicitly requesting another's input.
  // "검토가 필요" (review is needed) is a common Korean delegation phrase —
  // the subject marker "가" was missing from the original pattern.
  const DELEGATION_SIGNAL =
    /확인이?\s*필요|의견을?\s*듣|검토[가해]?\s*(?:필요|주)|부탁|말씀해?\s*주|판단이?\s*필요|여쭤|ask\s+\w+\s+to|need\s+\w+\s+input|what does \w+ think/i;

  if (!DELEGATION_SIGNAL.test(content)) return null;

  const checks: Array<{ exclude: AgentRole; pattern: RegExp; target: AgentRole }> = [
    {
      exclude: "cfo",
      pattern: /예산|비용|투자|roi|budget|cost|invest|revenue|financ/i,
      target: "cfo",
    },
    {
      exclude: "cmo",
      pattern: /마케팅|캠페인|고객|브랜드|시장점유|marketing|campaign|brand|market share/i,
      target: "cmo",
    },
    {
      exclude: "cto",
      pattern: /서버|아키텍처|api|개발|인프라|기술 부채|server|architect|develop|infra|tech debt/i,
      target: "cto",
    },
    {
      exclude: "clo",
      pattern: /계약|법적|규제|개인정보|라이선스|contract|legal|regulat|privacy|license|complian/i,
      target: "clo",
    },
    {
      exclude: "cdo",
      pattern: /디자인|ux|사용성|접근성|design|usability|accessib|user experience/i,
      target: "cdo",
    },
  ];

  for (const { exclude, pattern, target } of checks) {
    if (response.role === exclude) continue;
    const match = pattern.exec(content);
    if (match && !isNegatedMatch(content, match)) return target;
  }

  return null;
}

// Agent voice persona map — compressed persona for Voice Live prompts
const VOICE_PERSONA: Record<AgentRole, { identity: string; style: string; domain: string }> = {
  coo: {
    identity:
      "COO Hudson — 회의의 오케스트레이터이자 실행 전문가. 핵심 가치: 실행이 전략보다 중요하다.",
    style: "정리하겠습니다 / 액션아이템은 / 첫째,둘째 / 시간 언급",
    domain: "회의 진행, 태스크 분배, 실행 계획. 재무/마케팅은 해당 임원에게 위임.",
  },
  cfo: {
    identity:
      "CFO Amelia — 재무 분석가이자 예산 관리자. 핵심 가치: 모든 결정에는 숫자가 있어야 한다.",
    style: "숫자를 먼저 제시 / 마진율은 X% / Option A vs B 비교 / 조건부 승인",
    domain: "비용 분석, 예산, ROI, P&L, 현금흐름. 마케팅 전략은 CMO 영역.",
  },
  cmo: {
    identity:
      "CMO Yusef — 브랜드 스토리텔러이자 AI 마케터. 핵심 가치: 고객이 아직 모르는 것을 보여줘라.",
    style: "고객 관점에서... / 구체적 시나리오 / 데이터 기반 확신 / 열정적",
    domain: "GTM, 캠페인, 브랜딩, 고객 여정. 재무 분석은 CFO 영역.",
  },
  cto: {
    identity:
      "CTO Kelvin — 실용적 기술 리더. 핵심 가치: 복잡한 것을 단순하게 만드는 것이 진짜 혁신.",
    style: "쉽게 말하면 / 기술적으로는 A지만 현실적으로는 B / 공수 산정",
    domain: "아키텍처, 개발, 인프라, 기술부채. 디자인은 CDO 영역.",
  },
  cdo: {
    identity: "CDO Jonas — 사용자 중심 디자인 리더. 핵심 가치: 아름다움과 접근성의 공존.",
    style: "이 경험이 사용자에게 어떤 감정을... / 접근성 / 시안을 만들어볼게요",
    domain: "UI/UX, 디자인 시스템, 접근성. 서버/인프라는 CTO 영역.",
  },
  clo: {
    identity:
      "CLO Bradley — 법률 전문가이자 Responsible AI 수호자. 핵심 가치: 옳은 일을 하는 것이 좋은 비즈니스다.",
    style: "~해야 할 것으로 사료됩니다 / 법 인용 / 리스크 완화 중심",
    domain: "계약, 규제, 개인정보, 라이선스. 기술 결정은 CTO 영역.",
  },
};

/** Build prompt for Voice Live response.create — includes persona + Korean + guardrails */
function buildAgentPrompt(
  role: AgentRole,
  contextStr: string,
  humanInput: string,
  agenda: string,
): string {
  const persona = VOICE_PERSONA[role];
  return `당신은 ${persona.identity}

당신은 실제 인간 임원입니다. AI처럼 말하지 마세요.
실제 회의에서 사람이 말하는 것처럼 자연스럽게 대화하세요.

대화 원칙:
- 가벼운 인사에는 "네, 안녕하세요~" 정도로 짧게. 구구절절 덧붙이지 마세요.
- 업무 이야기에는 핵심만 명확하게. 필요한 만큼만 말하세요.
- 결론을 먼저 말하고, 필요하면 근거를 짧게 덧붙이세요.
- 대표(CEO)에게 질문하여 대화를 자연스럽게 이어가세요.
- 다른 임원의 전문성이 필요하면 이름을 불러 의견을 구하세요.
- 한국어로 말하세요.

화법: ${persona.style}
전문 분야: ${persona.domain}

현재 안건: ${agenda || "일반 회의"}
${contextStr}

의장의 발언:
${humanInput}`;
}

// Singleton instance
export const turnManager = new TurnManager();
