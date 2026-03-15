import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import * as MessageService from "../services/MessageService.js";

// GET /api/session/{id}/messages — get messages for a session
export async function sessionMessages(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log("Session messages request");

  const sessionId = request.params.id;
  if (!sessionId) {
    return { status: 400, jsonBody: { error: "Session ID is required" } };
  }

  const rawLimit = parseInt(request.query.get("limit") ?? "200", 10);
  const limit = isNaN(rawLimit) || rawLimit < 1 ? 200 : Math.min(rawLimit, 1000);

  try {
    const messages = await MessageService.getMessagesBySession(sessionId, limit);
    return { status: 200, jsonBody: { messages, sessionId, limit } };
  } catch (err: unknown) {
    context.log("Session messages failed:", err);
    return { status: 500, jsonBody: { error: "Failed to get messages" } };
  }
}

app.http("sessionMessages", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "api/session/{id}/messages",
  handler: sessionMessages,
});
