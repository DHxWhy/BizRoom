// backend/src/functions/meeting-chairman.ts
// Chairman control endpoints
// Ref: Design Spec §4.2

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { turnManager } from "../orchestrator/TurnManager.js";
import { setPhase, setAgenda } from "../orchestrator/ContextBroker.js";
import { broadcastEvent } from "../services/SignalRService.js";

/** POST /api/meeting/request-ai-opinion — immediate AI trigger */
async function requestAiOpinion(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const { roomId } = (await request.json()) as { roomId: string };
  if (!roomId) return { status: 400, jsonBody: { error: "roomId required" } };

  turnManager.requestAiOpinion(roomId);
  return { status: 200, jsonBody: { success: true } };
}

/** POST /api/meeting/next-agenda — phase transition + agenda change */
async function nextAgenda(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const { roomId, agenda } = (await request.json()) as { roomId: string; agenda: string };
  if (!roomId) return { status: 400, jsonBody: { error: "roomId required" } };

  setAgenda(roomId, agenda || "");
  broadcastEvent(roomId, {
    type: "phaseChanged",
    payload: { phase: "discussion", agendaItem: agenda },
  });
  return { status: 200, jsonBody: { success: true } };
}

/** POST /api/meeting/toggle-ai-pause — pause/resume AI responses */
async function toggleAiPause(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const { roomId, paused } = (await request.json()) as { roomId: string; paused: boolean };
  if (!roomId) return { status: 400, jsonBody: { error: "roomId required" } };

  turnManager.setAiPaused(roomId, paused);
  return { status: 200, jsonBody: { success: true, paused } };
}

app.http("requestAiOpinion", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "api/meeting/request-ai-opinion",
  handler: requestAiOpinion,
});

app.http("nextAgenda", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "api/meeting/next-agenda",
  handler: nextAgenda,
});

app.http("toggleAiPause", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "api/meeting/toggle-ai-pause",
  handler: toggleAiPause,
});
