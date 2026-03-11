import { useRef, useMemo, memo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, Text, Billboard } from "@react-three/drei";
import { MathUtils, Quaternion, Euler, SkinnedMesh, Bone } from "three";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Group } from "three";
import { AVATAR_CONFIGS, DEFAULT_AVATAR } from "./avatarConfig";

interface RPMAgentAvatarProps {
  agentRole: string;
  agentName: string;
  position: [number, number, number];
  rotation: [number, number, number];
  isSpeaking: boolean;
  isThinking: boolean;
  color: string;
  gazeTarget?: [number, number, number] | null;
}

/**
 * SITTING POSE — delta rotations (Euler XYZ radians) MULTIPLIED onto rest pose.
 * RPM models use Mixamo skeleton in T-pose. We must NOT overwrite
 * the rest quaternion — instead we compose deltas via quaternion multiply.
 */
const SITTING_DELTAS: Record<string, [number, number, number]> = {
  // ─── Torso ───
  Hips:         [-0.1, 0, 0],       // pelvis tilt for seated posture
  Spine:        [0.06, 0, 0],       // straighten upper body
  Spine1:       [0.04, 0, 0],
  Spine2:       [0.03, 0, 0],
  // ─── Legs (+X = thigh forward in RPM bone-local frame) ───
  LeftUpLeg:    [1.45, 0, 0],       // thigh forward ~83°
  RightUpLeg:   [1.45, 0, 0],
  LeftLeg:      [-1.45, 0, 0],      // knee bend ~83°
  RightLeg:     [-1.45, 0, 0],
  // ─── Feet ───
  LeftFoot:     [0.3, 0, 0],        // feet flat on ground
  RightFoot:    [0.3, 0, 0],
  // ─── Shoulders (bring arms closer to body from A-pose) ───
  LeftShoulder:  [0, 0, 0.15],      // shoulder inward toward body
  RightShoulder: [0, 0, -0.15],     // shoulder inward toward body
  // ─── Arms (bring slightly forward from A-pose for lap rest) ───
  LeftArm:      [0.4, 0, 0.2],      // arm forward + slightly inward
  RightArm:     [0.4, 0, -0.2],     // arm forward + slightly inward
  // ─── Forearms (gentle bend so hands rest on thighs, not through them) ───
  LeftForeArm:  [-0.4, 0, 0],       // forearm toward lap (reduced from -0.6)
  RightForeArm: [-0.4, 0, 0],
  // ─── Hands (angle slightly inward for natural resting pose) ───
  LeftHand:     [0.15, 0, 0.1],     // wrist angled to rest on thigh
  RightHand:    [0.15, 0, -0.1],    // wrist angled to rest on thigh
};

const _deltaQuat = new Quaternion();
const _deltaEuler = new Euler();

/* Agent colors come from AVATAR_CONFIGS — no duplicate map needed */

