import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { RepeatWrapping } from "three";
import type { Mesh } from "three";

/** Central meeting table with chairs and props */
export function MeetingTable3D() {
  const [colorMap, normalMap, roughnessMap] = useTexture([
    "/textures/wood-color.jpg",
    "/textures/wood-normal.jpg",
    "/textures/wood-roughness.jpg",
  ]);

  // Tile the wood texture for natural grain scale
  [colorMap, normalMap, roughnessMap].forEach((tex) => {
    tex.wrapS = tex.wrapT = RepeatWrapping;
    tex.repeat.set(3, 3);
  });

  return (
    <group>
      {/* ═══ TABLE ═══ */}
      {/* Table top - real wood texture oval (scaled to ellipse for 7 seats) */}
      <mesh position={[0, 0.72, 0]} scale={[1.3, 1, 1]} receiveShadow castShadow>
        <cylinderGeometry args={[1.4, 1.4, 0.06, 48]} />
        <meshStandardMaterial
          map={colorMap}
          normalMap={normalMap}
          roughnessMap={roughnessMap}
          roughness={0.35}
          metalness={0.02}
        />
      </mesh>

      {/* Table edge trim */}
      <mesh position={[0, 0.70, 0]} scale={[1.3, 1, 1]}>
        <cylinderGeometry args={[1.42, 1.42, 0.02, 48]} />
        <meshStandardMaterial
          map={colorMap}
          normalMap={normalMap}
          roughnessMap={roughnessMap}
          roughness={0.4}
          metalness={0.05}
        />
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
