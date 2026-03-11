import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { invokeAgent } from "../agents/AgentFactory.js";
import { getOrCreateRoom, getContextForAgent, setPhase } from "../orchestrator/ContextBroker.js";
import { v4 as uuidv4 } from "uuid";
import type { Message } from "../models/index.js";

interface MeetingEndRequest {
  roomId: string;
  summary?: string;
}

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

  const roomId = body.roomId ?? "room-default";
  const room = getOrCreateRoom(roomId);
  setPhase(roomId, "closing");

  // Get full conversation context for summary
  const historyContext = getContextForAgent(roomId, "coo");

  let closingMessage: Message | null = null;
  try {
    const cooResponse = await invokeAgent(
      "coo",
      "회의를 종료합니다. 오늘 논의된 내용을 요약하고 액션아이템을 정리해주세요.",
      {
        participants: "Chairman, Hudson (COO), Amelia (CFO), Yusef (CMO)",
        agenda: room.agenda || "회의 종료",
        history: historyContext,
      },
      "summary",
    );

    closingMessage = {
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
    context.log("COO closing failed:", err);
  }

  return {
    status: 200,
    jsonBody: {
      phase: "closing",
      closingMessage,
      decisions: room.decisions,
      actionItems: room.actionItems,
    },
  };
}

app.http("meetingEnd", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "api/meeting/end",
  handler: meetingEnd,
});
