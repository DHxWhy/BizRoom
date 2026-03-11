import { memo, useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import type { Mesh, MeshStandardMaterial } from "three";
import * as THREE from "three";

/** Artifact data to display on the 3D screen */
export interface ArtifactData {
  type: "excel" | "markdown" | "image";
  name: string;
  /** Markdown text or table data summary */
  content?: string;
}

export interface ArtifactScreen3DProps {
  /** Current artifact to display, or null if none */
  artifact: ArtifactData | null;
  /** Position of the screen in 3D space */
  position?: [number, number, number];
}

/** Screen dimensions */
const SCREEN_WIDTH = 1.8;
const SCREEN_HEIGHT = 1.0;

/** Content area with padding */
const CONTENT_WIDTH = SCREEN_WIDTH - 0.2;
const CONTENT_MAX_CHARS = 200;

/** Type badge labels */
const TYPE_LABELS: Record<ArtifactData["type"], string> = {
  excel: "EXCEL",
  markdown: "MARKDOWN",
  image: "IMAGE",
};

/** Type badge colors */
const TYPE_COLORS: Record<ArtifactData["type"], string> = {
  excel: "#22c55e",
  markdown: "#60a5fa",
  image: "#f59e0b",
};

/** Truncate content and add ellipsis */
function truncateContent(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  // Try to break at a word boundary
  const truncated = text.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxLen * 0.6) {
    return truncated.slice(0, lastSpace) + " ...";
  }
  return truncated + "...";
}

/**
 * Idle screen content -- shows "BizRoom.ai" with a subtle breathing animation
 * when no artifact is present.
 */
const IdleScreen = memo(function IdleScreen() {
  const textRef = useRef<Mesh>(null);

  useFrame((state) => {
    if (!textRef.current) return;
    const mat = textRef.current.material as MeshStandardMaterial;
    if (!mat.emissive) return;
    const pulse = 0.08 + Math.sin(state.clock.elapsedTime * 1.2) * 0.04;
    mat.emissiveIntensity = pulse;
  });

  return (
    <group>
      <Text
        ref={textRef}
        position={[0, 0.05, 0.006]}
        fontSize={0.14}
        color="#7c83db"
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.1}
        material-emissive={new THREE.Color("#7c83db")}
        material-emissiveIntensity={0.08}
      >
        BizRoom.ai
      </Text>
      <Text
        position={[0, -0.15, 0.006]}
        fontSize={0.04}
        color="#555580"
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.06}
      >
        Waiting for artifacts...
      </Text>
    </group>
  );
});

/**
 * Active screen content -- displays artifact title, type badge, and content preview.
 */
const ActiveScreen = memo(function ActiveScreen({
  artifact,
}: {
  artifact: ArtifactData;
}) {
  const contentText = useMemo(() => {
    if (!artifact.content) return "(No content preview)";
    return truncateContent(artifact.content, CONTENT_MAX_CHARS);
  }, [artifact.content]);

  const badgeColor = TYPE_COLORS[artifact.type];
  const badgeLabel = TYPE_LABELS[artifact.type];

  return (
    <group>
      {/* Type badge */}
      <mesh position={[-CONTENT_WIDTH / 2 + 0.12, SCREEN_HEIGHT / 2 - 0.1, 0.005]}>
        <planeGeometry args={[0.22, 0.06]} />
        <meshStandardMaterial
          color={badgeColor}
          emissive={badgeColor}
          emissiveIntensity={0.3}
          roughness={0.5}
        />
      </mesh>
      <Text
        position={[-CONTENT_WIDTH / 2 + 0.12, SCREEN_HEIGHT / 2 - 0.1, 0.007]}
        fontSize={0.028}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        {badgeLabel}
      </Text>

      {/* Title */}
      <Text
        position={[0, SCREEN_HEIGHT / 2 - 0.2, 0.006]}
        fontSize={0.06}
        color="#e0e4ff"
        anchorX="center"
        anchorY="middle"
        maxWidth={CONTENT_WIDTH}
        textAlign="center"
        fontWeight="bold"
      >
        {artifact.name}
      </Text>

      {/* Separator line */}
      <mesh position={[0, SCREEN_HEIGHT / 2 - 0.28, 0.005]}>
        <planeGeometry args={[CONTENT_WIDTH * 0.8, 0.003]} />
        <meshBasicMaterial color="#4f46e5" transparent opacity={0.5} />
      </mesh>

      {/* Content preview */}
      <Text
        position={[0, -0.05, 0.006]}
        fontSize={0.035}
        color="#b0b4d0"
        anchorX="center"
        anchorY="middle"
        maxWidth={CONTENT_WIDTH - 0.1}
        textAlign="left"
        lineHeight={1.5}
      >
        {contentText}
      </Text>
    </group>
  );
});

