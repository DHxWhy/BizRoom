import type { MeetingPhase } from "../models/index.js";

// Valid phase transitions
const VALID_TRANSITIONS: Record<MeetingPhase, MeetingPhase[]> = {
  idle: ["opening"],
  opening: ["briefing"],
  briefing: ["discussion"],
  discussion: ["decision", "briefing"],
  decision: ["action", "discussion"],
  action: ["closing", "discussion"],
  closing: ["idle"],
};

// Who can trigger phase transitions
type TransitionRole = "chairman" | "coo";

const TRANSITION_PERMISSIONS: Record<TransitionRole, boolean> = {
  chairman: true, // Chairman can trigger any transition
  coo: true, // COO can trigger limited transitions
};

/** Check whether a phase transition is valid and the role is permitted */
export function canTransitionPhase(
  currentPhase: MeetingPhase,
  targetPhase: MeetingPhase,
  role: string,
): boolean {
  // Check role permission
  const normalizedRole = role.toLowerCase();
  if (
    normalizedRole !== "chairman" &&
    normalizedRole !== "coo"
  ) {
    return false;
  }
  if (!TRANSITION_PERMISSIONS[normalizedRole]) {
    return false;
  }

  // Check valid transition
  const validTargets = VALID_TRANSITIONS[currentPhase];
  return validTargets?.includes(targetPhase) ?? false;
}

/** Get the default next phase from the current one (first valid transition) */
export function getNextPhase(currentPhase: MeetingPhase): MeetingPhase | null {
  const transitions = VALID_TRANSITIONS[currentPhase];
  return transitions?.[0] ?? null;
}

/** Get a human-readable description of a meeting phase */
export function getPhaseDescription(phase: MeetingPhase): string {
  const descriptions: Record<MeetingPhase, string> = {
    idle: "대기 중 — 회의 시작 전",
    opening: "개회 — 안건 정리 및 참석자 확인",
    briefing: "브리핑 — 현황 보고 및 데이터 공유",
    discussion: "토론 — 안건별 심층 논의",
    decision: "의사결정 — Chairman 판단 및 결정",
    action: "실행계획 — 액션아이템 수립 및 담당자 지정",
    closing: "폐회 — 요약 및 다음 회의 안내",
  };
  return descriptions[phase];
}

/** Return all meeting phases in order */
export function getAllPhases(): MeetingPhase[] {
  return ["idle", "opening", "briefing", "discussion", "decision", "action", "closing"];
}
