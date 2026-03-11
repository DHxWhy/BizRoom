import { useCallback } from "react";
import type { MeetingMode } from "../../types";

interface ModeSelectorProps {
  currentMode: MeetingMode;
  onModeChange: (mode: MeetingMode) => void;
  disabled?: boolean;
}

const MODES: { key: MeetingMode; label: string; icon: string; desc: string }[] = [
  {
    key: "live",
    label: "Live",
    icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
    desc: "사용자 주도 실시간 회의",
  },
  {
    key: "auto",
    label: "Auto",
    icon: "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
    desc: "AI 자율 토론",
  },
  {
    key: "dm",
    label: "DM",
    icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
    desc: "1:1 대화",
  },
];

export function ModeSelector({ currentMode, onModeChange, disabled }: ModeSelectorProps) {
  const handleClick = useCallback(
    (mode: MeetingMode) => {
      if (!disabled && mode !== currentMode) {
        onModeChange(mode);
      }
    },
    [currentMode, onModeChange, disabled],
  );

  return (
    <div className="flex items-center gap-1 bg-neutral-900/80 backdrop-blur-xl rounded-xl p-1 border border-neutral-700/30">
      {MODES.map((mode) => {
        const isActive = currentMode === mode.key;
        return (
          <button
            key={mode.key}
            onClick={() => handleClick(mode.key)}
            disabled={disabled}
            title={mode.desc}
            className={`
              relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
              transition-all duration-200 ease-out
              ${
                isActive
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60"
              }
              disabled:opacity-30 disabled:cursor-not-allowed
            `}
            aria-pressed={isActive}
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={mode.icon} />
            </svg>
            <span>{mode.label}</span>
          </button>
        );
      })}
    </div>
  );
}
