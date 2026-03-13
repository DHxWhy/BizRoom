// UserService — Cosmos DB CRUD for user accounts and brand memory
// Container: "users" | Partition key: id

import { v4 as uuid } from "uuid";
import {
  createItem,
  readItem,
  upsertItem,
  queryItems,
} from "./CosmosService.js";
import type { UserDocument, BrandMemorySet } from "../models/index.js";

const CONTAINER = "users";

/**
 * Register a new user. Returns the created UserDocument.
 * If brandMemory is provided it is persisted together with the user record
 * so the first meeting can reference it without an extra round-trip.
 */
export async function registerUser(
  email: string,
  displayName: string,
  brandMemory?: BrandMemorySet,
): Promise<UserDocument> {
  const doc: UserDocument = {
    id: uuid(),
    type: "user",
    email,
    displayName,
    createdAt: new Date().toISOString(),
    ...(brandMemory ? { brandMemory } : {}),
  };
  return createItem<UserDocument>(CONTAINER, doc);
}

/**
 * Retrieve a user by their id.
 * Returns undefined when the document does not exist (404).
 */
export async function getUser(
  userId: string,
): Promise<UserDocument | undefined> {
  return readItem<UserDocument>(CONTAINER, userId, userId);
}

/**
 * Create or replace the brand memory snapshot on an existing user.
 * Uses Cosmos upsert so partial network failures are idempotent.
 */
export async function updateBrandMemory(
  userId: string,
  brandMemory: BrandMemorySet,
): Promise<UserDocument> {
  const existing = await getUser(userId);
  if (!existing) {
    throw new Error(`User not found: ${userId}`);
  }
  const updated: UserDocument = { ...existing, brandMemory };
  return upsertItem<UserDocument>(CONTAINER, updated);
}

/**
 * Look up a user by email address (cross-partition query).
 * Returns the first match or undefined.
 */
export async function getUserByEmail(
  email: string,
): Promise<UserDocument | undefined> {
  const results = await queryItems<UserDocument>(
    CONTAINER,
    "SELECT * FROM c WHERE c.email = @email",
    [{ name: "@email", value: email }],
  );
  return results[0] ?? undefined;
}

// Namespace-style export for consumers that use `UserService.method()` pattern
export const UserService = {
  registerUser,
  getUser,
  updateBrandMemory,
  getUserByEmail,
} as const;
