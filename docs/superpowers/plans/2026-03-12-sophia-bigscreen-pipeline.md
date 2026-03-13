# Sophia BigScreen Pipeline & Skill Consolidation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** BigScreen 시각화 파이프라인을 end-to-end 연결하고, FIFO 큐 + Q/E 페이지네이션을 구현하며, C-Suite 분석 스킬을 Sophia에 통합한다.

**Architecture:** 4개의 disconnection을 순차 수정: (1) App.tsx SignalR 콜백 미연결 → (2) MeetingContext 히스토리 배열 전환 → (3) ArtifactScreen3D에 SVG Canvas 렌더링 통합 → (4) Q/E 키보드 내비게이션. 백엔드는 AbortController를 FIFO 큐로 교체하고, postMeetingQueue를 추가한다.

**Tech Stack:** React 18, Three.js/R3F, TypeScript, Azure Functions, OpenAI API

**현재 발견된 문제:**
```
Backend broadcasts "bigScreenUpdate"
  → SignalR hook receives it (useSignalR.ts:162) ✅
  → onBigScreenUpdate callback NOT wired in App.tsx ❌
  → bigScreenData in MeetingContext is NEVER read by any component ❌
  → BigScreenRenderer.tsx is NOT imported anywhere ❌
  → ArtifactScreen3D only handles ArtifactData, NOT BigScreenRenderData ❌
  → MeetingRoom3D doesn't receive bigScreenData ❌
```

---

## Chunk 1: Wire SignalR Callbacks + BigScreen History State

### Task 1: Wire missing SignalR callbacks in App.tsx

**Files:**
- Modify: `frontend/src/App.tsx:203-270`

- [ ] **Step 1: Add meeting interaction callbacks to useSignalR call**

Add `onBigScreenUpdate`, `onMonitorUpdate`, `onSophiaMessage`, `onArtifactsReady`, `onAgentThinking`, `onHumanCallout` callbacks to the `useSignalR()` call in `MeetingRoom()`:

```typescript
// Inside useSignalR({ ... }) in MeetingRoom(), after onStreamEnd:

// ── Meeting interaction callbacks ──
onBigScreenUpdate: useCallback(
  (payload: BigScreenUpdateEvent) => {
    dispatch({ type: "PUSH_BIG_SCREEN", payload });
  },
  [dispatch],
),
onMonitorUpdate: useCallback(
  (payload: MonitorUpdateEvent) => {
    dispatch({ type: "SET_MONITOR", payload });
  },
  [dispatch],
),
onSophiaMessage: useCallback(
  (payload: SophiaMessageEvent) => {
    dispatch({ type: "ADD_SOPHIA_MESSAGE", payload });
  },
  [dispatch],
),
onArtifactsReady: useCallback(
  (payload: ArtifactsReadyEvent) => {
    dispatch({ type: "SET_READY_ARTIFACTS", payload });
  },
  [dispatch],
),
onAgentThinking: useCallback(
  (payload: { roles: AgentRole[] }) => {
    dispatch({ type: "SET_THINKING_AGENTS", payload });
  },
  [dispatch],
),
onHumanCallout: useCallback(
  (payload: HumanCalloutEvent) => {
    dispatch({ type: "SET_HUMAN_CALLOUT", payload });
  },
  [dispatch],
),
```

Note: Add required type imports at top:
```typescript
import type {
  // ... existing imports ...
  BigScreenUpdateEvent,
  MonitorUpdateEvent,
  SophiaMessageEvent,
  ArtifactsReadyEvent,
  HumanCalloutEvent,
} from "./types";
```

- [ ] **Step 2: Verify hook registration works**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**
```bash
git add frontend/src/App.tsx
git commit -m "fix(ui): wire missing SignalR meeting interaction callbacks in App.tsx"
```

---

### Task 2: Convert BigScreen state from single value to history array

**Files:**
- Modify: `frontend/src/context/MeetingContext.tsx`

- [ ] **Step 1: Update MeetingState interface**

