// frontend/src/hooks/useWhisperPTT.ts
//
// Push-to-Talk using MediaRecorder + OpenAI Whisper API (backend proxy).
// Replaces Web Speech API for dramatically better Korean STT accuracy.
//
// Flow:
//   hold button → MediaRecorder captures audio (WebM/Opus)
//   release     → blob sent to POST /api/voice/transcribe
//                → Whisper-1 returns transcript
//                → onTranscript callback fires
//
// Fallback:
//   If MediaRecorder is unavailable (rare) or backend returns error,
//   the hook surfaces an error via onError callback. Callers should
//   fall back to usePushToTalk (Web Speech API).

import { useState, useCallback, useRef } from "react";
import { API_BASE } from "../config/api";

export type WhisperPTTStatus = "idle" | "recording" | "processing" | "error";

interface UseWhisperPTTOptions {
  /** Called with the Whisper transcript when processing completes. */
  onTranscript?: (text: string) => void;
  /** Called when a non-fatal error occurs (recording failed, network error, etc.). */
  onError?: (err: string) => void;
  /** BCP-47 language hint forwarded to Whisper (default: "ko"). */
  lang?: string;
  /**
   * Optional prompt hint to prime Whisper vocabulary.
   * Useful for domain-specific terms (e.g. "BizRoom, COO, CFO, CMO").
   */
  prompt?: string;
}

export interface UseWhisperPTTReturn {
  status: WhisperPTTStatus;
  isRecording: boolean;
  isSupported: boolean;
  startRecording: () => void;
  stopRecording: () => void;
}

/** Preferred MIME types in priority order. Whisper accepts webm, mp4, ogg, wav. */
const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mp4",
];

function getSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return PREFERRED_MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

export function useWhisperPTT(
  options: UseWhisperPTTOptions = {},
): UseWhisperPTTReturn {
  const [status, setStatus] = useState<WhisperPTTStatus>("idle");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const isRecordingRef = useRef(false);

  // Keep a stable ref to latest options so callbacks always use fresh values
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const mimeType = getSupportedMimeType();
  const isSupported =
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined" &&
    !!mimeType;

  const sendToWhisper = useCallback(async (blob: Blob): Promise<void> => {
    const { lang = "en", prompt = "", onTranscript } = optionsRef.current;

    setStatus("processing");

    try {
      const formData = new FormData();
      // Extension must match the MIME type so Whisper identifies the codec
      const ext = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "mp4" : "webm";
      formData.append("audio", blob, `recording.${ext}`);

      const url = new URL(`${API_BASE}/api/voice/transcribe`, window.location.href);
      url.searchParams.set("lang", lang);
      if (prompt) url.searchParams.set("prompt", prompt);

      const res = await fetch(url.toString(), {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? `HTTP ${res.status}`,
        );
      }

      const data = (await res.json()) as { transcript?: string };
      const transcript = data.transcript?.trim() ?? "";

      if (transcript) {
        onTranscript?.(transcript);
      }
      setStatus("idle");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[useWhisperPTT] Transcription error:", msg);
      optionsRef.current.onError?.(msg);
      setStatus("error");
      // Auto-recover to idle after a short delay so the button isn't stuck
      setTimeout(() => setStatus("idle"), 2000);
    }
  }, []);

  const startRecording = useCallback(() => {
    if (!isSupported || isRecordingRef.current) return;

    // Request mic access fresh each time (avoids stale permission state)
    navigator.mediaDevices
      .getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      .then((stream) => {
        streamRef.current = stream;

        const recorder = new MediaRecorder(stream, {
          mimeType: mimeType!,
          // Lower bitrate is fine for speech — reduces payload size
          audioBitsPerSecond: 32_000,
        });

        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
          // Stop mic tracks immediately to release the mic indicator
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          isRecordingRef.current = false;

          const blob = new Blob(chunksRef.current, { type: mimeType! });
          chunksRef.current = [];

          if (blob.size < 100) {
            // Ignore near-empty recordings (button tap, no audio data)
            setStatus("idle");
            return;
          }

          void sendToWhisper(blob);
        };

        recorder.onerror = () => {
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          isRecordingRef.current = false;
          chunksRef.current = [];
          optionsRef.current.onError?.("MediaRecorder error");
          setStatus("error");
          setTimeout(() => setStatus("idle"), 2000);
        };

        mediaRecorderRef.current = recorder;
        isRecordingRef.current = true;
        setStatus("recording");

        // Collect chunks every 250ms for smoother memory usage on long recordings
        recorder.start(250);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[useWhisperPTT] getUserMedia error:", msg);
        optionsRef.current.onError?.(msg);
        setStatus("error");
        setTimeout(() => setStatus("idle"), 2000);
      });
  }, [isSupported, mimeType, sendToWhisper]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    mediaRecorderRef.current = null;

    try {
      recorder.stop(); // triggers onstop → sendToWhisper
    } catch {
      // Already stopped
      isRecordingRef.current = false;
      setStatus("idle");
    }
  }, []);

  return {
    status,
    isRecording: status === "recording",
    isSupported,
    startRecording,
    stopRecording,
  };
}
