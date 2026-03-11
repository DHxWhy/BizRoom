// Viseme events → blend shape weights for 3D lip sync
// Ref: Design Spec §6, §8.1

import { useRef, useCallback } from "react";
import {
  getVisemeWeights,
  VISEME_BLEND_SHAPE_KEYS,
  type BlendShapeWeights,
} from "../utils/visemeMap";
import type { AgentRole } from "../types";

interface UseVisemeReturn {
  /** Feed viseme event from SignalR agentVisemeDelta */
  feedViseme: (role: AgentRole, visemeId: number) => void;
  /** Get current target weights for a given agent (consumed by useFrame) */
  getTargetWeights: (role: AgentRole) => BlendShapeWeights;
  /** Reset all weights to zero (agent stopped speaking) */
  resetWeights: (role: AgentRole) => void;
}

export function useViseme(): UseVisemeReturn {
  // Per-agent target blend shape weights
  const weightsMap = useRef(new Map<AgentRole, BlendShapeWeights>());

  const feedViseme = useCallback((role: AgentRole, visemeId: number) => {
    const weights = getVisemeWeights(visemeId);
    weightsMap.current.set(role, weights);
  }, []);

  const getTargetWeights = useCallback(
    (role: AgentRole): BlendShapeWeights => {
      return weightsMap.current.get(role) ?? {};
    },
    [],
  );

  const resetWeights = useCallback((role: AgentRole) => {
    weightsMap.current.set(role, {});
  }, []);

  return { feedViseme, getTargetWeights, resetWeights };
}

/** LERP speed for smooth viseme transitions (per second) — Spec §6.3 */
export const VISEME_LERP_SPEED = 12;

/** Interpolate a single blend shape weight toward target */
export function lerpWeight(
  current: number,
  target: number,
  deltaTime: number,
): number {
  return current + (target - current) * Math.min(1, deltaTime * VISEME_LERP_SPEED);
}

export { VISEME_BLEND_SHAPE_KEYS };