Change:
```typescript
bigScreenData: BigScreenUpdateEvent | null;
```
To:
```typescript
/** BigScreen visualization history (newest last) */
bigScreenHistory: BigScreenUpdateEvent[];
/** Index into bigScreenHistory currently displayed (-1 = latest) */
bigScreenIndex: number;
```

- [ ] **Step 2: Update initialState**

Change:
```typescript
bigScreenData: null,
```
To:
```typescript
bigScreenHistory: [],
bigScreenIndex: -1,
```

- [ ] **Step 3: Update LEAVE_ROOM reset**

Change `bigScreenData: null,` to:
```typescript
bigScreenHistory: [],
bigScreenIndex: -1,
```

- [ ] **Step 4: Replace SET_BIG_SCREEN action with PUSH_BIG_SCREEN and NAV_BIG_SCREEN**

Replace action type:
```typescript
// Remove:
| { type: "SET_BIG_SCREEN"; payload: BigScreenUpdateEvent }

// Add:
| { type: "PUSH_BIG_SCREEN"; payload: BigScreenUpdateEvent }
| { type: "NAV_BIG_SCREEN"; payload: "prev" | "next" }
```

Replace reducer case:
```typescript
// Remove SET_BIG_SCREEN case, add:
case "PUSH_BIG_SCREEN": {
  const MAX_HISTORY = 20;
  const next = [...state.bigScreenHistory, action.payload];
  const trimmed = next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
  // Auto-jump to latest on new data arrival
  return { ...state, bigScreenHistory: trimmed, bigScreenIndex: -1 };
}
case "NAV_BIG_SCREEN": {
  const len = state.bigScreenHistory.length;
  if (len === 0) return state;
  // Resolve current effective index (-1 means latest)
  const current = state.bigScreenIndex === -1 ? len - 1 : state.bigScreenIndex;
  const next = action.payload === "prev"
    ? Math.max(0, current - 1)
    : Math.min(len - 1, current + 1);
  // If at latest, store -1 to auto-follow new arrivals
  return { ...state, bigScreenIndex: next === len - 1 ? -1 : next };
}
```

- [ ] **Step 5: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: Errors only in App.tsx where old SET_BIG_SCREEN was used (now PUSH_BIG_SCREEN — already changed in Task 1)

- [ ] **Step 6: Commit**
```bash
git add frontend/src/context/MeetingContext.tsx
git commit -m "feat(ui): convert bigScreenData to history array with navigation actions"
```

---

### Task 3: Pass BigScreen data to MeetingRoom3D and add Q/E navigation

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/meeting3d/MeetingRoom3D.tsx`

- [ ] **Step 1: Derive current BigScreen event in MeetingRoom (App.tsx)**

Add after `currentArtifact` useMemo:
```typescript
// Current BigScreen visualization (resolved from history + index)
const currentBigScreen: BigScreenUpdateEvent | null = useMemo(() => {
  const { bigScreenHistory, bigScreenIndex } = state;
  if (bigScreenHistory.length === 0) return null;
  const idx = bigScreenIndex === -1 ? bigScreenHistory.length - 1 : bigScreenIndex;
  return bigScreenHistory[idx] ?? null;
}, [state.bigScreenHistory, state.bigScreenIndex]);

const bigScreenPage = useMemo(() => {
  const len = state.bigScreenHistory.length;
  if (len === 0) return null;
  const idx = state.bigScreenIndex === -1 ? len - 1 : state.bigScreenIndex;
  return { current: idx + 1, total: len };
}, [state.bigScreenHistory, state.bigScreenIndex]);
```

- [ ] **Step 2: Pass to MeetingRoom3D**

Update JSX:
```tsx
<MeetingRoom3D
  speakingAgent={state.speakingAgent}
  thinkingAgents={thinkingAgentRoles}
  meetingPhase={state.meetingPhase}
  currentArtifact={currentArtifact}
  humanParticipants={state.humanParticipants}
  bigScreenEvent={currentBigScreen}
  bigScreenPage={bigScreenPage}
  onBigScreenNav={(dir) => dispatch({ type: "NAV_BIG_SCREEN", payload: dir })}
