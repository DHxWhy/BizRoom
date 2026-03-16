---
version: "1.0.0"
created: "2026-03-16 00:00"
updated: "2026-03-16 00:00"
---

# BizRoom.ai — Hero Technology Map

**Purpose**: Precise code-level evidence showing how each of the four Hero Technologies
is integrated in BizRoom.ai — for hackathon judges evaluating technical depth.

---

## 1. Azure AI Foundry Model Router

**Official Description**: A single Azure AI Foundry endpoint that intelligently routes
requests to the optimal model (quality / cost / balanced) across GPT-5.x, GPT-4.1,
DeepSeek, and other models — without changing application code.

### BizRoom Role
Centralized AI brain that selects the right model for every task type:
agent conversations, real-time visualization, meeting minutes, and artifact generation.
The architecture is **provider-agnostic by design**: switching from Anthropic fallback
to Foundry requires only setting one environment variable.

### File & Evidence

**`backend/src/services/ModelRouter.ts`**

```typescript
// Primary path: Azure AI Foundry Model Router
function getActiveProvider(task: TaskType): Provider {
  if (process.env.AZURE_FOUNDRY_MODEL_ROUTER_ENDPOINT) {
    return "foundry";          // ← switch activated by env var
  }
  // Fallback: Anthropic (Claude) or OpenAI depending on task
  ...
}

/** Azure AI Foundry Model Router — single endpoint, auto-routing */
function getFoundryModel(task: TaskType): ModelSelection {
  return {
    provider: "foundry",
    model: "model-router",    // Model Router selects optimal model automatically
    temperature: getTemperature(task),
    maxTokens: getMaxTokens(task),
  };
}

/** OpenAI-compatible client pointing at Foundry endpoint */
export function getFoundryClient(): OpenAI {
  foundryClient = new OpenAI({
    apiKey: process.env.AZURE_FOUNDRY_API_KEY ?? "",
    baseURL: process.env.AZURE_FOUNDRY_MODEL_ROUTER_ENDPOINT ?? "",
    defaultQuery: { "api-version": "2025-11-18" },
    defaultHeaders: { "api-key": process.env.AZURE_FOUNDRY_API_KEY ?? "" },
  });
}
```

### Task → Model Routing Table

| TaskType         | Foundry Route  | Anthropic Fallback             | Temperature |
| ---------------- | -------------- | ------------------------------ | ----------- |
| `agent-response` | model-router   | claude-opus-4-6-20250929       | 0.5         |
| `visual-gen`     | model-router   | claude-sonnet-4-6-20250514     | 0.2         |
| `visual-gen-fast`| model-router   | claude-haiku-4-5-20251001      | 0.2         |
| `minutes`        | model-router   | claude-opus-4-6-20250929       | 0.4         |
| `realtime-voice` | openai direct  | gpt-realtime-1.5               | 0.6         |
| `deep-analysis`  | model-router   | claude-opus-4-6-20250929       | 0.1         |

### Judge Connection Points
- **Technical innovation**: Zero-code model swap via env var; entire multi-provider logic
  encapsulated in `getModelForTask()` with a single `getActiveProvider()` branch
- **Azure integration depth**: `getFoundryClient()` uses the OpenAI-compatible SDK with
  Azure API versioning headers — production-ready pattern
- **Future-proof**: Foundry's routing mode (quality/cost/balanced) is configured at
  deployment time; BizRoom does not need to change code to tune cost vs quality

---

## 2. Microsoft Agent Framework

**Official Description**: A framework for building multi-agent systems with intelligent
orchestration, turn-taking, and agent-to-agent (A2A) communication.

### BizRoom Role
The `TurnManager` is BizRoom's core orchestrator, implementing a priority-queue
state machine that coordinates six AI executives so they respond like a real
boardroom — never all at once, never stepping on each other.

### File & Evidence

**`backend/src/orchestrator/TurnManager.ts`**

