import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";

interface RoomLeaveRequest {
  roomId: string;
  userId: string;
}

// POST /api/room/leave — remove user from room
export async function roomLeave(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log("Room leave request");

  let body: RoomLeaveRequest;
  try {
    body = (await request.json()) as RoomLeaveRequest;
  } catch {
    return { status: 400, jsonBody: { error: "Invalid JSON body" } };
  }

  if (!body.roomId?.trim()) {
    return { status: 400, jsonBody: { error: "roomId is required" } };
  }
  if (!body.userId?.trim()) {
    return { status: 400, jsonBody: { error: "userId is required" } };
  }

  // For MVP: just acknowledge the leave
  return {
    status: 200,
    jsonBody: { success: true, roomId: body.roomId },
  };
}

app.http("roomLeave", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "api/room/leave",
  handler: roomLeave,
});
