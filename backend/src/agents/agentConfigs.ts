import type { AgentRole } from "../models/index.js";
import { getCOOPrompt } from "./prompts/coo-hudson.js";
import { getCFOPrompt } from "./prompts/cfo-amelia.js";
import { getCMOPrompt } from "./prompts/cmo-yusef.js";
import { getCTOPrompt } from "./prompts/cto-kelvin.js";
import { getCDOPrompt } from "./prompts/cdo-jonas.js";
import { getCLOPrompt } from "./prompts/clo-bradley.js";

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
  cto: {
    role: "cto",
    name: "Kelvin",
    icon: "\u{1F6E0}\u{FE0F}",
    color: "#06B6D4",
    getSystemPrompt: getCTOPrompt,
  },
  cdo: {
    role: "cdo",
    name: "Jonas",
    icon: "\u{1F3A8}",
    color: "#EC4899",
    getSystemPrompt: getCDOPrompt,
  },
  clo: {
    role: "clo",
    name: "Bradley",
    icon: "\u{2696}\u{FE0F}",
    color: "#84CC16",
    getSystemPrompt: getCLOPrompt,
  },
};
