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
  // ash: confident male — fits executive COO
  coo: { role: "coo", voiceName: "en-US-Guy:DragonHDLatestNeural", openaiVoice: "ash", locale: "en-US", temperature: 0.8 },
  // coral: warm female — fits analytical CFO
  cfo: { role: "cfo", voiceName: "en-US-Ava:DragonHDLatestNeural", openaiVoice: "coral", locale: "en-US", temperature: 0.7 },
  // ballad: warm engaging male — fits passionate CMO
  cmo: { role: "cmo", voiceName: "en-US-Andrew:DragonHDLatestNeural", openaiVoice: "ballad", locale: "en-US", temperature: 0.9 },
  // echo: clear male — fits pragmatic CTO
  cto: { role: "cto", voiceName: "en-US-Brian:DragonHDLatestNeural", openaiVoice: "echo", locale: "en-US", temperature: 0.7 },
  // verse: versatile male — fits creative CDO (Jonas is male)
  cdo: { role: "cdo", voiceName: "en-US-Emma:DragonHDLatestNeural", openaiVoice: "verse", locale: "en-US", temperature: 0.9 },
  // sage: authoritative male — fits formal CLO
  clo: { role: "clo", voiceName: "en-US-Davis:DragonHDLatestNeural", openaiVoice: "sage", locale: "en-US", temperature: 0.6 },
};

/** Sophia voice config — mature female, brief announcements */
export const SOPHIA_VOICE: AgentVoiceConfig = {
  role: "sophia",
  voiceName: "en-US-Jenny:DragonHDLatestNeural",
  openaiVoice: "shimmer",
  locale: "en-US",
  temperature: 0.5,
};