/** Ready Player Me avatar with sitting pose, gaze, and speaking animation */
export const RPMAgentAvatar = memo(function RPMAgentAvatar({
  agentRole,
  agentName,
  position,
  rotation,
  isSpeaking,
  isThinking,
  color,
  gazeTarget,
}: RPMAgentAvatarProps) {
  const groupRef = useRef<Group>(null);
  const headBoneRef = useRef<Bone | null>(null);
  const neckBoneRef = useRef<Bone | null>(null);
  const meshRef = useRef<SkinnedMesh | null>(null);
  const gazeState = useRef({ yaw: 0, pitch: 0 });

  const config = AVATAR_CONFIGS[agentRole] ?? DEFAULT_AVATAR;
  const { scene } = useGLTF(config.url);

  // SkeletonUtils.clone properly handles SkinnedMesh + bone bindings
  const clonedScene = useMemo(() => {
    const cloned = skeletonClone(scene);

    // Reset refs for this clone
    headBoneRef.current = null;
    neckBoneRef.current = null;
    meshRef.current = null;

    cloned.traverse((child) => {
      // Apply sitting pose deltas to bones (quaternion multiply, not overwrite)
      if ((child as Bone).isBone) {
        const bone = child as Bone;
        const delta = SITTING_DELTAS[bone.name];
        if (delta) {
          _deltaEuler.set(delta[0], delta[1], delta[2], "XYZ");
          _deltaQuat.setFromEuler(_deltaEuler);
          bone.quaternion.multiply(_deltaQuat);
        }
        if (bone.name === "Head") headBoneRef.current = bone;
        if (bone.name === "Neck") neckBoneRef.current = bone;
      }

      // Store mesh ref for morph targets
      if ((child as SkinnedMesh).isSkinnedMesh) {
        const sm = child as SkinnedMesh;
        meshRef.current = sm;
        sm.castShadow = true;
        sm.receiveShadow = true;
        sm.frustumCulled = false;
      }
    });

    return cloned;
  }, [scene]);

  // Per-frame animation
  useFrame((state) => {
    if (!groupRef.current) return;

    const mesh = meshRef.current;
    const head = headBoneRef.current;
    const neck = neckBoneRef.current;
    const t = state.clock.elapsedTime;

    // ─── Morph target animations ───
    if (mesh?.morphTargetDictionary && mesh.morphTargetInfluences) {
      const dict = mesh.morphTargetDictionary;
      const infl = mesh.morphTargetInfluences;

      // Jaw open (speaking)
      const jawIdx = dict["jawOpen"];
      if (jawIdx !== undefined) {
        const target = isSpeaking
          ? 0.15 + Math.sin(t * 8) * 0.12 + Math.sin(t * 13) * 0.06
          : 0;
        infl[jawIdx] = MathUtils.lerp(infl[jawIdx], target, 0.15);
      }

      // Smile
      const smL = dict["mouthSmileLeft"];
      const smR = dict["mouthSmileRight"];
      if (smL !== undefined && smR !== undefined) {
        const smTarget = isSpeaking ? 0.2 : 0.05;
        infl[smL] = MathUtils.lerp(infl[smL], smTarget, 0.05);
        infl[smR] = MathUtils.lerp(infl[smR], smTarget, 0.05);
      }

      // Blink (~every 3-5 seconds)
      const blL = dict["eyeBlinkLeft"];
      const blR = dict["eyeBlinkRight"];
      if (blL !== undefined && blR !== undefined) {
        const blinkPhase = (t * 0.3) % 1;
        const bv = blinkPhase < 0.03 ? 1 : 0;
        infl[blL] = bv;
        infl[blR] = bv;
      }
    }

    // ─── Gaze tracking (head + neck) ───
    if (head && gazeTarget) {
      const dx = gazeTarget[0] - position[0];
      const dz = gazeTarget[2] - position[2];
      const dist = Math.sqrt(dx * dx + dz * dz);
      const targetYaw = MathUtils.clamp(Math.atan2(dx, dz), -0.6, 0.6);
      const targetPitch = MathUtils.clamp(
        Math.atan2(gazeTarget[1] - 1.2, dist),
        -0.3, 0.3,
      );

      gazeState.current.yaw = MathUtils.lerp(gazeState.current.yaw, targetYaw, 0.04);
      gazeState.current.pitch = MathUtils.lerp(gazeState.current.pitch, targetPitch, 0.04);

      if (neck) {
        neck.rotation.y = gazeState.current.yaw * 0.4;
        neck.rotation.x = gazeState.current.pitch * 0.3;
      }
      head.rotation.y = gazeState.current.yaw * 0.6;
      head.rotation.x = gazeState.current.pitch * 0.5;
    }

    // ─── Subtle breathing ───
    const breathe = Math.sin(t * 1.5) * 0.003;
    groupRef.current.position.y = position[1] + config.yOffset + breathe;
  });

  const agentColor = config.color ?? color;

  return (
    <group
      ref={groupRef}
      position={[position[0], position[1] + config.yOffset, position[2]]}
      rotation={rotation}
    >
      {/* Model + Chair rotated together by facingOffset */}
      <group rotation={[0, config.facingOffset ?? Math.PI, 0]}>
        <primitive object={clonedScene} scale={config.scale} />
        <OfficeChair />
      </group>

      {/* ═══ NAME BADGE ═══ */}
      <Billboard position={[0, (config.nameHeight ?? 1.6) + 0.15, 0]}>
        {/* Background pill */}
        <mesh>
          <planeGeometry args={[0.65, 0.15]} />
          <meshBasicMaterial
            color={isSpeaking ? agentColor : "#1a1a2a"}
            transparent
            opacity={0.88}
          />
        </mesh>
        {/* Border highlight */}
        <mesh position={[0, 0, -0.001]}>
          <planeGeometry args={[0.67, 0.17]} />
          <meshBasicMaterial
            color={agentColor}
            transparent
            opacity={0.3}
          />
        </mesh>
        <Text
          position={[0, 0, 0.001]}
          fontSize={0.058}
          color={isSpeaking ? "#ffffff" : agentColor}
          anchorX="center"
          anchorY="middle"
          maxWidth={0.6}
        >
          {agentName} · {agentRole.toUpperCase()}
        </Text>
      </Billboard>

      {/* ═══ SPEAKING RING ═══ */}
      {isSpeaking && <SpeakingRing color={agentColor} />}

      {/* ═══ THINKING DOTS ═══ */}
      {isThinking && !isSpeaking && <ThinkingDots />}
    </group>
  );
});

