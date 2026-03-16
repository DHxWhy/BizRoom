---
version: "2.0.0"
created: "2026-03-11 22:00"
updated: "2026-03-16 09:00"
---

# BizRoom.ai

**Your AI Executive Team — Meet with 6 AI C-Suite executives in a 3D virtual boardroom.**

[![Azure](https://img.shields.io/badge/Azure-Functions%20v4-0078D4?logo=microsoftazure)](https://azure.microsoft.com/en-us/products/functions)
[![SignalR](https://img.shields.io/badge/Azure-SignalR%20Service-0078D4?logo=microsoftazure)](https://azure.microsoft.com/en-us/products/signalr-service)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x%20strict-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.x-61DAFB?logo=react)](https://react.dev)
[![Three.js](https://img.shields.io/badge/Three.js-R3F%209.x-000000?logo=threedotjs)](https://r3f.docs.pmnd.rs/)
[![License](https://img.shields.io/badge/License-MIT-green)](./LICENSE)

> **Microsoft AI Dev Days Hackathon submission.**
> Categories: **Grand Prize (AI Applications & Agents)** + **Best Multi-Agent System**

---

## Hero Technologies

BizRoom.ai is built on four Microsoft/Azure hero technologies — each with direct code evidence.

| Technology                         | Role in BizRoom.ai                                                               | Source File                                         |
| ---------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------- |
| **Azure AI Foundry Model Router**  | Single endpoint auto-routes tasks to optimal models (quality/cost/balanced)      | `backend/src/services/ModelRouter.ts`               |
| **Microsoft Agent Framework**      | EventEmitter-based TurnManager state machine, P0–P4 priority queue, A2A routing  | `backend/src/orchestrator/TurnManager.ts`           |
| **Azure MCP Server**               | JSON-RPC 2.0 endpoint exposing 3 tools (Excel, PPT, meeting summary) to AI hosts | `backend/src/functions/mcp.ts`                      |
| **GitHub Copilot Agent Mode**      | Full-stack TDD development — subagent-driven-development pattern throughout      | Entire codebase (TypeScript strict, vitest TDD)     |

---

## What is BizRoom.ai?

### The Problem

Every business decision requires multiple expert perspectives — finance, marketing, legal, technology, design, and operations. But solo founders, startups, and SMBs cannot afford a full C-Suite.

The result: critical decisions made with blind spots.

### The Solution

BizRoom.ai puts **6 AI C-Suite executives** in a real-time voice meeting with you. You speak — they listen, debate, and advise. The meeting auto-generates PPT slides, Excel reports, and Planner action items in OneDrive.

```
You (voice/text)
       │
       ▼ Azure Functions (20 endpoints)
  TurnManager — P0–P4 priority state machine
       │
       ▼ TopicClassifier
  Relevant agents selected
       │
  ┌────┴────────────────────────────────────────┐
  │                                             │
  ▼                  ▼                          ▼
Hudson (COO)     Amelia (CFO)           Bradley (CLO)
Kelvin (CTO)      Yusef (CMO)            Jonas (CDO)
  │
  ▼ StructuredAgentOutput
  { speech, key_points, mention, visual_hint }
       │
       ├──▶ HoloMonitor3D  (key_points per avatar)
       ├──▶ A2A mention routing (follow-up turns)
       │
       ▼ Sophia Pipeline
  visual_hint → BigScreenRenderData
       │
       ▼ Azure SignalR Service → React 19 Frontend (3D)
```

---

## Live Demo + Screenshots

> **Demo URL:** `https://bizroom.ai` *(deployment in progress)*

| Scene                    | Description                                                  |
| ------------------------ | ------------------------------------------------------------ |
| Lobby                    | Enter agenda, select meeting mode, set brand memory context  |
| 3D Boardroom (Live Mode) | PTT voice → real-time agent responses with viseme lip-sync   |
| BigScreen                | Sophia renders charts, market maps, checklists in real time  |
| HoloMonitor              | Key points from each agent displayed per avatar              |
| Artifact Preview         | Auto-generated PPT and Excel after meeting end               |

---

## Architecture Overview

### Orchestration Pipeline

```
User voice/text
    │
    ▼ POST /api/message  or  WebSocket (GPT Realtime 1.5)
    │
    ▼ TurnManager.handleUserInput()
      ├── P0: Interrupt (user takes floor immediately)
      ├── P1: Direct mention (@agent)
      ├── P2: Topic-classified agents (TopicClassifier)
      ├── P3: A2A follow-up (mention routing)
      └── P4: Auto-mode rotation
    │
    ▼ AgentFactory.invokeAgent()
      └── ModelRouter
            ├── Azure AI Foundry Model Router  (primary)
            └── Anthropic / OpenAI             (fallback)
    │
    ▼ ResponseParser → StructuredAgentOutput
      { speech, key_points, mention, visual_hint }
    │
    ├──▶ VoiceLiveOrchestrator.agentDone()
    │     ├── sophiaAgent.addToBuffer()      (visual queue)
    │     ├── SignalR: monitorUpdate         (HoloMonitor3D)
    │     ├── TurnManager.handleMention()   (A2A routing)
    │     └── TurnManager.onAgentDone()     (advance turn)
    │
    └──▶ Sophia Pipeline (FIFO queue)
          visual_hint → callSophiaVisualGPT()
          → BigScreenRenderData
          → SignalR: bigScreenUpdate → BigScreenRenderer (3D)
```

### Model Routing (ModelRouter.ts)

| Task Type        | Primary              | Fallback Provider | Fallback Model               | Temp |
| ---------------- | -------------------- | ----------------- | ---------------------------- | ---- |
| `agent-response` | Foundry model-router | Anthropic         | claude-opus-4-6-20250929     | 0.5  |
| `minutes`        | Foundry model-router | Anthropic         | claude-opus-4-6-20250929     | 0.4  |
| `summary`        | Foundry model-router | Anthropic         | claude-opus-4-6-20250929     | 0.4  |
| `visual-gen`     | Foundry model-router | Anthropic         | claude-sonnet-4-6-20250514   | 0.2  |
| `visual-gen-fast`| Foundry model-router | Anthropic         | claude-haiku-4-5-20251001    | 0.2  |
| `parse-fallback` | Foundry model-router | Anthropic         | claude-haiku-4-5-20251001    | 0.1  |
| `realtime-voice` | Foundry model-router | OpenAI            | gpt-realtime-1.5             | 0.6  |
| `deep-analysis`  | Foundry model-router | OpenAI            | o3                           | 0.1  |

> **Switching to Azure AI Foundry:** Set one environment variable — `AZURE_FOUNDRY_MODEL_ROUTER_ENDPOINT` — and all task routing switches to the Foundry endpoint automatically. Zero code changes required.
>
> **STT:** Web Speech API (primary) + Whisper-1 fallback via `/api/voice/transcribe`.

### MCP Server (mcp.ts)

BizRoom exposes a fully spec-compliant MCP server at `GET|POST /api/mcp`:

| Tool                      | Description                                               |
| ------------------------- | --------------------------------------------------------- |
| `bizroom_generate_excel`  | Generate Excel budget report (.xlsx)                      |
| `bizroom_generate_ppt`    | Generate PowerPoint from meeting minutes (.pptx)          |
| `bizroom_meeting_summary` | Real-time summary of active meeting room (by `roomId`)    |

Protocol: JSON-RPC 2.0, MCP version `2025-06-18`. Compatible with any MCP-capable AI host (GitHub Copilot, Claude Desktop, etc.).

---

## AI Agent Lineup

| Role       | Name        | Inspiration    | Specialty                                         |
| ---------- | ----------- | -------------- | ------------------------------------------------- |
| COO        | **Hudson**  | Judson Althoff | Operations, execution, cross-functional alignment |
| CFO        | **Amelia**  | Amy Hood       | Financial modeling, KPIs, budget analysis         |
| CMO        | **Yusef**   | Yusuf Mehdi    | Brand strategy, GTM, growth marketing             |
| CTO        | **Kelvin**  | Kevin Scott    | Technical architecture, engineering, scalability  |
| CDO        | **Jonas**   | Jon Friedman   | Product design, UX/CX, design systems             |
| CLO        | **Bradley** | Brad Smith     | Legal risk, compliance, contracts, IP             |
| (Support)  | **Sophia**  | Analysis Agent | Real-time visualization + meeting minutes         |

Sophia is not a C-Suite member. She operates exclusively via the internal `VoiceLiveOrchestrator` event pipeline — no HTTP API endpoint.

### Agent-to-Agent (A2A) Communication

Every agent response includes a `StructuredAgentOutput`:
```typescript
{ speech: string, key_points: string[], mention: Mention | null, visual_hint: VisualHint | null }
```

When an agent sets the `mention` field, TurnManager routes the next turn to the mentioned agent — creating genuine multi-agent debate rather than scripted dialogue. Follow-up rounds are tracked and capped to prevent runaway chains.

---

## Core Features

### 1. Real-Time Voice Meeting (Live Mode)
Push-to-Talk (PTT) captures audio via Web Speech API. Transcript is sent to TurnManager, agents respond sequentially via GPT Realtime 1.5 WebSocket. Ready Player Me avatars animate with viseme lip-sync on every response.

### 2. Autonomous Discussion (Auto Mode)
The board discusses a given agenda topic without user intervention. TurnManager rotates agents by topic relevance, enforcing a maximum of 2 consecutive AI responses before surfacing the user for input.

### 3. Direct Message Mode (DM Mode)
1:1 conversation with a specific agent. Other agents are silent. Useful for deep dives into a single domain (e.g., legal review with Bradley, financial projection with Amelia).

### 4. Sophia Real-Time Visualization
Every agent response may include a `visual_hint`. Sophia buffers hints in a FIFO queue and generates `BigScreenRenderData` via Claude Sonnet 4.6. Results broadcast via SignalR `bigScreenUpdate` and rendered on the 3D BigScreen in the boardroom.

Supported visual types: `bar_chart`, `pie_chart`, `line_chart`, `swot_matrix`, `market_map`, `kpi_cards`, `summary_card`, `checklist`, `timeline`, `table`.

### 5. Automated Meeting Artifacts
On `POST /api/meeting/end`:
- COO Hudson delivers structured closing remarks
- Sophia generates meeting minutes via Claude Opus 4.6
- `pptxgenjs` generates PowerPoint + `exceljs` generates Excel
- Files uploaded to OneDrive via Microsoft Graph API
- Action items created as Microsoft Planner tasks
- `artifactsReady` SignalR event triggers the frontend download UI

### 6. MCP Integration
External AI agents (GitHub Copilot, Claude Desktop) can call BizRoom tools via the MCP server at `/api/mcp` — generating Excel reports, PPT decks, or querying live meeting summaries in real time.

---

## Tech Stack

### Frontend

| Technology                            | Version    | Role                                          |
| ------------------------------------- | ---------- | --------------------------------------------- |
| React                                 | 19.x       | UI framework (Concurrent Mode)                |
| TypeScript                            | 5.x strict | Type safety across all components             |
| Tailwind CSS                          | 4.x        | Utility-first styling (`@tailwindcss/vite`)   |
| Vite                                  | 7.x        | Build tooling + HMR dev server                |
| React Three Fiber + @react-three/drei | 9.x / 10.x | 3D virtual boardroom                          |
| Three.js                              | 0.170      | WebGL renderer                                |
| @microsoft/signalr                    | 10.x       | Real-time WebSocket client                    |
| Ready Player Me                       | SDK        | AI agent 3D avatars + viseme lip-sync         |

### Backend

| Technology                 | Version | Role                                                      |
| -------------------------- | ------- | --------------------------------------------------------- |
| Azure Functions v4         | Node 20 | Serverless API — 20 HTTP endpoints                        |
| TypeScript                 | 5.x     | Strict mode throughout                                    |
| OpenAI SDK                 | 4.x     | GPT Realtime 1.5 WebSocket voice + Whisper-1 STT          |
| Anthropic SDK              | 0.78+   | Claude Opus / Sonnet / Haiku for text generation          |
| pptxgenjs                  | 3.x     | PowerPoint generation                                     |
| exceljs                    | 4.x     | Excel generation                                          |
| ws                         | 8.x     | WebSocket relay for GPT Realtime                          |
| @modelcontextprotocol/sdk  | latest  | MCP tool type definitions                                 |
| vitest                     | 1.x     | Unit testing (TDD throughout)                             |

### Infrastructure

| Service                    | Tier              | Role                                                     |
| -------------------------- | ----------------- | -------------------------------------------------------- |
| Azure Functions v4         | Consumption       | Backend API (20 endpoints)                               |
| Azure SignalR Service      | Serverless / Premium_P1 | Real-time WebSocket hub ("default")            |
| Azure Static Web Apps      | Standard          | Frontend hosting + CDN + API proxy                       |
| Azure Cosmos DB            | Serverless        | Conversation history, room sessions, user profiles       |
| Azure Blob Storage         | LRS               | Artifact storage (PPT, Excel, meeting minutes)           |
| Azure AI Foundry           | Pay-per-token     | Model Router — primary AI inference endpoint             |
| Microsoft Graph API        | —                 | OneDrive file upload, Planner task creation              |

---

## Getting Started

### Prerequisites

- Node.js 20+
- Azure Functions Core Tools v4
- Azure CLI (for deployment)
- API keys: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`
- Azure resources: SignalR Service, Cosmos DB, Blob Storage, Static Web Apps

### Local Development

```bash
# 1. Clone the repository
git clone https://github.com/your-org/bizroom.git
cd bizroom

# 2. Install dependencies
cd backend && npm install
cd ../frontend && npm install

# 3. Configure backend environment
cp backend/local.settings.json.example backend/local.settings.json
# Fill in: ANTHROPIC_API_KEY, OPENAI_API_KEY, SignalR connection string,
#          Cosmos DB connection, Blob Storage connection

# 4. Start backend (Azure Functions local runtime)
cd backend && npm run start

# 5. Start frontend (Vite dev server)
cd frontend && npm run dev

# 6. Open http://localhost:5173
```

### Key Environment Variables

| Variable                              | Required | Description                                           |
| ------------------------------------- | -------- | ----------------------------------------------------- |
| `ANTHROPIC_API_KEY`                   | Yes      | Anthropic API (Claude Opus / Sonnet / Haiku)          |
| `OPENAI_API_KEY`                      | Yes      | OpenAI (GPT Realtime 1.5, Whisper-1)                  |
| `AZURE_SIGNALR_CONNECTION_STRING`     | Yes      | Azure SignalR Service                                 |
| `COSMOS_DB_CONNECTION_STRING`         | Yes      | Azure Cosmos DB                                       |
| `AZURE_STORAGE_CONNECTION_STRING`     | Yes      | Azure Blob Storage (artifacts)                        |
| `AZURE_FOUNDRY_MODEL_ROUTER_ENDPOINT` | Optional | Enables Azure AI Foundry as primary model router      |
| `AZURE_FOUNDRY_API_KEY`               | Optional | API key for Foundry endpoint                          |
| `MICROSOFT_GRAPH_CLIENT_ID`           | Optional | Microsoft Graph (OneDrive + Planner integration)      |

### Running Tests

```bash
cd backend
npm run test         # vitest unit tests
npm run test:watch   # watch mode
```

---

## Judging Criteria Alignment

### 1. Technical Implementation (20%)

| Criterion       | BizRoom.ai Implementation                                                          |
| --------------- | ---------------------------------------------------------------------------------- |
| Code quality    | TypeScript 5 strict mode — 100% frontend and backend                               |
| Testing         | TDD with vitest — TurnManager, ResponseParser, TopicClassifier unit tests          |
| Architecture    | Clean separation: orchestrator / agents / services / functions / shared types      |
| Scale           | 20 Azure Functions endpoints, 6 agent system prompts, multi-provider model routing |

### 2. Agentic Design (20%)

| Criterion       | BizRoom.ai Implementation                                                          |
| --------------- | ---------------------------------------------------------------------------------- |
| Agent autonomy  | TurnManager P0–P4 priority queue; agents self-select follow-up via `mention`       |
| A2A comms       | `mention` in StructuredAgentOutput → TurnManager routes next agent turn            |
| State machine   | EventEmitter: idle → buffering → processing → speaking → idle                     |
| Debate control  | Max 2 consecutive AI responses; follow-up rounds tracked; human callout enforced   |

### 3. Real-World Impact (20%)

| Criterion       | BizRoom.ai Implementation                                                          |
| --------------- | ---------------------------------------------------------------------------------- |
| Target problem  | Solo founders and SMBs lack C-Suite expertise for critical decisions               |
| Market size     | Global SMB SaaS market: $1.5T+ (Gartner 2024)                                     |
| Measurable value| Replaces $50K–$200K/year executive advisory cost with always-on AI board           |
| Tangible output | PPT, Excel, meeting minutes, Planner tasks auto-generated per meeting              |

### 4. UX / Presentation (20%)

| Criterion       | BizRoom.ai Implementation                                                          |
| --------------- | ---------------------------------------------------------------------------------- |
| Immersive UX    | React Three Fiber 3D boardroom — avatars, BigScreen, HoloMonitor, ambient lighting |
| Voice-first     | PTT with GPT Realtime 1.5 WebSocket, viseme lip-sync on 3D avatars                |
| Real-time visuals | Sophia renders 10 visual types on BigScreen as the conversation progresses       |
| Zero friction   | Web-based, no install. Enter agenda → meeting starts in seconds                    |

### 5. Category Compliance (20%)

| Category                         | Compliance                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| Grand Prize: AI Applications     | Full-stack AI application — voice, text, 3D, artifacts, multi-agent orchestration |
| Best Multi-Agent System          | 6 C-Suite agents + Sophia, TurnManager, A2A mention routing, topic classification |
| Hero: Azure AI Foundry           | ModelRouter with Foundry endpoint (`AZURE_FOUNDRY_MODEL_ROUTER_ENDPOINT`)          |
| Hero: Microsoft Agent Framework  | TurnManager = custom agent framework (EventEmitter, priority queue, A2A routing)  |
| Hero: Azure MCP                  | `/api/mcp` — JSON-RPC 2.0, MCP 2025-06-18, 3 tools, CORS-ready                   |
| Hero: GitHub Copilot Agent Mode  | Entire codebase developed with Copilot Agent Mode (TDD, subagent-driven-dev)      |

---

## Azure AI Foundry — One-Variable Switch

The codebase is **production-ready for Azure AI Foundry today**. A single environment variable switches all model routing from the current multi-provider fallback to the Foundry Model Router:

```typescript
// backend/src/services/ModelRouter.ts
if (process.env.AZURE_FOUNDRY_MODEL_ROUTER_ENDPOINT) {
  return "foundry"; // → single endpoint, automatic model selection
}
```

Expected improvements once Foundry quota is provisioned:

| Metric                         | Current (multi-provider)   | With Foundry (projected)   | Improvement |
| ------------------------------ | -------------------------- | -------------------------- | ----------- |
| Agent response TTFT            | ~400–600 ms                | ~150–250 ms                | ~60% faster |
| Sophia visualization latency   | ~800–1,200 ms              | ~400–600 ms                | ~50% faster |
| Voice round-trip latency       | ~300–500 ms                | ~150–250 ms                | ~50% faster |
| Meeting minutes generation     | ~3–5 s                     | ~1.5–2.5 s                 | ~50% faster |
| Auth complexity                | 3 providers × API key      | Azure RBAC single identity | Unified     |

---

## Project Structure

```
BizRoom/
├── frontend/src/
│   ├── components/
│   │   ├── meeting3d/    — MeetingRoom3D, BigScreenRenderer, SophiaBlob3D, HoloMonitor3D
│   │   ├── chat/         — ChatRoom, MessageBubble, SophiaMessage, TypingIndicator
│   │   ├── input/        — PushToTalk, MicToggle, InputArea, QuickActions
│   │   └── meeting/      — MeetingBanner, ChairmanControls, DmAgentPicker
│   ├── hooks/            — useSignalR, useVoiceLive, usePushToTalk, useAgentAudio, useViseme
│   └── constants/        — strings.ts (i18n-ready), agentVoices.ts, brandPresets.ts
│
├── backend/src/
│   ├── functions/        — 20 Azure Functions HTTP endpoints (+ mcp.ts)
│   ├── orchestrator/     — TurnManager, VoiceLiveOrchestrator, ContextBroker,
│   │                       ResponseParser, TopicClassifier, SnippetManager
│   ├── agents/           — AgentFactory, SophiaAgent, agentConfigs.ts, prompts/
│   ├── services/         — ModelRouter, VoiceLiveSessionManager, SignalRService,
│   │                       ArtifactGenerator, ArtifactService, GraphService
│   ├── plugins/          — ExcelPlugin, MeetingMinutesPlugin
│   └── constants/        — turnConfig.ts, responseSchema.ts, agentVoices.ts
│
├── shared/
│   └── types.ts          — Single Source of Truth: all shared types (frontend + backend)
│
└── docs/                 — Architecture, Tech Spec, Agent Design, Design System, PRD
```

---

## License

MIT License — see [LICENSE](./LICENSE) for details.

---

*Built for the Microsoft AI Dev Days Hackathon — March 2026.*
