/**
 * @file test-data.ts
 * @description Centralized test data fixtures for BizRoom.ai E2E tests.
 *
 * All test constants are defined here as a single source of truth.
 * Test specs import from this file to ensure consistency across phases.
 *
 * Data categories:
 *   - TEST_USER:              User identity for all test sessions
 *   - BRAND_MEMORY:           Company context that personalizes AI agent responses
 *   - TEST_AGENDA:            Meeting topic that drives agent discussion
 *   - TEST_MESSAGES:          Pre-defined messages for different test scenarios
 *   - AGENTS:                 AI C-Suite executive names and roles (MVP set)
 *   - PERFORMANCE_THRESHOLDS: Latency budgets for performance benchmarks
 */

// ---------------------------------------------------------------------------
// User Identity
// ---------------------------------------------------------------------------

/** Test user profile used across all E2E sessions */
export const TEST_USER = {
  name: "E2E-Judge",
  email: "e2e-judge@bizroom.test",
  userId: "e2e-user-001",
} as const;

// ---------------------------------------------------------------------------
// Brand Memory (Company Context)
// ---------------------------------------------------------------------------

/**
 * Brand memory data that AI agents use to personalize their advice.
 * Injected into agent system prompts via the brandMemory pipeline.
 */
export const BRAND_MEMORY = {
  companyName: "TechCorp AI",
  industry: "SaaS / B2B",
  product: "DataSync - 실시간 데이터 동기화 플랫폼",
  targetMarket: "중견기업 IT팀",
  annualRevenue: "$5M ARR",
  competitors: "Fivetran, Airbyte",
  keyMetrics: "MRR, Churn Rate, NPS",
} as const;

// ---------------------------------------------------------------------------
// Meeting Agenda
// ---------------------------------------------------------------------------

/** Meeting topic — passed to SnippetManager and agent system prompts */
export const TEST_AGENDA = "Q2 제품 전략 및 마케팅 예산 논의";

// ---------------------------------------------------------------------------
// Test Messages (by scenario)
// ---------------------------------------------------------------------------

/**
 * Pre-defined messages for different interaction scenarios.
 * Each message is designed to trigger specific agent routing behavior.
 */
export const TEST_MESSAGES = {
  /** Generic greeting — routes to COO (meeting chair) */
  simple: "안녕하세요, 회의를 시작하겠습니다.",

  /** Marketing topic — routes to CMO (Yusef) via TopicClassifier */
  marketing: "마케팅 예산을 어떻게 배분하면 좋을까요?",

  /** CFO mention — explicit @CFO routes to Amelia via mention routing */
  financial: "@CFO 올해 예산 현황을 알려주세요.",

  /** Strategy topic — routes to CMO (Yusef) for market expansion discussion */
  strategy: "일본 시장 진출 전략을 논의합시다.",

  /** Data visualization request — triggers Sophia visual pipeline */
  dataRequest:
    "고객 세그먼트별 매출 비중을 차트로 보여주세요.",

  /** DM mode message — direct to Amelia (CFO) for 1:1 conversation */
  dmCfo: "Amelia, Q2 예산 분석을 부탁합니다.",

  /** Auto mode topic — used to seed autonomous agent discussion */
  autoTopic: "우리 회사의 AI 전략 방향성",
} as const;

// ---------------------------------------------------------------------------
// AI Agents (MVP set)
// ---------------------------------------------------------------------------

/**
 * The three MVP AI executives available in BizRoom.ai meetings.
 * Names are inspired by Microsoft leadership (see CLAUDE.md for details).
 */
export const AGENTS = {
  /** COO — Meeting chair, moderates all discussions (inspired by Judson Althoff) */
  coo: { name: "Hudson", role: "COO" },

  /** CFO — Financial analysis and budget strategy (inspired by Amy Hood) */
  cfo: { name: "Amelia", role: "CFO" },

  /** CMO — Marketing strategy and market expansion (inspired by Yusuf Mehdi) */
  cmo: { name: "Yusef", role: "CMO" },
} as const;

// ---------------------------------------------------------------------------
// Performance Thresholds (milliseconds)
// ---------------------------------------------------------------------------

/**
 * Latency budgets for performance benchmark tests.
 * These represent target values; actual thresholds in tests may use
 * multipliers (e.g., 2x) to accommodate CI/cold-start variability.
 */
export const PERFORMANCE_THRESHOLDS = {
  /** Lobby page load to networkidle */
  pageLoad: 3_000,

  /** Room creation + meeting start to first COO message */
  meetingStart: 10_000,

  /** User message send to first agent streaming delta (TTFB) */
  firstAgentResponse: 5_000,

  /** Full agent turn completion (all streaming done) */
  agentTurnComplete: 15_000,

  /** Mode switch (Live/DM/Auto) UI transition */
  modeSwitch: 1_000,

  /** Sophia BigScreen visualization render */
  bigScreenRender: 10_000,

  /** REST fallback response when SignalR is unavailable */
  restFallback: 5_000,
} as const;
