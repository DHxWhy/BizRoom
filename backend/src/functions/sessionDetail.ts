import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import * as SessionService from "../services/SessionService.js";

// GET /api/session/{id} — get session details (requires roomId query param for partition key)
export async function sessionDetail(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log("Session detail request");

  const sessionId = request.params.id;
  if (!sessionId) {
    return { status: 400, jsonBody: { error: "Session ID is required" } };
  }

  const roomId = request.query.get("roomId");
  if (!roomId) {
    return { status: 400, jsonBody: { error: "roomId query param is required" } };
  }

  try {
    const session = await SessionService.getSession(sessionId, roomId);
    if (!session) {
      return { status: 404, jsonBody: { error: "Session not found" } };
    }
    return { status: 200, jsonBody: session };
  } catch (err: unknown) {
    context.log("Session detail failed:", err);
    return { status: 500, jsonBody: { error: "Failed to get session" } };
  }
}

app.http("sessionDetail", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "api/session/{id}",
  handler: sessionDetail,
});
