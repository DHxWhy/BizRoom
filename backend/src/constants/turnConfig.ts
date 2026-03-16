// Turn-taking timing constants
// Ref: Design Spec §2.3, §2.5

/** CEO flush delay — PTT release = speech done, trigger immediately */
export const CEO_FLUSH_MS = 0;

/** Member flush delay — short wait for PTT users */
export const MEMBER_FLUSH_MS = 500;

/** Gap between sequential agent responses — minimal for snappy conversation */
export const INTER_AGENT_GAP_MS = 500;

/** Maximum agents responding per turn — 1 agent per turn, user-driven flow */
export const MAX_AGENTS_PER_TURN = 1;

/** Maximum A2A follow-up rounds — agent mentions trigger next agent */
export const MAX_FOLLOW_UP_ROUNDS = 1;

/** Immediate flush for CEO "AI opinion" button */
export const IMMEDIATE_FLUSH_MS = 0;

/** Timeout for human response during awaiting state (Spec §2) */
export const HUMAN_CALLOUT_TIMEOUT_MS = 30000;
