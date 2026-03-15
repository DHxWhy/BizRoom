// backend/src/functions/meeting-chairman.ts
// Chairman control endpoints
// Ref: Design Spec §4.2

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { turnManager } from "../orchestrator/TurnManager.js";
import { setPhase, setAgenda } from "../orchestrator/ContextBroker.js";
import { broadcastEvent } from "../services/SignalRService.js";

/** POST /api/meeting/request-ai-opinion — immediate AI trigger */
async function requestAiOpinion(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  let roomId: string;
  try {
    const body = (await request.json()) as { roomId: string };
    roomId = body.roomId;
  } catch {
    return { status: 400, jsonBody: { error: "Invalid JSON body" } };
  }
  if (!roomId) return { status: 400, jsonBody: { error: "roomId required" } };

  turnManager.requestAiOpinion(roomId);
  return { status: 200, jsonBody: { success: true } };
}

/** POST /api/meeting/next-agenda — phase transition + agenda change */
async function nextAgenda(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  let roomId: string;
  let agenda: string;
  try {
    const body = (await request.json()) as { roomId: string; agenda: string };
    roomId = body.roomId;
    agenda = body.agenda;
  } catch {
    return { status: 400, jsonBody: { error: "Invalid JSON body" } };
  }
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
  let roomId: string;
  let paused: boolean;
  try {
    const body = (await request.json()) as { roomId: string; paused: boolean };
    roomId = body.roomId;
    paused = body.paused;
  } catch {
    return { status: 400, jsonBody: { error: "Invalid JSON body" } };
  }
  if (!roomId) return { status: 400, jsonBody: { error: "roomId required" } };

  turnManager.setAiPaused(roomId, paused);
  return { status: 200, jsonBody: { success: true, paused } };
}

/** Max input length for human response text */
const MAX_TEXT_LENGTH = 2000;
const MAX_ID_LENGTH = 200;

/** POST /api/meeting/human-response — chairman/member callout reply */
async function humanResponse(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  let roomId: string | undefined;
  let userId: string | undefined;
  let text: string | undefined;
  try {
    const body = (await request.json()) as { roomId?: string; userId?: string; text?: string };
    roomId = body.roomId;
    userId = body.userId;
    text = body.text;
  } catch {
    return { status: 400, jsonBody: { error: "Invalid JSON body" } };
  }
  if (!roomId || !userId || !text) {
    return { status: 400, jsonBody: { error: "roomId, userId, text required" } };
  }
  if (text.length > MAX_TEXT_LENGTH || roomId.length > MAX_ID_LENGTH || userId.length > MAX_ID_LENGTH) {
    return { status: 400, jsonBody: { error: "Input exceeds maximum length" } };
  }
  turnManager.onHumanResponse(roomId, userId, text);
  return { status: 200, jsonBody: { success: true } };
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

app.http("humanResponse", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "api/meeting/human-response",
  handler: humanResponse,
});

/** POST /api/meeting/join-member — team member role-based joining */
async function joinMember(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  let roomId: string | undefined;
  let userId: string | undefined;
  let userName: string | undefined;
  let role: string | undefined;
  try {
    const body = (await request.json()) as {
      roomId?: string;
      userId?: string;
      userName?: string;
      role?: string;
    };
    roomId = body.roomId;
    userId = body.userId;
    userName = body.userName;
    role = body.role;
  } catch {
    return { status: 400, jsonBody: { error: "Invalid JSON body" } };
  }

  if (!roomId || !userId || !userName || !role) {
    return { status: 400, jsonBody: { error: "roomId, userId, userName, role required" } };
  }
  if (roomId.length > MAX_ID_LENGTH || userId.length > MAX_ID_LENGTH ||
      userName.length > MAX_ID_LENGTH || role.length > MAX_ID_LENGTH) {
    return { status: 400, jsonBody: { error: "Input exceeds maximum length" } };
  }

  // TODO: Register participant in ContextBroker once participant tracking is implemented
  // Broadcast member joined notification
  broadcastEvent(roomId, {
    type: "phaseChanged",
    payload: { phase: "discussion" },
  });

  return { status: 200, jsonBody: { success: true } };
}

app.http("joinMember", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "api/meeting/join-member",
  handler: joinMember,
});
