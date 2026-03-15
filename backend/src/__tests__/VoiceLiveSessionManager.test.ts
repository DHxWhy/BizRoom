// VoiceLiveSessionManager tests
// Verifies: WebSocket URL/auth, input[] format for OpenAI, transcript buffer accumulation,
// and fallback behaviour — without live network connections.
//
// Strategy: mock the 'ws' module so WebSocket constructors capture calls without
// opening real connections. An EventEmitter-based fake WebSocket simulates the
// open/message/close lifecycle.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";

// ── Fake WebSocket ─────────────────────────────────────────────────────────

type WsOptions = { headers?: Record<string, string> };

/** Captures all ws.send() calls as parsed JSON objects for assertion. */
class FakeWebSocket extends EventEmitter {
  static lastCreated: FakeWebSocket | null = null;
  static allCreated: FakeWebSocket[] = [];

  readonly url: string;
  readonly options: WsOptions;
  readonly sentMessages: unknown[] = [];
  readyState: number = 1; // OPEN

  static OPEN = 1;
  static CLOSED = 3;

  constructor(url: string, options: WsOptions = {}) {
    super();
    this.url = url;
    this.options = options;
    FakeWebSocket.lastCreated = this;
    FakeWebSocket.allCreated.push(this);
    // Auto-open: simulates successful connection on next tick
    setImmediate(() => this.emit("open"));
  }

  send(data: string): void {
    try {
      this.sentMessages.push(JSON.parse(data));
    } catch {
      this.sentMessages.push(data);
    }
  }

  ping(): void {
    /* no-op for heartbeat */
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close");
  }

  static reset(): void {
    FakeWebSocket.lastCreated = null;
    FakeWebSocket.allCreated = [];
  }
}

// ── Module mock ────────────────────────────────────────────────────────────
// We mock the 'ws' package so VoiceLiveSessionManager uses FakeWebSocket.

vi.mock("ws", () => {
  return { default: FakeWebSocket };
});

// ── Shared helpers ─────────────────────────────────────────────────────────

/** Wait for setImmediate queue to flush (allows FakeWebSocket "open" to fire). */
function flushImmediate(): Promise<void> {
  return new Promise((r) => setImmediate(r));
}

// ── Test Suite: createWebSocket URL and auth ───────────────────────────────

describe("VoiceLiveSessionManager — createWebSocket (OpenAI fallback)", () => {
  beforeEach(() => {
    // Ensure USE_AZURE is false: no AZURE_VOICE_LIVE_ENDPOINT
    vi.stubEnv("AZURE_VOICE_LIVE_ENDPOINT", "");
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    vi.stubEnv("OPENAI_MODEL_REALTIME", "gpt-4o-realtime-preview");
    FakeWebSocket.reset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    FakeWebSocket.reset();
  });

  it("uses OpenAI Realtime wss URL when USE_AZURE is false", async () => {
    // Dynamic import ensures env stubs are read at module load time
    const { VoiceLiveSessionManager } = await import("../services/VoiceLiveSessionManager.js");
    const mgr = new VoiceLiveSessionManager();

    await mgr.initializeRoom("room-openai-url", "user-1");
    await flushImmediate();

    const ws = FakeWebSocket.allCreated[0];
    expect(ws).toBeDefined();
    expect(ws.url).toContain("wss://api.openai.com/v1/realtime");
  });

  it("sets Authorization Bearer header (not api-key) when OpenAI path is used", async () => {
    const { VoiceLiveSessionManager } = await import("../services/VoiceLiveSessionManager.js");
    const mgr = new VoiceLiveSessionManager();

    await mgr.initializeRoom("room-openai-auth", "user-1");
    await flushImmediate();

    const ws = FakeWebSocket.allCreated[0];
    expect(ws.options.headers).toBeDefined();
    expect(ws.options.headers!["Authorization"]).toBe("Bearer test-openai-key");
    expect(ws.options.headers!["api-key"]).toBeUndefined();
  });

  it("sets OpenAI-Beta header for Realtime API handshake", async () => {
    const { VoiceLiveSessionManager } = await import("../services/VoiceLiveSessionManager.js");
    const mgr = new VoiceLiveSessionManager();

    await mgr.initializeRoom("room-openai-beta", "user-1");
    await flushImmediate();

    const ws = FakeWebSocket.allCreated[0];
    expect(ws.options.headers!["OpenAI-Beta"]).toBe("realtime=v1");
  });
});

