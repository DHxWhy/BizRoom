/**
 * SophiaBlob3D — Futuristic AI secretary blob floating above the meeting table.
 *
 * CSS gradient blob rendered via Html (drei) for rich visual effects.
 * Inspired by @reactbits gradient-blob: morphing border-radius + gradient
 * rotation + breathing animation + metallic highlight.
 * State-reactive: faster animations when thinking/speaking.
 */

import { useRef, useMemo, memo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Html, Billboard, Text } from "@react-three/drei";
import { S } from "../../constants/strings";

interface SophiaBlob3DProps {
  position: [number, number, number];
  /** Sophia is generating a visualization */
  isThinking?: boolean;
  /** Sophia is "speaking" (broadcasting a message) */
  isSpeaking?: boolean;
}

// ── CSS keyframes — injected once globally ──

const BLOB_CSS_ID = "sophia-blob-css";

const BLOB_CSS = /* css */ `
@keyframes sophia-morph-1 {
  0%, 100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; }
  25%      { border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%; }
  50%      { border-radius: 50% 50% 30% 70% / 40% 60% 60% 40%; }
  75%      { border-radius: 40% 60% 50% 50% / 60% 40% 50% 60%; }
}

@keyframes sophia-morph-2 {
  0%, 100% { border-radius: 40% 60% 50% 50% / 50% 50% 60% 40%; }
  33%      { border-radius: 55% 45% 40% 60% / 60% 40% 45% 55%; }
  66%      { border-radius: 45% 55% 60% 40% / 40% 60% 55% 45%; }
}

@keyframes sophia-gradient {
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

@keyframes sophia-breathe {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.08); }
}

@keyframes sophia-core-pulse {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50%      { opacity: 0.8; transform: scale(1.12); }
}
`;

// Inject CSS once into <head> at module load
if (typeof document !== "undefined" && !document.getElementById(BLOB_CSS_ID)) {
  const tag = document.createElement("style");
  tag.id = BLOB_CSS_ID;
  tag.textContent = BLOB_CSS;
  document.head.appendChild(tag);
}

// ── Static style constants (never recreated) ──

