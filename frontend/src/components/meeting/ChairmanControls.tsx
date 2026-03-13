// Chairman-only control bar for meeting management
// Ref: Design Spec §4.1, §4.2

import { useState, useCallback } from "react";
import { S } from "../../constants/strings";
import { API_BASE } from "../../config/api";

interface ChairmanControlsProps {
  roomId: string;
  isChairman: boolean;
  disabled?: boolean;
}

export function ChairmanControls({
  roomId,
  isChairman,
  disabled,
}: ChairmanControlsProps) {
  const [aiPaused, setAiPaused] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  const callApi = useCallback(
    async (endpoint: string, body: Record<string, unknown>) => {
      setLoading(endpoint);
      try {
        await fetch(`${API_BASE}/api/meeting/${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (err) {
        console.error(`[ChairmanControls] ${endpoint} failed:`, err);
      } finally {
        setLoading(null);
      }
    },
    [],
  );

  const handleAiOpinion = useCallback(() => {
    callApi("request-ai-opinion", { roomId });
  }, [roomId, callApi]);

  const handleNextAgenda = useCallback(() => {
    callApi("next-agenda", { roomId, agenda: "" });
  }, [roomId, callApi]);

  const handleTogglePause = useCallback(() => {
    const next = !aiPaused;
    setAiPaused(next);
    callApi("toggle-ai-pause", { roomId, paused: next });
  }, [roomId, aiPaused, callApi]);

  if (!isChairman) return null;

  const btnClass = (isActive: boolean = false) =>
    `px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
      isActive
        ? "bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30"
        : "bg-neutral-800/60 text-neutral-300 hover:bg-neutral-700/60 hover:text-white"
    } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`;

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-neutral-900/40 backdrop-blur-sm rounded-xl border border-neutral-700/20">
      <button
        type="button"
        onClick={handleAiOpinion}
        disabled={disabled || loading === "request-ai-opinion"}
        className={btnClass()}
      >
        {S.chairman.requestAiOpinion}
      </button>
      <button
        type="button"
        onClick={handleNextAgenda}
        disabled={disabled || loading === "next-agenda"}
        className={btnClass()}
      >
        {S.chairman.nextAgenda}
      </button>
      <button
        type="button"
        onClick={handleTogglePause}
        disabled={disabled}
        className={btnClass(aiPaused)}
      >
        {aiPaused ? S.chairman.resumeAi : S.chairman.pauseAi}
      </button>
    </div>
  );
}
