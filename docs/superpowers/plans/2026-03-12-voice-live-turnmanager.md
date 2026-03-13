---
version: "1.1.0"
created: "2026-03-12 23:45"
updated: "2026-03-13 01:00"
---

# Voice Live + TurnManager Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Voice Live API 7-Session 아키텍처 + TurnManager 상태 머신으로 에이전트별 고유 음성, 3D 립싱크, Chairman 사회 권한, DM Stories 피커를 구현한다.

**Architecture:** Backend VoiceLiveSessionManager가 7개 WebSocket 세션을 관리하고, 이벤트 기반 TurnManager 상태 머신이 인간 발화 시점을 판단하여 에이전트 응답을 조율한다. 프론트엔드는 WebSocket 오디오 릴레이 + Web Audio API 재생 + Viseme 립싱크를 제공한다.

**Tech Stack:** Azure Voice Live API (WebSocket), Azure HD Voices, Viseme, Web Audio API, React Three Fiber, SignalR

**Spec:** [`docs/superpowers/specs/2026-03-12-voice-live-turnmanager-design.md`](../specs/2026-03-12-voice-live-turnmanager-design.md)

**References:**
- [ARCHITECTURE.md](../../ARCHITECTURE.md) — Orchestration Layer (§3.3)
- [TECH_SPEC.md](../../TECH_SPEC.md) — Data models, SignalR events
- [PRD.md](../../PRD.md) — DialogLab turn-taking, Push-to-Talk
- [CLAUDE.md](../../../CLAUDE.md) — Commit rules, Implementation workflow

---

## File Structure

### Backend — New & Modified

| Path                                              | Action    | Responsibility                                     |
| ------------------------------------------------- | --------- | -------------------------------------------------- |
| `shared/types.ts`                                 | MODIFY    | Add TurnManagerState, BufferedMessage, AgentTurn    |
| `backend/src/constants/agentVoices.ts`             | CREATE    | Agent → Azure HD Voice mapping                     |
| `backend/src/constants/turnConfig.ts`              | CREATE    | Turn timing constants (flush, gap, max agents)     |
| `backend/src/services/SignalRService.ts`           | MODIFY    | Add generic `broadcastEvent()` for voice events    |
| `backend/src/services/VoiceLiveSessionManager.ts`  | CREATE    | 7-session lifecycle, WebSocket management          |
| `backend/src/orchestrator/TurnManager.ts`          | REWRITE   | Event-driven state machine (replaces processMessage) |
| `backend/src/functions/message.ts`                 | MODIFY    | Route to TurnManager.onChatMessage(), keep SSE path |
| `backend/src/functions/meeting-chairman.ts`        | CREATE    | Chairman control endpoints (AI opinion/pause/next) |
| `backend/src/functions/meeting-voice.ts`           | CREATE    | Audio relay WebSocket endpoint                     |

> **Note:** `InterruptHandler.ts` (urgent risk detection) is deferred to v2. MVP interrupt is handled inline in TurnManager's `onSpeechStart()` during SPEAKING state (Spec §2.4). The v2 risk keyword scanner will be a separate module.

> **Directory creation:** `backend/src/constants/` does not exist yet. Task 1 Step 2 must `mkdir -p` before file creation.

### Frontend — New & Modified

| Path                                               | Action    | Responsibility                                    |
| -------------------------------------------------- | --------- | ------------------------------------------------- |
| `frontend/src/constants/strings.ts`                | MODIFY    | Add chairman/mic/dm string keys                   |
| `frontend/src/constants/agentVoices.ts`             | CREATE    | Agent voice metadata (frontend mirror)            |
| `frontend/src/utils/visemeMap.ts`                   | CREATE    | Viseme ID → BlendShape weight table (22 entries)  |
| `frontend/src/utils/audioUtils.ts`                  | CREATE    | PCM16 encoding, AudioWorklet processor            |
| `frontend/src/hooks/useVoiceLive.ts`                | CREATE    | WebSocket audio streaming + mic toggle            |
| `frontend/src/hooks/useAgentAudio.ts`               | CREATE    | Agent audio playback queue (Web Audio API)        |
| `frontend/src/hooks/useViseme.ts`                   | CREATE    | Viseme events → blend shape weights               |
| `frontend/src/components/input/MicToggle.tsx`       | CREATE    | Mic on/off toggle button                          |
| `frontend/src/components/input/InputArea.tsx`       | MODIFY    | Integrate MicToggle                               |
| `frontend/src/components/meeting/ChairmanControls.tsx` | CREATE | AI opinion/next agenda/pause buttons              |
| `frontend/src/components/meeting/DmStoriesPicker.tsx`  | CREATE | Instagram Stories-style agent picker              |
| `frontend/src/components/meeting/DmAgentPicker.tsx`    | DELETE | Replaced by DmStoriesPicker                       |
| `frontend/src/components/meeting3d/RPMAgentAvatar.tsx` | MODIFY | Add viseme-driven lip sync in useFrame            |
| `frontend/src/App.tsx`                              | MODIFY    | Wire ChairmanControls, useAgentAudio, useViseme   |

> **Directory creation:** `frontend/src/utils/` does not exist yet. Task 8 Step 1 must `mkdir -p` before file creation.

---

## Chunk 1: Backend Foundation

### Task 1: Shared Types & Constants

**Files:**
- Modify: `shared/types.ts`
- Create: `backend/src/constants/agentVoices.ts`
- Create: `backend/src/constants/turnConfig.ts`

- [ ] **Step 1: Add Voice Live types to shared/types.ts**

Add after the existing `ActionItem` interface (line ~75):

```typescript
// ──────────────────────────────────────────────
// Voice Live API Types
// Ref: docs/superpowers/specs/2026-03-12-voice-live-turnmanager-design.md §2.2
// ──────────────────────────────────────────────
export type TurnState = "idle" | "hearing" | "routing" | "speaking";

export interface BufferedMessage {
  userId: string;
  userName: string;
  isChairman: boolean;
  source: "voice" | "chat";
  content: string;
  timestamp: number;
}

export interface AgentTurn {
  role: AgentRole;
  priority: number;
}

/** SignalR voice streaming events — Spec §8.4 */
export interface AgentAudioDeltaEvent {
  role: AgentRole;
  audioBase64: string;
  format: "pcm16_24k";
}

export interface AgentTranscriptDeltaEvent {
  role: AgentRole;
  text: string;
  isFinal: boolean;
}

export interface AgentVisemeDeltaEvent {
  role: AgentRole;
  visemeId: number;
  audioOffsetMs: number;
}

export interface AgentResponseDoneEvent {
  role: AgentRole;
  fullText: string;
}
```

- [ ] **Step 2: Create backend/src/constants/ directory and agent voice configuration**

```bash
mkdir -p backend/src/constants
```

```typescript
// backend/src/constants/agentVoices.ts
// Agent → Azure HD Voice mapping
// Ref: Design Spec §1.1

import type { AgentRole } from "../models/index.js";

export interface AgentVoiceConfig {
  role: AgentRole;
  voiceName: string;       // Azure Voice Live HD voice identifier (DragonHDLatest)
  locale: string;
  temperature: number;
}

/** Voice Live API voice configuration per agent — Spec §1.1 (DragonHDLatest voices) */
export const AGENT_VOICES: Record<AgentRole, AgentVoiceConfig> = {
  coo: { role: "coo", voiceName: "en-US-Guy:DragonHDLatestNeural", locale: "en-US", temperature: 0.8 },
  cfo: { role: "cfo", voiceName: "en-US-Ava:DragonHDLatestNeural", locale: "en-US", temperature: 0.7 },
  cmo: { role: "cmo", voiceName: "en-US-Andrew:DragonHDLatestNeural", locale: "en-US", temperature: 0.9 },
  cto: { role: "cto", voiceName: "en-US-Brian:DragonHDLatestNeural", locale: "en-US", temperature: 0.7 },
  cdo: { role: "cdo", voiceName: "en-US-Emma:DragonHDLatestNeural", locale: "en-US", temperature: 0.9 },
  clo: { role: "clo", voiceName: "en-US-Davis:DragonHDLatestNeural", locale: "en-US", temperature: 0.6 },
};
```

- [ ] **Step 3: Create turn timing constants**

```typescript
// backend/src/constants/turnConfig.ts
// Turn-taking timing constants
// Ref: Design Spec §2.3, §2.5

/** Chairman flush delay — near-instant AI trigger after Chairman speaks */
export const CHAIRMAN_FLUSH_MS = 300;

/** Member flush delay — wait for additional inputs */
export const MEMBER_FLUSH_MS = 2000;

/** Gap between sequential agent responses (DialogLab rule) */
export const INTER_AGENT_GAP_MS = 1500;

/** Maximum agents responding per turn (DialogLab constraint) */
export const MAX_AGENTS_PER_TURN = 2;

/** Maximum A2A follow-up rounds */
export const MAX_FOLLOW_UP_ROUNDS = 2;

/** Immediate flush for Chairman "AI opinion" button */
export const IMMEDIATE_FLUSH_MS = 0;
```

- [ ] **Step 4: Add generic event broadcast to SignalRService**

The current `broadcastToRoom()` only accepts `Message` type. Voice Live needs to broadcast arbitrary event objects (audio delta, viseme, transcript). Add a generic `broadcastEvent()` function.

In `backend/src/services/SignalRService.ts`, add after the existing `broadcastToRoom` function:

