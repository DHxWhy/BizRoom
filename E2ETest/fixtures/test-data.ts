/** Test data fixtures for E2E tests */

export const TEST_USER = {
  name: "E2E-Judge",
  email: "e2e-judge@bizroom.test",
  userId: "e2e-user-001",
} as const;

export const BRAND_MEMORY = {
  companyName: "TechCorp AI",
  industry: "SaaS / B2B",
  product: "DataSync - 실시간 데이터 동기화 플랫폼",
  targetMarket: "중견기업 IT팀",
  annualRevenue: "$5M ARR",
  competitors: "Fivetran, Airbyte",
  keyMetrics: "MRR, Churn Rate, NPS",
} as const;

export const TEST_AGENDA = "Q2 제품 전략 및 마케팅 예산 논의";

export const TEST_MESSAGES = {
  simple: "안녕하세요, 회의를 시작하겠습니다.",
  marketing: "마케팅 예산을 어떻게 배분하면 좋을까요?",
  financial: "@CFO 올해 예산 현황을 알려주세요.",
  strategy: "일본 시장 진출 전략을 논의합시다.",
  dataRequest:
    "고객 세그먼트별 매출 비중을 차트로 보여주세요.",
  dmCfo: "Amelia, Q2 예산 분석을 부탁합니다.",
  autoTopic: "우리 회사의 AI 전략 방향성",
} as const;

export const AGENTS = {
  coo: { name: "Hudson", role: "COO" },
  cfo: { name: "Amelia", role: "CFO" },
  cmo: { name: "Yusef", role: "CMO" },
} as const;

export const PERFORMANCE_THRESHOLDS = {
  pageLoad: 3_000,
  meetingStart: 10_000,
  firstAgentResponse: 5_000,
  agentTurnComplete: 15_000,
  modeSwitch: 1_000,
  bigScreenRender: 10_000,
  restFallback: 5_000,
} as const;
