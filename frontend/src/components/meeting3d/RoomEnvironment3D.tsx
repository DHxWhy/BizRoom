import { Text } from "@react-three/drei";
import { DoubleSide, BackSide } from "three";

/**
 * High-rise startup office — golden hour city view
 *
 * Layout (top view, camera at Z=-4.5 looking toward +Z):
 *   Back wall (Z=-6): Solid accent wall with BizRoom branding
 *   Left (X=-7): Floor-to-ceiling glass → city skyline
 *   Right (X=7): Floor-to-ceiling glass → city skyline
 *   Far (Z=7): Floor-to-ceiling glass → city skyline (main view)
 *   Floor: Polished dark concrete
 *   Ceiling: Clean white with modern pendant tracks
 */

const ROOM_W = 14; // X extent (-7 to +7)
const ROOM_D = 14; // Z extent (-7 to +7)
const ROOM_H = 4.8;
const HALF_W = ROOM_W / 2;
const HALF_D = ROOM_D / 2;

export function RoomEnvironment3D() {
  return (
    <group>
      {/* ═══ SKY BACKDROP (visible through glass walls) ═══ */}
      <SkyBackdrop />

      {/* ═══ FLOOR — polished dark concrete ═══ */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[ROOM_W, ROOM_D]} />
        <meshStandardMaterial
          color="#3a3a42"
          roughness={0.25}
          metalness={0.3}
        />
      </mesh>

      {/* ═══ CEILING — clean white ═══ */}
      <mesh position={[0, ROOM_H, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ROOM_W, ROOM_D]} />
        <meshStandardMaterial color="#e8e8ec" roughness={0.9} />
      </mesh>

      {/* ═══ BACK WALL (Z=-7) — solid accent wall ═══ */}
      <BackWall />

      {/* ═══ GLASS WALLS (left, right, far) ═══ */}
      {/* Left glass wall (X=-7) */}
      <GlassWall
        position={[-HALF_W, ROOM_H / 2, 0]}
        rotation={[0, Math.PI / 2, 0]}
        width={ROOM_D}
        height={ROOM_H}
      />
      {/* Right glass wall (X=+7) */}
      <GlassWall
        position={[HALF_W, ROOM_H / 2, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        width={ROOM_D}
        height={ROOM_H}
      />
      {/* Far glass wall (Z=+7) — main city view */}
      <GlassWall
        position={[0, ROOM_H / 2, HALF_D]}
        rotation={[0, Math.PI, 0]}
        width={ROOM_W}
        height={ROOM_H}
      />

      {/* ═══ CEILING TRACK LIGHTS ═══ */}
      <TrackLight position={[-2.5, ROOM_H - 0.05, -1]} length={4} />
      <TrackLight position={[2.5, ROOM_H - 0.05, -1]} length={4} />
      <TrackLight position={[0, ROOM_H - 0.05, 2]} length={5} />

      {/* ═══ SUNLIGHT BEAM (golden hour from right) ═══ */}
      <directionalLight
        position={[8, 6, 2]}
        intensity={2.5}
        color="#ffe0aa"
      />
      {/* ═══ FILL LIGHT (from left, cooler tone) ═══ */}
      <directionalLight
        position={[-6, 5, 3]}
        intensity={0.8}
        color="#cce0ff"
      />

      {/* ═══ DECOR ═══ */}
      <ModernPlant position={[-5.5, 0, -5]} scale={1.2} />
      <ModernPlant position={[5.5, 0, -5]} scale={1.0} />
      <ModernPlant position={[-5.5, 0, 4.5]} scale={0.9} />

      {/* Minimal shelf on back wall */}
      <FloatingShelf position={[4, 2.0, -6.85]} />
      <FloatingShelf position={[-4, 2.4, -6.85]} />
    </group>
  );
}

/**
 * Atmospheric sky — layered gradient dome.
 * Deep indigo at zenith → warm amber at horizon → soft orange glow below.
 * No literal buildings — the atmosphere alone conveys height.
 */
function SkyBackdrop() {
  return (
    <group>
      {/* Upper sky dome — deep twilight */}
      <mesh>
        <sphereGeometry args={[45, 24, 16]} />
        <meshBasicMaterial color="#0d0b1a" side={BackSide} />
      </mesh>

      {/* Mid-sky layer — warm purple transition */}
      <mesh>
        <sphereGeometry args={[44, 24, 8, 0, Math.PI * 2, 0.8, 0.7]} />
        <meshBasicMaterial color="#2d1b4e" side={BackSide} transparent opacity={0.7} />
      </mesh>

      {/* Horizon glow — warm amber band */}
      <mesh position={[0, -5, 0]}>
        <sphereGeometry args={[43, 32, 6, 0, Math.PI * 2, 0.6, 0.5]} />
        <meshBasicMaterial color="#e8944a" side={BackSide} transparent opacity={0.5} />
      </mesh>

      {/* Horizon intense glow — golden line */}
      <mesh position={[0, -8, 0]}>
        <sphereGeometry args={[42, 32, 4, 0, Math.PI * 2, 0.4, 0.3]} />
        <meshBasicMaterial color="#ffb347" side={BackSide} transparent opacity={0.6} />
      </mesh>

      {/* Below horizon — subtle warm ground */}
      <mesh position={[0, -15, 0]}>
        <sphereGeometry args={[41, 16, 4, 0, Math.PI * 2, 0.1, 0.5]} />
        <meshBasicMaterial color="#1a1220" side={BackSide} transparent opacity={0.8} />
      </mesh>

      {/* Distant haze/fog plane at horizon level — adds depth */}
      <mesh position={[0, 1.5, 20]} rotation={[0, 0, 0]}>
        <planeGeometry args={[80, 6]} />
        <meshBasicMaterial color="#d4864a" transparent opacity={0.12} side={DoubleSide} />
      </mesh>
      <mesh position={[20, 1.5, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[80, 6]} />
        <meshBasicMaterial color="#d4864a" transparent opacity={0.1} side={DoubleSide} />
      </mesh>
      <mesh position={[-20, 1.5, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[80, 6]} />
        <meshBasicMaterial color="#d4864a" transparent opacity={0.1} side={DoubleSide} />
      </mesh>
    </group>
  );
}

/** Floor-to-ceiling glass panel with mullions */
function GlassWall({
  position,
  rotation,
  width,
  height,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  width: number;
  height: number;
}) {
  const mullionCount = Math.floor(width / 1.8);

  return (
    <group position={position} rotation={rotation}>
      {/* Glass panel */}
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          color="#88ccff"
          transparent
          opacity={0.08}
          roughness={0.05}
          metalness={0.9}
        />
      </mesh>

      {/* Subtle tint reflection layer */}
      <mesh position={[0, 0, 0.01]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          color="#aaddff"
          transparent
          opacity={0.04}
          roughness={0.0}
          metalness={1.0}
        />
      </mesh>

      {/* Vertical mullions (thin dark frames) */}
      {Array.from({ length: mullionCount + 1 }).map((_, i) => {
        const x = -width / 2 + i * (width / mullionCount);
        return (
          <mesh key={`v${i}`} position={[x, 0, 0.02]}>
            <boxGeometry args={[0.03, height, 0.02]} />
            <meshStandardMaterial color="#1a1a1a" roughness={0.4} metalness={0.6} />
          </mesh>
        );
      })}

      {/* Horizontal mullion at mid height */}
      <mesh position={[0, 0, 0.02]}>
        <boxGeometry args={[width, 0.03, 0.02]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.4} metalness={0.6} />
      </mesh>

      {/* Floor-level baseboard */}
      <mesh position={[0, -height / 2 + 0.05, 0.03]}>
        <boxGeometry args={[width, 0.1, 0.04]} />
        <meshStandardMaterial color="#222" roughness={0.5} metalness={0.3} />
      </mesh>
    </group>
  );
}

/** Back accent wall — dark wood panels + BizRoom branding */
function BackWall() {
  return (
    <group>
      {/* Main wall — warm dark charcoal */}
      <mesh position={[0, ROOM_H / 2, -HALF_D]}>
        <planeGeometry args={[ROOM_W, ROOM_H]} />
        <meshStandardMaterial color="#1e1e24" roughness={0.7} />
      </mesh>

      {/* Wood accent panel (center) */}
      <mesh position={[0, ROOM_H / 2, -HALF_D + 0.02]}>
        <planeGeometry args={[6, ROOM_H - 0.2]} />
        <meshStandardMaterial color="#3a2a1e" roughness={0.6} metalness={0.05} />
      </mesh>

      {/* Vertical wood slat accents */}
      {Array.from({ length: 12 }).map((_, i) => (
        <mesh key={i} position={[-2.7 + i * 0.5, ROOM_H / 2, -HALF_D + 0.04]}>
          <boxGeometry args={[0.08, ROOM_H - 0.4, 0.02]} />
          <meshStandardMaterial color="#4a3828" roughness={0.5} />
        </mesh>
      ))}

      {/* BizRoom logo — backlit panel */}
      <mesh position={[0, 3.6, -HALF_D + 0.08]}>
        <planeGeometry args={[2.4, 0.5]} />
        <meshStandardMaterial
          color="#0a0a14"
          emissive="#6366f1"
          emissiveIntensity={0.4}
          roughness={0.2}
        />
      </mesh>
      <Text
        position={[0, 3.6, -HALF_D + 0.1]}
        fontSize={0.22}
        color="#c7d2fe"
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.15}
      >
        BizRoom
      </Text>

      {/* Subtle LED strip under logo */}
      <mesh position={[0, 3.3, -HALF_D + 0.06]}>
        <boxGeometry args={[2.4, 0.015, 0.01]} />
        <meshBasicMaterial color="#6366f1" transparent opacity={0.6} />
      </mesh>
    </group>
  );
}

/** Modern ceiling track light */
function TrackLight({ position, length }: { position: [number, number, number]; length: number }) {
  return (
    <group position={position}>
      {/* Track rail */}
      <mesh>
        <boxGeometry args={[length, 0.025, 0.04]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.3} metalness={0.7} />
      </mesh>
      {/* Light fixtures along track */}
      {Array.from({ length: Math.floor(length / 1.2) }).map((_, i) => {
        const x = -length / 2 + 0.6 + i * 1.2;
        return (
          <mesh key={i} position={[x, -0.04, 0]}>
            <cylinderGeometry args={[0.06, 0.04, 0.08, 8]} />
            <meshStandardMaterial
              color="#f5f5f0"
              emissive="#fff5e6"
              emissiveIntensity={3.5}
              roughness={0.3}
            />
          </mesh>
        );
      })}
    </group>
  );
}

/** Modern tall plant in concrete pot */
function ModernPlant({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      {/* Concrete pot */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.12, 0.15, 0.4, 8]} />
        <meshStandardMaterial color="#9a9a98" roughness={0.8} metalness={0.05} />
      </mesh>
      {/* Stem */}
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 0.8, 4]} />
        <meshStandardMaterial color="#4a6a3a" roughness={0.9} />
      </mesh>
      {/* Leaves cluster */}
      <mesh position={[0, 1.1, 0]}>
        <sphereGeometry args={[0.22, 8, 6]} />
        <meshStandardMaterial color="#2a5a2a" roughness={0.85} />
      </mesh>
      <mesh position={[0.12, 1.25, 0.05]}>
        <sphereGeometry args={[0.16, 6, 5]} />
        <meshStandardMaterial color="#3a7a3a" roughness={0.85} />
      </mesh>
      <mesh position={[-0.08, 1.2, -0.06]}>
        <sphereGeometry args={[0.14, 6, 5]} />
        <meshStandardMaterial color="#2a6a30" roughness={0.85} />
      </mesh>
    </group>
  );
}

/** Floating wall shelf with minimal decor */
function FloatingShelf({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Shelf board */}
      <mesh>
        <boxGeometry args={[1.2, 0.03, 0.22]} />
        <meshStandardMaterial color="#3a2a1e" roughness={0.5} />
      </mesh>
      {/* Book stack */}
      <mesh position={[-0.3, 0.08, 0]}>
        <boxGeometry args={[0.15, 0.12, 0.12]} />
        <meshStandardMaterial color="#1a3a5a" roughness={0.7} />
      </mesh>
      <mesh position={[-0.12, 0.06, 0]}>
        <boxGeometry args={[0.12, 0.09, 0.12]} />
        <meshStandardMaterial color="#5a2a1a" roughness={0.7} />
      </mesh>
      {/* Small decorative object */}
      <mesh position={[0.3, 0.06, 0]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color="#d4af37" roughness={0.3} metalness={0.7} />
      </mesh>
    </group>
  );
}