```typescript
// Generic event handler for non-Message payloads (voice streaming events)
type EventHandler = (event: { type: string; payload: unknown }) => void;

const eventHandlers: Map<string, Set<EventHandler>> = new Map();

export function onRoomEvent(
  roomId: string,
  handler: EventHandler,
): () => void {
  if (!eventHandlers.has(roomId)) {
    eventHandlers.set(roomId, new Set());
  }
  eventHandlers.get(roomId)!.add(handler);
  return () => {
    eventHandlers.get(roomId)?.delete(handler);
  };
}

/** Broadcast a generic event to room subscribers (voice streaming, typing, etc.) */
export function broadcastEvent(roomId: string, event: { type: string; payload: unknown }): void {
  const roomEventHandlers = eventHandlers.get(roomId);
  if (roomEventHandlers) {
    for (const handler of roomEventHandlers) {
      handler(event);
    }
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add shared/types.ts backend/src/constants/agentVoices.ts backend/src/constants/turnConfig.ts backend/src/services/SignalRService.ts
git commit -m "$(cat <<'EOF'
feat(orchestr): add Voice Live types, constants, and generic event broadcast

- BufferedMessage, AgentTurn, TurnState types for state machine
- SignalR voice streaming event interfaces (audio/transcript/viseme)
- Agent → Azure HD Voice mapping (DragonHDLatest voices)
- Turn timing constants (flush delays, agent gaps, limits)
- SignalRService: add broadcastEvent() for non-Message payloads

Ref: design spec §1.1, §2.2, §8.4

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: TurnManager State Machine (Rewrite)

**Files:**
- Rewrite: `backend/src/orchestrator/TurnManager.ts`
- Reuse (no change): `backend/src/orchestrator/TopicClassifier.ts`
- Reuse (no change): `backend/src/orchestrator/ContextBroker.ts`

> **CRITICAL:** This is a complete rewrite. The current synchronous `processMessage()` is replaced by an event-driven state machine. Read current file first: `backend/src/orchestrator/TurnManager.ts`. Preserve `determineAgentOrder()` and `checkFollowUp()` logic.

- [ ] **Step 1: Write the new TurnManager**

The new TurnManager is an EventEmitter-based state machine per Spec §2. It must:
- Maintain per-room state (`TurnManagerState`)
- Handle events: `onSpeechStart`, `onSpeechEnd`, `onTranscript`, `onChatMessage`
- Implement flush timer with Chairman (300ms) / Member (2000ms) differentiation
- Execute agent routing via existing `TopicClassifier.classifyTopic()` + `TopicClassifier.parseMentions()`
- Emit events for agent triggering (consumed by `VoiceLiveSessionManager`)
- Support interrupt handling (voice interrupts SPEAKING, chat does not)
- Support AI pause toggle (Chairman control)

```typescript
// backend/src/orchestrator/TurnManager.ts
// Event-driven state machine for turn-taking
// Ref: Design Spec §2

import { EventEmitter } from "events";
import type { AgentRole, BufferedMessage, AgentTurn, TurnState, Message } from "../models/index.js";
import { classifyTopic, parseMentions } from "./TopicClassifier.js";
import { getContextForAgent, addMessage, getOrCreateRoom } from "./ContextBroker.js";
import {
  CHAIRMAN_FLUSH_MS,
  MEMBER_FLUSH_MS,
  INTER_AGENT_GAP_MS,
  MAX_AGENTS_PER_TURN,
  MAX_FOLLOW_UP_ROUNDS,
} from "../constants/turnConfig.js";
import { v4 as uuidv4 } from "uuid";

interface RoomTurnState {
  state: TurnState;
  inputBuffer: BufferedMessage[];
  flushTimer: ReturnType<typeof setTimeout> | null;
  agentQueue: AgentTurn[];
  activeAgent: AgentRole | null;
  interruptFlag: boolean;
  aiPaused: boolean;
  combinedInput: string;           // cached for triggerNextAgent
  chairmanUserId: string | null;   // MVP: single mic = chairman
}

// Preserved from original TurnManager — DialogLab priority queue
type Priority = 0 | 1 | 2 | 3 | 4;

interface TurnEntry {
  role: AgentRole;
  priority: Priority;
}

/**
 * Event-driven TurnManager — the intelligent orchestrator.
 *
 * Events emitted:
 *  - "triggerAgent"  (roomId, role, instructions) — VoiceLiveSessionManager should send response.create
 *  - "cancelAgent"   (roomId, role) — cancel current agent response
 *  - "stateChanged"  (roomId, state) — for debugging / UI feedback
 *  - "agentsDone"    (roomId) — all agents finished, back to IDLE
 */
export class TurnManager extends EventEmitter {
  private rooms = new Map<string, RoomTurnState>();

  private getRoom(roomId: string): RoomTurnState {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        state: "idle",
        inputBuffer: [],
        flushTimer: null,
        agentQueue: [],
        activeAgent: null,
        interruptFlag: false,
        aiPaused: false,
        combinedInput: "",
        chairmanUserId: null,
      });
    }
    return this.rooms.get(roomId)!;
  }

  /** Set the chairman userId for a room (call on room creation) */
  setChairman(roomId: string, userId: string): void {
    const room = this.getRoom(roomId);
    room.chairmanUserId = userId;
  }

  /** Toggle AI pause — Spec §2.5 */
  setAiPaused(roomId: string, paused: boolean): void {
    const room = this.getRoom(roomId);
    room.aiPaused = paused;
    if (paused && room.state === "speaking") {
      // Cancel current agent and clear queue
      if (room.activeAgent) {
        this.emit("cancelAgent", roomId, room.activeAgent);
      }
      room.agentQueue = [];
      room.activeAgent = null;
      this.transition(roomId, "idle");
    }
  }

  // ── Event Handlers (Spec §2.3) ──

  /** Human started speaking via voice — Spec §2.3 onSpeechStart */
  onSpeechStart(roomId: string, userId: string): void {
    const room = this.getRoom(roomId);

    if (room.state === "idle") {
      this.transition(roomId, "hearing");
      this.clearFlushTimer(room);
    } else if (room.state === "hearing") {
      this.clearFlushTimer(room);
    } else if (room.state === "speaking") {
      // Voice interrupt — Spec §2.4
      room.interruptFlag = true;
      if (room.activeAgent) {
        this.emit("cancelAgent", roomId, room.activeAgent);
      }
      room.agentQueue = [];
      room.inputBuffer = [];
      room.activeAgent = null;
      this.transition(roomId, "hearing");
    }
  }

  /** Human stopped speaking via voice — Spec §2.3 onSpeechEnd */
  onSpeechEnd(roomId: string, userId: string): void {
    const room = this.getRoom(roomId);
    if (room.state !== "hearing") return;

    const isChairman = userId === room.chairmanUserId;
    const delay = isChairman ? CHAIRMAN_FLUSH_MS : MEMBER_FLUSH_MS;
    this.startFlushTimer(roomId, room, delay);
  }

  /** Voice transcription completed — Spec §2.3 onTranscript */
  onTranscript(roomId: string, userId: string, userName: string, text: string): void {
    const room = this.getRoom(roomId);
    if (room.state !== "hearing") return;

    const isChairman = userId === room.chairmanUserId;
    room.inputBuffer.push({
      userId,
      userName,
      isChairman,
      source: "voice",
      content: text,
      timestamp: Date.now(),
    });

    // Start flush timer if not already running
    if (!room.flushTimer) {
      const delay = isChairman ? CHAIRMAN_FLUSH_MS : MEMBER_FLUSH_MS;
      this.startFlushTimer(roomId, room, delay);
    }
  }

  /** Chat message received — Spec §2.3 onChatMessage */
  onChatMessage(roomId: string, userId: string, userName: string, text: string, isChairman: boolean): void {
    const room = this.getRoom(roomId);

    if (room.aiPaused) return; // AI paused, ignore

    if (room.state === "idle") {
      this.transition(roomId, "hearing");
    }

    if (room.state === "hearing") {
      room.inputBuffer.push({
        userId,
        userName,
        isChairman,
        source: "chat",
        content: text,
        timestamp: Date.now(),
      });
      const delay = isChairman ? CHAIRMAN_FLUSH_MS : MEMBER_FLUSH_MS;
      this.startFlushTimer(roomId, room, delay);
    } else if (room.state === "speaking") {
      // Chat during speaking — queue for next turn, do NOT interrupt
      room.inputBuffer.push({
        userId,
        userName,
        isChairman,
        source: "chat",
        content: text,
        timestamp: Date.now(),
      });
    }
  }

  /** Chairman requests immediate AI opinion — Spec §2.5 */
  requestAiOpinion(roomId: string): void {
    const room = this.getRoom(roomId);
    if (room.aiPaused) return;

    if (room.state === "idle" || room.state === "hearing") {
      this.transition(roomId, "hearing");
      // Immediate flush with 0ms delay
      this.clearFlushTimer(room);
      this.onFlush(roomId);
    }
  }

  /** Agent finished responding — Spec §2.3 onAgentDone */
  onAgentDone(roomId: string, agentRole: AgentRole, fullText: string): void {
    const room = this.getRoom(roomId);
    if (room.state !== "speaking") return;

    // Save agent response to ContextBroker
    const agentMessage: Message = {
      id: uuidv4(),
      roomId,
      senderId: `agent-${agentRole}`,
      senderType: "agent",
      senderName: agentRole, // Will be enriched by caller
      senderRole: agentRole,
      content: fullText,
      timestamp: new Date().toISOString(),
    };
    addMessage(roomId, agentMessage);

    // A2A follow-up check (preserved from original TurnManager)
    // C2 fix: deduplicate — don't queue an agent that's already in the queue
    const followUpRole = checkFollowUp({ role: agentRole, content: fullText });
    if (
      followUpRole &&
      room.agentQueue.length < MAX_AGENTS_PER_TURN &&
      !room.agentQueue.some((q) => q.role === followUpRole)
    ) {
      room.agentQueue.push({ role: followUpRole, priority: 3 });
    }

    // Next agent or back to IDLE
    if (room.agentQueue.length > 0) {
      setTimeout(() => this.triggerNextAgent(roomId), INTER_AGENT_GAP_MS);
    } else {
      room.activeAgent = null;
      this.transition(roomId, "idle");
      this.emit("agentsDone", roomId);
    }
  }

  /** Clean up room state */
  destroyRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      this.clearFlushTimer(room);
      this.rooms.delete(roomId);
    }
  }

  // ── Private Methods ──

  private onFlush(roomId: string): void {
    const room = this.getRoom(roomId);
    this.transition(roomId, "routing");

    // 1. Merge buffered messages
    room.combinedInput = room.inputBuffer
      .map((m) => `[${m.userName}]: ${m.content}`)
      .join("\n");

    // If buffer is empty (e.g., AI opinion with no new input), use last context
    if (!room.combinedInput.trim()) {
      room.combinedInput = "[Chairman requested AI opinion on current topic]";
    }

    // 2. Save to ContextBroker FIRST (Spec §2.3 step 3, fix for race condition)
    for (const msg of room.inputBuffer) {
      const message: Message = {
        id: uuidv4(),
        roomId,
        senderId: msg.userId,
        senderType: "human",
        senderName: msg.userName,
        senderRole: msg.isChairman ? "chairman" : "member",
        content: msg.content,
        timestamp: new Date(msg.timestamp).toISOString(),
        isVoiceInput: msg.source === "voice",
      };
      addMessage(roomId, message);
    }

    // 3. Determine agents via TopicClassifier
    const mentions = parseMentions(room.combinedInput);
    const { primaryAgent, secondaryAgents } = classifyTopic(room.combinedInput);
    room.agentQueue = determineAgentOrder(room.combinedInput, mentions, primaryAgent, secondaryAgents)
      .slice(0, MAX_AGENTS_PER_TURN);

    // 4. Clear buffer
    room.inputBuffer = [];
    room.interruptFlag = false;

    // 5. Trigger first agent
    if (room.agentQueue.length > 0) {
      this.transition(roomId, "speaking");
      this.triggerNextAgent(roomId);
    } else {
      this.transition(roomId, "idle");
    }
  }

  private triggerNextAgent(roomId: string): void {
    const room = this.getRoom(roomId);
    if (room.agentQueue.length === 0) {
      room.activeAgent = null;
      this.transition(roomId, "idle");
      this.emit("agentsDone", roomId);
      return;
    }

    const next = room.agentQueue.shift()!;
    room.activeAgent = next.role;

    const contextStr = getContextForAgent(roomId, next.role);
    const roomData = getOrCreateRoom(roomId);

    // Build instructions for Voice Live response.create
    const instructions = buildAgentPrompt(next.role, contextStr, room.combinedInput, roomData.agenda || "");

    this.emit("triggerAgent", roomId, next.role, instructions);
  }

  private transition(roomId: string, newState: TurnState): void {
    const room = this.getRoom(roomId);
    room.state = newState;
    this.emit("stateChanged", roomId, newState);
  }

  private startFlushTimer(roomId: string, room: RoomTurnState, delayMs: number): void {
    this.clearFlushTimer(room);
    room.flushTimer = setTimeout(() => {
      room.flushTimer = null;
      this.onFlush(roomId);
    }, delayMs);
  }

  private clearFlushTimer(room: RoomTurnState): void {
    if (room.flushTimer) {
      clearTimeout(room.flushTimer);
      room.flushTimer = null;
    }
  }
}

