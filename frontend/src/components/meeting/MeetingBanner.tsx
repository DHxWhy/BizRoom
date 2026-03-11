import { S } from "../../constants/strings";
import type { MeetingPhase } from "../../types";

interface MeetingBannerProps {
  phase: MeetingPhase;
  agenda?: string;
}

const PHASES: MeetingPhase[] = ["opening", "briefing", "discussion", "decision", "action", "closing"];

export function MeetingBanner({ phase, agenda }: MeetingBannerProps) {
  if (phase === "idle") return null;

  const currentIndex = PHASES.indexOf(phase);
  const progress = ((currentIndex + 1) / PHASES.length) * 100;

  return (
    <div className="border-b border-neutral-700/30 bg-neutral-950/60 backdrop-blur-xl px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-sm font-medium">
            {S.meeting.phase[phase]}
          </span>
        </div>
        {agenda && <span className="text-xs text-neutral-400">{agenda}</span>}
      </div>
      <div className="h-1 bg-neutral-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-500 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