```typescript
// Priority queue states: idle → hearing → speaking → awaiting
export class TurnManager extends EventEmitter {
  private rooms = new Map<string, RoomTurnState>();

  // P0: Human speech interrupt — cancels active agent immediately
  onSpeechStart(roomId, userId) {
    if (room.state === "speaking") {
      room.interruptFlag = true;
      this.emit("cancelAgent:" + roomId, roomId, room.activeAgent);
      room.agentQueue = [];
    }
  }

  // A2A mention routing — agent mentions trigger next agent
  onAgentDone(roomId, agentRole, fullText, skipFollowUp = false) {
    room.agentResponseCount++;
    // HARD STOP: MAX_AGENTS_PER_TURN = 1 (initial); follow-ups via mention chain
    if (agentResponseCount >= MAX_AGENTS_PER_TURN && followUpRound === 0) {
      this.emit("agentsDone:" + roomId);
      return;
    }
    // A2A follow-up — MAX_FOLLOW_UP_ROUNDS = 2
    if (!skipFollowUp && followUpRound <= MAX_FOLLOW_UP_ROUNDS) {
      const followUpRole = checkFollowUp({ role: agentRole, content: fullText });
      if (followUpRole) room.agentQueue.push({ role: followUpRole, priority: 3 });
    }
    setTimeout(() => this.triggerNextAgent(roomId), INTER_AGENT_GAP_MS);
  }
}
```

**`backend/src/constants/turnConfig.ts`**

```typescript
export const MAX_AGENTS_PER_TURN    = 1;    // initial agent per turn
export const MAX_FOLLOW_UP_ROUNDS   = 2;    // A2A chain depth
export const INTER_AGENT_GAP_MS     = 500;  // natural conversation pacing
export const HUMAN_CALLOUT_TIMEOUT_MS = 30000; // awaiting state timeout
```

### Priority Queue (P0 → P4)

| Priority | Trigger                               | Behavior                           |
| -------- | ------------------------------------- | ---------------------------------- |
| P0       | Human voice interrupt (Spacebar)      | Cancel active agent, clear queue   |
| P1       | CEO "AI Opinion" button               | Immediate 0ms flush                |
| P2       | TopicClassifier primary agent         | First responder for the turn       |
| P3       | A2A mention chain (structured output) | Follow-up agents via `mention`     |
| P4       | Keyword follow-up (checkFollowUp)     | Contextual secondary responders    |

### Supporting Orchestrator Files

| File                                    | Responsibility                                      |
| --------------------------------------- | --------------------------------------------------- |
| `backend/src/orchestrator/TopicClassifier.ts`  | Routes user input to relevant agent roles     |
| `backend/src/orchestrator/ContextBroker.ts`    | Shared memory across agents per room          |
| `backend/src/orchestrator/ResponseParser.ts`   | Parses LLM output → `StructuredAgentOutput`   |
| `backend/src/orchestrator/VoiceLiveOrchestrator.ts` | Integrates TurnManager + Sophia pipeline |

### Judge Connection Points
- **Multi-agent coordination**: Six C-Suite agents + Sophia = 7 agents, orchestrated
  by a single state machine with deterministic turn ordering
- **A2A communication**: `mention` field in `StructuredAgentOutput` propagates agent
  references through `handleMentionRouting()` — real agent-to-agent delegation
- **Human-in-the-loop**: `awaiting` state with 30s timeout lets the user redirect
  the conversation mid-session — not just autonomous agents

---

## 3. Azure MCP (Model Context Protocol)

**Official Description**: An open standard (JSON-RPC 2.0) for connecting AI models
to external tools and data sources — enabling any MCP-compatible client to call
BizRoom capabilities.

### BizRoom Role
BizRoom exposes a production MCP server at `/api/mcp` (Azure Functions HTTP trigger).
Any MCP-compatible agent — GitHub Copilot, Claude, or custom agents — can call
BizRoom's tools to generate Excel reports, PowerPoint decks, and meeting summaries
directly from the AI conversation.

### File & Evidence

**`backend/src/functions/mcp.ts`**

```typescript
// Three tools registered:
const BIZROOM_TOOLS: Tool[] = [
  {
    name: "bizroom_generate_excel",
    description: "Generate an Excel budget report (.xlsx) for the BizRoom AI meeting.",
    inputSchema: { type: "object", properties: { title, data }, required: ["title","data"] }
  },
  {
    name: "bizroom_generate_ppt",
    description: "Generate a PowerPoint presentation (.pptx) from BizRoom meeting minutes.",
    inputSchema: { type: "object", properties: { title, date, participants, agendas, actionItems } }
  },
  {
    name: "bizroom_meeting_summary",
    description: "Get a real-time summary of the current BizRoom AI meeting.",
    inputSchema: { type: "object", properties: { roomId, maxSpeeches }, required: ["roomId"] }
  },
];

// JSON-RPC 2.0 handler — fully spec-compliant
switch (body.method) {
  case "initialize":    return rpcOk(id, { protocolVersion: "2025-06-18", ... });
  case "tools/list":    return rpcOk(id, { tools: BIZROOM_TOOLS });
  case "tools/call":    return rpcOk(id, await callTool(params.name, params.arguments));
  default:              return rpcErr(id, -32601, "Method not found");
}
```

