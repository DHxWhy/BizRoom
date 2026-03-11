// Microsoft Viseme ID → ARKit BlendShape weight mapping
// Ref: Design Spec §6.2
// Ref: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-speech-synthesis-viseme

export interface BlendShapeWeights {
  jawOpen?: number;
  mouthOpen?: number;
  mouthFunnel?: number;
  mouthClose?: number;
  mouthSmileLeft?: number;
  mouthSmileRight?: number;
  mouthPucker?: number;
  mouthLowerDownLeft?: number;
  mouthLowerDownRight?: number;
  mouthStretchLeft?: number;
  mouthStretchRight?: number;
  tongueOut?: number;
}

// Shorthand for bilateral mouth shapes
type BilateralKey = "mouthSmile" | "mouthLowerDown" | "mouthStretch";

function bilateral(
  key: BilateralKey,
  value: number,
): Partial<BlendShapeWeights> {
  return {
    [`${key}Left`]: value,
    [`${key}Right`]: value,
  } as Partial<BlendShapeWeights>;
}

/**
 * Full 22-entry Viseme ID → BlendShape weight table.
 * Each entry maps a Microsoft viseme ID (0-21) to RPM avatar morph target weights.
 */
export const VISEME_MAP: BlendShapeWeights[] = [
  /* 0  silence       */ {},
  /* 1  æ, ə, ʌ       */ { jawOpen: 0.3, mouthFunnel: 0.1 },
  /* 2  ɑ             */ { jawOpen: 0.6, mouthOpen: 0.5 },
  /* 3  ɔ             */ { jawOpen: 0.4, mouthFunnel: 0.4 },
  /* 4  ɛ, ʊ          */ { jawOpen: 0.3, ...bilateral("mouthSmile", 0.2) },
  /* 5  ɝ             */ { jawOpen: 0.2, mouthFunnel: 0.3 },
  /* 6  i             */ { jawOpen: 0.1, ...bilateral("mouthSmile", 0.5) },
  /* 7  u             */ { jawOpen: 0.2, mouthFunnel: 0.6, mouthPucker: 0.4 },
  /* 8  o             */ { jawOpen: 0.35, mouthFunnel: 0.5, mouthOpen: 0.3 },
  /* 9  aʊ            */ { jawOpen: 0.5, mouthOpen: 0.4, mouthFunnel: 0.2 },
  /* 10 ɔɪ            */ { jawOpen: 0.4, mouthOpen: 0.3, ...bilateral("mouthSmile", 0.1) },
  /* 11 f, v          */ { mouthFunnel: 0.3, ...bilateral("mouthLowerDown", 0.2) },
  /* 12 s, z          */ { jawOpen: 0.05, ...bilateral("mouthStretch", 0.3) },
  /* 13 ʃ, ʒ          */ { jawOpen: 0.1, mouthFunnel: 0.4, ...bilateral("mouthStretch", 0.1) },
  /* 14 ð, θ          */ { jawOpen: 0.1, tongueOut: 0.4, ...bilateral("mouthLowerDown", 0.1) },
  /* 15 p, b, m       */ { mouthClose: 0.8, jawOpen: 0.05 },
  /* 16 l             */ { jawOpen: 0.2, tongueOut: 0.2, ...bilateral("mouthSmile", 0.1) },
  /* 17 r             */ { jawOpen: 0.15, mouthFunnel: 0.2 },
  /* 18 t, d, n       */ { jawOpen: 0.15, tongueOut: 0.3 },
  /* 19 w             */ { jawOpen: 0.15, mouthFunnel: 0.5, mouthPucker: 0.3 },
  /* 20 k, g          */ { jawOpen: 0.4, mouthOpen: 0.3 },
  /* 21 default close */ { mouthClose: 0.1 },
];

/**
 * Get blend shape weights for a given viseme ID.
 * Returns empty weights for out-of-range IDs.
 */
export function getVisemeWeights(visemeId: number): BlendShapeWeights {
  return VISEME_MAP[visemeId] ?? {};
}

/** LERP speed for smooth viseme transitions (per second) — Spec §6.3 */
export const VISEME_LERP_SPEED = 12;

/** Interpolate a single blend shape weight toward target */
export function lerpWeight(
  current: number,
  target: number,
  deltaTime: number,
): number {
  return (
    current + (target - current) * Math.min(1, deltaTime * VISEME_LERP_SPEED)
  );
}

/** All blend shape keys used by the viseme system */
export const VISEME_BLEND_SHAPE_KEYS = [
  "jawOpen",
  "mouthOpen",
  "mouthFunnel",
  "mouthClose",
  "mouthSmileLeft",
  "mouthSmileRight",
  "mouthPucker",
  "mouthLowerDownLeft",
  "mouthLowerDownRight",
  "mouthStretchLeft",
  "mouthStretchRight",
  "tongueOut",
] as const;
