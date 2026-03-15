import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { getOrCreateRoom } from "../orchestrator/ContextBroker.js";

interface RoomJoinRequest {
  roomId: string;
  userId: string;
  userName: string;
}

// POST /api/room/join — add user to room
export async function roomJoin(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log("Room join request");

  let body: RoomJoinRequest;
  try {
    body = (await request.json()) as RoomJoinRequest;
  } catch {
    return { status: 400, jsonBody: { error: "Invalid JSON body" } };
  }

  if (!body.roomId?.trim()) {
    return { status: 400, jsonBody: { error: "roomId is required" } };
  }
  if (!body.userId?.trim()) {
    return { status: 400, jsonBody: { error: "userId is required" } };
  }

  const room = getOrCreateRoom(body.roomId);

  return {
    status: 200,
    jsonBody: {
      roomId: room.roomId,
      phase: room.phase,
      messageCount: room.messages.length,
    },
  };
}

app.http("roomJoin", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "api/room/join",
  handler: roomJoin,
});
