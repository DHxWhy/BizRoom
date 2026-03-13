import { useRef, useMemo, memo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, Text, Billboard } from "@react-three/drei";
import { MathUtils, Quaternion, Euler, SkinnedMesh, Bone } from "three";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Group } from "three";
import { AVATAR_CONFIGS, DEFAULT_AVATAR } from "./avatarConfig";
import { lerpWeight, VISEME_BLEND_SHAPE_KEYS, type BlendShapeWeights } from "../../utils/visemeMap";

// ─── Micro-Gesture System ───
// Subtle procedural gestures for seated meeting avatars.
// Key principle: RESTRAINT — small movements create believability.

/** Degrees to radians */
const DEG = MathUtils.DEG2RAD;

/** Bone rest-pose Euler snapshot (captured after sitting deltas are applied) */
interface BoneRestPose {
  x: number;
  y: number;
  z: number;
}

/** All gesture-relevant bone refs */
interface GestureBoneRefs {
  spine: Bone | null;
  spine1: Bone | null;
  spine2: Bone | null;
  leftArm: Bone | null;
  rightArm: Bone | null;
  leftForeArm: Bone | null;
  rightForeArm: Bone | null;
  leftHand: Bone | null;
  rightHand: Bone | null;
  // Finger bones (may not exist in all RPM models)
  leftIndexProximal: Bone | null;
  leftMiddleProximal: Bone | null;
  rightIndexProximal: Bone | null;
  rightMiddleProximal: Bone | null;
}

/** Mutable gesture state tracked across frames */
interface GestureState {
  /** Which hand lifts when speaking: 0 = left, 1 = right */
  activeHand: number;
  /** Timestamp when speaking started (for hand selection) */
  speakingStartTime: number;
  /** Whether we've selected a hand for this speaking turn */
  handSelected: boolean;
  /** Per-agent phase offset so agents don't move in sync */
  phaseOffset: number;
  /** Timer for idle posture shifts */
  idleShiftTimer: number;
  /** Current idle shift target (tiny spine rotation) */
  idleShiftTarget: number;
  /** Timer for listening nods */
  nodTimer: number;
  /** Current nod phase (0 = not nodding, >0 = in nod) */
  nodPhase: number;
  /** Interval until next nod (randomized 3-5s) */
  nextNodInterval: number;
}

/** Rest poses for all gesture bones, captured after sitting deltas */
type GestureRestPoses = Record<string, BoneRestPose>;

/**
 * Simple seeded PRNG (mulberry32) — deterministic per agent.
 * Returns a function that yields [0,1) on each call.
 */
function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string into a number for seeding */
function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h;
}

/** Smoothly apply a delta rotation on top of a rest pose value */
function applyGestureDelta(
  bone: Bone,
  axis: "x" | "y" | "z",
  restValue: number,
  delta: number,
  lerpFactor: number,
): void {
  bone.rotation[axis] = MathUtils.lerp(
    bone.rotation[axis],
    restValue + delta,
    lerpFactor,
  );
}

/** Names of bones the gesture system needs refs for */
const GESTURE_BONE_NAMES: (keyof GestureBoneRefs)[] = [
  "spine", "spine1", "spine2",
  "leftArm", "rightArm", "leftForeArm", "rightForeArm",
  "leftHand", "rightHand",
  "leftIndexProximal", "leftMiddleProximal",
  "rightIndexProximal", "rightMiddleProximal",
];

/** Map from Three.js bone name to our ref key */
const BONE_NAME_MAP: Record<string, keyof GestureBoneRefs> = {
  Spine: "spine",
  Spine1: "spine1",
  Spine2: "spine2",
  LeftArm: "leftArm",
  RightArm: "rightArm",
  LeftForeArm: "leftForeArm",
  RightForeArm: "rightForeArm",
  LeftHand: "leftHand",
  RightHand: "rightHand",
  LeftHandIndex1: "leftIndexProximal",
  LeftHandMiddle1: "leftMiddleProximal",
  RightHandIndex1: "rightIndexProximal",
  RightHandMiddle1: "rightMiddleProximal",
};

