import { useRef, useMemo, memo } from "react";
import { useFrame } from "@react-three/fiber";
import { Text, Billboard } from "@react-three/drei";
import { MathUtils, Vector3 } from "three";
import type { Group, Mesh } from "three";

interface AgentAvatar3DProps {
  agentRole: string;
  agentName: string;
  position: [number, number, number];
  rotation: [number, number, number];
  isSpeaking: boolean;
  isThinking: boolean;
  color: string;
  gazeTarget?: [number, number, number] | null;
}

const SKIN_COLOR = "#e8b89d";
const HAIR_COLORS: Record<string, string> = {
  coo: "#4a3728",
  cfo: "#6b4423",
  cmo: "#1a1a2e",
  chairman: "#2c2c2c",
};

/** Iris color per agent role */
const IRIS_COLORS: Record<string, string> = {
  coo: "#4a7ab5",      // Hudson - blue
  cfo: "#6b4e2a",      // Amelia - brown
  cmo: "#1f1f1f",      // Yusef  - dark
  chairman: "#3a3a3a", // Chairman - dark grey
};

/** Darker variant for suit jacket bottom / pants contrast */
const SUIT_DARK: Record<string, string> = {
  coo: "#2a5a9a",
  cfo: "#0a8a60",
  cmo: "#c45a10",
  chairman: "#6a3fc0",
};

// Lerp factor per-frame for gaze transitions (~0.3s at 60fps)
const GAZE_LERP = 0.08;
// Maximum pupil offset from eye center
const MAX_PUPIL_OFFSET = 0.008;
// Maximum head rotation toward gaze target (radians)
const MAX_HEAD_YAW = 0.15;
const MAX_HEAD_PITCH = 0.1;

// Reusable vector to avoid allocations each frame
const _tempWorldPos = new Vector3();
const _tempTargetDir = new Vector3();