const CONTAINER_STYLE: React.CSSProperties = {
  position: "relative",
  width: 140,
  height: 140,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const HALO_BASE: React.CSSProperties = {
  position: "absolute",
  width: 180,
  height: 180,
  background:
    "radial-gradient(circle, rgba(245,158,11,0.2) 0%, rgba(99,102,241,0.12) 45%, transparent 70%)",
  borderRadius: "50%",
  filter: "blur(20px)",
};

const OUTER_BLOB_BASE: React.CSSProperties = {
  position: "absolute",
  width: 130,
  height: 130,
  background:
    "linear-gradient(135deg, #F59E0B 0%, #818CF8 40%, #6366F1 70%, #F59E0B 100%)",
  backgroundSize: "300% 300%",
  opacity: 0.45,
  filter: "blur(14px)",
};

const INNER_BLOB_BASE: React.CSSProperties = {
  position: "absolute",
  width: 100,
  height: 100,
  background:
    "linear-gradient(135deg, #FBBF24 0%, #A78BFA 30%, #6366F1 60%, #F59E0B 100%)",
  backgroundSize: "300% 300%",
  opacity: 0.88,
};

const METALLIC_STYLE: React.CSSProperties = {
  position: "absolute",
  width: 55,
  height: 55,
  background:
    "radial-gradient(circle at 35% 35%, rgba(255,255,255,0.45) 0%, transparent 60%)",
  borderRadius: "50%",
  opacity: 0.55,
};

const CORE_BASE: React.CSSProperties = {
  position: "absolute",
  width: 30,
  height: 30,
  background:
    "radial-gradient(circle, rgba(251,191,36,0.8) 0%, rgba(167,139,250,0.4) 50%, transparent 70%)",
  borderRadius: "50%",
  filter: "blur(4px)",
};

const HTML_WRAPPER: React.CSSProperties = {
  pointerEvents: "none",
  userSelect: "none",
};

export const SophiaBlob3D = memo(function SophiaBlob3D({
  position,
  isThinking = false,
  isSpeaking = false,
}: SophiaBlob3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const timeRef = useRef(0);

  // Cache base Y from initial position to prevent useFrame override
  const baseY = position[1];

  useFrame((_, delta) => {
    timeRef.current += delta;

    // Floating bob (preserve base Y from position prop)
    if (groupRef.current) {
      groupRef.current.position.y =
        baseY + Math.sin(timeRef.current * 0.8) * 0.06;
    }

    // Point light intensity follows activity
    if (lightRef.current) {
      const target = isThinking ? 3.0 : isSpeaking ? 2.0 : 1.0;
      lightRef.current.intensity +=
        (target - lightRef.current.intensity) * delta * 3;
    }
  });

  // State-reactive animation styles (memoized to avoid re-creating objects)
  const dynamicStyles = useMemo(() => {
    const morphDur = isThinking ? "3s" : isSpeaking ? "5s" : "10s";
    const breatheDur = isThinking ? "1.5s" : isSpeaking ? "2.5s" : "5s";
    const gradientDur = isThinking ? "2s" : isSpeaking ? "4s" : "8s";
    const glowSize = isThinking ? 40 : isSpeaking ? 30 : 20;

    return {
      halo: {
        ...HALO_BASE,
        animation: `sophia-breathe ${breatheDur} ease-in-out infinite`,
      } as React.CSSProperties,

      outerBlob: {
        ...OUTER_BLOB_BASE,
        animation: `sophia-morph-2 ${morphDur} ease-in-out infinite, sophia-gradient ${gradientDur} ease infinite`,
      } as React.CSSProperties,

      innerBlob: {
        ...INNER_BLOB_BASE,
        animation: `sophia-morph-1 ${morphDur} ease-in-out infinite, sophia-gradient ${gradientDur} ease infinite, sophia-breathe ${breatheDur} ease-in-out infinite`,
        boxShadow: `0 0 ${glowSize}px rgba(245,158,11,0.5), 0 0 ${glowSize * 2}px rgba(99,102,241,0.25), inset 0 0 20px rgba(255,255,255,0.1)`,
      } as React.CSSProperties,

      metallic: {
        ...METALLIC_STYLE,
        animation: `sophia-breathe ${breatheDur} ease-in-out infinite reverse`,
      } as React.CSSProperties,

      core: {
        ...CORE_BASE,
        animation: `sophia-core-pulse ${breatheDur} ease-in-out infinite`,
      } as React.CSSProperties,
    };
  }, [isThinking, isSpeaking]);

  return (
    <group position={position} ref={groupRef}>
      {/* CSS Gradient Blob via Html (drei) */}
      <Html center distanceFactor={5} style={HTML_WRAPPER}>
        <div style={CONTAINER_STYLE}>
          {/* Layer 1: Ambient glow halo (outermost) */}
          <div style={dynamicStyles.halo} />

          {/* Layer 2: Outer blob (blurred, secondary morph) */}
          <div style={dynamicStyles.outerBlob} />

          {/* Layer 3: Inner blob (sharp, primary morph) */}
          <div style={dynamicStyles.innerBlob} />

          {/* Layer 4: Metallic highlight (specular) */}
          <div style={dynamicStyles.metallic} />

          {/* Layer 5: Core glow (pulsing center) */}
          <div style={dynamicStyles.core} />
        </div>
      </Html>

      {/* Point light for ambient glow on table surface */}
      <pointLight
        ref={lightRef}
        color="#F59E0B"
        intensity={1.0}
        distance={4}
        decay={2}
        position={[0, -0.2, 0]}
      />

      {/* Name label */}
      <Billboard position={[0, 0.65, 0]}>
        <Text
          fontSize={0.08}
          color="#F59E0B"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.7}
        >
          {S.agents.sophia.name.toUpperCase()}
        </Text>
        <Text
          fontSize={0.045}
          color="#a0a0b0"
          anchorX="center"
          anchorY="middle"
          position={[0, -0.08, 0]}
          fillOpacity={0.5}
        >
          {S.agents.sophia.role.toUpperCase()}
        </Text>
      </Billboard>
    </group>
  );
});
