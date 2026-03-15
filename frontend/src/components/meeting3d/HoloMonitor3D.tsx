import { useRef, memo, useState, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import type { Group } from "three";
import { S } from "../../constants/strings";
import type { MonitorUpdateEvent } from "../../types";

const MONITOR_W = 0.52;
const MONITOR_H = 0.34;
const TABLE_SURFACE_Y = 0.76;
const CORNER = 0.06;

interface HoloMonitorProps {
  position: [number, number, number];
  rotationY: number;
  rotationX?: number;
  agentRole: string;
  agentName: string;
  color: string;
  monitorData?: MonitorUpdateEvent;
  /** Sophia is generating a visualization for BigScreen */
  isSophiaThinking?: boolean;
  /** Message to show during Sophia processing */
  sophiaStatus?: string;
  /** Full history of monitor pages for Q/E pagination */
  monitorHistory?: MonitorUpdateEvent[];
  /** Current page index in history */
  monitorPage?: number;
  /** Callback for Q/E navigation */
  onMonitorNav?: (dir: "prev" | "next") => void;
}

/** Render dynamic content based on monitor mode */
function renderMonitorContent(data: MonitorUpdateEvent): JSX.Element {
  switch (data.content.type) {
    case "idle":
      return <Text fontSize={0.02} color="#8b949e" anchorX="center" anchorY="middle">{data.content.text}</Text>;
    case "keyPoints":
      return (
        <group>
          {data.content.points.slice(0, 4).map((point, i) => (
            <Text key={i} position={[0, 0.04 - i * 0.025, 0.004]} fontSize={0.018} color="#e6edf3" anchorX="left" anchorY="middle" maxWidth={0.4}>
              {"\u2022"} {point}
            </Text>
          ))}
        </group>
      );
    case "confirm":
      return (
        <group>
          <Text position={[0, 0.06, 0.004]} fontSize={0.022} color="#58a6ff" anchorX="center" anchorY="middle">결정 필요</Text>
          {data.content.options.slice(0, 3).map((opt, i) => (
            <Text key={i} position={[0, 0.02 - i * 0.03, 0.004]} fontSize={0.018} color="#e6edf3" anchorX="center" anchorY="middle">
              [{i + 1}] {opt}
            </Text>
          ))}
        </group>
      );
    case "callout":
      return <Text fontSize={0.02} color="#fbbf24" anchorX="center" anchorY="middle">{data.content.message}</Text>;
    case "thinking":
      return <Text fontSize={0.022} color="#58a6ff" anchorX="center" anchorY="middle">생각 중...</Text>;
    case "speaking":
      return <Text fontSize={0.022} color="#3fb950" anchorX="center" anchorY="middle">발언 중</Text>;
    case "actionItems":
      return (
        <group>
          {data.content.items.slice(0, 3).map((item, i) => (
            <Text key={i} position={[0, 0.04 - i * 0.025, 0.004]} fontSize={0.016} color="#e6edf3" anchorX="left" anchorY="middle" maxWidth={0.4}>
              {"\u25A1"} {item.description}
            </Text>
          ))}
        </group>
      );
  }
}

/** Futuristic floating holographic monitor in front of each agent */
export const HoloMonitor3D = memo(function HoloMonitor3D({
  position,
  rotationY,
  rotationX = 0,
  agentRole,
  agentName,
  color,
  monitorData,
  isSophiaThinking = false,
  sophiaStatus,
  monitorHistory = [],
  monitorPage,
  onMonitorNav,
}: HoloMonitorProps) {
  const groupRef = useRef<Group>(null);
  const shimmerRef = useRef<THREE.Mesh>(null);
  const contentOpacityRef = useRef(0);
  const baseY = position[1];

  // Determine which data to display: history page or latest monitorData
  const displayData = monitorHistory.length > 0 && monitorPage !== undefined
    ? monitorHistory[monitorPage]
    : monitorData;

  // Fade-in when display data changes
  const [prevDataId, setPrevDataId] = useState<string | null>(null);
  const dataId = displayData ? JSON.stringify(displayData.content).slice(0, 50) : null;

  useEffect(() => {
    if (dataId && dataId !== prevDataId) {
      contentOpacityRef.current = 0; // Reset for fade-in
      setPrevDataId(dataId);
    }
  }, [dataId, prevDataId]);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.position.y =
      baseY + Math.sin(t * 1.0 + position[0] * 2) * 0.012;

    // Shimmer animation for Sophia thinking
    if (shimmerRef.current) {
      const mat = shimmerRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = isSophiaThinking
        ? 0.08 + Math.sin(t * 3) * 0.06 // Pulsing shimmer
        : THREE.MathUtils.lerp(mat.opacity, 0, delta * 3); // Fade out
    }

    // Fade-in content opacity (0 → 1 over ~0.5s)
    if (monitorData && contentOpacityRef.current < 1) {
      contentOpacityRef.current = Math.min(1, contentOpacityRef.current + delta * 2);
    }
  });

  const beamHeight = baseY - TABLE_SURFACE_Y;
  const hw = MONITOR_W / 2;
  const hh = MONITOR_H / 2;

  return (
    <group ref={groupRef} position={position} rotation={[0, rotationY, 0]}>
      {/* Inner group: local X tilt (top leans toward table center) */}
      <group rotation={[rotationX, 0, 0]}>
        {/* ─── Screen panel — dark glass ─── */}
        <mesh>
          <planeGeometry args={[MONITOR_W, MONITOR_H]} />
          <meshStandardMaterial
            color="#060612"
            transparent
            opacity={0.9}
            roughness={0.06}
            metalness={0.5}
            emissive="#0a0a2e"
            emissiveIntensity={0.2}
          />
        </mesh>

        {/* ─── Border glow frame ─── */}
        <mesh position={[0, 0, -0.002]}>
          <planeGeometry args={[MONITOR_W + 0.016, MONITOR_H + 0.016]} />
          <meshBasicMaterial color={color} transparent opacity={0.15} />
        </mesh>

        {/* ─── Edge accents (top + bottom) ─── */}
        <mesh position={[0, hh - 0.002, 0.002]}>
          <planeGeometry args={[MONITOR_W, 0.005]} />
          <meshBasicMaterial color={color} transparent opacity={0.55} />
        </mesh>
        <mesh position={[0, -hh + 0.002, 0.002]}>
          <planeGeometry args={[MONITOR_W, 0.003]} />
          <meshBasicMaterial color={color} transparent opacity={0.3} />
        </mesh>

        {/* ─── Corner brackets ─── */}
        {[
          [-hw + 0.01, hh - 0.01, 1, 1],
          [hw - 0.01, hh - 0.01, -1, 1],
          [-hw + 0.01, -hh + 0.01, 1, -1],
          [hw - 0.01, -hh + 0.01, -1, -1],
        ].map(([cx, cy, sx, sy], i) => (
          <group key={i} position={[cx, cy, 0.003]}>
            <mesh position={[(sx * CORNER) / 2, 0, 0]}>
              <planeGeometry args={[CORNER, 0.004]} />
              <meshBasicMaterial color={color} transparent opacity={0.6} />
            </mesh>
            <mesh position={[0, (sy * CORNER) / 2, 0]}>
              <planeGeometry args={[0.004, CORNER]} />
              <meshBasicMaterial color={color} transparent opacity={0.6} />
            </mesh>
          </group>
        ))}

        {/* ─── Role label ─── */}
        <Text
          position={[0, 0.065, 0.004]}
          fontSize={0.045}
          color={color}
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.1}
        >
          {agentRole.toUpperCase()}
        </Text>

        {/* ─── Name ─── */}
        <Text
          position={[0, 0.015, 0.004]}
          fontSize={0.028}
          color="#9aaacc"
          anchorX="center"
          anchorY="middle"
        >
          {agentName}
        </Text>

        {/* ─── Shimmer overlay (Sophia thinking state) ─── */}
        <mesh ref={shimmerRef} position={[0, 0, 0.001]}>
          <planeGeometry args={[MONITOR_W - 0.02, MONITOR_H - 0.02]} />
          <meshBasicMaterial color="#58a6ff" transparent opacity={0} />
        </mesh>

        {/* ─── Dynamic content or default status ─── */}
        <group position={[0, -0.04, 0.004]}>
          {isSophiaThinking ? (
            <group>
              <Text fontSize={0.018} color="#58a6ff" anchorX="center" anchorY="middle" position={[0, 0.01, 0]}>
                {sophiaStatus || "시각화 생성 중..."}
              </Text>
              <Text fontSize={0.014} color="#445577" anchorX="center" anchorY="middle" position={[0, -0.015, 0]}>
                Sophia AI
              </Text>
            </group>
          ) : displayData ? (
            renderMonitorContent(displayData)
          ) : (
            <Text fontSize={0.02} color="#667799" anchorX="center" anchorY="middle">
              {S.monitor.briefingReady}
            </Text>
          )}
        </group>

        {/* ─── Page indicator (Q/E navigation) ─── */}
        {monitorHistory.length > 1 && (
          <group position={[0, -MONITOR_H / 2 + 0.015, 0.005]}>
            <Text fontSize={0.012} color="#667799" anchorX="center" anchorY="middle">
              {`◀ Q  ${(monitorPage ?? monitorHistory.length - 1) + 1}/${monitorHistory.length}  E ▶`}
            </Text>
          </group>
        )}

        {/* ─── Holographic scanlines ─── */}
        {[0, 1, 2, 3].map((i) => (
          <mesh
            key={i}
            position={[0, -0.08 + i * 0.025, 0.003]}
          >
            <planeGeometry args={[MONITOR_W * 0.65, 0.001]} />
            <meshBasicMaterial color="#445577" transparent opacity={0.12} />
          </mesh>
        ))}
      </group>

      {/* ─── Projection beam (stays vertical, outside tilt group) ─── */}
      {beamHeight > 0 && (
        <group>
          <mesh position={[0, -beamHeight / 2, 0]}>
            <cylinderGeometry args={[0.003, 0.018, beamHeight, 8]} />
            <meshBasicMaterial color={color} transparent opacity={0.12} />
          </mesh>
          <mesh position={[0, -beamHeight / 2, 0]}>
            <cylinderGeometry args={[0.01, 0.03, beamHeight, 8]} />
            <meshBasicMaterial color={color} transparent opacity={0.04} />
          </mesh>
          <mesh
            position={[0, -beamHeight + 0.005, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <ringGeometry args={[0.015, 0.025, 16]} />
            <meshBasicMaterial color={color} transparent opacity={0.25} />
          </mesh>
        </group>
      )}

      {/* ─── Glow light ─── */}
      <pointLight
        position={[0, 0, 0.08]}
        color={color}
        intensity={0.06}
        distance={0.5}
      />
    </group>
  );
});