export const AgentAvatar3D = memo(function AgentAvatar3D({
  agentRole,
  agentName,
  position,
  rotation,
  isSpeaking,
  isThinking,
  color,
  gazeTarget = null,
}: AgentAvatar3DProps) {
  const groupRef = useRef<Group>(null);
  const headRef = useRef<Group>(null);
  const mouthRef = useRef<Mesh>(null);
  const leftEyelidRef = useRef<Mesh>(null);
  const rightEyelidRef = useRef<Mesh>(null);
  const leftArmRef = useRef<Group>(null);
  const rightArmRef = useRef<Group>(null);
  const bodyRef = useRef<Group>(null);
  const speakingRingRef = useRef<Mesh>(null);
  // Gaze: pupil meshes
  const leftPupilRef = useRef<Mesh>(null);
  const rightPupilRef = useRef<Mesh>(null);

  // Smoothed gaze state (persists across frames)
  const gazeState = useRef({
    pupilOffsetX: 0,
    pupilOffsetY: 0,
    headYaw: 0,
    headPitch: 0,
  });

  // Random offsets for organic idle animations
  const offsets = useMemo(
    () => ({
      breathe: Math.random() * Math.PI * 2,
      sway: Math.random() * Math.PI * 2,
      blink: Math.random() * 5,
      headBob: Math.random() * Math.PI * 2,
      idleHand: Math.random() * Math.PI * 2,
      weightShift: Math.random() * Math.PI * 2,
    }),
    [],
  );

  const hairColor = HAIR_COLORS[agentRole] ?? "#3a2a1a";
  const irisColor = IRIS_COLORS[agentRole] ?? "#3a3020";
  const suitDark = SUIT_DARK[agentRole] ?? "#1e1e2e";

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    if (!groupRef.current) return;

    // Breathing: subtle Y translation
    const breatheAmp = isSpeaking ? 0.015 : 0.008;
    groupRef.current.position.y =
      position[1] + Math.sin((t + offsets.breathe) * 1.5) * breatheAmp;

    // Subtle body sway + weight shift
    if (bodyRef.current) {
      bodyRef.current.rotation.z =
        Math.sin((t + offsets.sway) * 0.5) * 0.01 +
        Math.sin((t + offsets.weightShift) * 0.22) * 0.005;
    }

    // ──── GAZE SYSTEM ────
    const gs = gazeState.current;
    let targetPupilX = 0;
    let targetPupilY = 0;
    let targetHeadYaw = 0;
    let targetHeadPitch = 0;

    if (gazeTarget && headRef.current && groupRef.current) {
      // Get the head's world position
      headRef.current.getWorldPosition(_tempWorldPos);
      // Direction from head to gaze target
      _tempTargetDir.set(gazeTarget[0], gazeTarget[1], gazeTarget[2]);
      _tempTargetDir.sub(_tempWorldPos);

      // Compute angles in avatar's local frame
      // We need to account for the avatar's rotation (Y rotation)
      const avatarYRot = rotation[1];
      const cosR = Math.cos(-avatarYRot);
      const sinR = Math.sin(-avatarYRot);
      const localX = _tempTargetDir.x * cosR - _tempTargetDir.z * sinR;
      const localZ = _tempTargetDir.x * sinR + _tempTargetDir.z * cosR;
      const localY = _tempTargetDir.y;
      const dist = Math.sqrt(localX * localX + localZ * localZ + localY * localY);

      if (dist > 0.01) {
        const yaw = Math.atan2(localX, localZ);
        const pitch = Math.atan2(localY, Math.sqrt(localX * localX + localZ * localZ));

        targetHeadYaw = MathUtils.clamp(yaw, -MAX_HEAD_YAW, MAX_HEAD_YAW);
        targetHeadPitch = MathUtils.clamp(-pitch, -MAX_HEAD_PITCH, MAX_HEAD_PITCH);

        // Pupils: map yaw/pitch to offset (normalized)
        targetPupilX = MathUtils.clamp(yaw / 1.0, -1, 1) * MAX_PUPIL_OFFSET;
        targetPupilY = MathUtils.clamp(pitch / 1.0, -1, 1) * MAX_PUPIL_OFFSET;
      }
    } else {
      // Idle: look slightly down at table/laptop
      targetHeadPitch = 0.05;
      targetPupilY = -MAX_PUPIL_OFFSET * 0.4;
    }

    // Smooth lerp toward target
    gs.pupilOffsetX = MathUtils.lerp(gs.pupilOffsetX, targetPupilX, GAZE_LERP);
    gs.pupilOffsetY = MathUtils.lerp(gs.pupilOffsetY, targetPupilY, GAZE_LERP);
    gs.headYaw = MathUtils.lerp(gs.headYaw, targetHeadYaw, GAZE_LERP);
    gs.headPitch = MathUtils.lerp(gs.headPitch, targetHeadPitch, GAZE_LERP);

    // Apply pupil offsets
    if (leftPupilRef.current) {
      leftPupilRef.current.position.x = -0.04 + gs.pupilOffsetX;
      leftPupilRef.current.position.y = gs.pupilOffsetY;
      leftPupilRef.current.position.z = 0.016;
    }
    if (rightPupilRef.current) {
      rightPupilRef.current.position.x = 0.04 + gs.pupilOffsetX;
      rightPupilRef.current.position.y = gs.pupilOffsetY;
      rightPupilRef.current.position.z = 0.016;
    }

    // ──── HEAD ANIMATION (compose gaze + expression) ────
    if (headRef.current) {
      if (isSpeaking) {
        headRef.current.rotation.x =
          Math.sin(t * 3) * 0.06 + Math.sin(t * 1.7) * 0.03 + gs.headPitch;
        headRef.current.rotation.y =
          Math.sin(t * 1.2) * 0.08 + gs.headYaw;
        headRef.current.rotation.z =
          Math.sin(t * 2.1) * 0.03;
      } else if (isThinking) {
        headRef.current.rotation.x =
          -0.08 + Math.sin(t * 0.8) * 0.03 + gs.headPitch;
        headRef.current.rotation.z = 0.06;
        headRef.current.rotation.y =
          Math.sin(t * 0.4) * 0.05 + gs.headYaw;
      } else {
        headRef.current.rotation.x =
          Math.sin((t + offsets.headBob) * 0.7) * 0.015 + gs.headPitch;
        headRef.current.rotation.y =
          Math.sin((t + offsets.headBob) * 0.3) * 0.02 + gs.headYaw;
        headRef.current.rotation.z =
          Math.sin((t + offsets.headBob) * 0.5) * 0.008;
      }
    }

    // Eye blinking
    if (leftEyelidRef.current && rightEyelidRef.current) {
      const blinkCycle = (t + offsets.blink) % 4;
      const blinkPhase = blinkCycle < 0.15 ? Math.sin((blinkCycle / 0.15) * Math.PI) : 0;
      const eyelidScale = blinkPhase * 0.025;
      leftEyelidRef.current.scale.y = eyelidScale > 0.001 ? 1 : 0.01;
      rightEyelidRef.current.scale.y = eyelidScale > 0.001 ? 1 : 0.01;
    }

    // Mouth animation (speaking)
    if (mouthRef.current) {
      if (isSpeaking) {
        const mouthOpen =
          (Math.sin(t * 8) * 0.5 + 0.5) *
          (Math.sin(t * 12) * 0.3 + 0.7) *
          0.04;
        mouthRef.current.scale.y = 0.5 + mouthOpen * 8;
        mouthRef.current.position.y = -0.09 - mouthOpen * 0.3;
      } else {
        mouthRef.current.scale.y = 0.5;
        mouthRef.current.position.y = -0.09;
      }
    }

    // Speaking ring animation (always rendered, toggle visible)
    if (speakingRingRef.current) {
      speakingRingRef.current.visible = isSpeaking;
      if (isSpeaking) {
        const scale = 1 + Math.sin(t * 3) * 0.1;
        speakingRingRef.current.scale.set(scale, scale, 1);
        const mat = speakingRingRef.current.material as { opacity: number };
        mat.opacity = 0.25 + Math.sin(t * 2) * 0.15;
      }
    }

    // Arm animations
    if (leftArmRef.current && rightArmRef.current) {
      // Subtle idle hand micro-movement added to all states
      const idleHandDrift = Math.sin((t + offsets.idleHand) * 0.35) * 0.008;

      if (isSpeaking) {
        leftArmRef.current.rotation.x =
          -0.2 + Math.sin(t * 2) * 0.15;
        leftArmRef.current.rotation.z =
          0.15 + Math.sin(t * 1.5) * 0.08;
        rightArmRef.current.rotation.x =
          -0.15 + Math.sin(t * 2.3 + 1) * 0.12;
        rightArmRef.current.rotation.z =
          -0.15 + Math.sin(t * 1.8 + 1) * 0.06;
      } else if (isThinking) {
        leftArmRef.current.rotation.x = -0.6;
        leftArmRef.current.rotation.z = 0.3;
        rightArmRef.current.rotation.x =
          -0.1 + Math.sin(t * 0.5) * 0.02;
        rightArmRef.current.rotation.z = -0.15;
      } else {
        leftArmRef.current.rotation.x =
          -0.35 + Math.sin((t + offsets.sway) * 0.5) * 0.01 + idleHandDrift;
        leftArmRef.current.rotation.z = 0.15;
        rightArmRef.current.rotation.x =
          -0.35 + Math.sin((t + offsets.sway) * 0.5) * 0.01 - idleHandDrift;
        rightArmRef.current.rotation.z = -0.15;
      }
    }
  });

  return (
    <group ref={groupRef} position={position} rotation={rotation}>
      {/* Name plate (always faces camera) */}
      <Billboard position={[0, 1.65, 0]} follow lockX={false} lockY={false} lockZ={false}>
        <group>
          <mesh position={[0, 0, -0.01]}>
            <planeGeometry args={[0.7, 0.22]} />
            <meshBasicMaterial
              color={isSpeaking ? color : isThinking ? "#fbbf24" : "#1e1e2e"}
              transparent
              opacity={0.85}
            />
          </mesh>
          <Text
            fontSize={0.1}
            color="white"
            anchorX="center"
            anchorY="middle"
          >
            {agentName}
          </Text>
          <Text
            position={[0, -0.08, 0]}
            fontSize={0.055}
            color="#94a3b8"
            anchorX="center"
            anchorY="middle"
          >
            {agentRole.toUpperCase()}
          </Text>
        </group>
      </Billboard>

      {/* Speaking glow ring (always rendered, visibility toggled in useFrame) */}
      <mesh ref={speakingRingRef} position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.45, 0.55, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.4} />
      </mesh>

      {/* Shadow under avatar (small dark circle on ground) */}
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.3, 24]} />
        <meshBasicMaterial color="#000010" transparent opacity={0.2} />
      </mesh>

      {/* Thinking indicator dots (always rendered, visibility toggled) */}
      <Billboard position={[0.35, 1.35, 0]} visible={isThinking}>
        <ThinkingDots />
      </Billboard>

      {/* Body group */}
      <group ref={bodyRef}>
        {/* Torso (suit jacket) - improved material */}
        <mesh position={[0, 0.7, 0]} castShadow>
          <capsuleGeometry args={[0.18, 0.35, 12, 24]} />
          <meshStandardMaterial
            color={color}
            roughness={0.65}
            metalness={0.08}
          />
        </mesh>

        {/* Suit lapel detail (darker accent V-shape) */}
        <mesh position={[-0.06, 0.88, 0.15]} rotation={[0, 0, 0.25]}>
          <boxGeometry args={[0.04, 0.12, 0.01]} />
          <meshStandardMaterial color={suitDark} roughness={0.6} metalness={0.1} />
        </mesh>
        <mesh position={[0.06, 0.88, 0.15]} rotation={[0, 0, -0.25]}>
          <boxGeometry args={[0.04, 0.12, 0.01]} />
          <meshStandardMaterial color={suitDark} roughness={0.6} metalness={0.1} />
        </mesh>

        {/* Shirt visible at collar */}
        <mesh position={[0, 0.92, 0.12]}>
          <boxGeometry args={[0.10, 0.07, 0.05]} />
          <meshStandardMaterial color="#f0f0f0" roughness={0.4} />
        </mesh>

        {/* Neck connector */}
        <mesh position={[0, 0.98, 0]}>
          <cylinderGeometry args={[0.055, 0.065, 0.08, 16]} />
          <meshStandardMaterial color={SKIN_COLOR} roughness={0.5} />
        </mesh>

        {/* Head group */}
        <group ref={headRef} position={[0, 1.15, 0]}>
          {/* Head - higher segment count for smoother sphere */}
          <mesh castShadow>
            <sphereGeometry args={[0.14, 32, 32]} />
            <meshStandardMaterial
              color={SKIN_COLOR}
              roughness={0.45}
              metalness={0.02}
            />
          </mesh>

          {/* Hair - main volume */}
          <mesh position={[0, 0.06, -0.02]}>
            <sphereGeometry args={[0.145, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={hairColor} roughness={0.8} />
          </mesh>
          {/* Hair - side volume left */}
          <mesh position={[-0.08, 0.04, -0.04]}>
            <sphereGeometry args={[0.1, 16, 16, 0, Math.PI, 0, Math.PI / 2.5]} />
            <meshStandardMaterial color={hairColor} roughness={0.85} />
          </mesh>
          {/* Hair - side volume right */}
          <mesh position={[0.08, 0.04, -0.04]}>
            <sphereGeometry args={[0.1, 16, 16, Math.PI, Math.PI, 0, Math.PI / 2.5]} />
            <meshStandardMaterial color={hairColor} roughness={0.85} />
          </mesh>
          {/* Hair - back volume */}
          <mesh position={[0, 0.02, -0.08]}>
            <sphereGeometry args={[0.13, 16, 16]} />
            <meshStandardMaterial color={hairColor} roughness={0.8} />
          </mesh>

          {/* Eyes group */}
          <group position={[0, 0.02, 0.12]}>
            {/* Left eye white */}
            <mesh position={[-0.04, 0, 0]}>
              <sphereGeometry args={[0.019, 16, 16]} />
              <meshStandardMaterial color="white" roughness={0.1} metalness={0.05} />
            </mesh>
            {/* Left iris */}
            <mesh position={[-0.04, 0, 0.012]}>
              <sphereGeometry args={[0.013, 16, 16]} />
              <meshStandardMaterial color={irisColor} roughness={0.2} metalness={0.1} />
            </mesh>
            {/* Left pupil (moved by gaze system) */}
            <mesh ref={leftPupilRef} position={[-0.04, 0, 0.016]}>
              <sphereGeometry args={[0.007, 12, 12]} />
              <meshStandardMaterial color="#0a0a0a" roughness={0.1} metalness={0.2} />
            </mesh>
            {/* Left eye specular highlight */}
            <mesh position={[-0.035, 0.005, 0.019]}>
              <sphereGeometry args={[0.003, 8, 8]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
            </mesh>
            {/* Left eyelid */}
            <mesh ref={leftEyelidRef} position={[-0.04, 0.012, 0.015]}>
              <boxGeometry args={[0.042, 0.025, 0.01]} />
              <meshStandardMaterial color={SKIN_COLOR} />
            </mesh>

            {/* Right eye white */}
            <mesh position={[0.04, 0, 0]}>
              <sphereGeometry args={[0.019, 16, 16]} />
              <meshStandardMaterial color="white" roughness={0.1} metalness={0.05} />
            </mesh>
            {/* Right iris */}
            <mesh position={[0.04, 0, 0.012]}>
              <sphereGeometry args={[0.013, 16, 16]} />
              <meshStandardMaterial color={irisColor} roughness={0.2} metalness={0.1} />
            </mesh>
            {/* Right pupil (moved by gaze system) */}
            <mesh ref={rightPupilRef} position={[0.04, 0, 0.016]}>
              <sphereGeometry args={[0.007, 12, 12]} />
              <meshStandardMaterial color="#0a0a0a" roughness={0.1} metalness={0.2} />
            </mesh>
            {/* Right eye specular highlight */}
            <mesh position={[0.045, 0.005, 0.019]}>
              <sphereGeometry args={[0.003, 8, 8]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
            </mesh>
            {/* Right eyelid */}
            <mesh ref={rightEyelidRef} position={[0.04, 0.012, 0.015]}>
              <boxGeometry args={[0.042, 0.025, 0.01]} />
              <meshStandardMaterial color={SKIN_COLOR} />
            </mesh>
          </group>

          {/* Eyebrows */}
          <mesh position={[-0.04, 0.055, 0.125]} rotation={[0, 0, 0.1]}>
            <boxGeometry args={[0.035, 0.006, 0.005]} />
            <meshStandardMaterial color={hairColor} />
          </mesh>
          <mesh position={[0.04, 0.055, 0.125]} rotation={[0, 0, -0.1]}>
            <boxGeometry args={[0.035, 0.006, 0.005]} />
            <meshStandardMaterial color={hairColor} />
          </mesh>

          {/* Nose */}
          <mesh position={[0, -0.02, 0.14]}>
            <sphereGeometry args={[0.015, 12, 12]} />
            <meshStandardMaterial color={SKIN_COLOR} roughness={0.6} />
          </mesh>

          {/* Mouth */}
          <mesh ref={mouthRef} position={[0, -0.09, 0.125]}>
            <boxGeometry args={[0.04, 0.01, 0.005]} />
            <meshStandardMaterial color="#c4756a" />
          </mesh>

          {/* Ears */}
          <mesh position={[-0.14, 0, 0]}>
            <sphereGeometry args={[0.025, 12, 12]} />
            <meshStandardMaterial color={SKIN_COLOR} roughness={0.6} />
          </mesh>
          <mesh position={[0.14, 0, 0]}>
            <sphereGeometry args={[0.025, 12, 12]} />
            <meshStandardMaterial color={SKIN_COLOR} roughness={0.6} />
          </mesh>
        </group>

        {/* Left arm - smoother geometry */}
        <group ref={leftArmRef} position={[-0.25, 0.82, 0]}>
          <mesh position={[0, -0.18, 0]} castShadow>
            <capsuleGeometry args={[0.055, 0.2, 8, 16]} />
            <meshStandardMaterial color={color} roughness={0.65} metalness={0.05} />
          </mesh>
          {/* Hand - slightly larger with finger bumps */}
          <group position={[0, -0.35, 0]}>
            <mesh>
              <sphereGeometry args={[0.045, 12, 12]} />
              <meshStandardMaterial color={SKIN_COLOR} roughness={0.55} />
            </mesh>
            {/* Finger bumps */}
            <mesh position={[0, -0.03, 0.02]}>
              <sphereGeometry args={[0.015, 8, 8]} />
              <meshStandardMaterial color={SKIN_COLOR} roughness={0.55} />
            </mesh>
            <mesh position={[0.02, -0.025, 0.01]}>
              <sphereGeometry args={[0.013, 8, 8]} />
              <meshStandardMaterial color={SKIN_COLOR} roughness={0.55} />
            </mesh>
            <mesh position={[-0.02, -0.025, 0.01]}>
              <sphereGeometry args={[0.013, 8, 8]} />
              <meshStandardMaterial color={SKIN_COLOR} roughness={0.55} />
            </mesh>
          </group>
        </group>

        {/* Right arm - smoother geometry */}
        <group ref={rightArmRef} position={[0.25, 0.82, 0]}>
          <mesh position={[0, -0.18, 0]} castShadow>
            <capsuleGeometry args={[0.055, 0.2, 8, 16]} />
            <meshStandardMaterial color={color} roughness={0.65} metalness={0.05} />
          </mesh>
          {/* Hand - slightly larger with finger bumps */}
          <group position={[0, -0.35, 0]}>
            <mesh>
              <sphereGeometry args={[0.045, 12, 12]} />
              <meshStandardMaterial color={SKIN_COLOR} roughness={0.55} />
            </mesh>
            {/* Finger bumps */}
            <mesh position={[0, -0.03, 0.02]}>
              <sphereGeometry args={[0.015, 8, 8]} />
              <meshStandardMaterial color={SKIN_COLOR} roughness={0.55} />
            </mesh>
            <mesh position={[0.02, -0.025, 0.01]}>
              <sphereGeometry args={[0.013, 8, 8]} />
              <meshStandardMaterial color={SKIN_COLOR} roughness={0.55} />
            </mesh>
            <mesh position={[-0.02, -0.025, 0.01]}>
              <sphereGeometry args={[0.013, 8, 8]} />
              <meshStandardMaterial color={SKIN_COLOR} roughness={0.55} />
            </mesh>
          </group>
        </group>

        {/* Lower body - darker suit color */}
        <mesh position={[0, 0.35, 0]}>
          <capsuleGeometry args={[0.16, 0.2, 8, 16]} />
          <meshStandardMaterial color={suitDark} roughness={0.75} metalness={0.03} />
        </mesh>
      </group>
    </group>
  );
});

/** Animated thinking dots */
function ThinkingDots() {
  const group = useRef<Group>(null);

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    const children = group.current.children;
    for (let i = 0; i < children.length; i++) {
      children[i].position.y = Math.sin(t * 4 + i * 0.8) * 0.03;
      (children[i] as Mesh).scale.setScalar(
        0.8 + Math.sin(t * 4 + i * 0.8) * 0.2,
      );
    }
  });

  return (
    <group ref={group}>
      <mesh position={[-0.06, 0, 0]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshBasicMaterial color="#fbbf24" />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshBasicMaterial color="#fbbf24" />
      </mesh>
      <mesh position={[0.06, 0, 0]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshBasicMaterial color="#fbbf24" />
      </mesh>
    </group>
  );
}
