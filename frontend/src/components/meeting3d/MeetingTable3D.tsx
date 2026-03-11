import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import type { Mesh } from "three";

/** Central meeting table with chairs and props */
export function MeetingTable3D() {
  return (
    <group>
      {/* ═══ TABLE ═══ */}
      {/* Table top - dark walnut oval */}
      <mesh position={[0, 0.42, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[1.4, 1.4, 0.06, 48]} />
        <meshStandardMaterial
          color="#3a2718"
          roughness={0.3}
          metalness={0.05}
        />
      </mesh>

      {/* Table edge trim */}
      <mesh position={[0, 0.40, 0]}>
        <cylinderGeometry args={[1.42, 1.42, 0.02, 48]} />
        <meshStandardMaterial color="#2a1a0e" roughness={0.4} metalness={0.1} />
      </mesh>

      {/* Table center pedestal */}
      <mesh position={[0, 0.2, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.2, 0.38, 16]} />
        <meshStandardMaterial color="#333340" roughness={0.5} metalness={0.6} />
      </mesh>

      {/* Table base plate */}
      <mesh position={[0, 0.01, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 0.02, 24]} />
        <meshStandardMaterial color="#333340" roughness={0.5} metalness={0.6} />
      </mesh>

      {/* ═══ SCREEN (center table display) ═══ */}
      <CenterScreen />

      {/* ═══ CHAIRS ═══ */}
      <Chair position={[0, 0, -1.8]} rotation={[0, Math.PI, 0]} />
      <Chair position={[-1.55, 0, -0.9]} rotation={[0, Math.PI * 0.72, 0]} />
      <Chair position={[1.55, 0, -0.9]} rotation={[0, -Math.PI * 0.72, 0]} />
      <Chair position={[0, 0, 1.8]} rotation={[0, 0, 0]} />

      {/* ═══ NAME PLATES on table ═══ */}
      <NamePlate position={[0, 0.46, -0.9]} label="COO" />
      <NamePlate position={[-0.85, 0.46, -0.5]} label="CFO" />
      <NamePlate position={[0.85, 0.46, -0.5]} label="CMO" />
      <NamePlate position={[0, 0.46, 0.9]} label="YOU" />
    </group>
  );
}

/** A simple office chair */
function Chair({
  position,
  rotation,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
}) {
  return (
    <group position={position} rotation={rotation}>
      {/* Seat */}
      <mesh position={[0, 0.38, 0]} castShadow>
        <boxGeometry args={[0.38, 0.04, 0.38]} />
        <meshStandardMaterial color="#1a1a2e" roughness={0.8} />
      </mesh>
      {/* Cushion */}
      <mesh position={[0, 0.41, 0]}>
        <boxGeometry args={[0.34, 0.03, 0.34]} />
        <meshStandardMaterial color="#2d2d44" roughness={0.9} />
      </mesh>
      {/* Backrest */}
      <mesh position={[0, 0.62, -0.17]} castShadow>
        <boxGeometry args={[0.34, 0.4, 0.04]} />
        <meshStandardMaterial color="#1a1a2e" roughness={0.8} />
      </mesh>
      {/* Backrest cushion */}
      <mesh position={[0, 0.62, -0.14]}>
        <boxGeometry args={[0.30, 0.36, 0.03]} />
        <meshStandardMaterial color="#2d2d44" roughness={0.9} />
      </mesh>
      {/* Chair base stem */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.36, 8]} />
        <meshStandardMaterial color="#555" metalness={0.8} roughness={0.3} />
      </mesh>
      {/* Chair star base */}
      {[0, 72, 144, 216, 288].map((angle) => (
        <mesh
          key={angle}
          position={[
            Math.sin((angle * Math.PI) / 180) * 0.18,
            0.03,
            Math.cos((angle * Math.PI) / 180) * 0.18,
          ]}
          rotation={[0, (angle * Math.PI) / 180, Math.PI / 2]}
        >
          <capsuleGeometry args={[0.012, 0.16, 4, 4]} />
          <meshStandardMaterial color="#555" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

/** Floating center screen for artifacts / presentations */
function CenterScreen() {
  const ref = useRef<Mesh>(null);

  useFrame((state) => {
    if (!ref.current) return;
    ref.current.position.y =
      0.75 + Math.sin(state.clock.elapsedTime * 0.8) * 0.015;
  });

  return (
    <group>
      {/* Screen frame (light moves with it) */}
      <mesh ref={ref} position={[0, 0.75, 0]} rotation={[-0.15, 0, 0]}>
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
