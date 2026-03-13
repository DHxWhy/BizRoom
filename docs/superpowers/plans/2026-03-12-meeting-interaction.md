---
version: "1.1.0"
created: "2026-03-12 13:30"
updated: "2026-03-12 14:00"
---

# Meeting Interaction System — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add structured agent output, smart mention system, Sophia secretary agent, big-screen visualization, team member system, and Microsoft artifact generation to BizRoom.ai.

**Architecture:** C-Suite agents produce structured JSON via Chat Completions (`json_schema` + `strict: true`). Speech field is piped to TTS. Mentions route to TurnManager (new `awaiting` state for human callouts). Sophia runs a parallel background pipeline — generates visuals from hints and accumulates meeting minutes. On meeting end, PPT/Excel/Planner artifacts are generated via `pptxgenjs`/`exceljs`/Graph API.

**Tech Stack:** Azure Functions v4, TypeScript strict, Vitest, OpenAI Chat Completions (json_schema), pptxgenjs, exceljs, @azure/msal-node, @microsoft/microsoft-graph-client, partial-json, React 18, Three.js/R3F, SVG→Canvas rendering.

**Spec:** `docs/superpowers/specs/2026-03-12-meeting-interaction-design.md` (v1.2.0)

---

## Chunk 1: Foundation — Types & ResponseParser

### Task 1: Add new types to shared/types.ts

**Files:**
- Modify: `shared/types.ts`

- [ ] **Step 1: Add TurnState "awaiting"**

Change line 81:
```typescript
export type TurnState = "idle" | "hearing" | "routing" | "speaking" | "awaiting";
```

- [ ] **Step 2: Add Mention, VisualHint, StructuredOutput types**

Append after `ResponseLog` interface:
```typescript
// ──────────────────────────────────────────────
// Meeting Interaction Types — Spec §2-4
// ──────────────────────────────────────────────
export interface Mention {
  target: AgentRole | "chairman" | `member:${string}`;
  intent: "opinion" | "confirm";
  options?: string[];
}

export interface VisualHint {
  type: VisualType;
  title: string;
}

export interface StructuredAgentOutput {
  speech: string;
  key_points: string[];
  mention: Mention | null;
  visual_hint: VisualHint | null;
}

export type VisualType =
  | "comparison"
  | "pie-chart"
  | "bar-chart"
  | "timeline"
  | "checklist"
  | "summary"
  | "architecture";

export type SecretaryRole = "sophia";
export type AllAgentRole = AgentRole | SecretaryRole;

export type ArtifactType = "excel" | "markdown" | "image" | "powerpoint" | "planner";
export type ArtifactFileType = "pptx" | "xlsx" | "planner";
```

- [ ] **Step 3: Add new SignalR event types**

Append after existing `RoomBroadcastEvent`:
```typescript
// ──────────────────────────────────────────────
// Meeting Interaction Events — Spec §9
// ──────────────────────────────────────────────
export interface AgentThinkingEvent {
  roles: AgentRole[];
}

export interface HumanCalloutEvent {
  target: "chairman" | `member:${string}`;
  intent: "opinion" | "confirm";
  options?: string[];
  fromAgent: AgentRole;
}

export type BigScreenRenderData =
  | { type: "comparison"; columns: string[]; rows: string[][] }
  | { type: "pie-chart"; items: Array<{ label: string; value: number; color: string }> }
  | { type: "bar-chart"; items: Array<{ label: string; value: number }> }
  | { type: "timeline"; items: Array<{ date: string; label: string; status: "done" | "current" | "pending" }> }
  | { type: "checklist"; items: Array<{ text: string; checked: boolean }> }
  | { type: "summary"; items: string[] }
  | { type: "architecture"; nodes: Array<{ id: string; label: string; x: number; y: number }>; edges: Array<{ from: string; to: string }> };

export interface BigScreenUpdateEvent {
  visualType: VisualType;
  title: string;
  renderData: BigScreenRenderData;
}

export type MonitorContent =
  | { type: "idle"; text: string }
  | { type: "keyPoints"; agentRole: AgentRole; points: string[] }
  | { type: "confirm"; options: string[]; fromAgent: AgentRole }
  | { type: "callout"; message: string; fromAgent: AgentRole }
  | { type: "actionItems"; items: Array<{ description: string; assignee: string }> }
  | { type: "thinking"; text: string }
  | { type: "speaking"; text: string };

export interface MonitorUpdateEvent {
  target: "chairman" | `member:${string}` | AgentRole;
  mode: "idle" | "keyPoints" | "confirm" | "callout" | "actionItems" | "thinking" | "speaking";
  content: MonitorContent;
}

export interface SophiaMessageEvent {
  text: string;
  visualRef?: string;
}

export interface ArtifactsReadyEvent {
  files: Array<{
    name: string;
    type: ArtifactFileType;
    webUrl: string;
    driveItemId?: string;
  }>;
}

// Extend RoomBroadcastEvent
export type MeetingBroadcastEvent =
  | RoomBroadcastEvent
  | { type: "agentThinking"; payload: AgentThinkingEvent }
  | { type: "humanCallout"; payload: HumanCalloutEvent }
  | { type: "bigScreenUpdate"; payload: BigScreenUpdateEvent }
  | { type: "monitorUpdate"; payload: MonitorUpdateEvent }
  | { type: "sophiaMessage"; payload: SophiaMessageEvent }
  | { type: "artifactsReady"; payload: ArtifactsReadyEvent };
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add shared/types.ts
git commit -m "feat(orchestr): add meeting interaction types — TurnState awaiting, Mention, VisualHint, StructuredOutput, Sophia types, new SignalR events"
```

---

### Task 2: Create ResponseParser (pure functions)

**Files:**
- Create: `backend/src/orchestrator/ResponseParser.ts`
- Create: `backend/src/__tests__/ResponseParser.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// backend/src/__tests__/ResponseParser.test.ts
import { describe, it, expect } from "vitest";
import { parseStructuredOutput } from "../orchestrator/ResponseParser.js";

describe("parseStructuredOutput", () => {
  describe("Tier 1: valid JSON + valid schema", () => {
    it("parses complete structured output", () => {
      const raw = JSON.stringify({
        speech: "의장님, A안으로 진행할까요?",
        key_points: ["A안 추천", "비용 절감"],
        mention: { target: "chairman", intent: "confirm", options: ["A안", "B안"] },
        visual_hint: { type: "comparison", title: "A vs B" },
      });
      const result = parseStructuredOutput(raw, "coo");
      expect(result.tier).toBe("schema_valid");
      expect(result.data.speech).toBe("의장님, A안으로 진행할까요?");
      expect(result.data.mention?.target).toBe("chairman");
      expect(result.data.mention?.intent).toBe("confirm");
      expect(result.data.visual_hint?.type).toBe("comparison");
    });

    it("parses output with null mention and visual_hint", () => {
      const raw = JSON.stringify({
        speech: "동의합니다.",
        key_points: ["동의"],
        mention: null,
        visual_hint: null,
      });
      const result = parseStructuredOutput(raw, "cfo");
      expect(result.tier).toBe("schema_valid");
      expect(result.data.mention).toBeNull();
      expect(result.data.visual_hint).toBeNull();
    });

    it("filters self-mention", () => {
      const raw = JSON.stringify({
        speech: "제가 다시 정리하겠습니다.",
        key_points: ["정리"],
        mention: { target: "coo", intent: "opinion" },
        visual_hint: null,
      });
      const result = parseStructuredOutput(raw, "coo");
      expect(result.data.mention).toBeNull();
    });
  });

  describe("Tier 2: JSON repair", () => {
    it("extracts JSON from markdown code fence", () => {
      const raw = '```json\n{"speech":"테스트","key_points":["a"],"mention":null,"visual_hint":null}\n```';
      const result = parseStructuredOutput(raw, "cmo");
      expect(result.tier).toBe("json_repaired");
      expect(result.data.speech).toBe("테스트");
    });
  });

  describe("Tier 3: fallback", () => {
    it("treats plain text as speech", () => {
      const raw = "저는 이 방안에 동의합니다. 예산 검토가 필요합니다.";
      const result = parseStructuredOutput(raw, "cfo");
      expect(result.tier).toBe("fallback");
      expect(result.data.speech).toBe(raw);
      expect(result.data.mention).toBeNull();
      expect(result.data.key_points).toEqual([]);
    });

    it("truncates excessively long fallback speech to 300 chars", () => {
      const raw = "가".repeat(500);
      const result = parseStructuredOutput(raw, "cto");
      expect(result.data.speech.length).toBe(300);
    });
  });

  describe("mention validation", () => {
    it("rejects invalid intent", () => {
      const raw = JSON.stringify({
        speech: "테스트",
        key_points: [],
        mention: { target: "cfo", intent: "invalid_intent" },
        visual_hint: null,
      });
      const result = parseStructuredOutput(raw, "coo");
      expect(result.data.mention).toBeNull();
    });

    it("accepts valid agent role targets", () => {
      for (const target of ["coo", "cfo", "cmo", "cto", "cdo", "clo", "chairman"]) {
        const raw = JSON.stringify({
          speech: "테스트",
          key_points: [],
          mention: { target, intent: "opinion" },
          visual_hint: null,
        });
        const result = parseStructuredOutput(raw, target === "coo" ? "cfo" : "coo");
        expect(result.data.mention?.target).toBe(target);
      }
    });

    it("accepts member: prefix targets", () => {
      const raw = JSON.stringify({
        speech: "마케팅 담당자분?",
        key_points: [],
        mention: { target: "member:마케팅", intent: "opinion" },
        visual_hint: null,
      });
      const result = parseStructuredOutput(raw, "cmo");
      expect(result.data.mention?.target).toBe("member:마케팅");
    });
  });
});
```

- [ ] **Step 2: Verify tests fail**

