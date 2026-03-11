import { S } from "../../constants/strings";

interface PushToTalkProps {
  /** Whether voice recording is currently active. */
  isRecording: boolean;
  /** Whether the Web Speech API is available in this browser. */
  isSupported: boolean;
  /** Toggle recording on/off (for click-based activation). */
  onToggle: () => void;
}

/**
 * Microphone button that shows recording state.
 * Hidden entirely when the browser does not support Web Speech API.
 */
export function PushToTalk({
  isRecording,
  isSupported,
  onToggle,
}: PushToTalkProps) {
  if (!isSupported) return null;

  return (
    <button
      onClick={onToggle}
      className={`p-2 rounded-lg transition-all ${
        isRecording
          ? "bg-red-500/20 text-red-400 animate-pulse"
          : "bg-neutral-800 text-neutral-400 hover:text-neutral-200"
      }`}
      title={isRecording ? S.input.recording : S.input.pttHint}
    >
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
      </svg>
    </button>
  );
}
