// SignalR message dispatch service
// Wraps SignalR output to send messages to room groups

import type { Message } from "../models/index.js";

// For MVP: in-memory event emitter pattern
// In production: Azure SignalR REST API or output bindings
type MessageHandler = (message: Message) => void;

const handlers: Map<string, Set<MessageHandler>> = new Map();

export function onRoomMessage(
  roomId: string,
  handler: MessageHandler,
): () => void {
  if (!handlers.has(roomId)) {
    handlers.set(roomId, new Set());
  }
  handlers.get(roomId)!.add(handler);

  // Return unsubscribe function
  return () => {
    handlers.get(roomId)?.delete(handler);
  };
}

export function broadcastToRoom(roomId: string, message: Message): void {
  const roomHandlers = handlers.get(roomId);
  if (roomHandlers) {
    for (const handler of roomHandlers) {
      handler(message);
    }
  }
}

// Generic event handler for non-Message payloads (voice streaming events)
type EventHandler = (event: { type: string; payload: unknown }) => void;

const eventHandlers: Map<string, Set<EventHandler>> = new Map();

export function onRoomEvent(
  roomId: string,
  handler: EventHandler,
): () => void {
  if (!eventHandlers.has(roomId)) {
    eventHandlers.set(roomId, new Set());
  }
  eventHandlers.get(roomId)!.add(handler);
  return () => {
    eventHandlers.get(roomId)?.delete(handler);
  };
}

/** Broadcast a generic event to room subscribers (voice streaming, typing, etc.) */
export function broadcastEvent(roomId: string, event: { type: string; payload: unknown }): void {
  const roomEventHandlers = eventHandlers.get(roomId);
  if (roomEventHandlers) {
    for (const handler of roomEventHandlers) {
      handler(event);
    }
  }
}
