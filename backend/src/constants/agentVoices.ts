// Agent → Voice mapping (Azure HD + OpenAI fallback)
// Ref: Design Spec §1.1

import type { AgentRole, AllAgentRole } from "../models/index.js";

export interface AgentVoiceConfig {
  role: AllAgentRole;
  voiceName: string; // Azure Voice Live HD voice identifier (DragonHDLatest)
  openaiVoice: string; // OpenAI Realtime API voice name (fallback)
  locale: string;
  temperature: number;
}

/** Voice configuration per agent — Azure primary, OpenAI fallback */
export const AGENT_VOICES: Record<AgentRole, AgentVoiceConfig> = {
  coo: { role: "coo", voiceName: "en-US-Guy:DragonHDLatestNeural", openaiVoice: "ash", locale: "en-US", temperature: 0.8 },
  cfo: { role: "cfo", voiceName: "en-US-Ava:DragonHDLatestNeural", openaiVoice: "coral", locale: "en-US", temperature: 0.7 },
  cmo: { role: "cmo", voiceName: "en-US-Andrew:DragonHDLatestNeural", openaiVoice: "ballad", locale: "en-US", temperature: 0.9 },
  cto: { role: "cto", voiceName: "en-US-Brian:DragonHDLatestNeural", openaiVoice: "echo", locale: "en-US", temperature: 0.7 },
  cdo: { role: "cdo", voiceName: "en-US-Emma:DragonHDLatestNeural", openaiVoice: "shimmer", locale: "en-US", temperature: 0.9 },
  clo: { role: "clo", voiceName: "en-US-Davis:DragonHDLatestNeural", openaiVoice: "sage", locale: "en-US", temperature: 0.6 },
};

/** Sophia voice config — brief announcements only */
export const SOPHIA_VOICE: AgentVoiceConfig = {
  role: "sophia",
  voiceName: "en-US-Jenny:DragonHDLatestNeural",
  openaiVoice: "alloy",
  locale: "en-US",
  temperature: 0.5,
};
