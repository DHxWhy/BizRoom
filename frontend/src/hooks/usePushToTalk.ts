import { useState, useCallback, useRef, useEffect } from "react";

type PTTStatus = "idle" | "recording" | "processing";

// Web Speech API type declarations (not in standard lib.dom.d.ts)
interface SpeechRecognitionEvent {
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  readonly isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition: SpeechRecognitionCtor;
    webkitSpeechRecognition: SpeechRecognitionCtor;
  }
}

interface UsePushToTalkOptions {
  /** Called with the final transcript when recording stops. */
  onTranscript?: (text: string) => void;
  /** BCP-47 language tag for recognition (default: "ko-KR"). */
  lang?: string;
}

/**
 * Push-to-talk voice input hook using Web Speech API.
 *
 * - Hold Space to record, release to stop (ignores Space when focus is in text fields).
 * - Also exposes `startRecording` / `stopRecording` for programmatic or button control.
 * - Handles browsers that lack SpeechRecognition gracefully (`isSupported = false`).
 */
export function usePushToTalk(options: UsePushToTalkOptions = {}) {
  const [status, setStatus] = useState<PTTStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const isRecordingRef = useRef(false);
  const transcriptRef = useRef("");

  // Keep a stable ref to latest options so callbacks always use fresh values
  // without needing to re-create the recognition instance.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const isSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const startRecording = useCallback(() => {
    if (!isSupported || isRecordingRef.current) return;

    const Ctor: SpeechRecognitionCtor =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new Ctor();
    recognition.lang = optionsRef.current.lang ?? "ko-KR";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = "";
      let interimTranscript = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      // Use final transcript if available, otherwise use interim as fallback
      // (short utterances may not reach isFinal before stop() is called)
      const best = finalTranscript || interimTranscript;
      if (best) {
        transcriptRef.current = best;
        setTranscript(best);
      }
    };

    recognition.onerror = (event) => {
      // "aborted" is expected when stop() is called — not a real error
      if (event.error !== "aborted") {
        console.error("Speech recognition error:", event.error);
      }
      // Do NOT reset state here. The browser always fires onend after onerror,
      // so let onend be the single authoritative cleanup path. Resetting here
      // causes onend to see isRecordingRef=false and skip nulling recognitionRef,
      // leaving a stale dead instance that breaks the next recording attempt.
    };

    recognition.onend = () => {
      // onend is the single authoritative cleanup point — fires after both
      // normal stop() calls and after onerror (browser always fires both).
      const wasRecording = isRecordingRef.current;
      isRecordingRef.current = false;
      // Always clear the ref so the next startRecording() gets a fresh instance
      // and stopRecording() cannot accidentally stop a stale dead instance.
      recognitionRef.current = null;

      // Deliver transcript whether stopped by user (button release)
      // or auto-stopped by browser timeout (~60s)
      const finalText = transcriptRef.current;
      if (wasRecording && finalText) {
        setStatus("processing");
        optionsRef.current.onTranscript?.(finalText);
      }
      setStatus("idle");
    };

    recognitionRef.current = recognition;
    isRecordingRef.current = true;
    transcriptRef.current = "";
    setTranscript("");
    setStatus("recording");
    recognition.start();
  }, [isSupported]);

  const stopRecording = useCallback(() => {
    // Safe to call even if recognition already auto-stopped (browser timeout).
    // Capture and immediately null the ref so a concurrent startRecording()
    // cannot race and have stopRecording() acting on the wrong instance.
    const recognition = recognitionRef.current;
    if (recognition) {
      recognitionRef.current = null;
      try {
        recognition.stop();
      } catch {
        // Already stopped — ignore. onend will fire and clean up state.
      }
    }
  }, []);

  // Space bar hold-to-talk: hold Space to record, release to stop & send.
  // Works even when focus is in textarea — long press (>400ms) activates PTT,
  // short press types a space character as normal.
  useEffect(() => {
    let spaceDownTime = 0;
    let spacePttActivated = false;
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    let targetElement: EventTarget | null = null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;

      const inTextInput =
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLInputElement;

      if (!inTextInput) {
        // Outside text fields: always activate PTT immediately
        e.preventDefault();
        spaceDownTime = Date.now();
        spacePttActivated = true;
        startRecording();
        return;
      }

      // Inside text fields: start a 400ms timer to detect long press
      spaceDownTime = Date.now();
      spacePttActivated = false;
      targetElement = e.target;

      longPressTimer = setTimeout(() => {
        // Timer fired — Space is still held, activate PTT
        spacePttActivated = true;
        longPressTimer = null;

        // Remove the space character that was typed on keydown
        if (targetElement instanceof HTMLTextAreaElement || targetElement instanceof HTMLInputElement) {
          const el = targetElement;
          const val = el.value;
          const pos = el.selectionStart ?? val.length;
          // Delete the trailing space that was inserted at keydown
          if (pos > 0 && val[pos - 1] === " ") {
            el.value = val.slice(0, pos - 1) + val.slice(pos);
            el.selectionStart = pos - 1;
            el.selectionEnd = pos - 1;
            // Dispatch input event so React picks up the change
            el.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }

        startRecording();
      }, 400);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;

      // Clear pending long-press timer if it hasn't fired
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }

      if (spacePttActivated) {
        // PTT was activated (either outside text field or via long press)
        stopRecording();
        spacePttActivated = false;
      }
      // Short press inside textarea: normal space typing (do nothing)

      spaceDownTime = 0;
      targetElement = null;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      if (longPressTimer) clearTimeout(longPressTimer);
    };
  }, [startRecording, stopRecording]);

  return {
    status,
    transcript,
    isRecording: status === "recording",
    isSupported,
    startRecording,
    stopRecording,
  };
}