/>
```

- [ ] **Step 3: Update MeetingRoom3D props interface**

```typescript
interface MeetingRoom3DProps {
  speakingAgent: string | null;
  thinkingAgents: string[];
  meetingPhase: string;
  currentArtifact?: ArtifactData | null;
  humanParticipants?: HumanParticipant[];
  /** BigScreen visualization data from Sophia */
  bigScreenEvent?: BigScreenUpdateEvent | null;
  /** Page info: { current: 1-based, total: count } */
  bigScreenPage?: { current: number; total: number } | null;
  /** Navigate BigScreen: "prev" or "next" */
  onBigScreenNav?: (dir: "prev" | "next") => void;
}
```

- [ ] **Step 4: Add Q/E keyboard handlers in MeetingRoom3D**

In the existing `handleKeyDown` function, add:
```typescript
// Q: previous BigScreen visualization
if (e.key === "q" || e.key === "Q") {
  onBigScreenNav?.("prev");
}
// E: next BigScreen visualization
if (e.key === "e" || e.key === "E") {
  onBigScreenNav?.("next");
}
```

- [ ] **Step 5: Pass bigScreenEvent to ArtifactScreen3D**

Change:
```tsx
<ArtifactScreen3D artifact={currentArtifact} />
```
To:
```tsx
<ArtifactScreen3D
  artifact={currentArtifact}
  bigScreenEvent={bigScreenEvent}
  pageInfo={bigScreenPage}
/>
```

- [ ] **Step 6: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: Errors in ArtifactScreen3D (new props not yet defined — fixed in next task)

- [ ] **Step 7: Commit**
```bash
git add frontend/src/App.tsx frontend/src/components/meeting3d/MeetingRoom3D.tsx
git commit -m "feat(ui): pass BigScreen data to 3D scene with Q/E keyboard navigation"
```

---

## Chunk 2: BigScreen 3D Rendering Integration

### Task 4: Integrate BigScreenRenderer with ArtifactScreen3D

**Files:**
- Modify: `frontend/src/components/meeting3d/ArtifactScreen3D.tsx`
- Modify: `frontend/src/components/meeting3d/BigScreenRenderer.tsx` (minor: add title to SVG)

- [ ] **Step 1: Update BigScreenRenderer to include title in SVG output**

Add a `renderWithTitle` wrapper in `BigScreenRenderer.tsx`:
```typescript
/** Render BigScreenUpdateEvent with title bar to canvas */
export function renderEventToCanvas(
  canvas: HTMLCanvasElement,
  event: BigScreenUpdateEvent,
): Promise<void> {
  // Reuse existing renderToCanvas which handles dedup
  return renderToCanvas(canvas, event);
}
```

Note: Title is already passed in the event but not rendered in SVG. Add title rendering to the SVG functions. In each `render*SVG` function, the title is available from the parent `renderToCanvas`. Update `renderToCanvas` to inject a title bar:

Actually, modify `renderToCanvas` to prepend a title to all SVGs:
```typescript
export function renderToCanvas(
  canvas: HTMLCanvasElement,
  event: BigScreenUpdateEvent,
): Promise<void> {
  if (event === lastRenderedEvent) return Promise.resolve();
  lastRenderedEvent = event;

  return new Promise((resolve, reject) => {
    let svgString: string;

    switch (event.renderData.type) {
      // ... existing switch cases (unchanged) ...
    }

    // Inject title bar into SVG (insert after opening <svg> and background rect)
    const titleSVG = `<text x="${SCREEN_WIDTH / 2}" y="28" text-anchor="middle" fill="#58a6ff" font-size="18" font-weight="bold">${esc(event.title)}</text>`;
    svgString = svgString.replace('fill="#0d1117"/>', `fill="#0d1117"/>${titleSVG}`);

    // ... rest of blob/img/canvas code (unchanged) ...
  });
}
```

- [ ] **Step 2: Update ArtifactScreen3D to accept BigScreen props**

Add imports and new props:
```typescript
import type { BigScreenUpdateEvent } from "../../types";
import { renderToCanvas } from "./BigScreenRenderer";

