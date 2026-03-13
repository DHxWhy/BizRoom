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
    <div
      className="mt-2 bg-neutral-900/60 backdrop-blur-sm border border-neutral-700/20
                 rounded-xl px-4 py-2.5 min-w-[160px]
                 opacity-0 animate-[fadeIn_0.4s_ease-out_forwards]"
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-sm font-medium text-neutral-200">
            {S.meeting.phase[phase]}
          </span>
        </div>
        {agenda && <span className="text-[11px] text-neutral-400 ml-3">{agenda}</span>}
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
