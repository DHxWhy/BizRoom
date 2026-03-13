---
version: "1.2.0"
created: "2026-03-12 11:45"
updated: "2026-03-12 13:15"
---

# BizRoom.ai — Meeting Interaction System Design Spec

> AI C-Suite agents, secretary agent "Sophia", smart mention system, dynamic big-screen/monitor visualization, Microsoft artifact generation.

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
10. [3D Scene Changes](#10-3d-scene-changes)
11. [Error Handling & Graceful Degradation](#11-error-handling--graceful-degradation)
12. [File Inventory](#12-file-inventory)

---

## 1. Overview

### 1.1 Problem

Current BizRoom.ai agents respond with plain text only. Agent-to-agent follow-up is keyword-based, producing false positives and missing nuanced mentions. There is no visual artifact system during meetings, no secretary support, and no Microsoft 365 integration for deliverables.

### 1.2 Goals

| Goal                         | Success Criteria                                              |
| ---------------------------- | ------------------------------------------------------------- |
| Natural agent mentions       | Agents call others by name in speech, parsed via structured output |
| Human-in-the-loop            | Agents pause and wait when they need chairman/team-member input |
| Real-time visualization      | Big screen shows charts/tables within 3s of agent speech      |
| Secretary agent (Sophia)     | Background agent generates visuals + meeting minutes          |
| Microsoft artifacts          | PPT, Excel, Planner tasks auto-generated on meeting end       |
| Polished rendering           | No layout jumps, no flickering — double-buffered transitions  |

### 1.3 Approach — A+C Hybrid

- **C-Suite agents** produce structured output containing `speech`, `mention`, `visual_hint`, and `key_points`.
- **TurnManager** parses mentions and routes to agents or pauses for humans.
- **Sophia** runs as a parallel background pipeline — receives visual_hints, generates visualization JSON, accumulates conversation for meeting minutes.
- **Meeting end** triggers Sophia to produce Microsoft 365 artifacts via Graph API.

### 1.4 Non-Goals (out of hackathon scope)

- Real-time collaborative editing of artifacts during meeting
- More than 2 team member seats
- Sophia voice output
- DALL-E image generation (except potential CDO creative visuals in future)

---

## 2. C-Suite Structured Output

### 2.1 Response Format

Each C-Suite agent response is a JSON object:

```json
{
  "speech": "의장님, A안과 B안 중 어느 방향으로 진행할까요?",
  "key_points": ["A안: 초기 비용 낮음", "B안: 장기 수익 높음"],
  "mention": {
    "target": "chairman",
    "intent": "confirm",
    "options": ["A안", "B안"]
  },
  "visual_hint": {
    "type": "comparison",
    "title": "A안 vs B안 비교"
  }
}
```

**Note:** `visual_hint` contains only `type` and `title`. Sophia generates the complete `data` object from conversation context (see §4.6). `web_search` field is removed — web search is always available as a tool and the model invokes it when needed (see §7.2).

### 2.2 Field Definitions

| Field          | Type                | Required | Description                                       |
| -------------- | ------------------- | -------- | ------------------------------------------------- |
| `speech`       | `string`            | Yes      | The spoken text (80-180 chars Korean)             |
| `key_points`   | `string[]`          | Yes      | 2-4 bullet points for chairman monitor            |
| `mention`      | `Mention \| null`   | Yes      | Who to call next (null if no callout needed)      |
| `visual_hint`  | `VisualHint \| null` | Yes     | type + title only — Sophia generates data (§4.6)  |

**Removed:** `web_search` field. Web search is always available as a tool — the model invokes it when needed (§7.2).

### 2.3 Speech Length Guidelines

| Situation              | Target Length        | Sentences |
| ---------------------- | -------------------- | --------- |
| General opinion        | 80-120 chars         | 2-3       |
| Data/analysis report   | 120-180 chars        | 3-4       |
| Decision request       | 60-100 chars         | 1-2       |

### 2.4 Response Pipeline: Structured JSON → Speech Audio

C-Suite agents produce structured JSON via **Chat Completions API** with `response_format: { type: "json_schema", json_schema: CSUITE_RESPONSE_SCHEMA }` and `strict: true`. This guarantees schema conformance at the token generation level — the model **cannot** produce non-conforming output.

```
Chat Completions call (response_format: json_schema, stream: true)
  ↓ streaming JSON tokens arrive incrementally
  ↓
Incremental JSON parser watches for "speech" field completion
  ├─ speech value complete → IMMEDIATELY pipe to Voice Live TTS session
  │   (do not wait for remaining fields — overlap TTS with JSON streaming)
  ├─ mention → TurnManager routing logic (after full parse)
  ├─ visual_hint → Sophia pipeline (after full parse)
  └─ key_points → SignalR monitorUpdate (after full parse)
```

**Key architectural decision:** Agents do NOT produce audio and JSON simultaneously. The flow is:
1. Chat Completions → streaming structured JSON (text-only)
2. Extract `speech` field as soon as its value is complete (incremental parser)
3. Pipe `speech` to a TTS-only Voice Live session (`modalities: ["audio"]`)
4. Continue parsing remaining fields (`mention`, `visual_hint`, `key_points`)

**Latency optimization:** By streaming JSON and extracting `speech` early (typically the first field), TTS begins ~300-500ms sooner than waiting for the full response. Use `partial-json` npm package (~2KB) for incremental parsing.

**Why `json_schema` over `json_object`:** `json_object` only guarantees syntactically valid JSON — the model can return `{"answer": "hello"}` which is valid JSON but wrong schema. `json_schema` + `strict: true` constrains token generation to the exact schema, eliminating schema mismatch failures entirely. Adds ~100ms to first-token latency (grammar compilation), negligible vs the reliability gain.

#### JSON Schema Definition

```typescript
const CSUITE_RESPONSE_SCHEMA = {
  name: "csuite_response",
  strict: true,
  schema: {
    type: "object",
    properties: {
      speech: { type: "string", description: "Spoken text in Korean, 80-180 chars" },
      key_points: { type: "array", items: { type: "string" } },
      mention: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            properties: {
              target: { type: "string" },
              intent: { type: "string", enum: ["opinion", "confirm"] },
              options: { type: "array", items: { type: "string" } },
            },
            required: ["target", "intent"],
            additionalProperties: false,
          },
        ],
      },
      visual_hint: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            properties: {
              type: { type: "string", enum: ["comparison", "pie-chart", "bar-chart", "timeline", "checklist", "summary", "architecture"] },
              title: { type: "string" },
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

**Note:** `visual_hint` contains only `type` and `title` — no `data` field. Sophia generates the complete render data from conversation context (see §4.6). This reduces C-Suite output by ~100 tokens per turn and eliminates malformed data objects.

**Note:** `web_search` field is removed from the schema. Web search is handled by always including the tool definition and letting the model decide (see §7.2).

### 2.5 Three-Tier Parse Strategy

With `json_schema` + `strict: true`, schema failures should be extremely rare. However, network errors, timeouts, or API version mismatches can still produce unparseable output.

```
TIER 1: Direct JSON.parse() + schema validation (Zod or runtime check)
  ├─ Success → use structured data → tier: "schema_valid"
  └─ Failure ↓

TIER 2: Repair attempt — extract JSON from markdown fences or partial output
  ├─ raw.match(/```json?\s*([\s\S]*?)```/) || raw.match(/\{[\s\S]*\}/)
  ├─ Success → use repaired data → tier: "json_repaired"
  └─ Failure ↓

TIER 3: Graceful fallback — treat raw text as speech (backward-compatible)
  → speech = raw.slice(0, 300), mention = null, visual_hint = null, key_points = []
  → tier: "fallback"
```

**Telemetry:** Track tier distribution per meeting. If Tier 3 exceeds 5% of responses, alert — likely indicates prompt regression or model behavior change.

**No retry:** Do not retry parse failures in real-time turns (~500ms cost is too high). Sophia visual generation MAY retry once (background pipeline, latency acceptable).

### 2.6 Prompt Additions

Add to `common.ts` (shared by all 6 C-Suite agents). This ensures consistency and enables Azure OpenAI automatic prompt caching (prefix > 1024 tokens → 50% input cost reduction).

```
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
- "member:{참석자 역할}" — 팀원 (역할은 참석자 목록의 정확한 문자열 사용)

intent 허용 값:
- "opinion" — 의견 요청 (모든 target에 사용 가능)
- "confirm" — 결정/승인 요청 (chairman에만 사용, options 필수)

금지:
- 자기 자신을 호명하지 않습니다
- 참석하지 않은 임원을 호명하지 않습니다
- 호명이 불필요하면 mention: null

## 시각자료 힌트
발언에 시각화가 도움되면 visual_hint의 type과 title만 제공합니다.
Sophia가 대화 맥락으로 완전한 데이터를 자동 생성합니다.

시각자료 타입: comparison | pie-chart | bar-chart | timeline | checklist | summary | architecture
- 데이터 비교/표: comparison
- 수치 비율: pie-chart
- 수치 비교: bar-chart
- 일정/단계: timeline
- 할 일 목록: checklist
- 핵심 정리: summary
- 시스템 구조: architecture
- 불필요: null

## 응답 예시

예시 1 — 다른 임원에게 의견 요청 (mention + no visual):
{"speech": "마케팅 전략의 방향은 좋습니다. 다만 예산 집행 계획이 필요합니다. Amelia CFO, 현재 가용 예산을 확인해주시겠습니까?", "key_points": ["마케팅 방향 긍정적", "예산 계획 필요", "CFO 의견 요청"], "mention": {"target": "cfo", "intent": "opinion"}, "visual_hint": null}

예시 2 — 의장에게 결정 요청 (confirm + visual):
{"speech": "두 가지 방안을 비교한 결과입니다. A안은 초기 비용이 낮고, B안은 장기 수익이 높습니다. 의장님, 어느 방향으로 진행할까요?", "key_points": ["A안: 초기 비용 낮음, 빠른 실행", "B안: 장기 수익 높음, 리스크 있음"], "mention": {"target": "chairman", "intent": "confirm", "options": ["A안 (저비용 빠른 실행)", "B안 (고수익 장기 투자)"]}, "visual_hint": {"type": "comparison", "title": "A안 vs B안 비교"}}

예시 3 — 일반 의견 (no mention, no visual):
{"speech": "이번 분기 실적은 전년 대비 12% 성장했습니다. 목표 대비 초과 달성이며, 현 추세를 유지하면 됩니다.", "key_points": ["전년 대비 12% 성장", "목표 초과 달성"], "mention": null, "visual_hint": null}
```

**Token cost:** Few-shot examples add ~350 tokens to the system prompt. With Azure automatic prompt caching (prefix > 1024 tokens), these are cached across turns at 50% input cost. Reliability improvement far outweighs the cost.

**Self-mention runtime guard (in addition to prompt instruction):**

```typescript
// TurnManager — self-mention defense
if (mention?.target === currentSpeakerRole) {
  console.warn(`[TurnManager] Self-mention from ${currentSpeakerRole}, ignoring`);
  mention = null;
}
```

---

## 3. Mention System

### 3.1 Mention Type Definitions

```typescript
interface Mention {
  target: AgentRole | "chairman" | `member:${string}`;
  intent: "opinion" | "confirm";
  options?: string[]; // only for intent: "confirm"
}
```

### 3.2 Turn Flow by Target Type

#### Agent → Agent mention

```
Agent A finishes with mention.target = "cfo"
  ↓
TurnManager adds CFO to agentQueue (replaces keyword-based A2A)
  ↓
AI continues — no pause
  ↓
CFO speaks next (after INTER_AGENT_GAP_MS)
```

#### Agent → Human mention (chairman or team member)

```
Agent finishes with mention.target = "chairman" | "member:마케팅"
  ↓
TurnManager emits "awaitHuman:{roomId}" event
  ├─ agentQueue is frozen (not cleared)
  ├─ state transitions to "awaiting" (new state)
  └─ SignalR broadcasts to frontend:
       {type: "humanCallout", payload: {target, intent, options}}
  ↓
Frontend:
  ├─ Chairman monitor: show options/prompt (fade-in)
  ├─ Team member monitor: show callout alert (if member)
  ├─ 3D: Sophia looks toward called person
  └─ 3D: all agents look toward called person
  ↓
Human responds (voice STT or monitor button click)
  ↓
TurnManager receives response:
  ├─ Save to ContextBroker
  ├─ Resume agentQueue (unfreeze)
  └─ state: "awaiting" → "speaking" (continue queue) or "hearing" → "routing" (new flush)
```

#### Timeout: 30-second no-response

```
30s timer starts when "awaiting" state entered
  ↓
If no human response within 30s:
  TurnManager auto-resumes with: "[의장님이 응답하지 않아 계속 진행합니다]"
  state: "awaiting" → continue agentQueue or → "idle"
```

### 3.3 New TurnState

```typescript
export type TurnState = "idle" | "hearing" | "routing" | "speaking" | "awaiting";
```

The `awaiting` state means: agents are paused, waiting for a human to respond to a callout.

#### State Transition Diagram (with "awaiting")

```
idle ──(voice input)──→ hearing ──(flush)──→ routing ──(agentQueue ready)──→ speaking
 ↑                                              ↓                              ↓
 ↑                                              ↓                     (mention.target = human)
 ↑                                              ↓                              ↓
 ↑                                         speaking ←──(agent done,           awaiting
 ↑                                              ↓       queue not empty)        ↓
 ↑                                              ↓                        ┌─────┼──────┐
 ↑                                              ↓                        ↓     ↓      ↓
 ↑──────(queue empty, no input)────────────── idle          human    voice   timeout
 ↑                                                        responds  input   (30s)
 ↑                                                           ↓        ↓      ↓
 ↑                                                        speaking  hearing  resume
 ↑                                                        (resume   (new     queue or
 ↑                                                         queue)   flush)   → idle
 ↑──────────────────────────────────────────────────────────────────────────────┘
```

**Valid transitions involving `awaiting`:**

| From        | To          | Trigger                                     |
| ----------- | ----------- | ------------------------------------------- |
| `speaking`  | `awaiting`  | Current agent's mention targets a human     |
| `awaiting`  | `speaking`  | Human responded, agentQueue has remaining   |
| `awaiting`  | `hearing`   | New voice input arrives during await         |
| `awaiting`  | `idle`      | 30s timeout + empty agentQueue              |

**`HUMAN_CALLOUT_TIMEOUT_MS`** is defined in `turnConfig.ts` (default: 30000). Configurable per deployment.

#### Race Condition Defenses

Three race conditions are possible in the `awaiting` state:

**RC1: Simultaneous voice input + button click**
Button click (deliberate human action) takes precedence over voice `speechStart` (low-level detection). `onHumanResponse()` clears the flush timer and input buffer before resuming.

```typescript
onHumanResponse(roomId, userId, text): void {
  if (room.state !== "awaiting") return;
  this.clearAwaitingTimer(room);
  this.clearFlushTimer(room);
  room.inputBuffer = [];  // discard concurrent speech noise
  // Resume queue or idle
}
```

**RC2: Two agents completing near-simultaneously**
Gate `onAgentDone` with `if (room.activeAgent !== agentRole) return;` to ensure only the actually-active agent's handler proceeds.

**RC3: Timeout fires after state already changed**
Store timeout handle + generation counter in `RoomTurnState`. On timeout fire, verify `awaitingGeneration` still matches the value at timer creation time.

```typescript
interface RoomTurnState {
  // ... existing fields ...
  awaitingTimer: ReturnType<typeof setTimeout> | null;
  awaitingGeneration: number;
}
```

### 3.4 Backward Compatibility

When `mention` is `null` or JSON parse fails, the system falls back to the existing keyword-based `checkFollowUp()` as a safety net. Both systems can coexist.

---

## 4. Sophia Secretary Agent

### 4.1 Identity

| Property  | Value                                           |
| --------- | ----------------------------------------------- |
| Name      | Sophia                                          |
| Role      | Secretary / Executive Assistant                 |
| Color     | Gold (#F59E0B)                                  |
| Icon      | 👩‍💼                                              |
| Position  | Standing next to big screen [2.0, 0, -6.5]     |
| Voice     | None — text-only chat messages                  |
| Turn      | No turn — runs in background pipeline           |

### 4.2 Three Roles

#### Role 1: Visual Artifact Generation

```
C-Suite response includes visual_hint
  ↓
Sophia pipeline receives visual_hint + recent conversation context
  ↓
Sophia GPT call (Spark model — fast):
  Input: visual_hint + conversation excerpt
  Output: Complete rendering JSON with all data filled in
  ↓
JSON sent to frontend via SignalR:
  {type: "bigScreenUpdate", payload: {visualType, renderData}}
  ↓
Big screen renders template with data (fade-in transition)
  ↓
Sophia chat message: "📊 비교표를 빅스크린에 띄웠습니다"
```

#### Role 2: Meeting Minutes Accumulation

```
Every agent speech + human response → appended to Sophia's internal buffer:
  {
    speaker: string,
    role: string,
    speech: string,
    key_points: string[],
    visual_hint: VisualHint | null,
    decisions: string[],   // extracted from confirm responses
    timestamp: number
  }
  ↓
On meeting end:
  Sophia GPT call (GPT-5.4 — high quality, temperature 0.4):
    Input: full buffer
    System prompt includes Chain-of-Thought instruction:
      "먼저 회의 전체 흐름을 분석합니다:
       1. 논의된 핵심 안건을 정리합니다
       2. 각 안건별 결정 사항을 확인합니다
       3. 미결 사항과 액션아이템을 구분합니다
       분석 후, JSON 형식으로 회의록을 작성합니다."
    Output: structured meeting minutes (agenda-based summary format)
  ↓
  Generate PPT + Excel + Planner tasks (see §8)
```

#### Role 3: Key Points Relay

```
C-Suite response key_points array
  ↓ (no additional GPT call)
Sent to frontend via SignalR:
  {type: "monitorUpdate", payload: {target: "chairman", agentRole, keyPoints}}
  ↓
Chairman monitor: fade-in display of key points as a prepared texture
```

### 4.3 Chat Message Style

Sophia messages use a distinct visual style in ChatOverlay:

```
┌─ Gold left border ──────────────────────┐
│ 👩‍💼 Sophia                               │
│ 📊 비교표를 빅스크린에 띄웠습니다        │
└─────────────────────────────────────────┘
```

- Compact height (not full bubble)
- Gold (#F59E0B) left border + muted gold background
- No avatar circle — inline emoji only
- System notification feel, not conversation participant

### 4.4 Sophia Type Identity

Sophia is **not** a C-Suite agent and does not participate in TurnManager's agentQueue. Define a separate type:

```typescript
// Sophia is separate from AgentRole to prevent accidental turn-taking
export type SecretaryRole = "sophia";
export type AllAgentRole = AgentRole | SecretaryRole;

// Guard: Sophia must never be queued in TurnManager
// TurnManager.addToQueue() only accepts AgentRole, not SecretaryRole
```

### 4.5 Sophia Internal Architecture

```typescript
interface SophiaState {
  roomId: string;
  buffer: SophiaBufferEntry[];
  decisions: string[];
  actionItems: ActionItemDraft[];
  visualHistory: VisualArtifact[];  // for embedding in meeting minutes
}

interface SophiaBufferEntry {
  speaker: string;
  role: string;
  speech: string;
  keyPoints: string[];
  visualHint: VisualHint | null;
  timestamp: number;
}

interface VisualArtifact {
  type: VisualType;
  title: string;
  renderData: BigScreenRenderData;
  timestamp: number;
  agendaItem: string;
}
```

### 4.6 Sophia Visual Generation Call Chain

```
1. EVENT TRIGGER:
   TurnManager emits "agentResponseDone:{roomId}" with structured output
     ↓
   SophiaAgent.onAgentResponse(roomId, structuredOutput) listener fires

2. GUARD CHECK:
   if (!structuredOutput.visual_hint) return;  // no visual needed

3. GPT CALL:
   model: getModelForTask("visual-gen")  // Spark — fast
   messages: [
     { role: "system", content: SOPHIA_VISUAL_SYSTEM_PROMPT },
     { role: "user", content: JSON.stringify({
         visual_hint: structuredOutput.visual_hint,  // type + title only
         recent_context: last3Speeches,
       })
     },
   ]
   response_format: { type: "json_schema", json_schema: VISUAL_RENDER_SCHEMA }
   max_tokens: 500
   temperature: 0.2  // high accuracy for data extraction

   SOPHIA_VISUAL_SYSTEM_PROMPT:
   ```
   당신은 BizRoom.ai의 데이터 시각화 어시스턴트입니다.
   visual_hint와 최근 대화 맥락을 바탕으로 BigScreenRenderData JSON을 생성합니다.

   ## type별 data 구조
   comparison: {"columns": ["항목", "A", "B"], "rows": [["비용", "1억", "2억"]]}
   pie-chart: {"items": [{"label": "항목", "value": 40, "color": "#hex"}]}
   bar-chart: {"items": [{"label": "항목", "value": 120}]}
   timeline: {"items": [{"date": "3월", "label": "기획", "status": "done|current|pending"}]}
   checklist: {"items": [{"text": "항목", "checked": true|false}]}
   summary: {"items": ["포인트1", "포인트2"]}
   architecture: {"nodes": [{"id": "n1", "label": "이름", "x": 0, "y": 0}], "edges": [{"from": "n1", "to": "n2"}]}

   ## 규칙
   - 모든 텍스트는 한국어
   - value는 정수 (소수점 없음)
   - color는 hex 코드, pie-chart에만 사용
   - 데이터는 대화 맥락에서 추출, 없으면 합리적으로 추정
   - items 개수: 3-7개 (시각적 가독성)
   ```

4. RESPONSE PARSE:
   Parse JSON → validate against BigScreenRenderData discriminated union
   If parse fails → log error, skip visual (meeting continues uninterrupted)

5. SIGNALR BROADCAST:
   signalR.broadcast(roomId, {
     type: "bigScreenUpdate",
     payload: { visualType, title, renderData },
   });
   signalR.broadcast(roomId, {
     type: "sophiaMessage",
     payload: { text: `📊 ${title}를 빅스크린에 띄웠습니다` },
   });

6. BUFFER:
   sophia.visualHistory.push({ type, title, renderData, timestamp, agendaItem });
```

**Error isolation:** Sophia's visual pipeline runs in a `try/catch` block. Failures are logged but never interrupt the main conversation flow. The TurnManager and C-Suite agent pipeline are completely independent.

**Concurrency:** If multiple agents respond in quick succession with `visual_hint`, Sophia uses a **"latest wins"** strategy. A `pendingVisualAbortController` cancels any in-flight GPT call when a new `visual_hint` arrives. The big screen only displays the most recent visual — no flickering from rapid updates.

---

## 5. Visualization System

### 5.1 Big Screen (ArtifactScreen3D)

#### Rendering Pipeline

```
Sophia generates complete render JSON
  ↓
Frontend receives via SignalR {type: "bigScreenUpdate"}
  ↓
SVG template string generated from renderData (no DOM dependency)
  ↓
SVG → Canvas 2D (canvg or native SVG→Canvas) in offscreen canvas
  ↓
Three.js CanvasTexture applied to ArtifactScreen3D mesh
  ↓
Double-buffered swap: new texture fully ready → fade transition (0.3s)
```

**Rendering approach:** Use SVG-based rendering instead of html2canvas. html2canvas is ~1.2MB, runs on main thread, and causes frame drops in Three.js 60fps scenes. SVG templates render directly to `<canvas>` via native `drawImage(svgImage)` or the lightweight `canvg` library (~50KB). For the 7 template types, Canvas 2D API functions can also be used directly for maximum performance.

| Approach          | Bundle Size | Main Thread Impact | CSS Support |
| ----------------- | ----------- | ------------------ | ----------- |
| ~~html2canvas~~   | ~1.2MB      | Heavy (blocks)     | Partial     |
| **SVG → Canvas**  | ~50KB       | Light              | SVG subset  |
| **Canvas 2D API** | 0KB         | Minimal            | N/A         |

**Recommendation:** SVG templates for chart/table types (pie, bar, comparison, timeline), Canvas 2D for simple types (checklist, summary). Both are offscreen-compatible and non-blocking.

#### Template Types

| Type           | Template Layout                                    |
| -------------- | -------------------------------------------------- |
| `comparison`   | Two-column table with header + rows                |
| `pie-chart`    | SVG pie chart with labels and percentages          |
| `bar-chart`    | Horizontal bars with labels and values             |
| `timeline`     | Horizontal timeline with markers and labels        |
| `checklist`    | Vertical list with check/uncheck icons             |
| `summary`      | Numbered bullet list with title                    |
| `architecture` | Box-and-arrow SVG diagram                          |

#### Transition Animation

```
Current content visible
  ↓ opacity: 1 → 0 (0.3s ease-out)
New texture swap (instantaneous, invisible)
  ↓ opacity: 0 → 1 (0.3s ease-in) + border pulse glow
Stable display
```

#### Double Buffering Requirement

New textures must be **fully rendered and ready** before initiating the fade transition. No partial renders, no layout jumps. The offscreen render happens completely before the swap.

### 5.2 Chairman Monitor (HoloMonitor3D)

Extends existing HoloMonitor3D with dynamic content modes:

| Mode          | Trigger                      | Content                           |
| ------------- | ---------------------------- | --------------------------------- |
| `idle`        | Default                      | Current agenda title              |
| `keyPoints`   | Agent speaking               | Key points (fade-in as texture)   |
| `confirm`     | mention.intent = "confirm"   | Options as clickable 3D buttons   |
| `callout`     | mention.intent = "opinion"   | "발언을 요청합니다" alert         |
| `actionItems` | Meeting end                  | Action items summary              |

#### Confirm Mode Interaction

```
Monitor shows: [A안] [B안] as 3D clickable planes
  ├─ User clicks in 3D (raycaster) → selection sent to TurnManager
  └─ User says "A안" (voice STT) → TurnManager parses and selects
```

### 5.3 Team Member Monitor

| Mode          | Trigger                          | Content                        |
| ------------- | -------------------------------- | ------------------------------ |
| `idle`        | Default                          | Name + role display            |
| `callout`     | mention.target = "member:직무"   | 🔔 callout alert + border pulse |
| `actionItems` | Meeting end                      | Assigned action items          |

### 5.4 Agent Monitor

| Mode          | Trigger              | Content                        |
| ------------- | -------------------- | ------------------------------ |
| `idle`        | Default              | Role name + "대기"             |
| `thinking`    | Routing phase        | Role name + "생각 중..." + dot animation |
| `speaking`    | Active agent         | Role name + "발언 중"          |

---

## 6. Team Member System

### 6.1 Join Flow

```
Team member enters lobby
  ↓
Role selection screen:
  Preset buttons: [마케팅] [개발] [디자인] [영업] [기획] [재무] [법무]
  Free input: [직접 입력...] text field
  Name input: "김과장"
  ↓
POST /api/meeting/join {roomId, userId, userName, role: "마케팅"}
  ↓
Backend:
  - Add to room participants
  - Broadcast to agents: "마케팅 담당 김과장이 참석했습니다"
  - Update agent system prompts with participant list
  ↓
Frontend:
  - 3D: Avatar appears at HUMAN_EXTRA_SEATS[n]
  - HoloMonitor3D for the new seat activates
  - ParticipantOverlay updates
```

### 6.2 Agent Mention of Team Members

```json
{
  "speech": "마케팅 담당자분, 현재 캠페인 집행 현황을 공유해주시겠어요?",
  "mention": {
    "target": "member:마케팅",
    "intent": "opinion"
  }
}
```

**Matching algorithm:** The `member:` prefix + role string is matched against participants using **case-insensitive exact match** against the role string provided at join time. The agent system prompt includes the exact role strings of current participants (e.g., `팀원: 김과장(마케팅), 이대리(개발)`), ensuring agents use the exact role string in their `mention.target`.

If multiple members share the same role, the callout goes to all of them. Korean and English role names are matched independently (no cross-language fuzzy matching).

### 6.3 Constraints

| Item              | Limit                              |
| ----------------- | ---------------------------------- |
| Max team members  | 2 (existing HUMAN_EXTRA_SEATS)     |
| Role presets      | 7 fixed + free input               |
| Team member avatar | Default Chairman-style RPM model  |

---

## 7. Model Routing & Web Search

### 7.1 Updated ModelRouter

```typescript
export type TaskType =
  | "agent-response"   // C-Suite structured output (web search tool always included)
  | "visual-gen"       // Sophia visual artifact JSON
  | "minutes"          // Sophia meeting minutes (CoT enabled)
  | "parse-fallback";  // JSON parse failure recovery

export function getModelForTask(task: TaskType): string {
  switch (task) {
    case "agent-response":
    case "minutes":
      // GPT-5.4: flagship model (Azure AI Foundry, available since 2026-03-11)
      // Fallback chain: env var → gpt-5.4 → gpt-4o (if 5.4 unavailable)
      return process.env.AZURE_OPENAI_DEPLOYMENT_PREMIUM ?? "gpt-5.4";
    case "visual-gen":
    case "parse-fallback":
      // Spark: fast generation model (15x speed)
      // Fallback chain: env var → spark → gpt-4o-mini (if Spark unavailable)
      return process.env.AZURE_OPENAI_DEPLOYMENT_FAST ?? "gpt-5.3-codex-spark";
  }
}
```

**Note:** `agent-search` removed — web search is now always available as a tool in every `agent-response` call. The model decides when to invoke it (single-pass pattern, §7.2).

**Model availability note:** GPT-5.4 and GPT-5.3-Codex-Spark are available on Azure AI Foundry Model Router. Deployment names vary by Azure instance — always configure via environment variables. If models are unavailable in a region, fall back to `gpt-4o` / `gpt-4o-mini` respectively.

**Migration from existing TaskType:** The current `ModelRouter.ts` uses `"chat" | "artifact" | "research" | "summary"`. During implementation, update all callers:

| Old TaskType   | New TaskType       | Callers                                              |
| -------------- | ------------------ | ---------------------------------------------------- |
| `"chat"`       | `"agent-response"` | `AgentFactory.invokeAgent()`, `invokeAgentStream()`  |
| `"artifact"`   | `"minutes"`        | `AgentFactory.invokeAgent(task="artifact")`          |
| `"research"`   | `"agent-response"` | Merged — web search is always available as tool      |
| `"summary"`    | `"minutes"`        | Merged into minutes path                             |

### 7.2 Web Search Integration — Single-Pass Pattern

**Approach:** Always include `web_search` tool definition in every Chat Completions call. The model invokes it only when it genuinely needs real-time data. This eliminates the two-phase latency penalty.

```typescript
const response = await client.chat.completions.create({
  model: getModelForTask("agent-response"),
  response_format: { type: "json_schema", json_schema: CSUITE_RESPONSE_SCHEMA },
  stream: true,
  messages: buildAgentMessages(role, context, humanInput, agenda),
  tools: [{
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for real-time market data, news, or statistics",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  }],
  temperature: 0.5,  // balanced: natural speech + reliable JSON structure
});
```

**Latency comparison:**

| Pattern                     | Non-web Response | Web Response    |
| --------------------------- | ---------------- | --------------- |
| ~~Two-phase (old)~~         | 800-1500ms       | 2300-4500ms     |
| **Single-pass (new)**       | 800-1500ms       | 2000-3000ms     |

**Over-trigger mitigation:** Add to system prompt: "웹 검색은 실시간 시장 데이터, 최신 뉴스, 통계가 필요한 경우에만 사용합니다. 일반 토론에는 사용하지 않습니다."

**Azure native web search:** If deployment supports `web_search_preview` as a native tool (Azure AI Foundry), use that instead. Set `AZURE_OPENAI_WEB_SEARCH_ENABLED=true` to enable.

Citations from web search are:
1. Included in `speech` for the chat panel
2. Displayed on the big screen as source references

### 7.3 API Client Setup

```
Chat Completions API (client.chat.completions.create)
  └─ All tasks: agent-response, visual-gen, minutes, parse-fallback
  └─ response_format: { type: "json_schema" } for structured output
  └─ tools: web_search always included (model decides when to invoke)
  └─ stream: true for agent-response (early speech extraction)
```

### 7.4 Temperature Settings

Task-based temperature replaces per-agent temperature for structured output calls:

| TaskType           | Temperature | Rationale                                  |
| ------------------ | ----------- | ------------------------------------------ |
| `agent-response`   | 0.5         | Balanced: natural speech + reliable JSON   |
| `visual-gen`       | 0.2         | Data accuracy critical                     |
| `minutes`          | 0.4         | Good summarization + factual accuracy      |
| `parse-fallback`   | 0.1         | Deterministic repair                       |

**Note:** Per-agent personality (0.6-0.9 in `agentVoices.ts`) is preserved for TTS voice prosody, not for structured output generation. The dual-call architecture naturally separates content temperature from delivery temperature.

---

## 8. Microsoft Artifact Generation

### 8.1 Overview

On meeting end, Sophia generates Microsoft 365 artifacts and uploads to OneDrive.

### 8.2 Artifact Pipeline

```
Meeting end triggered
  ↓
Sophia GPT call (GPT-5.4): generate structured meeting minutes JSON
  {
    meetingInfo: {title, date, participants},
    agendas: [{title, summary, keyPoints, decisions, visualRefs}],
    actionItems: [{description, assignee, deadline}],
    budgetData: [{label, value}]  // if financial discussion occurred
  }
  ↓ parallel generation:
  ├─ PPT: pptxgenjs → .pptx buffer
  ├─ Excel: exceljs → .xlsx buffer (if budget/numerical data exists)
  └─ Planner: Graph API → create tasks
  ↓
  Graph API: upload files to OneDrive
  ↓
  SignalR broadcast:
    {type: "artifactsReady", payload: {files: [{name, type, driveItemId, webUrl}]}}
  ↓
  Big screen: show file list with [열기] buttons
  Chairman monitor: show file list with download links
  Click [열기] → Office Online iframe embed
```

### 8.3 PowerPoint Structure

```
Slide 1: Title slide
  - Meeting title, date, participants

Slide 2-N: Agenda slides (one per agenda item)
  - Agenda title
  - Summary (2-3 bullets)
  - Embedded visual (chart/table image if visual was generated during meeting)

Slide N+1: Decisions
  - All decisions with approval status

Slide N+2: Action Items
  - Table: description, assignee, deadline, status

Slide N+3: Thank you / next steps
```

### 8.4 Excel Structure

Generated only when financial/numerical data was discussed.

```
Sheet 1: "예산 분석"
  - Budget allocation table
  - Pie chart / bar chart

Sheet 2: "액션아이템"
  - Action items table with status column

Sheet 3: "원본 데이터"
  - Raw numerical data from CFO discussions
```

### 8.5 Planner Integration

```typescript
// Create Planner tasks via Graph API
for (const item of actionItems) {
  await graphClient.api(`/planner/tasks`).post({
    planId: meetingPlanId,
    title: item.description,
    assignments: { [item.assigneeId]: { orderHint: " !" } },
    dueDateTime: item.deadline,
  });
}
```

### 8.6 Dependencies

| Package                             | Purpose                         | Size      |
| ----------------------------------- | ------------------------------- | --------- |
| `pptxgenjs`                         | PowerPoint generation           | ~300KB    |
| `exceljs`                           | Excel generation                | ~200KB    |
| `@microsoft/microsoft-graph-client` | Graph API (OneDrive, Planner)   | ~50KB     |
| `@azure/msal-node`                  | Confidential Client auth        | ~200KB    |
| `partial-json`                      | Incremental JSON streaming parser | ~2KB    |

### 8.7 Deployment Considerations

Artifact generation (PPT + Excel + Planner) runs at meeting end — a burst of CPU/memory activity. On Azure Functions Consumption Plan (1.5GB memory, 5-min default timeout):

- **Hackathon strategy:** Use `Promise.allSettled()` in a regular HTTP function (the Function App is already warm from the meeting — no cold start). Durable Functions is reserved for production.
  ```typescript
  // meetingEnd.ts — regular HTTP function
  const minutesData = await sophiaAgent.generateMeetingMinutes(roomId);

  const [pptResult, excelResult, plannerResult] = await Promise.allSettled([
    generatePPT(minutesData),
    minutesData.budgetData?.length ? generateExcel(minutesData) : Promise.resolve(null),
    createPlannerTasks(minutesData.actionItems),
  ]);

  // Upload successful results to OneDrive (failures → local download fallback)
  const files = await uploadSuccessful(pptResult, excelResult, plannerResult);
  broadcastEvent(roomId, { type: "artifactsReady", payload: { files } });
  ```
- **Progress reporting:** Each settled promise reports status via SignalR (e.g., "PPT 생성 중... 2/4 완료").
- **Timeout fallback:** If any generation fails within 60s, fall back to Markdown meeting minutes (immediate, no external deps).
- **Production upgrade path:** Migrate to Azure Durable Functions (fan-out/fan-in pattern) for retry logic, long-running orchestration, and monitoring.

### 8.8 Graph API Authentication

Use **Confidential Client application flow** (`client_credentials` grant) for server-side artifact operations:

```typescript
// GraphService.ts
const cca = new ConfidentialClientApplication({
  auth: {
    clientId: process.env.GRAPH_CLIENT_ID!,
    authority: `https://login.microsoftonline.com/${process.env.GRAPH_TENANT_ID}`,
    clientSecret: process.env.GRAPH_CLIENT_SECRET!,
  },
});

// Application permissions needed: Files.ReadWrite.All, Tasks.ReadWrite.All
```

**Planner batch optimization:** Use Graph API `$batch` endpoint for creating multiple tasks in a single HTTP request (up to 20 per batch).

---

## 9. Event Flow & Data Architecture

### 9.1 New SignalR Event Types

```typescript
// Add to RoomBroadcastEvent discriminated union
export type RoomBroadcastEvent =
  // ... existing events ...
  | { type: "agentThinking"; payload: AgentThinkingEvent }
  | { type: "humanCallout"; payload: HumanCalloutEvent }
  | { type: "bigScreenUpdate"; payload: BigScreenUpdateEvent }
  | { type: "monitorUpdate"; payload: MonitorUpdateEvent }
  | { type: "sophiaMessage"; payload: SophiaMessageEvent }
  | { type: "artifactsReady"; payload: ArtifactsReadyEvent };
```

### 9.2 New Event Interfaces

```typescript
export interface AgentThinkingEvent {
  roles: AgentRole[];  // which agents are "thinking"
}

export interface HumanCalloutEvent {
  target: "chairman" | `member:${string}`;
  intent: "opinion" | "confirm";
  options?: string[];
  fromAgent: AgentRole;
}

export interface BigScreenUpdateEvent {
  visualType: VisualType;
  title: string;
  renderData: BigScreenRenderData;  // discriminated union per visual type
}

export interface MonitorUpdateEvent {
  target: "chairman" | `member:${string}` | AgentRole;
  mode: "idle" | "keyPoints" | "confirm" | "callout" | "actionItems" | "thinking" | "speaking";
  content: MonitorContent;
}

// Discriminated unions for type-safe rendering data
export type BigScreenRenderData =
  | { type: "comparison"; columns: string[]; rows: string[][] }
  | { type: "pie-chart"; items: Array<{ label: string; value: number; color: string }> }
  | { type: "bar-chart"; items: Array<{ label: string; value: number }> }
  | { type: "timeline"; items: Array<{ date: string; label: string; status: "done" | "current" | "pending" }> }
  | { type: "checklist"; items: Array<{ text: string; checked: boolean }> }
  | { type: "summary"; items: string[] }
  | { type: "architecture"; nodes: Array<{ id: string; label: string; x: number; y: number }>; edges: Array<{ from: string; to: string }> };

export type MonitorContent =
  | { type: "idle"; text: string }
  | { type: "keyPoints"; agentRole: AgentRole; points: string[] }
  | { type: "confirm"; options: string[]; fromAgent: AgentRole }
  | { type: "callout"; message: string; fromAgent: AgentRole }
  | { type: "actionItems"; items: Array<{ description: string; assignee: string }> }
  | { type: "thinking"; text: string }
  | { type: "speaking"; text: string };

export interface SophiaMessageEvent {
  text: string;       // e.g., "📊 비교표를 빅스크린에 띄웠습니다"
  visualRef?: string;  // reference to visual artifact
}

export type ArtifactFileType = "pptx" | "xlsx" | "planner";

export interface ArtifactsReadyEvent {
  files: Array<{
    name: string;
    type: ArtifactFileType;
    webUrl: string;
    driveItemId?: string;
  }>;
}

// Update shared/types.ts ArtifactType to include new file types
// export type ArtifactType = "excel" | "markdown" | "image" | "powerpoint" | "planner";

export type VisualType =
  | "comparison"
  | "pie-chart"
  | "bar-chart"
  | "timeline"
  | "checklist"
  | "summary"
  | "architecture";
```

### 9.3 Complete Event Sequence — Typical Turn

```
1. User speaks: "신제품 출시 전략을 논의합시다"
   ↓
2. TurnManager: state idle → hearing → routing
   ↓ emit agentThinking (roles: [coo, cmo, cfo])
   ↓
3. Frontend: agent avatars show thinking dots, monitors show "생각 중..."
   ↓
4. TurnManager: trigger COO Hudson
   ↓ emit triggerAgent + agentTyping
   ↓
5. Hudson responds (structured output):
   {
     speech: "정리하겠습니다. CMO와 CFO의 의견을 먼저 들어보겠습니다.",
     key_points: ["CMO 의견 요청", "CFO 예산 검토 요청"],
     mention: {target: "cmo", intent: "opinion"},
     visual_hint: null
   }
   ↓
6. TurnManager: parse mention → add CMO to queue
   ↓ emit monitorUpdate (chairman, keyPoints)
   ↓
7. Frontend: chairman monitor shows key points (fade-in)
   ↓
8. CMO Yusef responds:
   {
     speech: "타겟은 2030세대입니다. 디지털 캠페인 중심, 예산 3억 필요합니다.",
     key_points: ["2030세대 타겟", "디지털 캠페인", "예산 3억"],
     mention: {target: "cfo", intent: "opinion"},
     visual_hint: {type: "pie-chart", title: "타겟 고객 세그먼트", data: {...}}
   }
   ↓
9. Parallel:
   a. TurnManager: add CFO to queue
   b. Sophia: receive visual_hint → GPT Spark call → render JSON
      → emit bigScreenUpdate (pie-chart)
      → emit sophiaMessage ("📊 타겟 고객 차트를 빅스크린에 띄웠습니다")
   c. Frontend: chairman monitor updates with CMO key points
   ↓
10. CFO Amelia responds:
    {
      speech: "3억이면 마케팅 예산의 40%입니다. 1차 1.5억 선집행을 제안합니다.",
      key_points: ["마케팅 40%", "1차 1.5억", "성과 보고 후 2차"],
      mention: {target: "chairman", intent: "confirm", options: ["1차 선집행 승인", "전액 일시 집행"]},
      visual_hint: {type: "comparison", title: "예산 집행 방안", data: {...}}
    }
    ↓
11. Parallel:
    a. TurnManager: state → "awaiting" (human callout)
       → emit humanCallout (chairman, confirm, options)
       → start 30s timeout
    b. Sophia: generate comparison visual → bigScreenUpdate
    c. Frontend:
       - Big screen: comparison table (fade-in)
       - Chairman monitor: [1차 선집행 승인] [전액 일시 집행] buttons
       - All avatars look at chairman
       - Sophia looks at chairman
    ↓
12. Chairman responds: clicks "1차 선집행 승인" or says "1차로 가죠"
    ↓
13. TurnManager: save decision, resume queue
    → Sophia: record decision in buffer
    → Next agent or idle
```

---

## 10. 3D Scene Changes

### 10.1 Sophia Avatar

| Property       | Value                                                |
| -------------- | ---------------------------------------------------- |
| Model          | RPM GLB (blonde, glasses, suit) — new model file     |
| Position       | [2.0, 0, -6.5] — right of ArtifactScreen3D          |
| Pose           | Standing (not seated) — unique among all characters   |
| Props          | Tablet in left hand (modeled or implied by pose)      |
| Facing         | Toward table center (faceCenter calculation)          |

#### Animation States

| State               | Morph Targets / Bone Animation                     |
| -------------------- | -------------------------------------------------- |
| `idle`              | Subtle breathing, looking at tablet, periodic blink |
| `generating`        | Tablet tap motion, glance toward big screen         |
| `screenUpdated`     | Head up, look toward table                          |
| `humanCallout`      | Look toward called person                           |
| `meetingEnd`        | Small step forward, present gesture                 |

### 10.2 Agent Thinking State

When TurnManager enters `routing` and determines agent queue:

```
emit agentThinking:{roomId} (roomId, roles: AgentRole[])
  ↓
Frontend: for each role in roles:
  - RPMAgentAvatar shows thinking dots (already implemented)
  - HoloMonitor3D shows "생각 중..." text
  - ParticipantOverlay shows amber pulse
```

### 10.3 Gaze Behavior Updates

| Event                        | All agents look at    | Sophia looks at     |
| ---------------------------- | --------------------- | ------------------- |
| Agent speaking               | Speaking agent        | Tablet (note-taking) |
| Human callout                | Called human           | Called human         |
| Chairman responding          | Chairman              | Chairman            |
| Big screen update            | Brief glance at screen | Screen              |

---

## 11. Error Handling & Graceful Degradation

| Failure                         | Degradation                                          |
| ------------------------------- | ---------------------------------------------------- |
| JSON parse failure              | Use raw text as speech, skip mention/visual/keypoints |
| Sophia GPT call fails           | Skip visual, log error, meeting continues            |
| Big screen texture render fails | Keep previous visual, log error                      |
| Graph API fails (OneDrive)      | Generate files locally, offer download               |
| Web search fails                | Respond without web data, note in speech             |
| Human callout timeout (30s)     | Auto-resume with notice message                      |
| pptxgenjs/exceljs fails         | Fall back to Markdown meeting minutes                |

---

## 12. File Inventory

### 12.1 New Files

| File                                               | Purpose                                |
| -------------------------------------------------- | -------------------------------------- |
| `backend/src/agents/SophiaAgent.ts`                | Sophia pipeline (visual gen + minutes) |
| `backend/src/agents/prompts/sophia.ts`             | Sophia system prompt                   |
| `backend/src/services/ArtifactGenerator.ts`        | PPT/Excel generation (pptxgenjs, exceljs) |
| `backend/src/services/GraphService.ts`             | Microsoft Graph API client (OneDrive, Planner) |
| `backend/src/orchestrator/ResponseParser.ts`       | Parse C-Suite structured output JSON   |
| `frontend/src/components/meeting3d/SophiaAvatar.tsx` | Sophia 3D avatar (standing pose)     |
| `frontend/src/components/meeting3d/BigScreenRenderer.tsx` | Template-based visual rendering  |
| `frontend/src/components/meeting3d/templates/`     | 7 visual templates (comparison, pie, bar, etc.) |
| `frontend/src/components/chat/SophiaMessage.tsx`   | Gold-styled compact message bubble     |
| `frontend/src/components/meeting/RoleSelector.tsx` | Team member role selection UI          |

### 12.2 Modified Files

| File                                               | Changes                                |
| -------------------------------------------------- | -------------------------------------- |
| `shared/types.ts`                                  | New event types, VisualType, Mention, StructuredOutput |
| `backend/src/models/index.ts`                      | Re-export new types                    |
| `backend/src/orchestrator/TurnManager.ts`          | "awaiting" state, mention parsing, agentThinking emit |
| `backend/src/orchestrator/VoiceLiveOrchestrator.ts` | Wire Sophia events, humanCallout      |
| `backend/src/orchestrator/ContextBroker.ts`        | Store decisions, action items          |
| `backend/src/agents/agentConfigs.ts`               | Add Sophia config                      |
| `backend/src/agents/prompts/*.ts`                  | Add structured output instructions     |
| `backend/src/services/ModelRouter.ts`              | New TaskTypes, GPT-5.4/Spark routing   |
| `backend/src/services/SignalRService.ts`           | New broadcast event types              |
| `backend/src/services/VoiceLiveSessionManager.ts`  | Parse structured output from agent responses |
| `backend/src/constants/turnConfig.ts`              | HUMAN_CALLOUT_TIMEOUT_MS = 30000       |
| `frontend/src/context/MeetingContext.tsx`           | New state: bigScreenData, monitorData, artifacts |
| `frontend/src/hooks/useSignalR.ts`                 | Handle new event types                 |
| `frontend/src/components/meeting3d/MeetingRoom3D.tsx` | Add Sophia avatar, update monitors  |
| `frontend/src/components/meeting3d/HoloMonitor3D.tsx` | Dynamic content modes               |
| `frontend/src/components/meeting3d/ArtifactScreen3D.tsx` | Template rendering, double buffer |
| `frontend/src/components/chat/MessageBubble.tsx`   | Sophia message style variant           |
| `frontend/src/constants/strings.ts`                | Sophia strings, role selector strings  |
| `backend/package.json`                             | Add pptxgenjs, exceljs dependencies    |

---

## Appendix A: Sophia RPM Avatar Spec

- **Gender**: Female
- **Hair**: Blonde, professional style
- **Glasses**: Yes (rectangular frames)
- **Outfit**: Dark suit / blazer
- **Pose**: Standing, tablet held in left arm
- **Height**: ~1.7m (same scale as seated agents)
- **Ready Player Me**: Custom GLB model to be created

## Appendix B: Visual Template Data Schemas

### comparison

```json
{
  "type": "comparison",
  "title": "A안 vs B안",
  "data": {
    "columns": ["항목", "A안", "B안"],
    "rows": [["비용", "1.5억", "3억"], ["수익", "2억", "5억"]]
  }
}
```

### pie-chart

```json
{
  "type": "pie-chart",
  "title": "예산 분배",
  "data": {
    "items": [
      {"label": "마케팅", "value": 40, "color": "#f97316"},
      {"label": "개발", "value": 35, "color": "#3b82f6"},
      {"label": "운영", "value": 25, "color": "#10b981"}
    ]
  }
}
```

### bar-chart

```json
{
  "type": "bar-chart",
  "title": "분기별 매출",
  "data": {
    "items": [
      {"label": "Q1", "value": 120},
      {"label": "Q2", "value": 180},
      {"label": "Q3", "value": 250}
    ]
  }
}
```

### timeline

```json
{
  "type": "timeline",
  "title": "프로젝트 일정",
  "data": {
    "items": [
      {"date": "3월", "label": "기획", "status": "done"},
      {"date": "4월", "label": "개발", "status": "current"},
      {"date": "5월", "label": "테스트", "status": "pending"},
      {"date": "6월", "label": "출시", "status": "pending"}
    ]
  }
}
```

### checklist

```json
{
  "type": "checklist",
  "title": "액션아이템",
  "data": {
    "items": [
      {"text": "캠페인 기획서", "checked": true},
      {"text": "예산 상세안", "checked": false},
      {"text": "이용약관 개정", "checked": false}
    ]
  }
}
```

### summary

```json
{
  "type": "summary",
  "title": "핵심 포인트",
  "data": {
    "items": ["2030세대 핵심 타겟", "디지털 채널 중심", "1차 1.5억 선집행"]
  }
}
```

### architecture

```json
{
  "type": "architecture",
  "title": "시스템 구조",
  "data": {
    "nodes": [
      {"id": "fe", "label": "Frontend", "x": 0, "y": 0},
      {"id": "api", "label": "API Server", "x": 1, "y": 0},
      {"id": "db", "label": "Database", "x": 1, "y": 1}
    ],
    "edges": [
      {"from": "fe", "to": "api"},
      {"from": "api", "to": "db"}
    ]
  }
}
```
