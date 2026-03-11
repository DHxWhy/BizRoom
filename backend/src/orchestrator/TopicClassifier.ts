import type { AgentRole } from "../models/index.js";

export type Topic =
  | "finance"
  | "marketing"
  | "operations"
  | "tech"
  | "legal"
  | "design"
  | "general";

interface TopicResult {
  topic: Topic;
  primaryAgent: AgentRole;
  secondaryAgents: AgentRole[];
  confidence: number;
}

// Keyword-to-topic mapping
const TOPIC_KEYWORDS: Record<Topic, string[]> = {
  finance: [
    "예산", "비용", "매출", "이익", "마진", "ROI", "투자", "현금",
    "재무", "수익", "손실", "인보이스", "세금", "회계", "금융",
    "budget", "cost", "revenue", "profit",
  ],
  marketing: [
    "마케팅", "광고", "캠페인", "브랜드", "고객", "타겟", "SEO",
    "콘텐츠", "소셜", "프로모션", "시장", "경쟁사", "홍보",
    "marketing", "campaign", "brand",
  ],
  operations: [
    "일정", "프로세스", "운영", "효율", "KPI", "태스크", "실행",
    "관리", "인력", "리소스",
    "schedule", "process", "operations",
  ],
  tech: [
    "서버", "아키텍처", "API", "개발", "배포", "인프라", "보안",
    "데이터베이스", "성능", "코드", "기술", "스택",
    "server", "architecture", "deploy",
  ],
  legal: [
    "계약", "법률", "규정", "개인정보", "라이선스", "법적", "규제",
    "준수", "contract", "legal", "compliance", "GDPR",
  ],
  design: [
    "디자인", "UX", "UI", "사용성", "접근성", "프로토타입",
    "와이어프레임", "design", "user experience",
  ],
  general: [],
};

// Topic -> primary/secondary agent mapping
const TOPIC_AGENTS: Record<Topic, { primary: AgentRole; secondary: AgentRole[] }> = {
  finance: { primary: "cfo", secondary: ["coo", "clo"] },
  marketing: { primary: "cmo", secondary: ["cdo", "cfo"] },
  operations: { primary: "coo", secondary: ["cfo"] },
  tech: { primary: "cto", secondary: ["cdo"] },
  legal: { primary: "clo", secondary: ["cfo", "coo"] },
  design: { primary: "cdo", secondary: ["cmo", "cto"] },
  general: { primary: "coo", secondary: ["cfo", "cmo"] },
};

/** Classify a user message into a topic and determine relevant agents */
export function classifyTopic(message: string): TopicResult {
  const lower = message.toLowerCase();
  let bestTopic: Topic = "general";
  let bestScore = 0;

  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS) as [Topic, string[]][]) {
    if (topic === "general") continue;
    const score = keywords.filter((kw) => lower.includes(kw.toLowerCase())).length;
    if (score > bestScore) {
      bestScore = score;
      bestTopic = topic;
    }
  }

  const agents = TOPIC_AGENTS[bestTopic];
  return {
    topic: bestTopic,
    primaryAgent: agents.primary,
    secondaryAgents: agents.secondary,
    confidence: bestScore > 0 ? Math.min(bestScore / 3, 1) : 0.3,
  };
}

/** Parse @mentions from message content and return matching agent roles */
export function parseMentions(message: string): AgentRole[] {
  const mentions: AgentRole[] = [];
  const mentionPattern = /@(COO|CFO|CMO|CTO|CDO|CLO|Hudson|Amelia|Yusef|Kelvin|Jonas|Bradley)/gi;
  let match: RegExpExecArray | null;
  while ((match = mentionPattern.exec(message)) !== null) {
    const name = match[1].toLowerCase();
    if (name === "coo" || name === "hudson") mentions.push("coo");
    else if (name === "cfo" || name === "amelia") mentions.push("cfo");
    else if (name === "cmo" || name === "yusef") mentions.push("cmo");
    else if (name === "cto" || name === "kelvin") mentions.push("cto");
    else if (name === "cdo" || name === "jonas") mentions.push("cdo");
    else if (name === "clo" || name === "bradley") mentions.push("clo");
  }
  return [...new Set(mentions)];
}
