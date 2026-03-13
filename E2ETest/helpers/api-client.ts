import { APIRequestContext } from "@playwright/test";

const API_BASE =
  process.env.API_BASE ??
  "https://bizroom-backend-gqfjg4e6bwdvhyfn.centralus-01.azurewebsites.net";

/** Direct backend API calls for DB verification and setup */
export class ApiClient {
  constructor(private request: APIRequestContext) {}

  // ── Room ───────────────────────────────────────────
  async createRoom(name: string, userId: string) {
    const res = await this.request.post(`${API_BASE}/api/room/create`, {
      data: { name, userId },
    });
    return { status: res.status(), body: await res.json() };
  }

  async joinRoomByCode(code: string, userId: string) {
    const res = await this.request.post(`${API_BASE}/api/room/join-by-code`, {
      data: { code, userId },
    });
    return { status: res.status(), body: await res.json() };
  }

  // ── User ───────────────────────────────────────────
  async registerUser(email: string, displayName: string, brandMemory?: Record<string, string>) {
    const res = await this.request.post(`${API_BASE}/api/user/register`, {
      data: { email, displayName, brandMemory },
    });
    return { status: res.status(), body: await res.json() };
  }

  async getUser(userId: string) {
    const res = await this.request.get(`${API_BASE}/api/user/${userId}`);
    return { status: res.status(), body: await res.json() };
  }

  async updateBrandMemory(userId: string, brandMemory: Record<string, string>) {
    const res = await this.request.put(`${API_BASE}/api/user/${userId}/brand-memory`, {
      data: { brandMemory },
    });
    return { status: res.status(), body: await res.json() };
  }

  // ── Meeting ────────────────────────────────────────
  async startMeeting(roomId: string, userId: string, userName: string, agenda: string, brandMemory?: Record<string, string>) {
    const res = await this.request.post(`${API_BASE}/api/meeting/start`, {
      data: { roomId, userId, userName, agenda, brandMemory },
    });
    return { status: res.status(), body: await res.json() };
  }

  async endMeeting(roomId: string, userId: string) {
    const res = await this.request.post(`${API_BASE}/api/meeting/end`, {
      data: { roomId, userId },
    });
    return { status: res.status(), body: await res.json() };
  }

  // ── Message (non-streaming) ────────────────────────
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

  // ── Session / DB Verification ──────────────────────
  async listSessions(roomId: string) {
    const res = await this.request.get(`${API_BASE}/api/room/${roomId}/sessions`);
    return { status: res.status(), body: await res.json() };
  }

  async getSessionMessages(sessionId: string) {
    const res = await this.request.get(`${API_BASE}/api/session/${sessionId}/messages`);
    return { status: res.status(), body: await res.json() };
  }

  async getRoomArtifacts(roomId: string) {
    const res = await this.request.get(`${API_BASE}/api/room/${roomId}/artifacts`);
    return { status: res.status(), body: await res.json() };
  }

  // ── Negotiate (SignalR health check) ───────────────
  async negotiate() {
    const res = await this.request.post(`${API_BASE}/api/negotiate`);
    return { status: res.status(), body: await res.json() };
  }
}
