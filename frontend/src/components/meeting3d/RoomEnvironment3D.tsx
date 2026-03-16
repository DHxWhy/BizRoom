import { Text, useTexture } from "@react-three/drei";
import { BackSide, RepeatWrapping } from "three";
import type { Texture } from "three";

/**
 * Modern bright meeting room — natural daylight, warm wood accents
 *
 * Layout (top view, camera at Z=-4.5 looking toward +Z):
 *   Back wall (Z=-7): Wood accent wall with BizRoom branding + TV
 *   Left (X=-7): White wall with windows
 *   Right (X=+7): White wall with windows
 *   Far (Z=+7): Floor-to-ceiling glass → bright sky
 *   Floor: Light warm gray carpet
 *   Ceiling: Clean white with wood accent panel + recessed lights
 */

const ROOM_W = 14;
const ROOM_D = 14;
const ROOM_H = 4.8;
const HALF_W = ROOM_W / 2;
const HALF_D = ROOM_D / 2;

export function RoomEnvironment3D() {
  const [colorMap, normalMap, roughnessMap] = useTexture([
    "/textures/wood-color.jpg",
    "/textures/wood-normal.jpg",
    "/textures/wood-roughness.jpg",
  ]);

  // Wall-scale tiling (larger surfaces need more repeats)
  [colorMap, normalMap, roughnessMap].forEach((tex) => {
    tex.wrapS = tex.wrapT = RepeatWrapping;
    tex.repeat.set(5, 2);
  });

  return (
    <group>
      {/* ═══ BRIGHT SKY BACKDROP ═══ */}
      <SkyBackdrop />

      {/* ═══ FLOOR — dark warm gray carpet ═══ */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[ROOM_W, ROOM_D]} />
        <meshStandardMaterial
          color="#3d3835"
          roughness={0.85}
          metalness={0.0}
        />
      </mesh>

      {/* ═══ CEILING — white with wood accent center ═══ */}
      <mesh position={[0, ROOM_H, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ROOM_W, ROOM_D]} />
        <meshStandardMaterial color="#f5f3f0" roughness={0.9} />
      </mesh>
      {/* Wood ceiling accent panel (center strip) */}
      <mesh position={[0, ROOM_H - 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[5, 8]} />
        <meshStandardMaterial color="#9a7b4a" roughness={0.6} metalness={0.02} />
      </mesh>

      {/* ═══ BACK WALL (Z=-7) — wood accent wall ═══ */}
      <BackWall woodMaps={{ colorMap, normalMap, roughnessMap }} />

      {/* ═══ SIDE WALLS — wood with windows ═══ */}
      <SideWall position={[-HALF_W, ROOM_H / 2, 0]} rotation={[0, Math.PI / 2, 0]} width={ROOM_D} height={ROOM_H} woodMaps={{ colorMap, normalMap, roughnessMap }} />
      <SideWall position={[HALF_W, ROOM_H / 2, 0]} rotation={[0, -Math.PI / 2, 0]} width={ROOM_D} height={ROOM_H} woodMaps={{ colorMap, normalMap, roughnessMap }} />

      {/* ═══ FAR WALL (Z=+7) — interior wall with windows ═══ */}
      <SideWall position={[0, ROOM_H / 2, HALF_D]} rotation={[0, Math.PI, 0]} width={ROOM_W} height={ROOM_H} woodMaps={{ colorMap, normalMap, roughnessMap }} />


      {/* ═══ MAIN LIGHTING — bright natural daylight ═══ */}
      {/* Key light — warm daylight from windows right */}
      <directionalLight
        position={[10, 8, 3]}
        intensity={3.0}
        color="#fff8f0"
        castShadow
      />
      {/* Fill light — soft from left windows */}
      <directionalLight
        position={[-10, 7, 2]}
        intensity={2.0}
        color="#f0f4ff"
      />
      {/* Top fill — overall ambient brightness */}
      <directionalLight
        position={[0, 10, 0]}
        intensity={1.5}
        color="#ffffff"
      />
      {/* Ambient — base brightness so nothing is too dark */}
      <ambientLight intensity={0.8} color="#f5f0eb" />

      {/* ═══ DECOR ═══ */}
      <ModernPlant position={[-5.5, 0, -5]} scale={1.2} />
      <ModernPlant position={[5.5, 0, -5]} scale={1.0} />

      {/* Floating shelves on back wall */}
      <FloatingShelf position={[4.5, 2.0, -6.85]} />
      <FloatingShelf position={[-4.5, 2.4, -6.85]} />
    </group>
  );
}

/** Bright daytime sky */
function SkyBackdrop() {
  return (
    <group>
      {/* Upper sky — bright blue */}
      <mesh>
        <sphereGeometry args={[45, 24, 16]} />
        <meshBasicMaterial color="#87CEEB" side={BackSide} />
      </mesh>

      {/* Lower horizon — warm white haze */}
      <mesh position={[0, -5, 0]}>
        <sphereGeometry args={[44, 24, 8, 0, Math.PI * 2, 0.7, 0.6]} />
        <meshBasicMaterial color="#f0ece4" side={BackSide} transparent opacity={0.8} />
      </mesh>

      {/* Ground plane below horizon */}
      <mesh position={[0, -15, 0]}>
        <sphereGeometry args={[43, 16, 4, 0, Math.PI * 2, 0.1, 0.5]} />
        <meshBasicMaterial color="#d4cfc8" side={BackSide} transparent opacity={0.6} />
      </mesh>
    </group>
  );
}

/** Wood wall with tall windows */
function SideWall({
  position,
  rotation,
  width,
  height,
  woodMaps,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  width: number;
  height: number;
  woodMaps: { colorMap: Texture; normalMap: Texture; roughnessMap: Texture };
}) {
  const windowSpacing = 3.5;
  const windowCount = Math.floor(width / windowSpacing);

  return (
    <group position={position} rotation={rotation}>
      {/* Solid wood wall */}
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          map={woodMaps.colorMap}
          normalMap={woodMaps.normalMap}
          roughnessMap={woodMaps.roughnessMap}
          roughness={0.55}
          metalness={0.02}
        />
      </mesh>

      {/* Windows — bright rectangles */}
      {Array.from({ length: windowCount }).map((_, i) => {
        const x = -width / 2 + windowSpacing * 0.8 + i * windowSpacing;
        return (
          <group key={i}>
            {/* Window pane — flat bright sky */}
            <mesh position={[x, 0.3, 0.02]}>
              <planeGeometry args={[1.4, 3.2]} />
              <meshBasicMaterial color="#d0e8f8" />
            </mesh>
            {/* Window frame */}
            <mesh position={[x, 0.3, 0.03]}>
              <planeGeometry args={[1.5, 3.3]} />
              <meshBasicMaterial color="#e8e4de" />
            </mesh>
            {/* Window cross frame */}
            <mesh position={[x, 0.3, 0.05]}>
              <boxGeometry args={[0.04, 3.2, 0.02]} />
              <meshStandardMaterial color="#d0ccc4" roughness={0.4} />
            </mesh>
            <mesh position={[x, 0.3, 0.05]}>
              <boxGeometry args={[1.4, 0.04, 0.02]} />
              <meshStandardMaterial color="#d0ccc4" roughness={0.4} />
            </mesh>
            {/* Light glow from window */}
            <pointLight position={[x, 0.5, 0.3]} color="#f8f4ee" intensity={0.5} distance={5} />
          </group>
        );
      })}

      {/* Baseboard */}
      <mesh position={[0, -height / 2 + 0.06, 0.02]}>
        <boxGeometry args={[width, 0.12, 0.03]} />
        <meshStandardMaterial color="#e0dcd4" roughness={0.6} />
      </mesh>
    </group>
  );
}


/** Back accent wall — wood panels + BizRoom branding */
function BackWall({ woodMaps }: { woodMaps: { colorMap: Texture; normalMap: Texture; roughnessMap: Texture } }) {
  return (
    <group>
      {/* Main wall — wood texture */}
      <mesh position={[0, ROOM_H / 2, -HALF_D]}>
        <planeGeometry args={[ROOM_W, ROOM_H]} />
        <meshStandardMaterial
          map={woodMaps.colorMap}
          normalMap={woodMaps.normalMap}
          roughnessMap={woodMaps.roughnessMap}
          roughness={0.55}
          metalness={0.02}
        />
      </mesh>

      {/* Wood accent panel (center) — pure wood texture, no tint */}
      <mesh position={[0, ROOM_H / 2, -HALF_D + 0.02]}>
        <planeGeometry args={[6, ROOM_H - 0.2]} />
        <meshStandardMaterial
          map={woodMaps.colorMap}
          normalMap={woodMaps.normalMap}
          roughnessMap={woodMaps.roughnessMap}
          roughness={0.45}
          metalness={0.02}
        />
      </mesh>

      {/* Horizontal wood plank lines */}
      {Array.from({ length: 16 }).map((_, i) => (
        <mesh key={i} position={[0, 0.3 + i * 0.28, -HALF_D + 0.04]}>
          <boxGeometry args={[5.8, 0.01, 0.01]} />
          <meshStandardMaterial color="#5a4a30" roughness={0.5} />
        </mesh>
      ))}

      {/* BizRoom logo — clean white on wood */}
      <mesh position={[0, 3.8, -HALF_D + 0.06]}>
        <planeGeometry args={[2.4, 0.5]} />
        <meshStandardMaterial
          color="#2a2420"
          roughness={0.3}
          transparent
          opacity={0.7}
        />
      </mesh>
      <Text
        position={[0, 3.8, -HALF_D + 0.08]}
        fontSize={0.22}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.15}
      >
        BizRoom
      </Text>

      {/* Subtle LED strip under logo */}
      <mesh position={[0, 3.5, -HALF_D + 0.06]}>
        <boxGeometry args={[2.0, 0.01, 0.01]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.5} />
      </mesh>
    </group>
  );
}