// ── Test Suite: triggerAgentResponse input[] format ───────────────────────

describe("VoiceLiveSessionManager — triggerAgentResponse (OpenAI format)", () => {
  beforeEach(() => {
    vi.stubEnv("AZURE_VOICE_LIVE_ENDPOINT", "");
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    FakeWebSocket.reset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    FakeWebSocket.reset();
  });

  it("sends response.create with input[] array (NOT top-level instructions) when USE_AZURE=false", async () => {
    const { VoiceLiveSessionManager } = await import("../services/VoiceLiveSessionManager.js");
    const mgr = new VoiceLiveSessionManager();

    // Initialize the room so session map entry exists
    await mgr.initializeRoom("room-agent-format", "user-1");
    await flushImmediate(); // listener open fires

    // Trigger agent response — this creates a lazy agent session
    await mgr.triggerAgentResponse("room-agent-format", "coo", "Discuss the budget.");
    await flushImmediate(); // agent ws open fires

    // Find the agent WebSocket (second created, after the listener)
    const agentWs = FakeWebSocket.allCreated.find((ws) =>
      ws.sentMessages.some(
        (m) =>
          typeof m === "object" &&
          m !== null &&
          (m as Record<string, unknown>).type === "response.create",
      ),
    );

    expect(agentWs).toBeDefined();

    const responseCreate = agentWs!.sentMessages.find(
      (m) =>
        typeof m === "object" &&
        m !== null &&
        (m as Record<string, unknown>).type === "response.create",
    ) as Record<string, unknown>;

    expect(responseCreate).toBeDefined();

    const response = responseCreate.response as Record<string, unknown>;

    // Must have input[] array, NOT a top-level instructions field
    expect(response).toHaveProperty("input");
    expect(Array.isArray(response.input)).toBe(true);
    expect(response.instructions).toBeUndefined();
  });

  it("input[] contains a system message with the provided instructions text", async () => {
    const { VoiceLiveSessionManager } = await import("../services/VoiceLiveSessionManager.js");
    const mgr = new VoiceLiveSessionManager();

    const instructions = "You are the COO. Discuss Q3 budget.";
    await mgr.initializeRoom("room-agent-input", "user-1");
    await flushImmediate();

    await mgr.triggerAgentResponse("room-agent-input", "cfo", instructions);
    await flushImmediate();

    const agentWs = FakeWebSocket.allCreated.find((ws) =>
      ws.sentMessages.some(
        (m) =>
          typeof m === "object" &&
          m !== null &&
          (m as Record<string, unknown>).type === "response.create",
      ),
    );

    const responseCreate = agentWs!.sentMessages.find(
      (m) =>
        typeof m === "object" &&
        m !== null &&
        (m as Record<string, unknown>).type === "response.create",
    ) as Record<string, unknown>;

    const response = responseCreate.response as Record<string, unknown>;
    const input = response.input as Array<Record<string, unknown>>;

    // First message must be role: system
    expect(input[0].role).toBe("system");

    // Content array must contain the instructions as input_text
    const content = input[0].content as Array<Record<string, unknown>>;
    const textItem = content.find((c) => c.type === "input_text");
    expect(textItem).toBeDefined();
    expect(textItem!.text).toBe(instructions);
  });

  it("response.create sets conversation: 'none'", async () => {
    const { VoiceLiveSessionManager } = await import("../services/VoiceLiveSessionManager.js");
    const mgr = new VoiceLiveSessionManager();

    await mgr.initializeRoom("room-conv-none", "user-1");
    await flushImmediate();

    await mgr.triggerAgentResponse("room-conv-none", "cmo", "Marketing pitch.");
    await flushImmediate();

    const agentWs = FakeWebSocket.allCreated.find((ws) =>
      ws.sentMessages.some(
        (m) =>
          typeof m === "object" &&
          m !== null &&
          (m as Record<string, unknown>).type === "response.create",
      ),
    );

    const responseCreate = agentWs!.sentMessages.find(
      (m) =>
        typeof m === "object" &&
        m !== null &&
        (m as Record<string, unknown>).type === "response.create",
    ) as Record<string, unknown>;

    const response = responseCreate.response as Record<string, unknown>;
    expect(response.conversation).toBe("none");
  });

  it("modalities includes both audio and text", async () => {
    const { VoiceLiveSessionManager } = await import("../services/VoiceLiveSessionManager.js");
    const mgr = new VoiceLiveSessionManager();

    await mgr.initializeRoom("room-modalities", "user-1");
    await flushImmediate();

    await mgr.triggerAgentResponse("room-modalities", "cfo", "Budget review.");
    await flushImmediate();

    const agentWs = FakeWebSocket.allCreated.find((ws) =>
      ws.sentMessages.some(
        (m) =>
          typeof m === "object" &&
          m !== null &&
          (m as Record<string, unknown>).type === "response.create",
      ),
    );

    const responseCreate = agentWs!.sentMessages.find(
      (m) =>
        typeof m === "object" &&
        m !== null &&
        (m as Record<string, unknown>).type === "response.create",
    ) as Record<string, unknown>;

    const response = responseCreate.response as Record<string, unknown>;
    expect(response.modalities).toContain("audio");
    expect(response.modalities).toContain("text");
  });
});

