import { useRef, memo } from "react";
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

/* ═══ PER-AGENT VISUAL CONFIG ═══ */

const SKIN_TONES: Record<string, string> = {
  coo: "#e8b89d",     // Hudson - light
  cfo: "#f0c8a8",     // Amelia - fair
  cmo: "#8d5524",     // Yusef  - brown
  chairman: "#e0b090", // Chairman
  cto: "#d4a574",     // Kelvin
  cdo: "#f5d0b0",     // Jonas  - light
  clo: "#c8a282",     // Bradley
};

const HAIR_COLORS: Record<string, string> = {
  coo: "#4a3728",     // dark brown
  cfo: "#8b6914",     // golden brown
  cmo: "#1a1a1a",     // black
  chairman: "#3a3a3a",
  cto: "#2a2a2a",     // near black
  cdo: "#5a3a20",     // brown
  clo: "#6a6a6a",     // gray
};

/** Iris color per agent */
const IRIS_COLORS: Record<string, string> = {
  coo: "#4a7ab5",
  cfo: "#6b8a4a",    // green-hazel
  cmo: "#1f1f1f",
  chairman: "#3a5a3a",
  cto: "#3a5a7a",
  cdo: "#5a7a4a",
  clo: "#4a4a6a",
};

/** Darker suit accent for jacket details */
const SUIT_DARK: Record<string, string> = {
  coo: "#1e3a6a",
  cfo: "#0a6a4a",
  cmo: "#8a3a0a",
  chairman: "#4a2a8a",
  cto: "#2a2a5a",
  cdo: "#5a2a2a",
  clo: "#2a4a4a",
};

/** Hair style type per agent */
const HAIR_STYLE: Record<string, "short" | "medium" | "long" | "buzz" | "wavy"> = {
  coo: "short",
  cfo: "long",      // Amelia
  cmo: "buzz",      // Yusef
  chairman: "medium",
  cto: "short",
  cdo: "wavy",
  clo: "short",
};

/** Tie colors */
const TIE_COLORS: Record<string, string> = {
  coo: "#1e3a8a",   // navy
  cfo: "#8a1e3a",   // burgundy (necklace/scarf instead)
  cmo: "#d97706",   // amber
  chairman: "#4c1d95",
  cto: "#064e3b",   // dark teal
  cdo: "#78350f",   // brown
  clo: "#1e293b",   // charcoal
};

/** Whether agent wears a tie (false = scarf/pendant for female agents) */
const WEARS_TIE: Record<string, boolean> = {
  coo: true, cfo: false, cmo: true, chairman: true,
  cto: true, cdo: true, clo: true,
};

// Gaze constants
const GAZE_LERP = 0.08;
const MAX_PUPIL_OFFSET = 0.008;
const MAX_HEAD_YAW = 0.15;
const MAX_HEAD_PITCH = 0.1;

const _tempWorldPos = new Vector3();
const _tempTargetDir = new Vector3();

/** Create random phase offsets at module scope — avoids impure Math.random()
 *  calls inside component render detected by the React Compiler. Each avatar
 *  instance gets a unique set computed when the module first loads. */
