// CEO-only control bar for meeting management
// Ref: Design Spec §4.1, §4.2

import { useState, useCallback } from "react";
import { S } from "../../constants/strings";
import { API_BASE } from "../../config/api";

interface CeoControlsProps {
  roomId: string;
  isCeo: boolean;
  disabled?: boolean;
}

export function CeoControls({
  roomId,
  isCeo,
  disabled,
}: CeoControlsProps) {
  const [aiPaused, setAiPaused] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [confirmingEnd, setConfirmingEnd] = useState(false);

  const callApi = useCallback(
    async (endpoint: string, body: Record<string, unknown>) => {
      setLoading(endpoint);
      try {
        const res = await fetch(`${API_BASE}/api/meeting/${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        return res;
      } catch (err) {
        console.error(`[CeoControls] ${endpoint} failed:`, err);
        return null;
      } finally {
        setLoading(null);
      }
    },
    [],
  );

  const handleAiOpinion = useCallback(() => {
    void callApi("request-ai-opinion", { roomId });
  }, [roomId, callApi]);

  const handleNextAgenda = useCallback(() => {
    void callApi("next-agenda", { roomId, agenda: "" });
  }, [roomId, callApi]);

  const handleTogglePause = useCallback(() => {
    const next = !aiPaused;
    setAiPaused(next);
    void callApi("toggle-ai-pause", { roomId, paused: next });
  }, [roomId, aiPaused, callApi]);

  // Two-step confirmation for destructive end-meeting action
  const handleEndMeeting = useCallback(async () => {
    if (!confirmingEnd) {
      setConfirmingEnd(true);
      return;
    }
    const res = await callApi("end", { roomId });
    setConfirmingEnd(false);
    if (res?.ok) {
      try {
        await res.json();
      } catch {
        // Response may not be JSON — that is acceptable
      }
    }
  }, [roomId, callApi, confirmingEnd]);

  // Cancel confirmation if user clicks away
  const handleCancelEnd = useCallback(() => {
    setConfirmingEnd(false);
  }, []);

  if (!isCeo) return null;

  const btnClass = (isActive: boolean = false) =>
    `px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
      isActive
        ? "bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30"
        : "bg-neutral-800/60 text-neutral-300 hover:bg-neutral-700/60 hover:text-white"
    } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`;

  const endBtnClass = confirmingEnd
    ? "px-3 py-1.5 text-xs font-medium rounded-lg transition-all bg-red-600 text-white ring-1 ring-red-500 animate-pulse"
    : `px-3 py-1.5 text-xs font-medium rounded-lg transition-all bg-red-900/40 text-red-400 hover:bg-red-800/50 hover:text-red-300 ring-1 ring-red-700/30 ${disabled ? "opacity-40 cursor-not-allowed" : ""}`;

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-neutral-900/40 backdrop-blur-sm rounded-xl border border-neutral-700/20">
      <button
        type="button"
        onClick={handleAiOpinion}
        disabled={disabled || loading === "request-ai-opinion"}
        className={btnClass()}
      >
        {S.ceo.requestAiOpinion}
      </button>
      <button
        type="button"
        onClick={handleNextAgenda}
        disabled={disabled || loading === "next-agenda"}
        className={btnClass()}
      >
        {S.ceo.nextAgenda}
      </button>
      <button
        type="button"
        onClick={handleTogglePause}
        disabled={disabled}
        className={btnClass(aiPaused)}
      >
        {aiPaused ? S.ceo.resumeAi : S.ceo.pauseAi}
      </button>

      {/* Separator before destructive action */}
      <div className="w-px h-5 bg-neutral-700/30 mx-1" />

      {/* End meeting — two-step confirmation */}
      <button
        type="button"
        onClick={() => void handleEndMeeting()}
        disabled={disabled || loading === "end"}
        className={endBtnClass}
        title={S.ceo.endMeetingConfirm}
      >
        {confirmingEnd ? `${S.ceo.endMeeting}?` : S.ceo.endMeeting}
      </button>
      {confirmingEnd && (
        <button
          type="button"
          onClick={handleCancelEnd}
          className="px-2 py-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          &times;
        </button>
      )}
    </div>
  );
}