// ── Test Suite: triggerSophiaVoice input[] format ─────────────────────────

describe("VoiceLiveSessionManager — triggerSophiaVoice (OpenAI format)", () => {
  beforeEach(() => {
    vi.stubEnv("AZURE_VOICE_LIVE_ENDPOINT", "");
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    FakeWebSocket.reset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    FakeWebSocket.reset();
  });

  it("sends response.create with input[] array for Sophia when USE_AZURE=false", async () => {
    const { VoiceLiveSessionManager } = await import("../services/VoiceLiveSessionManager.js");
    const mgr = new VoiceLiveSessionManager();

    await mgr.initializeRoom("room-sophia-format", "user-1");
    await flushImmediate();

    await mgr.triggerSophiaVoice("room-sophia-format", "회의를 시작합니다");
    await flushImmediate();

    // Find the WebSocket that sent a response.create (Sophia session)
    const sophiaWs = FakeWebSocket.allCreated.find((ws) =>
      ws.sentMessages.some(
        (m) =>
          typeof m === "object" &&
          m !== null &&
          (m as Record<string, unknown>).type === "response.create",
      ),
    );

    expect(sophiaWs).toBeDefined();

    const responseCreate = sophiaWs!.sentMessages.find(
      (m) =>
        typeof m === "object" &&
        m !== null &&
        (m as Record<string, unknown>).type === "response.create",
    ) as Record<string, unknown>;

    const response = responseCreate.response as Record<string, unknown>;

    // Must use input[] array format, not top-level instructions
    expect(response).toHaveProperty("input");
    expect(Array.isArray(response.input)).toBe(true);
    expect(response.instructions).toBeUndefined();
  });

  it("Sophia input[] contains system message with Korean instruction text", async () => {
    const { VoiceLiveSessionManager } = await import("../services/VoiceLiveSessionManager.js");
    const mgr = new VoiceLiveSessionManager();
    const announcementText = "회의를 시작합니다";

    await mgr.initializeRoom("room-sophia-content", "user-1");
    await flushImmediate();

    await mgr.triggerSophiaVoice("room-sophia-content", announcementText);
    await flushImmediate();

    const sophiaWs = FakeWebSocket.allCreated.find((ws) =>
      ws.sentMessages.some(
        (m) =>
          typeof m === "object" &&
          m !== null &&
          (m as Record<string, unknown>).type === "response.create",
      ),
    );

    const responseCreate = sophiaWs!.sentMessages.find(
      (m) =>
        typeof m === "object" &&
        m !== null &&
        (m as Record<string, unknown>).type === "response.create",
    ) as Record<string, unknown>;

    const response = responseCreate.response as Record<string, unknown>;
    const input = response.input as Array<Record<string, unknown>>;
    const content = input[0].content as Array<Record<string, unknown>>;
    const textItem = content.find((c) => c.type === "input_text");

    // The instruction text must contain the announcement (embedded in the Sophia prompt)
    expect(textItem!.text as string).toContain(announcementText);
  });

  it("Sophia session sends response.cancel before response.create to avoid race condition", async () => {
    const { VoiceLiveSessionManager } = await import("../services/VoiceLiveSessionManager.js");
    const mgr = new VoiceLiveSessionManager();

    await mgr.initializeRoom("room-sophia-cancel", "user-1");
    await flushImmediate();

    await mgr.triggerSophiaVoice("room-sophia-cancel", "테스트");
    await flushImmediate();

    const sophiaWs = FakeWebSocket.allCreated.find((ws) =>
      ws.sentMessages.some(
        (m) =>
          typeof m === "object" &&
          m !== null &&
          (m as Record<string, unknown>).type === "response.cancel",
      ),
    );

    expect(sophiaWs).toBeDefined();

    const types = sophiaWs!.sentMessages
      .filter((m) => typeof m === "object" && m !== null)
      .map((m) => (m as Record<string, unknown>).type);

    // response.cancel must appear before response.create
    const cancelIdx = types.indexOf("response.cancel");
    const createIdx = types.indexOf("response.create");
    expect(cancelIdx).toBeGreaterThanOrEqual(0);
    expect(createIdx).toBeGreaterThan(cancelIdx);
  });
});

