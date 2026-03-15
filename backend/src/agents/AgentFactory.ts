// ──────────────────────────────────────────────────────────────────────
// AgentFactory — Multi-provider agent invocation
//
// Primary: Azure AI Foundry Model Router (auto-selects optimal model)
// Fallback: Anthropic API (Opus/Sonnet/Haiku) + OpenAI API (Realtime/o3)
//
// Provider selection is handled by ModelRouter.getModelForTask()
// ──────────────────────────────────────────────────────────────────────

import type { AgentRole, AgentContext } from "../models/index.js";
import { AGENT_CONFIGS } from "./agentConfigs.js";
import {
  getModelForTask,
  getAnthropicClient,
  getOpenAIClient,
  getFoundryClient,
  type TaskType,
  type ModelSelection,
} from "../services/ModelRouter.js";
import { buildBrandMemoryPrompt } from "./prompts/brandMemory.js";
import { getSearchGrounding } from "../services/BingSearchService.js";

export interface AgentResponse {
  role: AgentRole;
  name: string;
  content: string;
}

/** Check if any LLM provider is configured */
function hasProvider(): boolean {
  return !!(
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.AZURE_FOUNDRY_MODEL_ROUTER_ENDPOINT ||
    process.env.AZURE_OPENAI_API_KEY
  );
}

/** Build system prompt with optional brand memory prefix */
function buildSystemPrompt(role: AgentRole, context: AgentContext): string {
  const config = AGENT_CONFIGS[role];
  const basePrompt = config.getSystemPrompt(context);
  const brandPrefix = context.brandMemory
    ? buildBrandMemoryPrompt(context.brandMemory) + "\n\n"
    : "";
  return brandPrefix + basePrompt;
}

// ── Anthropic Invocation ──

async function invokeAnthropic(
  systemPrompt: string,
  userMessage: string,
  selection: ModelSelection,
): Promise<string> {
  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: selection.model,
    max_tokens: selection.maxTokens,
    temperature: selection.temperature,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });
  const block = response.content[0];
  return block.type === "text" ? block.text : "";
}

async function* streamAnthropic(
  systemPrompt: string,
  userMessage: string,
  selection: ModelSelection,
): AsyncGenerator<string, void, undefined> {
  const client = getAnthropicClient();
  const stream = client.messages.stream({
    model: selection.model,
    max_tokens: selection.maxTokens,
    temperature: selection.temperature,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }
  }
}

// ── OpenAI / Foundry Invocation (OpenAI-compatible) ──

async function invokeOpenAICompat(
  systemPrompt: string,
  userMessage: string,
  selection: ModelSelection,
): Promise<string> {
  const client =
    selection.provider === "foundry" ? getFoundryClient() : getOpenAIClient();
  const response = await client.chat.completions.create({
    model: selection.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: selection.temperature,
    max_tokens: selection.maxTokens,
  });
  return response.choices[0]?.message?.content ?? "";
}

