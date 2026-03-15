// SignalR message dispatch service
// Wraps Azure SignalR Service REST API to broadcast events to all connected clients
//
// Architecture:
//   broadcastEvent(roomId, event)
//     → Azure SignalR REST API  → all browser SignalR clients
//       (POST /api/v1/hubs/{hub} with JWT auth)
//
// Fallback (no connection string): in-memory handler map for local dev / testing.

import { createHmac } from "node:crypto";
import type { Message } from "../models/index.js";

// ── Azure SignalR connection string parsing ──

const SIGNALR_CONNECTION_STRING =
  process.env.AzureSignalRConnectionString ??
  process.env.AZURE_SIGNALR_CONNECTION_STRING ??
  "";

const HUB_NAME = "default";

interface SignalRConfig {
  endpoint: string;
  accessKey: string;
}

/** Parse Azure SignalR connection string once at module load. Returns null when not configured. */
function parseConnectionString(cs: string): SignalRConfig | null {
  if (!cs) return null;
  const endpointMatch = cs.match(/Endpoint=([^;]+)/i);
  const keyMatch = cs.match(/AccessKey=([^;]+)/i);
  if (!endpointMatch || !keyMatch) return null;
  return {
    endpoint: endpointMatch[1].replace(/\/$/, ""),
    accessKey: keyMatch[1],
  };
}

const signalRConfig = parseConnectionString(SIGNALR_CONNECTION_STRING);

if (signalRConfig) {
  console.log("[SignalR] Azure SignalR Service configured — live broadcast enabled");
} else {
  console.warn("[SignalR] No connection string found — events are in-memory only (local dev mode)");
}

/** Generate a short-lived JWT for the Azure SignalR Service Management REST API. */
function generateManagementToken(config: SignalRConfig, hubName: string): string {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60; // 60-second expiry is sufficient for a single REST call
  // Azure SignalR Management REST API audience = base endpoint (not the full API path)
  const audience = `${config.endpoint}`;

  const b64url = (str: string) => Buffer.from(str).toString("base64url");
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ aud: audience, iat: now, exp }));
  // AccessKey in the connection string is base64-encoded — decode before HMAC (same as negotiate.ts)
  const signature = createHmac("sha256", Buffer.from(config.accessKey, "base64"))
    .update(`${header}.${payload}`)
    .digest("base64url");

  return `${header}.${payload}.${signature}`;
}

/**
 * Push a named event with a payload to ALL connected SignalR clients via the
 * Azure SignalR Service Management REST API.
 *
 * POST {endpoint}/api/v1/hubs/{hub}
 * Body: { "target": "<eventName>", "arguments": [<payload>] }
 * Auth: Bearer <JWT>
 *
 * If no connection string is configured (local dev) the call is skipped and
 * in-memory handlers are invoked instead.
 */
async function sendToSignalR(eventName: string, args: unknown[]): Promise<void> {
  if (!signalRConfig) return; // local dev: in-memory only

  const token = generateManagementToken(signalRConfig, HUB_NAME);
  const url = `${signalRConfig.endpoint}/api/v1/hubs/${HUB_NAME}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ target: eventName, arguments: args }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[SignalR] REST API error ${res.status}: ${body}`);
    }
  } catch (err) {
    console.error("[SignalR] REST API fetch failed:", err);
  }
}

// ── Legacy in-memory message handlers (broadcastToRoom / onRoomMessage) ──
// Kept for backward compatibility with any code that still uses them.

type MessageHandler = (message: Message) => void;
const handlers: Map<string, Set<MessageHandler>> = new Map();

export function onRoomMessage(roomId: string, handler: MessageHandler): () => void {
  if (!handlers.has(roomId)) handlers.set(roomId, new Set());
  handlers.get(roomId)!.add(handler);
  return () => handlers.get(roomId)?.delete(handler);
}

export function broadcastToRoom(roomId: string, message: Message): void {
  const roomHandlers = handlers.get(roomId);
  if (roomHandlers) {
    for (const handler of roomHandlers) handler(message);
  }
}

// ── Typed event broadcasting (VoiceLiveOrchestrator, meetingEnd, etc.) ──

import type { MeetingBroadcastEvent } from "../models/index.js";
type EventHandler = (event: MeetingBroadcastEvent) => void;

// In-memory handlers: used when no Azure SignalR is configured (local dev / tests).
const eventHandlers: Map<string, Set<EventHandler>> = new Map();

export function onRoomEvent(roomId: string, handler: EventHandler): () => void {
  if (!eventHandlers.has(roomId)) eventHandlers.set(roomId, new Set());
  eventHandlers.get(roomId)!.add(handler);
  return () => eventHandlers.get(roomId)?.delete(handler);
}

/**
 * Resolve the `arguments` array for the Azure SignalR REST API payload.
 *
 * Most events: arguments = [payload]  →  frontend handler: (payload) => ...
 *
 * "agentTyping" is the exception: the legacy frontend handler was registered as
 *   connection.on("agentTyping", (agentName: string, isTyping: boolean) => ...)
 * so it expects TWO positional arguments, not a single object.
 */
function resolveSignalRArguments(event: MeetingBroadcastEvent): unknown[] {
  if (event.type === "agentTyping") {
    // Unpack payload fields into positional args to match frontend handler signature
    const { agentName, isTyping } = event.payload as { agentName: string; isTyping: boolean };
    return [agentName, isTyping];
  }
  return [event.payload];
}

/**
 * Broadcast a typed meeting event.
 *
 * When Azure SignalR is configured: sends via REST API so all browser clients
 * connected to the hub receive it as a named SignalR message.
 *
 * When not configured (local dev): dispatches to in-memory handlers only.
 *
 * The SignalR client (useSignalR.ts) registers listeners with:
 *   connection.on(event.type, callback)
 * so `target` must equal `event.type` and `arguments` must match the handler signature.
 */
export function broadcastEvent(roomId: string, event: MeetingBroadcastEvent): void {
  // Always dispatch to in-memory handlers (for local dev and server-side tests)
  const roomEventHandlers = eventHandlers.get(roomId);
  if (roomEventHandlers) {
    for (const handler of roomEventHandlers) handler(event);
  }

  // Push to Azure SignalR Service (fire-and-forget — errors logged but not thrown)
  const args = resolveSignalRArguments(event);
  void sendToSignalR(event.type, args);
}