export interface ArtifactScreen3DProps {
  artifact: ArtifactData | null;
  position?: [number, number, number];
  /** Sophia BigScreen visualization event */
  bigScreenEvent?: BigScreenUpdateEvent | null;
  /** Page indicator: { current: 1, total: 5 } */
  pageInfo?: { current: number; total: number } | null;
}
```

- [ ] **Step 3: Add Canvas texture rendering for BigScreen data**

Inside `ArtifactScreen3D` component, add:
```typescript
const canvasRef = useRef<HTMLCanvasElement | null>(null);
const textureRef = useRef<THREE.CanvasTexture | null>(null);
const [hasTexture, setHasTexture] = useState(false);

// Create offscreen canvas once
useEffect(() => {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 576;
  canvasRef.current = canvas;
  return () => { canvasRef.current = null; };
}, []);

// Render BigScreen SVG to canvas texture when event changes
useEffect(() => {
  if (!bigScreenEvent || !canvasRef.current) {
    setHasTexture(false);
    return;
  }
  renderToCanvas(canvasRef.current, bigScreenEvent).then(() => {
    if (!canvasRef.current) return;
    if (textureRef.current) textureRef.current.dispose();
    const tex = new THREE.CanvasTexture(canvasRef.current);
    tex.needsUpdate = true;
    textureRef.current = tex;
    setHasTexture(true);
    // Update screen mesh material
    if (screenRef.current) {
      const mat = screenRef.current.material as THREE.MeshStandardMaterial;
      mat.map = tex;
      mat.needsUpdate = true;
    }
  }).catch((err) => {
    console.error("[BigScreen] Render failed:", err);
  });
}, [bigScreenEvent]);

// Cleanup texture on unmount
useEffect(() => {
  return () => {
    textureRef.current?.dispose();
  };
}, []);
```

- [ ] **Step 4: Update content layer to show BigScreen or Artifact or Idle**

Replace the content layer JSX:
```tsx
{/* Content layer — priority: BigScreen > Artifact > Idle */}
{hasTexture && bigScreenEvent ? null : artifact ? <ActiveScreen artifact={artifact} /> : <IdleScreen />}
```

When BigScreen texture is active, the screen mesh already has the canvas texture applied via `mat.map`, so no additional content layer is needed.

- [ ] **Step 5: Add page indicator**

Add a page indicator group when pageInfo exists:
```tsx
{/* Page indicator (Q/E navigation) */}
{pageInfo && pageInfo.total > 1 && (
  <group position={[0, -SCREEN_HEIGHT / 2 - 0.12, 0.005]}>
    <Text
      fontSize={0.04}
      color="#8b949e"
      anchorX="center"
      anchorY="middle"
    >
      {`◀ Q  ${pageInfo.current} / ${pageInfo.total}  E ▶`}
    </Text>
  </group>
)}
```

- [ ] **Step 6: Clear texture when bigScreenEvent becomes null**

Add to the BigScreen useEffect:
```typescript
if (!bigScreenEvent || !canvasRef.current) {
  setHasTexture(false);
  if (screenRef.current) {
    const mat = screenRef.current.material as THREE.MeshStandardMaterial;
    mat.map = null;
    mat.needsUpdate = true;
  }
  return;
}
```

- [ ] **Step 7: Verify types and rendering compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 8: Commit**
```bash
git add frontend/src/components/meeting3d/ArtifactScreen3D.tsx frontend/src/components/meeting3d/BigScreenRenderer.tsx
git commit -m "feat(ui): integrate BigScreen SVG renderer with 3D screen + page indicator"
```

---

## Chunk 3: Sophia FIFO Queue (Backend)

### Task 5: Replace AbortController with FIFO queue in SophiaAgent

**Files:**
- Modify: `backend/src/agents/SophiaAgent.ts`

- [ ] **Step 1: Add queue interface and state**

Add after `VisualArtifact` interface:
```typescript
export interface VisualQueueItem {
  hint: VisualHint;
  output: StructuredAgentOutput;
  addedAt: number;
}
```

Update `SophiaState` interface:
```typescript
export interface SophiaState {
  roomId: string;
  buffer: SophiaBufferEntry[];
  decisions: string[];
  actionItems: ActionItemDraft[];
  visualHistory: VisualArtifact[];
  /** Pending visual generation requests (FIFO) */
  visualQueue: VisualQueueItem[];
  /** Post-meeting artifact requests queued during meeting */
  postMeetingQueue: string[];
}
```

- [ ] **Step 2: Update initRoom to include new fields**

```typescript
initRoom(roomId: string): void {
  this.rooms.set(roomId, {
    roomId,
    buffer: [],
    decisions: [],
    actionItems: [],
    visualHistory: [],
    visualQueue: [],
    postMeetingQueue: [],
  });
}
```

- [ ] **Step 3: Add queue management methods**

```typescript
/** Enqueue a visual generation request */
enqueueVisual(roomId: string, hint: VisualHint, output: StructuredAgentOutput): void {
  const state = this.rooms.get(roomId);
  if (!state) return;
  state.visualQueue.push({ hint, output, addedAt: Date.now() });
}

