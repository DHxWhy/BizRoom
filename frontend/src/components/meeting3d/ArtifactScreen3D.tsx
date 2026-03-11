import { memo, useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import type { Mesh, MeshStandardMaterial, Group } from "three";
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

/** Screen dimensions — large presentation display */
const SCREEN_WIDTH = 3.4;
const SCREEN_HEIGHT = 1.9;
const BEZEL = 0.04;
const CORNER_SIZE = 0.15;

/** Content area with padding */
const CONTENT_WIDTH = SCREEN_WIDTH - 0.3;
const CONTENT_MAX_CHARS = 300;

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
  const truncated = text.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxLen * 0.6) {
    return truncated.slice(0, lastSpace) + " ...";
  }
  return truncated + "...";
}

/** Futuristic corner bracket decoration */
function CornerBracket({
  x,
  y,
  flipX,
  flipY,
  color,
}: {
  x: number;
  y: number;
  flipX: boolean;
  flipY: boolean;
  color: string;
}) {
  const sx = flipX ? -1 : 1;
  const sy = flipY ? -1 : 1;
  return (
    <group position={[x, y, 0.003]}>
      {/* Horizontal arm */}
      <mesh position={[sx * CORNER_SIZE * 0.5, 0, 0]}>
        <planeGeometry args={[CORNER_SIZE, 0.008]} />
        <meshBasicMaterial color={color} transparent opacity={0.7} />
      </mesh>
      {/* Vertical arm */}
      <mesh position={[0, sy * CORNER_SIZE * 0.5, 0]}>
        <planeGeometry args={[0.008, CORNER_SIZE]} />
        <meshBasicMaterial color={color} transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

/**
 * Idle screen — "BizRoom.ai" logo with breathing animation and ambient scanlines.
 */
const IdleScreen = memo(function IdleScreen() {
  const textRef = useRef<Mesh>(null);

  useFrame((state) => {
    if (!textRef.current) return;
    const mat = textRef.current.material as MeshStandardMaterial;
    if (!mat.emissive) return;
    const pulse = 0.12 + Math.sin(state.clock.elapsedTime * 1.2) * 0.06;
    mat.emissiveIntensity = pulse;
  });

  return (
    <group>
      <Text
        ref={textRef}
        position={[0, 0.15, 0.006]}
        fontSize={0.22}
        color="#8b8fdb"
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.12}
        material-emissive={new THREE.Color("#8b8fdb")}
        material-emissiveIntensity={0.12}
      >
        BizRoom.ai
      </Text>
      <Text
        position={[0, -0.08, 0.006]}
        fontSize={0.055}
        color="#555580"
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.06}
      >
        Your AI Executive Team
      </Text>

      {/* Ambient scanlines */}
      {Array.from({ length: 5 }).map((_, i) => (
        <mesh key={i} position={[0, -0.3 + i * 0.15, 0.004]}>
          <planeGeometry args={[CONTENT_WIDTH * 0.6, 0.001]} />
          <meshBasicMaterial color="#3a3a6a" transparent opacity={0.12} />
        </mesh>
      ))}
    </group>
  );
});

/**
 * Active screen — artifact title, type badge, and content preview.
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
      <mesh
        position={[
          -CONTENT_WIDTH / 2 + 0.15,
          SCREEN_HEIGHT / 2 - 0.14,
          0.005,
        ]}
      >
        <planeGeometry args={[0.28, 0.08]} />
        <meshStandardMaterial
          color={badgeColor}
          emissive={badgeColor}
          emissiveIntensity={0.4}
          roughness={0.5}
        />
      </mesh>
      <Text
        position={[
          -CONTENT_WIDTH / 2 + 0.15,
          SCREEN_HEIGHT / 2 - 0.14,
          0.007,
        ]}
        fontSize={0.035}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        {badgeLabel}
      </Text>

      {/* Title */}
      <Text
        position={[0, SCREEN_HEIGHT / 2 - 0.3, 0.006]}
        fontSize={0.08}
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
      <mesh position={[0, SCREEN_HEIGHT / 2 - 0.42, 0.005]}>
        <planeGeometry args={[CONTENT_WIDTH * 0.85, 0.003]} />
        <meshBasicMaterial color="#4f46e5" transparent opacity={0.5} />
      </mesh>

      {/* Content preview */}
      <Text
        position={[0, -0.05, 0.006]}
        fontSize={0.045}
        color="#b0b4d0"
        anchorX="center"
        anchorY="middle"
        maxWidth={CONTENT_WIDTH - 0.15}
        textAlign="left"
        lineHeight={1.5}
      >
        {contentText}
      </Text>
    </group>
  );
});

