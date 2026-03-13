---
version: "1.1.0"
created: "2026-03-14 09:00"
updated: "2026-03-14 18:30"
---

# Avatar Presence System

## Overview

BizRoom.ai seats six AI executives and up to three human participants around a single conference table rendered in real-time 3D (React Three Fiber). The challenge is not animation per se -- it is *presence*: making each avatar feel like a participant rather than a prop. Every behavior described below is designed to stay below the threshold of conscious notice while collectively producing the impression that the room is occupied by attentive colleagues.

Ready Player Me GLB models share a Mixamo skeleton. Bone deltas for a seated posture are composed via quaternion multiplication on top of the rest pose, preserving joint chains without overwriting bind data. Each avatar is instanced via `SkeletonUtils.clone`, allowing independent skeletal state per seat.

---

## Presence Behaviors

| Behavior                  | Mechanism                                             | Status           | Notes                                                                                         |
| ------------------------- | ----------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------- |
| Seated posture            | Quaternion deltas on 20 bones (hips through hands)    | Active           | Composed multiplicatively -- never overwrites rest quaternion                                  |
| Gaze tracking             | Head + neck bone rotation toward speaker's seat       | Active           | Yaw/pitch clamped, split 60/40 head/neck for organic two-joint look                           |
| Idle breathing            | Sine-wave Y-offset on group node (1.5 Hz, 3 mm)      | Active           | Imperceptible in isolation, noticeable only when all avatars breathe slightly out of phase     |
| Eye blink                 | Morph target pulse (~every 3-5 s, 30 ms close)        | Active           | Phase-offset per avatar via elapsed time modulus                                               |
| Speaking ring             | Pulsing floor ring beneath active speaker             | Active           | Color-matched to agent identity; scale oscillation at 4 Hz                                    |
| Thinking dots             | Three spheres with staggered sine-wave Y animation    | Active           | Shown only when agent is thinking but not yet speaking                                        |
| Name badge                | Billboard `<Text>` with background pill + border glow | Active           | Highlights on speak; agent color coding per design system                                     |
| Viseme lip-sync           | 22-viseme table mapped to 12 ARKit blend shapes       | Connected        | SignalR `agentVisemeDelta` -> `useViseme` -> morph target weights at 60 fps                    |
| Audio playback            | PCM16 24 kHz chunks queued via Web Audio API          | Connected        | SignalR `agentAudioDelta` -> `useAgentAudio` -> `AudioBufferSourceNode` chain                  |
| Fallback jaw animation    | Dual-sine jaw oscillation (8 Hz + 13 Hz harmonics)    | Active (default) | Engages automatically when no viseme data is present; lerp-smoothed                           |
| Subtle smile              | `mouthSmileLeft/Right` morph targets                  | Active (default) | Slight upturn while speaking (0.2), resting micro-smile (0.05) -- part of fallback path       |
| Hand micro-lift           | Procedural UpperArm/ForeArm rotation (speaking)       | Implemented      | Subtle forearm lift during speech emphasis; amplitude < 8 degrees                             |
| Finger fidget             | Procedural finger bone rotation (speaking)             | Implemented      | Stochastic finger curls on speaking beats; per-agent seed avoids synchronization               |
| Head nod                  | Procedural head pitch oscillation (listening)          | Implemented      | Micro-nods at ~0.6 Hz while another agent speaks; pitch < 5 degrees                          |
| Posture shift             | Procedural spine/hip rotation (idle)                   | Implemented      | Slow weight-shift every 8-15 s; roll < 3 degrees; breaks static symmetry                     |

---

## Viseme Pipeline Architecture

The pipeline connects backend speech synthesis to per-phoneme mouth articulation on the 3D avatar, traversing five stages without intermediate state management overhead.

```
Azure OpenAI TTS (backend)
  |
  v
SignalR hub event: agentVisemeDelta { role, visemeId }
  |
  v
useSignalR handler -> useViseme.feedViseme(role, visemeId)
  |   Maps visemeId (0-21) to BlendShapeWeights via VISEME_MAP lookup table
  |   Result stored in a per-agent Map<AgentRole, BlendShapeWeights> (ref, not state)
  v
MeetingRoom3D passes getVisemeWeights(role) to RPMAgentAvatar
  |
  v
useFrame (60 fps): lerpWeight(current, target, delta)
  |   Each of the 12 morph target channels is independently interpolated
  |   VISEME_LERP_SPEED = 12 (per-second rate) balances responsiveness vs. jitter
  v
SkinnedMesh.morphTargetInfluences[] updated in-place
```

