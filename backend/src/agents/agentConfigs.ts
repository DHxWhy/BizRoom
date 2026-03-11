import type { AgentRole } from "../models/index.js";
import { getCOOPrompt } from "./prompts/coo-hudson.js";
import { getCFOPrompt } from "./prompts/cfo-amelia.js";
import { getCMOPrompt } from "./prompts/cmo-yusef.js";

export interface AgentConfig {
  role: AgentRole;
  name: string;
  icon: string;
  color: string;
  getSystemPrompt: (context: {
    participants: string;
    agenda: string;
    history: string;
  }) => string;
}

export const AGENT_CONFIGS: Record<string, AgentConfig> = {
  coo: {
    role: "coo",
    name: "Hudson",
    icon: "\u{1F4CB}",
    color: "#3B82F6",
    getSystemPrompt: getCOOPrompt,
  },
  cfo: {
    role: "cfo",
    name: "Amelia",
    icon: "\u{1F4B0}",
    color: "#10B981",
    getSystemPrompt: getCFOPrompt,
  },
  cmo: {
    role: "cmo",
    name: "Yusef",
    icon: "\u{1F4E3}",
    color: "#F97316",
    getSystemPrompt: getCMOPrompt,
  },
};