// ── Preserved logic from original TurnManager ──

/** Agent response order — DialogLab priority queue (from original TurnManager) */
export function determineAgentOrder(
  _message: string,
  mentions: AgentRole[],
  primaryAgent: AgentRole,
  secondaryAgents: AgentRole[],
): AgentTurn[] {
  const entries: AgentTurn[] = [];
  const added = new Set<AgentRole>();

  // P1: COO always responds (meeting orchestrator)
  if (!mentions.length || mentions.includes("coo")) {
    entries.push({ role: "coo", priority: 1 });
    added.add("coo");
  }

  // P2: Mentioned agents
  for (const role of mentions) {
    if (!added.has(role)) {
      entries.push({ role, priority: 2 });
      added.add(role);
    }
  }

  // P3: Primary agent from topic classification
  if (!added.has(primaryAgent)) {
    entries.push({ role: primaryAgent, priority: 3 });
    added.add(primaryAgent);
  }

  // P3: Secondary agents
  for (const role of secondaryAgents) {
    if (!added.has(role)) {
      entries.push({ role, priority: 3 });
      added.add(role);
    }
  }

  return entries.sort((a, b) => a.priority - b.priority);
}

/** A2A follow-up check — preserved from original TurnManager */
function checkFollowUp(response: { role: AgentRole; content: string }): AgentRole | null {
  const content = response.content.toLowerCase();

  if (response.role !== "cfo" && /예산|비용|투자|만원|억원|roi/i.test(content)) return "cfo";
  if (response.role !== "cmo" && /마케팅|캠페인|고객|브랜드|시장점유/i.test(content)) return "cmo";
  if (response.role !== "cto" && /서버|아키텍처|api|개발|인프라|기술 부채/i.test(content)) return "cto";
  if (response.role !== "clo" && /계약|법적|규제|개인정보|라이선스/i.test(content)) return "clo";
  if (response.role !== "cdo" && /디자인|ux|사용성|접근성/i.test(content)) return "cdo";

  return null;
}

/** Build prompt for Voice Live response.create — combines persona + context + input */
function buildAgentPrompt(role: AgentRole, contextStr: string, humanInput: string, agenda: string): string {
  return [
    `You are the ${role.toUpperCase()} agent in a BizRoom meeting.`,
    `Current agenda: ${agenda || "General discussion"}`,
    "",
    "Recent conversation context:",
    contextStr,
    "",
    "Human input to respond to:",
    humanInput,
    "",
    "Respond concisely (max 200 tokens). Focus on your domain expertise.",
  ].join("\n");
}

// Singleton instance
export const turnManager = new TurnManager();
```

- [ ] **Step 2: Verify TurnManager compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: No errors related to TurnManager.ts

- [ ] **Step 3: Commit**

```bash
git add backend/src/orchestrator/TurnManager.ts
git commit -m "$(cat <<'EOF'
feat(orchestr): rewrite TurnManager as event-driven state machine

- Replace synchronous processMessage() with event handlers
- State machine: IDLE → HEARING → ROUTING → SPEAKING → IDLE
- Chairman priority flush (300ms) vs Member (2000ms)
- Voice interrupt handling (cancel agent, clear queue)
- AI pause toggle support
- Preserve determineAgentOrder() and checkFollowUp() logic
- Singleton turnManager instance for global access

Ref: design spec §2, ARCHITECTURE.md §3.3

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: VoiceLiveSessionManager

**Files:**
- Create: `backend/src/services/VoiceLiveSessionManager.ts`

> **Important:** This manages 7 WebSocket connections to Azure Voice Live API. Read Spec §7 carefully. MVP uses lazy initialization (Listener immediately, agents on-demand per Spec reviewer suggestion S1).

- [ ] **Step 1: Implement VoiceLiveSessionManager**