/** Dequeue next visual request (returns undefined if empty) */
dequeueVisual(roomId: string): VisualQueueItem | undefined {
  const state = this.rooms.get(roomId);
  if (!state) return undefined;
  return state.visualQueue.shift();
}

/** Check if queue is currently being processed */
isProcessingVisual(roomId: string): boolean {
  return this.processingVisual.has(roomId);
}

/** Mark room as processing/not processing */
setProcessingVisual(roomId: string, processing: boolean): void {
  if (processing) {
    this.processingVisual.add(roomId);
  } else {
    this.processingVisual.delete(roomId);
  }
}

/** Add a post-meeting request */
addPostMeetingRequest(roomId: string, request: string): void {
  const state = this.rooms.get(roomId);
  if (state) state.postMeetingQueue.push(request);
}

/** Get and clear post-meeting requests */
drainPostMeetingQueue(roomId: string): string[] {
  const state = this.rooms.get(roomId);
  if (!state) return [];
  const items = [...state.postMeetingQueue];
  state.postMeetingQueue = [];
  return items;
}
```

- [ ] **Step 4: Add processingVisual tracking set**

Add to class:
```typescript
export class SophiaAgent {
  private rooms = new Map<string, SophiaState>();
  private processingVisual = new Set<string>();
  // Remove: private pendingVisualAbort = new Map<string, AbortController>();
```

- [ ] **Step 5: Remove AbortController methods**

Remove these methods entirely:
- `cancelPendingVisual()`
- `setPendingVisualAbort()`
- `clearPendingVisualAbort()`

Update `destroyRoom()`:
```typescript
destroyRoom(roomId: string): void {
  this.processingVisual.delete(roomId);
  this.rooms.delete(roomId);
}
```

- [ ] **Step 6: Verify backend types compile**

Run: `cd backend && npx tsc --noEmit`
Expected: Errors in VoiceLiveOrchestrator (calls removed methods — fixed in next task)

- [ ] **Step 7: Commit**
```bash
git add backend/src/agents/SophiaAgent.ts
git commit -m "feat(agent): replace AbortController with FIFO visual queue in SophiaAgent"
```

---

### Task 6: Update VoiceLiveOrchestrator to use FIFO queue

**Files:**
- Modify: `backend/src/orchestrator/VoiceLiveOrchestrator.ts`

- [ ] **Step 1: Replace fire-and-forget with queue enqueue**

In the `agentDone` handler (line 122-127), replace:
```typescript
// 4. Visual generation (fire-and-forget)
if (sophiaAgent.hasVisualHint(parsed.data)) {
  generateSophiaVisual(roomId, parsed.data.visual_hint!, parsed.data).catch((err) => {
    console.error("[Sophia] Visual generation failed:", err);
  });
}
```
With:
```typescript
// 4. Enqueue visual generation (FIFO queue — sequential processing)
if (sophiaAgent.hasVisualHint(parsed.data)) {
  sophiaAgent.enqueueVisual(roomId, parsed.data.visual_hint!, parsed.data);
  processVisualQueue(roomId);
}
```

- [ ] **Step 2: Add queue processor function**

Replace `generateSophiaVisual` function with:
```typescript
/** Process the visual queue for a room — sequential, one at a time */
function processVisualQueue(roomId: string): void {
  if (sophiaAgent.isProcessingVisual(roomId)) return;

  const item = sophiaAgent.dequeueVisual(roomId);
  if (!item) return;

  sophiaAgent.setProcessingVisual(roomId, true);

  callSophiaVisualGPT(roomId, item.hint, new AbortController().signal)
    .then((renderData) => {
      broadcastEvent(roomId, {
        type: "bigScreenUpdate",
        payload: { visualType: item.hint.type, title: item.hint.title, renderData },
      });
      broadcastEvent(roomId, {
        type: "sophiaMessage",
        payload: { text: `${item.hint.title}를 빅스크린에 띄웠습니다` },
      });
      sophiaAgent.addVisualToHistory(roomId, {
        type: item.hint.type,
        title: item.hint.title,
        renderData,
        timestamp: Date.now(),
        agendaItem: "",
      });
    })
    .catch((err) => {
      console.error("[Sophia] Visual generation failed:", err);
    })
    .finally(() => {
      sophiaAgent.setProcessingVisual(roomId, false);
      // Process next item in queue
      processVisualQueue(roomId);
    });
}
```

- [ ] **Step 3: Remove old generateSophiaVisual function**

Delete the entire `generateSophiaVisual` function (lines 212-248).

- [ ] **Step 4: Update callSophiaVisualGPT — remove signal param**

Since we no longer abort in-progress calls, simplify `callSophiaVisualGPT`:
```typescript
async function callSophiaVisualGPT(
  roomId: string,
  hint: VisualHint,
): Promise<BigScreenRenderData> {
  const recentContext = sophiaAgent.getRecentSpeeches(roomId, 5).join("\n");
  const openai = getOpenAIClient();
  const response = await openai.chat.completions.create({
    model: getModelForTask("visual-gen"),
    temperature: getTemperatureForTask("visual-gen"),
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SOPHIA_VISUAL_SYSTEM_PROMPT },
      {
        role: "user",
        content: `visual_hint: ${JSON.stringify(hint)}\n\n최근 대화:\n${recentContext}\n\ntype="${hint.type}"에 맞는 BigScreenRenderData JSON을 생성하세요.`,
      },
    ],
  });
  const content = response.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content) as Record<string, unknown>;
  if (typeof parsed.type !== "string") {
    parsed.type = hint.type;
  }
  return parsed as unknown as BigScreenRenderData;
}
```

- [ ] **Step 5: Remove unused imports**

Remove `StructuredAgentOutput` from import if no longer used directly.

- [ ] **Step 6: Verify backend compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**
```bash
git add backend/src/orchestrator/VoiceLiveOrchestrator.ts
git commit -m "feat(orchestr): replace fire-and-forget visual gen with FIFO queue processor"
```

---

## Chunk 4: Post-Meeting Queue + Docs Consolidation

### Task 7: Add postMeetingQueue processing to meetingEnd

**Files:**
- Modify: `backend/src/functions/meetingEnd.ts`

- [ ] **Step 1: Process postMeetingQueue after minutes generation**

After `const minutesData = await generateMeetingMinutesGPT(sophiaState);` (line 126), add:
```typescript
// Process any queued post-meeting requests (e.g., "보고서 형태로 작성해줘")
const postMeetingRequests = sophiaAgent.drainPostMeetingQueue(roomId);
// For now, log queued requests — actual document transformation
// will be implemented when Sophia document skills are ready
if (postMeetingRequests.length > 0) {
  context.log(`[Sophia] Post-meeting queue (${postMeetingRequests.length}):`, postMeetingRequests);
}
```

Note: Full document transformation (report, slide deck, business plan) will be implemented in a future task when Sophia's document transformation skills (SOPHIA_PROMPT_RULES.md §6-§9) are coded. This step adds the queue infrastructure.

- [ ] **Step 2: Also drain visual queue on meeting end**

Before `sophiaAgent.destroyRoom(roomId)`:
```typescript
// Drain any remaining visual queue items (meeting ended, no point processing)
while (sophiaAgent.dequeueVisual(roomId)) {
  // discard
}
```

- [ ] **Step 3: Verify backend compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**
```bash
git add backend/src/functions/meetingEnd.ts
git commit -m "feat(orchestr): add postMeetingQueue infrastructure for deferred artifact requests"
```

---

### Task 8: Consolidate C-Suite analysis skills into SOPHIA_PROMPT_RULES.md

**Files:**
- Modify: `docs/SOPHIA_PROMPT_RULES.md`
- Delete: `docs/CSUITE_SKILL_FRAMEWORK.md`

- [ ] **Step 1: Add §11 Analysis Skills Hub to SOPHIA_PROMPT_RULES.md**

Append before the closing pattern summary section (§10):

```markdown
---

