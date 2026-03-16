---
version: "2.0.0"
created: "2026-03-14 03:20"
updated: "2026-03-16 14:00"
---

# BizRoom.ai E2E Test Design — Hackathon Judge Perspective

**Goal:** Validate the complete user journey from lobby entry through AI-powered meeting interactions, Sophia visual generation, and BigScreen rendering. Tests are designed to mirror what a hackathon judge would experience during a live demo.

**Framework:** Playwright
**Test Location:** `E2ETest/tests/sophia-visual-e2e.spec.ts`

---

## 1. Test Environment

| Component  | Target                                                                   |
| ---------- | ------------------------------------------------------------------------ |
| Frontend   | Azure Static Web Apps (`gray-pebble-030ae3b10.1.azurestaticapps.net`)    |
| Backend    | Azure Functions (`bizroom-backend-gqfjg4e6bwdvhyfn.centralus-01.azurewebsites.net`) |
| Framework  | Playwright (cross-browser)                                               |
| 3D Engine  | Three.js + React Three Fiber (WebGL2 canvas)                             |

---

## 2. Test Flow — Sophia Visual Pipeline E2E

The primary E2E test validates the full Sophia pipeline: lobby entry, meeting start, user message, Sophia pre-search, agent response parsing, visual generation, and BigScreen display.

### Phase 1: Room Creation
1. Navigate to lobby page
2. Enter user name ("E2E-Judge")
3. Fill brand memory (companyName, industry, product)
4. Set agenda
5. Click create room

### Phase 2: Meeting Initialization
6. Wait for 3D canvas to load (WebGL2 context)
7. Click "Start" button to begin meeting
8. Wait for InputArea to become visible (meeting active)

### Phase 3: User Interaction
9. Send a message requesting search + visualization:
   > "Analyze the market size for solo founders, solopreneurs, and small startups — research via web search and visualize the priority ranking"
10. Wait for Sophia pre-search acknowledgment in chat

### Phase 4: Agent Response Validation
11. Wait for agent response articles to appear
12. Verify **no raw JSON** appears in message bubbles (clean speech text only)
13. Verify at least one agent message contains substantive content (>20 chars)

### Phase 5: Sophia Visual Verification
14. Wait for Sophia visualization announcement ("BigScreen", "displayed")
15. Capture final screenshot with BigScreen + HoloMonitor in 3D scene

### Phase 6: Canvas Integrity
16. Verify canvas element exists
17. Verify WebGL2 context is alive and not lost
18. Capture WebGL canvas content directly via `toDataURL()` (bypasses Playwright screenshot limitation for WebGL content)

### Phase 7: Error Audit
19. Filter console errors, excluding known spurious errors (favicon, extensions, DNS)
20. Report any real console errors as warnings

---

## 3. Key Assertions

| Assertion                          | Why It Matters                                          |
| ---------------------------------- | ------------------------------------------------------- |
| 3D canvas loads within 30s         | 3D scene is the first visual impression for judges       |
| No raw JSON in message bubbles     | ResponseParser must extract clean speech from structured output |
| Sophia pre-search message appears  | Validates the pre-search pipeline (Bing -> context injection) |
| Agent response is substantive      | Agents are producing meaningful conversation, not errors |
| BigScreen visualization announced  | Full Sophia pipeline: hint -> LLM -> renderData -> broadcast |
| WebGL2 context alive               | Three.js scene is rendering (not crashed)               |
| Canvas capture succeeds            | Visual proof of 3D rendering for CI artifacts           |

---

## 4. Timeouts & Intervals