### MCP Endpoint Specification

| Property             | Value                                             |
| -------------------- | ------------------------------------------------- |
| Endpoint             | `POST /api/mcp`                                   |
| Protocol             | JSON-RPC 2.0                                      |
| Protocol Version     | `2025-06-18`                                      |
| Transport            | Stateless HTTP (Azure Functions compatible)       |
| Auth                 | Anonymous (hackathon demo; production: API key)   |
| Discovery            | `GET /api/mcp` returns tool list + capabilities   |

### Tool Call Flow

```
MCP Client → POST /api/mcp
  { jsonrpc: "2.0", method: "tools/call",
    params: { name: "bizroom_generate_excel", arguments: { title, data } } }
  → Azure Functions handler → callTool()
    → generateBudgetExcel() / generatePPT() / sophiaAgent.getRecentSpeeches()
  → { jsonrpc: "2.0", result: { content: [{ type:"text", text: JSON }] } }
```

### Judge Connection Points
- **Open standard interoperability**: Any MCP client — not just BizRoom's frontend —
  can drive Excel/PPT generation or read live meeting state
- **Azure Functions native**: Manual JSON-RPC 2.0 implementation chosen specifically
  because Azure Functions v4 returns `HttpResponseInit` (not a writable stream),
  making the MCP SDK transport incompatible — real production constraint solved
- **Tool depth**: `bizroom_meeting_summary` reads from `SophiaAgent`'s live speech
  buffer — MCP client gets real-time meeting state, not static data

---

## 4. GitHub Copilot Agent Mode

**Official Description**: An AI-powered development mode in VS Code where GitHub Copilot
autonomously plans, writes, tests, and iterates on code across the entire codebase —
not just single-file completions.

### BizRoom Role
BizRoom's entire full-stack codebase was built using GitHub Copilot Agent Mode as the
primary development driver — applying TDD (test-first), subagent-driven development,
and the Alpha → Beta → Charlie review cycle documented in `CLAUDE.md`.

### Development Patterns Applied

| Pattern                      | How Applied in BizRoom                                       |
| ---------------------------- | ------------------------------------------------------------ |
| TDD (test-first)             | Vitest tests written before implementations in `__tests__/` |
| Subagent specialization      | Alpha (build) → Beta (review/debug) → Charlie (optimize)    |
| Parallel task execution      | Independent components built in parallel worktrees           |
| Cross-file refactoring       | TurnManager + ContextBroker + ResponseParser co-evolved      |
| Documentation-driven         | `docs/plans/` plan files created before each implementation  |

### Codebase Scale Evidence

| Metric                       | Value                                                        |
| ---------------------------- | ------------------------------------------------------------ |
| Azure Functions endpoints    | 23 endpoints                                                 |
| Shared type definitions      | `shared/types.ts` — single source of truth                   |
| Orchestrator files           | 6 files (TurnManager, VoiceLive, ContextBroker, etc.)       |
| Agent prompt files           | 7 files (COO, CFO, CMO, CTO, CDO, CLO, Sophia)              |
| Frontend components          | 30+ React components across 7 directories                    |
| 3D components                | React Three Fiber scene with R3F 9 + drei 10                 |
| Test files                   | `backend/src/__tests__/*.test.ts` (vitest)                   |

### Key Files Produced via Agent Mode

| File                                              | Description                              |
| ------------------------------------------------- | ---------------------------------------- |
| `backend/src/orchestrator/TurnManager.ts`         | 400+ line state machine                  |
| `backend/src/orchestrator/VoiceLiveOrchestrator.ts` | Full Sophia + voice pipeline           |
| `backend/src/services/ModelRouter.ts`             | Multi-provider routing (3 providers)     |
| `backend/src/functions/mcp.ts`                    | MCP JSON-RPC 2.0 server                  |
| `frontend/src/components/meeting3d/`              | Full 3D meeting room (R3F scene)         |
| `shared/types.ts`                                 | Shared type system (front + backend)     |

### Judge Connection Points
- **AI-native development velocity**: A production-grade multi-agent system with real-time
  voice, 3D rendering, MCP integration, and Microsoft 365 connectors — built in hackathon
  timeframe using Agent Mode
- **Code quality**: Strict TypeScript throughout; ESLint + Prettier enforced; all shared
  types in SSOT pattern — architecture quality consistent with Agent Mode's cross-file
  planning capability
- **Verifiable**: Commit history shows incremental, task-scoped commits matching
  Conventional Commits format — the signature of Agent Mode's structured workflow