/** Modern tall plant in concrete pot */
function ModernPlant({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      {/* Dark pot */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.14, 0.16, 0.4, 8]} />
        <meshStandardMaterial color="#2a2a28" roughness={0.8} metalness={0.05} />
      </mesh>
      {/* Stem */}
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 0.8, 4]} />
        <meshStandardMaterial color="#4a6a3a" roughness={0.9} />
      </mesh>
      {/* Leaves cluster — rich green */}
      <mesh position={[0, 1.1, 0]}>
        <sphereGeometry args={[0.25, 8, 6]} />
        <meshStandardMaterial color="#2d6b2d" roughness={0.8} />
      </mesh>
      <mesh position={[0.14, 1.28, 0.05]}>
        <sphereGeometry args={[0.18, 6, 5]} />
        <meshStandardMaterial color="#3a8a3a" roughness={0.8} />
      </mesh>
      <mesh position={[-0.1, 1.22, -0.06]}>
        <sphereGeometry args={[0.15, 6, 5]} />
        <meshStandardMaterial color="#2a7a30" roughness={0.8} />
      </mesh>
    </group>
  );
}

/** Floating wall shelf with minimal decor */
function FloatingShelf({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[1.2, 0.03, 0.22]} />
        <meshStandardMaterial color="#9a7b4a" roughness={0.5} />
      </mesh>
      <mesh position={[-0.3, 0.08, 0]}>
        <boxGeometry args={[0.15, 0.12, 0.12]} />
        <meshStandardMaterial color="#1a3a5a" roughness={0.7} />
      </mesh>
      <mesh position={[-0.12, 0.06, 0]}>
        <boxGeometry args={[0.12, 0.09, 0.12]} />
        <meshStandardMaterial color="#5a2a1a" roughness={0.7} />
      </mesh>
      <mesh position={[0.3, 0.06, 0]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color="#d4af37" roughness={0.3} metalness={0.7} />
      </mesh>
    </group>
  );
}
