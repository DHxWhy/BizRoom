// Turn-taking timing constants
// Ref: Design Spec §2.3, §2.5

/** Chairman flush delay — near-instant AI trigger after Chairman speaks */
export const CHAIRMAN_FLUSH_MS = 300;

/** Member flush delay — wait for additional inputs */
export const MEMBER_FLUSH_MS = 2000;

/** Gap between sequential agent responses (DialogLab rule) */
export const INTER_AGENT_GAP_MS = 1500;

/** Maximum agents responding per turn (DialogLab constraint) */
export const MAX_AGENTS_PER_TURN = 2;

/** Maximum A2A follow-up rounds */
export const MAX_FOLLOW_UP_ROUNDS = 2;

/** Immediate flush for Chairman "AI opinion" button */
export const IMMEDIATE_FLUSH_MS = 0;

/** Timeout for human response during awaiting state (Spec §2) */
export const HUMAN_CALLOUT_TIMEOUT_MS = 30000;