```typescript
// backend/src/services/VoiceLiveSessionManager.ts
// 7-session lifecycle manager for Voice Live API
// Ref: Design Spec §7

import { EventEmitter } from "events";
import WebSocket from "ws";
import type { AgentRole } from "../models/index.js";
import { AGENT_VOICES } from "../constants/agentVoices.js";

const VOICE_LIVE_ENDPOINT = process.env.AZURE_VOICE_LIVE_ENDPOINT || "";
const VOICE_LIVE_KEY = process.env.AZURE_VOICE_LIVE_KEY || "";
const HEARTBEAT_INTERVAL_MS = 30_000;
const RECONNECT_DELAYS = [1000, 2000, 4000]; // exponential backoff

interface RoomSessions {
  listener: WebSocket | null;
  agents: Map<AgentRole, WebSocket>;
  heartbeats: Map<string, ReturnType<typeof setInterval>>;
}

/**
 * Manages Voice Live WebSocket sessions per room.
 *
 * Events emitted:
 *  - "speechStarted"  (roomId, userId)
 *  - "speechStopped"  (roomId, userId)
 *  - "transcript"     (roomId, userId, text)
 *  - "agentAudioDelta"  (roomId, role, audioBase64)
 *  - "agentTextDelta"   (roomId, role, text)
 *  - "agentVisemeDelta" (roomId, role, visemeId, audioOffsetMs)
 *  - "agentDone"        (roomId, role, fullText)
 */
export class VoiceLiveSessionManager extends EventEmitter {
  private rooms = new Map<string, RoomSessions>();

  /** Initialize room — opens Listener session immediately, agents lazily */
  async initializeRoom(roomId: string, chairmanUserId: string): Promise<void> {
    if (this.rooms.has(roomId)) return;

    const sessions: RoomSessions = {
      listener: null,
      agents: new Map(),
      heartbeats: new Map(),
    };
    this.rooms.set(roomId, sessions);

    // Open Listener session immediately (critical path)
    if (VOICE_LIVE_ENDPOINT) {
      try {
        sessions.listener = await this.createListenerSession(roomId, chairmanUserId);
      } catch (err) {
        console.error(`[VoiceLive] Failed to create Listener session for room ${roomId}:`, err);
        // Degrade to text-only mode
      }
    }
  }

  /** Tear down all sessions for a room */
  async teardownRoom(roomId: string): Promise<void> {
    const sessions = this.rooms.get(roomId);
    if (!sessions) return;

    // Clear heartbeats
    for (const interval of sessions.heartbeats.values()) {
      clearInterval(interval);
    }

    // Close all WebSockets
    sessions.listener?.close();
    for (const ws of sessions.agents.values()) {
      ws.close();
    }

    this.rooms.delete(roomId);
  }

  /** Relay audio from client to Listener session — Spec §7.3 */
  relayAudio(roomId: string, audioBase64: string): void {
    const sessions = this.rooms.get(roomId);
    if (!sessions?.listener || sessions.listener.readyState !== WebSocket.OPEN) return;

    sessions.listener.send(JSON.stringify({
      type: "input_audio_buffer.append",
      audio: audioBase64,
    }));
  }

  /** Trigger agent response — Spec §1.3 */
  async triggerAgentResponse(roomId: string, role: AgentRole, instructions: string): Promise<void> {
    const sessions = this.rooms.get(roomId);
    if (!sessions) return;

    // Lazy agent session creation
    let ws = sessions.agents.get(role);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      try {
        ws = await this.createAgentSession(roomId, role);
        sessions.agents.set(role, ws);
      } catch (err) {
        console.error(`[VoiceLive] Failed to create agent session ${role}:`, err);
        return; // Degrade: skip this agent's voice response
      }
    }

    // Send response.create with conversation: "none" — Spec §1.3
    ws.send(JSON.stringify({
      type: "response.create",
      response: {
        conversation: "none",
        modalities: ["audio", "text"],
        instructions,
      },
    }));
  }

  /** Cancel current agent response */
  cancelAgentResponse(roomId: string, role: AgentRole): void {
    const sessions = this.rooms.get(roomId);
    const ws = sessions?.agents.get(role);
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({ type: "response.cancel" }));
  }

  // ── Private: Session Creation ──

  private async createListenerSession(roomId: string, chairmanUserId: string): Promise<WebSocket> {
    const ws = new WebSocket(VOICE_LIVE_ENDPOINT, {
      headers: { "api-key": VOICE_LIVE_KEY },
    });

    return new Promise((resolve, reject) => {
      ws.on("open", () => {
        // Send session.update — Spec §1.2
        ws.send(JSON.stringify({
          type: "session.update",
          session: {
            turn_detection: {
              type: "azure_semantic_vad",
              silence_duration_ms: 500,
              remove_filler_words: true,
              languages: ["ko", "en"],
              create_response: false,
            },
            input_audio_noise_reduction: { type: "azure_deep_noise_suppression" },
            input_audio_echo_cancellation: { type: "server_echo_cancellation" },
            input_audio_transcription: { model: "azure-speech", language: "ko" },
            modalities: ["text"],
          },
        }));
        this.setupHeartbeat(roomId, "listener", ws);
        resolve(ws);
      });

      ws.on("message", (data) => {
        try {
          const event = JSON.parse(data.toString());
          this.handleListenerEvent(roomId, chairmanUserId, event);
        } catch { /* ignore parse errors */ }
      });

      ws.on("error", (err) => reject(err));
      ws.on("close", () => this.handleSessionClose(roomId, "listener"));
    });
  }

  private async createAgentSession(roomId: string, role: AgentRole): Promise<WebSocket> {
    const voiceConfig = AGENT_VOICES[role];
    const ws = new WebSocket(VOICE_LIVE_ENDPOINT, {
      headers: { "api-key": VOICE_LIVE_KEY },
    });

    return new Promise((resolve, reject) => {
      ws.on("open", () => {
        // Send session.update — Spec §1.3
        ws.send(JSON.stringify({
          type: "session.update",
          session: {
            instructions: `You are the ${role.toUpperCase()} agent.`,
            turn_detection: { type: "none" },
            voice: {
              name: voiceConfig.voiceName,
              type: "azure-standard",
              temperature: voiceConfig.temperature,
            },
            modalities: ["audio", "text"],
            output_audio_timestamp_types: ["word"],
            animation: { outputs: ["viseme_id"] },
          },
        }));
        this.setupHeartbeat(roomId, role, ws);
        resolve(ws);
      });

      ws.on("message", (data) => {
        try {
          const event = JSON.parse(data.toString());
          this.handleAgentEvent(roomId, role, event);
        } catch { /* ignore parse errors */ }
      });

      ws.on("error", (err) => reject(err));
      ws.on("close", () => this.handleSessionClose(roomId, role));
    });
  }

  // ── Private: Event Handlers ──

  private handleListenerEvent(roomId: string, chairmanUserId: string, event: Record<string, unknown>): void {
    switch (event.type) {
      case "input_audio_buffer.speech_started":
        this.emit("speechStarted", roomId, chairmanUserId);
        break;
      case "input_audio_buffer.speech_stopped":
        this.emit("speechStopped", roomId, chairmanUserId);
        break;
      case "conversation.item.input_audio_transcription.completed":
        this.emit("transcript", roomId, chairmanUserId, (event as Record<string, unknown>).transcript || "");
        break;
    }
  }

  private handleAgentEvent(roomId: string, role: AgentRole, event: Record<string, unknown>): void {
    switch (event.type) {
      case "response.audio.delta": {
        const delta = event.delta as string;
        if (delta) this.emit("agentAudioDelta", roomId, role, delta);
        break;
      }
      case "response.audio_transcript.delta": {
        const delta = event.delta as string;
        if (delta) this.emit("agentTextDelta", roomId, role, delta);
        break;
      }
      case "response.animation_viseme.delta": {
        const visemeId = event.viseme_id as number;
        const offsetMs = event.audio_offset_ms as number;
        this.emit("agentVisemeDelta", roomId, role, visemeId, offsetMs ?? 0);
        break;
      }
      case "response.done": {
        // Extract full text from response
        const output = event.response as Record<string, unknown>;
        let fullText = "";
        if (output?.output && Array.isArray(output.output)) {
          for (const item of output.output) {
            if (item.type === "message" && item.content) {
              for (const c of item.content) {
                if (c.type === "text") fullText += c.text || "";
                if (c.transcript) fullText += c.transcript;
              }
            }
          }
        }
        this.emit("agentDone", roomId, role, fullText);
        break;
      }
    }
  }

  private setupHeartbeat(roomId: string, sessionKey: string, ws: WebSocket): void {
    const sessions = this.rooms.get(roomId);
    if (!sessions) return;

    const interval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, HEARTBEAT_INTERVAL_MS);

    sessions.heartbeats.set(sessionKey, interval);
  }

  private handleSessionClose(roomId: string, sessionKey: string): void {
    const sessions = this.rooms.get(roomId);
    if (!sessions) return;

    const heartbeat = sessions.heartbeats.get(sessionKey);
    if (heartbeat) {
      clearInterval(heartbeat);
      sessions.heartbeats.delete(sessionKey);
    }

    // TODO: Reconnection with exponential backoff (Spec §7.4)
    console.warn(`[VoiceLive] Session ${sessionKey} closed for room ${roomId}`);
  }
}

// Singleton instance
export const voiceLiveManager = new VoiceLiveSessionManager();
```

- [ ] **Step 2: Add `ws` dependency**

Run: `cd backend && npm install ws && npm install -D @types/ws`

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/VoiceLiveSessionManager.ts backend/package.json backend/package-lock.json
git commit -m "$(cat <<'EOF'
feat(orchestr): add VoiceLiveSessionManager for 7-session architecture

