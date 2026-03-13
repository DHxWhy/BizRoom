// ──────────────────────────────────────────────────────────────────────
// ModelRouter — Multi-provider task-based model routing
//
// Architecture: Azure AI Foundry Model Router (primary)
//   → Anthropic API / OpenAI API (fallback)
//
// Primary path: Azure AI Foundry Model Router provides intelligent
// model selection (quality/cost/balanced) across GPT-5.x, GPT-4.1,
// DeepSeek, etc. via a single endpoint.
//
// Fallback path: When Foundry quota is unavailable, routes to
// provider APIs directly — Anthropic (Opus/Sonnet/Haiku) and
// OpenAI (Realtime, o3).
//
// Switch to Foundry by setting AZURE_FOUNDRY_MODEL_ROUTER_ENDPOINT.
// ──────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

// ── Task Types ──

export type TaskType =
  | "agent-response"
  | "visual-gen"
  | "visual-gen-fast"
  | "minutes"
  | "parse-fallback"
  | "deep-analysis"
  | "realtime-voice"
  // Legacy (backward compat)
  | "chat"
  | "artifact"
  | "research"
  | "summary";

// ── Provider Types ──

export type Provider = "foundry" | "anthropic" | "openai";

export interface ModelSelection {
  provider: Provider;
  model: string;
  temperature: number;
  maxTokens: number;
}

// ── Provider Detection ──

function getActiveProvider(task: TaskType): Provider {
  // Primary: Azure AI Foundry Model Router
  if (process.env.AZURE_FOUNDRY_MODEL_ROUTER_ENDPOINT) {
    return "foundry";
  }

  // Fallback: route by task to best available provider
  switch (task) {
    case "realtime-voice":
      return "openai";
    case "deep-analysis":
      return process.env.OPENAI_API_KEY ? "openai" : "anthropic";
    default:
      return process.env.ANTHROPIC_API_KEY ? "anthropic" : "openai";
  }
}

// ── Model Selection ──

export function getModelForTask(task: TaskType): ModelSelection {
  const provider = getActiveProvider(task);

  if (provider === "foundry") {
    return getFoundryModel(task);
  }
  if (provider === "anthropic") {
    return getAnthropicModel(task);
  }
  return getOpenAIModel(task);
}

/** Azure AI Foundry Model Router — single endpoint, auto-routing */
function getFoundryModel(task: TaskType): ModelSelection {
  // Model Router selects optimal model automatically
  // Routing mode configured at deployment: quality | cost | balanced
  return {
    provider: "foundry",
    model: "model-router",
    temperature: getTemperature(task),
    maxTokens: getMaxTokens(task),
  };
}

/** Anthropic — Opus 4.6 (quality) / Sonnet 4.6 (balanced) / Haiku 4.5 (speed) */
function getAnthropicModel(task: TaskType): ModelSelection {
  switch (task) {
    // Opus 4.6 — highest quality for conversation and summaries
    case "agent-response":
    case "chat":
    case "minutes":
    case "summary":
    case "research":
      return {
        provider: "anthropic",
        model: process.env.ANTHROPIC_MODEL_PREMIUM ?? "claude-opus-4-6-20250929",
        temperature: getTemperature(task),
        maxTokens: getMaxTokens(task),
      };

    // Sonnet 4.6 — balanced speed+quality for complex visualizations
    case "visual-gen":
    case "artifact":
      return {
        provider: "anthropic",
        model: process.env.ANTHROPIC_MODEL_BALANCED ?? "claude-sonnet-4-6-20250514",
        temperature: getTemperature(task),
        maxTokens: getMaxTokens(task),
      };

    // Haiku 4.5 — fast visuals for simple types (summary, checklist, monitor)
    case "visual-gen-fast":
    case "parse-fallback":
      return {
        provider: "anthropic",
        model: process.env.ANTHROPIC_MODEL_FAST ?? "claude-haiku-4-5-20251001",
        temperature: getTemperature(task),
        maxTokens: getMaxTokens(task),
      };

    // Deep analysis — Opus with low temperature for reasoning
    case "deep-analysis":
      return {
        provider: "anthropic",
        model: process.env.ANTHROPIC_MODEL_PREMIUM ?? "claude-opus-4-6-20250929",
        temperature: 0.1,
        maxTokens: 4000,
      };

    default:
      return {
        provider: "anthropic",
        model: "claude-sonnet-4-6-20250514",
        temperature: getTemperature(task),
        maxTokens: getMaxTokens(task),
      };
  }
}