// ── Helper: find the agent WebSocket (not the listener) ──────────────────
//
// Both the Listener session and Agent sessions send `session.update`, so we
// cannot use that message type alone to distinguish them.
//
// Distinguisher: agent sessions include `modalities: ["audio", "text"]` in
// their session.update, while the listener only requests `modalities: ["text"]`.
//
// We also accept the second positional approach: after initializeRoom() the
// listener is allCreated[0]; after triggerAgentResponse() the agent is the
// last entry in allCreated that sent an audio-modality session.update.

function findAgentWs(): FakeWebSocket {
  const ws = FakeWebSocket.allCreated.find((w) =>
    w.sentMessages.some((m) => {
      if (typeof m !== "object" || m === null) return false;
      const msg = m as Record<string, unknown>;
      if (msg.type !== "session.update") return false;
      const session = msg.session as Record<string, unknown> | undefined;
      const modalities = session?.modalities as string[] | undefined;
      return Array.isArray(modalities) && modalities.includes("audio");
    }),
  );
  if (!ws) throw new Error("No agent WebSocket found — did you call triggerAgentResponse first?");
  return ws;
}

// ── Test Suite: transcriptBuffers accumulation and fallback ───────────────

describe("VoiceLiveSessionManager — transcriptBuffers", () => {
  beforeEach(() => {
    vi.stubEnv("AZURE_VOICE_LIVE_ENDPOINT", "");
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    FakeWebSocket.reset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    FakeWebSocket.reset();
  });

  it("emits agentDone with accumulated transcript when response.done output is empty", async () => {
    const { VoiceLiveSessionManager } = await import("../services/VoiceLiveSessionManager.js");
    const mgr = new VoiceLiveSessionManager();
    const roomId = "room-buffer-fallback";

    await mgr.initializeRoom(roomId, "user-1");
    await flushImmediate();

    // Trigger agent session creation
    await mgr.triggerAgentResponse(roomId, "coo", "Budget review.");
    await flushImmediate();

    // Find the agent WebSocket — it sends session.update with audio modality
    const agentWs = findAgentWs();
    expect(agentWs).toBeDefined();

    const doneResults: string[] = [];
    mgr.on(`agentDone:${roomId}`, (_rid: string, _role: string, text: string) => {
      doneResults.push(text);
    });

    // Simulate two streaming transcript delta events
    agentWs.emit(
      "message",
      Buffer.from(
        JSON.stringify({ type: "response.audio_transcript.delta", delta: "Hello " }),
      ),
    );
    agentWs.emit(
      "message",
      Buffer.from(
        JSON.stringify({ type: "response.audio_transcript.delta", delta: "World." }),
      ),
    );

    // Simulate response.done with an empty output array (triggers buffer fallback)
    agentWs.emit(
      "message",
      Buffer.from(JSON.stringify({ type: "response.done", response: { output: [] } })),
    );

    expect(doneResults).toHaveLength(1);
    expect(doneResults[0]).toBe("Hello World.");
  });

  it("emits agentDone with output transcript when response.done output is populated", async () => {
    const { VoiceLiveSessionManager } = await import("../services/VoiceLiveSessionManager.js");
    const mgr = new VoiceLiveSessionManager();
    const roomId = "room-buffer-primary";

    await mgr.initializeRoom(roomId, "user-1");
    await flushImmediate();

    await mgr.triggerAgentResponse(roomId, "cfo", "Review Q3.");
    await flushImmediate();

    const agentWs = findAgentWs();

    const doneResults: string[] = [];
    mgr.on(`agentDone:${roomId}`, (_rid: string, _role: string, text: string) => {
      doneResults.push(text);
    });

    // Simulate some delta buffering
    agentWs.emit(
      "message",
      Buffer.from(
        JSON.stringify({ type: "response.audio_transcript.delta", delta: "stale delta" }),
      ),
    );

    // response.done with populated output — should use output, ignore buffer
    agentWs.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          type: "response.done",
          response: {
            output: [
              {
                type: "message",
                content: [{ type: "audio", transcript: "Primary transcript text." }],
              },
            ],
          },
        }),
      ),
    );

    expect(doneResults).toHaveLength(1);
    expect(doneResults[0]).toBe("Primary transcript text.");
  });

  it("resets transcript buffer to empty after response.done fires", async () => {
    const { VoiceLiveSessionManager } = await import("../services/VoiceLiveSessionManager.js");
    const mgr = new VoiceLiveSessionManager();
    const roomId = "room-buffer-reset";

    await mgr.initializeRoom(roomId, "user-1");
    await flushImmediate();

    await mgr.triggerAgentResponse(roomId, "cmo", "Marketing review.");
    await flushImmediate();

    const agentWs = findAgentWs();

    const doneResults: string[] = [];
    mgr.on(`agentDone:${roomId}`, (_rid: string, _role: string, text: string) => {
      doneResults.push(text);
    });

    // First response
    agentWs.emit(
      "message",
      Buffer.from(
        JSON.stringify({ type: "response.audio_transcript.delta", delta: "First response." }),
      ),
    );
    agentWs.emit(
      "message",
      Buffer.from(JSON.stringify({ type: "response.done", response: { output: [] } })),
    );

    // Second response — buffer should be clean (no leftover from first)
    agentWs.emit(
      "message",
      Buffer.from(
        JSON.stringify({ type: "response.audio_transcript.delta", delta: "Second response." }),
      ),
    );
    agentWs.emit(
      "message",
      Buffer.from(JSON.stringify({ type: "response.done", response: { output: [] } })),
    );

    expect(doneResults).toHaveLength(2);
    expect(doneResults[0]).toBe("First response.");
    // Second result must not include stale content from first
    expect(doneResults[1]).toBe("Second response.");
  });

  it("accumulates text.delta events (text-only modality) in the buffer", async () => {
    const { VoiceLiveSessionManager } = await import("../services/VoiceLiveSessionManager.js");
    const mgr = new VoiceLiveSessionManager();
    const roomId = "room-text-delta";

    await mgr.initializeRoom(roomId, "user-1");
    await flushImmediate();

    await mgr.triggerAgentResponse(roomId, "coo", "Summarize.");
    await flushImmediate();

    const agentWs = findAgentWs();

    const doneResults: string[] = [];
    mgr.on(`agentDone:${roomId}`, (_rid: string, _role: string, text: string) => {
      doneResults.push(text);
    });

    // Text-only delta (response.text.delta) — also buffered
    agentWs.emit(
      "message",
      Buffer.from(JSON.stringify({ type: "response.text.delta", delta: "Text delta " })),
    );
    agentWs.emit(
      "message",
      Buffer.from(JSON.stringify({ type: "response.text.delta", delta: "content." })),
    );
    agentWs.emit(
      "message",
      Buffer.from(JSON.stringify({ type: "response.done", response: { output: [] } })),
    );

    expect(doneResults).toHaveLength(1);
    expect(doneResults[0]).toBe("Text delta content.");
  });

  it("triggerAgentResponse clears existing buffer before starting new response", async () => {
    const { VoiceLiveSessionManager } = await import("../services/VoiceLiveSessionManager.js");
    const mgr = new VoiceLiveSessionManager();
    const roomId = "room-buffer-clear";

    await mgr.initializeRoom(roomId, "user-1");
    await flushImmediate();

    await mgr.triggerAgentResponse(roomId, "coo", "First trigger.");
    await flushImmediate();

    const agentWs = findAgentWs();

    const doneResults: string[] = [];
    mgr.on(`agentDone:${roomId}`, (_rid: string, _role: string, text: string) => {
      doneResults.push(text);
    });

    // Simulate partial delta but NO response.done (stale buffer remains)
    agentWs.emit(
      "message",
      Buffer.from(
        JSON.stringify({ type: "response.audio_transcript.delta", delta: "stale partial " }),
      ),
    );

    // Trigger a second response — triggerAgentResponse must clear the buffer first
    await mgr.triggerAgentResponse(roomId, "coo", "Second trigger.");
    await flushImmediate();

    // Now send fresh delta + done
    agentWs.emit(
      "message",
      Buffer.from(
        JSON.stringify({ type: "response.audio_transcript.delta", delta: "Fresh content." }),
      ),
    );
    agentWs.emit(
      "message",
      Buffer.from(JSON.stringify({ type: "response.done", response: { output: [] } })),
    );

    expect(doneResults).toHaveLength(1);
    expect(doneResults[0]).toBe("Fresh content.");
    // Must NOT start with stale partial from previous call
    expect(doneResults[0]).not.toContain("stale partial");
  });
});

