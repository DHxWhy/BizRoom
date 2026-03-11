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

export function getAgentConfig(role: AgentRole) {
  return AGENT_CONFIGS[role];
}
