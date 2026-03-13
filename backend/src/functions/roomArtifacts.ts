import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { queryItems } from "../services/CosmosService.js";
import type { ArtifactDocument } from "../models/index.js";

// GET /api/room/{id}/artifacts — list artifacts for a room
export async function roomArtifacts(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log("Room artifacts request");

  const roomId = request.params.id;
  if (!roomId) {
    return { status: 400, jsonBody: { error: "Room ID is required" } };
  }

  try {
    const artifacts = await queryItems<ArtifactDocument>(
      "artifacts",
      "SELECT * FROM c WHERE c.roomId = @roomId ORDER BY c.createdAt DESC",
      [{ name: "@roomId", value: roomId }],
    );
    return { status: 200, jsonBody: { artifacts, roomId } };
  } catch (err: unknown) {
    context.log("Room artifacts query failed:", err);
    return { status: 500, jsonBody: { error: "Failed to list artifacts" } };
  }
}

app.http("roomArtifacts", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "api/room/{id}/artifacts",
  handler: roomArtifacts,
});
