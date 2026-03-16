/**
 * Avatar model configuration per agent role.
 *
 * Current: Ready Player Me GLB models (free, commercial OK)
 * Each agent maps to a unique RPM avatar stored in public/models/rpm-{name}.glb
 *
 * RPM models use standard Mixamo bone hierarchy:
 *   Hips → Spine → Spine1 → Spine2 → Neck → Head
 *   LeftShoulder → LeftArm → LeftForeArm → LeftHand
 *   LeftUpLeg → LeftLeg → LeftFoot
 *
 * To customize avatars:
 *   1. Go to https://demo.readyplayer.me
 *   2. Create avatar matching the agent persona
 *   3. Copy avatar ID from URL
 *   4. Download: https://models.readyplayer.me/{id}.glb?quality=medium
 *   5. Save to public/models/rpm-{name}.glb
 */

export interface AvatarModelConfig {
  /** Path or URL to the GLB model file */
  url: string;
  /** Scale factor to normalize the model height (~1.7m standing) */
  scale: number;
  /** Y offset for vertical positioning (negative = seated) */
  yOffset: number;
  /** Agent display color (for name badge, speaking ring) */
  color: string;
  /** Height of name plate above model origin (default: 1.5) */
  nameHeight?: number;
  /** Rotation offset (radians) to correct model's default facing direction.
   *  0 = model faces -Z (Three.js convention)
   *  Math.PI = model faces +Z (needs 180° flip)
   *  Default: Math.PI */
  facingOffset?: number;
}

// ─── Ready Player Me avatar models ───
// Each downloaded with ?quality=medium (~1-1.6MB per model)
// Persona inspirations: docs/PERSONA_SOURCES.md
const RPM = {
  hudson:   "/models/rpm-hudson.glb",   // COO — inspired by Judson Althoff (athletic male)
  amelia:   "/models/rpm-amelia.glb",   // CFO — inspired by Amy Hood (female)
  yusef:    "/models/rpm-yusef.glb",    // CMO — inspired by Yusuf Mehdi (male)
  kelvin:   "/models/rpm-kelvin.glb",   // CTO — inspired by Kevin Scott (male)
  jonas:    "/models/rpm-jonas.glb",    // CDO — inspired by Jon Friedman (male)
  bradley:  "/models/rpm-bradley.glb",  // CLO — inspired by Brad Smith (male)
  ceo: "/models/rpm-chairman.glb", // CEO (user avatar)
};

// RPM Hips are at Y~1.02 in standing pose.
// Seated offset lowers model so hips align with chair seat.
// Chair seat is at Y=0.52 (raised table), hips at 1.02 → 0.52 - 1.02 = -0.50
// Slight bump to -0.42 keeps feet above floor and knees below table (Y=0.52)
const SEATED_Y = -0.42;

export const AVATAR_CONFIGS: Record<string, AvatarModelConfig> = {
  ceo: {
    url: RPM.ceo,
    scale: 1.0,
    yOffset: SEATED_Y,
    color: "#8b5cf6",
    nameHeight: 1.95,
    facingOffset: 0,
  },
  coo: {
    url: RPM.hudson,
    scale: 1.0,
    yOffset: SEATED_Y,
    color: "#3b82f6",
    nameHeight: 1.95,
    facingOffset: 0,
  },
  cfo: {
    url: RPM.amelia,
    scale: 1.0,
    yOffset: SEATED_Y,
    color: "#10b981",
    nameHeight: 1.95,
    facingOffset: 0,
  },
  cmo: {
    url: RPM.yusef,
    scale: 1.0,
    yOffset: SEATED_Y,
    color: "#f97316",
    nameHeight: 1.95,
    facingOffset: 0,
  },
  cto: {
    url: RPM.kelvin,
    scale: 1.0,
    yOffset: SEATED_Y,
    color: "#06b6d4",
    nameHeight: 1.95,
    facingOffset: 0,
  },
  cdo: {
    url: RPM.jonas,
    scale: 1.0,
    yOffset: SEATED_Y,
    color: "#ec4899",
    nameHeight: 1.95,
    facingOffset: 0,
  },
  clo: {
    url: RPM.bradley,
    scale: 1.0,
    yOffset: SEATED_Y,
    color: "#84cc16",
    nameHeight: 1.95,
    facingOffset: 0,
  },
};

/** Default config for unknown roles */
export const DEFAULT_AVATAR: AvatarModelConfig = {
  url: RPM.ceo,
  scale: 1.0,
  yOffset: SEATED_Y,
  color: "#6366f1",
  nameHeight: 1.6,
  facingOffset: Math.PI,
};

/** Preload all unique model URLs for faster loading */
export function getUniqueModelUrls(): string[] {
  const urls = new Set(Object.values(AVATAR_CONFIGS).map((c) => c.url));
  return Array.from(urls);
}