- Manages Listener (#0) + 6 Agent WebSocket sessions per room
- Lazy agent session creation (open on first triggerAgent call)
- Audio relay from client to Listener via input_audio_buffer.append
- Handles Voice Live events: speech detection, transcription, audio/viseme
- Heartbeat ping every 30s for connection health
- Graceful degradation to text-only on session failure

Ref: design spec §7, §1.2, §1.3

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Wire TurnManager ↔ VoiceLiveSessionManager + Update message.ts

**Files:**
- Create: `backend/src/orchestrator/VoiceLiveOrchestrator.ts`
- Modify: `backend/src/functions/message.ts`

- [ ] **Step 1: Create orchestrator wiring**

This module wires TurnManager events to VoiceLiveSessionManager and vice versa.

```typescript
// backend/src/orchestrator/VoiceLiveOrchestrator.ts
// Wires TurnManager ↔ VoiceLiveSessionManager ↔ SignalR
// Ref: Design Spec §2, §7

import { turnManager } from "./TurnManager.js";
import { voiceLiveManager } from "../services/VoiceLiveSessionManager.js";
import { broadcastEvent } from "../services/SignalRService.js";
import type { AgentRole } from "../models/index.js";

// Track per-room event listeners for cleanup (fix I5: event listener leak)
const roomListeners = new Map<string, Array<{ emitter: NodeJS.EventEmitter; event: string; fn: (...args: unknown[]) => void }>>();

function addRoomListener(
  roomId: string,
  emitter: NodeJS.EventEmitter,
  event: string,
  fn: (...args: unknown[]) => void,
): void {
  if (!roomListeners.has(roomId)) roomListeners.set(roomId, []);
  roomListeners.get(roomId)!.push({ emitter, event, fn });
  emitter.on(event, fn);
}

/**
 * Initialize bidirectional event wiring for a room.
 * Call once per room at meeting start.
 */
export function wireVoiceLiveForRoom(roomId: string, chairmanUserId: string, chairmanName: string): void {
  // Set chairman in TurnManager
  turnManager.setChairman(roomId, chairmanUserId);

  // VoiceLive → TurnManager: speech events
  addRoomListener(roomId, voiceLiveManager, "speechStarted", (rid: string, userId: string) => {
    if (rid === roomId) turnManager.onSpeechStart(rid, userId);
  });

  addRoomListener(roomId, voiceLiveManager, "speechStopped", (rid: string, userId: string) => {
    if (rid === roomId) turnManager.onSpeechEnd(rid, userId);
  });

  // Fix I7: use chairmanName param instead of hardcoded "Chairman"
  addRoomListener(roomId, voiceLiveManager, "transcript", (rid: string, userId: string, text: string) => {
    if (rid === roomId) turnManager.onTranscript(rid, userId, chairmanName, text);
  });

  // VoiceLive → SignalR: agent streaming events (fix C1: use broadcastEvent, not broadcastToRoom)
  addRoomListener(roomId, voiceLiveManager, "agentAudioDelta", (rid: string, role: AgentRole, audioBase64: string) => {
    if (rid === roomId) {
      broadcastEvent(rid, {
        type: "agentAudioDelta",
        payload: { role, audioBase64, format: "pcm16_24k" },
      });
    }
  });

  addRoomListener(roomId, voiceLiveManager, "agentTextDelta", (rid: string, role: AgentRole, text: string) => {
    if (rid === roomId) {
      broadcastEvent(rid, {
        type: "agentTranscriptDelta",
        payload: { role, text, isFinal: false },
      });
    }
  });

  addRoomListener(roomId, voiceLiveManager, "agentVisemeDelta", (rid: string, role: AgentRole, visemeId: number, audioOffsetMs: number) => {
    if (rid === roomId) {
      broadcastEvent(rid, {
        type: "agentVisemeDelta",
        payload: { role, visemeId, audioOffsetMs },
      });
    }
  });

  addRoomListener(roomId, voiceLiveManager, "agentDone", (rid: string, role: AgentRole, fullText: string) => {
    if (rid === roomId) {
      broadcastEvent(rid, {
        type: "agentResponseDone",
        payload: { role, fullText },
      });
      // Notify TurnManager
      turnManager.onAgentDone(rid, role, fullText);
    }
  });

  // TurnManager → VoiceLive: trigger/cancel agents
  addRoomListener(roomId, turnManager, "triggerAgent", (rid: string, role: AgentRole, instructions: string) => {
    if (rid === roomId) {
      voiceLiveManager.triggerAgentResponse(rid, role, instructions);
      broadcastEvent(rid, {
        type: "agentTyping",
        payload: { agentId: `agent-${role}`, agentName: role, isTyping: true },
      });
    }
  });

  addRoomListener(roomId, turnManager, "cancelAgent", (rid: string, role: AgentRole) => {
    if (rid === roomId) {
      voiceLiveManager.cancelAgentResponse(rid, role);
      broadcastEvent(rid, {
        type: "agentTyping",
        payload: { agentId: `agent-${role}`, agentName: role, isTyping: false },
      });
    }
  });
}

/** Clean up room event wiring — removes all listeners to prevent leaks (fix I5) */
export function unwireVoiceLiveForRoom(roomId: string): void {
  const listeners = roomListeners.get(roomId);
  if (listeners) {
    for (const { emitter, event, fn } of listeners) {
      emitter.removeListener(event, fn);
    }
    roomListeners.delete(roomId);
  }
  turnManager.destroyRoom(roomId);
  voiceLiveManager.teardownRoom(roomId);
}
```

- [ ] **Step 2: Update message.ts — preserve SSE path, add Voice Live path**

> **CRITICAL (C7):** The current `message.ts` imports `processMessage` and `determineAgentOrder` from the OLD TurnManager. After the TurnManager rewrite, `processMessage` no longer exists as an export. The SSE streaming path must still work using the preserved `determineAgentOrder` function (which IS still exported from the rewritten TurnManager). Additionally, a new Voice Live path routes through `turnManager.onChatMessage()`.

Apply these changes to `backend/src/functions/message.ts`:

**Change 1:** Update imports — replace old `processMessage` with new `turnManager` instance + keep `determineAgentOrder`:
```typescript
// OLD:
// import { processMessage, determineAgentOrder } from "../orchestrator/TurnManager.js";

// NEW:
import { turnManager, determineAgentOrder } from "../orchestrator/TurnManager.js";
```

**Change 2:** Replace the non-streaming `processMessage()` call (lines 72-81) with TurnManager routing:
```typescript
  if (!isStream) {
    // Voice Live mode: route to TurnManager state machine
    // TurnManager handles timing, buffering, and triggers agents via events
    const isChairman = body.senderId === "chairman" || !body.senderId;
    turnManager.onChatMessage(
      roomId,
      userMessage.senderId,
      userMessage.senderName,
      userMessage.content,
      isChairman,
    );
    // Return 202 Accepted — agent responses arrive via SignalR events, not HTTP response
    return { status: 202, jsonBody: { accepted: true, mode: "voiceLive" } };
  }
```

**Change 3:** The SSE streaming path (lines 83-161) remains unchanged — it still uses `determineAgentOrder()` (which is still exported from the rewritten TurnManager) and `invokeAgentStream()` for direct text-only streaming. This preserves backward compatibility for text-only mode.

- [ ] **Step 3: Commit**

```bash
git add backend/src/orchestrator/VoiceLiveOrchestrator.ts backend/src/functions/message.ts
git commit -m "$(cat <<'EOF'
feat(orchestr): wire TurnManager ↔ VoiceLiveSessionManager ↔ SignalR

- Bidirectional event wiring: speech events → TurnManager, agent events → SignalR
- TurnManager triggerAgent/cancelAgent → VoiceLiveSessionManager
- Agent streaming data (audio/transcript/viseme) broadcast via broadcastEvent()
- Per-room listener tracking with cleanup to prevent event listener leaks
- message.ts: route non-streaming to TurnManager.onChatMessage(), preserve SSE path

Ref: design spec §2, §7, §8.4

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Chairman Control Endpoints

**Files:**
- Create: `backend/src/functions/meeting-chairman.ts`

- [ ] **Step 1: Implement Chairman API endpoints — Spec §4.2**

```typescript
// backend/src/functions/meeting-chairman.ts
// Chairman control endpoints
// Ref: Design Spec §4.2

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { turnManager } from "../orchestrator/TurnManager.js";
import { setPhase, setAgenda } from "../orchestrator/ContextBroker.js";
import { broadcastEvent } from "../services/SignalRService.js";

/** POST /api/meeting/request-ai-opinion — immediate AI trigger */
async function requestAiOpinion(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const { roomId } = (await request.json()) as { roomId: string };
  if (!roomId) return { status: 400, jsonBody: { error: "roomId required" } };

  turnManager.requestAiOpinion(roomId);
  return { status: 200, jsonBody: { success: true } };
}

/** POST /api/meeting/next-agenda — phase transition + agenda change */
async function nextAgenda(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const { roomId, agenda } = (await request.json()) as { roomId: string; agenda: string };
  if (!roomId) return { status: 400, jsonBody: { error: "roomId required" } };

  setAgenda(roomId, agenda || "");
  broadcastEvent(roomId, {
    type: "phaseChanged",
    payload: { phase: "discussion", agendaItem: agenda },
  });
  return { status: 200, jsonBody: { success: true } };
}

/** POST /api/meeting/toggle-ai-pause — pause/resume AI responses */
async function toggleAiPause(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const { roomId, paused } = (await request.json()) as { roomId: string; paused: boolean };
  if (!roomId) return { status: 400, jsonBody: { error: "roomId required" } };

  turnManager.setAiPaused(roomId, paused);
  return { status: 200, jsonBody: { success: true, paused } };
}

app.http("requestAiOpinion", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "api/meeting/request-ai-opinion",
  handler: requestAiOpinion,
});

app.http("nextAgenda", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "api/meeting/next-agenda",
  handler: nextAgenda,
});

app.http("toggleAiPause", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "api/meeting/toggle-ai-pause",
  handler: toggleAiPause,
});
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/functions/meeting-chairman.ts
git commit -m "$(cat <<'EOF'
feat(api): add Chairman control endpoints for meeting management

- POST /api/meeting/request-ai-opinion — immediate AI trigger
- POST /api/meeting/next-agenda — phase transition + agenda change
- POST /api/meeting/toggle-ai-pause — pause/resume AI responses

Ref: design spec §4.2

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Audio Relay Endpoint

**Files:**
- Create: `backend/src/functions/meeting-voice.ts`

- [ ] **Step 1: Implement WebSocket audio relay endpoint — Spec §7.3**

```typescript
// backend/src/functions/meeting-voice.ts
// Audio relay: client WebSocket → Listener session
// Ref: Design Spec §7.3

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { voiceLiveManager } from "../services/VoiceLiveSessionManager.js";

/** POST /api/voice/audio — relay audio chunk to Listener session */
async function relayAudio(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const { roomId, audioBase64 } = (await request.json()) as {
    roomId: string;
    audioBase64: string;
  };

  if (!roomId || !audioBase64) {
    return { status: 400, jsonBody: { error: "roomId and audioBase64 required" } };
  }

  voiceLiveManager.relayAudio(roomId, audioBase64);
  return { status: 200, jsonBody: { success: true } };
}

app.http("voiceAudioRelay", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "api/voice/audio",
  handler: relayAudio,
});
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/functions/meeting-voice.ts
git commit -m "$(cat <<'EOF'
feat(ptt): add audio relay endpoint for Voice Live integration

- POST /api/voice/audio — relays PCM16 audio chunks to Listener session
- Bridge between browser mic capture and Voice Live WebSocket API

Ref: design spec §7.3

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 2: Frontend Foundation

### Task 7: i18n Strings + Agent Voice Constants

**Files:**
- Modify: `frontend/src/constants/strings.ts`
- Create: `frontend/src/constants/agentVoices.ts`

- [ ] **Step 1: Add new string keys — Spec §9**

Add after `errors` block (before `} as const;`):

```typescript
  chairman: {
    requestAiOpinion: "AI 의견 요청",
    nextAgenda: "다음 안건",
    pauseAi: "AI 일시정지",
    resumeAi: "AI 재개",
  },
  mic: {
    on: "마이크 켜짐",
    off: "마이크 꺼짐",
    connecting: "마이크 연결 중...",
  },
```

- [ ] **Step 2: Create frontend agent voice config**

```typescript
// frontend/src/constants/agentVoices.ts
// Agent voice metadata for frontend display
// Ref: Design Spec §1.1

import type { AgentRole } from "../types";

export interface AgentVoiceInfo {
  role: AgentRole;
  voiceName: string;
  color: string;  // hex color for UI
}

export const AGENT_VOICE_INFO: Record<AgentRole, AgentVoiceInfo> = {
  coo: { role: "coo", voiceName: "Guy", color: "#3b82f6" },
  cfo: { role: "cfo", voiceName: "Ava", color: "#10b981" },
  cmo: { role: "cmo", voiceName: "Andrew", color: "#f97316" },
  cto: { role: "cto", voiceName: "Brian", color: "#06b6d4" },
  cdo: { role: "cdo", voiceName: "Emma", color: "#ec4899" },
  clo: { role: "clo", voiceName: "Davis", color: "#84cc16" },
};
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/constants/strings.ts frontend/src/constants/agentVoices.ts
git commit -m "$(cat <<'EOF'
feat(i18n): add chairman/mic strings and agent voice constants

- Chairman control button labels (AI opinion, next agenda, pause/resume)
- Mic toggle state labels (on, off, connecting)
- Agent → Azure HD Voice name + color mapping for frontend

Ref: design spec §9, §1.1

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Viseme Map Utility

**Files:**
- Create: `frontend/src/utils/visemeMap.ts`

- [ ] **Step 1: Create utils directory and implement full 22-entry viseme mapping — Spec §6.2**

```bash
mkdir -p frontend/src/utils
```

