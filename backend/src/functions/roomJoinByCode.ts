import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { RoomService } from "../services/RoomService.js";

interface JoinByCodeRequest {
  code: string;
  userId: string;
}

// POST /api/room/join-by-code — join a room using its invite code
export async function roomJoinByCode(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log("Room join-by-code request");

  let body: JoinByCodeRequest;
  try {
    body = (await request.json()) as JoinByCodeRequest;
  } catch {
    return { status: 400, jsonBody: { error: "Invalid JSON body" } };
  }

  if (!body.code?.trim() || !body.userId?.trim()) {
    return {
      status: 400,
      jsonBody: { error: "code and userId are required" },
    };
  }

  try {
    const room = await RoomService.getRoomByJoinCode(body.code);
    if (!room) {
      return { status: 404, jsonBody: { error: "Invalid or expired join code" } };
    }

    const updated = await RoomService.joinRoom(room.id, body.userId);
    return { status: 200, jsonBody: updated };
  } catch (err: unknown) {
    context.log("Room join-by-code failed:", err);
    return { status: 500, jsonBody: { error: "Failed to join room" } };
  }
}

app.http("roomJoinByCode", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "api/room/join-by-code",
  handler: roomJoinByCode,
});
