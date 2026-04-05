import { v4 as uuid } from "uuid";

import type {
  SessionDocument,
  MeetingMode,
  MeetingPhase,
  BrandMemorySet,
} from "../models/index.js";
import {
  createItem,
  readItem,
  upsertItem,
  queryItems,
} from "./CosmosService.js";

const CONTAINER = "sessions";

/**
 * Create a new meeting session and persist it to Cosmos DB.
 */
export async function createSession(
  roomId: string,
  agenda: string,
  mode: MeetingMode,
  brandMemorySnapshot?: BrandMemorySet,
  participants?: Array<{ userId: string; role: "ceo" | "member" }>,
): Promise<SessionDocument> {
  const doc: SessionDocument = {
    id: uuid(),
    type: "session",
    roomId,
    startedAt: new Date().toISOString(),
    agenda,
    phase: "opening",
    mode,
    brandMemorySnapshot,
    visualizations: [],
    artifactIds: [],
    participants: participants ?? [],
  };
  return createItem<SessionDocument>(CONTAINER, doc);
}

/**
 * Read a single session by id. Partition key is roomId.
 */
export async function getSession(
  sessionId: string,
  roomId: string,
): Promise<SessionDocument | undefined> {
  return readItem<SessionDocument>(CONTAINER, sessionId, roomId);
}

/**
 * Mark a session as ended: set endedAt, duration, optional summary, and phase to "closing".
 */
export async function endSession(
  sessionId: string,
  roomId: string,
  summary?: SessionDocument["summary"],
): Promise<SessionDocument> {
  const existing = await readItem<SessionDocument>(
    CONTAINER,
    sessionId,
    roomId,
  );
  if (!existing) {
    throw new Error(`Session ${sessionId} not found in room ${roomId}`);
  }

  const endedAt = new Date().toISOString();
  const duration = Math.round(
    (new Date(endedAt).getTime() - new Date(existing.startedAt).getTime()) /
      1000,
  );

  const updated: SessionDocument = {
    ...existing,
    endedAt,
    duration,
    phase: "closing",
    ...(summary !== undefined && { summary }),
  };
  return upsertItem<SessionDocument>(CONTAINER, updated);
}

/**
 * List sessions for a given room, ordered by startedAt descending.
 */
export async function listSessionsByRoom(
  roomId: string,
  limit = 20,
  offset = 0,
): Promise<SessionDocument[]> {
  return queryItems<SessionDocument>(
    CONTAINER,
    "SELECT * FROM c WHERE c.roomId = @roomId ORDER BY c.startedAt DESC OFFSET @offset LIMIT @limit",
    [
      { name: "@roomId", value: roomId },
      { name: "@offset", value: offset },
      { name: "@limit", value: limit },
    ],
  );
}

/**
 * Update the meeting phase for a session.
 */
export async function updatePhase(
  sessionId: string,
  roomId: string,
  phase: MeetingPhase,
): Promise<SessionDocument> {
  const existing = await readItem<SessionDocument>(
    CONTAINER,
    sessionId,
    roomId,
  );
  if (!existing) {
    throw new Error(`Session ${sessionId} not found in room ${roomId}`);
  }

  const updated: SessionDocument = { ...existing, phase };
  return upsertItem<SessionDocument>(CONTAINER, updated);
}

/**
 * Append a visualization entry to the session's visualizations array.
 */
export async function addVisualization(
  sessionId: string,
  roomId: string,
  viz: SessionDocument["visualizations"][number],
): Promise<SessionDocument> {
  const existing = await readItem<SessionDocument>(
    CONTAINER,
    sessionId,
    roomId,
  );
  if (!existing) {
    throw new Error(`Session ${sessionId} not found in room ${roomId}`);
  }

  const updated: SessionDocument = {
    ...existing,
    visualizations: [...existing.visualizations, viz],
  };
  return upsertItem<SessionDocument>(CONTAINER, updated);
}

/**
 * Append an artifact id to the session's artifactIds array.
 */
export async function addArtifactId(
  sessionId: string,
  roomId: string,
  artifactId: string,
): Promise<SessionDocument> {
  const existing = await readItem<SessionDocument>(
    CONTAINER,
    sessionId,
    roomId,
  );
  if (!existing) {
    throw new Error(`Session ${sessionId} not found in room ${roomId}`);
  }

  const updated: SessionDocument = {
    ...existing,
    artifactIds: [...existing.artifactIds, artifactId],
  };
  return upsertItem<SessionDocument>(CONTAINER, updated);
}
