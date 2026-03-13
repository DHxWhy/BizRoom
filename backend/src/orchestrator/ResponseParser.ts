// backend/src/orchestrator/ResponseParser.ts
// 3-tier parse strategy for raw LLM output → StructuredAgentOutput
// Tier 1: Direct JSON parse + schema validation
// Tier 2: JSON repair (markdown fences, raw braces)
// Tier 3: Graceful fallback (plain text → speech)

import type { AgentRole, Mention, VisualHint, StructuredAgentOutput } from "../models/index.js";

export type ParseTier = "schema_valid" | "json_repaired" | "fallback";

export interface ParseResult {
  data: StructuredAgentOutput;
  tier: ParseTier;
  error?: string;
}

const VALID_INTENTS = new Set(["opinion", "confirm"]);
const VALID_TARGETS = new Set(["coo", "cfo", "cmo", "cto", "cdo", "clo", "chairman"]);
const VALID_VISUAL_TYPES = new Set([
  "comparison", "pie-chart", "bar-chart", "timeline", "checklist", "summary", "architecture",
]);

/** Max speech length for Tier 3 fallback */
const MAX_FALLBACK_SPEECH = 300;

function parseMention(raw: unknown, selfRole: AgentRole): Mention | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.target !== "string" || typeof m.intent !== "string") return null;
  if (!VALID_INTENTS.has(m.intent)) return null;
  // Self-mention guard: agent should not mention itself
  if (m.target === selfRole) return null;
  const isValidRole = VALID_TARGETS.has(m.target);
  const isMemberTarget = m.target.startsWith("member:");
  if (!isValidRole && !isMemberTarget) return null;
  return {
    target: m.target as Mention["target"],
    intent: m.intent as "opinion" | "confirm",
    options: Array.isArray(m.options) ? m.options.map(String) : undefined,
  };
}

function parseVisualHint(raw: unknown): VisualHint | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.type !== "string" || typeof v.title !== "string") return null;
  if (!VALID_VISUAL_TYPES.has(v.type)) return null;
  return { type: v.type as VisualHint["type"], title: v.title };
}

function validateAndExtract(
  parsed: Record<string, unknown>,
  selfRole: AgentRole,
): StructuredAgentOutput | null {
  if (typeof parsed.speech !== "string") return null;
  return {
    speech: parsed.speech,
    key_points: Array.isArray(parsed.key_points)
      ? parsed.key_points.filter((k): k is string => typeof k === "string")
      : [],
    mention: parseMention(parsed.mention, selfRole),
    visual_hint: parseVisualHint(parsed.visual_hint),
  };
}

/**
 * Parse raw LLM output into StructuredAgentOutput using a 3-tier strategy.
 *
 * @param raw - Raw string output from LLM
 * @param selfRole - The agent role producing this output (for self-mention filtering)
 * @returns ParseResult with typed data, tier indicator, and optional error
 */
export function parseStructuredOutput(raw: string, selfRole: AgentRole): ParseResult {
  // Tier 1: Direct parse + schema validation
  try {
    const parsed = JSON.parse(raw);
    const data = validateAndExtract(parsed, selfRole);
    if (data) {
      return { data, tier: "schema_valid" };
    }
  } catch {
    // Not valid JSON — continue to Tier 2
  }

  // Tier 2: Repair — extract JSON from markdown fences or raw braces
  const jsonMatch = raw.match(/```json?\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
  if (jsonMatch) {
    try {
      const repaired = JSON.parse(jsonMatch[1]);
      const data = validateAndExtract(repaired, selfRole);
      if (data) {
        return { data, tier: "json_repaired" };
      }
    } catch {
      // Repair failed — continue to Tier 3
    }
  }

  // Tier 3: Graceful fallback — treat raw text as speech
  return {
    data: {
      speech: raw.slice(0, MAX_FALLBACK_SPEECH),
      key_points: [],
      mention: null,
      visual_hint: null,
    },
    tier: "fallback",
    error: `Failed to parse structured output from ${selfRole}`,
  };
}
