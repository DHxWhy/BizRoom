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
