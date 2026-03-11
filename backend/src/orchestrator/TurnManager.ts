import type { AgentRole, Message } from "../models/index.js";
import { classifyTopic, parseMentions } from "./TopicClassifier.js";
import {
  getContextForAgent,
  addMessage,
  getOrCreateRoom,
} from "./ContextBroker.js";
import { invokeAgent, type AgentResponse } from "../agents/AgentFactory.js";
import { v4 as uuidv4 } from "uuid";

// Priority levels per DialogLab turn-taking
// P0: Human (always first), P1: COO (orchestrator), P2: Mentioned, P3: Relevant, P4: Others
type Priority = 0 | 1 | 2 | 3 | 4;

interface TurnEntry {
  role: AgentRole;
  priority: Priority;
}

const MAX_FOLLOW_UP_ROUNDS = 2;

/** Determine agent response order based on message context and mentions */
export function determineAgentOrder(
  _message: string,
  mentions: AgentRole[],
  primaryAgent: AgentRole,
  secondaryAgents: AgentRole[],
): TurnEntry[] {
  const entries: TurnEntry[] = [];
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

  // Sort by priority (lower number = higher priority)
  return entries.sort((a, b) => a.priority - b.priority);
}

/** A2A follow-up check: determine if another agent should react to a response */
function checkFollowUp(response: AgentResponse): AgentRole | null {
  const content = response.content.toLowerCase();

  // Financial content -> CFO should verify
  if (
    response.role !== "cfo" &&
    (content.includes("예산") ||
      content.includes("비용") ||
      content.includes("투자") ||
      content.includes("만원") ||
      content.includes("억원") ||
      content.includes("roi"))
  ) {
    return "cfo";
  }

  // Marketing claims -> CMO should comment
  if (
    response.role !== "cmo" &&
    (content.includes("마케팅") ||
      content.includes("캠페인") ||
      content.includes("고객") ||
      content.includes("브랜드") ||
      content.includes("시장점유"))
  ) {
    return "cmo";
  }

  // Tech content -> CTO should verify
  if (
    response.role !== "cto" &&
    (content.includes("서버") ||
      content.includes("아키텍처") ||
      content.includes("api") ||
      content.includes("개발") ||
      content.includes("인프라") ||
      content.includes("기술 부채"))
  ) {
    return "cto";
  }

  // Legal/compliance content -> CLO should verify
  if (
    response.role !== "clo" &&
    (content.includes("계약") ||
      content.includes("법적") ||
      content.includes("규제") ||
      content.includes("개인정보") ||
      content.includes("라이선스"))
  ) {
    return "clo";
  }

  // Design/UX content -> CDO should comment
  if (
    response.role !== "cdo" &&
    (content.includes("디자인") ||
      content.includes("ux") ||
      content.includes("사용성") ||
      content.includes("접근성"))
  ) {
    return "cdo";
  }

  return null;
}

/** Main orchestration: process a user message and generate agent responses */
export async function processMessage(
  roomId: string,
  userMessage: Message,
): Promise<Message[]> {
  const room = getOrCreateRoom(roomId);

  // Store user message in context
  addMessage(roomId, userMessage);

  // Classify topic and parse @mentions
  const mentions = parseMentions(userMessage.content);
  const { primaryAgent, secondaryAgents } = classifyTopic(userMessage.content);

  // Determine agent response order
  const turnOrder = determineAgentOrder(
    userMessage.content,
    mentions,
    primaryAgent,
    secondaryAgents,
  );

  const responses: Message[] = [];
  let followUpRound = 0;

  // Sequential agent responses (DialogLab turn-taking)
  for (const entry of turnOrder) {
    const contextStr = getContextForAgent(roomId, entry.role);

    try {
      const agentResponse = await invokeAgent(entry.role, userMessage.content, {
        participants:
          "Chairman (사용자), Hudson (COO), Amelia (CFO), Yusef (CMO), Kelvin (CTO), Jonas (CDO), Bradley (CLO)",
        agenda: room.agenda || userMessage.content,
        history: contextStr,
      });

      const msg: Message = {
        id: uuidv4(),
        roomId,
        senderId: `agent-${entry.role}`,
        senderType: "agent",
        senderName: agentResponse.name,
        senderRole: entry.role,
        content: agentResponse.content,
        timestamp: new Date().toISOString(),
      };

      responses.push(msg);
      addMessage(roomId, msg);

      // A2A follow-up check
      if (followUpRound < MAX_FOLLOW_UP_ROUNDS) {
        const followUpRole = checkFollowUp(agentResponse);
        if (followUpRole && !turnOrder.some((t) => t.role === followUpRole)) {
          followUpRound++;
          const followUpContext = getContextForAgent(roomId, followUpRole);

          const followUpResponse = await invokeAgent(
            followUpRole,
            `[${agentResponse.name}의 발언에 대한 의견]: ${agentResponse.content}`,
            {
              participants:
                "Chairman (사용자), Hudson (COO), Amelia (CFO), Yusef (CMO), Kelvin (CTO), Jonas (CDO), Bradley (CLO)",
              agenda: room.agenda || userMessage.content,
              history: followUpContext,
            },
          );

          const followUpMsg: Message = {
            id: uuidv4(),
            roomId,
            senderId: `agent-${followUpRole}`,
            senderType: "agent",
            senderName: followUpResponse.name,
            senderRole: followUpRole,
            content: followUpResponse.content,
            timestamp: new Date().toISOString(),
          };

          responses.push(followUpMsg);
          addMessage(roomId, followUpMsg);
        }
      }
    } catch (err: unknown) {
      // Log error but continue with other agents
      console.error(`Agent ${entry.role} failed:`, err);
    }
  }

  return responses;
}
