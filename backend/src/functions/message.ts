import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { invokeAgent } from "../agents/AgentFactory.js";
import type { AgentRole, Message } from "../models/index.js";
import { v4 as uuidv4 } from "uuid";

interface MessageRequest {
  content: string;
  roomId: string;
  senderId: string;
  senderName: string;
  mentions?: AgentRole[];
}

// POST /api/message - receive user message, trigger agent responses
export async function message(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log("Message received");

  let body: MessageRequest;
  try {
    body = (await request.json()) as MessageRequest;
  } catch {
    return { status: 400, jsonBody: { error: "Invalid JSON body" } };
  }

  if (!body.content?.trim()) {
    return { status: 400, jsonBody: { error: "Message content is required" } };
  }

  // Build context for agents
  const agentContext = {
    participants:
      "Chairman (\uC0AC\uC6A9\uC790), Hudson (COO), Amelia (CFO), Yusef (CMO)",
    agenda: body.content,
    history: "",
  };

  // Determine which agents should respond
  const agentsToRespond: AgentRole[] = body.mentions?.length
    ? body.mentions
    : ["coo", "cfo", "cmo"];

  // Collect agent responses sequentially (DialogLab turn-taking)
  const responses: Message[] = [];

  for (const role of agentsToRespond) {
    try {
      const agentResponse = await invokeAgent(
        role,
        body.content,
        agentContext,
      );

      const msg: Message = {
        id: uuidv4(),
        roomId: body.roomId ?? "room-default",
        senderId: `agent-${role}`,
        senderType: "agent",
        senderName: agentResponse.name,
        senderRole: role,
        content: agentResponse.content,
        timestamp: new Date().toISOString(),
      };

      responses.push(msg);
    } catch (err) {
      context.log(`Agent ${role} failed:`, err);
    }
  }

  return {
    status: 200,
    jsonBody: { messages: responses },
  };
}

app.http("message", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "api/message",
  handler: message,
});
