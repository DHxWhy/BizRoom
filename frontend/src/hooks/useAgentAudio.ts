// Agent audio playback queue using Web Audio API
// Ref: Design Spec §8.3

import { useRef, useCallback, useEffect } from "react";
import {
  base64ToPcm16Float32,
  createPlaybackContext,
} from "../utils/audioUtils";
import type { AgentRole } from "../types";

interface UseAgentAudioReturn {
  /** Feed audio chunk from SignalR agentAudioDelta event */
  feedAudio: (role: AgentRole, audioBase64: string) => void;
  /** Stop all playback (interrupt) */
  stopAll: () => void;
  /** Currently playing agent role */
  playingRole: React.MutableRefObject<AgentRole | null>;
}

export function useAgentAudio(): UseAgentAudioReturn {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const queueRef = useRef<{ role: AgentRole; data: Float32Array }[]>([]);
  const playingRole = useRef<AgentRole | null>(null);
  const isPlayingRef = useRef(false);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const disposedRef = useRef(false);

  // Initialize AudioContext lazily (requires user gesture)
  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = createPlaybackContext();
    }
    return audioCtxRef.current;
  }, []);

  const playNext = useCallback(async () => {
    if (isPlayingRef.current || queueRef.current.length === 0 || disposedRef.current) return;
    isPlayingRef.current = true;

    const ctx = getAudioCtx();
    // Resume if suspended (common before user gesture)
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    while (queueRef.current.length > 0 && !disposedRef.current) {
      const item = queueRef.current.shift()!;
      // Update playingRole when chunk actually starts playing
      playingRole.current = item.role;

      try {
        const buffer = ctx.createBuffer(1, item.data.length, 24000);
        buffer.copyToChannel(new Float32Array(item.data), 0);

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);

        currentSourceRef.current = source;
        await new Promise<void>((resolve) => {
          source.onended = () => {
            currentSourceRef.current = null;
            resolve();
          };
          source.start();
        });
      } catch (err) {
        console.error("[useAgentAudio] playback error:", err);
        break;
      }
    }

    isPlayingRef.current = false;
    if (queueRef.current.length === 0) {
      playingRole.current = null;
    }
  }, [getAudioCtx]);

  const feedAudio = useCallback(
    (role: AgentRole, audioBase64: string) => {
      if (disposedRef.current) return;
      const float32 = base64ToPcm16Float32(audioBase64);
      queueRef.current.push({ role, data: float32 });
      playNext();
    },
    [playNext],
  );

  const stopAll = useCallback(() => {
    queueRef.current = [];
    playingRole.current = null;
    isPlayingRef.current = false;
    // Stop currently playing audio immediately
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch {
        /* already stopped */
      }
      currentSourceRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
  }, []);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      if (currentSourceRef.current) {
        try {
          currentSourceRef.current.stop();
        } catch {
          /* already stopped */
        }
        currentSourceRef.current = null;
      }
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
    };
  }, []);

  return { feedAudio, stopAll, playingRole };
}