```typescript
// frontend/src/utils/visemeMap.ts
// Microsoft Viseme ID → ARKit BlendShape weight mapping
// Ref: Design Spec §6.2
// Ref: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-speech-synthesis-viseme

export interface BlendShapeWeights {
  jawOpen?: number;
  mouthOpen?: number;
  mouthFunnel?: number;
  mouthClose?: number;
  mouthSmileLeft?: number;
  mouthSmileRight?: number;
  mouthPucker?: number;
  mouthLowerDownLeft?: number;
  mouthLowerDownRight?: number;
  mouthStretchLeft?: number;
  mouthStretchRight?: number;
  tongueOut?: number;
}

// Shorthand for bilateral mouth shapes
function bilateral(key: string, value: number): Record<string, number> {
  return { [`${key}Left`]: value, [`${key}Right`]: value };
}

/**
 * Full 22-entry Viseme ID → BlendShape weight table.
 * Each entry maps a Microsoft viseme ID (0-21) to RPM avatar morph target weights.
 */
export const VISEME_MAP: BlendShapeWeights[] = [
  /* 0  silence       */ {},
  /* 1  æ, ə, ʌ       */ { jawOpen: 0.3, mouthFunnel: 0.1 },
  /* 2  ɑ             */ { jawOpen: 0.6, mouthOpen: 0.5 },
  /* 3  ɔ             */ { jawOpen: 0.4, mouthFunnel: 0.4 },
  /* 4  ɛ, ʊ          */ { jawOpen: 0.3, ...bilateral("mouthSmile", 0.2) },
  /* 5  ɝ             */ { jawOpen: 0.2, mouthFunnel: 0.3 },
  /* 6  i             */ { jawOpen: 0.1, ...bilateral("mouthSmile", 0.5) },
  /* 7  u             */ { jawOpen: 0.2, mouthFunnel: 0.6, mouthPucker: 0.4 },
  /* 8  o             */ { jawOpen: 0.35, mouthFunnel: 0.5, mouthOpen: 0.3 },
  /* 9  aʊ            */ { jawOpen: 0.5, mouthOpen: 0.4, mouthFunnel: 0.2 },
  /* 10 ɔɪ            */ { jawOpen: 0.4, mouthOpen: 0.3, ...bilateral("mouthSmile", 0.1) },
  /* 11 f, v          */ { mouthFunnel: 0.3, ...bilateral("mouthLowerDown", 0.2) },
  /* 12 s, z          */ { jawOpen: 0.05, ...bilateral("mouthStretch", 0.3) },
  /* 13 ʃ, ʒ          */ { jawOpen: 0.1, mouthFunnel: 0.4, ...bilateral("mouthStretch", 0.1) },
  /* 14 ð, θ          */ { jawOpen: 0.1, tongueOut: 0.4, ...bilateral("mouthLowerDown", 0.1) },
  /* 15 p, b, m       */ { mouthClose: 0.8, jawOpen: 0.05 },
  /* 16 l             */ { jawOpen: 0.2, tongueOut: 0.2, ...bilateral("mouthSmile", 0.1) },
  /* 17 r             */ { jawOpen: 0.15, mouthFunnel: 0.2 },
  /* 18 t, d, n       */ { jawOpen: 0.15, tongueOut: 0.3 },
  /* 19 w             */ { jawOpen: 0.15, mouthFunnel: 0.5, mouthPucker: 0.3 },
  /* 20 k, g          */ { jawOpen: 0.4, mouthOpen: 0.3 },
  /* 21 default close */ { mouthClose: 0.1 },
];

/**
 * Get blend shape weights for a given viseme ID.
 * Returns empty weights for out-of-range IDs.
 */
export function getVisemeWeights(visemeId: number): BlendShapeWeights {
  return VISEME_MAP[visemeId] ?? {};
}

/** All blend shape keys used by the viseme system */
export const VISEME_BLEND_SHAPE_KEYS = [
  "jawOpen",
  "mouthOpen",
  "mouthFunnel",
  "mouthClose",
  "mouthSmileLeft",
  "mouthSmileRight",
  "mouthPucker",
  "mouthLowerDownLeft",
  "mouthLowerDownRight",
  "mouthStretchLeft",
  "mouthStretchRight",
  "tongueOut",
] as const;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/utils/visemeMap.ts
git commit -m "$(cat <<'EOF'
feat(ui): add viseme ID to blend shape mapping for lip sync

- Full 22-entry Microsoft viseme → ARKit BlendShape weight table
- Covers all phoneme groups (silence, vowels, consonants, diphthongs)
- getVisemeWeights() utility for safe lookup with fallback
- VISEME_BLEND_SHAPE_KEYS for morph target enumeration

Ref: design spec §6.2, Microsoft viseme reference

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Audio Utilities

**Files:**
- Create: `frontend/src/utils/audioUtils.ts`

- [ ] **Step 1: Implement PCM16 encoding + audio helpers — Spec §7.3, §8.3**

```typescript
// frontend/src/utils/audioUtils.ts
// Audio utilities for Voice Live integration
// Ref: Design Spec §7.3 (PCM16 encoding), §8.3 (playback)

const TARGET_SAMPLE_RATE = 24000; // Voice Live API requirement

/**
 * Convert Float32Array audio samples to PCM16 Int16Array.
 * Voice Live API requires PCM16 at 24kHz mono.
 */
export function float32ToPcm16(float32: Float32Array): Int16Array {
  const pcm16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm16;
}

/**
 * Convert Int16Array PCM16 to base64 string for WebSocket transmission.
 */
export function pcm16ToBase64(pcm16: Int16Array): string {
  const bytes = new Uint8Array(pcm16.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Decode base64 PCM16 audio to Float32Array for Web Audio API playback.
 */
export function base64ToPcm16Float32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const pcm16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7fff);
  }
  return float32;
}

/**
 * Create an AudioContext configured for Voice Live audio playback.
 * PCM16 24kHz mono.
 */
export function createPlaybackContext(): AudioContext {
  return new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
}

/**
 * Play a Float32Array audio chunk through an AudioContext.
 * Returns a promise that resolves when playback finishes.
 */
export function playAudioChunk(ctx: AudioContext, float32: Float32Array): Promise<void> {
  return new Promise((resolve) => {
    const buffer = ctx.createBuffer(1, float32.length, TARGET_SAMPLE_RATE);
    buffer.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => resolve();
    source.start();
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/utils/audioUtils.ts
git commit -m "$(cat <<'EOF'
feat(ptt): add audio utilities for PCM16 encoding and playback

- float32ToPcm16: mic capture → PCM16 conversion
- pcm16ToBase64: PCM16 → base64 for WebSocket transmission
- base64ToPcm16Float32: base64 → Float32 for Web Audio playback
- createPlaybackContext: AudioContext at 24kHz for Voice Live
- playAudioChunk: promise-based audio playback

Ref: design spec §7.3, §8.3

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: useVoiceLive Hook

**Files:**
- Create: `frontend/src/hooks/useVoiceLive.ts`

- [ ] **Step 1: Implement mic toggle + audio streaming hook — Spec §3.1, §8.1**

```typescript
// frontend/src/hooks/useVoiceLive.ts
// WebSocket audio streaming + mic toggle
// Ref: Design Spec §3.1, §8.1

import { useState, useCallback, useRef, useEffect } from "react";
import { float32ToPcm16, pcm16ToBase64 } from "../utils/audioUtils";

const STORAGE_KEY_MIC = "bizroom_mic_enabled";
const AUDIO_CHUNK_SIZE = 4800; // 200ms at 24kHz

interface UseVoiceLiveOptions {
  roomId: string;
  enabled: boolean; // meeting is active
}

interface UseVoiceLiveReturn {
  isMicOn: boolean;
  isMicConnecting: boolean;
  toggleMic: () => void;
}

export function useVoiceLive({ roomId, enabled }: UseVoiceLiveOptions): UseVoiceLiveReturn {
  const [isMicOn, setIsMicOn] = useState(() => localStorage.getItem(STORAGE_KEY_MIC) === "true");
  const [isMicConnecting, setIsMicConnecting] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const startStreaming = useCallback(async () => {
    if (!enabled || !roomId) return;
    setIsMicConnecting(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 24000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      const audioCtx = new AudioContext({ sampleRate: 24000 });
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);

      // Use ScriptProcessorNode for simplicity (AudioWorklet for production)
      const processor = audioCtx.createScriptProcessor(AUDIO_CHUNK_SIZE, 1, 1);
      processorRef.current = processor;

      // MVP: HTTP POST per audio chunk to /api/voice/audio
      // keepalive: true reuses TCP connections to reduce per-request overhead
      // TODO v2: migrate to SignalR binary channel for lower latency
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const pcm16 = float32ToPcm16(input);
        const base64 = pcm16ToBase64(pcm16);

        fetch(`/api/voice/audio`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId, audioBase64: base64 }),
          keepalive: true,
        }).catch(() => { /* ignore send failures — audio is best-effort */ });
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);
      setIsMicConnecting(false);
    } catch (err) {
      console.error("[useVoiceLive] Failed to start mic:", err);
      setIsMicOn(false);
      setIsMicConnecting(false);
      localStorage.setItem(STORAGE_KEY_MIC, "false");
    }
  }, [roomId, enabled]);

  const stopStreaming = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const toggleMic = useCallback(() => {
    const next = !isMicOn;
    setIsMicOn(next);
    localStorage.setItem(STORAGE_KEY_MIC, String(next));
    if (next) {
      startStreaming();
    } else {
      stopStreaming();
    }
  }, [isMicOn, startStreaming, stopStreaming]);

  // Auto-start if mic was previously enabled
  useEffect(() => {
    if (isMicOn && enabled) {
      startStreaming();
    }
    return () => stopStreaming();
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return { isMicOn, isMicConnecting, toggleMic };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useVoiceLive.ts
git commit -m "$(cat <<'EOF'
feat(ptt): add useVoiceLive hook for mic streaming to Voice Live

- Mic toggle with localStorage persistence
- getUserMedia capture with echo/noise cancellation
- PCM16 24kHz encoding via ScriptProcessorNode
- Audio chunks sent to /api/voice/audio endpoint
- Auto-start on mount if previously enabled

Ref: design spec §3.1, §8.1

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: useAgentAudio Hook

**Files:**
- Create: `frontend/src/hooks/useAgentAudio.ts`

- [ ] **Step 1: Implement agent audio playback queue — Spec §8.3**

```typescript
// frontend/src/hooks/useAgentAudio.ts
// Agent audio playback queue using Web Audio API
// Ref: Design Spec §8.3

import { useRef, useCallback, useEffect } from "react";
import { base64ToPcm16Float32, createPlaybackContext } from "../utils/audioUtils";
import type { AgentRole } from "../types";

interface UseAgentAudioReturn {
  /** Feed audio chunk from SignalR agentAudioDelta event */
  feedAudio: (role: AgentRole, audioBase64: string) => void;
  /** Stop all playback (interrupt) */
  stopAll: () => void;
  /** Currently playing agent role */
  playingRole: React.MutableRefObject<AgentRole | null>;
}

export function useAgentAudio(): UseAgentAudioReturn {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const queueRef = useRef<Float32Array[]>([]);
  const playingRole = useRef<AgentRole | null>(null);
  const isPlayingRef = useRef(false);

  // Initialize AudioContext lazily (requires user gesture)
  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = createPlaybackContext();
    }
    return audioCtxRef.current;
  }, []);

  const playNext = useCallback(async () => {
    if (isPlayingRef.current || queueRef.current.length === 0) return;
    isPlayingRef.current = true;

    const ctx = getAudioCtx();
    while (queueRef.current.length > 0) {
      const chunk = queueRef.current.shift()!;
      const buffer = ctx.createBuffer(1, chunk.length, 24000);
      buffer.copyToChannel(chunk, 0);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      await new Promise<void>((resolve) => {
        source.onended = () => resolve();
        source.start();
      });
    }

    isPlayingRef.current = false;
  }, [getAudioCtx]);

  const feedAudio = useCallback(
    (role: AgentRole, audioBase64: string) => {
      playingRole.current = role;
      const float32 = base64ToPcm16Float32(audioBase64);
      queueRef.current.push(float32);
      playNext();
    },
    [playNext],
  );

  const stopAll = useCallback(() => {
    queueRef.current = [];
    playingRole.current = null;
    isPlayingRef.current = false;
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      audioCtxRef.current?.close();
    };
  }, []);

  return { feedAudio, stopAll, playingRole };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useAgentAudio.ts