Run: `cd backend && npx vitest run src/__tests__/ResponseParser.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ResponseParser**

```typescript
// backend/src/orchestrator/ResponseParser.ts
import type { AgentRole, Mention, VisualHint, StructuredAgentOutput } from "../../../shared/types.js";

export type ParseTier = "schema_valid" | "json_repaired" | "fallback";

export interface ParseResult {
  data: StructuredAgentOutput;
  tier: ParseTier;
  error?: string;
}

const VALID_INTENTS = new Set(["opinion", "confirm"]);
const VALID_TARGETS = new Set(["coo", "cfo", "cmo", "cto", "cdo", "clo", "chairman"]);
const VALID_VISUAL_TYPES = new Set([
  "comparison", "pie-chart", "bar-chart", "timeline", "checklist", "summary", "architecture",
]);

function parseMention(raw: unknown, selfRole: AgentRole): Mention | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.target !== "string" || typeof m.intent !== "string") return null;
  if (!VALID_INTENTS.has(m.intent)) return null;

  // Self-mention guard
  if (m.target === selfRole) return null;

  // Validate target
  const isValidRole = VALID_TARGETS.has(m.target);
  const isMemberTarget = m.target.startsWith("member:");
  if (!isValidRole && !isMemberTarget) return null;

  return {
    target: m.target as Mention["target"],
    intent: m.intent as "opinion" | "confirm",
    options: Array.isArray(m.options) ? m.options.map(String) : undefined,
  };
}

function parseVisualHint(raw: unknown): VisualHint | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.type !== "string" || typeof v.title !== "string") return null;
  if (!VALID_VISUAL_TYPES.has(v.type)) return null;
  return { type: v.type as VisualHint["type"], title: v.title };
}

function validateAndExtract(
  parsed: Record<string, unknown>,
  selfRole: AgentRole,
): StructuredAgentOutput | null {
  if (typeof parsed.speech !== "string") return null;
  return {
    speech: parsed.speech,
    key_points: Array.isArray(parsed.key_points)
      ? parsed.key_points.filter((k): k is string => typeof k === "string")
      : [],
    mention: parseMention(parsed.mention, selfRole),
    visual_hint: parseVisualHint(parsed.visual_hint),
  };
}