async function* streamOpenAICompat(
  systemPrompt: string,
  userMessage: string,
  selection: ModelSelection,
): AsyncGenerator<string, void, undefined> {
  const client =
    selection.provider === "foundry" ? getFoundryClient() : getOpenAIClient();
  const stream = await client.chat.completions.create({
    model: selection.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: selection.temperature,
    max_tokens: selection.maxTokens,
    stream: true,
  });
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

// ── Public API ──

export async function invokeAgent(
  role: AgentRole,
  userMessage: string,
  context: AgentContext,
  task: TaskType = "chat",
): Promise<AgentResponse> {
  const config = AGENT_CONFIGS[role];
  if (!config) throw new Error(`Unknown agent role: ${role}`);

  // Dev fallback: mock response when no provider is configured
  if (!hasProvider()) {
    console.warn(
      `[AgentFactory] No LLM provider configured — returning mock for ${config.name}`,
    );
    return { role, name: config.name, content: getMockResponse(role, userMessage) };
  }

  const selection = getModelForTask(task);

  // Bing Search grounding: enrich system prompt with web results when relevant
  const searchContext = await getSearchGrounding(userMessage);
  const systemPrompt = buildSystemPrompt(role, context) + searchContext;

  const startTime = Date.now();

  const content =
    selection.provider === "anthropic"
      ? await invokeAnthropic(systemPrompt, userMessage, selection)
      : await invokeOpenAICompat(systemPrompt, userMessage, selection);

  // Response quality logging
  const sentenceCount = (content.match(/[.!?。]\s|[.!?。]$/g) || []).length || 1;
  const latencyMs = Date.now() - startTime;
  console.log(
    JSON.stringify({
      _type: "ResponseLog",
      timestamp: new Date().toISOString(),
      agent: { role, name: config.name },
      provider: selection.provider,
      model: selection.model,
      response: { sentenceCount, tokenEstimate: Math.ceil(content.length / 2), latencyMs },
      qualityChecks: { sentenceCountPass: sentenceCount >= 2 && sentenceCount <= 7 },
    }),
  );

  return { role, name: config.name, content };
}

/**
 * Stream agent response as text deltas.
 * Automatically routes to the correct provider via ModelRouter.
 */
export async function* invokeAgentStream(
  role: AgentRole,
  userMessage: string,
  context: AgentContext,
  task: TaskType = "chat",
): AsyncGenerator<string, void, undefined> {
  const config = AGENT_CONFIGS[role];
  if (!config) throw new Error(`Unknown agent role: ${role}`);

  // Dev fallback: mock streaming
  if (!hasProvider()) {
    console.warn(
      `[AgentFactory] No LLM provider configured — streaming mock for ${config.name}`,
    );
    const mockText = getMockResponse(role, userMessage);
    for (const char of mockText) {
      yield char;
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    return;
  }

  const selection = getModelForTask(task);

  // Bing Search grounding: enrich system prompt with web results when relevant
  const searchContext = await getSearchGrounding(userMessage);
  const systemPrompt = buildSystemPrompt(role, context) + searchContext;

  if (selection.provider === "anthropic") {
    yield* streamAnthropic(systemPrompt, userMessage, selection);
  } else {
    yield* streamOpenAICompat(systemPrompt, userMessage, selection);
  }
}

/** Mock responses for development without API keys */
function getMockResponse(role: AgentRole, userMessage: string): string {
  const mocks: Record<AgentRole, string> = {
    coo: `[Hudson COO] "${userMessage}"에 대해 정리하겠습니다.\n\n1. 현재 상황을 분석하고\n2. 실행 가능한 계획을 수립하겠습니다.\n3. 각 임원의 의견을 종합하여 액션아이템을 도출하겠습니다.\n\nAmelia CFO, 재무적 관점에서 의견 부탁드립니다.`,
    cfo: `[Amelia CFO] 재무 관점에서 분석하겠습니다.\n\n- 예상 비용: 초기 투자 대비 ROI를 먼저 산정해야 합니다\n- 리스크: 현금 흐름에 미치는 영향을 고려해야 합니다\n- 제안: 단계별 예산 배분으로 리스크를 최소화하는 것을 권장합니다`,
    cmo: `[Yusef CMO] 마케팅 전략 관점에서 제안합니다.\n\n- 타겟 고객: 우리의 핵심 고객층을 명확히 해야 합니다\n- 채널 전략: 디지털 채널 중심의 효율적 접근이 필요합니다\n- 차별화: 경쟁사 대비 우리만의 강점을 부각해야 합니다`,
    cto: `[Kelvin CTO] 기술 관점에서 분석하겠습니다.\n\n- 쉽게 말하면, 이 접근은 기술적으로 실현 가능합니다\n- 개발 공수는 약 2주, 풀타임 개발자 2명이 필요합니다\n- 다만 기술 부채를 줄이려면 이 아키텍처를 추천합니다`,
    cdo: `[Jonas CDO] 사용자 관점에서 보면 중요한 포인트입니다.\n\n- 이 경험이 사용자에게 어떤 감정을 줄지 고려해야 합니다\n- 접근성을 고려하면, 모든 사용자가 편하게 사용할 수 있어야 합니다\n- 시안을 만들어볼게요`,
    clo: `[Bradley CLO] 법적으로 확인이 필요한 부분이 있습니다.\n\n- 개인정보보호법 관점에서 검토가 필요합니다\n- 리스크를 줄이면서도 진행할 방법이 있습니다\n- 이용약관에 관련 조항을 추가하는 것을 권장합니다`,
  };
  return mocks[role] ?? `[${role}] ${userMessage}에 대한 의견입니다.`;
}

export interface AgentStreamMeta {
  role: AgentRole;
  name: string;
}

export function getAgentMeta(role: AgentRole): AgentStreamMeta {
  const config = AGENT_CONFIGS[role];
  if (!config) throw new Error(`Unknown agent role: ${role}`);
  return { role, name: config.name };
}

export function getAgentConfig(role: AgentRole) {
  return AGENT_CONFIGS[role];
}
