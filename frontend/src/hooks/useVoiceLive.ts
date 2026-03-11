// WebSocket audio streaming + mic toggle
// Ref: Design Spec §3.1, §8.1

import { useState, useCallback, useRef, useEffect } from "react";
import { float32ToPcm16, pcm16ToBase64 } from "../utils/audioUtils";

const STORAGE_KEY_MIC = "bizroom_mic_enabled";
const AUDIO_CHUNK_SIZE = 12000; // 500ms at 24kHz — larger chunks reduce HTTP request frequency

interface UseVoiceLiveOptions {
  roomId: string;
  enabled: boolean; // meeting is active
}

interface UseVoiceLiveReturn {
  isMicOn: boolean;
  isMicConnecting: boolean;
  toggleMic: () => void;
}

export function useVoiceLive({
  roomId,
  enabled,
}: UseVoiceLiveOptions): UseVoiceLiveReturn {
  const [isMicOn, setIsMicOn] = useState(
    () => localStorage.getItem(STORAGE_KEY_MIC) === "true",
  );
  const [isMicConnecting, setIsMicConnecting] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  // Ref to hold latest startStreaming to avoid stale closures in effects
  const startStreamingRef = useRef<() => Promise<void>>(undefined);

  const startStreaming = useCallback(async () => {
    if (!enabled || !roomId) return;
    setIsMicConnecting(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Browser may ignore sampleRate; AudioContext at 24kHz handles resampling
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      // AudioContext at 24kHz resamples internally from device's native rate
      const audioCtx = new AudioContext({ sampleRate: 24000 });
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);

      // Use ScriptProcessorNode for simplicity (AudioWorklet for production)
      const processor = audioCtx.createScriptProcessor(AUDIO_CHUNK_SIZE, 1, 1);
      processorRef.current = processor;

      // Capture roomId in closure — effect handles roomId changes via cleanup
      const targetRoomId = roomId;

      // MVP: HTTP POST per audio chunk to /api/voice/audio
      // TODO v2: migrate to SignalR binary channel for lower latency
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const pcm16 = float32ToPcm16(input);
        const base64 = pcm16ToBase64(pcm16);

        fetch(`/api/voice/audio`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId: targetRoomId, audioBase64: base64 }),
          keepalive: true,
        }).catch(() => {
          /* audio is best-effort */
        });
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);
      setIsMicConnecting(false);
    } catch (err) {
      console.error("[useVoiceLive] Failed to start mic:", err);
      setIsMicOn(false);
      setIsMicConnecting(false);
      localStorage.setItem(STORAGE_KEY_MIC, "false");
    }
  }, [roomId, enabled]);

  // Keep ref in sync with latest startStreaming (must be in effect, not render)
  useEffect(() => {
    startStreamingRef.current = startStreaming;
  }, [startStreaming]);

  const stopStreaming = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const toggleMic = useCallback(() => {
    const next = !isMicOn;
    setIsMicOn(next);
    localStorage.setItem(STORAGE_KEY_MIC, String(next));
    if (next) {
      startStreamingRef.current?.();
    } else {
      stopStreaming();
    }
  }, [isMicOn, stopStreaming]);

  // Lifecycle: start/stop streaming based on enabled state + roomId changes
  useEffect(() => {
    if (!enabled) {
      // Meeting ended — stop streaming, schedule mic state reset
      stopStreaming();
      queueMicrotask(() => {
        setIsMicOn(false);
        localStorage.setItem(STORAGE_KEY_MIC, "false");
      });
      return;
    }

    if (isMicOn) {
      // Use ref to avoid stale closure of startStreaming
      queueMicrotask(() => startStreamingRef.current?.());
      return () => stopStreaming();
    }

    return () => stopStreaming();
  }, [enabled, roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { isMicOn, isMicConnecting, toggleMic };
}
