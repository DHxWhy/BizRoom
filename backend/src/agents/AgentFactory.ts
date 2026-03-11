import OpenAI from "openai";
import type { AgentRole } from "../models/index.js";
import { AGENT_CONFIGS } from "./agentConfigs.js";
import { getModelForTask, type TaskType } from "../services/ModelRouter.js";

// OpenAI client configured for Azure OpenAI
function getOpenAIClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY ?? "",
    baseURL: `${process.env.AZURE_OPENAI_ENDPOINT ?? ""}openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-4o"}`,
    defaultQuery: {
      "api-version":
        process.env.AZURE_OPENAI_API_VERSION ?? "2024-08-01-preview",
    },
    defaultHeaders: {
      "api-key": process.env.AZURE_OPENAI_API_KEY ?? "",
    },
  });
}

export interface AgentResponse {
  role: AgentRole;
  name: string;
  content: string;
}

export async function invokeAgent(
  role: AgentRole,
  userMessage: string,
  context: { participants: string; agenda: string; history: string },
  task: TaskType = "chat",
): Promise<AgentResponse> {
  const config = AGENT_CONFIGS[role];
  if (!config) throw new Error(`Unknown agent role: ${role}`);

  // Dev fallback: return mock response when Azure OpenAI is not configured
  if (!process.env.AZURE_OPENAI_API_KEY || !process.env.AZURE_OPENAI_ENDPOINT) {
    console.warn(`[AgentFactory] Azure OpenAI not configured — returning mock response for ${config.name}`);
    return {
      role,
      name: config.name,
      content: getMockResponse(role, userMessage),
    };
  }

  const client = getOpenAIClient();
  const model = getModelForTask(task);
  const systemPrompt = config.getSystemPrompt(context);

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: 0.7,
    max_tokens: 1000,
  });

  return {
    role,
    name: config.name,
    content: response.choices[0]?.message?.content ?? "",
  };
}

/** Mock responses for development without Azure OpenAI keys */
function getMockResponse(role: AgentRole, userMessage: string): string {
  const mocks: Record<string, string> = {
    coo: `[Hudson COO] "${userMessage}"에 대해 정리하겠습니다.\n\n1. 현재 상황을 분석하고\n2. 실행 가능한 계획을 수립하겠습니다.\n3. 각 임원의 의견을 종합하여 액션아이템을 도출하겠습니다.\n\nAmelia CFO, 재무적 관점에서 의견 부탁드립니다.`,
    cfo: `[Amelia CFO] 재무 관점에서 분석하겠습니다.\n\n- 예상 비용: 초기 투자 대비 ROI를 먼저 산정해야 합니다\n- 리스크: 현금 흐름에 미치는 영향을 고려해야 합니다\n- 제안: 단계별 예산 배분으로 리스크를 최소화하는 것을 권장합니다`,
    cmo: `[Yusef CMO] 마케팅 전략 관점에서 제안합니다.\n\n- 타겟 고객: 우리의 핵심 고객층을 명확히 해야 합니다\n- 채널 전략: 디지털 채널 중심의 효율적 접근이 필요합니다\n- 차별화: 경쟁사 대비 우리만의 강점을 부각해야 합니다`,
    cto: `[Kelvin CTO] 기술 관점에서 분석하겠습니다.\n\n- 쉽게 말하면, 이 접근은 기술적으로 실현 가능합니다\n- 개발 공수는 약 2주, 풀타임 개발자 2명이 필요합니다\n- 다만 기술 부채를 줄이려면 이 아키텍처를 추천합니다`,
    cdo: `[Jonas CDO] 사용자 관점에서 보면 중요한 포인트입니다.\n\n- 이 경험이 사용자에게 어떤 감정을 줄지 고려해야 합니다\n- 접근성을 고려하면, 모든 사용자가 편하게 사용할 수 있어야 합니다\n- 시안을 만들어볼게요`,
    clo: `[Bradley CLO] 법적으로 확인이 필요한 부분이 있습니다.\n\n- 개인정보보호법 관점에서 검토가 필요합니다\n- 리스크를 줄이면서도 진행할 방법이 있습니다\n- 이용약관에 관련 조항을 추가하는 것을 권장합니다`,
  };
  return mocks[role] ?? `[${role}] ${userMessage}에 대한 의견입니다.`;
}

/** 스트리밍 응답의 메타 정보 (role, name 등) */
export interface AgentStreamMeta {
  role: AgentRole;
  name: string;
}

/**
 * 스트리밍 방식으로 에이전트를 호출하여 텍스트 delta를 AsyncIterable로 반환한다.
 * Azure OpenAI가 구성되지 않은 경우 mock 텍스트를 문자 단위로 스트리밍한다.
 */
export async function* invokeAgentStream(
  role: AgentRole,
  userMessage: string,
  context: { participants: string; agenda: string; history: string },
  task: TaskType = "chat",
): AsyncGenerator<string, void, undefined> {
  const config = AGENT_CONFIGS[role];
  if (!config) throw new Error(`Unknown agent role: ${role}`);

  // Dev fallback: mock 스트리밍 (Azure OpenAI 미구성 시)
  if (!process.env.AZURE_OPENAI_API_KEY || !process.env.AZURE_OPENAI_ENDPOINT) {
    console.warn(`[AgentFactory] Azure OpenAI not configured — streaming mock response for ${config.name}`);
    const mockText = getMockResponse(role, userMessage);
    for (const char of mockText) {
      yield char;
      // 문자 단위 딜레이로 스트리밍 시뮬레이션 (15ms)
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    return;
  }

  const client = getOpenAIClient();
  const model = getModelForTask(task);
  const systemPrompt = config.getSystemPrompt(context);

  const stream = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: 0.7,
    max_tokens: 1000,
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      yield delta;
    }
  }
}

/** 에이전트의 meta 정보(role, name)만 반환 — 스트림 시작 시 사용 */
export function getAgentMeta(role: AgentRole): AgentStreamMeta {
  const config = AGENT_CONFIGS[role];
  if (!config) throw new Error(`Unknown agent role: ${role}`);
  return { role, name: config.name };
}

export function getAgentConfig(role: AgentRole) {
  return AGENT_CONFIGS[role];
}