## 11. Sophia as Analysis Skill Hub

> 에이전트가 커스텀 가능하므로, 분석 프레임워크는 Sophia에 집중. 어떤 에이전트든 Sophia에게 스킬을 요청할 수 있다.

### 11.1 설계 원칙

| 원칙                    | 설명                                                      |
| ----------------------- | --------------------------------------------------------- |
| 에이전트 독립성         | 기본/커스텀 에이전트 모두 동일한 스킬 세트 접근 가능      |
| 단일 관리 포인트        | 스킬 추가/수정 = Sophia만 업데이트                        |
| 에이전트 토큰 최소화    | 에이전트 프롬프트에는 스킬 목록 1줄만 추가                |
| visual_hint 연결        | 모든 분석 결과는 BigScreen 시각화로 자연스럽게 이어짐     |

### 11.2 에이전트 프롬프트 추가 (공통, ~1줄)

모든 에이전트(기본 + 커스텀)의 common prompt에 다음 1줄을 추가:

```
분석이 필요할 때 visual_hint로 Sophia 스킬을 요청하세요: SWOT, ROI분석, BEP, TAM/SAM/SOM, 우선순위매트릭스, 경쟁포지셔닝, UX휴리스틱, 법적리스크체크
```

### 11.3 분석 스킬 카탈로그