/**
 * Office chair — all Y positions in avatar-local space.
 *
 * Key reference heights (avatar-local):
 *   Floor (world Y=0):   localY = |SEATED_Y| ≈ 0.42
 *   Avatar hips (seated): localY ≈ 1.02
 *   Chair seat:           localY ≈ 0.97  (just below hips)
 */
const FLOOR_LOCAL = 0.42; // |SEATED_Y| — where world ground maps to in local
const SEAT_LOCAL = 0.97;  // just below hips at 1.02

const OfficeChair = memo(function OfficeChair() {
  return (
    <group position={[0, 0, 0.08]}>
      {/* Seat cushion */}
      <mesh position={[0, SEAT_LOCAL, 0]}>
        <boxGeometry args={[0.44, 0.05, 0.42]} />
        <meshStandardMaterial color="#1a1a24" roughness={0.8} />
      </mesh>
      {/* Backrest */}
      <mesh position={[0, SEAT_LOCAL + 0.30, -0.2]}>
        <boxGeometry args={[0.40, 0.55, 0.04]} />
        <meshStandardMaterial color="#1a1a24" roughness={0.75} />
      </mesh>
      {/* Backrest cushion */}
      <mesh position={[0, SEAT_LOCAL + 0.30, -0.17]}>
        <boxGeometry args={[0.36, 0.48, 0.02]} />
        <meshStandardMaterial color="#252530" roughness={0.85} />
      </mesh>
      {/* Center post (from base to seat) */}
      <mesh position={[0, (FLOOR_LOCAL + SEAT_LOCAL) / 2, 0]}>
        <cylinderGeometry args={[0.025, 0.035, SEAT_LOCAL - FLOOR_LOCAL, 8]} />
        <meshStandardMaterial color="#2a2a35" roughness={0.3} metalness={0.7} />
      </mesh>
      {/* Clean circular base (replaces messy star legs + wheels) */}
      <mesh position={[0, FLOOR_LOCAL + 0.015, 0]}>
        <cylinderGeometry args={[0.25, 0.25, 0.03, 24]} />
        <meshStandardMaterial color="#1a1a24" roughness={0.4} metalness={0.5} />
      </mesh>
      {/* Armrests */}
      <mesh position={[-0.22, SEAT_LOCAL + 0.16, 0.02]}>
        <boxGeometry args={[0.04, 0.03, 0.22]} />
        <meshStandardMaterial color="#222" roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh position={[0.22, SEAT_LOCAL + 0.16, 0.02]}>
        <boxGeometry args={[0.04, 0.03, 0.22]} />
        <meshStandardMaterial color="#222" roughness={0.6} metalness={0.2} />
      </mesh>
      {/* Armrest supports */}
      <mesh position={[-0.22, SEAT_LOCAL + 0.08, 0.02]}>
        <cylinderGeometry args={[0.012, 0.012, 0.14, 6]} />
        <meshStandardMaterial color="#2a2a35" roughness={0.3} metalness={0.7} />
      </mesh>
      <mesh position={[0.22, SEAT_LOCAL + 0.08, 0.02]}>
        <cylinderGeometry args={[0.012, 0.012, 0.14, 6]} />
        <meshStandardMaterial color="#2a2a35" roughness={0.3} metalness={0.7} />
      </mesh>
    </group>
  );
});

/** Pulsing ring below avatar when speaking */
function SpeakingRing({ color }: { color: string }) {
  const ref = useRef<Group>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const s = 1 + Math.sin(state.clock.elapsedTime * 4) * 0.08;
    ref.current.scale.set(s, 1, s);
  });
  return (
    <group ref={ref} position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <ringGeometry args={[0.45, 0.52, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} />
      </mesh>
    </group>
  );
}

/** Thinking dots animation */
function ThinkingDots() {
  const ref = useRef<Group>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.children.forEach((child, i) => {
      child.position.y = 1.55 + Math.sin(t * 3 + i * 1.2) * 0.04;
    });
  });
  return (
    <group ref={ref}>
      {[-0.05, 0, 0.05].map((x, i) => (
        <mesh key={i} position={[x, 1.55, 0.15]}>
          <sphereGeometry args={[0.018, 8, 8]} />
          <meshBasicMaterial color="#fbbf24" />
        </mesh>
      ))}
    </group>
  );
}

/** Preload all RPM models */
export function preloadRPMAvatars() {
  const urls = new Set(Object.values(AVATAR_CONFIGS).map((c) => c.url));
  for (const url of urls) {
    useGLTF.preload(url);
  }
}