function makeOffsets() {
  return {
    breathe: Math.random() * Math.PI * 2,
    sway: Math.random() * Math.PI * 2,
    blink: Math.random() * 5,
    headBob: Math.random() * Math.PI * 2,
    idleHand: Math.random() * Math.PI * 2,
    weightShift: Math.random() * Math.PI * 2,
  };
}

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
  const leftPupilRef = useRef<Mesh>(null);
  const rightPupilRef = useRef<Mesh>(null);

  const gazeState = useRef({
    pupilOffsetX: 0, pupilOffsetY: 0,
    headYaw: 0, headPitch: 0,
  });

  // Random phase offsets — created once via module-scope factory so the
  // React Compiler does not see Math.random() as an impure render call.
  const offsets = useRef(makeOffsets()).current;

  const skinColor = SKIN_TONES[agentRole] ?? "#e0b090";
  const hairColor = HAIR_COLORS[agentRole] ?? "#3a2a1a";
  const irisColor = IRIS_COLORS[agentRole] ?? "#3a3020";
  const suitDark = SUIT_DARK[agentRole] ?? "#1e1e2e";
  const hairStyle = HAIR_STYLE[agentRole] ?? "short";
  const tieColor = TIE_COLORS[agentRole] ?? "#1e3a8a";
  const wearsTie = WEARS_TIE[agentRole] ?? true;

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (!groupRef.current) return;

    // Breathing
    const breatheAmp = isSpeaking ? 0.012 : 0.006;
    groupRef.current.position.y =
      position[1] + Math.sin((t + offsets.breathe) * 1.5) * breatheAmp;

    // Subtle body sway
    if (bodyRef.current) {
      bodyRef.current.rotation.z =
        Math.sin((t + offsets.sway) * 0.5) * 0.008 +
        Math.sin((t + offsets.weightShift) * 0.22) * 0.004;
    }

    // ──── GAZE SYSTEM ────
    const gs = gazeState.current;
    let targetPupilX = 0;
    let targetPupilY = 0;
    let targetHeadYaw = 0;
    let targetHeadPitch = 0;

    if (gazeTarget && headRef.current && groupRef.current) {
      headRef.current.getWorldPosition(_tempWorldPos);
      _tempTargetDir.set(gazeTarget[0], gazeTarget[1], gazeTarget[2]);
      _tempTargetDir.sub(_tempWorldPos);

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
        targetPupilX = MathUtils.clamp(yaw / 1.0, -1, 1) * MAX_PUPIL_OFFSET;
        targetPupilY = MathUtils.clamp(pitch / 1.0, -1, 1) * MAX_PUPIL_OFFSET;
      }
    } else {
      targetHeadPitch = 0.05;
      targetPupilY = -MAX_PUPIL_OFFSET * 0.4;
    }

    gs.pupilOffsetX = MathUtils.lerp(gs.pupilOffsetX, targetPupilX, GAZE_LERP);
    gs.pupilOffsetY = MathUtils.lerp(gs.pupilOffsetY, targetPupilY, GAZE_LERP);
    gs.headYaw = MathUtils.lerp(gs.headYaw, targetHeadYaw, GAZE_LERP);
    gs.headPitch = MathUtils.lerp(gs.headPitch, targetHeadPitch, GAZE_LERP);

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

    // ──── HEAD ANIMATION ────
    if (headRef.current) {
      if (isSpeaking) {
        headRef.current.rotation.x = Math.sin(t * 3) * 0.05 + Math.sin(t * 1.7) * 0.025 + gs.headPitch;
        headRef.current.rotation.y = Math.sin(t * 1.2) * 0.06 + gs.headYaw;
        headRef.current.rotation.z = Math.sin(t * 2.1) * 0.025;
      } else if (isThinking) {
        headRef.current.rotation.x = -0.06 + Math.sin(t * 0.8) * 0.02 + gs.headPitch;
        headRef.current.rotation.z = 0.05;
        headRef.current.rotation.y = Math.sin(t * 0.4) * 0.04 + gs.headYaw;
      } else {
        headRef.current.rotation.x = Math.sin((t + offsets.headBob) * 0.7) * 0.012 + gs.headPitch;
        headRef.current.rotation.y = Math.sin((t + offsets.headBob) * 0.3) * 0.015 + gs.headYaw;
        headRef.current.rotation.z = Math.sin((t + offsets.headBob) * 0.5) * 0.006;
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

    // Mouth
    if (mouthRef.current) {
      if (isSpeaking) {
        const mouthOpen = (Math.sin(t * 8) * 0.5 + 0.5) * (Math.sin(t * 12) * 0.3 + 0.7) * 0.035;
        mouthRef.current.scale.y = 0.5 + mouthOpen * 8;
        mouthRef.current.position.y = -0.065 - mouthOpen * 0.3;
      } else {
        mouthRef.current.scale.y = 0.5;
        mouthRef.current.position.y = -0.065;
      }
    }

    // Speaking ring
    if (speakingRingRef.current) {
      speakingRingRef.current.visible = isSpeaking;
      if (isSpeaking) {
        const scale = 1 + Math.sin(t * 3) * 0.1;
        speakingRingRef.current.scale.set(scale, scale, 1);
        const mat = speakingRingRef.current.material as { opacity: number };
        mat.opacity = 0.25 + Math.sin(t * 2) * 0.15;
      }
    }

    // Arms
    if (leftArmRef.current && rightArmRef.current) {
      const idleHandDrift = Math.sin((t + offsets.idleHand) * 0.35) * 0.005;

      if (isSpeaking) {
        leftArmRef.current.rotation.x = -0.15 + Math.sin(t * 2) * 0.12;
        leftArmRef.current.rotation.z = 0.1 + Math.sin(t * 1.5) * 0.06;
        rightArmRef.current.rotation.x = -0.1 + Math.sin(t * 2.3 + 1) * 0.1;
        rightArmRef.current.rotation.z = -0.1 + Math.sin(t * 1.8 + 1) * 0.05;
      } else if (isThinking) {
        leftArmRef.current.rotation.x = -0.5;
        leftArmRef.current.rotation.z = 0.25;
        rightArmRef.current.rotation.x = -0.08 + Math.sin(t * 0.5) * 0.015;
        rightArmRef.current.rotation.z = -0.12;
      } else {
        leftArmRef.current.rotation.x = -0.3 + Math.sin((t + offsets.sway) * 0.5) * 0.008 + idleHandDrift;
        leftArmRef.current.rotation.z = 0.12;
        rightArmRef.current.rotation.x = -0.3 + Math.sin((t + offsets.sway) * 0.5) * 0.008 - idleHandDrift;
        rightArmRef.current.rotation.z = -0.12;
      }
    }
  });

  return (
    <group ref={groupRef} position={position} rotation={rotation}>
      {/* ═══ NAME PLATE ═══ */}
      <Billboard position={[0, 1.7, 0]} follow lockX={false} lockY={false} lockZ={false}>
        <group>
          <mesh position={[0, 0, -0.01]}>
            <planeGeometry args={[0.7, 0.22]} />
            <meshBasicMaterial
              color={isSpeaking ? color : isThinking ? "#fbbf24" : "#1e1e2e"}
              transparent
              opacity={0.85}
            />
          </mesh>
          <Text fontSize={0.1} color="white" anchorX="center" anchorY="middle">
            {agentName}
          </Text>
          <Text position={[0, -0.08, 0]} fontSize={0.055} color="#94a3b8" anchorX="center" anchorY="middle">
            {agentRole.toUpperCase()}
          </Text>
        </group>
      </Billboard>

      {/* ═══ SPEAKING RING ═══ */}
      <mesh ref={speakingRingRef} position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.45, 0.55, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.4} />
      </mesh>

      {/* ═══ GROUND SHADOW ═══ */}
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.35, 24]} />
        <meshBasicMaterial color="#000010" transparent opacity={0.15} />
      </mesh>

      {/* ═══ OFFICE CHAIR ═══ */}
      <OfficeChair color="#2a2a3a" />

      {/* ═══ THINKING DOTS ═══ */}
      <Billboard position={[0.35, 1.45, 0]} visible={isThinking}>
        <ThinkingDots />
      </Billboard>

      {/* ═══ BODY ═══ */}
      <group ref={bodyRef}>
        {/* Upper legs (seated) */}
        <mesh position={[-0.08, 0.42, 0.08]} rotation={[1.4, 0, 0]}>
          <capsuleGeometry args={[0.06, 0.2, 6, 12]} />
          <meshStandardMaterial color={suitDark} roughness={0.7} />
        </mesh>
        <mesh position={[0.08, 0.42, 0.08]} rotation={[1.4, 0, 0]}>
          <capsuleGeometry args={[0.06, 0.2, 6, 12]} />
          <meshStandardMaterial color={suitDark} roughness={0.7} />
        </mesh>

        {/* Lower legs (below chair, hanging) */}
        <mesh position={[-0.08, 0.18, 0.2]} rotation={[0.2, 0, 0]}>
          <capsuleGeometry args={[0.05, 0.18, 6, 12]} />
          <meshStandardMaterial color={suitDark} roughness={0.7} />
        </mesh>
        <mesh position={[0.08, 0.18, 0.2]} rotation={[0.2, 0, 0]}>
          <capsuleGeometry args={[0.05, 0.18, 6, 12]} />
          <meshStandardMaterial color={suitDark} roughness={0.7} />
        </mesh>

        {/* Shoes */}
        <mesh position={[-0.08, 0.06, 0.24]}>
          <boxGeometry args={[0.08, 0.04, 0.14]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.4} metalness={0.2} />
        </mesh>
        <mesh position={[0.08, 0.06, 0.24]}>
          <boxGeometry args={[0.08, 0.04, 0.14]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.4} metalness={0.2} />
        </mesh>

        {/* ═══ TORSO ═══ */}
        {/* Main torso - wider at shoulders, narrower at waist */}
        <mesh position={[0, 0.72, 0]} castShadow>
          <cylinderGeometry args={[0.17, 0.14, 0.35, 16]} />
          <meshStandardMaterial color={color} roughness={0.6} metalness={0.08} />
        </mesh>

        {/* Shoulder pads (wider) */}
        <mesh position={[-0.19, 0.86, 0]}>
          <sphereGeometry args={[0.065, 12, 12]} />
          <meshStandardMaterial color={color} roughness={0.55} metalness={0.1} />
        </mesh>
        <mesh position={[0.19, 0.86, 0]}>
          <sphereGeometry args={[0.065, 12, 12]} />
          <meshStandardMaterial color={color} roughness={0.55} metalness={0.1} />
        </mesh>

        {/* Chest area (fills gap between torso and shoulders) */}
        <mesh position={[0, 0.86, 0]}>
          <boxGeometry args={[0.34, 0.08, 0.16]} />
          <meshStandardMaterial color={color} roughness={0.6} metalness={0.08} />
        </mesh>

        {/* Suit jacket front panels */}
        <mesh position={[-0.06, 0.78, 0.11]} rotation={[0, 0, 0.08]}>
          <boxGeometry args={[0.1, 0.25, 0.02]} />
          <meshStandardMaterial color={color} roughness={0.55} metalness={0.1} />
        </mesh>
        <mesh position={[0.06, 0.78, 0.11]} rotation={[0, 0, -0.08]}>
          <boxGeometry args={[0.1, 0.25, 0.02]} />
          <meshStandardMaterial color={color} roughness={0.55} metalness={0.1} />
        </mesh>

        {/* Suit lapel V-shape */}
        <mesh position={[-0.05, 0.88, 0.13]} rotation={[0, 0, 0.2]}>
          <boxGeometry args={[0.04, 0.1, 0.008]} />
          <meshStandardMaterial color={suitDark} roughness={0.5} metalness={0.15} />
        </mesh>
        <mesh position={[0.05, 0.88, 0.13]} rotation={[0, 0, -0.2]}>
          <boxGeometry args={[0.04, 0.1, 0.008]} />
          <meshStandardMaterial color={suitDark} roughness={0.5} metalness={0.15} />
        </mesh>

        {/* Shirt visible at collar */}
        <mesh position={[0, 0.91, 0.1]}>
          <boxGeometry args={[0.08, 0.06, 0.04]} />
          <meshStandardMaterial color="#f0f0f0" roughness={0.35} />
        </mesh>

        {/* Tie or pendant */}
        {wearsTie ? (
          <group>
            {/* Tie knot */}
            <mesh position={[0, 0.89, 0.12]}>
              <sphereGeometry args={[0.015, 8, 8]} />
              <meshStandardMaterial color={tieColor} roughness={0.4} />
            </mesh>
            {/* Tie body */}
            <mesh position={[0, 0.78, 0.12]}>
              <boxGeometry args={[0.035, 0.18, 0.008]} />
              <meshStandardMaterial color={tieColor} roughness={0.45} metalness={0.1} />
            </mesh>
            {/* Tie tip */}
            <mesh position={[0, 0.67, 0.12]} rotation={[0, 0, Math.PI / 4]}>
              <boxGeometry args={[0.025, 0.025, 0.008]} />
              <meshStandardMaterial color={tieColor} roughness={0.45} />
            </mesh>
          </group>
        ) : (
          /* Pendant/necklace for Amelia */
          <group>
            <mesh position={[0, 0.84, 0.12]}>
              <torusGeometry args={[0.02, 0.004, 8, 16]} />
              <meshStandardMaterial color="#d4af37" roughness={0.2} metalness={0.8} />
            </mesh>
          </group>
        )}

        {/* Neck */}
        <mesh position={[0, 0.96, 0]}>
          <cylinderGeometry args={[0.05, 0.06, 0.08, 16]} />
          <meshStandardMaterial color={skinColor} roughness={0.5} />
        </mesh>

        {/* ═══ HEAD ═══ */}
        <group ref={headRef} position={[0, 1.12, 0]}>
          {/* Head - smooth sphere */}
          <mesh castShadow>
            <sphereGeometry args={[0.13, 20, 20]} />
            <meshStandardMaterial color={skinColor} roughness={0.45} metalness={0.02} />
          </mesh>

          {/* Jaw line (slightly wider at bottom for more realistic head shape) */}
          <mesh position={[0, -0.06, 0.02]}>
            <sphereGeometry args={[0.1, 16, 16, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5]} />
            <meshStandardMaterial color={skinColor} roughness={0.5} />
          </mesh>

          {/* ═══ HAIR ═══ */}
          <HairStyle style={hairStyle} color={hairColor} />

          {/* ═══ FACE ═══ */}
          <group position={[0, 0.01, 0.11]}>
            {/* Left eye white */}
            <mesh position={[-0.04, 0, 0]}>
              <sphereGeometry args={[0.018, 16, 16]} />
              <meshStandardMaterial color="white" roughness={0.1} metalness={0.05} />
            </mesh>
            {/* Left iris */}
            <mesh position={[-0.04, 0, 0.012]}>
              <sphereGeometry args={[0.012, 16, 16]} />
              <meshStandardMaterial color={irisColor} roughness={0.2} metalness={0.1} />
            </mesh>
            {/* Left pupil */}
            <mesh ref={leftPupilRef} position={[-0.04, 0, 0.016]}>
              <sphereGeometry args={[0.006, 12, 12]} />
              <meshStandardMaterial color="#0a0a0a" roughness={0.1} metalness={0.2} />
            </mesh>
            {/* Left eye highlight */}
            <mesh position={[-0.035, 0.005, 0.018]}>
              <sphereGeometry args={[0.003, 8, 8]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
            </mesh>
            {/* Left eyelid */}
            <mesh ref={leftEyelidRef} position={[-0.04, 0.012, 0.014]}>
              <boxGeometry args={[0.04, 0.024, 0.01]} />
              <meshStandardMaterial color={skinColor} />
            </mesh>

            {/* Right eye white */}
            <mesh position={[0.04, 0, 0]}>
              <sphereGeometry args={[0.018, 16, 16]} />
              <meshStandardMaterial color="white" roughness={0.1} metalness={0.05} />
            </mesh>
            {/* Right iris */}
            <mesh position={[0.04, 0, 0.012]}>
              <sphereGeometry args={[0.012, 16, 16]} />
              <meshStandardMaterial color={irisColor} roughness={0.2} metalness={0.1} />
            </mesh>
            {/* Right pupil */}
            <mesh ref={rightPupilRef} position={[0.04, 0, 0.016]}>
              <sphereGeometry args={[0.006, 12, 12]} />
              <meshStandardMaterial color="#0a0a0a" roughness={0.1} metalness={0.2} />
            </mesh>
            {/* Right eye highlight */}
            <mesh position={[0.045, 0.005, 0.018]}>
              <sphereGeometry args={[0.003, 8, 8]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
            </mesh>
            {/* Right eyelid */}
            <mesh ref={rightEyelidRef} position={[0.04, 0.012, 0.014]}>
              <boxGeometry args={[0.04, 0.024, 0.01]} />
              <meshStandardMaterial color={skinColor} />
            </mesh>
          </group>

          {/* Eyebrows */}
          <mesh position={[-0.04, 0.06, 0.12]} rotation={[0, 0, 0.08]}>
            <boxGeometry args={[0.032, 0.005, 0.005]} />
            <meshStandardMaterial color={hairColor} />
          </mesh>
          <mesh position={[0.04, 0.06, 0.12]} rotation={[0, 0, -0.08]}>
            <boxGeometry args={[0.032, 0.005, 0.005]} />
            <meshStandardMaterial color={hairColor} />
          </mesh>

          {/* Nose */}
          <mesh position={[0, -0.025, 0.13]}>
            <sphereGeometry args={[0.013, 12, 12]} />
            <meshStandardMaterial color={skinColor} roughness={0.6} />
          </mesh>
          {/* Nose bridge */}
          <mesh position={[0, 0.0, 0.125]}>
            <boxGeometry args={[0.012, 0.03, 0.01]} />
            <meshStandardMaterial color={skinColor} roughness={0.55} />
          </mesh>

          {/* Mouth */}
          <mesh ref={mouthRef} position={[0, -0.065, 0.115]}>
            <boxGeometry args={[0.035, 0.008, 0.005]} />
            <meshStandardMaterial color="#c4756a" />
          </mesh>

          {/* Ears */}
          <mesh position={[-0.13, 0, 0]}>
            <sphereGeometry args={[0.022, 12, 12]} />
            <meshStandardMaterial color={skinColor} roughness={0.6} />
          </mesh>
          <mesh position={[0.13, 0, 0]}>
            <sphereGeometry args={[0.022, 12, 12]} />
            <meshStandardMaterial color={skinColor} roughness={0.6} />
          </mesh>
        </group>

        {/* ═══ LEFT ARM ═══ */}
        <group ref={leftArmRef} position={[-0.24, 0.84, 0]}>
          {/* Upper arm */}
          <mesh position={[0, -0.12, 0]}>
            <capsuleGeometry args={[0.048, 0.14, 8, 12]} />
            <meshStandardMaterial color={color} roughness={0.6} metalness={0.05} />
          </mesh>
          {/* Forearm */}
          <mesh position={[0, -0.28, 0.04]}>
            <capsuleGeometry args={[0.04, 0.12, 8, 12]} />
            <meshStandardMaterial color={color} roughness={0.6} metalness={0.05} />
          </mesh>
          {/* Hand */}
          <group position={[0, -0.38, 0.06]}>
            <mesh>
              <sphereGeometry args={[0.04, 12, 12]} />
              <meshStandardMaterial color={skinColor} roughness={0.5} />
            </mesh>
            {/* Fingers */}
            <mesh position={[0, -0.025, 0.015]}>
              <sphereGeometry args={[0.013, 8, 8]} />
              <meshStandardMaterial color={skinColor} roughness={0.5} />
            </mesh>
            <mesh position={[0.018, -0.02, 0.008]}>
              <sphereGeometry args={[0.011, 8, 8]} />
              <meshStandardMaterial color={skinColor} roughness={0.5} />
            </mesh>
            <mesh position={[-0.018, -0.02, 0.008]}>
              <sphereGeometry args={[0.011, 8, 8]} />
              <meshStandardMaterial color={skinColor} roughness={0.5} />
            </mesh>
          </group>
        </group>

        {/* ═══ RIGHT ARM ═══ */}
        <group ref={rightArmRef} position={[0.24, 0.84, 0]}>
          {/* Upper arm */}
          <mesh position={[0, -0.12, 0]}>
            <capsuleGeometry args={[0.048, 0.14, 8, 12]} />
            <meshStandardMaterial color={color} roughness={0.6} metalness={0.05} />
          </mesh>
          {/* Forearm */}
          <mesh position={[0, -0.28, 0.04]}>
            <capsuleGeometry args={[0.04, 0.12, 8, 12]} />
            <meshStandardMaterial color={color} roughness={0.6} metalness={0.05} />
          </mesh>
          {/* Hand */}
          <group position={[0, -0.38, 0.06]}>
            <mesh>
              <sphereGeometry args={[0.04, 12, 12]} />
              <meshStandardMaterial color={skinColor} roughness={0.5} />
            </mesh>
            <mesh position={[0, -0.025, 0.015]}>
              <sphereGeometry args={[0.013, 8, 8]} />
              <meshStandardMaterial color={skinColor} roughness={0.5} />
            </mesh>
            <mesh position={[0.018, -0.02, 0.008]}>
              <sphereGeometry args={[0.011, 8, 8]} />
              <meshStandardMaterial color={skinColor} roughness={0.5} />
            </mesh>
            <mesh position={[-0.018, -0.02, 0.008]}>
              <sphereGeometry args={[0.011, 8, 8]} />
              <meshStandardMaterial color={skinColor} roughness={0.5} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
});

