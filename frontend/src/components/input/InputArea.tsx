import { useState, useCallback } from "react";
import type { KeyboardEvent } from "react";
import { S } from "../../constants/strings";
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

export function InputArea({ onSend, disabled, placeholder, sendLabel, isMicOn, isMicConnecting, onMicToggle }: InputAreaProps) {
  const [text, setText] = useState("");

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed, false);
    setText("");
  }, [text, disabled, onSend]);

  // Voice input: auto-send when transcript is ready
  const { status: pttStatus, isSupported: pttSupported, startRecording, stopRecording } = usePushToTalk({
    onTranscript: useCallback((transcript: string) => {
      if (transcript.trim() && !disabled) {
        onSend(transcript.trim(), true);
      }
    }, [onSend, disabled]),
  });

  const isRecording = pttStatus === "recording";

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-neutral-700/30 p-3">
      {/* Recording indicator */}
      {isRecording && (
        <div className="flex items-center gap-2 mb-2 px-4 py-2 bg-red-900/30 rounded-lg text-red-400 text-sm">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          {S.input.recording}
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
            disabled={disabled}
            className={`p-2 rounded-lg transition-colors ${
              isRecording
                ? "bg-red-600 text-white animate-pulse"
                : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700"
            } disabled:opacity-30 disabled:cursor-not-allowed`}
            title="길게 눌러 음성 입력 (또는 스페이스바)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" x2="12" y1="19" y2="22"/>
            </svg>
          </button>
        )}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isRecording ? S.input.recording : (placeholder ?? S.input.placeholder)}
          rows={1}
          disabled={disabled || isRecording}
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
        <p className="text-xs text-neutral-600 mt-1 px-1">
          {S.input.pttHint}
        </p>
      )}
    </div>
  );
}