/** OpenAI — Realtime 1.5 (voice) / o3 (reasoning) */
function getOpenAIModel(task: TaskType): ModelSelection {
  switch (task) {
    case "realtime-voice":
      return {
        provider: "openai",
        model: process.env.OPENAI_MODEL_REALTIME ?? "gpt-realtime-1.5",
        temperature: 0.6,
        maxTokens: 1000,
      };

    case "deep-analysis":
      return {
        provider: "openai",
        model: process.env.OPENAI_MODEL_REASONING ?? "o3",
        temperature: 0.1,
        maxTokens: 4000,
      };

    // Fallback for other tasks if Anthropic unavailable
    case "agent-response":
    case "chat":
    case "minutes":
    case "summary":
    case "research":
      return {
        provider: "openai",
        model: process.env.OPENAI_MODEL_PREMIUM ?? "gpt-4o",
        temperature: getTemperature(task),
        maxTokens: getMaxTokens(task),
      };

    default:
      return {
        provider: "openai",
        model: process.env.OPENAI_MODEL_FAST ?? "gpt-4o-mini",
        temperature: getTemperature(task),
        maxTokens: getMaxTokens(task),
      };
  }
}

// ── Temperature & Token Config ──

function getTemperature(task: TaskType): number {
  switch (task) {
    case "agent-response":
    case "chat":
    case "research":
      return 0.5;
    case "visual-gen":
    case "visual-gen-fast":
      return 0.2;
    case "minutes":
    case "summary":
      return 0.4;
    case "parse-fallback":
    case "artifact":
      return 0.1;
    case "deep-analysis":
      return 0.1;
    case "realtime-voice":
      return 0.6;
  }
}

function getMaxTokens(task: TaskType): number {
  switch (task) {
    case "artifact":
    case "deep-analysis":
      return 4000;
    case "minutes":
    case "summary":
    case "research":
      return 2000;
    case "agent-response":
    case "chat":
      return 1000;
    case "visual-gen":
      return 1500;
    case "visual-gen-fast":
      return 800;
    case "parse-fallback":
      return 500;
    case "realtime-voice":
      return 1000;
  }
}

// ── Client Singletons ──

let anthropicClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;
let foundryClient: OpenAI | null = null;

export function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY ?? "",
    });
  }
  return anthropicClient;
}

export function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY ?? "",
    });
  }
  return openaiClient;
}

/** Azure AI Foundry Model Router client (OpenAI-compatible endpoint) */
export function getFoundryClient(): OpenAI {
  if (!foundryClient) {
    foundryClient = new OpenAI({
      apiKey: process.env.AZURE_FOUNDRY_API_KEY ?? process.env.AZURE_OPENAI_API_KEY ?? "",
      baseURL: process.env.AZURE_FOUNDRY_MODEL_ROUTER_ENDPOINT ?? "",
      defaultQuery: {
        "api-version": process.env.AZURE_OPENAI_API_VERSION ?? "2025-11-18",
      },
      defaultHeaders: {
        "api-key": process.env.AZURE_FOUNDRY_API_KEY ?? process.env.AZURE_OPENAI_API_KEY ?? "",
      },
    });
  }
  return foundryClient;
}

// ── Backward Compat (legacy callers) ──

/** @deprecated Use getModelForTask() which returns ModelSelection */
export function getModelName(task: TaskType): string {
  return getModelForTask(task).model;
}

/** @deprecated Use getModelForTask().temperature */
export function getTemperatureForTask(task: TaskType): number {
  return getModelForTask(task).temperature;
}
