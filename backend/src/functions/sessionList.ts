import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import * as SessionService from "../services/SessionService.js";

// GET /api/room/{id}/sessions — list sessions for a room
export async function sessionList(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log("Session list request");

  const roomId = request.params.id;
  if (!roomId) {
    return { status: 400, jsonBody: { error: "Room ID is required" } };
  }

  const rawLimit = parseInt(request.query.get("limit") ?? "50", 10);
  const rawOffset = parseInt(request.query.get("offset") ?? "0", 10);
  const limit = isNaN(rawLimit) || rawLimit < 1 ? 50 : Math.min(rawLimit, 200);
  const offset = isNaN(rawOffset) || rawOffset < 0 ? 0 : rawOffset;

  try {
    const sessions = await SessionService.listSessionsByRoom(roomId, limit, offset);
    return { status: 200, jsonBody: { sessions, roomId, limit, offset } };
  } catch (err: unknown) {
    context.log("Session list failed:", err);
    return { status: 500, jsonBody: { error: "Failed to list sessions" } };
  }
}

app.http("sessionList", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "api/room/{id}/sessions",
  handler: sessionList,
});