### The 22-Viseme Table

Microsoft's viseme specification defines 22 mouth shapes covering the full phonetic space of English speech. Each viseme ID maps to a weighted combination of ARKit-compatible blend shape channels:

- **Bilabial stops** (ID 15: p/b/m) -- `mouthClose: 0.8` with minimal jaw opening
- **Open vowels** (ID 2: open-a) -- `jawOpen: 0.6, mouthOpen: 0.5`
- **Rounded vowels** (ID 7: u) -- `mouthFunnel: 0.6, mouthPucker: 0.4`
- **Silence** (ID 0) -- all weights zero, allowing smooth return to neutral

Bilateral shapes (smile, lower-down, stretch) are always applied symmetrically to both left and right channels, avoiding asymmetric artifacts that would break the illusion of natural speech.

### Smooth Interpolation

Raw viseme transitions would produce jarring jumps between mouth shapes. The `lerpWeight` function applies exponential smoothing:

```
next = current + (target - current) * min(1, deltaTime * 12)
```

At 60 fps this yields a ~0.8 blend factor per frame -- fast enough to track rapid consonant clusters while soft enough to eliminate stutter on network jitter.

### Fallback Animation

When no viseme data is available (no backend audio synthesis, network interruption, or text-only mode), the avatar falls back to a dual-frequency sine-wave jaw animation:

```
jawOpen = 0.15 + sin(t * 8) * 0.12 + sin(t * 13) * 0.06
```

The 8 Hz and 13 Hz harmonics produce quasi-random mouth movement that avoids the mechanical regularity of a single oscillator. Combined with a slight smile offset (`mouthSmileLeft/Right: 0.2`), the effect reads as conversational speech without being phonetically accurate. This path activates transparently -- the avatar always appears to speak, regardless of pipeline state.

---

## Design Philosophy

### Restraint as a Feature

The uncanny valley is not crossed by adding more animation -- it is crossed by adding the wrong amount. Every parameter in this system is deliberately understated:

- Breathing amplitude is 3 millimeters. Enough to register subconsciously; not enough to notice.
- Gaze tracking splits rotation across two joints (neck 40%, head 60%) to avoid the mechanical snap of single-pivot look-at.
- Viseme weights are mapped conservatively -- `jawOpen` peaks at 0.6 even for the widest vowel. Real human jaw range is closer to 1.0, but at screen distance the reduced range reads as natural.
- Blink duration is a single frame at 30 fps equivalent (~33 ms). Longer blinks feel drowsy; shorter ones feel twitchy.

### The Sum of Subtleties

No single behavior in this list is impressive in isolation. The design thesis is that presence emerges from the *combination* of small, overlapping signals:

- An avatar breathes, blinks, tracks the speaker with its gaze, and moves its mouth in approximate sync with speech.
- None of these behaviors demand attention. Together, they produce the sense that six people are in the room.

This is the difference between a character and a mannequin.

---

## Performance Considerations

The 3D scene renders six RPM avatars, each with a full Mixamo skeleton and morph target mesh, at a target of 60 fps. Several architectural decisions keep the frame budget viable:

| Technique                              | Impact                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------- |
| `SkeletonUtils.clone` per avatar       | Shares GPU geometry; only bone transforms and morph influences differ per instance  |
| `useRef` for viseme weight map         | Zero React re-renders on viseme updates -- morph targets are mutated in `useFrame`  |
| `memo` on `RPMAgentAvatar`             | Prevents re-render cascade when unrelated state changes (e.g., chat messages)       |
| `frustumCulled = false`                | Prevents popping when camera orbits behind an avatar briefly                        |
| Single `useFrame` per avatar           | All per-frame work (morph targets, gaze, breathing) in one callback -- no stacking  |
| `ContactShadows` with `frames={1}`     | Baked once on mount; no per-frame shadow recalculation                              |
| Static sub-scenes memoized             | Room environment and table geometry wrapped in `memo()` -- rendered once            |
| Shadow map at 256x256                  | Sufficient for ambient shadows at distance; avoids GPU fill-rate pressure           |
| `dpr={1}`                              | Renders at native pixel ratio 1.0 to maintain frame budget on lower-end hardware    |

Morph target updates happen via direct array index writes to `morphTargetInfluences[]`, bypassing Three.js setter overhead. The blend shape key-to-index mapping is resolved once during scene traversal (`useMemo` on GLB load) and cached for the lifetime of the component.

---

## Micro-Gesture System

