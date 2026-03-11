// Agent → Azure HD Voice mapping
// Ref: Design Spec §1.1

import type { AgentRole } from "../models/index.js";

export interface AgentVoiceConfig {
  role: AgentRole;
  voiceName: string;       // Azure Voice Live HD voice identifier (DragonHDLatest)
  locale: string;
  temperature: number;
}

/** Voice Live API voice configuration per agent — Spec §1.1 (DragonHDLatest voices) */
export const AGENT_VOICES: Record<AgentRole, AgentVoiceConfig> = {
  coo: { role: "coo", voiceName: "en-US-Guy:DragonHDLatestNeural", locale: "en-US", temperature: 0.8 },
  cfo: { role: "cfo", voiceName: "en-US-Ava:DragonHDLatestNeural", locale: "en-US", temperature: 0.7 },
  cmo: { role: "cmo", voiceName: "en-US-Andrew:DragonHDLatestNeural", locale: "en-US", temperature: 0.9 },
  cto: { role: "cto", voiceName: "en-US-Brian:DragonHDLatestNeural", locale: "en-US", temperature: 0.7 },
  cdo: { role: "cdo", voiceName: "en-US-Emma:DragonHDLatestNeural", locale: "en-US", temperature: 0.9 },
  clo: { role: "clo", voiceName: "en-US-Davis:DragonHDLatestNeural", locale: "en-US", temperature: 0.6 },
};
