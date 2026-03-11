// Viseme events → blend shape weights for 3D lip sync
// Ref: Design Spec §6, §8.1

import { useRef, useCallback } from "react";
import {
  getVisemeWeights,
  type BlendShapeWeights,
} from "../utils/visemeMap";
import type { AgentRole } from "../types";

// Re-export for convenience
export { lerpWeight, VISEME_LERP_SPEED, VISEME_BLEND_SHAPE_KEYS } from "../utils/visemeMap";

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
