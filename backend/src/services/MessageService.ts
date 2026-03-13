import { v4 as uuid } from "uuid";

import type { MessageDocument } from "../models/index.js";
import { createItem, queryItems } from "./CosmosService.js";

const CONTAINER = "messages";

/**
 * Persist a message to Cosmos DB. Generates an id automatically.
 */
export async function saveMessage(
  msg: Omit<MessageDocument, "id">,
): Promise<MessageDocument> {
  const doc: MessageDocument = { id: uuid(), ...msg };
  return createItem<MessageDocument>(CONTAINER, doc);
}

/**
 * Retrieve messages for a session, ordered by timestamp ascending.
 */
export async function getMessagesBySession(
  sessionId: string,
  limit = 200,
): Promise<MessageDocument[]> {
  return queryItems<MessageDocument>(
    CONTAINER,
    "SELECT * FROM c WHERE c.sessionId = @sessionId ORDER BY c.timestamp ASC OFFSET 0 LIMIT @limit",
    [
      { name: "@sessionId", value: sessionId },
      { name: "@limit", value: limit },
    ],
  );
}

/**
 * Retrieve DM messages for a session, ordered by timestamp ascending.
 */
export async function getDmHistory(
  sessionId: string,
): Promise<MessageDocument[]> {
  return queryItems<MessageDocument>(
    CONTAINER,
    'SELECT * FROM c WHERE c.sessionId = @sessionId AND c.type = "dm-message" ORDER BY c.timestamp ASC',
    [{ name: "@sessionId", value: sessionId }],
  );
}
