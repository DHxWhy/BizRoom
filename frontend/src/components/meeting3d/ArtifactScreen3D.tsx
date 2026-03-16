import { memo, useRef, useMemo, useEffect, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import type { Mesh, MeshStandardMaterial } from "three";
import * as THREE from "three";
import type { BigScreenUpdateEvent } from "../../types";
import { renderToCanvas } from "./BigScreenRenderer";

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
  /** BigScreen visualization event (rendered in Task 4) */
  bigScreenEvent?: BigScreenUpdateEvent | null;
  /** Page info for BigScreen history navigation */
  pageInfo?: { current: number; total: number } | null;
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
  // Three.js Text from drei uses MeshBasicMaterial which has no emissive property.
  // Attempting to read mat.emissive on MeshBasicMaterial returns undefined and
  // crashes Three.js 0.170 refreshMaterialUniforms every frame. Use a separate
  // mesh overlay for the pulse effect instead of mutating the Text material.
  const glowRef = useRef<Mesh>(null);

  useFrame((state) => {
    if (!glowRef.current) return;
    const mat = glowRef.current.material as MeshStandardMaterial;
    const pulse = 0.12 + Math.sin(state.clock.elapsedTime * 1.2) * 0.06;
    mat.emissiveIntensity = pulse;
  });

  return (
    <group>
      {/* Glow plane behind the text — driven by useFrame (MeshStandardMaterial is safe here) */}
      <mesh ref={glowRef} position={[0, 0.15, 0.003]}>
        <planeGeometry args={[1.4, 0.35]} />
        <meshStandardMaterial
          color="#8b8fdb"
          emissive="#8b8fdb"
          emissiveIntensity={0.12}
          transparent
          opacity={0}
        />
      </mesh>
      <Text
        position={[0, 0.15, 0.006]}
        fontSize={0.22}
        color="#8b8fdb"
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.12}
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
const ActiveScreen = memo(function ActiveScreen({ artifact }: { artifact: ArtifactData }) {
  const contentText = useMemo(() => {
    if (!artifact.content) return "(No content preview)";
    return truncateContent(artifact.content, CONTENT_MAX_CHARS);
  }, [artifact.content]);

  const badgeColor = TYPE_COLORS[artifact.type];
  const badgeLabel = TYPE_LABELS[artifact.type];

  return (
    <group>
      {/* Type badge */}
      <mesh position={[-CONTENT_WIDTH / 2 + 0.15, SCREEN_HEIGHT / 2 - 0.14, 0.005]}>
        <planeGeometry args={[0.28, 0.08]} />
        <meshStandardMaterial
          color={badgeColor}
          emissive={badgeColor}
          emissiveIntensity={0.4}
          roughness={0.5}
        />
      </mesh>
      <Text
        position={[-CONTENT_WIDTH / 2 + 0.15, SCREEN_HEIGHT / 2 - 0.14, 0.007]}
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
  bigScreenEvent,
  pageInfo,
}: ArtifactScreen3DProps) {
  const borderRef = useRef<Mesh>(null);
  const screenRef = useRef<Mesh>(null);
  const prevArtifactRef = useRef<string | null>(null);
  const pulseTimerRef = useRef(0);

  // React-state-driven canvas texture — avoids R3F JSX reconciler overwriting
  // imperative mat.map mutations on re-renders (Bug 4 root cause).
  const [bigScreenTexture, setBigScreenTexture] = useState<THREE.CanvasTexture | null>(null);

  // Offscreen canvas for BigScreen SVG rendering — created once
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 576;
    canvasRef.current = canvas;
    return () => {
      canvasRef.current = null;
    };
  }, []);

  // Render BigScreen SVG to canvas texture when event changes.
  // We drive the texture through React state so R3F's JSX reconciler
  // sees the updated map prop and never reverts it to null on re-render.
  useEffect(() => {
    if (!bigScreenEvent || !canvasRef.current) {
      setBigScreenTexture((prev) => {
        prev?.dispose();
        return null;
      });
      return;
    }

    console.log("[BigScreen] useEffect triggered — renderData.type:", bigScreenEvent.renderData?.type, "| title:", bigScreenEvent.title);

    const canvas = canvasRef.current;
    void renderToCanvas(canvas, bigScreenEvent)
      .then(() => {
        // Guard: component may have unmounted while async rendering was in-flight
        if (!canvasRef.current) return;
        const tex = new THREE.CanvasTexture(canvasRef.current);
        tex.needsUpdate = true;
        setBigScreenTexture((prev) => {
          prev?.dispose();
          return tex;
        });
        console.log("[BigScreen] CanvasTexture created and applied to screen mesh");
      })
      .catch((err: unknown) => {
        console.error("[BigScreen] renderToCanvas failed:", err);
        // Attempt canvas-API fallback: draw a plain colored rectangle with text
        // so the screen is never left black after a failure.
        if (!canvasRef.current) return;
        const fallbackCanvas = canvasRef.current;
        fallbackCanvas.width = 1024;
        fallbackCanvas.height = 576;
        const ctx = fallbackCanvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#0d1117";
          ctx.fillRect(0, 0, 1024, 576);
          ctx.fillStyle = "#58a6ff";
          ctx.font = "bold 20px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(bigScreenEvent.title || "시각화 데이터", 512, 260);
          ctx.fillStyle = "#8b949e";
          ctx.font = "14px sans-serif";
          ctx.fillText("(렌더링 오류 — 데이터는 수신됨)", 512, 300);
          const fallbackTex = new THREE.CanvasTexture(fallbackCanvas);
          fallbackTex.needsUpdate = true;
          setBigScreenTexture((prev) => {
            prev?.dispose();
            return fallbackTex;
          });
        }
      });
  }, [bigScreenEvent]);

  // Dispose texture on unmount
  useEffect(() => {
    return () => {
      bigScreenTexture?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    // Screen brightness — only animate when no BigScreen texture is active
    if (screenRef.current && !bigScreenTexture) {
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

      {/* Screen glass background — map prop is JSX-driven so R3F never reverts it */}
      <mesh ref={screenRef}>
        <planeGeometry args={[SCREEN_WIDTH, SCREEN_HEIGHT]} />
        {bigScreenTexture ? (
          <meshBasicMaterial map={bigScreenTexture} toneMapped={false} />
        ) : (
          <meshStandardMaterial
            color="#060610"
            emissive="#0a0a20"
            emissiveIntensity={0.04}
            roughness={0.15}
            metalness={0.2}
          />
        )}
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

      {/* Page indicator (Q/E navigation) */}
      {pageInfo && pageInfo.total > 1 && (
        <group position={[0, -SCREEN_HEIGHT / 2 - 0.12, 0.005]}>
          <Text fontSize={0.04} color="#8b949e" anchorX="center" anchorY="middle">
            {`◀ Q  ${pageInfo.current} / ${pageInfo.total}  E ▶`}
          </Text>
        </group>
      )}

      {/* Content layer — priority: BigScreen canvas texture > Artifact > Idle */}
      {bigScreenEvent ? null : artifact ? <ActiveScreen artifact={artifact} /> : <IdleScreen />}

      {/* Ambient light cast onto back wall */}
      <pointLight position={[0, 0, 0.4]} color="#4f46e5" intensity={0.3} distance={3} />
      {/* Secondary warm light from screen */}
      <pointLight position={[0, -0.5, 0.6]} color="#1a1a40" intensity={0.1} distance={2} />
    </group>
  );
});
