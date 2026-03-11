// Mic on/off toggle button
// Ref: Design Spec §3.1

import { S } from "../../constants/strings";

interface MicToggleProps {
  isMicOn: boolean;
  isConnecting: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export function MicToggle({
  isMicOn,
  isConnecting,
  onToggle,
  disabled,
}: MicToggleProps) {
  const label = isConnecting
    ? S.mic.connecting
    : isMicOn
      ? S.mic.on
      : S.mic.off;

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled || isConnecting}
      aria-label={label}
      title={label}
      className={`
        flex items-center justify-center w-10 h-10 rounded-xl transition-all
        ${
          isMicOn
            ? "bg-red-500/20 text-red-400 hover:bg-red-500/30 ring-1 ring-red-500/30"
            : "bg-neutral-800/60 text-neutral-400 hover:bg-neutral-700/60 hover:text-neutral-200"
        }
        ${isConnecting ? "animate-pulse" : ""}
        ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
      `}
    >
      {isConnecting ? (
        <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="2"
            opacity="0.3"
          />
          <path
            d="M12 2a10 10 0 0110 10"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {isMicOn ? (
            <>
              <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
              <path d="M19 10v2a7 7 0 01-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </>
          ) : (
            <>
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
              <path d="M17 16.95A7 7 0 015 12v-2m14 0v2c0 .87-.16 1.7-.45 2.47" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </>
          )}
        </svg>
      )}
    </button>
  );
}
