// RoomService — Cosmos DB CRUD for meeting rooms
// Container: "rooms" | Partition key: id

import { v4 as uuid } from "uuid";
import {
  createItem,
  readItem,
  upsertItem,
  queryItems,
} from "./CosmosService.js";
import type { RoomDocument } from "../models/index.js";

const CONTAINER = "rooms";
const JOIN_CODE_LENGTH = 6;
const JOIN_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid ambiguity
const DEFAULT_MAX_PARTICIPANTS = 10;

// ── Public API ──────────────────────────────────────────────────────

/**
 * Create a new room with a unique 6-char join code.
 * The creator is automatically added as the "chairman" participant.
 */
export async function createRoom(
  name: string,
  createdBy: string,
  maxParticipants: number = DEFAULT_MAX_PARTICIPANTS,
): Promise<RoomDocument> {
  const joinCode = await generateJoinCode();
  const now = new Date().toISOString();

  const doc: RoomDocument = {
    id: uuid(),
    type: "room",
    name,
    createdBy,
    createdAt: now,
    joinCode,
    maxParticipants,
    isActive: true,
    participants: [
      { userId: createdBy, role: "chairman", joinedAt: now },
    ],
    totalSessions: 0,
  };

  return createItem<RoomDocument>(CONTAINER, doc);
}

/**
 * Retrieve a room by its id.
 * Returns undefined when the document does not exist (404).
 */
export async function getRoomById(
  roomId: string,
): Promise<RoomDocument | undefined> {
  return readItem<RoomDocument>(CONTAINER, roomId, roomId);
}

/**
 * Find an active room by its join code (cross-partition query).
 * Only rooms with isActive=true are returned so expired rooms are excluded.
 */
export async function getRoomByJoinCode(
  code: string,
): Promise<RoomDocument | undefined> {
  const results = await queryItems<RoomDocument>(
    CONTAINER,
    "SELECT * FROM c WHERE c.joinCode = @code AND c.isActive = true",
    [{ name: "@code", value: code.toUpperCase() }],
  );
  return results[0] ?? undefined;
}

/**
 * Add a participant to a room.
 * Throws if the room does not exist, is inactive, is full,
 * or the user has already joined.
 */
export async function joinRoom(
  roomId: string,
  userId: string,
  role: "chairman" | "member" = "member",
): Promise<RoomDocument> {
  const room = await getRoomById(roomId);
  if (!room) {
    throw new Error(`Room not found: ${roomId}`);
  }
  if (!room.isActive) {
    throw new Error(`Room is no longer active: ${roomId}`);
  }
  if (room.participants.length >= room.maxParticipants) {
    throw new Error(`Room is full (max ${room.maxParticipants})`);
  }
  if (room.participants.some((p) => p.userId === userId)) {
    throw new Error(`User ${userId} has already joined room ${roomId}`);
  }

  const updated: RoomDocument = {
    ...room,
    participants: [
      ...room.participants,
      { userId, role, joinedAt: new Date().toISOString() },
    ],
  };
  return upsertItem<RoomDocument>(CONTAINER, updated);
}

/**
 * Link the current active session to a room.
 * Called when a meeting starts so subsequent API calls know which session is live.
 */
export async function updateCurrentSession(
  roomId: string,
  sessionId: string,
): Promise<RoomDocument> {
  const room = await getRoomById(roomId);
  if (!room) {
    throw new Error(`Room not found: ${roomId}`);
  }
  const updated: RoomDocument = {
    ...room,
    currentSessionId: sessionId,
    totalSessions: room.totalSessions + 1,
  };
  return upsertItem<RoomDocument>(CONTAINER, updated);
}

// ── Internal helpers ────────────────────────────────────────────────

/**
 * Generate a random 6-char alphanumeric code and verify it is not
 * already used by an active room. Retries up to 5 times on collision.
 */
export async function generateJoinCode(maxRetries = 5): Promise<string> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let code = "";
    for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
      code += JOIN_CODE_CHARS[Math.floor(Math.random() * JOIN_CODE_CHARS.length)];
    }
    const existing = await getRoomByJoinCode(code);
    if (!existing) return code;
  }
  throw new Error(
    `Failed to generate a unique join code after ${maxRetries} attempts`,
  );
}

// Namespace-style export for consumers that use `RoomService.method()` pattern
export const RoomService = {
  createRoom,
  getRoomById,
  getRoomByJoinCode,
  joinRoom,
  updateCurrentSession,
  generateJoinCode,
} as const;