git commit -m "$(cat <<'EOF'
feat(ui): add useAgentAudio hook for agent voice playback

- Audio queue with sequential playback (Web Audio API)
- PCM16 24kHz base64 → Float32 decoding
- Interrupt support (stopAll clears queue)
- Lazy AudioContext initialization (user gesture compliance)

Ref: design spec §8.3

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: useViseme Hook

**Files:**
- Create: `frontend/src/hooks/useViseme.ts`

- [ ] **Step 1: Implement viseme event → blend shape weights — Spec §6, §8.1**

```typescript
// frontend/src/hooks/useViseme.ts
// Viseme events → blend shape weights for 3D lip sync
// Ref: Design Spec §6, §8.1

import { useRef, useCallback } from "react";
import { getVisemeWeights, VISEME_BLEND_SHAPE_KEYS, type BlendShapeWeights } from "../utils/visemeMap";
import type { AgentRole } from "../types";

interface UseVisemeReturn {
  /** Feed viseme event from SignalR agentVisemeDelta */
  feedViseme: (role: AgentRole, visemeId: number) => void;
  /** Get current target weights for a given agent (consumed by useFrame) */
  getTargetWeights: (role: AgentRole) => BlendShapeWeights;
  /** Reset all weights to zero (agent stopped speaking) */
  resetWeights: (role: AgentRole) => void;
}

export function useViseme(): UseVisemeReturn {
  // Per-agent target blend shape weights
  const weightsMap = useRef(new Map<AgentRole, BlendShapeWeights>());

  const feedViseme = useCallback((role: AgentRole, visemeId: number) => {
    const weights = getVisemeWeights(visemeId);
    weightsMap.current.set(role, weights);
  }, []);

  const getTargetWeights = useCallback((role: AgentRole): BlendShapeWeights => {
    return weightsMap.current.get(role) ?? {};
  }, []);

  const resetWeights = useCallback((role: AgentRole) => {
    weightsMap.current.set(role, {});
  }, []);

  return { feedViseme, getTargetWeights, resetWeights };
}

/** LERP speed for smooth viseme transitions (per second) — Spec §6.3 */
export const VISEME_LERP_SPEED = 12;

/** Interpolate a single blend shape weight toward target */
export function lerpWeight(current: number, target: number, deltaTime: number): number {
  return current + (target - current) * Math.min(1, deltaTime * VISEME_LERP_SPEED);
}

export { VISEME_BLEND_SHAPE_KEYS };
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useViseme.ts
git commit -m "$(cat <<'EOF'
feat(ui): add useViseme hook for 3D avatar lip sync

- feedViseme: receive viseme events, update target blend shape weights
- getTargetWeights: provide current weights for useFrame rendering
- lerpWeight: smooth interpolation at 12/s for natural mouth movement
- Per-agent weight tracking for concurrent avatar animations

Ref: design spec §6, §8.1

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 3: Frontend Components & Integration

### Task 13: MicToggle Component

**Files:**
- Create: `frontend/src/components/input/MicToggle.tsx`

- [ ] **Step 1: Implement mic toggle button — Spec §3.1**

```tsx
// frontend/src/components/input/MicToggle.tsx
// Mic on/off toggle button
// Ref: Design Spec §3.1

import { S } from "../../constants/strings";

interface MicToggleProps {
  isMicOn: boolean;
  isConnecting: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export function MicToggle({ isMicOn, isConnecting, onToggle, disabled }: MicToggleProps) {
  const label = isConnecting ? S.mic.connecting : isMicOn ? S.mic.on : S.mic.off;

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled || isConnecting}
      aria-label={label}
      title={label}
      className={`
        flex items-center justify-center w-10 h-10 rounded-xl transition-all
        ${isMicOn
          ? "bg-red-500/20 text-red-400 hover:bg-red-500/30 ring-1 ring-red-500/30"
          : "bg-neutral-800/60 text-neutral-400 hover:bg-neutral-700/60 hover:text-neutral-200"
        }
        ${isConnecting ? "animate-pulse" : ""}
        ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
      `}
    >
      {isConnecting ? (
        <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.3" />
          <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ) : (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {isMicOn ? (
            <>
              <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
              <path d="M19 10v2a7 7 0 01-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </>
          ) : (
            <>
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
              <path d="M17 16.95A7 7 0 015 12v-2m14 0v2c0 .87-.16 1.7-.45 2.47" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </>
          )}
        </svg>
      )}
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/input/MicToggle.tsx
git commit -m "$(cat <<'EOF'
feat(ptt): add MicToggle component for voice/chat mode switching

- Visual mic on/off toggle with red glow when active
- Connecting state with spinner animation
- Muted mic icon with strikethrough when off
- Accessible with aria-label from centralized strings

Ref: design spec §3.1

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: ChairmanControls Component

**Files:**
- Create: `frontend/src/components/meeting/ChairmanControls.tsx`

- [ ] **Step 1: Implement Chairman control bar — Spec §4.1**

```tsx
// frontend/src/components/meeting/ChairmanControls.tsx
// Chairman-only control bar for meeting management
// Ref: Design Spec §4.1, §4.2

import { useState, useCallback } from "react";
import { S } from "../../constants/strings";

interface ChairmanControlsProps {
  roomId: string;
  isChairman: boolean;
  disabled?: boolean;
}

export function ChairmanControls({ roomId, isChairman, disabled }: ChairmanControlsProps) {
  const [aiPaused, setAiPaused] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  const callApi = useCallback(async (endpoint: string, body: Record<string, unknown>) => {
    setLoading(endpoint);
    try {
      await fetch(`/api/meeting/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      console.error(`[ChairmanControls] ${endpoint} failed:`, err);
    } finally {
      setLoading(null);
    }
  }, []);

  const handleAiOpinion = useCallback(() => {
    callApi("request-ai-opinion", { roomId });
  }, [roomId, callApi]);

  const handleNextAgenda = useCallback(() => {
    callApi("next-agenda", { roomId, agenda: "" });
  }, [roomId, callApi]);

  const handleTogglePause = useCallback(() => {
    const next = !aiPaused;
    setAiPaused(next);
    callApi("toggle-ai-pause", { roomId, paused: next });
  }, [roomId, aiPaused, callApi]);

  if (!isChairman) return null;

  const btnClass = (isActive: boolean = false) =>
    `px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
      isActive
        ? "bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30"
        : "bg-neutral-800/60 text-neutral-300 hover:bg-neutral-700/60 hover:text-white"
    } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`;

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-neutral-900/40 backdrop-blur-sm rounded-xl border border-neutral-700/20">
      <button
        type="button"
        onClick={handleAiOpinion}
        disabled={disabled || loading === "request-ai-opinion"}
        className={btnClass()}
      >
        {S.chairman.requestAiOpinion}
      </button>
      <button
        type="button"
        onClick={handleNextAgenda}
        disabled={disabled || loading === "next-agenda"}
        className={btnClass()}
      >
        {S.chairman.nextAgenda}
      </button>
      <button
        type="button"
        onClick={handleTogglePause}
        disabled={disabled}
        className={btnClass(aiPaused)}
      >
        {aiPaused ? S.chairman.resumeAi : S.chairman.pauseAi}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/meeting/ChairmanControls.tsx
git commit -m "$(cat <<'EOF'
feat(ui): add ChairmanControls for AI opinion, agenda, and pause

- AI opinion button: immediate agent trigger
- Next agenda button: phase transition
- AI pause/resume toggle with active state
- Chairman-only visibility (returns null for non-chairman)
- REST API calls to meeting-chairman endpoints

Ref: design spec §4.1, §4.2

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: DmStoriesPicker Component

**Files:**
- Create: `frontend/src/components/meeting/DmStoriesPicker.tsx`
- Delete: `frontend/src/components/meeting/DmAgentPicker.tsx` (after integration)

- [ ] **Step 1: Implement Instagram Stories-style agent picker — Spec §5**

