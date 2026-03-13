/**
 * @file api-client.ts
 * @description Direct backend API client for DB verification and setup tests.
 *
 * Wraps Playwright's APIRequestContext to call BizRoom.ai backend endpoints
 * directly, bypassing the UI. Used in Phase 9 (resilience) and Phase 10
 * (Cosmos DB verification) tests.
 *
 * All methods return `{ status, body }` tuples for consistent assertion patterns.
 */

import { APIRequestContext } from "@playwright/test";

/** Backend API base URL — configurable via API_BASE environment variable */
const API_BASE =
  process.env.API_BASE ??
  "https://bizroom-backend-gqfjg4e6bwdvhyfn.centralus-01.azurewebsites.net";

export class ApiClient {
  constructor(private request: APIRequestContext) {}

  // ── Room Endpoints ──────────────────────────────────

  /**
   * Create a new meeting room.
   * @param name - Room display name
   * @param userId - ID of the user creating the room
   * @returns `{ status, body }` — body contains room with id, joinCode, participants
   */
  async createRoom(name: string, userId: string) {
    const res = await this.request.post(`${API_BASE}/api/room/create`, {
      data: { name, userId },
    });
    return { status: res.status(), body: await res.json() };
  }

  /**
   * Join an existing room using a 6-character code.
   * @param code - Room join code (e.g., "ABC123")
   * @param userId - ID of the joining user
   * @returns `{ status, body }` — body contains updated room with participants
   */
  async joinRoomByCode(code: string, userId: string) {
    const res = await this.request.post(`${API_BASE}/api/room/join-by-code`, {
      data: { code, userId },
    });
    return { status: res.status(), body: await res.json() };
  }

  // ── User Endpoints ──────────────────────────────────

  /**
   * Register a new user in the Cosmos DB users container.
   * @param email - User email address
   * @param displayName - User display name
   * @param brandMemory - Optional initial brand memory data
   * @returns `{ status, body }` — body contains user with id, email, displayName
   */
  async registerUser(email: string, displayName: string, brandMemory?: Record<string, string>) {
    const res = await this.request.post(`${API_BASE}/api/user/register`, {
      data: { email, displayName, brandMemory },
    });
    return { status: res.status(), body: await res.json() };
  }

  /**
   * Retrieve a user by their ID.
   * @param userId - Cosmos DB user document ID
   * @returns `{ status, body }` — body contains the full user document
   */
  async getUser(userId: string) {
    const res = await this.request.get(`${API_BASE}/api/user/${userId}`);
    return { status: res.status(), body: await res.json() };
  }

  /**
   * Update a user's brand memory (company context for AI personalization).
   * @param userId - Cosmos DB user document ID
   * @param brandMemory - Key-value pairs of company context
   * @returns `{ status, body }`
   */
  async updateBrandMemory(userId: string, brandMemory: Record<string, string>) {
    const res = await this.request.put(`${API_BASE}/api/user/${userId}/brand-memory`, {
      data: { brandMemory },
    });
    return { status: res.status(), body: await res.json() };
  }

  // ── Meeting Endpoints ───────────────────────────────

  /**
   * Start a meeting in a room — creates a session record in Cosmos DB.
   * Triggers the orchestration pipeline (TurnManager + COO opening message).
   * @param roomId - Room ID to start the meeting in
   * @param userId - User initiating the meeting
   * @param userName - Display name for the meeting chair
   * @param agenda - Meeting topic
   * @param brandMemory - Optional brand context for agent personalization
   * @returns `{ status, body }` — body contains session with sessionId
   */
  async startMeeting(roomId: string, userId: string, userName: string, agenda: string, brandMemory?: Record<string, string>) {
    const res = await this.request.post(`${API_BASE}/api/meeting/start`, {
      data: { roomId, userId, userName, agenda, brandMemory },
    });
    return { status: res.status(), body: await res.json() };
  }

  /**
   * End a meeting — triggers the Sophia artifact pipeline (PPT, Excel, minutes).
   * @param roomId - Room ID of the active meeting
   * @param userId - User ending the meeting
   * @returns `{ status, body }`
   */
  async endMeeting(roomId: string, userId: string) {
    const res = await this.request.post(`${API_BASE}/api/meeting/end`, {
      data: { roomId, userId },
    });
    return { status: res.status(), body: await res.json() };
  }

  // ── Message Endpoint (non-streaming) ────────────────

  /**
   * Send a chat message via REST API (bypasses SignalR).
   * Used for REST fallback testing and direct API verification.
   * @param roomId - Target room ID
   * @param content - Message text content
   * @param senderName - Display name of the sender
   * @returns `{ status, body }`
   */
  async sendMessage(roomId: string, content: string, senderName: string) {
    const res = await this.request.post(`${API_BASE}/api/message`, {
      data: {
        content,
        roomId,
        senderId: "user-1",
        senderName,
      },
    });
    return { status: res.status(), body: await res.json() };
  }

  // ── Session / DB Verification Endpoints ─────────────

  /**
   * List all sessions for a given room.
   * @param roomId - Room ID to query sessions for
   * @returns `{ status, body }` — body is an array of session records
   */
  async listSessions(roomId: string) {
    const res = await this.request.get(`${API_BASE}/api/room/${roomId}/sessions`);
    return { status: res.status(), body: await res.json() };
  }

  /**
   * Get all messages for a specific session.
   * @param sessionId - Session ID to query messages for
   * @returns `{ status, body }` — body is an array of message records
   */
  async getSessionMessages(sessionId: string) {
    const res = await this.request.get(`${API_BASE}/api/session/${sessionId}/messages`);
    return { status: res.status(), body: await res.json() };
  }

  /**
   * Get all artifacts generated for a room.
   * @param roomId - Room ID to query artifacts for
   * @returns `{ status, body }` — body is an array of artifact records
   */
  async getRoomArtifacts(roomId: string) {
    const res = await this.request.get(`${API_BASE}/api/room/${roomId}/artifacts`);
    return { status: res.status(), body: await res.json() };
  }

  // ── SignalR Health Check ────────────────────────────

  /**
   * Call the SignalR negotiate endpoint to verify connection health.
   * @returns `{ status, body }` — 200 indicates SignalR is operational
   */
  async negotiate() {
    const res = await this.request.post(`${API_BASE}/api/negotiate`);
    return { status: res.status(), body: await res.json() };
  }
}
