---
version: "1.0.0"
created: "2026-03-14 08:30"
updated: "2026-03-14 08:30"
---

# BizRoom.ai E2E Test Suite

End-to-end test suite for **BizRoom.ai** -- an AI-powered virtual meeting room where users collaborate with AI C-Suite executives (COO, CFO, CMO) in real-time.

Built with [Playwright](https://playwright.dev/) and organized into 10 progressive phases that validate every layer of the product, from UI rendering to database persistence.

## Test Architecture

```
                        E2E Test Suite
                             |
    +------------------------+------------------------+
    |                        |                        |
  UI Tests              API Tests           Performance Tests
  (Phases 1-7)         (Phases 9-10)         (Phase 8)
    |                        |                        |
    v                        v                        v
+--------+    +-----------+  |  +---------+    +----------+
| Lobby  |    | Meeting   |  |  | REST    |    | Latency  |
| Page   |    | Room Page |  |  | Client  |    | Benchmrk |
+--------+    +-----------+  |  +---------+    +----------+
    |              |         |       |               |
    v              v         v       v               v
+--------------------------------------------------------+
|              Page Objects + Fixtures                    |
|  LobbyPage | MeetingRoomPage | ChatPanel | ApiClient   |
|  selectors.ts | test-data.ts | timing.ts               |
+--------------------------------------------------------+
    |              |                   |
    v              v                   v
+--------+   +-----------+   +------------------+
| React  |   | Three.js  |   | Azure Functions  |
| SPA    |   | 3D Scene  |   | + Cosmos DB      |
+--------+   +-----------+   +------------------+
```

## Phase Overview

| Phase | Name                             | Tests | What It Validates                                                    |
| ----- | -------------------------------- | ----- | -------------------------------------------------------------------- |
| 1     | Lobby Entry                      | 7     | Multi-step wizard (name, brand memory, agenda, room creation)        |
| 2     | Meeting Start                    | 6     | 3D canvas render, Start Meeting button, COO opening message          |
| 3     | Live Chat                        | 7     | Message send/receive, streaming, agent response content              |
| 4     | Agent Interaction                | 6     | @mention routing, multi-agent turns, A2A communication chains        |
| 5     | Mode Switching                   | 6     | Live/DM/Auto mode transitions, DM agent isolation, mode restore     |
| 6     | Sophia and BigScreen             | 8     | Visualization pipeline, BigScreen rendering, HoloMonitor, Sophia blob|
| 7     | Artifacts                        | 6     | Artifact generation, preview cards, download, REST API validation    |
| 8     | Performance Benchmarks           | 6     | Page load, TTFB, agent turn time, mode switch latency, API timing    |
| 9     | Error Resilience                 | 7     | REST fallback, empty/long/rapid-fire messages, graceful degradation  |
| 10    | Cosmos DB Verification           | 8     | User CRUD, room CRUD, session lifecycle, message persistence         |
|       | **Total**                        | **67**|                                                                      |

## Project Structure

```
E2ETest/
|-- tests/                        # Test specifications (10 phases)
|   |-- phase1-lobby-entry.spec.ts
|   |-- phase2-meeting-start.spec.ts
|   |-- phase3-live-chat.spec.ts
|   |-- phase4-agent-interaction.spec.ts
|   |-- phase5-modes.spec.ts
|   |-- phase6-sophia-bigscreen.spec.ts
|   |-- phase7-artifacts.spec.ts
|   |-- phase8-performance.spec.ts
|   |-- phase9-error-resilience.spec.ts
|   |-- phase10-db-verification.spec.ts
|
|-- pages/                        # Page Object Model
|   |-- LobbyPage.ts              #   Lobby multi-step wizard
|   |-- MeetingRoomPage.ts        #   3D meeting room + mode controls
|   |-- ChatPanel.ts              #   Chat messaging + streaming
|
|-- fixtures/                     # Test data and selectors
|   |-- test-data.ts              #   Users, messages, agents, thresholds
|   |-- selectors.ts              #   Centralized CSS/aria selectors
|
|-- helpers/                      # Utility functions
|   |-- timing.ts                 #   Timer, measure(), waitForCondition()
|   |-- api-client.ts             #   Direct backend API calls
|   |-- realtime-bench.mjs        #   OpenAI Realtime API benchmark
|
|-- reports/                      # Generated test reports (HTML)
|-- playwright.config.ts          # Playwright configuration
|-- BenchmarkReport.md            # AI model benchmark results
|-- TestBriefing.md               # Phase-by-phase test results
|-- README.md                     # This file
```

## How to Run

### Prerequisites

- Node.js 20+
- Playwright browsers installed

### Setup

```bash
cd E2ETest
npm install
npx playwright install chromium
```

### Run All Tests

```bash
npm test
```

### Run a Specific Phase

```bash
npm run test:phase1    # Lobby Entry
npm run test:phase2    # Meeting Start
npm run test:phase3    # Live Chat
npm run test:phase4    # Agent Interaction
npm run test:phase5    # Mode Switching
npm run test:phase6    # Sophia + BigScreen
npm run test:phase7    # Artifacts
npm run test:phase8    # Performance Benchmarks
npm run test:phase9    # Error Resilience
npm run test:phase10   # Cosmos DB Verification
```

### Run with Browser Visible

```bash
npm run test:headed
```

### View HTML Report

```bash
npm run report
```

### Environment Variables

| Variable        | Default                                       | Description                     |
| --------------- | --------------------------------------------- | ------------------------------- |
| `BASE_URL`      | Azure Static Web Apps URL                     | Frontend deployment URL         |
| `API_BASE`      | Azure Functions URL                           | Backend API base URL            |
| `OPENAI_API_KEY`| (none)                                        | For realtime-bench.mjs only     |
| `RT_MODEL`      | `gpt-4o-realtime-preview`                     | Realtime benchmark model        |

## Test Design Principles

### Assertion Strategy

Tests use a two-tier assertion approach:

- **Hard assertions** (`expect()`): For conditions that must always pass -- page loads, app stays alive, no crashes. A hard failure means a real bug.
- **Soft assertions** (`expect.soft()`): For conditions that depend on external factors -- AI response timing, cold-start latency, feature completeness. Soft failures are logged but do not block other tests.

### Resilience to Cold Start

Azure Functions cold-start can add 5-15 seconds of latency. All AI-dependent timeouts are generous (60-90 seconds) to avoid false failures in CI environments.

### Page Object Model

All DOM interactions are encapsulated in Page Objects (`LobbyPage`, `MeetingRoomPage`, `ChatPanel`). Test specs focus on assertions, not element location.

### Centralized Selectors

All CSS selectors live in `fixtures/selectors.ts`. Each selector includes multiple fallbacks (`data-testid`, class, text) to accommodate build variations.

## Performance Benchmark Summary

From benchmarking 7 AI models (see `BenchmarkReport.md` for details):

| Metric                         | Measured      | Target        |
| ------------------------------ | ------------- | ------------- |
| Page Load (networkidle)        | ~950 ms       | < 3,000 ms    |
| DOMContentLoaded               | ~430 ms       | < 1,000 ms    |
| Room Entry (lobby to canvas)   | ~2-3 s        | < 10,000 ms   |
| AI Agent Response (TTFB)       | 0.93-4.5 s    | < 5,000 ms    |
| Mode Switch (UI transition)    | < 100 ms      | < 1,000 ms    |
| SignalR Negotiate               | ~200 ms       | < 1,000 ms    |

### AI Model Comparison (single agent, same prompt)

| Rank | Model                       | Response Time | TTFB     |
| ---- | --------------------------- | ------------- | -------- |
| 1    | gpt-4o-realtime-preview     | 1.95 s        | 0.93 s   |
| 2    | gpt-4o                      | 2.1 s         | -        |
| 3    | claude-haiku-4-5            | 2.3 s         | -        |
| 4    | gpt-realtime-1.5            | 2.52 s        | 1.46 s   |
| 5    | gpt-4o-mini                 | 2.8 s         | -        |
| 6    | claude-sonnet-4-6           | 4.8 s         | -        |
| 7    | claude-opus-4-6             | ~7.0 s        | ~4.5 s   |

## Key Test Findings

### Phase 1 (Lobby): 7/7 PASS

- Page load: ~950 ms (well under 3 s target)
- Multi-step wizard flow works correctly
- Brand memory preset auto-fill is reliable

### Phase 2 (Meeting Start): 3 PASS, 1 FAIL (AI dependency), 2 SKIP

- 3D canvas renders correctly
- UI components (sidebar, chat panel, mode selector) all render
- COO opening message requires Azure OpenAI configuration

### Phase 10 (Cosmos DB): 5 PASS, 2 SOFT-FAIL, 1 SKIP

- User registration and retrieval: PASS
- Brand memory update: PASS
- Room creation with 6-char join code: PASS
- Full CRUD round-trip: No 500 errors

### Known Issue

Azure OpenAI environment variables (`AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT_PREMIUM`) must be configured on the backend for AI-dependent tests (Phases 2-7) to fully pass. UI rendering and routing work correctly without them.

## Related Documents

| Document              | Description                                         |
| --------------------- | --------------------------------------------------- |
| `BenchmarkReport.md`  | Detailed AI model performance comparison (7 models) |
| `TestBriefing.md`     | Phase-by-phase test execution results               |
| `playwright.config.ts`| Playwright configuration (timeouts, reporters)      |
