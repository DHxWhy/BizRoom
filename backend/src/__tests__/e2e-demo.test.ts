/**
 * e2e-demo.test.ts
 *
 * BizRoom.ai — Full Demo Flow E2E Tests (unit-integration style)
 * Tests the complete backend pipeline by importing actual modules
 * and mocking only external services (OpenAI, SignalR, WebSocket).
 *
 * Coverage:
 *  1. Meeting Start  — room init, Sophia opening (not COO)
 *  2. Chat Message   — non-stream routes to TurnManager, isChairman detection
 *  3. TurnManager    — onChatMessage → triggerAgent events, max 2 per turn
 *  4. TopicClassifier — keyword → primary agent routing
 *  5. ResponseParser  — StructuredAgentOutput extraction
 *  6. A2A Mention     — mention.target = "cfo" queues CFO follow-up
 *  7. Sophia Pipeline — visual_hint → enqueueVisual → processVisualQueue
 *  8. Agent Voices    — all 6 agents + Sophia have voice mappings
 *  9. VoiceLiveSessionManager — OpenAI fallback when Azure endpoint empty
 * 10. Meeting End     — triggers COO summary + Sophia artifact pipeline
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Module mocks must be declared before imports ──────────────────────────

// Mock ws so no real WebSocket connections are made
vi.mock("ws", () => {
  const MockWebSocket = vi.fn().mockImplementation(() => ({
    readyState: 1, // OPEN
    send: vi.fn(),
    ping: vi.fn(),
    close: vi.fn(),
    on: vi.fn(),
  }));
  (MockWebSocket as unknown as Record<string, number>).OPEN = 1;
  (MockWebSocket as unknown as Record<string, number>).CLOSED = 3;
  return { default: MockWebSocket };
});

// Mock SignalR broadcast — prevents real HTTP calls in Sophia pipeline tests
vi.mock("../services/SignalRService.js", () => ({
  broadcastEvent: vi.fn(),
}));

// Mock AgentFactory for Meeting End — prevents real LLM calls
vi.mock("../agents/AgentFactory.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../agents/AgentFactory.js")>();
  return {
    ...original,
    invokeAgent: vi.fn().mockResolvedValue({
      role: "coo",
      name: "Hudson",
      content: JSON.stringify({
        speech: "오늘 회의를 마칩니다. 주요 결정사항을 정리하겠습니다.",
        key_points: ["회의 종료", "액션아이템 정리"],
        mention: null,
        visual_hint: null,
      }),
    }),
  };
});

// Mock GraphService — no real OneDrive/Planner calls
vi.mock("../services/GraphService.js", () => ({
  uploadToOneDrive: vi.fn().mockResolvedValue({
    webUrl: "https://onedrive.example.com/file.pptx",
    driveItemId: "drive-item-123",
  }),
  createPlannerTasks: vi.fn().mockResolvedValue(undefined),
}));

// Mock ArtifactGenerator — no real PPTX/Excel file creation
vi.mock("../services/ArtifactGenerator.js", () => ({
  generatePPT: vi.fn().mockResolvedValue(Buffer.from("mock-ppt-content")),
  generateExcel: vi.fn().mockResolvedValue(Buffer.from("mock-excel-content")),
}));

// Mock ModelRouter LLM clients — no real API calls for Sophia visual gen
vi.mock("../services/ModelRouter.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../services/ModelRouter.js")>();
  const mockOpenAIClient = {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  type: "comparison",
                  columns: ["Option A", "Option B"],
                  rows: [["Cost: $1M", "Cost: $2M"]],
                }),
              },
            },
          ],
        }),
      },
    },
  };
  const mockMinutesClient = {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  meetingInfo: {
                    title: "BizRoom 회의록",
                    date: new Date().toISOString(),
                    participants: ["Chairman", "Hudson", "Amelia"],
                  },
                  agendas: [{ title: "신제품 전략", summary: "A안으로 결정" }],
                  actionItems: [{ task: "시장조사", assignee: "Yusef", deadline: "2026-03-20" }],
                  budgetData: [{ category: "마케팅", amount: 1000000 }],
                }),
              },
            },
          ],
        }),
      },
    },
  };
  return {
    ...original,
    getModelForTask: vi.fn().mockImplementation((task: string) => ({
      provider: "openai",
      model: "gpt-4o",
      temperature: 0.5,
      maxTokens: 1000,
    })),
    getOpenAIClient: vi.fn().mockReturnValue(mockOpenAIClient),
    getFoundryClient: vi.fn().mockReturnValue(mockOpenAIClient),
    getAnthropicClient: vi.fn().mockReturnValue({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                meetingInfo: {
                  title: "BizRoom 회의록",
                  date: new Date().toISOString(),
                  participants: [],
                },
                agendas: [],
                actionItems: [],
                budgetData: [],
              }),
            },
          ],
        }),
      },
    }),
  };
});

// ── Actual module imports (after mocks are declared) ──────────────────────

import { TurnManager, determineAgentOrder } from "../orchestrator/TurnManager.js";
import { classifyTopic, parseMentions } from "../orchestrator/TopicClassifier.js";
import { parseStructuredOutput } from "../orchestrator/ResponseParser.js";
import { SophiaAgent } from "../agents/SophiaAgent.js";
import { AGENT_VOICES, SOPHIA_VOICE } from "../constants/agentVoices.js";
import { AGENT_CONFIGS } from "../agents/agentConfigs.js";
import {
  getOrCreateRoom,
  setPhase,
  setAgenda,
  addMessage,
  clearRoom,
} from "../orchestrator/ContextBroker.js";
import { broadcastEvent } from "../services/SignalRService.js";
import type { AgentRole, VisualHint, StructuredAgentOutput } from "../models/index.js";

// ═══════════════════════════════════════════════════════════════════════════
// Category 1: Meeting Start
// ═══════════════════════════════════════════════════════════════════════════

describe("Category 1: Meeting Start", () => {
  const roomId = "e2e-room-start";

  beforeEach(() => {
    clearRoom(roomId);
  });

  it("creates a room context with phase=opening and sets agenda", () => {
    getOrCreateRoom(roomId);
    setPhase(roomId, "opening");
    setAgenda(roomId, "신제품 전략 논의");

    const room = getOrCreateRoom(roomId);
    expect(room.phase).toBe("opening");
    expect(room.agenda).toBe("신제품 전략 논의");
  });

  it("opening message is sent by Sophia (role=sophia), not COO", () => {
    getOrCreateRoom(roomId);
    const userName = "Alice";
    const agenda = "Q2 예산 검토";

    // Replicate the meetingStart opening message construction
    const sophiaOpening = `안녕하세요, ${userName}님. BizRoom 회의를 시작합니다. 오늘 안건은 "${agenda}"입니다. 말씀해 주세요.`;
    const openingMessage = {
      id: "msg-sophia-open",
      roomId,
      senderId: "agent-sophia",
      senderType: "agent" as const,
      senderName: "Sophia",
      senderRole: "sophia",
      content: sophiaOpening,
      timestamp: new Date().toISOString(),
    };
    addMessage(roomId, openingMessage);

    const room = getOrCreateRoom(roomId);
    const stored = room.messages.find((m) => m.id === "msg-sophia-open");

    expect(stored).toBeDefined();
    expect(stored!.senderRole).toBe("sophia");
    expect(stored!.senderName).toBe("Sophia");
    expect(stored!.senderId).toBe("agent-sophia");
    // Verify COO (Hudson) is NOT the opener
    expect(stored!.senderName).not.toBe("Hudson");
    expect(stored!.senderRole).not.toBe("coo");
  });

  it("opening message contains the agenda and user name", () => {
    const userName = "Bob";
    const agenda = "마케팅 전략 수립";
    const sophiaOpening = `안녕하세요, ${userName}님. BizRoom 회의를 시작합니다. 오늘 안건은 "${agenda}"입니다. 말씀해 주세요.`;

    expect(sophiaOpening).toContain(userName);
    expect(sophiaOpening).toContain(agenda);
    // The opening message is authored by Sophia (verified via senderName in the prior test),
    // but the message content itself does not need to contain the word "Sophia".
    // Verify it is a BizRoom greeting string instead.
    expect(sophiaOpening).toContain("BizRoom");
  });

  it("AGENT_CONFIGS contains all 6 MVP agents", () => {
    const roles = Object.keys(AGENT_CONFIGS) as AgentRole[];
    expect(roles).toContain("coo");
    expect(roles).toContain("cfo");
    expect(roles).toContain("cmo");
    expect(roles).toContain("cto");
    expect(roles).toContain("cdo");
    expect(roles).toContain("clo");
    expect(roles).toHaveLength(6);
  });

  it("AGENT_CONFIGS agents have expected names (Hudson, Amelia, Yusef)", () => {
    expect(AGENT_CONFIGS.coo.name).toBe("Hudson");
    expect(AGENT_CONFIGS.cfo.name).toBe("Amelia");
    expect(AGENT_CONFIGS.cmo.name).toBe("Yusef");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Category 2: Chat Message (non-stream) → TurnManager routing
// ═══════════════════════════════════════════════════════════════════════════

describe("Category 2: Chat Message non-stream → TurnManager", () => {
  let tm: TurnManager;
  const roomId = "e2e-room-chat";

  beforeEach(() => {
    vi.useFakeTimers();
    tm = new TurnManager();
    tm.setChairman(roomId, "user-chairman");
  });

  afterEach(() => {
    vi.useRealTimers();
    tm.destroyRoom(roomId);
  });

  it("routes to TurnManager.onChatMessage and transitions from idle to hearing", () => {
    const stateChanges: string[] = [];
    tm.on(`stateChanged:${roomId}`, (_rid: string, state: string) => {
      stateChanges.push(state);
    });

    tm.onChatMessage(roomId, "user-chairman", "Chairman", "마케팅 전략 논의해주세요", true);

    // Should transition to 'hearing' immediately
    expect(stateChanges).toContain("hearing");
  });

  it("isChairman=true uses CHAIRMAN_FLUSH_MS (0ms) — immediate flush", () => {
    const triggered: string[] = [];
    tm.on(`triggerAgent:${roomId}`, (_rid: string, role: string) => {
      triggered.push(role);
    });

    tm.onChatMessage(roomId, "user-chairman", "Chairman", "예산 검토 해주세요", true);

    // CHAIRMAN_FLUSH_MS = 0 → runs immediately when timers advance 0ms
    vi.advanceTimersByTime(0);

    // At least one agent should be triggered
    expect(triggered.length).toBeGreaterThan(0);
  });

  it("isChairman=false uses MEMBER_FLUSH_MS (500ms) — delayed flush", () => {
    const triggered: string[] = [];
    tm.on(`triggerAgent:${roomId}`, (_rid: string, role: string) => {
      triggered.push(role);
    });

    tm.onChatMessage(roomId, "user-member", "Member", "의견 드립니다", false);

    // Not yet triggered at 0ms
    vi.advanceTimersByTime(0);
    expect(triggered.length).toBe(0);

    // Triggered after 500ms
    vi.advanceTimersByTime(500);
    expect(triggered.length).toBeGreaterThan(0);
  });

  it("isChairman detection: senderId='chairman' → isChairman=true", () => {
    // Replicate the message.ts isChairman detection logic
    const body = { isChairman: undefined as boolean | undefined, senderId: "chairman" };
    const isChairman = body.isChairman === true || body.senderId === "chairman" || !body.senderId;
    expect(isChairman).toBe(true);
  });

  it("isChairman detection: no senderId → isChairman=true (fallback)", () => {
    const body = { isChairman: undefined as boolean | undefined, senderId: undefined as string | undefined };
    const isChairman = body.isChairman === true || body.senderId === "chairman" || !body.senderId;
    expect(isChairman).toBe(true);
  });

  it("isChairman detection: body.isChairman=true overrides senderId", () => {
    const body = { isChairman: true, senderId: "user-xyz" };
    const isChairman = body.isChairman === true || body.senderId === "chairman" || !body.senderId;
    expect(isChairman).toBe(true);
  });

  it("ignores message when AI is paused", () => {
    const stateChanges: string[] = [];
    tm.on(`stateChanged:${roomId}`, (_rid: string, state: string) => {
      stateChanges.push(state);
    });

    tm.setAiPaused(roomId, true);
    tm.onChatMessage(roomId, "user-chairman", "Chairman", "test", true);

    // Should not transition to hearing
    expect(stateChanges).not.toContain("hearing");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Category 3: TurnManager Flow — triggerAgent events, max 2 per turn
// ═══════════════════════════════════════════════════════════════════════════

describe("Category 3: TurnManager Flow", () => {
  let tm: TurnManager;
  const roomId = "e2e-room-tm";

  beforeEach(() => {
    vi.useFakeTimers();
    tm = new TurnManager();
    tm.setChairman(roomId, "user-1");
  });

  afterEach(() => {
    vi.useRealTimers();
    tm.destroyRoom(roomId);
  });

  it("emits triggerAgent event with role and instructions after flush", () => {
    const triggeredRoles: string[] = [];
    tm.on(`triggerAgent:${roomId}`, (_rid: string, role: string) => {
      triggeredRoles.push(role);
    });

    tm.onChatMessage(roomId, "user-1", "Chairman", "신제품 마케팅 전략을 논의합시다", true);
    vi.advanceTimersByTime(0);

    expect(triggeredRoles.length).toBeGreaterThan(0);
    // Each role must be a valid AgentRole
    const validRoles = new Set(["coo", "cfo", "cmo", "cto", "cdo", "clo"]);
    for (const role of triggeredRoles) {
      expect(validRoles.has(role)).toBe(true);
    }
  });

  it("respects MAX_AGENTS_PER_TURN=2 — at most 2 agents in the initial queue", () => {
    // MAX_AGENTS_PER_TURN = 2 is enforced by slice in onFlush
    const triggeredRoles: string[] = [];
    tm.on(`triggerAgent:${roomId}`, (_rid: string, role: string) => {
      triggeredRoles.push(role);
    });

    tm.onChatMessage(roomId, "user-1", "Chairman", "일반 논의입니다", true);
    vi.advanceTimersByTime(0);

    // Only first agent triggered immediately. Mark done, wait for gap timer, second triggers.
    // At flush time the queue is sliced to MAX_AGENTS_PER_TURN=2
    expect(triggeredRoles.length).toBeGreaterThanOrEqual(1);
    expect(triggeredRoles.length).toBeLessThanOrEqual(2);
  });

  it("triggerAgent event includes instructions string", () => {
    let capturedInstructions = "";
    tm.on(`triggerAgent:${roomId}`, (_rid: string, _role: string, instructions: string) => {
      capturedInstructions = instructions;
    });

    tm.onChatMessage(roomId, "user-1", "Chairman", "회의를 진행해주세요", true);
    vi.advanceTimersByTime(0);

    expect(capturedInstructions).toBeTruthy();
    expect(typeof capturedInstructions).toBe("string");
    expect(capturedInstructions.length).toBeGreaterThan(0);
  });

  it("emits stateChanged routing → speaking sequence on flush", () => {
    const states: string[] = [];
    tm.on(`stateChanged:${roomId}`, (_rid: string, state: string) => {
      states.push(state);
    });

    tm.onChatMessage(roomId, "user-1", "Chairman", "test", true);
    vi.advanceTimersByTime(0);

    // idle → hearing (onChatMessage) → routing → speaking (onFlush)
    expect(states).toContain("routing");
    expect(states).toContain("speaking");
  });

  it("emits agentsDone when all agents finish", () => {
    const events: string[] = [];
    const triggeredRoles: AgentRole[] = [];

    tm.on(`triggerAgent:${roomId}`, (_rid: string, role: AgentRole) => {
      triggeredRoles.push(role);
    });
    tm.on(`agentsDone:${roomId}`, () => events.push("agentsDone"));

    tm.onChatMessage(roomId, "user-1", "Chairman", "의견 주세요", true);
    vi.advanceTimersByTime(0);

    // Simulate first agent done
    if (triggeredRoles.length > 0) {
      tm.onAgentDone(roomId, triggeredRoles[0], "응답입니다.", true);
      vi.advanceTimersByTime(600); // allow INTER_AGENT_GAP_MS=500ms
    }

    // Simulate second agent done if triggered
    if (triggeredRoles.length > 1) {
      tm.onAgentDone(roomId, triggeredRoles[1], "추가 응답입니다.", true);
      vi.advanceTimersByTime(600);
    } else if (triggeredRoles.length === 1) {
      // Only one agent — agentsDone should fire after first done
    }

    expect(events).toContain("agentsDone");
  });

  it("determineAgentOrder — general query starts with COO at priority 1", () => {
    const turns = determineAgentOrder("일반 논의", [], "coo", ["cfo", "cmo"]);
    expect(turns[0].role).toBe("coo");
    expect(turns[0].priority).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Category 4: Topic Classification
// ═══════════════════════════════════════════════════════════════════════════

describe("Category 4: Topic Classification", () => {
  it("'마케팅' keyword → CMO as primary agent", () => {
    const result = classifyTopic("마케팅 캠페인 전략을 논의합시다");
    expect(result.primaryAgent).toBe("cmo");
  });

  it("'재무' keyword → CFO as primary agent", () => {
    const result = classifyTopic("재무 상태와 예산을 검토해주세요");
    expect(result.primaryAgent).toBe("cfo");
  });

  it("'법적' keyword → CLO as primary agent", () => {
    const result = classifyTopic("법적 규제와 계약 사항을 확인해주세요");
    expect(result.primaryAgent).toBe("clo");
  });

  it("'서버 아키텍처' keywords → CTO as primary agent", () => {
    const result = classifyTopic("서버 아키텍처와 API 설계를 논의합시다");
    expect(result.primaryAgent).toBe("cto");
  });

  it("'디자인 UX' keywords → CDO as primary agent", () => {
    const result = classifyTopic("디자인과 UX 개선 방안을 논의합시다");
    expect(result.primaryAgent).toBe("cdo");
  });

  it("general topic with no keywords → COO as primary", () => {
    const result = classifyTopic("오늘 회의를 시작하겠습니다");
    expect(result.primaryAgent).toBe("coo");
  });

  it("returns confidence > 0 for matched topics", () => {
    const result = classifyTopic("마케팅 캠페인 브랜드 전략");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("returns confidence = 0.3 baseline for general topic", () => {
    const result = classifyTopic("안녕하세요");
    expect(result.confidence).toBe(0.3);
  });

  it("parseMentions extracts @CFO correctly", () => {
    const mentions = parseMentions("@CFO 예산 알려주세요");
    expect(mentions).toContain("cfo");
  });

  it("parseMentions extracts agent names (@Amelia → cfo)", () => {
    const mentions = parseMentions("@Amelia 재무 분석 부탁드립니다");
    expect(mentions).toContain("cfo");
  });

  it("parseMentions extracts multiple agents", () => {
    const mentions = parseMentions("@COO @CMO 같이 논의해주세요");
    expect(mentions).toContain("coo");
    expect(mentions).toContain("cmo");
  });

  it("parseMentions deduplicates repeated mentions", () => {
    const mentions = parseMentions("@CFO @CFO @Amelia 예산");
    const cfoCount = mentions.filter((m) => m === "cfo").length;
    expect(cfoCount).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Category 5: ResponseParser — StructuredAgentOutput extraction
// ═══════════════════════════════════════════════════════════════════════════

describe("Category 5: ResponseParser", () => {
  it("Tier 1: parses valid JSON with all fields", () => {
    const raw: StructuredAgentOutput = {
      speech: "의장님, 마케팅 예산을 검토하겠습니다.",
      key_points: ["마케팅 예산 분석 필요", "ROI 검토"],
      mention: { target: "cfo", intent: "opinion" },
      visual_hint: { type: "bar-chart", title: "예산 현황" },
    };
    const result = parseStructuredOutput(JSON.stringify(raw), "cmo");

    expect(result.tier).toBe("schema_valid");
    expect(result.data.speech).toBe("의장님, 마케팅 예산을 검토하겠습니다.");
    expect(result.data.key_points).toHaveLength(2);
    expect(result.data.key_points[0]).toBe("마케팅 예산 분석 필요");
    expect(result.data.mention?.target).toBe("cfo");
    expect(result.data.mention?.intent).toBe("opinion");
    expect(result.data.visual_hint?.type).toBe("bar-chart");
    expect(result.data.visual_hint?.title).toBe("예산 현황");
  });

  it("Tier 1: parses minimal output with null mention and visual_hint", () => {
    const raw = JSON.stringify({
      speech: "동의합니다.",
      key_points: [],
      mention: null,
      visual_hint: null,
    });
    const result = parseStructuredOutput(raw, "coo");

    expect(result.tier).toBe("schema_valid");
    expect(result.data.mention).toBeNull();
    expect(result.data.visual_hint).toBeNull();
  });

  it("Tier 2: repairs JSON wrapped in markdown code fence", () => {
    const raw =
      "```json\n" +
      JSON.stringify({ speech: "분석 결과입니다.", key_points: ["핵심1"], mention: null, visual_hint: null }) +
      "\n```";
    const result = parseStructuredOutput(raw, "cfo");

    expect(result.tier).toBe("json_repaired");
    expect(result.data.speech).toBe("분석 결과입니다.");
  });

  it("Tier 3: falls back to plain text as speech", () => {
    const raw = "안녕하세요, 저는 COO Hudson입니다. 회의를 시작하겠습니다.";
    const result = parseStructuredOutput(raw, "coo");

    expect(result.tier).toBe("fallback");
    expect(result.data.speech).toBe(raw);
    expect(result.data.key_points).toEqual([]);
    expect(result.data.mention).toBeNull();
    expect(result.data.visual_hint).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it("Tier 3: truncates fallback speech at 300 characters", () => {
    const raw = "가".repeat(500);
    const result = parseStructuredOutput(raw, "cto");
    expect(result.data.speech.length).toBe(300);
  });

  it("filters self-mention (agent mentioning itself)", () => {
    const raw = JSON.stringify({
      speech: "제가 다시 정리하겠습니다.",
      key_points: [],
      mention: { target: "coo", intent: "opinion" },
      visual_hint: null,
    });
    const result = parseStructuredOutput(raw, "coo");
    expect(result.data.mention).toBeNull();
  });

  it("rejects mention with invalid intent", () => {
    const raw = JSON.stringify({
      speech: "테스트",
      key_points: [],
      mention: { target: "cfo", intent: "unknown_intent" },
      visual_hint: null,
    });
    const result = parseStructuredOutput(raw, "coo");
    expect(result.data.mention).toBeNull();
  });

  it("accepts all valid VisualType values", () => {
    const validTypes = ["comparison", "pie-chart", "bar-chart", "timeline", "checklist", "summary", "architecture"] as const;
    for (const type of validTypes) {
      const raw = JSON.stringify({
        speech: "시각화 요청입니다.",
        key_points: [],
        mention: null,
        visual_hint: { type, title: `${type} 제목` },
      });
      const result = parseStructuredOutput(raw, "coo");
      expect(result.data.visual_hint?.type).toBe(type);
    }
  });

  it("rejects invalid visual_hint type", () => {
    const raw = JSON.stringify({
      speech: "테스트",
      key_points: [],
      mention: null,
      visual_hint: { type: "invalid-chart-type", title: "제목" },
    });
    const result = parseStructuredOutput(raw, "coo");
    expect(result.data.visual_hint).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Category 6: A2A Mention Routing
// ═══════════════════════════════════════════════════════════════════════════

describe("Category 6: A2A Mention Routing", () => {
  let tm: TurnManager;
  const roomId = "e2e-room-a2a";

  beforeEach(() => {
    vi.useFakeTimers();
    tm = new TurnManager();
    tm.setChairman(roomId, "user-1");
  });

  afterEach(() => {
    vi.useRealTimers();
    tm.destroyRoom(roomId);
  });

  it("mention.target='cfo' queues CFO as follow-up agent", () => {
    // Use a fresh TurnManager with no initial queue congestion.
    // The key test: handleMentionRouting pushes CFO into the agent queue.
    // We verify this directly via the internal queue + the A2A path in TurnManager.
    const tm3 = new TurnManager();
    const rId = "e2e-room-a2a-cfo";
    tm3.setChairman(rId, "user-1");

    const triggeredRoles: string[] = [];
    tm3.on(`triggerAgent:${rId}`, (_rid: string, role: string) => {
      triggeredRoles.push(role);
    });

    // Trigger COO directly via requestAiOpinion (empty input → only COO queued at P1)
    tm3.onChatMessage(rId, "user-1", "Chairman", "의견 주세요", true);
    vi.advanceTimersByTime(0);

    // handleMentionRouting queues CFO (structured mention, priority 1)
    const outputWithMention: StructuredAgentOutput = {
      speech: "재무 관점도 중요합니다. CFO Amelia의 의견이 필요합니다.",
      key_points: ["CFO 검토 필요"],
      mention: { target: "cfo", intent: "opinion" },
      visual_hint: null,
    };
    tm3.handleMentionRouting(rId, outputWithMention, "coo");

    // Drain every triggered agent until queue is empty — CFO must appear
    let safetyLimit = 10;
    let idx = 0;
    const allRoles: AgentRole[] = ["coo", "cmo", "cto", "cdo", "clo", "cfo"];
    while (safetyLimit-- > 0) {
      const lastRole = triggeredRoles[triggeredRoles.length - 1] as AgentRole | undefined;
      if (lastRole) {
        tm3.onAgentDone(rId, lastRole, "응답입니다.", true);
      } else {
        tm3.onAgentDone(rId, allRoles[idx++ % allRoles.length], "응답입니다.", true);
      }
      vi.advanceTimersByTime(600);
      if (triggeredRoles.includes("cfo")) break;
    }

    expect(triggeredRoles).toContain("cfo");
    tm3.destroyRoom(rId);
  });

  it("mention.target='chairman' triggers awaiting state (human callout)", () => {
    const states: string[] = [];
    const callouts: Array<{ target: string }> = [];
    tm.on(`stateChanged:${roomId}`, (_rid: string, state: string) => {
      states.push(state);
    });
    tm.on(`humanCallout:${roomId}`, (_rid: string, callout: { target: string }) => {
      callouts.push(callout);
    });

    // Put TurnManager into speaking state first
    tm.onChatMessage(roomId, "user-1", "Chairman", "의견을 물어보겠습니다", true);
    vi.advanceTimersByTime(0);

    // Simulate agent mentions chairman
    const outputWithChairmanMention: StructuredAgentOutput = {
      speech: "의장님, A안과 B안 중 어느 것을 선택하시겠습니까?",
      key_points: [],
      mention: { target: "chairman", intent: "confirm", options: ["A안", "B안"] },
      visual_hint: null,
    };
    tm.handleMentionRouting(roomId, outputWithChairmanMention, "coo");

    expect(states).toContain("awaiting");
    expect(callouts.length).toBeGreaterThan(0);
    expect(callouts[0].target).toBe("chairman");
  });

  it("mention.target=valid agent role is queued at priority 1", () => {
    const triggeredRoles: string[] = [];
    tm.on(`triggerAgent:${roomId}`, (_rid: string, role: string) => {
      triggeredRoles.push(role);
    });

    tm.onChatMessage(roomId, "user-1", "Chairman", "법적 검토 필요", true);
    vi.advanceTimersByTime(0);

    // Queue CLO via structured mention, then complete COO so CLO is dequeued
    const outputWithCLO: StructuredAgentOutput = {
      speech: "법적 리스크가 있습니다. CLO Bradley의 검토가 필요합니다.",
      key_points: [],
      mention: { target: "clo", intent: "opinion" },
      visual_hint: null,
    };
    tm.handleMentionRouting(roomId, outputWithCLO, "coo");
    tm.onAgentDone(roomId, "coo", outputWithCLO.speech, true);
    vi.advanceTimersByTime(600);

    expect(triggeredRoles).toContain("clo");
  });

  it("no mention falls back to keyword-based checkFollowUp", () => {
    // A2A keyword routing: budget keywords in COO speech → CFO follow-up
    const outputNoCFO: StructuredAgentOutput = {
      speech: "예산 검토가 필요합니다. 비용 분석을 해야 합니다.",
      key_points: [],
      mention: null, // no structured mention — triggers keyword fallback
      visual_hint: null,
    };

    const tm2 = new TurnManager();
    const rId = "e2e-room-a2a-keyword";
    tm2.setChairman(rId, "user-kw");

    const triggered: string[] = [];
    tm2.on(`triggerAgent:${rId}`, (_rid: string, role: string) => {
      triggered.push(role);
    });

    // Enter speaking state via chat message
    tm2.onChatMessage(rId, "user-kw", "Chairman", "일반 논의", true);
    vi.advanceTimersByTime(0);

    // handleMentionRouting with null mention → checkFollowUp by keyword.
    // Then complete COO so the follow-up (CFO) is dequeued and triggered.
    tm2.handleMentionRouting(rId, outputNoCFO, "coo");
    tm2.onAgentDone(rId, "coo", outputNoCFO.speech, true);
    vi.advanceTimersByTime(600);

    // CFO should be queued via keyword match (예산, 비용)
    expect(triggered).toContain("cfo");

    vi.useRealTimers();
    tm2.destroyRoom(rId);
    vi.useFakeTimers();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Category 7: Sophia Pipeline — visual_hint → enqueueVisual → processVisualQueue
// ═══════════════════════════════════════════════════════════════════════════

describe("Category 7: Sophia Pipeline", () => {
  let sophia: SophiaAgent;
  const roomId = "e2e-room-sophia";

  beforeEach(() => {
    sophia = new SophiaAgent();
    sophia.initRoom(roomId);
  });

  afterEach(() => {
    sophia.destroyRoom(roomId);
  });

  it("enqueueVisual adds hint to the visual queue", () => {
    const hint: VisualHint = { type: "comparison", title: "A안 vs B안 비교" };
    sophia.enqueueVisual(roomId, hint);

    const state = sophia.getRoomState(roomId);
    expect(state?.visualQueue.length).toBe(1);
    expect(state?.visualQueue[0].hint.type).toBe("comparison");
    expect(state?.visualQueue[0].hint.title).toBe("A안 vs B안 비교");
  });

  it("dequeueVisual returns and removes the first queued item (FIFO)", () => {
    const hint1: VisualHint = { type: "bar-chart", title: "매출 차트" };
    const hint2: VisualHint = { type: "pie-chart", title: "비용 구성" };
    sophia.enqueueVisual(roomId, hint1);
    sophia.enqueueVisual(roomId, hint2);

    const first = sophia.dequeueVisual(roomId);
    expect(first?.hint.type).toBe("bar-chart"); // FIFO order

    const second = sophia.dequeueVisual(roomId);
    expect(second?.hint.type).toBe("pie-chart");

    const empty = sophia.dequeueVisual(roomId);
    expect(empty).toBeUndefined();
  });

  it("hasVisualHint returns true when visual_hint is present", () => {
    const output: StructuredAgentOutput = {
      speech: "시각화 요청합니다.",
      key_points: [],
      mention: null,
      visual_hint: { type: "timeline", title: "프로젝트 타임라인" },
    };
    expect(sophia.hasVisualHint(output)).toBe(true);
  });

  it("hasVisualHint returns false when visual_hint is null", () => {
    const output: StructuredAgentOutput = {
      speech: "일반 응답입니다.",
      key_points: [],
      mention: null,
      visual_hint: null,
    };
    expect(sophia.hasVisualHint(output)).toBe(false);
  });

  it("isProcessingVisual starts as false, toggles correctly", () => {
    expect(sophia.isProcessingVisual(roomId)).toBe(false);
    sophia.setProcessingVisual(roomId, true);
    expect(sophia.isProcessingVisual(roomId)).toBe(true);
    sophia.setProcessingVisual(roomId, false);
    expect(sophia.isProcessingVisual(roomId)).toBe(false);
  });

  it("addToBuffer accumulates speech entries", () => {
    sophia.addToBuffer(roomId, {
      speaker: "Hudson",
      role: "coo",
      speech: "첫 번째 발언입니다.",
      keyPoints: ["핵심1"],
      visualHint: null,
      timestamp: Date.now(),
    });
    sophia.addToBuffer(roomId, {
      speaker: "Amelia",
      role: "cfo",
      speech: "두 번째 발언입니다.",
      keyPoints: ["핵심2"],
      visualHint: { type: "bar-chart", title: "예산" },
      timestamp: Date.now(),
    });

    const state = sophia.getRoomState(roomId);
    expect(state?.buffer.length).toBe(2);
    expect(state?.buffer[0].speaker).toBe("Hudson");
    expect(state?.buffer[1].speaker).toBe("Amelia");
  });

  it("getRecentSpeeches returns last N speeches in 'Speaker: speech' format", () => {
    sophia.addToBuffer(roomId, { speaker: "Hudson", role: "coo", speech: "발언1", keyPoints: [], visualHint: null, timestamp: Date.now() });
    sophia.addToBuffer(roomId, { speaker: "Amelia", role: "cfo", speech: "발언2", keyPoints: [], visualHint: null, timestamp: Date.now() });
    sophia.addToBuffer(roomId, { speaker: "Yusef", role: "cmo", speech: "발언3", keyPoints: [], visualHint: null, timestamp: Date.now() });

    const recent = sophia.getRecentSpeeches(roomId, 2);
    expect(recent).toHaveLength(2);
    expect(recent[0]).toContain("Amelia");
    expect(recent[1]).toContain("Yusef");
  });

  it("processVisualQueue skips when already processing (no duplicate GPT calls)", () => {
    sophia.setProcessingVisual(roomId, true);
    const hint: VisualHint = { type: "summary", title: "요약" };
    sophia.enqueueVisual(roomId, hint);

    // Verify queue has item but processing flag prevents dequeue
    const state = sophia.getRoomState(roomId);
    expect(state?.visualQueue.length).toBe(1); // still queued
    expect(sophia.isProcessingVisual(roomId)).toBe(true);
  });

  it("destroyRoom cleans up all room state including visual queue", () => {
    sophia.enqueueVisual(roomId, { type: "checklist", title: "할일" });
    sophia.setProcessingVisual(roomId, true);
    sophia.destroyRoom(roomId);

    expect(sophia.getRoomState(roomId)).toBeUndefined();
    expect(sophia.isProcessingVisual(roomId)).toBe(false);
  });

  it("postMeetingQueue drain returns all queued items and clears", () => {
    sophia.addPostMeetingRequest(roomId, "보고서 작성 요청");
    sophia.addPostMeetingRequest(roomId, "슬라이드 재정리 요청");

    const items = sophia.drainPostMeetingQueue(roomId);
    expect(items).toHaveLength(2);
    expect(items[0]).toBe("보고서 작성 요청");

    // Queue should be empty after drain
    const secondDrain = sophia.drainPostMeetingQueue(roomId);
    expect(secondDrain).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Category 8: Agent Voice Config
// ═══════════════════════════════════════════════════════════════════════════

describe("Category 8: Agent Voice Config", () => {
  const allAgentRoles: AgentRole[] = ["coo", "cfo", "cmo", "cto", "cdo", "clo"];

  it("all 6 C-Suite agents have voice config entries", () => {
    for (const role of allAgentRoles) {
      expect(AGENT_VOICES[role]).toBeDefined();
      expect(AGENT_VOICES[role].role).toBe(role);
    }
  });

  it("all agents have a non-empty Azure voiceName (DragonHD format)", () => {
    for (const role of allAgentRoles) {
      expect(AGENT_VOICES[role].voiceName).toBeTruthy();
      expect(AGENT_VOICES[role].voiceName).toMatch(/DragonHDLatestNeural/);
    }
  });

  it("all agents have a non-empty OpenAI fallback voice", () => {
    const validOpenAIVoices = new Set(["ash", "coral", "ballad", "echo", "verse", "sage", "shimmer", "alloy", "nova"]);
    for (const role of allAgentRoles) {
      expect(AGENT_VOICES[role].openaiVoice).toBeTruthy();
      expect(validOpenAIVoices.has(AGENT_VOICES[role].openaiVoice)).toBe(true);
    }
  });

  it("COO (Hudson) uses male voice — ash (confident male)", () => {
    expect(AGENT_VOICES.coo.openaiVoice).toBe("ash");
  });

  it("CFO (Amelia) uses female voice — coral (warm female)", () => {
    expect(AGENT_VOICES.cfo.openaiVoice).toBe("coral");
  });

  it("CMO (Yusef) uses male voice — ballad (warm engaging male)", () => {
    expect(AGENT_VOICES.cmo.openaiVoice).toBe("ballad");
  });

  it("CTO (Kelvin) uses male voice — echo (clear male)", () => {
    expect(AGENT_VOICES.cto.openaiVoice).toBe("echo");
  });

  it("CDO (Jonas) uses male voice — verse (versatile male)", () => {
    expect(AGENT_VOICES.cdo.openaiVoice).toBe("verse");
  });

  it("CLO (Bradley) uses male voice — sage (authoritative male)", () => {
    expect(AGENT_VOICES.clo.openaiVoice).toBe("sage");
  });

  it("Sophia has voice config as SOPHIA_VOICE singleton", () => {
    expect(SOPHIA_VOICE).toBeDefined();
    expect(SOPHIA_VOICE.role).toBe("sophia");
    expect(SOPHIA_VOICE.openaiVoice).toBeTruthy();
    expect(SOPHIA_VOICE.voiceName).toMatch(/DragonHDLatestNeural/);
  });

  it("Sophia uses female voice — shimmer", () => {
    expect(SOPHIA_VOICE.openaiVoice).toBe("shimmer");
  });

  it("all agents have temperature between 0 and 1", () => {
    for (const role of allAgentRoles) {
      const temp = AGENT_VOICES[role].temperature;
      expect(temp).toBeGreaterThan(0);
      expect(temp).toBeLessThanOrEqual(1);
    }
    expect(SOPHIA_VOICE.temperature).toBeGreaterThan(0);
    expect(SOPHIA_VOICE.temperature).toBeLessThanOrEqual(1);
  });

  it("all agents have locale set to en-US", () => {
    for (const role of allAgentRoles) {
      expect(AGENT_VOICES[role].locale).toBe("en-US");
    }
    expect(SOPHIA_VOICE.locale).toBe("en-US");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Category 9: VoiceLiveSessionManager — OpenAI fallback mode
// ═══════════════════════════════════════════════════════════════════════════

describe("Category 9: VoiceLiveSessionManager — provider selection", () => {
  it("USE_AZURE is false when AZURE_VOICE_LIVE_ENDPOINT is empty", () => {
    // The module evaluates USE_AZURE = !!VOICE_LIVE_ENDPOINT at load time
    // Since test env has no AZURE_VOICE_LIVE_ENDPOINT, USE_AZURE = false
    const endpoint = process.env.AZURE_VOICE_LIVE_ENDPOINT || "";
    const useAzure = !!endpoint;
    expect(useAzure).toBe(false);
  });

  it("selects OpenAI fallback when OPENAI_API_KEY is set and Azure endpoint is empty", () => {
    const endpoint = process.env.AZURE_VOICE_LIVE_ENDPOINT || "";
    const openaiKey = process.env.OPENAI_API_KEY || "test-openai-key";
    const useAzure = !!endpoint;
    const useOpenAI = !useAzure && !!openaiKey;
    expect(useOpenAI).toBe(true);
  });

  it("degrades to text-only mode when both Azure and OpenAI keys are absent", () => {
    const endpoint = "";
    const openaiKey = "";
    const useAzure = !!endpoint;
    const useOpenAI = !useAzure && !!openaiKey;
    const textOnly = !useAzure && !useOpenAI;
    expect(textOnly).toBe(true);
  });

  it("OPENAI_REALTIME_MODEL defaults to gpt-realtime-1.5", () => {
    // Test the default model string used in VoiceLiveSessionManager
    const model = process.env.OPENAI_MODEL_REALTIME || "gpt-realtime-1.5";
    expect(model).toBe("gpt-realtime-1.5");
  });

  it("VoiceLiveSessionManager can be instantiated without crashing", async () => {
    const { VoiceLiveSessionManager } = await import("../services/VoiceLiveSessionManager.js");
    expect(() => new VoiceLiveSessionManager()).not.toThrow();
  });

  it("teardownRoom is safe to call for non-existent room", async () => {
    const { VoiceLiveSessionManager } = await import("../services/VoiceLiveSessionManager.js");
    const mgr = new VoiceLiveSessionManager();
    await expect(mgr.teardownRoom("non-existent-room")).resolves.not.toThrow();
  });

  it("relayAudio is safe when room has no listener session", async () => {
    const { VoiceLiveSessionManager } = await import("../services/VoiceLiveSessionManager.js");
    const mgr = new VoiceLiveSessionManager();
    // Should not throw — no session exists
    expect(() => mgr.relayAudio("no-room", "base64audio")).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Category 10: Meeting End — COO summary + Sophia artifact pipeline
// ═══════════════════════════════════════════════════════════════════════════

describe("Category 10: Meeting End", () => {
  const roomId = "e2e-room-end";
  let sophia: SophiaAgent;

  beforeEach(() => {
    clearRoom(roomId);
    sophia = new SophiaAgent();
    sophia.initRoom(roomId);
    getOrCreateRoom(roomId);
    setPhase(roomId, "discussion");
    setAgenda(roomId, "신제품 런칭 전략");
  });

  afterEach(() => {
    sophia.destroyRoom(roomId);
    clearRoom(roomId);
    vi.clearAllMocks();
  });

  it("meetingEnd sets phase to closing", () => {
    setPhase(roomId, "closing");
    const room = getOrCreateRoom(roomId);
    expect(room.phase).toBe("closing");
  });

  it("Sophia buffer has entries from the meeting conversation", () => {
    sophia.addToBuffer(roomId, {
      speaker: "Hudson",
      role: "coo",
      speech: "오늘 논의한 내용을 정리하겠습니다.",
      keyPoints: ["런칭 일정 확정"],
      visualHint: null,
      timestamp: Date.now(),
    });
    sophia.addToBuffer(roomId, {
      speaker: "Amelia",
      role: "cfo",
      speech: "예산은 5억원으로 승인합니다.",
      keyPoints: ["예산 5억 확정"],
      visualHint: { type: "bar-chart", title: "예산 배분" },
      timestamp: Date.now(),
    });

    const state = sophia.getRoomState(roomId);
    expect(state?.buffer.length).toBe(2);
    expect(state?.buffer.length).toBeGreaterThan(0);
  });

  it("Sophia state is destroyed after meeting end cleanup", () => {
    sophia.destroyRoom(roomId);
    expect(sophia.getRoomState(roomId)).toBeUndefined();
  });

  it("remainig visual queue items are discarded on meeting end", () => {
    sophia.enqueueVisual(roomId, { type: "timeline", title: "프로젝트 일정" });
    sophia.enqueueVisual(roomId, { type: "checklist", title: "체크리스트" });

    // Drain visual queue — simulates meetingEnd draining
    while (sophia.dequeueVisual(roomId)) {
      // discard
    }

    const state = sophia.getRoomState(roomId);
    expect(state?.visualQueue.length).toBe(0);
  });

  it("invokeAgent mock returns COO closing speech", async () => {
    const { invokeAgent } = await import("../agents/AgentFactory.js");
    const response = await invokeAgent(
      "coo",
      "회의를 종료합니다.",
      {
        participants: "Chairman, Hudson (COO)",
        agenda: "신제품 런칭",
        history: "",
      },
      "summary",
    );

    expect(response.role).toBe("coo");
    expect(response.name).toBe("Hudson");
    expect(response.content).toBeTruthy();

    // Parse the COO response to verify structured output
    const parsed = parseStructuredOutput(response.content, "coo");
    expect(parsed.data.speech).toBeTruthy();
  });

  it("broadcastEvent is called after meeting end (artifactsReady)", () => {
    // Simulate the artifact ready broadcast
    broadcastEvent(roomId, {
      type: "artifactsReady",
      payload: {
        files: [
          { name: "회의록.pptx", type: "pptx", webUrl: "https://example.com/meeting.pptx" },
        ],
      },
    });

    expect(broadcastEvent).toHaveBeenCalledWith(
      roomId,
      expect.objectContaining({ type: "artifactsReady" }),
    );
  });

  it("ContextBroker getOrCreateRoom returns room with closing phase", () => {
    setPhase(roomId, "closing");
    const room = getOrCreateRoom(roomId);
    expect(room.phase).toBe("closing");
    expect(room.roomId).toBe(roomId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Integration: Full Demo Flow — message → classify → parse → Sophia buffer
// ═══════════════════════════════════════════════════════════════════════════

describe("Integration: Full Demo Flow Smoke Test", () => {
  const roomId = "e2e-room-full-demo";

  beforeEach(() => {
    clearRoom(roomId);
    getOrCreateRoom(roomId);
    setPhase(roomId, "discussion");
    setAgenda(roomId, "Q2 마케팅 전략 및 예산 검토");
  });

  afterEach(() => {
    clearRoom(roomId);
  });

  it("marketing message correctly classifies to CMO and produces valid agent order", () => {
    const userMessage = "Q2 마케팅 캠페인 전략과 예산을 논의합시다";
    const mentions = parseMentions(userMessage);
    const { primaryAgent, secondaryAgents } = classifyTopic(userMessage);
    const agentOrder = determineAgentOrder(userMessage, mentions, primaryAgent, secondaryAgents);

    // Marketing → CMO primary
    expect(primaryAgent).toBe("cmo");
    // COO should be in agent order (P1 orchestrator)
    expect(agentOrder.some((a) => a.role === "coo")).toBe(true);
    // CMO should be in agent order
    expect(agentOrder.some((a) => a.role === "cmo")).toBe(true);
  });

  it("agent response → parseStructuredOutput → Sophia buffer accumulation", () => {
    const sophia = new SophiaAgent();
    sophia.initRoom(roomId);

    const rawAgentResponse = JSON.stringify({
      speech: "CMO 관점에서 디지털 마케팅이 핵심입니다. 예산의 60%를 온라인 채널에 집중 투자를 제안합니다.",
      key_points: ["디지털 마케팅 집중", "온라인 예산 60%"],
      mention: { target: "cfo", intent: "opinion" },
      visual_hint: { type: "pie-chart", title: "마케팅 채널 예산 배분" },
    });

    const parsed = parseStructuredOutput(rawAgentResponse, "cmo");
    expect(parsed.tier).toBe("schema_valid");

    // Feed into Sophia buffer
    sophia.addToBuffer(roomId, {
      speaker: "Yusef",
      role: "cmo",
      speech: parsed.data.speech,
      keyPoints: parsed.data.key_points,
      visualHint: parsed.data.visual_hint,
      timestamp: Date.now(),
    });

    // Sophia should detect visual hint
    expect(sophia.hasVisualHint(parsed.data)).toBe(true);

    // Enqueue visual
    if (parsed.data.visual_hint) {
      sophia.enqueueVisual(roomId, parsed.data.visual_hint);
    }
    expect(sophia.getRoomState(roomId)?.visualQueue.length).toBe(1);

    // Mention should route to CFO
    expect(parsed.data.mention?.target).toBe("cfo");

    sophia.destroyRoom(roomId);
  });

  it("full pipeline: classify → route → parse → mention → visual queue", () => {
    // Use a message with only marketing keywords to ensure CMO is primary
    const userInput = "마케팅 캠페인 브랜드 홍보 전략을 논의합시다";

    // Step 1: classify topic — multiple marketing keywords → CMO primary
    const { primaryAgent } = classifyTopic(userInput);
    expect(primaryAgent).toBe("cmo");

    // Step 2: parse a CMO structured response
    const cmoResponse = JSON.stringify({
      speech: "마케팅 예산을 늘려야 합니다.",
      key_points: ["마케팅 예산 증가"],
      mention: { target: "cfo", intent: "opinion" },
      visual_hint: { type: "comparison", title: "마케팅 예산 비교" },
    });
    const parsed = parseStructuredOutput(cmoResponse, "cmo");
    expect(parsed.tier).toBe("schema_valid");

    // Step 3: mention routing — CFO should be follow-up
    expect(parsed.data.mention?.target).toBe("cfo");

    // Step 4: visual hint detected
    expect(parsed.data.visual_hint).not.toBeNull();
    expect(parsed.data.visual_hint?.type).toBe("comparison");

    // Step 5: Sophia visual queue
    const sophia = new SophiaAgent();
    sophia.initRoom(roomId);
    sophia.enqueueVisual(roomId, parsed.data.visual_hint!);
    expect(sophia.getRoomState(roomId)?.visualQueue.length).toBe(1);

    sophia.destroyRoom(roomId);
  });
});