export function parseStructuredOutput(raw: string, selfRole: AgentRole): ParseResult {
  // Tier 1: Direct parse + validation
  try {
    const parsed = JSON.parse(raw);
    const data = validateAndExtract(parsed, selfRole);
    if (data) {
      return { data, tier: "schema_valid" };
    }
  } catch {
    // Not valid JSON — continue to Tier 2
  }

  // Tier 2: Repair — extract JSON from markdown fences or raw braces
  const jsonMatch = raw.match(/```json?\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
  if (jsonMatch) {
    try {
      const repaired = JSON.parse(jsonMatch[1]);
      const data = validateAndExtract(repaired, selfRole);
      if (data) {
        return { data, tier: "json_repaired" };
      }
    } catch {
      // Repair failed — continue to Tier 3
    }
  }

  // Tier 3: Graceful fallback
  return {
    data: {
      speech: raw.slice(0, 300),
      key_points: [],
      mention: null,
      visual_hint: null,
    },
    tier: "fallback",
    error: `Failed to parse structured output from ${selfRole}`,
  };
}
```

- [ ] **Step 4: Verify tests pass**

Run: `cd backend && npx vitest run src/__tests__/ResponseParser.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/orchestrator/ResponseParser.ts backend/src/__tests__/ResponseParser.test.ts
git commit -m "feat(orchestr): add ResponseParser with 3-tier parse strategy and self-mention guard"
```

---

### Task 3: Update ModelRouter with new TaskTypes

**Files:**
- Modify: `backend/src/services/ModelRouter.ts`
- Create: `backend/src/__tests__/ModelRouter.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// backend/src/__tests__/ModelRouter.test.ts
import { describe, it, expect, vi } from "vitest";
import { getModelForTask, getTemperatureForTask } from "../services/ModelRouter.js";

describe("getModelForTask", () => {
  it("returns premium model for agent-response", () => {
    const model = getModelForTask("agent-response");
    expect(model).toBeTruthy();
  });

  it("returns fast model for visual-gen", () => {
    const model = getModelForTask("visual-gen");
    expect(model).toBeTruthy();
    expect(model).not.toBe(getModelForTask("agent-response"));
  });

  it("returns premium model for minutes", () => {
    expect(getModelForTask("minutes")).toBe(getModelForTask("agent-response"));
  });

  it("supports legacy chat type (backward compat)", () => {
    expect(getModelForTask("chat")).toBeTruthy();
  });
});

describe("getTemperatureForTask", () => {
  it("returns 0.5 for agent-response", () => {
    expect(getTemperatureForTask("agent-response")).toBe(0.5);
  });

  it("returns 0.2 for visual-gen", () => {
    expect(getTemperatureForTask("visual-gen")).toBe(0.2);
  });

  it("returns 0.4 for minutes", () => {
    expect(getTemperatureForTask("minutes")).toBe(0.4);
  });

  it("returns 0.1 for parse-fallback", () => {
    expect(getTemperatureForTask("parse-fallback")).toBe(0.1);
  });
});
```

- [ ] **Step 2: Verify tests fail**

Run: `cd backend && npx vitest run src/__tests__/ModelRouter.test.ts`
Expected: FAIL

- [ ] **Step 3: Update ModelRouter**

```typescript
// backend/src/services/ModelRouter.ts
export type TaskType =
  | "agent-response"
  | "visual-gen"
  | "minutes"
  | "parse-fallback"
  // Legacy (backward compat — will be removed after migration)
  | "chat"
  | "artifact"
  | "research"
  | "summary";

export function getModelForTask(task: TaskType): string {
  switch (task) {
    case "agent-response":
    case "minutes":
    case "chat":        // legacy
    case "research":    // legacy
    case "summary":     // legacy
      return process.env.AZURE_OPENAI_DEPLOYMENT_PREMIUM
        ?? process.env.AZURE_OPENAI_DEPLOYMENT
        ?? "gpt-4o";
    case "visual-gen":
    case "parse-fallback":
    case "artifact":    // legacy
      return process.env.AZURE_OPENAI_DEPLOYMENT_FAST
        ?? process.env.AZURE_OPENAI_DEPLOYMENT_MINI
        ?? "gpt-4o-mini";
  }
}

export function getTemperatureForTask(task: TaskType): number {
  switch (task) {
    case "agent-response":
    case "chat":
    case "research":
      return 0.5;
    case "visual-gen":
      return 0.2;
    case "minutes":
    case "summary":
      return 0.4;
    case "parse-fallback":
    case "artifact":
      return 0.1;
  }
}
```

- [ ] **Step 4: Verify tests pass + TypeScript compiles**

Run: `cd backend && npx vitest run src/__tests__/ModelRouter.test.ts && npx tsc --noEmit`
Expected: All PASS, 0 TS errors

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/ModelRouter.ts backend/src/__tests__/ModelRouter.test.ts
git commit -m "feat(orchestr): update ModelRouter with new TaskTypes and task-based temperature"
```

---

## Chunk 2: TurnManager — Awaiting State & Mention Routing

### Task 4: Add awaiting state and onHumanResponse to TurnManager

**Files:**
- Modify: `backend/src/orchestrator/TurnManager.ts`
- Modify: `backend/src/constants/turnConfig.ts`
- Create: `backend/src/__tests__/TurnManager.awaiting.test.ts`

- [ ] **Step 1: Add HUMAN_CALLOUT_TIMEOUT_MS to turnConfig**

```typescript
// Append to backend/src/constants/turnConfig.ts
export const HUMAN_CALLOUT_TIMEOUT_MS = 30000;
```

- [ ] **Step 2: Write failing tests for awaiting state**

```typescript
// backend/src/__tests__/TurnManager.awaiting.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TurnManager } from "../orchestrator/TurnManager.js";

describe("TurnManager awaiting state", () => {
  let tm: TurnManager;
  const roomId = "test-room-awaiting";

  beforeEach(() => {
    vi.useFakeTimers();
    tm = new TurnManager();
    tm.initRoom(roomId, "chairman-user");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("transitions to awaiting when human mention is detected", () => {
    // Must be in speaking state to enter awaiting
    const room = (tm as any).rooms.get(roomId);
    room.state = "speaking";

    const stateChanges: string[] = [];
    tm.on("stateChanged:" + roomId, (_rid: string, state: string) => {
      stateChanges.push(state);
    });

    tm.enterAwaitingState(roomId, {
      target: "chairman",
      intent: "confirm",
      options: ["A안", "B안"],
      fromAgent: "cfo",
    });

    expect(stateChanges).toContain("awaiting");
  });

  it("emits humanCallout event when entering awaiting", () => {
    const room = (tm as any).rooms.get(roomId);
    room.state = "speaking";

    let calloutPayload: unknown = null;
    tm.on("humanCallout:" + roomId, (_rid: string, payload: unknown) => {
      calloutPayload = payload;
    });

    tm.enterAwaitingState(roomId, {
      target: "chairman",
      intent: "confirm",
      options: ["A안"],
      fromAgent: "coo",
    });

    expect(calloutPayload).toBeTruthy();
  });

  it("resumes queue on human response", () => {
    const room = (tm as any).rooms.get(roomId);
    room.state = "speaking";

    tm.enterAwaitingState(roomId, {
      target: "chairman",
      intent: "opinion",
      fromAgent: "cmo",
    });

    tm.onHumanResponse(roomId, "chairman-user", "A안으로 하겠습니다");
    // State should no longer be awaiting
    expect(room.state).not.toBe("awaiting");
  });

  it("auto-resumes after 30s timeout", () => {
    const room = (tm as any).rooms.get(roomId);
    room.state = "speaking";

    tm.enterAwaitingState(roomId, {
      target: "chairman",
      intent: "confirm",
      options: ["A안"],
      fromAgent: "cfo",
    });

    vi.advanceTimersByTime(30000);

    expect(room.state).not.toBe("awaiting");
  });

  it("clears timeout when human responds before timeout", () => {
    const room = (tm as any).rooms.get(roomId);
    room.state = "speaking";

    tm.enterAwaitingState(roomId, {
      target: "chairman",
      intent: "opinion",
      fromAgent: "cto",
    });

    tm.onHumanResponse(roomId, "chairman-user", "동의합니다");
    vi.advanceTimersByTime(30000);

    // Should not emit double-resume
    expect(room.state).not.toBe("awaiting");
  });

  it("ignores human response if state is not awaiting", () => {
    // Room is in idle state
    const room = (tm as any).rooms.get(roomId);
    expect(room.state).toBe("idle");

    // This should be a no-op
    tm.onHumanResponse(roomId, "chairman-user", "test");
    expect(room.state).toBe("idle");
  });
});
```

- [ ] **Step 3: Verify tests fail**

Run: `cd backend && npx vitest run src/__tests__/TurnManager.awaiting.test.ts`
Expected: FAIL — methods not found

- [ ] **Step 4: Implement awaiting state in TurnManager**

Add to `RoomTurnState` interface:
```typescript
awaitingTimer: ReturnType<typeof setTimeout> | null;
awaitingGeneration: number;
```

Add methods to `TurnManager` class:
```typescript
enterAwaitingState(
  roomId: string,
  callout: { target: string; intent: string; options?: string[]; fromAgent: AgentRole },
): void {
  const room = this.getRoom(roomId);
  if (room.state !== "speaking") return;

  this.transition(roomId, "awaiting");
  room.awaitingGeneration++;

  this.emit("humanCallout:" + roomId, roomId, callout);

  const gen = room.awaitingGeneration;
  room.awaitingTimer = setTimeout(() => {
    if (room.awaitingGeneration !== gen) return;
    if (room.state !== "awaiting") return;
    this.resumeFromAwaiting(roomId, "[의장님이 응답하지 않아 계속 진행합니다]");
  }, HUMAN_CALLOUT_TIMEOUT_MS);
}

onHumanResponse(roomId: string, _userId: string, text: string): void {
  const room = this.getRoom(roomId);
  if (room.state !== "awaiting") return;

  if (room.awaitingTimer) {
    clearTimeout(room.awaitingTimer);
    room.awaitingTimer = null;
  }

  this.clearFlushTimer(room);
  room.inputBuffer = [];

  this.resumeFromAwaiting(roomId, text);
}

private resumeFromAwaiting(roomId: string, responseText: string): void {
  const room = this.getRoom(roomId);
  this.emit("humanResponseReceived:" + roomId, roomId, responseText);

  if (room.agentQueue.length > 0) {
    this.transition(roomId, "speaking");
    this.triggerNextAgent(roomId);
  } else {
    this.transition(roomId, "idle");
  }
}
```

Update `initRoom` to initialize new fields:
```typescript
awaitingTimer: null,
awaitingGeneration: 0,
```

Update `transition` method to accept "awaiting" as valid state.

- [ ] **Step 5: Verify tests pass**

Run: `cd backend && npx vitest run src/__tests__/TurnManager.awaiting.test.ts`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/orchestrator/TurnManager.ts backend/src/constants/turnConfig.ts backend/src/__tests__/TurnManager.awaiting.test.ts
git commit -m "feat(orchestr): add awaiting state with human callout, timeout, and race condition defenses"
```

---

### Task 5: Add mention-based routing to onAgentDone

**Files:**
- Modify: `backend/src/orchestrator/TurnManager.ts`
- Modify: `backend/src/__tests__/TurnManager.awaiting.test.ts`

- [ ] **Step 1: Write tests for mention routing**

Append to `TurnManager.awaiting.test.ts`:
```typescript
describe("mention-based routing in onAgentDone", () => {
  it("adds mentioned agent to queue", () => {
    tm.handleMentionRouting(roomId, {
      speech: "CFO 의견이 필요합니다",
      key_points: [],
      mention: { target: "cfo", intent: "opinion" },
      visual_hint: null,
    }, "coo");

    const room = (tm as any).rooms.get(roomId);
    expect(room.agentQueue.some((q: any) => q.role === "cfo")).toBe(true);
  });

  it("enters awaiting state on chairman mention", () => {
    let calloutEmitted = false;
    tm.on("humanCallout:" + roomId, () => {
      calloutEmitted = true;
    });

    // Put room in speaking state first
    const room = (tm as any).rooms.get(roomId);
    room.state = "speaking";

    tm.handleMentionRouting(roomId, {
      speech: "의장님 결정이 필요합니다",
      key_points: [],
      mention: { target: "chairman", intent: "confirm", options: ["A안"] },
      visual_hint: null,
    }, "cfo");

    expect(calloutEmitted).toBe(true);
  });

  it("falls back to keyword checkFollowUp when mention is null", () => {
    // This should use existing keyword-based A2A
    tm.handleMentionRouting(roomId, {
      speech: "예산 검토가 필요합니다",
      key_points: [],
      mention: null,
      visual_hint: null,
    }, "coo");

    // checkFollowUp should detect "예산" → cfo
    // (existing behavior, just verify no crash)
  });
});
```

- [ ] **Step 2: Implement handleMentionRouting**

Add to `TurnManager`:
```typescript
handleMentionRouting(
  roomId: string,
  output: StructuredAgentOutput,
  fromAgent: AgentRole,
): void {
  const room = this.getRoom(roomId);

  if (output.mention) {
    const { target, intent, options } = output.mention;

    if (target === "chairman" || target.startsWith("member:")) {
      // Human callout — enter awaiting state
      this.enterAwaitingState(roomId, {
        target,
        intent,
        options,
        fromAgent,
      });
      return;
    }

    // Agent-to-agent mention
    if (VALID_AGENT_ROLES.has(target as AgentRole)) {
      room.agentQueue.push({ role: target as AgentRole, priority: 1 });
    }
  } else {
    // Fallback: keyword-based checkFollowUp (backward compat)
    const followUp = checkFollowUp({ role: fromAgent, content: output.speech });
    if (followUp) {
      room.agentQueue.push({ role: followUp, priority: 2 });
    }
  }
}
```

- [ ] **Step 3: Verify tests pass**

Run: `cd backend && npx vitest run src/__tests__/TurnManager.awaiting.test.ts`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/orchestrator/TurnManager.ts backend/src/__tests__/TurnManager.awaiting.test.ts
git commit -m "feat(orchestr): add mention-based routing with checkFollowUp fallback"
```

---

### Task 6: Add human-response HTTP endpoint

**Files:**
- Modify: `backend/src/functions/meeting-chairman.ts`

- [ ] **Step 1: Add humanResponse handler**

```typescript
async function humanResponse(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const { roomId, userId, text } = (await request.json()) as {
    roomId?: string;
    userId?: string;
    text?: string;
  };
  if (!roomId || !userId || !text) {
    return { status: 400, jsonBody: { error: "roomId, userId, text required" } };
  }
  turnManager.onHumanResponse(roomId, userId, text);
  return { status: 200, jsonBody: { success: true } };
}

app.http("humanResponse", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "api/meeting/human-response",
  handler: humanResponse,
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add backend/src/functions/meeting-chairman.ts
git commit -m "feat(api): add POST /api/meeting/human-response for chairman/member callout replies"
```

---

## Chunk 3: Structured Agent Pipeline & Prompts

### Task 7: Update common prompt with structured output + few-shot

**Files:**
- Modify: `backend/src/agents/prompts/common.ts`

- [ ] **Step 1: Add structured output format instructions**

Append to `getCommonPrompt()` return value (after existing content):
```typescript
const STRUCTURED_OUTPUT_FORMAT = `
## 응답 형식
반드시 JSON으로 응답합니다. 스키마는 자동 강제됩니다.
- speech: 한국어 발언 (80-180자). 60자 미만은 너무 짧고, 200자 초과는 너무 깁니다.
- key_points: 핵심 2-4개 (의장 모니터에 표시)
- mention: 호명 대상 또는 null
- visual_hint: 시각자료 힌트 (type + title만) 또는 null

## 호명 규칙
다음 값만 사용합니다. 목록에 없는 값은 절대 사용하지 않습니다.

target 허용 값:
- "coo", "cfo", "cmo", "cto", "cdo", "clo" — 다른 임원 (자기 자신 제외)
- "chairman" — 의장
- "member:{참석자 역할}" — 팀원

intent 허용 값:
- "opinion" — 의견 요청
- "confirm" — 결정 요청 (chairman에만, options 필수)

금지: 자기 자신 호명, 미참석 임원 호명

## 시각자료 힌트
type과 title만 제공합니다. 데이터는 Sophia가 자동 생성합니다.
타입: comparison | pie-chart | bar-chart | timeline | checklist | summary | architecture

## 응답 예시
예시 1: {"speech": "마케팅 전략은 좋습니다. 예산 계획이 필요합니다.", "key_points": ["마케팅 긍정적", "예산 필요"], "mention": {"target": "cfo", "intent": "opinion"}, "visual_hint": null}
예시 2: {"speech": "두 방안을 비교하겠습니다. 의장님 결정 부탁드립니다.", "key_points": ["A안: 저비용", "B안: 고수익"], "mention": {"target": "chairman", "intent": "confirm", "options": ["A안", "B안"]}, "visual_hint": {"type": "comparison", "title": "A안 vs B안"}}
예시 3: {"speech": "이번 분기 12% 성장했습니다.", "key_points": ["12% 성장", "목표 초과"], "mention": null, "visual_hint": null}
`;
```

Export and integrate into `getCommonPrompt()`:
```typescript
export { STRUCTURED_OUTPUT_FORMAT };

// In getCommonPrompt(), append at the end of the return value:
export function getCommonPrompt(agentRole: string, agentName: string): string {
  // ...existing prompt content...
  return existingPrompt + "\n\n" + STRUCTURED_OUTPUT_FORMAT;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd backend && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add backend/src/agents/prompts/common.ts
git commit -m "feat(agent): add structured output format + few-shot examples to common prompt"
```

---

### Task 8: Create JSON schema constant for Chat Completions

**Files:**
- Create: `backend/src/constants/responseSchema.ts`

- [ ] **Step 1: Create schema file**

```typescript
// backend/src/constants/responseSchema.ts
export const CSUITE_RESPONSE_SCHEMA = {
  name: "csuite_response",
  strict: true,
  schema: {
    type: "object" as const,
    properties: {
      speech: { type: "string" as const, description: "Spoken text in Korean, 80-180 chars" },
      key_points: { type: "array" as const, items: { type: "string" as const } },
      mention: {
        anyOf: [
          { type: "null" as const },
          {
            type: "object" as const,
            properties: {
              target: { type: "string" as const },
              intent: { type: "string" as const, enum: ["opinion", "confirm"] },
              options: {
                anyOf: [
                  { type: "null" as const },
                  { type: "array" as const, items: { type: "string" as const } },
                ],
              },
            },
            required: ["target", "intent", "options"] as const,
            additionalProperties: false,
          },
        ],
      },
      visual_hint: {
        anyOf: [
          { type: "null" as const },
          {
            type: "object" as const,
            properties: {
              type: {
                type: "string" as const,
                enum: ["comparison", "pie-chart", "bar-chart", "timeline", "checklist", "summary", "architecture"],
              },
              title: { type: "string" as const },
            },
            required: ["type", "title"],
            additionalProperties: false,
          },
        ],
      },
    },
    required: ["speech", "key_points", "mention", "visual_hint"],
    additionalProperties: false,
  },
} as const;
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/constants/responseSchema.ts
git commit -m "feat(agent): add CSUITE_RESPONSE_SCHEMA for json_schema strict mode"
```

---

## Chunk 4: Sophia Agent

### Task 9: Create SophiaAgent class

**Files:**
- Create: `backend/src/agents/SophiaAgent.ts`
- Create: `backend/src/agents/prompts/sophia.ts`
- Create: `backend/src/__tests__/SophiaAgent.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// backend/src/__tests__/SophiaAgent.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { SophiaAgent } from "../agents/SophiaAgent.js";

describe("SophiaAgent", () => {
  let sophia: SophiaAgent;
  const roomId = "test-room-sophia";

  beforeEach(() => {
    sophia = new SophiaAgent();
    sophia.initRoom(roomId);
  });

  describe("buffer accumulation", () => {
    it("accumulates agent responses in buffer", () => {
      sophia.addToBuffer(roomId, {
        speaker: "Hudson",
        role: "coo",
        speech: "정리하겠습니다.",
        keyPoints: ["정리"],
        visualHint: null,
        timestamp: Date.now(),
      });

      const state = sophia.getRoomState(roomId);
      expect(state?.buffer.length).toBe(1);
    });

    it("caps buffer at 200 entries", () => {
      for (let i = 0; i < 210; i++) {
        sophia.addToBuffer(roomId, {
          speaker: "Hudson",
          role: "coo",
          speech: `발언 ${i}`,
          keyPoints: [],
          visualHint: null,
          timestamp: Date.now(),
        });
      }

      const state = sophia.getRoomState(roomId);
      expect(state!.buffer.length).toBeLessThanOrEqual(200);
    });
  });

  describe("room lifecycle", () => {
    it("cleans up room state on destroy", () => {
      sophia.destroyRoom(roomId);
      expect(sophia.getRoomState(roomId)).toBeUndefined();
    });
  });

  describe("visual hint detection", () => {
    it("returns true when structured output has visual_hint", () => {
      expect(sophia.hasVisualHint({
        speech: "test",
        key_points: [],
        mention: null,
        visual_hint: { type: "comparison", title: "test" },
      })).toBe(true);
    });

    it("returns false when visual_hint is null", () => {
      expect(sophia.hasVisualHint({
        speech: "test",
        key_points: [],
        mention: null,
        visual_hint: null,
      })).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Verify tests fail**

Run: `cd backend && npx vitest run src/__tests__/SophiaAgent.test.ts`

- [ ] **Step 3: Implement SophiaAgent**

```typescript
// backend/src/agents/SophiaAgent.ts
import type {
  AgentRole, VisualHint, VisualType, StructuredAgentOutput,
  BigScreenRenderData,
} from "../../../shared/types.js";

export interface SophiaBufferEntry {
  speaker: string;
  role: string;
  speech: string;
  keyPoints: string[];
  visualHint: VisualHint | null;
  timestamp: number;
}

export interface VisualArtifact {
  type: VisualType;
  title: string;
  renderData: BigScreenRenderData;
  timestamp: number;
  agendaItem: string;
}

interface ActionItemDraft {
  description: string;
  assignee: string;
  deadline?: string;
}

export interface SophiaState {
  roomId: string;
  buffer: SophiaBufferEntry[];
  decisions: string[];
  actionItems: ActionItemDraft[];
  visualHistory: VisualArtifact[];
}

const MAX_BUFFER_SIZE = 200;

export class SophiaAgent {
  private rooms = new Map<string, SophiaState>();
  private pendingVisualAbort = new Map<string, AbortController>();

  initRoom(roomId: string): void {
    this.rooms.set(roomId, {
      roomId,
      buffer: [],
      decisions: [],
      actionItems: [],
      visualHistory: [],
    });
  }

  getRoomState(roomId: string): SophiaState | undefined {
    return this.rooms.get(roomId);
  }

  destroyRoom(roomId: string): void {
    const aborter = this.pendingVisualAbort.get(roomId);
    if (aborter) aborter.abort();
    this.pendingVisualAbort.delete(roomId);
    this.rooms.delete(roomId);
  }

  addToBuffer(roomId: string, entry: SophiaBufferEntry): void {
    const state = this.rooms.get(roomId);
    if (!state) return;

    if (state.buffer.length >= MAX_BUFFER_SIZE) {
      state.buffer = state.buffer.slice(-150);
    }
    state.buffer.push(entry);
  }

  addDecision(roomId: string, decision: string): void {
    const state = this.rooms.get(roomId);
    if (state) state.decisions.push(decision);
  }

  hasVisualHint(output: StructuredAgentOutput): boolean {
    return output.visual_hint !== null;
  }

  getRecentSpeeches(roomId: string, count: number = 3): string[] {
    const state = this.rooms.get(roomId);
    if (!state) return [];
    return state.buffer.slice(-count).map((e) => `${e.speaker}: ${e.speech}`);
  }

  cancelPendingVisual(roomId: string): void {
    const prev = this.pendingVisualAbort.get(roomId);
    if (prev) prev.abort();
  }

  setPendingVisualAbort(roomId: string, controller: AbortController): void {
    this.pendingVisualAbort.set(roomId, controller);
  }

  clearPendingVisualAbort(roomId: string, controller: AbortController): void {
    if (this.pendingVisualAbort.get(roomId) === controller) {
      this.pendingVisualAbort.delete(roomId);
    }
  }

  addVisualToHistory(roomId: string, artifact: VisualArtifact): void {
    const state = this.rooms.get(roomId);
    if (state) state.visualHistory.push(artifact);
  }
}

export const sophiaAgent = new SophiaAgent();
```

- [ ] **Step 4: Create Sophia visual system prompt**

```typescript
// backend/src/agents/prompts/sophia.ts
export const SOPHIA_VISUAL_SYSTEM_PROMPT = `당신은 BizRoom.ai의 데이터 시각화 어시스턴트입니다.
visual_hint와 최근 대화 맥락을 바탕으로 BigScreenRenderData JSON을 생성합니다.

## type별 data 구조
comparison: {"type":"comparison","columns":["항목","A","B"],"rows":[["비용","1억","2억"]]}
pie-chart: {"type":"pie-chart","items":[{"label":"항목","value":40,"color":"#f97316"}]}
bar-chart: {"type":"bar-chart","items":[{"label":"항목","value":120}]}
timeline: {"type":"timeline","items":[{"date":"3월","label":"기획","status":"done"}]}
checklist: {"type":"checklist","items":[{"text":"항목","checked":true}]}
summary: {"type":"summary","items":["포인트1","포인트2"]}
architecture: {"type":"architecture","nodes":[{"id":"n1","label":"이름","x":0,"y":0}],"edges":[{"from":"n1","to":"n2"}]}

## 규칙
- 모든 텍스트는 한국어
- value는 정수
- color는 hex 코드, pie-chart에만 사용
- 데이터는 대화 맥락에서 추출, 없으면 합리적으로 추정
- items 개수: 3-7개`;

export const SOPHIA_MINUTES_SYSTEM_PROMPT = `당신은 BizRoom.ai의 회의록 작성 어시스턴트입니다.

먼저 회의 전체 흐름을 분석합니다:
1. 논의된 핵심 안건을 정리합니다
2. 각 안건별 결정 사항을 확인합니다
3. 미결 사항과 액션아이템을 구분합니다

분석 후, 아래 JSON 형식으로 회의록을 작성합니다:
{
  "meetingInfo": {"title": "...", "date": "...", "participants": ["..."]},
  "agendas": [{"title": "...", "summary": "...", "keyPoints": ["..."], "decisions": ["..."], "visualRefs": ["..."]}],
  "actionItems": [{"description": "...", "assignee": "...", "deadline": "..."}],
  "budgetData": [{"label": "...", "value": 0}]
}

모든 텍스트는 한국어로 작성합니다. 대화 기록을 그대로 복사하지 말고, 핵심 내용을 요약·정리합니다.`;
```

- [ ] **Step 5: Verify tests pass**

Run: `cd backend && npx vitest run src/__tests__/SophiaAgent.test.ts && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add backend/src/agents/SophiaAgent.ts backend/src/agents/prompts/sophia.ts backend/src/__tests__/SophiaAgent.test.ts
git commit -m "feat(agent): add SophiaAgent with buffer management, visual hint detection, and system prompts"
```

---

### Task 10: Wire Sophia into VoiceLiveOrchestrator

**Files:**
- Modify: `backend/src/orchestrator/VoiceLiveOrchestrator.ts`

- [ ] **Step 1: Import and wire Sophia events**

In `wireVoiceLiveForRoom()`, after existing `agentDone` wiring:
```typescript
import { sophiaAgent } from "../agents/SophiaAgent.js";
import { parseStructuredOutput } from "./ResponseParser.js";
import { broadcastEvent } from "../services/SignalRService.js";
import type { AgentRole, VisualHint, StructuredAgentOutput } from "../../../shared/types.js";

// In wireVoiceLiveForRoom():
// Sophia wiring — parallel background pipeline
addRoomListener(roomId, voiceLiveManager, "agentDone:" + roomId,
  (_rid: string, role: AgentRole, fullText: string) => {
    const parsed = parseStructuredOutput(fullText, role);

    // 1. Buffer accumulation (always)
    sophiaAgent.addToBuffer(roomId, {
      speaker: agentConfigs[role]?.name ?? role,
      role,
      speech: parsed.data.speech,
      keyPoints: parsed.data.key_points,
      visualHint: parsed.data.visual_hint,
      timestamp: Date.now(),
    });

    // 2. Key points relay (no GPT call)
    if (parsed.data.key_points.length > 0) {
      broadcastEvent(roomId, {
        type: "monitorUpdate",
        payload: {
          target: "chairman",
          mode: "keyPoints",
          content: { type: "keyPoints", agentRole: role, points: parsed.data.key_points },
        },
      });
    }

    // 3. Mention routing
    turnManager.handleMentionRouting(roomId, parsed.data, role);

    // 4. Visual generation (fire-and-forget)
    if (sophiaAgent.hasVisualHint(parsed.data)) {
      generateSophiaVisual(roomId, parsed.data.visual_hint!, parsed.data).catch((err) => {
        console.error("[Sophia] Visual generation failed:", err);
      });
    }
  }
);
```

- [ ] **Step 2: Add callSophiaVisualGPT function**

```typescript
import { SOPHIA_VISUAL_SYSTEM_PROMPT } from "../agents/prompts/sophia.js";
import { getModelForTask, getTemperatureForTask } from "../services/ModelRouter.js";
import type { BigScreenRenderData, VisualHint } from "../../../shared/types.js";

async function callSophiaVisualGPT(
  roomId: string,
  hint: VisualHint,
  signal: AbortSignal,
): Promise<BigScreenRenderData> {
  const recentContext = sophiaAgent.getRecentSpeeches(roomId, 5).join("\n");
  const openai = getOpenAIClient();
  const response = await openai.chat.completions.create(
    {
      model: getModelForTask("visual-gen"),
      temperature: getTemperatureForTask("visual-gen"),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SOPHIA_VISUAL_SYSTEM_PROMPT },
        { role: "user", content: `visual_hint: ${JSON.stringify(hint)}\n\n최근 대화:\n${recentContext}\n\ntype="${hint.type}"에 맞는 BigScreenRenderData JSON을 생성하세요.` },
      ],
    },
    { signal },
  );
  const content = response.choices[0]?.message?.content ?? "{}";
  return JSON.parse(content) as BigScreenRenderData;
}
```

- [ ] **Step 3: Add visual generation function**

```typescript
async function generateSophiaVisual(
  roomId: string,
  hint: VisualHint,
  _output: StructuredAgentOutput,
): Promise<void> {
  sophiaAgent.cancelPendingVisual(roomId);
  const controller = new AbortController();
  sophiaAgent.setPendingVisualAbort(roomId, controller);

  try {
    const renderData = await callSophiaVisualGPT(roomId, hint, controller.signal);
    if (controller.signal.aborted) return;

    broadcastEvent(roomId, {
      type: "bigScreenUpdate",
      payload: { visualType: hint.type, title: hint.title, renderData },
    });
    broadcastEvent(roomId, {
      type: "sophiaMessage",
      payload: { text: `📊 ${hint.title}를 빅스크린에 띄웠습니다` },
    });

    sophiaAgent.addVisualToHistory(roomId, {
      type: hint.type,
      title: hint.title,
      renderData,
      timestamp: Date.now(),
      agendaItem: "",
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return;
    throw err;
  } finally {
    sophiaAgent.clearPendingVisualAbort(roomId, controller);
  }
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd backend && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add backend/src/orchestrator/VoiceLiveOrchestrator.ts
git commit -m "feat(orchestr): wire Sophia background pipeline into VoiceLiveOrchestrator"
```

---

## Chunk 5: Microsoft Artifact Generation

### Task 11: Install new dependencies

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install packages**

Run: `cd backend && npm install pptxgenjs exceljs @azure/msal-node @microsoft/microsoft-graph-client partial-json`

- [ ] **Step 2: Verify install**

Run: `cd backend && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore: add pptxgenjs, exceljs, msal-node, graph-client, partial-json dependencies"
```

---

### Task 12: Create ArtifactGenerator

**Files:**
- Create: `backend/src/services/ArtifactGenerator.ts`

- [ ] **Step 1: Implement PPT and Excel generators**

```typescript
// backend/src/services/ArtifactGenerator.ts
import PptxGenJS from "pptxgenjs";
import ExcelJS from "exceljs";

export interface MeetingMinutesData {
  meetingInfo: { title: string; date: string; participants: string[] };
  agendas: Array<{
    title: string;
    summary: string;
    keyPoints: string[];
    decisions: string[];
    visualRefs: string[];
  }>;
  actionItems: Array<{ description: string; assignee: string; deadline?: string }>;
  budgetData?: Array<{ label: string; value: number }>;
}

export async function generatePPT(data: MeetingMinutesData): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";

  // Title slide
  const titleSlide = pptx.addSlide();
  titleSlide.addText(data.meetingInfo.title, {
    x: 1, y: 1.5, w: 8, h: 1.5, fontSize: 28, bold: true, color: "1a1a2e",
  });
  titleSlide.addText(data.meetingInfo.date, {
    x: 1, y: 3, w: 8, h: 0.5, fontSize: 14, color: "666666",
  });
  titleSlide.addText(`참석자: ${data.meetingInfo.participants.join(", ")}`, {
    x: 1, y: 3.5, w: 8, h: 0.5, fontSize: 12, color: "888888",
  });

  // Agenda slides
  for (const agenda of data.agendas) {
    const slide = pptx.addSlide();
    slide.addText(agenda.title, {
      x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 22, bold: true, color: "1a1a2e",
    });
    slide.addText(agenda.summary, {
      x: 0.5, y: 1.2, w: 9, h: 1, fontSize: 14, color: "333333",
    });
    const bullets = agenda.keyPoints.map((kp) => ({ text: kp, options: { fontSize: 12 } }));
    slide.addText(bullets, { x: 0.5, y: 2.5, w: 9, h: 2, bullet: true, color: "555555" });
  }

  // Action items slide
  if (data.actionItems.length > 0) {
    const actionSlide = pptx.addSlide();
    actionSlide.addText("액션 아이템", {
      x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 22, bold: true, color: "1a1a2e",
    });
    const rows: Array<Array<{ text: string }>> = [
      [{ text: "항목" }, { text: "담당자" }, { text: "기한" }],
      ...data.actionItems.map((ai) => [
        { text: ai.description },
        { text: ai.assignee },
        { text: ai.deadline ?? "-" },
      ]),
    ];
    actionSlide.addTable(rows, {
      x: 0.5, y: 1.5, w: 9, fontSize: 11,
      border: { type: "solid", pt: 0.5, color: "CCCCCC" },
    });
  }

  const buffer = await pptx.write({ outputType: "nodebuffer" });
  return buffer as Buffer;
}

export async function generateExcel(data: MeetingMinutesData): Promise<Buffer | null> {
  if (!data.budgetData?.length) return null;

  const workbook = new ExcelJS.Workbook();

  // Budget sheet
  const budgetSheet = workbook.addWorksheet("예산 분석");
  budgetSheet.addRow(["항목", "금액"]);
  for (const item of data.budgetData) {
    budgetSheet.addRow([item.label, item.value]);
  }
  budgetSheet.columns = [{ width: 25 }, { width: 15 }];

  // Action items sheet
  const actionSheet = workbook.addWorksheet("액션아이템");
  actionSheet.addRow(["항목", "담당자", "기한", "상태"]);
  for (const item of data.actionItems) {
    actionSheet.addRow([item.description, item.assignee, item.deadline ?? "-", "대기"]);
  }
  actionSheet.columns = [{ width: 30 }, { width: 15 }, { width: 15 }, { width: 10 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd backend && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/ArtifactGenerator.ts
git commit -m "feat(artifact): add PPT and Excel generators using pptxgenjs and exceljs"
```

---

### Task 13: Create GraphService

**Files:**
- Create: `backend/src/services/GraphService.ts`

- [ ] **Step 1: Implement Graph API client**

```typescript
// backend/src/services/GraphService.ts
import { ConfidentialClientApplication } from "@azure/msal-node";
import { Client } from "@microsoft/microsoft-graph-client";

let cachedCCA: ConfidentialClientApplication | null = null;

function getCCA(): ConfidentialClientApplication | null {
  if (cachedCCA) return cachedCCA;

  const clientId = process.env.GRAPH_CLIENT_ID;
  const tenantId = process.env.GRAPH_TENANT_ID;
  const clientSecret = process.env.GRAPH_CLIENT_SECRET;

  if (!clientId || !tenantId || !clientSecret) {
    console.warn("[GraphService] Missing GRAPH_* env vars — OneDrive/Planner disabled");
    return null;
  }

  cachedCCA = new ConfidentialClientApplication({
    auth: { clientId, authority: `https://login.microsoftonline.com/${tenantId}`, clientSecret },
  });
  return cachedCCA;
}

async function getGraphClient(): Promise<Client | null> {
  const cca = getCCA();
  if (!cca) return null;

  // Acquire fresh token each call — MSAL caches internally and refreshes on expiry
  const result = await cca.acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });
  if (!result) return null;

  return Client.init({
    authProvider: (done) => done(null, result.accessToken),
  });
}

export async function uploadToOneDrive(
  fileName: string,
  content: Buffer,
): Promise<{ webUrl: string; driveItemId: string } | null> {
  try {
    const client = await getGraphClient();
    if (!client) return null;

    // client_credentials uses /drives/{driveId} — /me/ requires delegated auth
    const driveId = process.env.GRAPH_DRIVE_ID;
    if (!driveId) {
      console.warn("[GraphService] GRAPH_DRIVE_ID not set — OneDrive upload skipped");
      return null;
    }

    const response = await client
      .api(`/drives/${driveId}/root:/BizRoom/${fileName}:/content`)
      .put(content);
    return { webUrl: response.webUrl, driveItemId: response.id };
  } catch (err) {
    console.error("[GraphService] OneDrive upload failed:", err);
    return null;
  }
}

export async function createPlannerTasks(
  planId: string,
  items: Array<{ description: string; assignee: string; deadline?: string }>,
): Promise<void> {
  try {
    const client = await getGraphClient();
    if (!client) return;

    // Batch API for efficiency
    const requests = items.slice(0, 20).map((item, i) => ({
      id: String(i),
      method: "POST",
      url: "/planner/tasks",
      body: { planId, title: item.description, dueDateTime: item.deadline },
      headers: { "Content-Type": "application/json" },
    }));

    await client.api("/$batch").post({ requests });
  } catch (err) {
    console.error("[GraphService] Planner task creation failed:", err);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/services/GraphService.ts
git commit -m "feat(artifact): add GraphService for OneDrive upload and Planner task creation"
```

---

### Task 14: Update meetingEnd function

**Files:**
- Modify: `backend/src/functions/meetingEnd.ts`

- [ ] **Step 1: Add generateMeetingMinutesGPT function**

```typescript
import { sophiaAgent, type SophiaState } from "../agents/SophiaAgent.js";
import { SOPHIA_MINUTES_SYSTEM_PROMPT } from "../agents/prompts/sophia.js";
import { generatePPT, generateExcel, type MeetingMinutesData } from "../services/ArtifactGenerator.js";
import { uploadToOneDrive, createPlannerTasks } from "../services/GraphService.js";
import { broadcastEvent } from "../services/SignalRService.js";
import { getModelForTask, getTemperatureForTask } from "../services/ModelRouter.js";

async function generateMeetingMinutesGPT(state: SophiaState): Promise<MeetingMinutesData> {
  const transcript = state.buffer
    .map((e) => `[${e.role}] ${e.speaker}: ${e.speech}`)
    .join("\n");

  const openai = getOpenAIClient();
  const response = await openai.chat.completions.create({
    model: getModelForTask("minutes"),
    temperature: getTemperatureForTask("minutes"),
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SOPHIA_MINUTES_SYSTEM_PROMPT },
      { role: "user", content: `회의 기록:\n${transcript}\n\n결정사항: ${state.decisions.join(", ") || "없음"}\n\n위 내용을 바탕으로 회의록 JSON을 작성하세요.` },
    ],
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  return JSON.parse(content) as MeetingMinutesData;
}
```

- [ ] **Step 2: Enhance meetingEnd with artifact pipeline**

Add the Sophia minutes + artifact generation pipeline:
```typescript
// After existing meeting end logic:
const state = sophiaAgent.getRoomState(roomId);
if (state && state.buffer.length > 0) {
  const minutesData = await generateMeetingMinutesGPT(state);

  // Parallel artifact generation
  const [pptResult, excelResult] = await Promise.allSettled([
    generatePPT(minutesData),
    minutesData.budgetData?.length ? generateExcel(minutesData) : Promise.resolve(null),
  ]);

  // Upload to OneDrive
  const files: Array<{ name: string; type: ArtifactFileType; webUrl: string; driveItemId?: string }> = [];

  if (pptResult.status === "fulfilled" && pptResult.value) {
    const upload = await uploadToOneDrive(`${roomId}-minutes.pptx`, pptResult.value);
    files.push({
      name: "회의록.pptx",
      type: "pptx",
      webUrl: upload?.webUrl ?? "",
      driveItemId: upload?.driveItemId,
    });
  }

  if (excelResult.status === "fulfilled" && excelResult.value) {
    const upload = await uploadToOneDrive(`${roomId}-data.xlsx`, excelResult.value);
    files.push({
      name: "데이터.xlsx",
      type: "xlsx",
      webUrl: upload?.webUrl ?? "",
      driveItemId: upload?.driveItemId,
    });
  }

  // Create Planner tasks
  if (minutesData.actionItems.length > 0) {
    const planId = process.env.PLANNER_PLAN_ID;
    if (planId) {
      await createPlannerTasks(planId, minutesData.actionItems);
      files.push({ name: "Planner 태스크", type: "planner", webUrl: "" });
    }
  }

  // Broadcast artifacts ready
  if (files.length > 0) {
    broadcastEvent(roomId, { type: "artifactsReady", payload: { files } });
  }

  sophiaAgent.destroyRoom(roomId);
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd backend && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add backend/src/functions/meetingEnd.ts
git commit -m "feat(artifact): add PPT/Excel/Planner generation to meetingEnd with Promise.allSettled"
```

---

## Chunk 6: Frontend — New Event Types & State

### Task 15: Update MeetingContext with new state

**Files:**
- Modify: `frontend/src/context/MeetingContext.tsx`

- [ ] **Step 1: Add new state fields**

```typescript
// Add to MeetingState interface:
bigScreenData: BigScreenUpdateEvent | null;
monitorData: Record<string, MonitorUpdateEvent>;
sophiaMessages: SophiaMessageEvent[];
artifacts: ArtifactsReadyEvent | null;
thinkingAgents: AgentRole[];
humanCallout: HumanCalloutEvent | null;
```

- [ ] **Step 2: Add new action types**

```typescript
| { type: "SET_BIG_SCREEN"; payload: BigScreenUpdateEvent }
| { type: "SET_MONITOR"; payload: MonitorUpdateEvent }
| { type: "ADD_SOPHIA_MESSAGE"; payload: SophiaMessageEvent }
| { type: "SET_ARTIFACTS"; payload: ArtifactsReadyEvent }
| { type: "SET_THINKING_AGENTS"; payload: { roles: AgentRole[] } }
| { type: "SET_HUMAN_CALLOUT"; payload: HumanCalloutEvent | null }
```

- [ ] **Step 3: Add reducer cases**

```typescript
case "SET_BIG_SCREEN":
  return { ...state, bigScreenData: action.payload };
case "SET_MONITOR":
  return { ...state, monitorData: { ...state.monitorData, [action.payload.target]: action.payload } };
case "ADD_SOPHIA_MESSAGE":
  return { ...state, sophiaMessages: [...state.sophiaMessages, action.payload] };
case "SET_ARTIFACTS":
  return { ...state, artifacts: action.payload };
case "SET_THINKING_AGENTS":
  return { ...state, thinkingAgents: action.payload.roles };
case "SET_HUMAN_CALLOUT":
  return { ...state, humanCallout: action.payload };
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/context/MeetingContext.tsx
git commit -m "feat(ui): add meeting interaction state to MeetingContext — bigScreen, monitor, sophia, callout"
```

---

### Task 16: Update useSignalR with new event handlers

**Files:**
- Modify: `frontend/src/hooks/useSignalR.ts`

- [ ] **Step 1: Add new event handlers to SSE parsing**

In the SSE event processing, add cases for new event types:
```typescript
case "agentThinking":
  dispatch({ type: "SET_THINKING_AGENTS", payload: event.payload });
  break;
case "humanCallout":
  dispatch({ type: "SET_HUMAN_CALLOUT", payload: event.payload });
  break;
case "bigScreenUpdate":
  dispatch({ type: "SET_BIG_SCREEN", payload: event.payload });
  break;
case "monitorUpdate":
  dispatch({ type: "SET_MONITOR", payload: event.payload });
  break;
case "sophiaMessage":
  dispatch({ type: "ADD_SOPHIA_MESSAGE", payload: event.payload });
  break;
case "artifactsReady":
  dispatch({ type: "SET_ARTIFACTS", payload: event.payload });
  break;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useSignalR.ts
git commit -m "feat(ui): handle new SignalR event types in useSignalR — thinking, callout, bigScreen, monitor"
```

---

### Task 17: Create SophiaMessage component

**Files:**
- Create: `frontend/src/components/chat/SophiaMessage.tsx`

- [ ] **Step 1: Implement gold-styled compact message**

```typescript
// frontend/src/components/chat/SophiaMessage.tsx
import React from "react";

interface SophiaMessageProps {
  text: string;
  timestamp?: string;
}

export const SophiaMessage: React.FC<SophiaMessageProps> = ({ text, timestamp }) => {
  return (
    <div className="flex items-start gap-2 px-3 py-1.5 border-l-2 border-amber-500 bg-amber-500/5 rounded-r-md">
      <span className="text-xs text-amber-500 font-semibold whitespace-nowrap">
        Sophia
      </span>
      <span className="text-xs text-gray-300">{text}</span>
      {timestamp && (
        <span className="text-[10px] text-gray-600 ml-auto whitespace-nowrap">{timestamp}</span>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/chat/SophiaMessage.tsx
git commit -m "feat(ui): add SophiaMessage component with gold accent notification style"
```

---

### Task 18: Create RoleSelector component

**Files:**
- Create: `frontend/src/components/meeting/RoleSelector.tsx`

- [ ] **Step 1: Implement role selection UI**

```typescript
// frontend/src/components/meeting/RoleSelector.tsx
import React, { useState } from "react";

const ROLE_PRESETS = ["마케팅", "개발", "디자인", "영업", "기획", "재무", "법무"];

interface RoleSelectorProps {
  onSelect: (role: string, name: string) => void;
}

export const RoleSelector: React.FC<RoleSelectorProps> = ({ onSelect }) => {
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [customRole, setCustomRole] = useState("");
  const [name, setName] = useState("");

  const effectiveRole = selectedRole === "custom" ? customRole : selectedRole;

  const handleSubmit = () => {
    if (effectiveRole && name) {
      onSelect(effectiveRole, name);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6 bg-gray-900 rounded-xl border border-gray-700 max-w-md">
      <h3 className="text-lg font-bold text-white">팀원 참여</h3>

      <input
        type="text"
        placeholder="이름 (예: 김과장)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white text-sm"
      />

      <div className="flex flex-wrap gap-2">
        {ROLE_PRESETS.map((role) => (
          <button
            key={role}
            onClick={() => setSelectedRole(role)}
            className={`px-3 py-1.5 rounded text-sm border ${
              selectedRole === role
                ? "border-blue-500 bg-blue-500/20 text-blue-400"
                : "border-gray-600 bg-gray-800 text-gray-300 hover:border-gray-500"
            }`}
          >
            {role}
          </button>
        ))}
        <button
          onClick={() => setSelectedRole("custom")}
          className={`px-3 py-1.5 rounded text-sm border ${
            selectedRole === "custom"
              ? "border-purple-500 bg-purple-500/20 text-purple-400"
              : "border-gray-600 bg-gray-800 text-gray-300 hover:border-gray-500"
          }`}
        >
          직접 입력
        </button>
      </div>

      {selectedRole === "custom" && (
        <input
          type="text"
          placeholder="직무명 입력"
          value={customRole}
          onChange={(e) => setCustomRole(e.target.value)}
          className="px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white text-sm"
        />
      )}

      <button
        onClick={handleSubmit}
        disabled={!effectiveRole || !name}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded text-white text-sm font-medium"
      >
        회의 참여
      </button>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/meeting/RoleSelector.tsx
git commit -m "feat(ui): add RoleSelector component with 7 presets + free input"
```

---

## Chunk 7: Frontend 3D — Big Screen & Monitor Modes

### Task 19: Create BigScreenRenderer

**Files:**
- Create: `frontend/src/components/meeting3d/BigScreenRenderer.tsx`

- [ ] **Step 1: Implement SVG-based template renderer**

This component receives `BigScreenRenderData` and renders to a Canvas texture for the ArtifactScreen3D mesh. Uses SVG templates converted to Canvas.

```typescript
// frontend/src/components/meeting3d/BigScreenRenderer.tsx
import { useEffect, useRef, useCallback } from "react";
import type { BigScreenRenderData, BigScreenUpdateEvent } from "../../types";

const SCREEN_WIDTH = 1024;
const SCREEN_HEIGHT = 576;

function renderComparisonSVG(data: Extract<BigScreenRenderData, { type: "comparison" }>): string {
  const colWidth = SCREEN_WIDTH / data.columns.length;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SCREEN_WIDTH}" height="${SCREEN_HEIGHT}">`;
  svg += `<rect width="100%" height="100%" fill="#0d1117"/>`;

  // Header row
  data.columns.forEach((col, i) => {
    svg += `<text x="${i * colWidth + colWidth / 2}" y="40" text-anchor="middle" fill="#58a6ff" font-size="20" font-weight="bold">${col}</text>`;
  });
  svg += `<line x1="0" y1="55" x2="${SCREEN_WIDTH}" y2="55" stroke="#30363d" stroke-width="1"/>`;

  // Data rows
  data.rows.forEach((row, ri) => {
    const y = 90 + ri * 45;
    row.forEach((cell, ci) => {
      svg += `<text x="${ci * colWidth + colWidth / 2}" y="${y}" text-anchor="middle" fill="#e6edf3" font-size="16">${cell}</text>`;
    });
  });

  svg += `</svg>`;
  return svg;
}

function renderPieChartSVG(data: Extract<BigScreenRenderData, { type: "pie-chart" }>): string {
  const cx = SCREEN_WIDTH / 2;
  const cy = SCREEN_HEIGHT / 2;
  const r = 150;
  const total = data.items.reduce((s, i) => s + i.value, 0);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SCREEN_WIDTH}" height="${SCREEN_HEIGHT}">`;
  svg += `<rect width="100%" height="100%" fill="#0d1117"/>`;

  let startAngle = 0;
  data.items.forEach((item) => {
    const angle = (item.value / total) * 360;
    const endAngle = startAngle + angle;
    const x1 = cx + r * Math.cos((Math.PI / 180) * startAngle);
    const y1 = cy + r * Math.sin((Math.PI / 180) * startAngle);
    const x2 = cx + r * Math.cos((Math.PI / 180) * endAngle);
    const y2 = cy + r * Math.sin((Math.PI / 180) * endAngle);
    const largeArc = angle > 180 ? 1 : 0;
    svg += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc},1 ${x2},${y2} Z" fill="${item.color}"/>`;
    startAngle = endAngle;
  });

  // Legend
  data.items.forEach((item, i) => {
    const ly = 40 + i * 25;
    svg += `<rect x="20" y="${ly - 10}" width="12" height="12" fill="${item.color}"/>`;
    svg += `<text x="38" y="${ly}" fill="#e6edf3" font-size="13">${item.label} (${item.value}%)</text>`;
  });

  svg += `</svg>`;
  return svg;
}

function renderBarChartSVG(data: Extract<BigScreenRenderData, { type: "bar-chart" }>): string {
  const maxVal = Math.max(...data.items.map((i) => i.value), 1);
  const barW = Math.min(80, (SCREEN_WIDTH - 100) / data.items.length - 10);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SCREEN_WIDTH}" height="${SCREEN_HEIGHT}">`;
  svg += `<rect width="100%" height="100%" fill="#0d1117"/>`;
  data.items.forEach((item, i) => {
    const barH = (item.value / maxVal) * 380;
    const x = 60 + i * (barW + 10);
    const y = SCREEN_HEIGHT - 80 - barH;
    svg += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="#58a6ff" rx="4"/>`;
    svg += `<text x="${x + barW / 2}" y="${y - 8}" text-anchor="middle" fill="#e6edf3" font-size="12">${item.value}</text>`;
    svg += `<text x="${x + barW / 2}" y="${SCREEN_HEIGHT - 55}" text-anchor="middle" fill="#8b949e" font-size="11">${item.label}</text>`;
  });
  svg += `</svg>`;
  return svg;
}

function renderTimelineSVG(data: Extract<BigScreenRenderData, { type: "timeline" }>): string {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SCREEN_WIDTH}" height="${SCREEN_HEIGHT}">`;
  svg += `<rect width="100%" height="100%" fill="#0d1117"/>`;
  const lineY = SCREEN_HEIGHT / 2;
  svg += `<line x1="40" y1="${lineY}" x2="${SCREEN_WIDTH - 40}" y2="${lineY}" stroke="#30363d" stroke-width="2"/>`;
  const step = (SCREEN_WIDTH - 120) / Math.max(data.items.length - 1, 1);
  const statusColors: Record<string, string> = { done: "#3fb950", current: "#58a6ff", pending: "#484f58" };
  data.items.forEach((item, i) => {
    const x = 60 + i * step;
    const color = statusColors[item.status] ?? "#484f58";
    svg += `<circle cx="${x}" cy="${lineY}" r="8" fill="${color}"/>`;
    svg += `<text x="${x}" y="${lineY - 20}" text-anchor="middle" fill="#e6edf3" font-size="12">${item.label}</text>`;
    svg += `<text x="${x}" y="${lineY + 30}" text-anchor="middle" fill="#8b949e" font-size="10">${item.date}</text>`;
  });
  svg += `</svg>`;
  return svg;
}

function renderChecklistSVG(data: Extract<BigScreenRenderData, { type: "checklist" }>): string {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SCREEN_WIDTH}" height="${SCREEN_HEIGHT}">`;
  svg += `<rect width="100%" height="100%" fill="#0d1117"/>`;
  data.items.forEach((item, i) => {
    const y = 50 + i * 45;
    const color = item.checked ? "#3fb950" : "#484f58";
    const icon = item.checked ? "✓" : "○";
    svg += `<text x="40" y="${y}" fill="${color}" font-size="18">${icon}</text>`;
    svg += `<text x="70" y="${y}" fill="${item.checked ? '#e6edf3' : '#8b949e'}" font-size="16">${item.text}</text>`;
  });
  svg += `</svg>`;
  return svg;
}

function renderSummarySVG(data: Extract<BigScreenRenderData, { type: "summary" }>): string {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SCREEN_WIDTH}" height="${SCREEN_HEIGHT}">`;
  svg += `<rect width="100%" height="100%" fill="#0d1117"/>`;
  svg += `<text x="40" y="40" fill="#58a6ff" font-size="20" font-weight="bold">Summary</text>`;
  data.items.forEach((item, i) => {
    const y = 80 + i * 40;
    svg += `<text x="50" y="${y}" fill="#e6edf3" font-size="15">• ${item}</text>`;
  });
  svg += `</svg>`;
  return svg;
}

function renderArchitectureSVG(data: Extract<BigScreenRenderData, { type: "architecture" }>): string {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SCREEN_WIDTH}" height="${SCREEN_HEIGHT}">`;
  svg += `<rect width="100%" height="100%" fill="#0d1117"/>`;
  // Scale node positions to fit canvas (nodes use relative 0-100 coords)
  const scaleX = (x: number) => 60 + (x / 100) * (SCREEN_WIDTH - 120);
  const scaleY = (y: number) => 60 + (y / 100) * (SCREEN_HEIGHT - 120);
  const nodeMap = new Map(data.nodes.map((n) => [n.id, n]));
  data.edges.forEach((edge) => {
    const from = nodeMap.get(edge.from);
    const to = nodeMap.get(edge.to);
    if (from && to) {
      svg += `<line x1="${scaleX(from.x)}" y1="${scaleY(from.y)}" x2="${scaleX(to.x)}" y2="${scaleY(to.y)}" stroke="#30363d" stroke-width="2"/>`;
    }
  });
  data.nodes.forEach((node) => {
    const x = scaleX(node.x);
    const y = scaleY(node.y);
    svg += `<rect x="${x - 50}" y="${y - 18}" width="100" height="36" rx="6" fill="#161b22" stroke="#58a6ff" stroke-width="1"/>`;
    svg += `<text x="${x}" y="${y + 5}" text-anchor="middle" fill="#e6edf3" font-size="12">${node.label}</text>`;
  });
  svg += `</svg>`;
  return svg;
}

export function renderToCanvas(
  canvas: HTMLCanvasElement,
  event: BigScreenUpdateEvent,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let svgString: string;

    switch (event.renderData.type) {
      case "comparison":
        svgString = renderComparisonSVG(event.renderData);
        break;
      case "pie-chart":
        svgString = renderPieChartSVG(event.renderData);
        break;
      case "bar-chart":
        svgString = renderBarChartSVG(event.renderData);
        break;
      case "timeline":
        svgString = renderTimelineSVG(event.renderData);
        break;
      case "checklist":
        svgString = renderChecklistSVG(event.renderData);
        break;
      case "summary":
        svgString = renderSummarySVG(event.renderData);
        break;
      case "architecture":
        svgString = renderArchitectureSVG(event.renderData);
        break;
      default:
        svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${SCREEN_WIDTH}" height="${SCREEN_HEIGHT}"><rect width="100%" height="100%" fill="#0d1117"/><text x="50%" y="50%" text-anchor="middle" fill="#e6edf3" font-size="20">${event.title}</text></svg>`;
    }

    const blob = new Blob([svgString], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        canvas.width = SCREEN_WIDTH;
        canvas.height = SCREEN_HEIGHT;
        ctx.drawImage(img, 0, 0);
      }
      URL.revokeObjectURL(url);
      resolve();
    };
    img.onerror = reject;
    img.src = url;
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/meeting3d/BigScreenRenderer.tsx
git commit -m "feat(ui): add BigScreenRenderer with SVG template rendering for comparison and pie-chart types"
```

---

### Task 20: Update HoloMonitor3D with dynamic content modes

**Files:**
- Modify: `frontend/src/components/meeting3d/HoloMonitor3D.tsx`

- [ ] **Step 1: Add mode-based rendering**

Add prop `monitorData?: MonitorUpdateEvent` and render content based on `monitorData.mode`:

```typescript
// Add to HoloMonitor3D props interface:
interface HoloMonitor3DProps {
  // ...existing props
  monitorData?: MonitorUpdateEvent;
}

// Add mode renderer function inside the component:
function renderMonitorContent(data: MonitorUpdateEvent): JSX.Element {
  switch (data.content.type) {
    case "idle":
      return <Text fontSize={0.08} color="#8b949e" anchorX="center">{data.content.text}</Text>;
    case "keyPoints":
      return (
        <group>
          {data.content.points.map((point, i) => (
            <Text key={i} position={[0, 0.15 - i * 0.1, 0]} fontSize={0.06} color="#e6edf3" anchorX="left" maxWidth={0.8}>
              • {point}
            </Text>
          ))}
        </group>
      );
    case "confirm":
      return (
        <group>
          <Text position={[0, 0.2, 0]} fontSize={0.07} color="#58a6ff" anchorX="center">결정 필요</Text>
          {data.content.options.map((opt, i) => (
            <Text key={i} position={[0, 0.05 - i * 0.12, 0]} fontSize={0.06} color="#e6edf3" anchorX="center">
              [{i + 1}] {opt}
            </Text>
          ))}
        </group>
      );
    case "callout":
      return <Text fontSize={0.07} color="#fbbf24" anchorX="center">{data.content.message}</Text>;
    case "thinking":
      return <Text fontSize={0.08} color="#58a6ff" anchorX="center">생각 중...</Text>;
    case "speaking":
      return <Text fontSize={0.08} color="#3fb950" anchorX="center">발언 중</Text>;
    case "actionItems":
      return (
        <group>
          {data.content.items.slice(0, 4).map((item, i) => (
            <Text key={i} position={[0, 0.15 - i * 0.1, 0]} fontSize={0.05} color="#e6edf3" anchorX="left" maxWidth={0.8}>
              □ {item.description} ({item.assignee})
            </Text>
          ))}
        </group>
      );
  }
}

// Use in the component's return — replace the existing static content inside the monitor mesh:
{monitorData ? renderMonitorContent(monitorData) : <Text fontSize={0.08} color="#8b949e" anchorX="center">{agendaTitle}</Text>}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/meeting3d/HoloMonitor3D.tsx
git commit -m "feat(ui): add dynamic content modes to HoloMonitor3D — keyPoints, confirm, callout, thinking"
```

---

### Task 21: Add Sophia avatar position to MeetingRoom3D

**Files:**
- Modify: `frontend/src/components/meeting3d/MeetingRoom3D.tsx`

- [ ] **Step 1: Add Sophia seat config and avatar JSX**

Add constant after existing `SEAT_CONFIG`:
```typescript
const SOPHIA_CONFIG = {
  position: [2.0, 0, -6.5] as [number, number, number],
  rotation: [0, -Math.PI / 4, 0] as [number, number, number],
  name: "Sophia",
  role: "Secretary",
  color: "#F59E0B",
};
```

Add inside the component's return JSX (after the existing SEAT_CONFIG.map avatars):
```tsx
{/* Sophia — standing beside big screen */}
<group position={SOPHIA_CONFIG.position} rotation={SOPHIA_CONFIG.rotation}>
  <AgentAvatar3D
    agentName={SOPHIA_CONFIG.name}
    agentRole={SOPHIA_CONFIG.role}
    color={SOPHIA_CONFIG.color}
    pose="standing"
    isSpeaking={false}
  />
  <HoloMonitor3D
    position={[0, 1.8, 0.3]}
    agentName="Sophia"
    color={SOPHIA_CONFIG.color}
  />
</group>
```

Note: `AgentAvatar3D` already supports a `pose` prop — pass `"standing"` to use the standing animation instead of the default seated pose. If `pose` prop doesn't exist yet, add it as `pose?: "seated" | "standing"` with `"seated"` as default.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/meeting3d/MeetingRoom3D.tsx
git commit -m "feat(ui): add Sophia avatar position next to big screen in MeetingRoom3D"
```

---

## Chunk 8: Team Member Join Flow

### Task 22: Add team member join endpoint

**Files:**
- Create or modify: `backend/src/functions/meeting-chairman.ts`

- [ ] **Step 1: Add joinMember handler**

```typescript
import { randomUUID } from "crypto";
// addParticipant, broadcastToRoom, broadcastEvent — assumed imported at top of file alongside existing meeting-chairman imports

async function joinMember(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const { roomId, userId, userName, role } = (await request.json()) as {
    roomId?: string;
    userId?: string;
    userName?: string;
    role?: string;
  };

  if (!roomId || !userId || !userName || !role) {
    return { status: 400, jsonBody: { error: "roomId, userId, userName, role required" } };
  }

  // Add to room participants
  addParticipant(roomId, { id: userId, name: userName, type: "human", role, status: "online", avatar: "" });

  // Broadcast to agents
  broadcastEvent(roomId, {
    type: "phaseChanged",
    payload: { phase: "discussion" },
  });

  // Notify agents about new participant
  broadcastToRoom(roomId, {
    id: randomUUID(),
    roomId,
    senderId: "system",
    senderType: "agent",
    senderName: "System",
    senderRole: "system",
    content: `${role} 담당 ${userName}님이 참석했습니다.`,
    timestamp: new Date().toISOString(),
  });

  return { status: 200, jsonBody: { success: true } };
}

app.http("joinMember", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "api/meeting/join-member",
  handler: joinMember,
});
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/functions/meeting-chairman.ts
git commit -m "feat(api): add POST /api/meeting/join-member for team member role-based joining"
```

---

## Implementation Priority & Parallelization

Chunks can be parallelized as follows:

```
Chunk 1 (Foundation) ──→ Chunk 2 (TurnManager) ──→ Chunk 3 (Pipeline)
                    └──→ Chunk 4 (Sophia)  ──→ Chunk 5 (Artifacts)
                    └──→ Chunk 6 (FE Events) ──→ Chunk 7 (FE 3D)
                                             └──→ Chunk 8 (Team Member)
```

**Critical path:** Chunk 1 → Chunk 2 → Chunk 3 (must be sequential)

**Parallelizable after Chunk 1:**
- Chunks 4+5 (Sophia + Artifacts) — independent backend
- Chunks 6+7+8 (Frontend) — independent frontend
