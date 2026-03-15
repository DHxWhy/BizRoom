import { useState, useCallback, useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import { S } from "../../constants/strings";
import { useWhisperPTT } from "../../hooks/useWhisperPTT";
import { usePushToTalk } from "../../hooks/usePushToTalk";
import { MicToggle } from "./MicToggle";

interface InputAreaProps {
  onSend: (content: string, isVoiceInput?: boolean) => void;
  disabled?: boolean;
  placeholder?: string;
  sendLabel?: string;
  // Voice Live mic toggle
  isMicOn?: boolean;
  isMicConnecting?: boolean;
  onMicToggle?: () => void;
}

export function InputArea({
  onSend,
  disabled,
  placeholder,
  sendLabel,
  isMicOn,
  isMicConnecting,
  onMicToggle,
}: InputAreaProps) {
  const [text, setText] = useState("");

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed, false);
    setText("");
  }, [text, disabled, onSend]);

  const handleTranscript = useCallback(
    (transcript: string) => {
      if (transcript.trim() && !disabled) {
        onSend(transcript.trim(), true);
      }
    },
    [onSend, disabled],
  );

  // ── Primary STT: Whisper API via MediaRecorder ──
  const {
    status: whisperStatus,
    isSupported: whisperSupported,
    startRecording: whisperStart,
    stopRecording: whisperStop,
  } = useWhisperPTT({
    onTranscript: handleTranscript,
    lang: "ko",
    // Primer vocabulary hint — improves Whisper accuracy for BizRoom domain terms
    prompt: "BizRoom, COO, CFO, CMO, CTO, 회의, 전략, 예산, 마케팅",
  });

  // ── Fallback STT: Web Speech API (used only if Whisper/MediaRecorder unavailable) ──
  const {
    status: webSpeechStatus,
    isSupported: webSpeechSupported,
    startRecording: webSpeechStart,
    stopRecording: webSpeechStop,
  } = usePushToTalk({
    onTranscript: handleTranscript,
    lang: "ko-KR",
  });

  // Decide which STT backend to use
  const useWhisper = whisperSupported;
  const pttSupported = whisperSupported || webSpeechSupported;

  const startRecording = useWhisper ? whisperStart : webSpeechStart;
  const stopRecording = useWhisper ? whisperStop : webSpeechStop;

  const pttStatus = useWhisper ? whisperStatus : webSpeechStatus;
  const isRecording = pttStatus === "recording";
  const isProcessing = pttStatus === "processing";

  // ── Space-bar hold-to-talk (Whisper path) ──
  // Wire keyboard shortcut directly here so it also routes through Whisper,
  // not just through the Web Speech API handler inside usePushToTalk.
  // usePushToTalk still attaches its own listener when it is the active path,
  // so we only attach the Whisper space listener when whisperSupported is true.
  const startRef = useRef(startRecording);
  const stopRef = useRef(stopRecording);

  // Keep refs in sync with latest callbacks without re-binding the Space listener
  useEffect(() => {
    startRef.current = startRecording;
    stopRef.current = stopRecording;
  });

  useEffect(() => {
    if (!useWhisper) return; // usePushToTalk handles Space in this case

    let spacePttActivated = false;
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    let targetElement: EventTarget | null = null;

    const handleKeyDown = (e: KeyboardEvent | globalThis.KeyboardEvent) => {
      if (e.code !== "Space" || (e as globalThis.KeyboardEvent).repeat) return;

      const inTextInput =
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLInputElement;

      if (!inTextInput) {
        e.preventDefault();
        spacePttActivated = true;
        startRef.current();
        return;
      }

      // Inside text fields: 400 ms long-press activates PTT
      spacePttActivated = false;
      targetElement = e.target;

      longPressTimer = setTimeout(() => {
        spacePttActivated = true;
        longPressTimer = null;

        // Remove the space character typed at keydown
        if (
          targetElement instanceof HTMLTextAreaElement ||
          targetElement instanceof HTMLInputElement
        ) {
          const el = targetElement;
          const val = el.value;
          const pos = el.selectionStart ?? val.length;
          if (pos > 0 && val[pos - 1] === " ") {
            el.value = val.slice(0, pos - 1) + val.slice(pos);
            el.selectionStart = pos - 1;
            el.selectionEnd = pos - 1;
            el.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }

        startRef.current();
      }, 400);
    };

    const handleKeyUp = (e: globalThis.KeyboardEvent) => {
      if (e.code !== "Space") return;

      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }

      if (spacePttActivated) {
        stopRef.current();
        spacePttActivated = false;
      }

      targetElement = null;
    };

    window.addEventListener("keydown", handleKeyDown as EventListener);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown as EventListener);
      window.removeEventListener("keyup", handleKeyUp);
      if (longPressTimer) clearTimeout(longPressTimer);
    };
  }, [useWhisper]); // re-bind only when STT backend changes

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Status label shown in the recording indicator bar
  const statusLabel = isProcessing ? S.input.processing : S.input.recording;

  return (
    <div className="border-t border-neutral-700/30 p-3">
      {/* Recording / processing indicator */}
      {(isRecording || isProcessing) && (
        <div className="flex items-center gap-2 mb-2 px-4 py-2 bg-red-900/30 rounded-lg text-red-400 text-sm">
          <span
            className={`w-2 h-2 rounded-full ${isProcessing ? "bg-amber-400" : "bg-red-500 animate-pulse"}`}
          />
          {statusLabel}
          {useWhisper && isRecording && (
            <span className="ml-auto text-xs text-neutral-500">Whisper</span>
          )}
        </div>
      )}
      <div className="flex items-end gap-2 bg-neutral-800/80 backdrop-blur-sm rounded-xl px-4 py-3 border border-neutral-700/20">
        {/* Voice Live mic toggle */}
        {onMicToggle && (
          <MicToggle
            isMicOn={isMicOn ?? false}
            isConnecting={isMicConnecting ?? false}
            onToggle={onMicToggle}
            disabled={disabled}
          />
        )}
        {/* PTT mic button */}
        {pttSupported && (
          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            disabled={disabled || isProcessing}
            className={`p-2 rounded-lg transition-colors ${
              isRecording
                ? "bg-red-600 text-white animate-pulse"
                : isProcessing
                  ? "bg-amber-600/40 text-amber-300"
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700"
            } disabled:opacity-30 disabled:cursor-not-allowed`}
            title={
              isProcessing
                ? S.input.processing
                : isRecording
                  ? S.input.recording
                  : S.input.pttHint
            }
          >
            {isProcessing ? (
              /* Spinner while Whisper is processing */
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="animate-spin"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            ) : (
              /* Mic icon */
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            )}
          </button>
        )}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isRecording
              ? S.input.recording
              : isProcessing
                ? S.input.processing
                : (placeholder ?? S.input.placeholder)
          }
          rows={1}
          disabled={disabled || isRecording || isProcessing}
          aria-label="메시지 입력"
          className="flex-1 bg-transparent text-sm text-neutral-100 placeholder-neutral-500 resize-none outline-none max-h-32 focus-visible:ring-0"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || disabled}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
        >
          {sendLabel ?? S.input.send}
        </button>
      </div>
      {pttSupported && (
        <p className="text-xs text-neutral-600 mt-1 px-1">{S.input.pttHint}</p>
      )}
    </div>
  );
}