#### AS-1: SWOT 분석
- **트리거**: 실행 전략, 시장 진입, 신규 사업 논의
- **입력**: visual_hint `{type: "comparison", title: "SWOT 분석"}`
- **Sophia 처리**: 대화 맥락에서 강점·약점·기회·위협 4축 추출 → comparison 렌더링
- **출력**: 2×2 comparison 테이블 (columns: ["", "내부", "외부"], rows: [["긍정", S, O], ["부정", W, T]])

#### AS-2: ROI 분석
- **트리거**: 지출 제안, 투자 논의
- **입력**: visual_hint `{type: "bar-chart", title: "ROI 분석"}`
- **Sophia 처리**: 비용·수익·회수기간 추출 → bar-chart 렌더링
- **출력**: bar-chart (항목: 투자비용, 예상수익, 순이익)

#### AS-3: BEP (손익분기점)
- **트리거**: 신규 수익 모델, 가격 설정
- **입력**: visual_hint `{type: "timeline", title: "손익분기점 분석"}`
- **Sophia 처리**: 고정비/(단가-변동비) 계산 → timeline 렌더링
- **출력**: timeline (월별 누적 손익, BEP 시점 "current" 마커)

#### AS-4: TAM/SAM/SOM
- **트리거**: 시장 규모, 타겟 시장 논의
- **입력**: visual_hint `{type: "pie-chart", title: "시장 규모 분석"}`
- **Sophia 처리**: 전체 시장(TAM) → 유효 시장(SAM) → 목표 시장(SOM) 추출 → pie-chart
- **출력**: pie-chart (3개 항목, 중첩 비율)

#### AS-5: 우선순위 매트릭스
- **트리거**: 안건 다수, 우선순위 결정 필요
- **입력**: visual_hint `{type: "comparison", title: "우선순위 매트릭스"}`
- **Sophia 처리**: 중요도×긴급도로 즉시/계획/위임/보류 분류 → comparison
- **출력**: comparison (columns: ["안건", "중요도", "긴급도", "분류"])

#### AS-6: 경쟁사 포지셔닝
- **트리거**: 경쟁 분석, 차별화 전략
- **입력**: visual_hint `{type: "comparison", title: "경쟁사 포지셔닝"}`
- **Sophia 처리**: 경쟁사별 특성 비교 → comparison 렌더링
- **출력**: comparison (columns: ["특성", "우리", "경쟁사A", "경쟁사B"])

