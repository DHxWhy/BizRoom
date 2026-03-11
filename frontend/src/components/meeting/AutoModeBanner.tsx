import { S } from "../../constants/strings";

interface AutoModeBannerProps {
  isRunning: boolean;
  onStop: () => void;
}

export function AutoModeBanner({ isRunning, onStop }: AutoModeBannerProps) {
  if (!isRunning) return null;

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-amber-900/20 border-b border-amber-600/20">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
        <span className="text-xs text-amber-300 font-medium">
          {S.mode.autoObserving}
        </span>
      </div>
      <button
        onClick={onStop}
        className="text-xs px-2.5 py-1 rounded-md bg-amber-600/20 text-amber-300 hover:bg-amber-600/30 border border-amber-600/30 transition-colors"
      >
        {S.input.stopAuto}
      </button>
    </div>
  );
}
