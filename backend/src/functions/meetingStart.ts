import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { AGENT_CONFIGS } from "../agents/agentConfigs.js";
// invokeAgent no longer needed — Sophia handles opening directly
import {
  getOrCreateRoom,
  setPhase,
  setAgenda,
  addMessage,
  setBrandMemory,
} from "../orchestrator/ContextBroker.js";
import { wireVoiceLiveForRoom } from "../orchestrator/VoiceLiveOrchestrator.js";
import { voiceLiveManager } from "../services/VoiceLiveSessionManager.js";
import { v4 as uuidv4 } from "uuid";
import type { Message, BrandMemorySet } from "../models/index.js";

interface MeetingStartRequest {
  roomId?: string;
  agenda?: string;
  userId: string;
  userName: string;
  brandMemory?: BrandMemorySet;
}

/** Max serialized size for brandMemory payload (10 KB) */
const BRAND_MEMORY_MAX_SIZE = 10_000;

/** Validate brandMemory — returns cleaned object or null */
function validateBrandMemory(bm: unknown): BrandMemorySet | null {
  if (!bm || typeof bm !== "object") return null;
  const b = bm as Record<string, unknown>;
  if (typeof b.companyName !== "string" || !b.companyName.trim()) return null;
  if (typeof b.industry !== "string" || !b.industry.trim()) return null;
  if (typeof b.productName !== "string" || !b.productName.trim()) return null;
  // Guard against oversized payloads
  if (JSON.stringify(bm).length > BRAND_MEMORY_MAX_SIZE) return null;
  return bm as BrandMemorySet;
}

export async function meetingStart(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log("Meeting start request");

  let body: MeetingStartRequest;
  try {
    body = (await request.json()) as MeetingStartRequest;
  } catch {
    return { status: 400, jsonBody: { error: "Invalid JSON body" } };
  }

  const roomId = body.roomId ?? `room-${uuidv4()}`;
  const agenda = body.agenda ?? "일반 회의";

  // Initialize room context
  getOrCreateRoom(roomId);
  setPhase(roomId, "opening");
  setAgenda(roomId, agenda);

  // Store brand memory if provided
  const validBrandMemory = validateBrandMemory(body.brandMemory);
  if (validBrandMemory) {
    setBrandMemory(roomId, validBrandMemory);
  }

  // Initialize Voice Live sessions and wire events
  await voiceLiveManager.initializeRoom(roomId, body.userId);
  wireVoiceLiveForRoom(roomId, body.userId, body.userName);

  const agents = Object.values(AGENT_CONFIGS).map((config) => ({
    id: `agent-${config.role}`,
    name: config.name,
    role: config.role,
    icon: config.icon,
  }));

  // Sophia opens the meeting with a brief announcement
  const sophiaOpening = `안녕하세요, ${body.userName}님. BizRoom 회의를 시작합니다. 오늘 안건은 "${agenda}"입니다. 말씀해 주세요.`;
  const openingMessage: Message = {
    id: uuidv4(),
    roomId,
    senderId: "agent-sophia",
    senderType: "agent",
    senderName: "Sophia",
    senderRole: "sophia" as Message["senderRole"],
    content: sophiaOpening,
    timestamp: new Date().toISOString(),
  };
  addMessage(roomId, openingMessage);

  // Trigger Sophia voice announcement for the opening
  try {
    await voiceLiveManager.triggerSophiaVoice(roomId, sophiaOpening);
  } catch (err) {
    context.log("Sophia opening voice failed:", err);
  }

  return {
    status: 200,
    jsonBody: { roomId, phase: "opening", agents, openingMessage },
  };
}

app.http("meetingStart", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "api/meeting/start",
  handler: meetingStart,
});