interface RPMAgentAvatarProps {
  agentRole: string;
  agentName: string;
  position: [number, number, number];
  rotation: [number, number, number];
  isSpeaking: boolean;
  isThinking: boolean;
  color: string;
  gazeTarget?: [number, number, number] | null;
  visemeWeights?: BlendShapeWeights;
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
  visemeWeights,
}: RPMAgentAvatarProps) {
  const groupRef = useRef<Group>(null);
  const headBoneRef = useRef<Bone | null>(null);
  const neckBoneRef = useRef<Bone | null>(null);
  const meshRef = useRef<SkinnedMesh | null>(null);
  const gazeState = useRef({ yaw: 0, pitch: 0 });

  // ─── Gesture system refs ───
  const gestureBones = useRef<GestureBoneRefs>({
    spine: null, spine1: null, spine2: null,
    leftArm: null, rightArm: null,
    leftForeArm: null, rightForeArm: null,
    leftHand: null, rightHand: null,
    leftIndexProximal: null, leftMiddleProximal: null,
    rightIndexProximal: null, rightMiddleProximal: null,
  });
  const gestureRestPoses = useRef<GestureRestPoses>({});
  const gestureState = useRef<GestureState>({
    activeHand: 0,
    speakingStartTime: 0,
    handSelected: false,
    phaseOffset: hashString(agentRole) * 0.1,
    idleShiftTimer: 0,
    idleShiftTarget: 0,
    nodTimer: 0,
    nodPhase: 0,
    nextNodInterval: 3 + (hashString(agentRole) % 20) * 0.1,
  });
  const prevSpeaking = useRef(false);

  const config = AVATAR_CONFIGS[agentRole] ?? DEFAULT_AVATAR;
  const { scene } = useGLTF(config.url);

  // SkeletonUtils.clone properly handles SkinnedMesh + bone bindings
  const clonedScene = useMemo(() => {
    const cloned = skeletonClone(scene);

    // Reset refs for this clone (useMemo runs during render; refs are safe
    // here because this only runs when `scene` changes — a new GLB load)
    // eslint-disable-next-line react-hooks/refs
    headBoneRef.current = null;
    // eslint-disable-next-line react-hooks/refs
    neckBoneRef.current = null;
    // eslint-disable-next-line react-hooks/refs
    meshRef.current = null;

    // Reset gesture bone refs
    // eslint-disable-next-line react-hooks/refs
    for (const key of GESTURE_BONE_NAMES) {
      gestureBones.current[key] = null;
    }

    // eslint-disable-next-line react-hooks/refs
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

        // Capture gesture bone refs
        const gestureKey = BONE_NAME_MAP[bone.name];
        if (gestureKey) {
          gestureBones.current[gestureKey] = bone;
        }
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

    // Snapshot rest-pose Euler values AFTER sitting deltas are baked.
    // Three.js recomputes Euler from quaternion when we read rotation.
    // eslint-disable-next-line react-hooks/refs
    for (const boneName of Object.keys(BONE_NAME_MAP)) {
      const key = BONE_NAME_MAP[boneName];
      const bone = gestureBones.current[key];
      if (bone) {
        // Force Euler update from the modified quaternion
        bone.rotation.setFromQuaternion(bone.quaternion);
        gestureRestPoses.current[boneName] = {
          x: bone.rotation.x,
          y: bone.rotation.y,
          z: bone.rotation.z,
        };
      }
    }

    return cloned;
  }, [scene]);

  // Per-frame animation
  useFrame((state, delta) => {
    if (!groupRef.current) return;

    const mesh = meshRef.current;
    const head = headBoneRef.current;
    const neck = neckBoneRef.current;
    const t = state.clock.elapsedTime;
    const hasViseme = visemeWeights && Object.keys(visemeWeights).length > 0;

    // ─── Morph target animations ───
    if (mesh?.morphTargetDictionary && mesh.morphTargetInfluences) {
      const dict = mesh.morphTargetDictionary;
      const infl = mesh.morphTargetInfluences;

      // Viseme-driven lip sync (overrides simple jawOpen when weights provided)
      if (hasViseme) {
        for (const key of VISEME_BLEND_SHAPE_KEYS) {
          const idx = dict[key];
          if (idx !== undefined) {
            const target = (visemeWeights as Record<string, number>)[key] ?? 0;
            const current = infl[idx] ?? 0;
            infl[idx] = lerpWeight(current, target, delta);
          }
        }
      } else {
        // Fallback: simple jaw animation when no viseme data
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

    // ─── Micro-Gesture System ───
    const gs = gestureState.current;
    const gb = gestureBones.current;
    const rp = gestureRestPoses.current;
    const phase = gs.phaseOffset;
    // Smooth interpolation factor — gentle, never snappy
    const gestureLerp = Math.min(1, delta * 3);

    // Detect speaking-turn transitions to randomize active hand
    if (isSpeaking && !prevSpeaking.current) {
      const rng = seededRandom(hashString(agentRole) + Math.floor(t * 100));
      gs.activeHand = rng() > 0.5 ? 1 : 0; // 0=left, 1=right
      gs.handSelected = true;
      gs.speakingStartTime = t;
    }
    if (!isSpeaking && prevSpeaking.current) {
      gs.handSelected = false;
    }
    prevSpeaking.current = isSpeaking;

    if (isSpeaking) {
      // ── Speaking gestures: subtle hand lift + finger micro-movement ──

      // Hand lift — very slight forearm raise, slow sine wave (0.3-0.5 Hz)
      const handFreq = 0.35 + phase * 0.05; // 0.35-0.4 Hz range
      const liftAmount = (Math.sin(t * handFreq * Math.PI * 2 + phase) * 0.5 + 0.5);
      // 3-8 degrees on forearm (maps to ~0.05-0.14 radians)
      const foreArmDelta = liftAmount * 6 * DEG; // peak ~6 degrees lift

      if (gs.activeHand === 0) {
        // Left hand active
        if (gb.leftForeArm && rp["LeftForeArm"]) {
          applyGestureDelta(gb.leftForeArm, "x", rp["LeftForeArm"].x, -foreArmDelta, gestureLerp);
        }
        if (gb.leftArm && rp["LeftArm"]) {
          applyGestureDelta(gb.leftArm, "x", rp["LeftArm"].x, foreArmDelta * 0.3, gestureLerp);
        }
        // Resting hand returns to rest
        if (gb.rightForeArm && rp["RightForeArm"]) {
          applyGestureDelta(gb.rightForeArm, "x", rp["RightForeArm"].x, 0, gestureLerp);
        }
        if (gb.rightArm && rp["RightArm"]) {
          applyGestureDelta(gb.rightArm, "x", rp["RightArm"].x, 0, gestureLerp);
        }
      } else {
        // Right hand active
        if (gb.rightForeArm && rp["RightForeArm"]) {
          applyGestureDelta(gb.rightForeArm, "x", rp["RightForeArm"].x, -foreArmDelta, gestureLerp);
        }
        if (gb.rightArm && rp["RightArm"]) {
          applyGestureDelta(gb.rightArm, "x", rp["RightArm"].x, foreArmDelta * 0.3, gestureLerp);
        }
        // Resting hand returns to rest
        if (gb.leftForeArm && rp["LeftForeArm"]) {
          applyGestureDelta(gb.leftForeArm, "x", rp["LeftForeArm"].x, 0, gestureLerp);
        }
        if (gb.leftArm && rp["LeftArm"]) {
          applyGestureDelta(gb.leftArm, "x", rp["LeftArm"].x, 0, gestureLerp);
        }
      }

      // Finger micro-movement — tiny 1-3 degree oscillation if bones exist
      const fingerOsc = Math.sin(t * 2.5 + phase * 3) * 2 * DEG;
      const fingerOsc2 = Math.sin(t * 3.1 + phase * 5) * 1.5 * DEG;
      if (gs.activeHand === 0) {
        if (gb.leftIndexProximal && rp["LeftHandIndex1"]) {
          applyGestureDelta(gb.leftIndexProximal, "z", rp["LeftHandIndex1"].z, fingerOsc, gestureLerp);
        }
        if (gb.leftMiddleProximal && rp["LeftHandMiddle1"]) {
          applyGestureDelta(gb.leftMiddleProximal, "z", rp["LeftHandMiddle1"].z, fingerOsc2, gestureLerp);
        }
      } else {
        if (gb.rightIndexProximal && rp["RightHandIndex1"]) {
          applyGestureDelta(gb.rightIndexProximal, "z", rp["RightHandIndex1"].z, -fingerOsc, gestureLerp);
        }
        if (gb.rightMiddleProximal && rp["RightHandMiddle1"]) {
          applyGestureDelta(gb.rightMiddleProximal, "z", rp["RightHandMiddle1"].z, -fingerOsc2, gestureLerp);
        }
      }

      // Head slight tilt — gentle sway while speaking (2-4 degrees)
      const headTilt = Math.sin(t * 0.8 + phase * 2) * 3 * DEG;
      const headNod = Math.sin(t * 1.2 + phase) * 2 * DEG;
      if (head && !gazeTarget) {
        // Only apply gesture head movement if gaze is not driving head
        head.rotation.y = MathUtils.lerp(head.rotation.y, headTilt, gestureLerp);
        head.rotation.x = MathUtils.lerp(head.rotation.x, headNod, gestureLerp);
      }

      // Subtle spine engagement while speaking (lean slightly forward)
      if (gb.spine2 && rp["Spine2"]) {
        applyGestureDelta(gb.spine2, "x", rp["Spine2"].x, 1.5 * DEG, gestureLerp);
      }

      // Reset nod/idle timers
      gs.nodTimer = 0;
      gs.nodPhase = 0;
      gs.idleShiftTimer = 0;

    } else if (isThinking) {
      // ── Thinking: slight forward lean, hands return to rest ──
      if (gb.spine2 && rp["Spine2"]) {
        applyGestureDelta(gb.spine2, "x", rp["Spine2"].x, 2 * DEG, gestureLerp);
      }
      // Return all limbs to rest
      for (const boneName of Object.keys(BONE_NAME_MAP)) {
        const refKey = BONE_NAME_MAP[boneName];
        const bone = gb[refKey];
        const rest = rp[boneName];
        if (bone && rest && refKey !== "spine2") {
          bone.rotation.x = MathUtils.lerp(bone.rotation.x, rest.x, gestureLerp * 0.5);
          bone.rotation.y = MathUtils.lerp(bone.rotation.y, rest.y, gestureLerp * 0.5);
          bone.rotation.z = MathUtils.lerp(bone.rotation.z, rest.z, gestureLerp * 0.5);
        }
      }
    } else {
      // ── Listening / Idle gestures ──

      // Occasional head nod when another agent might be speaking (every 3-5s)
      gs.nodTimer += delta;
      if (gs.nodTimer > gs.nextNodInterval && gs.nodPhase === 0) {
        gs.nodPhase = 1; // start nod
        gs.nodTimer = 0;
        // Randomize next interval (3-5 seconds)
        const rng = seededRandom(hashString(agentRole) + Math.floor(t));
        gs.nextNodInterval = 3 + rng() * 2;
      }

      if (gs.nodPhase > 0) {
        // Single nod cycle: quick down (0.3s) then slow return (0.7s)
        gs.nodPhase += delta * 2.5; // full cycle in ~0.8s
        const nodProgress = Math.min(gs.nodPhase - 1, 1);
        // Smooth bell curve: quick dip then slow return
        const nodAmount = nodProgress < 0.35
          ? Math.sin(nodProgress / 0.35 * Math.PI * 0.5) // down phase
          : Math.cos((nodProgress - 0.35) / 0.65 * Math.PI * 0.5); // return phase
        const nodDelta = nodAmount * 4 * DEG; // 4 degree nod

        if (head && !gazeTarget) {
          head.rotation.x = MathUtils.lerp(head.rotation.x, nodDelta, gestureLerp);
        }

        if (nodProgress >= 1) {
          gs.nodPhase = 0; // nod complete
        }
      } else if (head && !gazeTarget) {
        // Gently return head to neutral when not nodding and no gaze
        head.rotation.x = MathUtils.lerp(head.rotation.x, 0, gestureLerp * 0.3);
        head.rotation.y = MathUtils.lerp(head.rotation.y, 0, gestureLerp * 0.3);
      }

      // Slight spine micro-lean toward center (listening posture, 1-2 degrees)
      if (gb.spine1 && rp["Spine1"]) {
        const listenLean = Math.sin(t * 0.15 + phase) * 1 * DEG;
        applyGestureDelta(gb.spine1, "x", rp["Spine1"].x, listenLean, gestureLerp * 0.3);
      }

      // Idle posture shift — every 8-15 seconds, tiny spine micro-rotation
      gs.idleShiftTimer += delta;
      if (gs.idleShiftTimer > 8 + phase * 7) { // 8-15s depending on agent
        gs.idleShiftTimer = 0;
        const rng = seededRandom(hashString(agentRole) + Math.floor(t * 10));
        gs.idleShiftTarget = (rng() - 0.5) * 2 * DEG; // +/- 1 degree
      }
      if (gb.spine && rp["Spine"]) {
        applyGestureDelta(gb.spine, "y", rp["Spine"].y, gs.idleShiftTarget, gestureLerp * 0.15);
      }

      // Return arms/hands smoothly to rest
      const armBones: [string, keyof GestureBoneRefs][] = [
        ["LeftArm", "leftArm"], ["RightArm", "rightArm"],
        ["LeftForeArm", "leftForeArm"], ["RightForeArm", "rightForeArm"],
        ["LeftHand", "leftHand"], ["RightHand", "rightHand"],
      ];
      for (const [boneName, key] of armBones) {
        const bone = gb[key];
        const rest = rp[boneName];
        if (bone && rest) {
          bone.rotation.x = MathUtils.lerp(bone.rotation.x, rest.x, gestureLerp * 0.5);
          bone.rotation.y = MathUtils.lerp(bone.rotation.y, rest.y, gestureLerp * 0.5);
          bone.rotation.z = MathUtils.lerp(bone.rotation.z, rest.z, gestureLerp * 0.5);
        }
      }

      // Return fingers to rest
      const fingerBones: [string, keyof GestureBoneRefs][] = [
        ["LeftHandIndex1", "leftIndexProximal"], ["LeftHandMiddle1", "leftMiddleProximal"],
        ["RightHandIndex1", "rightIndexProximal"], ["RightHandMiddle1", "rightMiddleProximal"],
      ];
      for (const [boneName, key] of fingerBones) {
        const bone = gb[key];
        const rest = rp[boneName];
        if (bone && rest) {
          bone.rotation.z = MathUtils.lerp(bone.rotation.z, rest.z, gestureLerp * 0.3);
        }
      }

      // Return spine2 to rest
      if (gb.spine2 && rp["Spine2"]) {
        applyGestureDelta(gb.spine2, "x", rp["Spine2"].x, 0, gestureLerp * 0.3);
      }
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
// eslint-disable-next-line react-refresh/only-export-components
export function preloadRPMAvatars() {
  const urls = new Set(Object.values(AVATAR_CONFIGS).map((c) => c.url));
  for (const url of urls) {
    useGLTF.preload(url);
  }
}
