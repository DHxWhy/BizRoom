import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { invokeAgent } from "../agents/AgentFactory.js";
import { v4 as uuidv4 } from "uuid";
import type { Message } from "../models/index.js";

interface MeetingEndRequest {
  roomId: string;
  summary?: string;
}

// POST /api/meeting/end - finalize meeting, generate summary
export async function meetingEnd(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log("Meeting end request");

  let body: MeetingEndRequest;
  try {
    body = (await request.json()) as MeetingEndRequest;
  } catch {
    return { status: 400, jsonBody: { error: "Invalid JSON body" } };
  }

  // COO Hudson closes the meeting with summary
  let closingMessage: Message | null = null;
  try {
    const cooResponse = await invokeAgent(
      "coo",
      "\uD68C\uC758\uB97C \uC885\uB8CC\uD569\uB2C8\uB2E4. \uC624\uB298 \uB17C\uC758\uB41C \uB0B4\uC6A9\uC744 \uC694\uC57D\uD558\uACE0 \uC561\uC158\uC544\uC774\uD15C\uC744 \uC815\uB9AC\uD574\uC8FC\uC138\uC694.",
      {
        participants:
          "Chairman, Hudson (COO), Amelia (CFO), Yusef (CMO)",
        agenda: body.summary ?? "\uD68C\uC758 \uC885\uB8CC",
        history: "",
      },
      "summary",
    );

    closingMessage = {
      id: uuidv4(),
      roomId: body.roomId,
      senderId: "agent-coo",
      senderType: "agent",
      senderName: cooResponse.name,
      senderRole: "coo",
      content: cooResponse.content,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    context.log("COO closing failed:", err);
  }

  return {
    status: 200,
    jsonBody: {
      phase: "closing",
      closingMessage,
      decisions: [],
      actionItems: [],
    },
  };
}

app.http("meetingEnd", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "api/meeting/end",
  handler: meetingEnd,
});