#### AS-7: UX 휴리스틱 평가
- **트리거**: UI/UX 검토, 사용성 논의
- **입력**: visual_hint `{type: "checklist", title: "UX 휴리스틱 평가"}`
- **Sophia 처리**: 피드백·오류방지·일관성 3축 평가 → checklist
- **출력**: checklist (항목별 통과/미통과)

#### AS-8: 법적 리스크 체크
- **트리거**: 규제, 개인정보, 법적 검토 논의
- **입력**: visual_hint `{type: "checklist", title: "법적 리스크 체크"}`
- **Sophia 처리**: 주요 법적 리스크 항목 추출 → checklist
- **출력**: checklist (리스크 항목별 대응 여부)

### 11.4 스킬 → 시각화 매핑 요약

| 스킬                 | visual_hint.type | 주 활용 에이전트      |
| -------------------- | ---------------- | --------------------- |
| SWOT                 | comparison       | COO, 전략 논의        |
| ROI 분석             | bar-chart        | CFO, 투자 논의        |
| BEP                  | timeline         | CFO, 수익 모델        |
| TAM/SAM/SOM          | pie-chart        | CMO, 시장 분석        |
| 우선순위 매트릭스    | comparison       | COO, 안건 관리        |
| 경쟁사 포지셔닝      | comparison       | CMO, 차별화           |
| UX 휴리스틱          | checklist        | CDO, 사용성           |
| 법적 리스크          | checklist        | CLO, 규제             |
```

- [ ] **Step 2: Update §10 pattern summary to include analysis skills**

Add analysis skills row to the existing pattern matrix table.

- [ ] **Step 3: Update version and date**

```yaml
---
version: "3.0.0"
updated: "2026-03-12 17:00"
---
```

- [ ] **Step 4: Delete CSUITE_SKILL_FRAMEWORK.md**

```bash
git rm docs/CSUITE_SKILL_FRAMEWORK.md
```

- [ ] **Step 5: Commit**
```bash
git add docs/SOPHIA_PROMPT_RULES.md
git commit -m "feat(agent): consolidate C-Suite analysis skills into Sophia as Analysis Skill Hub"
```

---

## Chunk 5: ESLint + Type Check + Final Verification

### Task 9: Full project lint and type verification

**Files:**
- All modified files

- [ ] **Step 1: Frontend type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 2: Backend type check**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Frontend lint + format**

Run: `cd frontend && npx eslint --fix . && npx prettier --write .`
Expected: PASS or auto-fixed

- [ ] **Step 4: Backend lint + format**

Run: `cd backend && npx eslint --fix . && npx prettier --write .`
Expected: PASS or auto-fixed

- [ ] **Step 5: Fix any lint/type errors found**

If errors exist, fix and re-run.

- [ ] **Step 6: Final commit (if lint fixes)**
```bash
git add -u
git commit -m "style: lint and format fixes for BigScreen pipeline changes"
```

---

## File Change Summary

| File                                          | Action   | Task   |
| --------------------------------------------- | -------- | ------ |
| `frontend/src/App.tsx`                        | Modify   | 1, 3   |
| `frontend/src/context/MeetingContext.tsx`      | Modify   | 2      |
| `frontend/src/components/meeting3d/MeetingRoom3D.tsx` | Modify | 3    |
| `frontend/src/components/meeting3d/ArtifactScreen3D.tsx` | Modify | 4  |
| `frontend/src/components/meeting3d/BigScreenRenderer.tsx` | Modify | 4 |
| `backend/src/agents/SophiaAgent.ts`           | Modify   | 5      |
| `backend/src/orchestrator/VoiceLiveOrchestrator.ts` | Modify | 6    |
| `backend/src/functions/meetingEnd.ts`         | Modify   | 7      |
| `docs/SOPHIA_PROMPT_RULES.md`                 | Modify   | 8      |
| `docs/CSUITE_SKILL_FRAMEWORK.md`             | Delete   | 8      |
