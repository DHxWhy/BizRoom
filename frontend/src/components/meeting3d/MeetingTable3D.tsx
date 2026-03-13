import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import type { Mesh } from "three";

/**
 * Name plate positions derived from SEAT_CONFIG in MeetingRoom3D.
 * Each plate sits ~40% of the way from the seat toward center [0,0,0],
 * on the table surface (y=0.46).
 */
const SEAT_POSITIONS: { pos: [number, number, number]; label: string }[] = [
  { pos: [0, 0, -2.2],     label: "Chairman" },
  { pos: [-1.9, 0, -1.0],  label: "COO" },
  { pos: [-2.1, 0, 0.2],   label: "CFO" },
  { pos: [-1.7, 0, 1.3],   label: "CLO" },
  { pos: [1.9, 0, -1.0],   label: "CMO" },
  { pos: [2.1, 0, 0.2],    label: "CTO" },
  { pos: [1.7, 0, 1.3],    label: "CDO" },
];

const TABLE_NAME_PLATES = SEAT_POSITIONS.map(({ pos, label }) => {
  const dx = -pos[0];
  const dz = -pos[2];
  const dist = Math.sqrt(dx * dx + dz * dz);
  const nx = dx / dist;
  const nz = dz / dist;
  // Place plate 40% toward center from seat, on table surface (Y=0.66)
  const t = 0.4;
  return {
    position: [pos[0] + nx * dist * t, 0.76, pos[2] + nz * dist * t] as [number, number, number],
    label,
  };
});

/** Central meeting table with chairs and props */
export function MeetingTable3D() {
  return (
    <group>
      {/* ═══ TABLE ═══ */}
      {/* Table top - dark walnut oval (scaled to ellipse for 7 seats) */}
      <mesh position={[0, 0.72, 0]} scale={[1.3, 1, 1]} receiveShadow castShadow>
        <cylinderGeometry args={[1.4, 1.4, 0.06, 48]} />
        <meshStandardMaterial
          color="#3a2718"
          roughness={0.3}
          metalness={0.05}
        />
      </mesh>

      {/* Table edge trim */}
      <mesh position={[0, 0.70, 0]} scale={[1.3, 1, 1]}>
        <cylinderGeometry args={[1.42, 1.42, 0.02, 48]} />
        <meshStandardMaterial color="#2a1a0e" roughness={0.4} metalness={0.1} />
      </mesh>

      {/* Table center pedestal */}
      <mesh position={[0, 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.2, 0.68, 16]} />
        <meshStandardMaterial color="#333340" roughness={0.5} metalness={0.6} />
      </mesh>

      {/* Table base plate */}
      <mesh position={[0, 0.01, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 0.02, 24]} />
        <meshStandardMaterial color="#333340" roughness={0.5} metalness={0.6} />
      </mesh>

      {/* ═══ SCREEN (center table display) ═══ */}
      <CenterScreen />

      {/* Name plates removed — agent identity shown via Billboard badges */}
    </group>
  );
}


/** Floating center screen for artifacts / presentations */
function CenterScreen() {
  const ref = useRef<Mesh>(null);

  useFrame((state) => {
    if (!ref.current) return;
    ref.current.position.y = 1.05 + Math.sin(state.clock.elapsedTime * 0.8) * 0.015;
    ref.current.position.z = -0.4;
  });

  return (
    <group>
      {/* Screen frame (light moves with it) */}
      <mesh ref={ref} position={[0, 1.05, -0.4]} rotation={[Math.PI / 12, 0, 0]}>
        <boxGeometry args={[0.6, 0.35, 0.01]} />
        <meshStandardMaterial
          color="#0a0a1a"
          roughness={0.2}
          metalness={0.3}
          emissive="#1e3a5f"
          emissiveIntensity={0.3}
        />
        <pointLight
          position={[0, 0, 0.1]}
          color="#3b82f6"
          intensity={0.3}
          distance={1.5}
        />
      </mesh>
    </group>
  );
}

/** Tiny desk name plate */
function NamePlate({
  position,
  label,
}: {
  position: [number, number, number];
  label: string;
}) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[0.14, 0.04, 0.05]} />
        <meshStandardMaterial color="#c0a882" roughness={0.4} metalness={0.3} />
      </mesh>
      <Text
        position={[0, 0.025, 0.026]}
        fontSize={0.02}
        color="#1a1a1a"
        anchorX="center"
        anchorY="middle"
      >
        {label}
      </Text>
    </group>
  );
}