// ── Test Suite: teardownRoom ───────────────────────────────────────────────

describe("VoiceLiveSessionManager — teardownRoom", () => {
  beforeEach(() => {
    vi.stubEnv("AZURE_VOICE_LIVE_ENDPOINT", "");
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    FakeWebSocket.reset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    FakeWebSocket.reset();
  });

  it("closes the listener WebSocket when tearing down a room", async () => {
    const { VoiceLiveSessionManager } = await import("../services/VoiceLiveSessionManager.js");
    const mgr = new VoiceLiveSessionManager();
    const roomId = "room-teardown";

    await mgr.initializeRoom(roomId, "user-1");
    await flushImmediate();

    const listenerWs = FakeWebSocket.allCreated[0];
    expect(listenerWs.readyState).toBe(FakeWebSocket.OPEN);

    await mgr.teardownRoom(roomId);

    expect(listenerWs.readyState).toBe(FakeWebSocket.CLOSED);
  });

  it("subsequent teardown of an unknown room is a no-op (no throw)", async () => {
    const { VoiceLiveSessionManager } = await import("../services/VoiceLiveSessionManager.js");
    const mgr = new VoiceLiveSessionManager();

    await expect(mgr.teardownRoom("nonexistent-room")).resolves.toBeUndefined();
  });
});
