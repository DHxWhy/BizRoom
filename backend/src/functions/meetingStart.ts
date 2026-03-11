import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { AGENT_CONFIGS } from "../agents/agentConfigs.js";
import { invokeAgent } from "../agents/AgentFactory.js";
import { v4 as uuidv4 } from "uuid";
import type { Message } from "../models/index.js";

interface MeetingStartRequest {
  roomId?: string;
  agenda?: string;
  userId: string;
  userName: string;
}

// POST /api/meeting/start - initialize meeting session
export async function meetingStart(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log("Meeting start request");

  let body: MeetingStartRequest;
  try {
    body = (await request.json()) as MeetingStartRequest;
  } catch {
    return { status: 400, jsonBody: { error: "Invalid JSON body" } };
  }

  const roomId = body.roomId ?? `room-${uuidv4()}`;
  const agenda = body.agenda ?? "\uC77C\uBC18 \uD68C\uC758";

  // Get agent list
  const agents = Object.values(AGENT_CONFIGS).map((config) => ({
    id: `agent-${config.role}`,
    name: config.name,
    role: config.role,
    icon: config.icon,
  }));

  // COO Hudson opens the meeting
  let openingMessage: Message | null = null;
  try {
    const cooResponse = await invokeAgent(
      "coo",
      `\uD68C\uC758\uB97C \uC2DC\uC791\uD569\uB2C8\uB2E4. \uC624\uB298\uC758 \uC548\uAC74: ${agenda}`,
      {
        participants: `${body.userName} (Chairman), Hudson (COO), Amelia (CFO), Yusef (CMO)`,
        agenda,
        history: "",
      },
    );

    openingMessage = {
      id: uuidv4(),
      roomId,
      senderId: "agent-coo",
      senderType: "agent",
      senderName: cooResponse.name,
      senderRole: "coo",
      content: cooResponse.content,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    context.log("COO opening failed:", err);
  }

  return {
    status: 200,
    jsonBody: {
      roomId,
      phase: "opening",
      agents,
      openingMessage,
    },
  };
}

app.http("meetingStart", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "api/meeting/start",
  handler: meetingStart,
});
