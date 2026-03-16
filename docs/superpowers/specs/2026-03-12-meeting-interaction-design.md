---
version: "2.0.0"
created: "2026-03-12 11:45"
updated: "2026-03-16 14:00"
---

# BizRoom.ai — Meeting Interaction System Design Spec

> AI C-Suite agents with structured output, secretary agent "Sophia", smart mention system, dynamic BigScreen/monitor visualization, Microsoft artifact generation, and multi-provider model routing.

## Table of Contents

1. [Overview](#1-overview)
2. [C-Suite Structured Output](#2-c-suite-structured-output)
3. [Mention System](#3-mention-system)
4. [Sophia Secretary Agent](#4-sophia-secretary-agent)
5. [Visualization System](#5-visualization-system)
6. [Team Member System](#6-team-member-system)
7. [Model Routing & Web Search](#7-model-routing--web-search)
8. [Microsoft Artifact Generation](#8-microsoft-artifact-generation)
9. [Event Flow & Data Architecture](#9-event-flow--data-architecture)
10. [3D Scene](#10-3d-scene)
11. [Error Handling & Graceful Degradation](#11-error-handling--graceful-degradation)
12. [File Inventory](#12-file-inventory)

---

## 1. Overview

### 1.1 Problem

AI agents in BizRoom.ai need to produce structured responses (not just plain text) so the system can parse mentions, trigger visualizations, and relay key points — all automatically without manual intervention.

### 1.2 Goals

| Goal                          | Success Criteria                                               |
| ----------------------------- | -------------------------------------------------------------- |
| Natural agent mentions        | Agents call others by name, parsed via structured output       |
| Human-in-the-loop             | Agents pause and wait when they need CEO/team-member input     |
| Real-time visualization       | BigScreen shows charts/tables within seconds of agent speech   |
| Secretary agent (Sophia)      | Background agent generates visuals + meeting minutes           |
| Microsoft artifacts           | PPT, Excel, Planner tasks auto-generated on meeting end        |
| Multi-provider model routing  | Azure AI Foundry, Anthropic, OpenAI with automatic fallback    |

### 1.3 Architecture — Hybrid Pipeline

- **C-Suite agents** produce `StructuredAgentOutput` containing `speech`, `key_points`, `mention`, `visual_hint`, and `sophia_request`.
- **ResponseParser** parses agent output using a 3-tier strategy (direct JSON, repair, fallback).
- **TurnManager** routes mentions to agents or pauses for human callouts.
- **Sophia** runs as a parallel background pipeline — receives visual hints, generates visualization JSON via LLM, accumulates conversation for meeting minutes.
- **VoiceLiveOrchestrator** wires all components together with room-scoped event listeners.
- **Meeting end** triggers Sophia to produce Microsoft 365 artifacts via Graph API.

### 1.4 Non-Goals (out of hackathon scope)

- Real-time collaborative editing of artifacts during meeting
- More than 2 additional team member seats
- DALL-E image generation

---

## 2. C-Suite Structured Output

### 2.1 Response Format

Each C-Suite agent response follows the `StructuredAgentOutput` interface:

```typescript
interface StructuredAgentOutput {
  speech: string;                    // Spoken text
  key_points: string[];              // 2-4 bullet points for CEO monitor
  mention: Mention | null;           // Who to call next
  visual_hint: VisualHint | null;    // type + title only (Sophia generates data)
  sophia_request?: SophiaRequest | null; // Delegate task to Sophia
}

interface Mention {
  target: AgentRole | "ceo" | `member:${string}`;
  intent: "opinion" | "confirm";
  options?: string[];                // Required for intent: "confirm"
}

interface VisualHint {
  type: VisualType;                  // comparison | pie-chart | bar-chart | timeline | checklist | summary | architecture
  title: string;
}

interface SophiaRequest {
  type: "search" | "visualize" | "analyze";
  query: string;
}
```

### 2.2 Field Definitions

| Field            | Type                  | Required | Description                                       |
| ---------------- | --------------------- | -------- | ------------------------------------------------- |
| `speech`         | `string`              | Yes      | Spoken text (displayed in chat and sent to TTS)   |
| `key_points`     | `string[]`            | Yes      | Bullet points displayed on CEO monitor            |
| `mention`        | `Mention | null`      | Yes      | Next speaker callout (null if none needed)        |
| `visual_hint`    | `VisualHint | null`   | Yes      | Hint for Sophia to generate visualization         |
| `sophia_request` | `SophiaRequest | null`| No       | Delegate research/analysis/visualization to Sophia|

### 2.3 Three-Tier Parse Strategy

Implemented in `backend/src/orchestrator/ResponseParser.ts`:

```
TIER 1: Direct JSON.parse() + schema validation
  -> Success: use structured data, tier = "schema_valid"
  -> Failure: continue to Tier 2

TIER 2: JSON repair — extract from markdown fences or raw braces
  -> raw.match(/```json?\s*([\s\S]*?)```/) || raw.match(/\{[\s\S]*\}/)
  -> Success: use repaired data, tier = "json_repaired"
  -> Failure: continue to Tier 3

TIER 3: Graceful fallback — treat raw text as speech
  -> speech = raw.slice(0, 300)
  -> mention = null, visual_hint = null, key_points = []
  -> tier = "fallback"
```

Validation includes:
- Self-mention guard: agents cannot mention themselves
- Valid intent check: only "opinion" and "confirm" are accepted
- Valid target check: only known agent roles, "ceo", and "member:..." prefixes
- Visual type validation: only the 7 defined types are accepted

### 2.4 VoiceLive Considerations

In VoiceLive mode, agents respond via Realtime API audio which outputs plain text, not structured JSON. ResponseParser always falls to Tier 3 (fallback) where `visual_hint = null`. This is compensated by:
1. **Visual Intent Detection** in VoiceLiveOrchestrator — keyword matching on user input
2. **Sophia speech detection** — agent mentions "Sophia" in their speech
3. **Post-turn keyword detection** — agentsDone handler checks for visual/search keywords

---

## 3. Mention System

### 3.1 Turn Flow by Target Type

#### Agent -> Agent Mention

```
Agent A finishes with mention.target = "cfo"
  -> TurnManager.handleMentionRouting() adds CFO to agentQueue (priority 1)
  -> No pause — AI continues
  -> CFO speaks next after INTER_AGENT_GAP_MS (500ms)
```

#### Agent -> Human Mention (CEO or Team Member)

```
Agent finishes with mention.target = "ceo" | "member:marketing"
  -> TurnManager.enterAwaitingState()
  -> State transitions to "awaiting"
  -> SignalR broadcasts humanCallout event to frontend
  -> Frontend shows options on CEO monitor or callout alert for members
  -> 30-second timeout starts

Human responds (voice or button click):
  -> TurnManager.onHumanResponse() -> resume agentQueue or -> IDLE

Timeout (30s):
  -> Auto-resume with "[CEO did not respond, proceeding]"
```

### 3.2 Race Condition Defenses

**RC1: Simultaneous voice + button click** — Button click takes precedence. `onHumanResponse()` clears flush timer and input buffer before resuming.

**RC2: Two agents completing near-simultaneously** — Only the `activeAgent` handler proceeds; others are filtered by state check.

**RC3: Timeout fires after state change** — `awaitingGeneration` counter ensures stale timeouts are ignored.

### 3.3 Backward Compatibility

When `mention` is null or JSON parse fails (Tier 3), the system falls back to keyword-based `checkFollowUp()` which uses delegation language detection + domain keywords with negation pattern filtering.

---

## 4. Sophia Secretary Agent

### 4.1 Identity

| Property  | Value                                                |
| --------- | ---------------------------------------------------- |
| Name      | Sophia                                               |
| Role      | Secretary / Executive Assistant (supporting agent)   |
| Color     | Gold (#F59E0B)                                       |
| Position  | Standing next to BigScreen in 3D scene               |
| Voice     | Dedicated TTS session (OpenAI: alloy, Azure: configurable) |
| Turn      | No turn — runs in background pipeline only           |

Sophia is **not** a C-Suite agent and does not participate in TurnManager's agentQueue. She has a distinct type:

```typescript
export type SecretaryRole = "sophia";
export type AllAgentRole = AgentRole | SecretaryRole;
```

### 4.2 Three Roles

#### Role 1: Visual Artifact Generation

```
C-Suite agent response includes visual_hint (or visual intent detected from user input)
  -> Sophia FIFO queue receives hint
  -> LLM call (Claude Sonnet 4.6 for complex types, Haiku 4.5 for simple types)
     Input: visual_hint + recent conversation context (last 5 speeches)
     Output: Complete BigScreenRenderData JSON
  -> SignalR broadcast: bigScreenUpdate + sophiaMessage
  -> CEO monitor update
  -> Voice announcement via Sophia TTS session
```

Visual complexity routing:
- **Fast path** (Haiku 4.5): summary, checklist, simple pie/bar charts
- **Quality path** (Sonnet 4.6): architecture, comparison, timeline, complex charts

#### Role 2: Meeting Minutes Accumulation

Every agent speech and human response is appended to Sophia's internal buffer:

```typescript
interface SophiaBufferEntry {
  speaker: string;
  role: string;
  speech: string;
  keyPoints: string[];
  visualHint: VisualHint | null;
  timestamp: number;
}
```

On meeting end, the buffer is processed by Claude Opus 4.6 (temperature 0.4) to generate structured meeting minutes, then converted to PPT + Excel artifacts.

#### Role 3: Key Points Relay

Agent `key_points` arrays are relayed directly to the CEO monitor via SignalR `monitorUpdate` event — no additional LLM call required.

#### Role 4: Unified Task Queue

Agents can delegate tasks to Sophia via `sophia_request`:
- **search**: Bing web search -> results injected into ContextBroker for all agents
- **analyze**: Bing search for grounding + summary visual generation
- **visualize**: Enqueue visual hint into the visual pipeline

Tasks are processed FIFO, one at a time to avoid race conditions.

### 4.3 Internal State

```typescript
interface SophiaState {
  roomId: string;
  buffer: SophiaBufferEntry[];      // conversation accumulation
  decisions: string[];               // extracted from confirm responses
  actionItems: ActionItemDraft[];    // tracked action items
  visualHistory: VisualArtifact[];   // for embedding in meeting minutes
  visualQueue: VisualQueueItem[];    // FIFO visual generation queue
  taskQueue: SophiaTaskQueueItem[];  // unified task queue (search/analyze/visualize)
  postMeetingQueue: string[];        // deferred post-meeting tasks
}
```

### 4.4 Visual Generation Call Chain

Implemented in `VoiceLiveOrchestrator.callSophiaVisualLLM()`:

1. **Context gathering**: Retrieve last 5 speeches from Sophia buffer
2. **Model selection**: `getModelForTask("visual-gen")` or `"visual-gen-fast"` based on hint complexity
3. **LLM call**: Anthropic Claude or Azure AI Foundry Model Router
4. **Response parsing**: Strip markdown fences, validate required fields per type
5. **Sanitization**: Ensure arrays exist for items/columns/rows/nodes/edges
6. **Broadcast**: `bigScreenUpdate` + `sophiaMessage` + CEO `monitorUpdate`
7. **History**: Append to `visualHistory` for meeting minutes embedding

Error isolation: Visual pipeline failures are caught and logged, never interrupting the main conversation flow.

---

## 5. Visualization System

### 5.1 BigScreen

#### Supported Visual Types

| Type           | Data Structure                                                              |
| -------------- | --------------------------------------------------------------------------- |
| `comparison`   | `{ columns: string[], rows: string[][] }`                                   |
| `pie-chart`    | `{ items: [{ label, value, color }] }`                                      |
| `bar-chart`    | `{ items: [{ label, value }] }`                                             |
| `timeline`     | `{ items: [{ date, label, status: "done"|"current"|"pending" }] }`          |
| `checklist`    | `{ items: [{ text, checked: boolean }] }`                                   |
| `summary`      | `{ items: string[] }`                                                       |
| `architecture` | `{ nodes: [{ id, label, x, y }], edges: [{ from, to }] }`                  |

All types are defined as a discriminated union (`BigScreenRenderData`) in `shared/types.ts`.

#### Rendering Pipeline

```
Sophia generates BigScreenRenderData JSON
  -> SignalR broadcasts to frontend
  -> React component renders the appropriate template
  -> Displayed in 3D scene on the BigScreen mesh
```

### 5.2 CEO Monitor (HoloMonitor3D)

| Mode            | Trigger                        | Content                         |
| --------------- | ------------------------------ | ------------------------------- |
| `idle`          | Default                        | Current agenda title            |
| `keyPoints`     | Agent speaking                 | Key points (bullet list)        |
| `confirm`       | mention.intent = "confirm"     | Options as clickable buttons    |
| `callout`       | mention.intent = "opinion"     | "Your input requested" alert    |
| `actionItems`   | Meeting end                    | Action items summary            |
| `thinking`      | Sophia processing              | "Sophia: working on..."         |
| `searchResults` | Sophia search complete         | Search results with URLs        |

### 5.3 Visual Intent Detection (VoiceLive Fallback)

Since VoiceLive plain-text responses lack structured visual hints, `detectVisualIntent()` in VoiceLiveOrchestrator provides keyword-based detection:

```typescript
const VISUAL_KEYWORD_MAP: Array<{ type: VisualType; title: string; keywords: RegExp }> = [
  { type: "comparison", keywords: /compare|versus|vs\b|pros?\s*(?:and|&)?\s*cons?/i, ... },
  { type: "pie-chart",  keywords: /ratio|share|proportion|percent|%|pie/i, ... },
  { type: "bar-chart",  keywords: /chart|graph|bar|stat|data.*show/i, ... },
  { type: "timeline",   keywords: /timeline|roadmap|milestone|schedule/i, ... },
  { type: "checklist",  keywords: /checklist|to-?do|task.*list/i, ... },
  { type: "summary",    keywords: /summary|summarize|wrap.*up/i, ... },
  { type: "architecture", keywords: /architecture|diagram|system.*design|flowchart/i, ... },
];
```

Detection runs once per turn to prevent duplicate visuals when multiple agents respond.

---

## 6. Team Member System

### 6.1 Join Flow

Team members join via `POST /api/meeting/join-member` with a role designation. The endpoint is implemented in `meeting-chairman.ts`.

### 6.2 Agent Mention of Team Members

Agents can mention team members using the `member:` prefix:

```json
{
  "mention": {
    "target": "member:marketing",
    "intent": "opinion"
  }
}
```

This triggers the `awaiting` state in TurnManager, same as a CEO callout.

### 6.3 Constraints

| Item              | Limit                            |
| ----------------- | -------------------------------- |
| Max team members  | 2 (existing seat positions)      |
| Member voice      | Chat only (voice is CEO-only)    |
| Role matching     | Case-insensitive exact match     |

---

## 7. Model Routing & Web Search

### 7.1 Multi-Provider ModelRouter

Implemented in `backend/src/services/ModelRouter.ts`. The router auto-selects the optimal provider and model based on task type:

**Provider priority:**
1. **Azure AI Foundry Model Router** (if `AZURE_FOUNDRY_MODEL_ROUTER_ENDPOINT` is set) — auto-selects optimal model
2. **Anthropic** (if `ANTHROPIC_API_KEY` is set) — Opus 4.6 / Sonnet 4.6 / Haiku 4.5
3. **OpenAI** (fallback) — GPT Realtime 1.5 / o3 / GPT-4o

**Task-to-model mapping (Anthropic path):**

| TaskType          | Model                | Temperature | Max Tokens |
| ----------------- | -------------------- | ----------- | ---------- |
| `agent-response`  | Claude Opus 4.6      | 0.5         | 1000       |
| `visual-gen`      | Claude Sonnet 4.6    | 0.2         | 1500       |
| `visual-gen-fast` | Claude Haiku 4.5     | 0.2         | 800        |
| `minutes`         | Claude Opus 4.6      | 0.4         | 2000       |
| `deep-analysis`   | Claude Opus 4.6      | 0.1         | 4000       |
| `parse-fallback`  | Claude Haiku 4.5     | 0.1         | 500        |
| `realtime-voice`  | GPT Realtime 1.5     | 0.6         | 1000       |

### 7.2 Web Search Integration

Sophia integrates with Bing Search API for real-time data grounding:

**User-initiated search:**
- User mentions "Sophia" + search keywords -> `sophiaDirect` event -> Bing search
- Results injected into ContextBroker via `addSearchResult()`
- Displayed on CEO monitor as `searchResults` mode

**Agent-initiated search:**
- Agent includes `sophia_request: { type: "search", query: "..." }` in structured output
- Processed by Sophia unified task queue
- Results broadcasted to CEO monitor

### 7.3 Azure AI Foundry Model Router

When configured, the Foundry Model Router acts as a single endpoint that auto-selects the optimal model (quality/cost/balanced) from available models (GPT-5.x, GPT-4.1, DeepSeek, etc.). Uses OpenAI-compatible API format.

---

## 8. Microsoft Artifact Generation

### 8.1 Overview

On meeting end, Sophia generates Microsoft 365 artifacts and uploads to OneDrive:

```
Meeting end triggered (POST /api/meeting/end)
  -> COO closing statement
  -> Sophia generates structured meeting minutes (Claude Opus 4.6)
  -> Parallel artifact generation:
     |-- PPT (pptxgenjs 3.x)
     |-- Excel (exceljs) — if financial data exists
     |-- Planner tasks (Microsoft Graph API)
  -> Upload to OneDrive (Graph API)
  -> SignalR broadcast: artifactsReady event
  -> Frontend: display download links + "Open" buttons
```

### 8.2 PowerPoint Structure

| Slide             | Content                                           |
| ----------------- | ------------------------------------------------- |
| Title             | Meeting title, date, participants                 |
| Agenda (x N)      | Per-agenda summary, key points, embedded visuals  |
| Decisions         | All decisions with approval status                |
| Action Items      | Table: description, assignee, deadline, status    |
| Next Steps        | Summary and follow-up schedule                    |

### 8.3 Excel Structure

Generated only when financial/numerical data was discussed:

| Sheet             | Content                                           |
| ----------------- | ------------------------------------------------- |
| Budget Analysis   | Budget allocation table + chart data              |
| Action Items      | Action items table with status column             |
| Raw Data          | Numerical data from CFO discussions               |

### 8.4 Planner Integration

Action items are automatically created as Microsoft Planner tasks via Graph API.

### 8.5 Dependencies

| Package          | Purpose                          | Size   |
| ---------------- | -------------------------------- | ------ |
| `pptxgenjs`      | PowerPoint generation            | ~300KB |
| `exceljs`        | Excel generation                 | ~200KB |
| `@microsoft/microsoft-graph-client` | Graph API        | ~50KB  |

### 8.6 Fallback Strategy

If any artifact generation fails, the system falls back to Markdown meeting minutes (immediate, no external dependencies).

---

## 9. Event Flow & Data Architecture

### 9.1 SignalR Event Types

All events are defined as a discriminated union (`MeetingBroadcastEvent`) in `shared/types.ts`:

| Event Type            | Payload Interface          | Description                        |
| --------------------- | -------------------------- | ---------------------------------- |
| `agentAudioDelta`     | AgentAudioDeltaEvent       | Agent voice audio chunk            |
| `agentTranscriptDelta`| AgentTranscriptDeltaEvent  | Agent speech text (streaming)      |
| `agentVisemeDelta`    | AgentVisemeDeltaEvent      | Lip sync data (Azure only)         |
| `agentResponseDone`   | AgentResponseDoneEvent     | Agent finished speaking            |
| `agentTyping`         | AgentTypingEvent           | Typing indicator toggle            |
| `phaseChanged`        | PhaseChangedEvent          | Meeting phase transition           |
| `agentThinking`       | AgentThinkingEvent         | Agents entering routing state      |
| `humanCallout`        | HumanCalloutEvent          | Agent requesting human input       |
| `bigScreenUpdate`     | BigScreenUpdateEvent       | New visualization for BigScreen    |
| `monitorUpdate`       | MonitorUpdateEvent         | CEO/member/agent monitor content   |
| `sophiaMessage`       | SophiaMessageEvent         | Sophia chat notification           |
| `artifactsReady`      | ArtifactsReadyEvent        | Meeting artifacts available        |

### 9.2 Complete Event Sequence — Typical Turn

```
1. User speaks: "Let's discuss the new product launch strategy"

2. TurnManager: idle -> hearing -> routing
   Emit agentThinking (roles: [coo, cmo])

3. Frontend: agent avatars show thinking indicators

4. TurnManager: trigger COO Hudson
   Emit triggerAgent + agentTyping

5. Hudson responds (structured output):
   {
     speech: "Let me organize this. I'd like to hear from our CMO first.",
     key_points: ["CMO opinion requested", "Budget review needed"],
     mention: { target: "cmo", intent: "opinion" },
     visual_hint: null
   }

6. TurnManager: parse mention -> add CMO to queue
   Emit monitorUpdate (ceo, keyPoints)

7. CMO Yusef responds:
   {
     speech: "Our target is the 20-30 demographic. We need $3M for digital campaigns.",
     key_points: ["20-30 target demo", "Digital campaign focus", "$3M budget"],
     mention: { target: "cfo", intent: "opinion" },
     visual_hint: { type: "pie-chart", title: "Target Customer Segments" }
   }

8. Parallel processing:
   a. TurnManager: add CFO to queue
   b. Sophia: visual_hint -> LLM call -> BigScreenRenderData
      -> broadcast bigScreenUpdate (pie-chart)
      -> broadcast sophiaMessage ("Target customer chart displayed on BigScreen")
   c. CEO monitor updates with CMO key points

9. CFO Amelia responds:
   {
     speech: "$3M is 40% of marketing budget. I suggest $1.5M first phase.",
     mention: { target: "ceo", intent: "confirm", options: ["Phase 1 approval", "Full allocation"] },
     visual_hint: { type: "comparison", title: "Budget Options" }
   }

10. TurnManager: state -> "awaiting" (human callout)
    -> 30s timeout starts
    -> Frontend: CEO monitor shows option buttons
    -> All avatars look at CEO

11. CEO clicks "Phase 1 approval"
    -> TurnManager resumes, records decision
```

---

## 10. 3D Scene

### 10.1 Sophia Avatar

| Property  | Value                                              |
| --------- | -------------------------------------------------- |
| Model     | Animated 3D blob (SophiaBlob3D component)          |
| Position  | Adjacent to BigScreen                              |
| Behavior  | Pulsing glow when processing, idle breathing       |

### 10.2 Agent Thinking State

When TurnManager enters routing:
- Agent avatars show thinking indicators
- CEO monitor shows "thinking..." text
- Typing indicator broadcasts via SignalR

### 10.3 Gaze Behavior

| Event                 | Agents Look At      | Sophia Behavior     |
| --------------------- | -------------------- | ------------------- |
| Agent speaking        | Speaking agent       | Processing/idle     |
| Human callout         | Called human         | Looks at human      |
| CEO responding        | CEO                  | Looks at CEO        |
| BigScreen update      | Brief glance at screen | Glow pulse         |

---

## 11. Error Handling & Graceful Degradation

| Failure                          | Degradation                                             |
| -------------------------------- | ------------------------------------------------------- |
| JSON parse failure (Tier 3)      | Use raw text as speech, skip mention/visual/keypoints   |
| Sophia LLM call fails           | Skip visual, log error, meeting continues               |
| BigScreen render fails           | Keep previous visual, log error                         |
| Graph API fails (OneDrive)       | Generate files locally, offer download                  |
| Bing search fails                | Silent degradation, no results displayed                |
| Human callout timeout (30s)      | Auto-resume with notice message                         |
| Agent session creation fails     | Emit empty agentDone to prevent TurnManager deadlock    |
| pptxgenjs/exceljs fails          | Fall back to Markdown meeting minutes                   |
| No LLM provider configured       | Mock responses for development                          |

---

## 12. File Inventory

### 12.1 Backend Files

| File                                           | Purpose                                                  |
| ---------------------------------------------- | -------------------------------------------------------- |
| `orchestrator/TurnManager.ts`                  | Event-driven state machine (5 states, priority queue)    |
| `orchestrator/VoiceLiveOrchestrator.ts`        | Event wiring + Sophia pipeline + visual intent detection |
| `orchestrator/ResponseParser.ts`               | 3-tier structured output parser                          |
| `orchestrator/ContextBroker.ts`                | Room context management (messages, brand memory, search) |
| `orchestrator/SnippetManager.ts`               | Meeting phase transition validator                       |
| `orchestrator/TopicClassifier.ts`              | User input -> relevant agent routing                     |
| `agents/SophiaAgent.ts`                        | Sophia state: buffer, visual queue, task queue           |
| `agents/AgentFactory.ts`                       | Multi-provider agent invocation (stream + batch)         |
| `agents/agentConfigs.ts`                       | Agent definitions (name, color, icon, prompts)           |
| `agents/prompts/sophia.ts`                     | Sophia visual generation system prompt                   |
| `agents/prompts/brandMemory.ts`                | Brand Memory Layer 0 prompt builder                      |
| `agents/prompts/common.ts`                     | Shared agent rules (structured output format)            |
| `services/ModelRouter.ts`                      | Multi-provider task-based model routing                  |
| `services/VoiceLiveSessionManager.ts`          | WebSocket session lifecycle (dual provider)              |
| `services/SignalRService.ts`                   | SignalR event broadcasting                               |
| `services/ArtifactGenerator.ts`                | PPT/Excel generation                                    |
| `services/GraphService.ts`                     | Microsoft Graph API (OneDrive, Planner)                  |
| `services/BingSearchService.ts`                | Bing Search API integration                              |
| `functions/meetingStart.ts`                    | Meeting initialization + brand memory validation         |
| `functions/meetingEnd.ts`                      | Meeting end + artifact pipeline                          |
| `functions/meeting-chairman.ts`                | CEO control endpoints (5 endpoints)                      |
| `functions/message.ts`                         | SSE streaming message handler                            |
| `constants/turnConfig.ts`                      | Timing constants                                         |
| `constants/agentVoices.ts`                     | Agent -> voice mapping                                   |

### 12.2 Frontend Files

| File                                           | Purpose                                                  |
| ---------------------------------------------- | -------------------------------------------------------- |
| `hooks/useSignalR.ts`                          | SignalR + SSE streaming connection                       |
| `hooks/useAgentAudio.ts`                       | Agent audio playback queue (Web Audio API)               |
| `hooks/useVoiceLive.ts`                        | WebSocket audio streaming + mic toggle                   |
| `hooks/useViseme.ts`                           | Viseme event -> blend shape weights                      |
| `components/meeting3d/MeetingRoom3D.tsx`       | 3D meeting room scene                                    |
| `components/meeting3d/AgentAvatar3D.tsx`       | Agent 3D avatar with lip sync                            |
| `components/meeting3d/BigScreenRenderer.tsx`   | Template-based visual rendering                          |
| `components/meeting3d/SophiaBlob3D.tsx`        | Sophia animated blob                                     |
| `components/meeting3d/HoloMonitor3D.tsx`       | Dynamic CEO/agent monitor                                |
| `components/meeting/ChairmanControls.tsx`      | AI opinion / next agenda / pause buttons                 |
| `components/chat/SophiaMessage.tsx`            | Gold-styled compact message bubble                       |
| `components/lobby/BrandMemoryForm.tsx`         | Brand memory input UI                                    |
| `context/MeetingContext.tsx`                    | Global meeting state                                     |
| `constants/strings.ts`                         | Centralized UI strings                                   |

### 12.3 Shared Types

`shared/types.ts` — Single Source of Truth for all type definitions used by both frontend and backend, including: `StructuredAgentOutput`, `Mention`, `VisualHint`, `BigScreenRenderData`, `MonitorContent`, `MeetingBroadcastEvent`, `BrandMemorySet`, and all WebSocket event types.

---

## Appendix A: BigScreenRenderData Schemas

### comparison
```json
{ "type": "comparison", "columns": ["Item", "Option A", "Option B"], "rows": [["Cost", "$1.5M", "$3M"]] }
```

### pie-chart
```json
{ "type": "pie-chart", "items": [{ "label": "Marketing", "value": 40, "color": "#f97316" }] }
```

### bar-chart
```json
{ "type": "bar-chart", "items": [{ "label": "Q1", "value": 120 }] }
```

### timeline
```json
{ "type": "timeline", "items": [{ "date": "March", "label": "Planning", "status": "done" }] }
```

### checklist
```json
{ "type": "checklist", "items": [{ "text": "Campaign plan", "checked": true }] }
```

### summary
```json
{ "type": "summary", "items": ["Key point 1", "Key point 2"] }
```

### architecture
```json
{ "type": "architecture", "nodes": [{ "id": "fe", "label": "Frontend", "x": 0, "y": 0 }], "edges": [{ "from": "fe", "to": "api" }] }
```