/* ═══ HAIR STYLES ═══ */

function HairStyle({ style, color }: { style: string; color: string }) {
  switch (style) {
    case "long":
      return <LongHair color={color} />;
    case "buzz":
      return <BuzzHair color={color} />;
    case "wavy":
      return <WavyHair color={color} />;
    case "medium":
      return <MediumHair color={color} />;
    default:
      return <ShortHair color={color} />;
  }
}

/** Short professional male cut */
function ShortHair({ color }: { color: string }) {
  return (
    <group>
      {/* Main volume */}
      <mesh position={[0, 0.06, -0.01]}>
        <sphereGeometry args={[0.135, 24, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      {/* Side volumes */}
      <mesh position={[-0.07, 0.03, -0.03]}>
        <sphereGeometry args={[0.09, 12, 12, 0, Math.PI, 0, Math.PI / 2.2]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      <mesh position={[0.07, 0.03, -0.03]}>
        <sphereGeometry args={[0.09, 12, 12, Math.PI, Math.PI, 0, Math.PI / 2.2]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      {/* Back */}
      <mesh position={[0, 0.01, -0.07]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
    </group>
  );
}

/** Long hair for female agents (Amelia) */
function LongHair({ color }: { color: string }) {
  return (
    <group>
      {/* Top volume with center part */}
      <mesh position={[0, 0.07, -0.01]}>
        <sphereGeometry args={[0.14, 24, 24, 0, Math.PI * 2, 0, Math.PI / 1.8]} />
        <meshStandardMaterial color={color} roughness={0.75} />
      </mesh>
      {/* Left side flowing down */}
      <mesh position={[-0.1, -0.02, -0.02]}>
        <capsuleGeometry args={[0.06, 0.16, 8, 12]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      {/* Right side flowing down */}
      <mesh position={[0.1, -0.02, -0.02]}>
        <capsuleGeometry args={[0.06, 0.16, 8, 12]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      {/* Back hair falling past shoulders */}
      <mesh position={[0, -0.04, -0.08]}>
        <capsuleGeometry args={[0.1, 0.18, 8, 16]} />
        <meshStandardMaterial color={color} roughness={0.75} />
      </mesh>
      {/* Front framing strands */}
      <mesh position={[-0.1, 0.02, 0.06]}>
        <capsuleGeometry args={[0.03, 0.08, 6, 8]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      <mesh position={[0.1, 0.02, 0.06]}>
        <capsuleGeometry args={[0.03, 0.08, 6, 8]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
    </group>
  );
}

/** Buzz cut / very short (Yusef) */
function BuzzHair({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.04, -0.01]}>
        <sphereGeometry args={[0.135, 24, 24, 0, Math.PI * 2, 0, Math.PI / 2.2]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
    </group>
  );
}

/** Medium length (Chairman) */
function MediumHair({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.06, -0.01]}>
        <sphereGeometry args={[0.14, 24, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      <mesh position={[-0.08, 0.02, -0.03]}>
        <sphereGeometry args={[0.09, 12, 12]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      <mesh position={[0.08, 0.02, -0.03]}>
        <sphereGeometry args={[0.09, 12, 12]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.0, -0.08]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
    </group>
  );
}

/** Wavy/textured hair (Jonas/CDO) */
function WavyHair({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.07, 0]}>
        <sphereGeometry args={[0.14, 24, 24, 0, Math.PI * 2, 0, Math.PI / 1.9]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      {/* Wavy texture bumps */}
      <mesh position={[-0.06, 0.1, 0.04]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial color={color} roughness={0.75} />
      </mesh>
      <mesh position={[0.05, 0.11, 0.02]}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshStandardMaterial color={color} roughness={0.75} />
      </mesh>
      <mesh position={[0, 0.1, -0.05]}>
        <sphereGeometry args={[0.045, 8, 8]} />
        <meshStandardMaterial color={color} roughness={0.75} />
      </mesh>
      {/* Side volumes */}
      <mesh position={[-0.09, 0.02, -0.03]}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshStandardMaterial color={color} roughness={0.75} />
      </mesh>
      <mesh position={[0.09, 0.02, -0.03]}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshStandardMaterial color={color} roughness={0.75} />
      </mesh>
      <mesh position={[0, 0.0, -0.08]}>
        <sphereGeometry args={[0.11, 16, 16]} />
        <meshStandardMaterial color={color} roughness={0.75} />
      </mesh>
    </group>
  );
}

/* ═══ OFFICE CHAIR ═══ */

function OfficeChair({ color }: { color: string }) {
  return (
    <group>
      {/* Seat cushion */}
      <mesh position={[0, 0.42, 0.02]}>
        <boxGeometry args={[0.34, 0.05, 0.3]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>

      {/* Backrest */}
      <mesh position={[0, 0.72, -0.14]}>
        <boxGeometry args={[0.3, 0.5, 0.04]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>

      {/* Backrest top */}
      <mesh position={[0, 0.98, -0.14]}>
        <boxGeometry args={[0.32, 0.04, 0.05]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>

      {/* Armrests */}
      <mesh position={[-0.18, 0.55, 0]}>
        <boxGeometry args={[0.03, 0.04, 0.2]} />
        <meshStandardMaterial color="#444" roughness={0.5} metalness={0.3} />
      </mesh>
      <mesh position={[0.18, 0.55, 0]}>
        <boxGeometry args={[0.03, 0.04, 0.2]} />
        <meshStandardMaterial color="#444" roughness={0.5} metalness={0.3} />
      </mesh>

      {/* Armrest supports */}
      <mesh position={[-0.18, 0.48, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.1, 8]} />
        <meshStandardMaterial color="#555" metalness={0.5} roughness={0.3} />
      </mesh>
      <mesh position={[0.18, 0.48, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.1, 8]} />
        <meshStandardMaterial color="#555" metalness={0.5} roughness={0.3} />
      </mesh>

      {/* Center pole */}
      <mesh position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.02, 0.025, 0.35, 8]} />
        <meshStandardMaterial color="#555" metalness={0.6} roughness={0.3} />
      </mesh>

      {/* Base star (5 legs) */}
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh
          key={i}
          position={[
            Math.sin((i / 5) * Math.PI * 2) * 0.16,
            0.04,
            Math.cos((i / 5) * Math.PI * 2) * 0.16,
          ]}
          rotation={[Math.PI / 2, 0, (i / 5) * Math.PI * 2]}
        >
          <capsuleGeometry args={[0.01, 0.12, 4, 8]} />
          <meshStandardMaterial color="#555" metalness={0.6} roughness={0.3} />
        </mesh>
      ))}

      {/* Wheels */}
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh
          key={`wheel-${i}`}
          position={[
            Math.sin((i / 5) * Math.PI * 2) * 0.22,
            0.02,
            Math.cos((i / 5) * Math.PI * 2) * 0.22,
          ]}
        >
          <sphereGeometry args={[0.018, 8, 8]} />
          <meshStandardMaterial color="#333" roughness={0.3} metalness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

/* ═══ THINKING DOTS ═══ */

function ThinkingDots() {
  const group = useRef<Group>(null);

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    const children = group.current.children;
    for (let i = 0; i < children.length; i++) {
      children[i].position.y = Math.sin(t * 4 + i * 0.8) * 0.03;
      (children[i] as Mesh).scale.setScalar(0.8 + Math.sin(t * 4 + i * 0.8) * 0.2);
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