| Wait Target                  | Timeout   | Poll Interval | Rationale                                    |
| ---------------------------- | --------- | ------------- | -------------------------------------------- |
| 3D canvas load               | 30s       | -             | GLB model downloads + WebGL init             |
| Start button visible         | 20s       | -             | Meeting initialization + SignalR connection   |
| InputArea visible            | 25s       | -             | Post-start API call + Sophia opening voice    |
| Sophia pre-search response   | 60s       | 2s            | Bing API call + SSE streaming                |
| Agent clean response         | 150s      | 3s            | LLM inference + response parsing + buffering |
| Sophia visual announcement   | 120s      | 3s            | Claude Sonnet/Haiku visual generation         |
| Final WebGL render           | 10s       | -             | Allow Three.js scene to stabilize             |

---

## 5. Performance Criteria

| Metric                    | Target    | Notes                                      |
| ------------------------- | --------- | ------------------------------------------ |
| Page load (lobby)         | < 3s      | Static Web App + CDN                       |
| Meeting start -> active   | < 10s     | API + Voice Live init + Sophia opening     |
| First agent response      | < 5s      | LLM inference via ModelRouter              |
| Agent turn complete       | < 15s     | Full structured output + audio             |
| Mode switch (Live/DM)     | < 1s      | Frontend state change only                 |
| BigScreen visual render   | < 10s     | Sophia LLM call + SignalR broadcast        |
| REST fallback             | < 5s      | SSE path when VoiceLive unavailable        |

---

## 6. Screenshot Artifacts

The test captures screenshots at each critical phase for CI review:

| File                              | Phase                                    |
| --------------------------------- | ---------------------------------------- |
| `screenshots/01-before-start.png` | Meeting room loaded, start button visible|
| `screenshots/02-meeting-active.png`| Input area visible, meeting active       |
| `screenshots/03-message-sent.png` | User message submitted                   |
| `screenshots/04-sophia-responded.png` | Sophia/agent messages appeared       |
| `screenshots/05-agent-clean-response.png` | Clean speech text (no JSON)      |
| `screenshots/06-sophia-visual-announced.png` | Visualization announced         |
| `screenshots/07-final-bigscreen.png` | Final 3D scene with BigScreen         |
| `screenshots/07b-webgl-canvas.png` | Direct WebGL canvas capture             |

---

## 7. Page Object Model

The test uses a `LobbyPage` page object (`E2ETest/pages/LobbyPage.ts`) for lobby interactions:

```typescript
class LobbyPage {
  goto(): Promise<void>;
  createRoom(name: string, agenda: string, brandMemory: {...}): Promise<void>;
}
```

---

## 8. Known Limitations

| Limitation                              | Workaround                                         |
| --------------------------------------- | -------------------------------------------------- |
| Playwright cannot screenshot WebGL      | Direct `canvas.toDataURL()` capture                |
| Voice/audio cannot be tested in CI      | Text chat path validated instead                   |
| LLM response times vary                 | Generous timeouts (up to 150s for agent response)  |
| 3D rendering is non-deterministic       | Canvas presence + WebGL context check only         |
| Bing search API may be rate-limited     | Test still passes if search returns empty results  |

---

## 9. Test Expansion Roadmap

| Phase | Scope                  | Key Assertions                                         |
| ----- | ---------------------- | ------------------------------------------------------ |
| 1     | Lobby -> Room Entry    | Name input, brand memory form, room creation           |
| 2     | Meeting Start          | Sophia opening, 3D scene load, phase transition        |
| 3     | Live Chat              | SSE streaming, message bubbles, typing indicators      |
| 4     | Agent Interaction      | Multi-agent sequence, A2A mention routing              |
| 5     | Mode Switch            | Live -> DM -> Auto, DM 1:1 isolation                  |
| 6     | Sophia + BigScreen     | Visual hints, BigScreen render, pagination, Sophia blob|
| 7     | Artifacts              | Excel/PPT generation, download links                   |
| 8     | Performance            | Response latency < 5s, streaming FPS, 3D render        |
| 9     | Error Resilience       | Connection drop -> REST fallback, timeout recovery     |
| 10    | DB Verification        | Cosmos DB CRUD via API: rooms, sessions, messages      |