```tsx
// frontend/src/components/meeting/DmStoriesPicker.tsx
// Instagram Stories-style circular avatar agent picker
// Ref: Design Spec §5

import { memo } from "react";
import { S } from "../../constants/strings";
import type { AgentRole } from "../../types";

interface DmStoriesPickerProps {
  currentTarget: AgentRole | null;
  onSelect: (role: AgentRole) => void;
}

const AGENTS: { role: AgentRole; name: string; title: string; icon: string; color: string }[] = [
  { role: "coo", name: S.agents.coo.name, title: S.agents.coo.role, icon: "📋", color: "#3b82f6" },
  { role: "cfo", name: S.agents.cfo.name, title: S.agents.cfo.role, icon: "💰", color: "#10b981" },
  { role: "cmo", name: S.agents.cmo.name, title: S.agents.cmo.role, icon: "📣", color: "#f97316" },
  { role: "cto", name: S.agents.cto.name, title: S.agents.cto.role, icon: "🛠", color: "#06b6d4" },
  { role: "cdo", name: S.agents.cdo.name, title: S.agents.cdo.role, icon: "🎨", color: "#ec4899" },
  { role: "clo", name: S.agents.clo.name, title: S.agents.clo.role, icon: "⚖️", color: "#84cc16" },
];

function AgentStoryAvatar({
  agent,
  isSelected,
  onSelect,
}: {
  agent: (typeof AGENTS)[0];
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex flex-col items-center gap-1.5 min-w-[72px] group"
    >
      {/* Circular avatar with ring */}
      <div
        className={`
          relative w-16 h-16 rounded-full flex items-center justify-center text-2xl
          transition-all duration-300
          ${isSelected
            ? "ring-2 shadow-lg scale-105"
            : "ring-1 ring-neutral-700 group-hover:ring-neutral-500 group-hover:scale-105"
          }
        `}
        style={{
          // ringColor via CSS custom property (Tailwind ring-* classes use --tw-ring-color)
          "--tw-ring-color": isSelected ? agent.color : undefined,
          boxShadow: isSelected ? `0 0 20px ${agent.color}40` : undefined,
          background: isSelected
            ? `linear-gradient(135deg, ${agent.color}20, ${agent.color}10)`
            : "rgba(38, 38, 38, 0.6)",
        }}
      >
        <span className="text-2xl">{agent.icon}</span>
        {/* Online indicator dot */}
        <div
          className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-neutral-950"
          style={{ backgroundColor: agent.color }}
        />
      </div>
      {/* Name + Role labels */}
      <div className="text-center">
        <p className={`text-xs font-medium ${isSelected ? "text-white" : "text-neutral-400"}`}>
          {agent.name}
        </p>
        <p className="text-[10px] text-neutral-500">{agent.title}</p>
      </div>
    </button>
  );
}

export const DmStoriesPicker = memo(function DmStoriesPicker({ currentTarget, onSelect }: DmStoriesPickerProps) {
  return (
    <div className="py-4 px-2">
      <p className="text-xs text-neutral-500 text-center mb-3">{S.mode.selectDmAgent}</p>
      <div className="flex justify-center gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {AGENTS.map((agent) => (
          <AgentStoryAvatar
            key={agent.role}
            agent={agent}
            isSelected={currentTarget === agent.role}
            onSelect={() => onSelect(agent.role)}
          />
        ))}
      </div>
    </div>
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/meeting/DmStoriesPicker.tsx
git commit -m "$(cat <<'EOF'
feat(ui): add DmStoriesPicker with Instagram Stories-style avatars

- Circular 64px avatar frames with emoji icons
- Selected state: agent color ring glow + scale animation
- Online indicator dot with agent-specific color
- Name + role labels below each avatar
- Horizontal scroll layout for mobile
- Replaces flat chip DmAgentPicker design

Ref: design spec §5

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: InputArea Integration with MicToggle

**Files:**
- Modify: `frontend/src/components/input/InputArea.tsx`

> Read the current InputArea.tsx first. Add MicToggle button to the left of the text input.

- [ ] **Step 1: Add MicToggle import and integration**

In `InputArea.tsx`, add `MicToggle` to the left of the textarea. The component receives `micProps` from parent:

Add new props:
```typescript
interface InputAreaProps {
  onSend: (content: string, isVoiceInput?: boolean) => void;
  disabled?: boolean;
  placeholder?: string;
  sendLabel?: string;
  // New props for mic toggle
  isMicOn?: boolean;
  isMicConnecting?: boolean;
  onMicToggle?: () => void;
}
```

Add MicToggle button before the textarea in the JSX:
```tsx
{onMicToggle && (
  <MicToggle
    isMicOn={isMicOn ?? false}
    isConnecting={isMicConnecting ?? false}
    onToggle={onMicToggle}
    disabled={disabled}
  />
)}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/input/InputArea.tsx
git commit -m "$(cat <<'EOF'
feat(ptt): integrate MicToggle into InputArea component

- Add mic toggle props (isMicOn, isMicConnecting, onMicToggle)
- Render MicToggle button to the left of text input
- Toggle only shows when onMicToggle callback is provided

Ref: design spec §3.1

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 17: RPMAgentAvatar Viseme Lip Sync

**Files:**
- Modify: `frontend/src/components/meeting3d/RPMAgentAvatar.tsx`

> Read current file first. Add viseme-driven morph target updates in the existing `useFrame()` callback.

- [ ] **Step 1: Add viseme props and LERP logic**

Add new props to RPMAgentAvatar:
```typescript
interface RPMAgentAvatarProps {
  // ... existing props
  visemeWeights?: BlendShapeWeights;  // from useViseme hook
}
```

In the `useFrame()` callback, after existing morph target logic (jawOpen for speaking, eyeBlink, etc.), add viseme interpolation:

```typescript
import { lerpWeight, VISEME_BLEND_SHAPE_KEYS, type BlendShapeWeights } from "../../utils/visemeMap";

// Inside useFrame, after existing morph target updates:
// Viseme-driven lip sync (overrides simple jawOpen when weights provided)
if (visemeWeights && Object.keys(visemeWeights).length > 0) {
  for (const key of VISEME_BLEND_SHAPE_KEYS) {
    const idx = mesh.morphTargetDictionary?.[key];
    if (idx !== undefined && mesh.morphTargetInfluences) {
      const target = (visemeWeights as Record<string, number>)[key] ?? 0;
      const current = mesh.morphTargetInfluences[idx] ?? 0;
      mesh.morphTargetInfluences[idx] = lerpWeight(current, target, delta);
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/meeting3d/RPMAgentAvatar.tsx
git commit -m "$(cat <<'EOF'
feat(ui): add viseme-driven lip sync to RPMAgentAvatar

- Accept visemeWeights prop from useViseme hook
- LERP interpolation at 12/s for smooth mouth movement
- Override simple jawOpen when viseme data is available
- Per-blend-shape morph target updates in useFrame

Ref: design spec §6.3

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 18: App.tsx Integration — Wire Everything Together

**Files:**
- Modify: `frontend/src/App.tsx`

> This is the final wiring task. Read current App.tsx first. Add:
> 1. ChairmanControls in the meeting room view
> 2. DmStoriesPicker replacing DmAgentPicker
> 3. useVoiceLive, useAgentAudio, useViseme hooks
> 4. Pass visemeWeights to RPMAgentAvatar instances
> 5. Wire SignalR voice events to hooks

- [ ] **Step 1: Import new components and hooks**

```typescript
import { ChairmanControls } from "./components/meeting/ChairmanControls";
import { DmStoriesPicker } from "./components/meeting/DmStoriesPicker";
import { useVoiceLive } from "./hooks/useVoiceLive";
import { useAgentAudio } from "./hooks/useAgentAudio";
import { useViseme } from "./hooks/useViseme";
```

- [ ] **Step 2: Initialize hooks in MeetingRoom component**

Inside the main MeetingRoom component (or wherever the meeting view is rendered):

```typescript
const { isMicOn, isMicConnecting, toggleMic } = useVoiceLive({
  roomId: state.roomId,
  enabled: state.inRoom && state.meetingPhase !== "idle",
});
const { feedAudio, stopAll: stopAudio } = useAgentAudio();
const { feedViseme, getTargetWeights, resetWeights } = useViseme();
```

- [ ] **Step 3: Replace DmAgentPicker with DmStoriesPicker**

Find the `DmAgentPicker` usage and replace:
```tsx
// Old:
<DmAgentPicker currentTarget={state.dmTarget} onSelect={handleDmSelect} />

// New:
<DmStoriesPicker currentTarget={state.dmTarget as AgentRole | null} onSelect={handleDmSelect} />
```

- [ ] **Step 4: Add ChairmanControls to meeting view**

Place above InputArea in the meeting room layout:
```tsx
{state.inRoom && state.meetingPhase !== "idle" && (
  <ChairmanControls
    roomId={state.roomId}
    isChairman={state.isChairman}
  />
)}
```

- [ ] **Step 5: Pass mic props to InputArea**

```tsx
<InputArea
  onSend={handleSend}
  isMicOn={isMicOn}
  isMicConnecting={isMicConnecting}
  onMicToggle={toggleMic}
  // ... existing props
/>
```

- [ ] **Step 6: Pass viseme weights to RPMAgentAvatar**

For each RPMAgentAvatar rendered in the 3D scene:
```tsx
<RPMAgentAvatar
  // ... existing props
  visemeWeights={getTargetWeights(agent.role as AgentRole)}
/>
```

- [ ] **Step 7: Delete old DmAgentPicker**

```bash
git rm frontend/src/components/meeting/DmAgentPicker.tsx
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "$(cat <<'EOF'
feat(ui): integrate Voice Live hooks and Chairman controls into App

- Wire useVoiceLive, useAgentAudio, useViseme hooks
- Add ChairmanControls bar (chairman-only visibility)
- Replace DmAgentPicker with DmStoriesPicker
- Pass mic toggle props to InputArea
- Pass viseme weights to RPMAgentAvatar instances
- Delete deprecated DmAgentPicker component

Ref: design spec §3, §4, §5, §6, §8

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Post-Implementation Checklist

After completing all tasks, verify:

- [ ] `cd backend && npx tsc --noEmit` — no TypeScript errors
- [ ] `cd frontend && npx tsc --noEmit` — no TypeScript errors
- [ ] `cd frontend && npx eslint . --max-warnings=0` — no lint errors
- [ ] `cd frontend && npm run build` — Vite build succeeds
- [ ] `cd backend && npm run build` — Backend builds

### Alpha → Beta → Charlie Flow (per CLAUDE.md)

After all tasks committed:

1. **Beta: Code Review** — dispatch `superpowers:code-reviewer` agent
2. **Beta: Lint** — `npx eslint --fix . && npx prettier --write .`
3. **Charlie: Optimize** — `React.memo`, `useMemo`, `useCallback` audit
4. **Final commit** after all issues resolved
