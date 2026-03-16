---
version: "2.0.0"
created: "2026-03-12 22:00"
updated: "2026-03-16 14:00"
---

# Voice Live Integration + TurnManager — Design Spec

**Goal:** Real-time voice meetings where each AI agent has a unique voice and personality. The TurnManager operates as an event-driven state machine that orchestrates turn-taking between humans and AI agents, supporting voice + chat coexistence, chairman priority controls, and intelligent agent-to-agent mention routing.

**Architecture:** VoiceLiveSessionManager maintains WebSocket sessions (1 Listener + lazy agent sessions) per room. TurnManager receives speech events from the Listener, buffers human input, routes to appropriate agents via TopicClassifier, and triggers agent responses. VoiceLiveOrchestrator wires TurnManager, VoiceLiveSessionManager, and SignalR together with the Sophia visual pipeline.

**Tech Stack:** OpenAI GPT Realtime API 1.5 (primary voice), Azure Voice Live API (optional primary when configured), Azure HD Voices + Viseme, WebSocket (ws 8.x), React Three Fiber (lip sync)

**References:**
- [Azure Voice Live API Docs](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live-how-to)
- [OpenAI Realtime API Reference](https://platform.openai.com/docs/api-reference/realtime)

---

## 1. Session Architecture

### 1.1 Dual-Provider Design

The system auto-selects between Azure Voice Live and OpenAI Realtime API based on environment configuration:

| Condition                          | Provider Selected     | Notes                                |
| ---------------------------------- | --------------------- | ------------------------------------ |
| `AZURE_VOICE_LIVE_ENDPOINT` set    | Azure Voice Live      | Full-featured: HD voices + viseme    |
| `OPENAI_API_KEY` set (no Azure)    | OpenAI Realtime API   | server_vad + whisper-1 STT           |
| Neither configured                 | Text-only mode        | Graceful degradation                 |

### 1.2 Session Overview

| Session   | Role            | turn_detection                                    | Voice                     |
| --------- | --------------- | ------------------------------------------------- | ------------------------- |
| Listener  | STT (1 per room)| Azure: `azure_semantic_vad` / OpenAI: `server_vad`| N/A (input only)          |
| Hudson    | COO agent       | `none` (TurnManager-controlled)                   | Guy:DragonHDLatestNeural  |
| Amelia    | CFO agent       | `none`                                            | Ava:DragonHDLatestNeural  |
| Yusef     | CMO agent       | `none`                                            | Andrew:DragonHDLatestNeural|
| Kelvin    | CTO agent       | `none`                                            | Brian:DragonHDLatestNeural|
| Jonas     | CDO agent       | `none`                                            | Emma:DragonHDLatestNeural |
| Bradley   | CLO agent       | `none`                                            | Davis:DragonHDLatestNeural|
| Sophia    | Secretary TTS   | `none`                                            | Alloy (OpenAI)            |

**Key design decision:** Agent sessions are created **lazily** — only when an agent is first triggered to speak. The Listener session is created immediately on room initialization (critical path). Sophia has a dedicated TTS-only session for voice announcements.

### 1.3 Listener Session Configuration

**Azure Voice Live:**
```json
{
  "type": "session.update",
  "session": {
    "turn_detection": {
      "type": "azure_semantic_vad",
      "silence_duration_ms": 500,
      "remove_filler_words": true,
      "languages": ["en"],
      "create_response": false
    },
    "input_audio_noise_reduction": { "type": "azure_deep_noise_suppression" },
    "input_audio_echo_cancellation": { "type": "server_echo_cancellation" },
    "input_audio_transcription": { "model": "azure-speech", "language": "en" },
    "modalities": ["text"]
  }
}
```

**OpenAI Realtime (fallback):**
```json
{
  "type": "session.update",
  "session": {
    "turn_detection": {
      "type": "server_vad",
      "threshold": 0.5,
      "prefix_padding_ms": 300,
      "silence_duration_ms": 500,
      "create_response": false
    },
    "input_audio_transcription": { "model": "whisper-1" },
    "modalities": ["text"]
  }
}
```

**Listener events emitted to TurnManager:**

| Server Event                                              | TurnManager Handler            |
| --------------------------------------------------------- | ------------------------------ |
| `input_audio_buffer.speech_started`                       | `onSpeechStart(userId)`        |
| `input_audio_buffer.speech_stopped`                       | `onSpeechEnd(userId)`          |
| `conversation.item.input_audio_transcription.completed`   | `onTranscript(userId, text)`   |

### 1.4 Agent Session Configuration

**Azure Voice Live:**
```json
{
  "type": "session.update",
  "session": {
    "instructions": "<Agent persona system prompt>",
    "turn_detection": { "type": "none" },
    "voice": {
      "name": "en-US-Guy:DragonHDLatestNeural",
      "type": "azure-standard",
      "temperature": 0.8
    },
    "modalities": ["audio", "text"],
    "output_audio_timestamp_types": ["word"],
    "animation": { "outputs": ["viseme_id"] }
  }
}
```

**OpenAI Realtime (fallback):**
```json
{
  "type": "session.update",
  "session": {
    "instructions": "<Agent persona>",
    "turn_detection": null,
    "voice": "alloy",
    "modalities": ["audio", "text"]
  }
}
```

### 1.5 Triggering Agent Responses

TurnManager triggers agents via `response.create` with `conversation: "none"` (out-of-band, stateless):

**Azure:**
```json
{
  "type": "response.create",
  "response": {
    "conversation": "none",
    "modalities": ["audio", "text"],
    "instructions": "<persona + context + human input>"
  }
}
```

**OpenAI (different payload structure):**
```json
{
  "type": "response.create",
  "response": {
    "conversation": "none",
    "modalities": ["audio", "text"],
    "input": [{
      "type": "message",
      "role": "system",
      "content": [{ "type": "input_text", "text": "<instructions>" }]
    }]
  }
}
```

**Events returned from agent sessions:**

| Server Event                            | Handler                                 |
| --------------------------------------- | --------------------------------------- |
| `response.audio.delta`                  | SignalR `agentAudioDelta` -> playback   |
| `response.audio_transcript.delta`       | SignalR `agentTranscriptDelta` -> chat  |
| `response.text.delta`                   | SignalR `agentTextDelta` -> chat        |
| `response.animation_viseme.delta`       | SignalR `agentVisemeDelta` -> lip sync  |
| `response.done`                         | TurnManager.onAgentDone(role, fullText) |

---

## 2. TurnManager State Machine

### 2.1 States

```
IDLE --> HEARING --> ROUTING --> SPEAKING --> IDLE
  ^                                |
  |         (voice interrupt)      |
  +--------------------------------+
                                   |
                          SPEAKING --> AWAITING --> SPEAKING/IDLE
```

| State      | Description                                               | Duration         |
| ---------- | --------------------------------------------------------- | ---------------- |
| `idle`     | No human input, no agent responding                       | Indefinite       |
| `hearing`  | Collecting human inputs (voice transcripts + chat)        | Until flush      |
| `routing`  | Determining which agents respond, in what order           | < 100ms          |
| `speaking` | Agent(s) responding sequentially with inter-agent gaps    | Until all done   |
| `awaiting` | Agents paused, waiting for human response to a callout    | Max 30 seconds   |

### 2.2 Core State Interface

```typescript
interface RoomTurnState {
  state: TurnState;           // "idle" | "hearing" | "routing" | "speaking" | "awaiting"
  inputBuffer: BufferedMessage[];
  flushTimer: ReturnType<typeof setTimeout> | null;
  agentQueue: AgentTurn[];
  activeAgent: AgentRole | null;
  interruptFlag: boolean;
  aiPaused: boolean;
  combinedInput: string;      // cached merged human input for the current turn
  ceoUserId: string | null;
  followUpRound: number;      // tracks A2A mention chain depth
  agentResponseCount: number; // total agents responded this turn
  awaitingTimer: ReturnType<typeof setTimeout> | null;
  awaitingGeneration: number; // generation counter for timeout race condition defense
}
```

### 2.3 Timing Configuration

Defined in `backend/src/constants/turnConfig.ts`:

| Constant                  | Value   | Description                                   |
| ------------------------- | ------- | --------------------------------------------- |
| `CEO_FLUSH_MS`            | 0ms     | CEO flush delay (PTT release = immediate)     |
| `MEMBER_FLUSH_MS`         | 500ms   | Member flush delay                            |
| `INTER_AGENT_GAP_MS`     | 500ms   | Gap between sequential agent responses        |
| `MAX_AGENTS_PER_TURN`    | 1       | Initial agents per turn (others via mentions) |
| `MAX_FOLLOW_UP_ROUNDS`   | 2       | Max A2A follow-up chain depth                 |
| `HUMAN_CALLOUT_TIMEOUT_MS`| 30000ms | Timeout for human response in awaiting state  |

### 2.4 Event Handlers

#### `onSpeechStart(roomId, userId)`
Human started speaking via voice.

```
if IDLE:     -> transition to HEARING, clear flushTimer
if HEARING:  -> clear flushTimer (more input coming)
if SPEAKING: -> voice interrupt: cancel active agent, clear queue,
                clear inputBuffer, transition to HEARING
```

#### `onSpeechEnd(roomId, userId)`
Human stopped speaking.

```
if HEARING:
  -> start flushTimer:
     CEO:    0ms (immediate — PTT release means done speaking)
     Member: 500ms (short wait for additional input)
```

#### `onTranscript(roomId, userId, userName, text)`
Voice transcription completed.

```
if HEARING:
  -> add to inputBuffer: { userId, userName, isCeo, source: "voice", content, timestamp }
  -> if no flushTimer running, start one (same timing as onSpeechEnd)
```

#### `onChatMessage(roomId, userId, userName, text, isCeo)`
Chat message received via SignalR.

```
if IDLE:     -> transition to HEARING
if HEARING:  -> add to inputBuffer, reset flushTimer
if SPEAKING: -> add to inputBuffer (queued for next turn, NO interrupt)
if aiPaused: -> ignored
```

#### `onFlush()` — flush timer expired
Quiet window elapsed, time to trigger agents.

```
1. Transition to ROUTING
2. Merge buffered messages: "[userName]: content" joined with newlines
3. Save all buffered messages to ContextBroker
4. Check for direct Sophia mention (regex: `/sophia/i`) -> emit sophiaDirect event, return to IDLE
5. Classify topic via TopicClassifier + parseMentions
6. Build agentQueue via determineAgentOrder() capped at MAX_AGENTS_PER_TURN
7. Clear inputBuffer, reset counters
8. Transition to SPEAKING, triggerNextAgent()
```

#### `triggerNextAgent()`
Send response.create to the next agent in queue.

```
if agentQueue empty: -> transition to IDLE, emit "agentsDone"
else:
  next = agentQueue.shift()
  activeAgent = next.role
  context = getContextForAgent(roomId, role)
  emit "triggerAgent" event with built instructions
```

#### `onAgentDone(roomId, role, fullText)`
Agent finished responding.

```
1. Increment agentResponseCount
2. Save agent response to ContextBroker
3. Check HARD STOP: if agentResponseCount >= MAX_AGENTS_PER_TURN
   and followUpRound === 0 and queue empty -> emit agentsDone, IDLE
4. A2A follow-up check (keyword-based, only if followUpRound <= MAX_FOLLOW_UP_ROUNDS)
5. If queue has more agents: setTimeout(triggerNextAgent, INTER_AGENT_GAP_MS)
6. If queue empty: emit agentsDone, process any queued input or -> IDLE
```

### 2.5 Agent Priority Queue (DialogLab)

```typescript
function determineAgentOrder(message, mentions, primaryAgent, secondaryAgents): AgentTurn[]
```

| Priority | Rule                                                                    |
| -------- | ----------------------------------------------------------------------- |
| P1       | COO always leads (orchestrator role), unless user explicitly @mentions other agents |
| P2       | Explicitly @mentioned agents (parsed from user input)                   |
| P3       | Primary topic agent (from TopicClassifier) + secondary agents           |
| P4       | Remaining agents (available as overflow)                                |

### 2.6 Interrupt Handling

**Voice interrupt during SPEAKING:**
1. Set interruptFlag = true
2. Send `response.cancel` to current agent session
3. Clear agentQueue
4. Clear inputBuffer (interrupt = new topic)
5. Transition to HEARING
6. Collect new human input

**Chat during SPEAKING:**
- Does NOT interrupt (chat is non-invasive)
- Message is added to inputBuffer for next turn

### 2.7 Chairman Priority Rules

| Chairman Action               | TurnManager Behavior                                |
| ----------------------------- | --------------------------------------------------- |
| Voice speech end (PTT release)| 0ms flush (immediate AI trigger)                    |
| Chat message sent             | 0ms flush (immediate AI trigger)                    |
| "AI Opinion" button           | Immediate flush (0ms), all agents eligible          |
| "Next Agenda" button          | Phase transition + ContextBroker agenda update       |
| "AI Pause" toggle             | SPEAKING -> immediate cancel, ignore future flushes  |
| "@CFO" mention in speech      | That agent receives P2 priority in routing           |

### 2.8 Awaiting State (Human Callout)

When an agent's structured output contains `mention.target = "ceo"` or `"member:..."`:

```
1. TurnManager.enterAwaitingState() -> transition to AWAITING
2. Emit "humanCallout" event via SignalR to frontend
3. Start 30-second timeout
4. Frontend shows callout UI (options on CEO monitor, alert for members)

Human responds:
  -> onHumanResponse() clears timeout, resumes agentQueue or -> IDLE

Timeout (30s):
  -> Auto-resume with "[CEO did not respond, proceeding]"

Race condition defense:
  -> awaitingGeneration counter ensures stale timeouts are ignored
```

---

## 3. Voice + Chat Coexistence

### 3.1 Dual Input Paths

```
Voice Path:
  Mic -> getUserMedia() -> AudioWorklet (PCM16, 24kHz mono)
  -> WebSocket -> Backend relay -> Listener Session
  -> VAD -> speech events -> TurnManager

Chat Path:
  Keyboard -> InputArea -> Enter -> SignalR/REST
  -> TurnManager.onChatMessage()

Both paths -> inputBuffer -> onFlush() -> Agent Sessions
```

### 3.2 Message Source Tracking

Messages in ContextBroker preserve their input source via `isVoiceInput?: boolean` on the Message interface, allowing agents to contextually reference how the user communicated.

### 3.3 Audio Format

PCM16, 24kHz, mono — required by both Azure Voice Live and OpenAI Realtime APIs.

---

## 4. Chairman Controls

### 4.1 API Endpoints

Implemented in `backend/src/functions/meeting-chairman.ts`:

| Endpoint                            | Method | Body                    | Action                        |
| ----------------------------------- | ------ | ----------------------- | ----------------------------- |
| `/api/meeting/request-ai-opinion`   | POST   | `{ roomId }`            | Immediate flush (all routing) |
| `/api/meeting/next-agenda`          | POST   | `{ roomId, agenda }`    | Phase transition + agenda set |
| `/api/meeting/toggle-ai-pause`      | POST   | `{ roomId, paused }`    | Pause/resume AI responses     |
| `/api/meeting/human-response`       | POST   | `{ roomId, userId, text }` | Reply to human callout      |
| `/api/meeting/join-member`          | POST   | `{ roomId, userId, userName, role }` | Team member join  |

---

## 5. Viseme -> 3D Lip Sync

### 5.1 Pipeline

```
Agent Session -> response.animation_viseme.delta { viseme_id, audio_offset_ms }
  -> WebSocket -> SignalR -> Frontend
  -> VisemeMapper.getBlendShapes(viseme_id)
  -> AgentAvatar3D useFrame() -> mesh.morphTargetInfluences update
```

### 5.2 Interpolation

Viseme transitions use linear interpolation for smooth mouth movement:

```typescript
const LERP_SPEED = 12; // per second
currentWeights = lerp(currentWeights, targetWeights, delta * LERP_SPEED);
```

**Note:** Viseme data is only available with Azure Voice Live. OpenAI Realtime does not emit viseme events; lip sync falls back to audio amplitude-based approximation.

---

## 6. VoiceLiveSessionManager

### 6.1 Module Location

`backend/src/services/VoiceLiveSessionManager.ts` — singleton instance `voiceLiveManager`.

### 6.2 Public API

```typescript
class VoiceLiveSessionManager extends EventEmitter {
  initializeRoom(roomId, ceoUserId): Promise<void>;    // create Listener session
  teardownRoom(roomId): Promise<void>;                  // close all sessions
  relayAudio(roomId, audioBase64): void;                // relay mic audio to Listener
  triggerAgentResponse(roomId, role, instructions): Promise<void>;  // lazy session + response.create
  triggerSophiaVoice(roomId, text): Promise<void>;      // Sophia TTS announcement
  cancelAgentResponse(roomId, role): void;              // response.cancel
}
```

### 6.3 Session Lifecycle

```
Room Created (lobby):
  -> initializeRoom() -> open Listener WebSocket
  -> Agent sessions NOT created yet (lazy)

First Agent Trigger:
  -> triggerAgentResponse() -> createAgentSession() -> session.update -> response.create
  -> Session cached for reuse in subsequent triggers

Room Closed / Meeting End:
  -> teardownRoom() -> close all WebSockets, clear heartbeats
```

### 6.4 Transcript Buffering

Agent transcript text is accumulated during streaming (`response.audio_transcript.delta` and `response.text.delta`) as a fallback. If `response.done` output items are empty (which happens occasionally with OpenAI Realtime), the buffered transcript is used instead.

### 6.5 Error Handling

| Failure Scenario              | Recovery Strategy                                         |
| ----------------------------- | --------------------------------------------------------- |
| Agent session creation fails  | Emit empty `agentDone` to prevent TurnManager deadlock    |
| Listener session fails        | Degrade to text-only mode                                 |
| All sessions fail on init     | Text-only meeting (existing chat path)                    |
| WebSocket close               | Log warning (TODO: reconnection with exponential backoff) |

### 6.6 Heartbeat

Each WebSocket session sends a ping every 30 seconds to keep the connection alive.

---

## 7. VoiceLiveOrchestrator

### 7.1 Module Location

`backend/src/orchestrator/VoiceLiveOrchestrator.ts` — `wireVoiceLiveForRoom()` / `unwireVoiceLiveForRoom()`.

### 7.2 Event Wiring

`wireVoiceLiveForRoom(roomId, ceoUserId, ceoName)` sets up bidirectional event listeners:

**VoiceLive -> TurnManager:**
- `speechStarted` -> `turnManager.onSpeechStart()`
- `speechStopped` -> `turnManager.onSpeechEnd()`
- `transcript` -> `turnManager.onTranscript()`

**VoiceLive -> SignalR (streaming):**
- `agentAudioDelta` -> broadcast `agentAudioDelta`
- `agentTextDelta` -> broadcast `agentTranscriptDelta`
- `agentVisemeDelta` -> broadcast `agentVisemeDelta`

**VoiceLive -> Sophia Pipeline (on agentDone):**
1. Parse structured output via ResponseParser (3-tier strategy)
2. Broadcast clean speech text (not raw JSON) via `agentResponseDone`
3. Add to Sophia buffer (speaker, speech, keyPoints, visualHint)
4. Relay key_points to CEO monitor
5. Handle mention routing via TurnManager
6. Enqueue visual generation if visual_hint present
7. Process sophia_request tasks (search/analyze/visualize)
8. Notify TurnManager via onAgentDone()

**TurnManager -> VoiceLive:**
- `triggerAgent` -> `voiceLiveManager.triggerAgentResponse()`
- `cancelAgent` -> `voiceLiveManager.cancelAgentResponse()`

### 7.3 Visual Intent Detection

Since VoiceLive Realtime API returns plain text (not structured JSON), ResponseParser always falls to Tier 3 (fallback) where `visual_hint = null`. A keyword-based visual intent detection system compensates:

```typescript
function detectVisualIntent(userInput: string, agentSpeech?: string): VisualHint | null
```

Detection priority:
1. User input keyword match (highest priority)
2. Agent speech keyword match (fallback)
3. Generic visual request keywords -> defaults to "summary" type

Supported visual types detected by keywords: comparison, pie-chart, bar-chart, timeline, checklist, summary, architecture.

### 7.4 Idempotency & Cleanup

- `wireVoiceLiveForRoom()` is idempotent — calling twice for the same room is a no-op (prevents duplicate event listeners)
- `unwireVoiceLiveForRoom()` removes all listeners, clears tracking sets, and tears down TurnManager, VoiceLiveManager, and SophiaAgent room state
- Per-room listener tracking via `roomListeners` Map ensures no memory leaks

---

## 8. Voice Agent Prompt System

Each agent uses a compressed persona prompt for Voice Live `response.create`:

```typescript
const VOICE_PERSONA: Record<AgentRole, { identity, style, domain }> = {
  coo: {
    identity: "COO Hudson — Meeting orchestrator and execution expert.",
    style: "Direct, structured. Delegates to the right person.",
    domain: "Meeting flow, task delegation, execution plans.",
  },
  // ... other agents
};
```

The prompt is built by `buildAgentPrompt()` in TurnManager.ts, combining:
- Agent persona (identity + style + domain)
- Natural conversation rules (brief, conclusion-first, no lists)
- Current agenda
- Context from ContextBroker (recent messages, decisions)
- CEO's current input

---

## 9. Frontend Integration

### 9.1 Hooks

| Hook              | Responsibility                                               |
| ----------------- | ------------------------------------------------------------ |
| `useVoiceLive`    | WebSocket audio streaming to backend, mic toggle state       |
| `useAgentAudio`   | Agent audio playback queue with priority system (Web Audio API)|
| `useViseme`       | Viseme events -> blend shape weights for 3D lip sync         |
| `useSignalR`      | SignalR connection + SSE streaming for all real-time events   |

### 9.2 Audio Playback Strategy

Multiple agents may respond sequentially. The `useAgentAudio` hook manages:
- Current agent audio: play immediately via Web Audio API
- Next agent audio: buffer until current finishes + inter-agent gap
- Interrupted: stop current playback, clear queue
- Priority system: Sophia announcements can interrupt non-critical audio

### 9.3 SignalR Events for Voice Streaming

| SignalR Event            | Direction       | Payload                                       |
| ------------------------ | --------------- | --------------------------------------------- |
| `agentAudioDelta`        | Server->Client  | `{ role, audioBase64, format: "pcm16_24k" }`  |
| `agentTranscriptDelta`   | Server->Client  | `{ role, text, isFinal }`                     |
| `agentVisemeDelta`       | Server->Client  | `{ role, visemeId, audioOffsetMs }`            |
| `agentResponseDone`      | Server->Client  | `{ role, fullText }`                          |
| `agentTyping`            | Server->Client  | `{ agentId, agentName, isTyping }`            |

---

## 10. MVP Scope & Limitations

| Aspect                   | MVP (Current)                              | Future (v2)                          |
| ------------------------ | ------------------------------------------ | ------------------------------------ |
| Microphone               | 1 mic per room (CEO only)                  | Multi-mic per participant            |
| Agent sessions           | Lazy creation (on first trigger)           | Pre-warmed session pool              |
| Reconnection             | Log warning only                           | Exponential backoff auto-reconnect   |
| Viseme lip sync          | Azure Voice Live only                      | Amplitude fallback for OpenAI        |
| Speaker identification   | All voice input mapped to CEO              | Per-participant audio streams        |

---

## 11. File Inventory

```
backend/src/
  services/
    VoiceLiveSessionManager.ts    — WebSocket session lifecycle + dual provider support
  orchestrator/
    TurnManager.ts                — Event-driven state machine (5 states)
    VoiceLiveOrchestrator.ts      — Event wiring + Sophia pipeline + visual intent detection
  functions/
    meeting-chairman.ts           — CEO control endpoints (5 endpoints)
    meeting-voice.ts              — Audio relay WebSocket endpoint
  constants/
    turnConfig.ts                 — Timing constants (CEO_FLUSH_MS, etc.)
    agentVoices.ts                — Agent -> Azure HD Voice mapping

frontend/src/
  hooks/
    useVoiceLive.ts               — WebSocket audio streaming + mic toggle
    useAgentAudio.ts              — Agent audio playback queue (Web Audio API)
    useViseme.ts                  — Viseme event -> blend shapes
    useSignalR.ts                 — SignalR + SSE streaming
  components/
    meeting/
      ChairmanControls.tsx        — AI opinion / next agenda / pause buttons
```
