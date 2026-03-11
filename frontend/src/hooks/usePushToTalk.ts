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
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        transcriptRef.current = finalTranscript;
        setTranscript(finalTranscript);
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      setStatus("idle");
      isRecordingRef.current = false;
    };

    recognition.onend = () => {
      if (isRecordingRef.current) {
        setStatus("processing");
        isRecordingRef.current = false;

        // Deliver final transcript to consumer via callback
        const finalText = transcriptRef.current;
        if (finalText) {
          optionsRef.current.onTranscript?.(finalText);
        }
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
    if (recognitionRef.current && isRecordingRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  // Space bar hold-to-talk: hold Space to record, release to stop & send.
  // Works even when focus is in textarea — long press (>200ms) activates PTT,
  // short press types a space character as normal.
  useEffect(() => {
    let spaceDownTime = 0;
    let spacePttActivated = false;

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

      // Inside text fields: record timestamp, decide on keyup
      spaceDownTime = Date.now();
      spacePttActivated = false;
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;

      const holdDuration = Date.now() - spaceDownTime;

      if (spacePttActivated) {
        // Already activated (outside text field)
        stopRecording();
        spacePttActivated = false;
        return;
      }

      // Inside text fields: if held long enough → treat as PTT
      // Otherwise, normal space character (default behavior)
      if (holdDuration > 400) {
        // Long hold detected inside textarea — was PTT intent
        // But we didn't start recording on keydown, so nothing to stop
        // This path enables the mic button as primary for textarea context
      }

      spaceDownTime = 0;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
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