/**
 * Large presentation screen on the back wall.
 * Features: glowing bezel, corner brackets, ambient light emission.
 */
export const ArtifactScreen3D = memo(function ArtifactScreen3D({
  artifact,
  position = [0, 2.2, -6.85],
}: ArtifactScreen3DProps) {
  const borderRef = useRef<Mesh>(null);
  const screenRef = useRef<Mesh>(null);
  const prevArtifactRef = useRef<string | null>(null);
  const pulseTimerRef = useRef(0);

  useFrame((state, delta) => {
    const hasArtifact = artifact !== null;

    // Detect new artifact arrival for border pulse
    const currentKey = artifact ? `${artifact.type}:${artifact.name}` : null;
    if (currentKey !== prevArtifactRef.current) {
      if (currentKey !== null) {
        pulseTimerRef.current = 1.0;
      }
      prevArtifactRef.current = currentKey;
    }

    if (pulseTimerRef.current > 0) {
      pulseTimerRef.current = Math.max(0, pulseTimerRef.current - delta * 1.5);
    }

    // Border glow
    if (borderRef.current) {
      const mat = borderRef.current.material as MeshStandardMaterial;
      const basePulse = 0.15 + Math.sin(state.clock.elapsedTime * 2) * 0.05;
      const arrivalPulse = pulseTimerRef.current * 0.8;
      mat.emissiveIntensity = basePulse + arrivalPulse;
    }

    // Screen brightness
    if (screenRef.current) {
      const mat = screenRef.current.material as MeshStandardMaterial;
      mat.emissiveIntensity = hasArtifact ? 0.1 : 0.04;
    }
  });

  const hw = SCREEN_WIDTH / 2;
  const hh = SCREEN_HEIGHT / 2;

  return (
    <group position={position}>
      {/* Outer bezel frame — metallic border with glow */}
      <mesh ref={borderRef} position={[0, 0, -0.008]}>
        <planeGeometry args={[SCREEN_WIDTH + BEZEL * 2, SCREEN_HEIGHT + BEZEL * 2]} />
        <meshStandardMaterial
          color="#0e0e20"
          emissive="#4f46e5"
          emissiveIntensity={0.15}
          roughness={0.2}
          metalness={0.6}
        />
      </mesh>

      {/* Screen glass background */}
      <mesh ref={screenRef}>
        <planeGeometry args={[SCREEN_WIDTH, SCREEN_HEIGHT]} />
        <meshStandardMaterial
          color="#060610"
          emissive="#0a0a20"
          emissiveIntensity={0.04}
          roughness={0.15}
          metalness={0.2}
        />
      </mesh>

      {/* Top edge highlight */}
      <mesh position={[0, hh + BEZEL + 0.005, 0.002]}>
        <planeGeometry args={[SCREEN_WIDTH + BEZEL * 2, 0.006]} />
        <meshBasicMaterial color="#6366f1" transparent opacity={0.6} />
      </mesh>

      {/* Side edge accents */}
      <mesh position={[-hw - BEZEL - 0.003, 0, 0.002]}>
        <planeGeometry args={[0.004, SCREEN_HEIGHT * 0.6]} />
        <meshBasicMaterial color="#6366f1" transparent opacity={0.25} />
      </mesh>
      <mesh position={[hw + BEZEL + 0.003, 0, 0.002]}>
        <planeGeometry args={[0.004, SCREEN_HEIGHT * 0.6]} />
        <meshBasicMaterial color="#6366f1" transparent opacity={0.25} />
      </mesh>

      {/* Corner brackets */}
      <CornerBracket x={-hw + 0.02} y={hh - 0.02} flipX={false} flipY={false} color="#6366f1" />
      <CornerBracket x={hw - 0.02} y={hh - 0.02} flipX flipY={false} color="#6366f1" />
      <CornerBracket x={-hw + 0.02} y={-hh + 0.02} flipX={false} flipY color="#6366f1" />
      <CornerBracket x={hw - 0.02} y={-hh + 0.02} flipX flipY color="#6366f1" />

      {/* Content layer */}
      {artifact ? <ActiveScreen artifact={artifact} /> : <IdleScreen />}

      {/* Ambient light cast onto back wall */}
      <pointLight position={[0, 0, 0.4]} color="#4f46e5" intensity={0.3} distance={3} />
      {/* Secondary warm light from screen */}
      <pointLight position={[0, -0.5, 0.6]} color="#1a1a40" intensity={0.1} distance={2} />
    </group>
  );
});
