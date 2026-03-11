// Agent voice metadata for frontend display
// Ref: Design Spec §1.1

import type { AgentRole } from "../types";

export interface AgentVoiceInfo {
  role: AgentRole;
  voiceName: string;
  color: string; // hex color for UI
}

export const AGENT_VOICE_INFO: Record<AgentRole, AgentVoiceInfo> = {
  coo: { role: "coo", voiceName: "Guy", color: "#3b82f6" },
  cfo: { role: "cfo", voiceName: "Ava", color: "#10b981" },
  cmo: { role: "cmo", voiceName: "Andrew", color: "#f97316" },
  cto: { role: "cto", voiceName: "Brian", color: "#06b6d4" },
  cdo: { role: "cdo", voiceName: "Emma", color: "#ec4899" },
  clo: { role: "clo", voiceName: "Davis", color: "#84cc16" },
};
