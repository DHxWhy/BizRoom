import { useRef, memo } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import type { Group } from "three";
import { S } from "../../constants/strings";

const MONITOR_W = 0.52;
const MONITOR_H = 0.34;
const TABLE_SURFACE_Y = 0.76;
const CORNER = 0.06;

interface HoloMonitorProps {
  position: [number, number, number];
  rotationY: number;
  agentRole: string;
  agentName: string;
  color: string;
}

/** Futuristic floating holographic monitor in front of each agent */
export const HoloMonitor3D = memo(function HoloMonitor3D({
  position,
  rotationY,
  agentRole,
  agentName,
  color,
}: HoloMonitorProps) {
  const groupRef = useRef<Group>(null);
  const baseY = position[1];

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.position.y =
      baseY + Math.sin(t * 1.0 + position[0] * 2) * 0.012;
  });

  const beamHeight = baseY - TABLE_SURFACE_Y;
  const hw = MONITOR_W / 2;
  const hh = MONITOR_H / 2;

  return (
    <group ref={groupRef} position={position} rotation={[0, rotationY, 0]}>
      {/* ─── Screen panel — dark glass ─── */}
      <mesh rotation={[-0.1, 0, 0]}>
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
      <mesh position={[0, 0, -0.002]} rotation={[-0.1, 0, 0]}>
        <planeGeometry args={[MONITOR_W + 0.016, MONITOR_H + 0.016]} />
        <meshBasicMaterial color={color} transparent opacity={0.15} />
      </mesh>

      {/* ─── Edge accents (top + bottom) ─── */}
      <mesh position={[0, hh - 0.002, 0.002]} rotation={[-0.1, 0, 0]}>
        <planeGeometry args={[MONITOR_W, 0.005]} />
        <meshBasicMaterial color={color} transparent opacity={0.55} />
      </mesh>
      <mesh position={[0, -hh + 0.002, 0.002]} rotation={[-0.1, 0, 0]}>
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
        <group key={i} position={[cx, cy, 0.003]} rotation={[-0.1, 0, 0]}>
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
        rotation={[-0.1, 0, 0]}
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
        rotation={[-0.1, 0, 0]}
        fontSize={0.028}
        color="#9aaacc"
        anchorX="center"
        anchorY="middle"
      >
        {agentName}
      </Text>

      {/* ─── Status indicator ─── */}
      <Text
        position={[0, -0.04, 0.004]}
        rotation={[-0.1, 0, 0]}
        fontSize={0.02}
        color="#667799"
        anchorX="center"
        anchorY="middle"
      >
        {S.monitor.briefingReady}
      </Text>

      {/* ─── Holographic scanlines ─── */}
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={i}
          position={[0, -0.08 + i * 0.025, 0.003]}
          rotation={[-0.1, 0, 0]}
        >
          <planeGeometry args={[MONITOR_W * 0.65, 0.001]} />
          <meshBasicMaterial color="#445577" transparent opacity={0.12} />
        </mesh>
      ))}

      {/* ─── Projection beam from table surface ─── */}
      {beamHeight > 0 && (
        <group>
          {/* Main beam */}
          <mesh position={[0, -beamHeight / 2, 0]}>
            <cylinderGeometry args={[0.003, 0.018, beamHeight, 8]} />
            <meshBasicMaterial color={color} transparent opacity={0.12} />
          </mesh>
          {/* Outer glow */}
          <mesh position={[0, -beamHeight / 2, 0]}>
            <cylinderGeometry args={[0.01, 0.03, beamHeight, 8]} />
            <meshBasicMaterial color={color} transparent opacity={0.04} />
          </mesh>
          {/* Base ring on table */}
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
