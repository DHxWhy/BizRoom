import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { RoomService } from "../services/RoomService.js";

interface RoomCreateRequest {
  name: string;
  userId: string;
  maxParticipants?: number;
}

// POST /api/room/create — create a new room
export async function roomCreate(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log("Room create request");

  let body: RoomCreateRequest;
  try {
    body = (await request.json()) as RoomCreateRequest;
  } catch {
    return { status: 400, jsonBody: { error: "Invalid JSON body" } };
  }

  if (!body.name?.trim() || !body.userId?.trim()) {
    return {
      status: 400,
      jsonBody: { error: "name and userId are required" },
    };
  }

  try {
    const room = await RoomService.createRoom(
      body.name,
      body.userId,
      body.maxParticipants,
    );
    return { status: 201, jsonBody: room };
  } catch (err: unknown) {
    context.log("Room creation failed:", err);
    return { status: 500, jsonBody: { error: "Failed to create room" } };
  }
}

app.http("roomCreate", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "api/room/create",
  handler: roomCreate,
});