/**
 * 3D artifact display screen, positioned on the back wall of the meeting room.
 *
 * Displays artifact content (title, type, preview) when an artifact is provided,
 * otherwise shows an idle "BizRoom.ai" logo with a subtle breathing animation.
 */
export const ArtifactScreen3D = memo(function ArtifactScreen3D({
  artifact,
  position = [0, 2.2, -4.8],
}: ArtifactScreen3DProps) {
  const borderRef = useRef<Mesh>(null);
  const screenRef = useRef<Mesh>(null);
  const prevArtifactRef = useRef<string | null>(null);
  const fadeRef = useRef(artifact ? 1 : 0);
  const pulseTimerRef = useRef(0);

  useFrame((state, delta) => {
    const hasArtifact = artifact !== null;
    const targetOpacity = hasArtifact ? 1 : 0.6;

    // Fade animation
    fadeRef.current += (targetOpacity - fadeRef.current) * delta * 3;

    // Detect new artifact arrival for border pulse
    const currentKey = artifact ? `${artifact.type}:${artifact.name}` : null;
    if (currentKey !== prevArtifactRef.current) {
      if (currentKey !== null) {
        pulseTimerRef.current = 1.0; // Start pulse
      }
      prevArtifactRef.current = currentKey;
    }

    // Decay pulse timer
    if (pulseTimerRef.current > 0) {
      pulseTimerRef.current = Math.max(0, pulseTimerRef.current - delta * 1.5);
    }

    // Apply border glow
    if (borderRef.current) {
      const mat = borderRef.current.material as MeshStandardMaterial;
      const basePulse =
        0.1 + Math.sin(state.clock.elapsedTime * 2) * 0.03;
      const arrivalPulse = pulseTimerRef.current * 0.6;
      mat.emissiveIntensity = basePulse + arrivalPulse;
    }

    // Apply screen background brightness
    if (screenRef.current) {
      const mat = screenRef.current.material as MeshStandardMaterial;
      mat.emissiveIntensity = hasArtifact ? 0.08 : 0.02;
    }
  });

  return (
    <group position={position}>
      {/* Border / frame with glow */}
      <mesh ref={borderRef} position={[0, 0, -0.005]}>
        <planeGeometry args={[SCREEN_WIDTH + 0.06, SCREEN_HEIGHT + 0.06]} />
        <meshStandardMaterial
          color="#1a1a30"
          emissive="#4f46e5"
          emissiveIntensity={0.1}
          roughness={0.3}
          metalness={0.5}
        />
      </mesh>

      {/* Screen background */}
      <mesh ref={screenRef}>
        <planeGeometry args={[SCREEN_WIDTH, SCREEN_HEIGHT]} />
        <meshStandardMaterial
          color="#080812"
          emissive="#101028"
          emissiveIntensity={0.02}
          roughness={0.4}
          metalness={0.1}
        />
      </mesh>

      {/* Subtle top-edge highlight */}
      <mesh position={[0, SCREEN_HEIGHT / 2 + 0.025, 0.001]}>
        <planeGeometry args={[SCREEN_WIDTH, 0.005]} />
        <meshBasicMaterial color="#6366f1" transparent opacity={0.4} />
      </mesh>

      {/* Content layer */}
      {artifact ? (
        <ActiveScreen artifact={artifact} />
      ) : (
        <IdleScreen />
      )}

      {/* Subtle point light to illuminate nearby wall */}
      <pointLight
        position={[0, 0, 0.3]}
        color="#4f46e5"
        intensity={0.15}
        distance={2}
      />
    </group>
  );
});