The micro-gesture system extends the static seated posture with procedural, state-driven bone animations. No motion capture data is required -- all movement is generated at runtime from parameterized sine waves and noise functions, composed additively on top of the existing quaternion-delta sitting pose.

### State Machine

Each avatar evaluates one of three gesture states per frame, determined by orchestrator events:

| State       | Trigger                                      | Active Bone Targets                     | Typical Duration |
| ----------- | -------------------------------------------- | --------------------------------------- | ---------------- |
| Speaking    | Agent is the current `speakingAgent`         | UpperArm, ForeArm, Fingers, Head        | Until turn ends  |
| Listening   | Another agent is speaking                    | Head, Neck, Spine (upper)               | Continuous       |
| Idle        | No agent is speaking or during pause         | Spine, Hips                             | Continuous       |

State transitions use the same `lerp` smoothing as viseme interpolation (rate = 8/s), preventing abrupt pose snaps when turn ownership changes.

### Design Constraints

The cardinal rule: **all rotations remain below 10 degrees**. Larger movements compete with speech content for the viewer's attention and risk crossing into uncanny territory. Specific limits:

- **Hand micro-lift** (speaking): UpperArm pitch delta 4-8 degrees, ForeArm follow-through 3-5 degrees. Triggered stochastically on speech emphasis beats, not continuously.
- **Finger fidget** (speaking): Individual finger bone curls of 2-6 degrees, randomized per bone. A seeded PRNG per agent ensures no two avatars fidget in unison.
- **Head nod** (listening): Pitch oscillation at ~0.6 Hz, amplitude 3-5 degrees. Mimics the unconscious agreement nod observed in active listeners.
- **Posture shift** (idle): Slow spine roll (< 3 degrees) and hip sway at intervals of 8-15 seconds. Breaks the static symmetry that makes idle avatars feel lifeless.

### Per-Agent Random Seed

Each agent is assigned a deterministic seed derived from their role index. This seed offsets the phase and frequency of all procedural oscillators, producing asynchronous movement across the table. The effect is subtle but critical -- synchronized gestures read as robotic; desynchronized gestures read as individual.

### Bone Targets

The gesture system operates on five bone groups within the Mixamo skeleton hierarchy:

```
Spine2 (upper torso lean, posture shift)
  |
  +-- Neck -> Head (nod, gaze micro-adjustments)
  |
  +-- LeftShoulder -> LeftArm -> LeftForeArm -> LeftHand -> Fingers
  +-- RightShoulder -> RightArm -> RightForeArm -> RightHand -> Fingers
```

All gesture rotations are composed via quaternion multiplication on the existing seated-pose deltas, preserving the base posture. The additive composition means gestures can be layered, blended, and removed without side effects on other animation channels.

### Future Extensions

- **Emphasis gestures** -- hand lifts driven by `key_points[]` in `StructuredAgentOutput`
- **Lean-in** -- forward torso tilt when an agent is about to speak, cued by `TurnManager` priority queue transitions
- **Steepled fingers** -- contemplative pose during extended thinking phases

These would follow the same philosophy: small, infrequent, and never competing with speech for the viewer's attention.

---

## Meeting Lifecycle

The meeting session is not purely a real-time conversation loop -- it has a defined lifecycle with a structured teardown phase that triggers backend artifact generation.

When the chairman ends a meeting via the `POST /api/meeting/end` endpoint, the backend orchestrates the following pipeline:

1. **COO closing statement** -- Hudson delivers a brief summary based on the accumulated `ContextBroker` state.
2. **Meeting minutes generation** -- `generateMeetingMinutesGPT()` synthesizes the full conversation history into a structured summary (decisions, action items, key discussion points).
3. **Artifact generation** -- `ArtifactGenerator` produces downloadable deliverables:
   - **PowerPoint** (pptxgenjs) -- executive summary deck with per-agent contribution slides.
   - **Excel** (exceljs) -- structured data export of action items, financials discussed, and timeline commitments.
4. **OneDrive upload** -- artifacts are persisted to the team's OneDrive folder via Microsoft Graph API.
5. **Planner task creation** -- action items extracted from the minutes are pushed to Microsoft Planner as assignable tasks.
6. **Client notification** -- the `artifactsReady` SignalR event broadcasts download URLs and metadata to all connected participants.

This pipeline runs asynchronously after the meeting-end signal. The frontend receives artifact data through the existing `onArtifactsReady` callback and surfaces download links in the UI. The 3D scene transitions to a closing state, and the meeting phase advances to `closing` then `idle`.
