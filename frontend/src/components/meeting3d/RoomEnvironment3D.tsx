import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import type { Mesh } from "three";

/** Office-like room environment: floor, walls, ambient decor */
export function RoomEnvironment3D() {
  return (
    <group>
      {/* ═══ FLOOR ═══ */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.01, 0]}
        receiveShadow
      >
        <planeGeometry args={[12, 12]} />
        <meshStandardMaterial color="#1a1a24" roughness={0.6} metalness={0.1} />
      </mesh>

      {/* Floor grid lines for depth perception */}
      <gridHelper
        args={[12, 24, "#222233", "#161622"]}
        position={[0, 0.001, 0]}
      />

      {/* ═══ WALLS ═══ */}
      {/* Back wall */}
      <mesh position={[0, 2, -5]} receiveShadow>
        <planeGeometry args={[12, 4.5]} />
        <meshStandardMaterial color="#12121a" roughness={0.9} />
      </mesh>

      {/* Left wall */}
      <mesh position={[-5, 2, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[12, 4.5]} />
        <meshStandardMaterial color="#0f0f17" roughness={0.9} />
      </mesh>

      {/* Right wall */}
      <mesh position={[5, 2, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[12, 4.5]} />
        <meshStandardMaterial color="#0f0f17" roughness={0.9} />
      </mesh>

      {/* ═══ WALL DECOR ═══ */}
      {/* BizRoom logo panel on back wall */}
      <mesh position={[0, 2.8, -4.98]}>
        <planeGeometry args={[2.5, 0.5]} />
        <meshStandardMaterial
          color="#0a0a1a"
          emissive="#4f46e5"
          emissiveIntensity={0.15}
          roughness={0.3}
        />
      </mesh>
      <Text
        position={[0, 2.8, -4.96]}
        fontSize={0.22}
        color="#c7d2fe"
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.12}
      >
        BizRoom
      </Text>

      {/* Side accent strips */}
      <mesh position={[-4.98, 2, -2]}>
        <planeGeometry args={[0.02, 3]} />
        <meshBasicMaterial color="#4f46e5" transparent opacity={0.3} />
      </mesh>
      <mesh position={[4.98, 2, -2]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.02, 3]} />
        <meshBasicMaterial color="#4f46e5" transparent opacity={0.3} />
      </mesh>

      {/* ═══ CEILING ═══ */}
      <mesh position={[0, 4.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[12, 12]} />
        <meshStandardMaterial color="#0a0a12" roughness={1} />
      </mesh>

      {/* ═══ CEILING LIGHTS ═══ */}
      <CeilingLight position={[-1.5, 4.1, -1]} />
      <CeilingLight position={[1.5, 4.1, -1]} />
      <CeilingLight position={[0, 4.1, 1.5]} />

      {/* ═══ DECORATIVE PLANTS ═══ */}
      <PlantPot position={[-3.5, 0, -3.5]} />
      <PlantPot position={[3.5, 0, -3.5]} />

      {/* ═══ WHITEBOARD ═══ */}
      <Whiteboard position={[-3.5, 2, -4.9]} />

      {/* ═══ WALL CLOCK ═══ */}
      <WallClock position={[3, 3.2, -4.95]} />
    </group>
  );
}

function CeilingLight({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[0.8, 0.03, 0.15]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#ffffff"
          emissiveIntensity={0.5}
        />
      </mesh>
    </group>
  );
}

function PlantPot({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Pot */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.15, 0.12, 0.35, 12]} />
        <meshStandardMaterial color="#4a3f35" roughness={0.8} />
      </mesh>
      {/* Plant foliage (simplified) */}
      <mesh position={[0, 0.6, 0]}>
        <sphereGeometry args={[0.25, 12, 8]} />
        <meshStandardMaterial color="#1a4a2a" roughness={0.9} />
      </mesh>
      <mesh position={[0.1, 0.75, 0.05]}>
        <sphereGeometry args={[0.18, 8, 8]} />
        <meshStandardMaterial color="#1f5530" roughness={0.9} />
      </mesh>
      <mesh position={[-0.08, 0.7, -0.05]}>
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshStandardMaterial color="#164525" roughness={0.9} />
      </mesh>
    </group>
  );
}

function Whiteboard({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Frame */}
      <mesh>
        <boxGeometry args={[1.8, 1.2, 0.05]} />
        <meshStandardMaterial color="#c0c0c0" roughness={0.5} metalness={0.3} />
      </mesh>
      {/* Board surface */}
      <mesh position={[0, 0, 0.026]}>
        <planeGeometry args={[1.7, 1.1]} />
        <meshStandardMaterial color="#f8f8f8" roughness={0.4} />
      </mesh>
      {/* Marker tray */}
      <mesh position={[0, -0.65, 0.05]}>
        <boxGeometry args={[0.6, 0.04, 0.06]} />
        <meshStandardMaterial color="#888" metalness={0.5} roughness={0.4} />
      </mesh>
    </group>
  );
}

function WallClock({ position }: { position: [number, number, number] }) {
  const hourRef = useRef<Mesh>(null);
  const minuteRef = useRef<Mesh>(null);
  const lastSecond = useRef(-1);

  useFrame((state) => {
    const sec = Math.floor(state.clock.elapsedTime);
    if (sec === lastSecond.current) return;
    lastSecond.current = sec;

    const now = new Date();
    if (hourRef.current) {
      const hours = now.getHours() % 12;
      hourRef.current.rotation.z = -(hours / 12) * Math.PI * 2 - (now.getMinutes() / 60 / 12) * Math.PI * 2;
    }
    if (minuteRef.current) {
      minuteRef.current.rotation.z = -(now.getMinutes() / 60) * Math.PI * 2;
    }
  });

  return (
    <group position={position}>
      {/* Clock face */}
      <mesh>
        <circleGeometry args={[0.2, 32]} />
        <meshStandardMaterial color="#f0f0f0" roughness={0.5} />
      </mesh>
      {/* Clock rim */}
      <mesh position={[0, 0, -0.01]}>
        <ringGeometry args={[0.19, 0.22, 32]} />
        <meshStandardMaterial color="#333" metalness={0.8} roughness={0.3} />
      </mesh>
      {/* Hour hand */}
      <mesh ref={hourRef} position={[0, 0, 0.01]}>
        <boxGeometry args={[0.015, 0.1, 0.005]} />
        <meshBasicMaterial color="#1a1a1a" />
      </mesh>
      {/* Minute hand */}
      <mesh ref={minuteRef} position={[0, 0, 0.015]}>
        <boxGeometry args={[0.008, 0.14, 0.005]} />
        <meshBasicMaterial color="#333" />
      </mesh>
      {/* Center dot */}
      <mesh position={[0, 0, 0.02]}>
        <circleGeometry args={[0.012, 12]} />
        <meshBasicMaterial color="#1a1a1a" />
      </mesh>
    </group>
  );
}
