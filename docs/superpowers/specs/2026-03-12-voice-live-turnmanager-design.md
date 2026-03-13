---
version: "1.1.0"
created: "2026-03-12 22:00"
updated: "2026-03-12 23:30"
---

# Voice Live Integration + TurnManager Upgrade — Design Spec

> **For agentic workers:** Use `superpowers:writing-plans` to create implementation plan from this spec.

**Goal:** Voice Live API 7-Session 아키텍처로 에이전트별 고유 음성 + 3D 립싱크를 구현하고, TurnManager를 DialogLab 기반 지능형 오케스트레이터로 업그레이드하여 Voice + Chat 공존, Chairman 사회 권한, DM Stories 피커를 지원한다.

**Architecture:** Backend Voice Live Session Manager가 7개 WebSocket 세션(1 Listener + 6 Agent)을 관리하고, TurnManager 상태 머신이 인간 발화 시점을 판단하여 에이전트 응답을 제어한다. 기존 ContextBroker/TopicClassifier를 재활용하며, 에이전트 세션은 stateless voice+persona 엔진으로 동작한다.

**Tech Stack:** Azure Voice Live API (WebSocket), Azure HD Voices, Viseme, azure_semantic_vad, React Three Fiber (lip sync)

**References:**

- [ARCHITECTURE.md](../../ARCHITECTURE.md) — Orchestration Layer 설계 (섹션 3.3)
- [PRD.md](../../PRD.md) — DialogLab 턴테이킹, Push-to-Talk 스펙
- [TECH_SPEC.md](../../TECH_SPEC.md) — GPT Realtime API 구성
- [Azure Voice Live API Docs](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live-how-to)
- [Azure OpenAI Realtime API Reference](https://learn.microsoft.com/en-us/azure/foundry/openai/realtime-audio-reference)

---

## 1. 7-Session Architecture

### 1.1 Session Overview

| Session | Role           | turn_detection                                  | create_response | Voice                  |
| ------- | -------------- | ----------------------------------------------- | --------------- | ---------------------- |
| #0      | Listener (STT) | `azure_semantic_vad` (silence: 500ms)           | `false`         | N/A (input only)       |
| #1      | Hudson (COO)   | `none`                                          | N/A             | Guy:DragonHDLatest     |
| #2      | Amelia (CFO)   | `none`                                          | N/A             | Ava:DragonHDLatest     |
| #3      | Yusef (CMO)    | `none`                                          | N/A             | Andrew:DragonHDLatest  |
| #4      | Kelvin (CTO)   | `none`                                          | N/A             | Brian:DragonHDLatest   |
| #5      | Jonas (CDO)    | `none`                                          | N/A             | Emma:DragonHDLatest    |
| #6      | Bradley (CLO)  | `none`                                          | N/A             | Davis:DragonHDLatest   |

### 1.2 Listener Session (#0) Configuration

```json
{
  "type": "session.update",
  "session": {
    "turn_detection": {
      "type": "azure_semantic_vad",
      "silence_duration_ms": 500,
      "remove_filler_words": true,
      "languages": ["ko", "en"],
      "create_response": false
    },
    "input_audio_noise_reduction": { "type": "azure_deep_noise_suppression" },
    "input_audio_echo_cancellation": { "type": "server_echo_cancellation" },
    "input_audio_transcription": { "model": "azure-speech", "language": "ko" },
    "modalities": ["text"]
  }
}
```

**Key events emitted by Listener:**

| Server Event                                        | TurnManager Handler            |
| --------------------------------------------------- | ------------------------------ |
| `input_audio_buffer.speech_started`                 | `onSpeechStart(userId)`        |
| `input_audio_buffer.speech_stopped`                 | `onSpeechEnd(userId)`          |
| `conversation.item.input_audio_transcription.completed` | `onTranscript(userId, text)` |

### 1.3 Agent Session (#1-6) Configuration

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

**How TurnManager triggers an agent response:**

```json
{
  "type": "response.create",
  "response": {
    "conversation": "none",
    "modalities": ["audio", "text"],
    "instructions": "<persona> + <context from ContextBroker> + <current human messages>"
  }
}
```

Each `response.create` with `conversation: "none"` produces an out-of-band response that does not append to the session's conversation history. The session still maintains its own state internally. To ensure true statelessness, always send `conversation: "none"` on every `response.create`, and never commit audio to the agent session's input buffer. All application-level state lives in ContextBroker.

**Events returned from agent session:**

| Server Event                              | Client Handler                        |
| ----------------------------------------- | ------------------------------------- |
| `response.audio.delta`                    | Audio playback (speaker)              |
| `response.audio_transcript.delta`         | Chat bubble text stream               |
| `response.animation_viseme.delta`         | 3D avatar lip sync (viseme_id)        |
| `response.done`                           | TurnManager.onAgentDone(agentRole)    |

---

## 2. TurnManager State Machine

### 2.1 States

```
IDLE ──→ HEARING ──→ ROUTING ──→ SPEAKING ──→ IDLE
  ↑                                  │
  └──────── (interrupt) ─────────────┘
```

| State      | Description                                             | Duration         |
| ---------- | ------------------------------------------------------- | ---------------- |
| `IDLE`     | No human input, no agent responding                     | Indefinite       |
| `HEARING`  | Collecting human inputs (voice transcripts + chat)      | Until flush      |
| `ROUTING`  | Determining which agents respond, in what order         | < 100ms          |
| `SPEAKING` | Agent(s) responding sequentially with 1.5s gaps         | Until all done   |

### 2.2 State Transitions & Speech Timing Logic

```typescript
interface TurnManagerState {
  state: "idle" | "hearing" | "routing" | "speaking";
  inputBuffer: BufferedMessage[];    // collected human messages
  flushTimer: NodeJS.Timeout | null; // quiet window timer
  agentQueue: AgentTurn[];           // ordered agent response queue
  activeAgent: AgentRole | null;     // currently speaking agent
  interruptFlag: boolean;            // human interrupted during SPEAKING
}

interface BufferedMessage {
  userId: string;
  userName: string;
  isChairman: boolean;
  source: "voice" | "chat";
  content: string;
  timestamp: number;
}
```

### 2.3 Event Handlers (Speech Timing)

#### `onSpeechStart(userId)`
Human started speaking (voice).

```
if state === IDLE:
  → transition to HEARING
  → clear flushTimer (don't flush yet, human is still talking)

if state === HEARING:
  → clear flushTimer (more input coming)

if state === SPEAKING:
  → set interruptFlag = true
  → cancel current agent response (response.cancel)
  → transition to HEARING
```

#### `onSpeechEnd(userId)`
Human stopped speaking (voice). Transcription will follow.

```
if state === HEARING:
  → start flushTimer based on speaker role:
     Chairman: 300ms (almost instant — 사회자 발언은 즉시 반응)
     Member:   2000ms (wait for additional inputs)
```

#### `onTranscript(userId, text)`
Transcription completed for a voice utterance.

```
if state === HEARING:
  → add to inputBuffer: { userId, source: "voice", content: text, ... }
  → if flushTimer not running, start it (same timing as onSpeechEnd)
```

#### `onChatMessage(userId, text, isChairman)`
Chat message received via SignalR.

```
if state === IDLE:
  → transition to HEARING

if state === HEARING:
  → add to inputBuffer: { userId, source: "chat", content: text, ... }
  → reset flushTimer:
     Chairman: 300ms
     Member:   2000ms

if state === SPEAKING:
  → add to inputBuffer (queue for next turn)
  → do NOT interrupt (chat doesn't interrupt unlike voice)
```

#### `onFlush()` — flush timer expired
Quiet window elapsed, time to trigger agents.

```
transition to ROUTING

// 1. Merge buffered messages into a single context block
combinedInput = inputBuffer.map(m => `[${m.userName}]: ${m.content}`).join("\n")

// 2. Determine agents via existing TopicClassifier + Priority Queue
mentions = parseMentions(combinedInput)
{ primaryAgent, secondaryAgents } = classifyTopic(combinedInput)
agentQueue = determineAgentOrder(combinedInput, mentions, primaryAgent, secondaryAgents)

// 3. Save to ContextBroker FIRST (before routing, so agents see latest context)
for each buffered message:
  addMessage(roomId, message)

// 4. Apply DialogLab constraints
agentQueue = agentQueue.slice(0, MAX_AGENTS_PER_TURN)  // default: 2

// 5. Clear buffer
inputBuffer = []

// 6. Trigger first agent
transition to SPEAKING
triggerNextAgent()
```

#### `triggerNextAgent()`
Send response.create to the next agent in queue.

```
if agentQueue is empty:
  → transition to IDLE
  → return

nextAgent = agentQueue.shift()
activeAgent = nextAgent.role
context = ContextBroker.getContextForAgent(roomId, nextAgent.role)

// Send to agent's Voice Live session
send to Session[nextAgent.role]:
  {
    type: "response.create",
    response: {
      conversation: "none",
      modalities: ["audio", "text"],
      instructions: buildPrompt(nextAgent.role, context, combinedInput)
    }
  }
```

#### `onAgentDone(agentRole)`
Agent finished responding.

```
// Save agent response to ContextBroker
addMessage(roomId, agentResponse)

// A2A follow-up check
followUpRole = checkFollowUp(agentResponse)
if followUpRole && agentQueue.length < 2:
  agentQueue.push({ role: followUpRole, priority: 3 })

// Wait 1.5s then trigger next agent
if agentQueue is not empty:
  setTimeout(triggerNextAgent, 1500)
else:
  activeAgent = null
  transition to IDLE
```

### 2.4 Interrupt Handling

```
SPEAKING 상태에서 Human이 음성으로 끼어듦 (speech_started):

  1. interruptFlag = true
  2. 현재 에이전트 세션에 response.cancel 전송
  3. 남은 agentQueue 클리어
  4. inputBuffer 클리어 (인터럽트 = 새 주제, 이전 버퍼 무관)
  5. HEARING으로 전환
  6. 새로운 Human 입력 수집 시작

SPEAKING 상태에서 Human이 채팅을 보냄:
  → 인터럽트 하지 않음 (채팅은 비침습적)
  → inputBuffer에 추가하여 다음 턴에서 처리

SPEAKING 상태에서 긴급 리스크 감지 (InterruptHandler):
  → 현재 에이전트 응답 완료 대기 (또는 즉시 중단)
  → 긴급 에이전트(CLO/CFO) 세션에 즉시 response.create
  → 긴급 인터럽트는 2-agent 제한 무시
```

### 2.5 Chairman Priority Rules

| Chairman Action            | TurnManager Behavior                                |
| -------------------------- | --------------------------------------------------- |
| 음성 발화 완료             | 300ms flush (즉시 AI 트리거)                        |
| 채팅 메시지 전송           | 300ms flush (즉시 AI 트리거)                        |
| "AI 의견" 버튼 클릭        | 즉시 flush (0ms), 모든 에이전트 대상 routing         |
| "다음 안건" 버튼 클릭      | Phase 전환 + ContextBroker agenda 업데이트            |
| "AI 일시정지" 토글         | SPEAKING → 즉시 중단, 이후 flush 무시                |
| "@CFO" 멘션 발화           | 해당 에이전트만 우선 트리거 (P2 priority)             |

---

## 3. Voice + Chat Coexistence

### 3.1 Frontend: Mic Toggle

InputArea에 마이크 on/off 토글 버튼 추가:

```
┌─────────────────────────────────────────────────────┐
│  🎤  │  안건을 입력하세요...                   │ 전송 │
│ (on) │                                         │      │
└──────┴─────────────────────────────────────────┴──────┘
  ↑
  마이크 토글: ON이면 Space PTT 활성 + WebSocket 오디오 스트리밍
              OFF이면 텍스트 전용 (오디오 미연결)
```

- Mic ON: `getUserMedia()` → 오디오 캡처 → WebSocket으로 백엔드에 전송 → Listener 세션 릴레이
- Mic OFF: 텍스트 입력만 사용 (마이크 없는 환경)
- 토글 상태는 localStorage에 저장 (다음 접속 시 유지)

### 3.2 Data Flow

```
Voice Input Path:
  Mic → getUserMedia() → AudioWorklet (PCM16 변환)
  → WebSocket → Backend
  → Backend relays via input_audio_buffer.append → Listener Session #0
  → azure_semantic_vad → speech_started/stopped events
  → input_audio_transcription → text
  → TurnManager.onTranscript()

Chat Input Path:
  Keyboard → InputArea → Enter → SignalR/REST
  → TurnManager.onChatMessage()

Both paths → TurnManager.inputBuffer → onFlush() → Agent Sessions
```

> **Note:** Voice Live API는 WebSocket 전용 (`wss://` endpoint). 브라우저에서 직접 WebRTC로 연결할 수 없으므로, 백엔드가 오디오를 릴레이하는 구조를 사용한다. 향후 Azure OpenAI Realtime API의 WebRTC 엔드포인트를 Listener 세션에만 적용하는 하이브리드 구조도 고려 가능.

### 3.3 Message Type in Context

ContextBroker에 저장 시 source 구분. 기존 `shared/types.ts`의 `isVoiceInput?: boolean`을 재활용:

```typescript
interface Message {
  // ... existing fields
  isVoiceInput?: boolean;  // existing field — true for voice, false/undefined for chat
}
```

에이전트가 "김대표님이 말씀하신..." vs "채팅으로 보내신..."을 구분할 수 있도록. 기존 `isVoiceInput` 필드를 그대로 사용하여 하위 호환성 유지.

---

## 4. Chairman Controls UI

### 4.1 Control Bar (Chairman Only)

idle overlay 및 meeting 진행 중 Chairman에게만 표시:

```
┌──────────────────────────────────────────────────┐
│  [🤖 AI 의견]  [⏭ 다음 안건]  [⏸ AI 일시정지]  │
└──────────────────────────────────────────────────┘
```

- `isChairman === true`인 경우에만 렌더링
- 각 버튼은 REST API → TurnManager 이벤트 발행

### 4.2 API Endpoints

| Endpoint                          | Method | Body                    | TurnManager Action       |
| --------------------------------- | ------ | ----------------------- | ------------------------ |
| `/api/meeting/request-ai-opinion` | POST   | `{ roomId }`           | 즉시 flush (전체 routing) |
| `/api/meeting/next-agenda`        | POST   | `{ roomId, agenda }`   | Phase 전환 + 안건 변경   |
| `/api/meeting/toggle-ai-pause`    | POST   | `{ roomId, paused }`   | AI 응답 일시정지/재개    |

---

## 5. DM Stories Picker

### 5.1 Design

현재 DmAgentPicker (flat chips) → Instagram Stories 스타일 원형 아바타:

```
┌────────────────────────────────────────────────────┐
│  대화할 임원을 선택하세요                           │
│                                                    │
│   ┌──┐   ┌──┐   ┌──┐   ┌──┐   ┌──┐   ┌──┐       │
│   │🟣│   │⚫│   │⚫│   │⚫│   │⚫│   │⚫│       │
│   │😎│   │👩│   │👨│   │🧑│   │👱│   │👨│       │
│   │🟣│   │⚫│   │⚫│   │⚫│   │⚫│   │⚫│       │
│   └──┘   └──┘   └──┘   └──┘   └──┘   └──┘       │
│  Hudson  Amelia  Yusef  Kelvin  Jonas  Bradley    │
│   COO     CFO    CMO     CTO    CDO     CLO       │
│                                                    │
└────────────────────────────────────────────────────┘
```

### 5.2 Component Structure

```
DmStoriesPicker (replaces DmAgentPicker)
├─ AgentStoryAvatar (×6)
│  ├─ Circular frame (64×64px)
│  ├─ Agent avatar image (static render from RPM GLB or pre-captured)
│  ├─ Ring: selected = agent color glow animation, unselected = neutral-700
│  └─ Label: name + role
└─ Horizontal scroll container
```

### 5.3 Avatar Images

Pre-render each RPM avatar face as a static PNG (build-time or first-load):

- Option A: R3F `<Canvas>` offscreen render → `toDataURL()` → cache as base64
- Option B: Pre-exported PNGs in `/public/avatars/hudson-face.png` etc.

Option B preferred for performance (no runtime 3D rendering for picker).

---

## 6. Viseme → 3D Lip Sync

### 6.1 Viseme Pipeline

```
Voice Live Agent Session
  → response.animation_viseme.delta { viseme_id, audio_offset_ms }
  → WebSocket → Client
  → VisemeMapper.getBlendShapes(viseme_id)
  → RPMAgentAvatar useFrame() → mesh.morphTargetInfluences update
```

### 6.2 Viseme ID → BlendShape Mapping

Microsoft viseme IDs (0-21) map to ARKit-compatible blend shapes used by RPM avatars:

| Viseme ID | Phoneme        | Key BlendShapes                             |
| --------- | -------------- | ------------------------------------------- |
| 0         | Silence        | all → 0                                     |
| 1         | æ, ə, ʌ       | jawOpen: 0.3, mouthFunnel: 0.1             |
| 2         | ɑ              | jawOpen: 0.6, mouthOpen: 0.5               |
| 3         | ɔ              | jawOpen: 0.4, mouthFunnel: 0.4             |
| 4         | ɛ, ʊ           | jawOpen: 0.3, mouthSmile: 0.2              |
| 6         | i              | jawOpen: 0.1, mouthSmile: 0.5              |
| 7         | u              | jawOpen: 0.2, mouthFunnel: 0.6             |
| 11        | f, v           | mouthFunnel: 0.3, mouthLowerDown: 0.2      |
| 15        | p, b, m        | mouthClose: 0.8, jawOpen: 0.05             |
| 18        | t, d, n        | jawOpen: 0.15, tongueOut: 0.3              |
| 20        | k, g           | jawOpen: 0.4, mouthOpen: 0.3               |
| 21        | default close  | all → 0, mouthClose: 0.1                   |

The table above shows representative entries. The remaining 11 IDs (5, 8-10, 12-14, 16-17, 19) follow the same pattern and must be defined during implementation based on the [Microsoft viseme-to-phoneme reference](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-speech-synthesis-viseme). The full 22-entry mapping will be defined in `frontend/src/utils/visemeMap.ts`.

### 6.3 Interpolation

Viseme transitions should be smooth, not abrupt:

```typescript
// In RPMAgentAvatar useFrame():
const LERP_SPEED = 12; // per second
currentWeights = lerp(currentWeights, targetWeights, delta * LERP_SPEED);
mesh.morphTargetInfluences[idx] = currentWeights[idx];
```

Target weights update on each `viseme.delta` event. The lerp provides smooth mouth movement.

---

## 7. Voice Live Session Manager

### 7.1 Module: `backend/src/services/VoiceLiveSessionManager.ts`

Manages lifecycle of all 7 WebSocket sessions:

```typescript
interface VoiceLiveSessionManager {
  // Lifecycle
  initializeRoom(roomId: string): Promise<void>;  // create 7 sessions
  teardownRoom(roomId: string): Promise<void>;     // close all sessions

  // Listener
  getListenerSession(roomId: string): WebSocket;

  // Agent
  triggerAgentResponse(roomId: string, role: AgentRole, instructions: string): void;
  cancelAgentResponse(roomId: string, role: AgentRole): void;

  // Events (emitted to TurnManager)
  on("speechStarted", handler: (roomId, userId) => void): void;
  on("speechStopped", handler: (roomId, userId) => void): void;
  on("transcript", handler: (roomId, userId, text) => void): void;
  on("agentAudioDelta", handler: (roomId, role, audioChunk) => void): void;
  on("agentTextDelta", handler: (roomId, role, text) => void): void;
  on("agentVisemeDelta", handler: (roomId, role, visemeId, offsetMs) => void): void;
  on("agentDone", handler: (roomId, role, fullText) => void): void;
}
```

### 7.2 Session Lifecycle

```
Room Created (lobby)
  → VoiceLiveSessionManager.initializeRoom(roomId)
  → Open 7 WebSocket connections to Voice Live API
  → Send session.update to each with appropriate config
  → Sessions idle, awaiting input

Meeting Active
  → Listener receives audio from Chairman via backend WebSocket relay
  → Agent sessions receive response.create from TurnManager

Room Closed / 30min timeout
  → VoiceLiveSessionManager.teardownRoom(roomId)
  → Close all 7 WebSocket connections
```

### 7.3 Audio Relay (WebSocket)

Voice Live API는 WebSocket(`wss://`) 전용이므로, 브라우저 오디오는 백엔드를 통해 릴레이한다:

```
Browser getUserMedia() → AudioWorklet (Float32 → PCM16 변환, 24kHz mono)
  → WebSocket (SignalR binary channel or dedicated WS) → Backend
  → Backend: input_audio_buffer.append → Listener Session #0 WebSocket
  → Listener Session: azure_semantic_vad → events → TurnManager
```

**Audio format:** PCM16, 24kHz, mono (Voice Live API 요구사항)

**Latency budget:** getUserMedia → PCM변환 (~5ms) → WS전송 (~10-50ms) → Backend relay (~5ms) = ~20-60ms total. VAD 감지에 충분.

### 7.4 Error Handling & Reconnection

| Failure Scenario                   | Recovery Strategy                                      |
| ---------------------------------- | ------------------------------------------------------ |
| Agent session (#1-6) dropped       | Auto-reconnect with exponential backoff (1s, 2s, 4s).  |
|                                    | During reconnection, agent is chat-only (text fallback) |
| Listener session (#0) dropped      | **Critical path.** Immediate reconnect (max 3 retries). |
|                                    | If failed, fall back to chat-only mode for all users    |
| All sessions fail on init          | Degrade to text-only meeting (existing chat path)       |
| Azure rate limit / quota exceeded  | Log warning, degrade to text-only, notify Chairman      |

**Heartbeat:** Each WebSocket session sends ping every 30s. If no pong in 10s, trigger reconnection.

### 7.5 Speaker Identification (MVP)

MVP에서는 **1 mic per room** (Chairman 전용). 따라서 모든 음성 입력은 Chairman으로 간주:
- Listener 세션의 `speech_started`/`speech_stopped` 이벤트에 userId가 없으므로, Chairman의 userId를 자동 매핑
- 추가 인간 참여자는 채팅으로만 참여

**v2 (Multi-mic):** 각 인간 참여자별 별도 오디오 스트림 → 세션 기반 speaker identification

---

## 8. Frontend Integration

### 8.1 New Hooks

| Hook                    | Responsibility                                              |
| ----------------------- | ----------------------------------------------------------- |
| `useVoiceLive`          | WebSocket audio streaming to Listener, mic toggle state     |
| `useAgentAudio`         | Receive agent audio streams via SignalR, manage playback     |
| `useViseme`             | Receive viseme events via SignalR, provide blend shape weights |

### 8.2 Modified Components

| Component               | Changes                                              |
| ----------------------- | ---------------------------------------------------- |
| `InputArea`             | Add mic toggle button, integrate useVoiceLive         |
| `RPMAgentAvatar`        | Add viseme-driven lip sync in useFrame               |
| `DmAgentPicker`         | Replace with DmStoriesPicker (Instagram Stories UI)   |
| `App.tsx (MeetingRoom)` | Add Chairman controls bar, wire useAgentAudio         |
| `ChatOverlay`           | Show voice/chat source indicator on messages          |

### 8.3 Audio Playback Strategy

Multiple agents may respond sequentially. Audio must be queued:

```
Agent audio arrives → AudioPlaybackQueue
  ├─ Current agent audio: play immediately
  ├─ Next agent audio: buffer until current finishes + 1.5s gap
  └─ Interrupted: stop current, clear queue
```

Use Web Audio API (`AudioContext`) for low-latency playback of PCM16 chunks (24kHz, mono).

### 8.4 SignalR Events for Voice Streaming

New SignalR events for delivering audio/viseme data from backend to frontend:

| SignalR Event          | Direction        | Payload                                        | Purpose                |
| ---------------------- | ---------------- | ---------------------------------------------- | ---------------------- |
| `agentAudioDelta`      | Server → Client  | `{ role, audioBase64, format: "pcm16_24k" }`  | Agent voice audio      |
| `agentTranscriptDelta` | Server → Client  | `{ role, text, isFinal: boolean }`             | Agent speech text      |
| `agentVisemeDelta`     | Server → Client  | `{ role, visemeId, audioOffsetMs }`            | Lip sync data          |
| `agentResponseDone`    | Server → Client  | `{ role, fullText }`                           | Agent finished talking |
| `voiceAudioChunk`      | Client → Server  | `{ roomId, audioBase64 }`                      | Mic audio relay        |

---

## 9. Strings (i18n)

New keys for `src/constants/strings.ts`:

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
dm: {
  selectAgent: "대화할 임원을 선택하세요",
},
```

---

## 10. Cost & Limits

| Resource                         | Limit                | Hackathon Impact          |
| -------------------------------- | -------------------- | ------------------------- |
| Voice Live session duration      | 30 min per session   | OK for demo               |
| Concurrent sessions per room     | 7                    | Within Azure limits       |
| Audio input (Listener)           | 1 stream             | 1 mic at a time (MVP)     |
| Azure HD Voice pricing           | Per character         | Demo budget OK            |
| WebSocket audio bandwidth        | ~48kbps (PCM16 24kHz) | Acceptable for MVP       |

### MVP Scope Limitation

- **MVP: 1 mic per room** — Chairman의 마이크만 Listener에 연결. 추가 인간은 채팅으로 참여.
- **v2: Multi-mic** — 각 인간 참여자가 별도 오디오 스트림으로 Listener에 연결 (서버측 믹싱 필요).

---

## 11. File Structure (New & Modified)

```
backend/src/
  services/
    VoiceLiveSessionManager.ts    [NEW] 7-session lifecycle manager + reconnection
  orchestrator/
    TurnManager.ts                [REWRITE] Event-driven state machine (replaces sync processMessage)
    InterruptHandler.ts           [NEW] Urgent risk detection
  functions/
    message.ts                    [MODIFY] Route to TurnManager.onChatMessage() instead of processMessage()
    meeting-voice.ts              [NEW] Audio relay WebSocket endpoint
    meeting-chairman.ts           [NEW] Chairman control endpoints

frontend/src/
  hooks/
    useVoiceLive.ts               [NEW] WebSocket audio streaming + mic toggle
    useAgentAudio.ts              [NEW] Agent audio playback queue (Web Audio API)
    useViseme.ts                  [NEW] Viseme event → blend shapes
  components/
    input/
      MicToggle.tsx               [NEW] Mic on/off toggle button
      InputArea.tsx               [MODIFY] Integrate MicToggle
    meeting/
      DmStoriesPicker.tsx         [NEW] Instagram Stories-style agent picker
      DmAgentPicker.tsx           [DELETE] Replaced by DmStoriesPicker
      ChairmanControls.tsx        [NEW] AI opinion/next agenda/pause buttons
    meeting3d/
      RPMAgentAvatar.tsx          [MODIFY] Add viseme lip sync
  utils/
    visemeMap.ts                  [NEW] Viseme ID → BlendShape weight table (full 22-entry)
  constants/
    strings.ts                    [MODIFY] Add chairman/mic/dm keys
    agentVoices.ts                [NEW] Agent → Azure HD Voice mapping
```

### Migration: TurnManager Rewrite

The current `TurnManager.ts` is a synchronous `processMessage()` function. The new TurnManager is a fundamentally different event-driven state machine. This is a **complete rewrite**, not a modification:

1. **Old API:** `processMessage(roomId, message) → AgentResponse[]` (synchronous request-response)
2. **New API:** Event handlers — `onSpeechStart()`, `onSpeechEnd()`, `onTranscript()`, `onChatMessage()`, `onFlush()`, `onAgentDone()`
3. **Callers to update:** `backend/src/functions/message.ts` must route incoming chat messages to `TurnManager.onChatMessage()` instead of calling `processMessage()`
4. **Reused as-is:** `TopicClassifier.ts`, `ContextBroker.ts` — called from `onFlush()` and `triggerNextAgent()`
5. **Text-only fallback:** When mic is off, the entire voice path is skipped. Chat messages still flow through `onChatMessage()` → `onFlush()` → agent text responses (no audio)
