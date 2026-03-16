import { useRef, useEffect, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";

interface CameraControllerProps {
  speakingAgent: string | null;
  seatPositions: Record<string, [number, number, number]>;
  isUserControllingRef: MutableRefObject<boolean>;
  /** When true, camera goes to CEO's eye-level first-person view */
  isFirstPerson: boolean;
  /** Yaw offset in degrees for first-person look direction (-60, 0, +60) */
  firstPersonYaw: number;
  /** When true, camera faces the back-wall artifact screen */
  isLookingBack: boolean;
}

// Overview — behind CEO looking at the team
const WIDE_SHOT_POS = new Vector3(0, 5.0, -4.5);
const WIDE_SHOT_TARGET = new Vector3(0, 0.8, 0.5);
// Subtle shift toward speaker
const SPEAKER_OFFSET = new Vector3(0, 0.3, 0.6);

// First-person — CEO's eye level, leaning into the table for immersion
const FIRST_PERSON_POS = new Vector3(0, 1.18, -1.3);
const FIRST_PERSON_TARGET = new Vector3(0, 1.0, 1.2);

// Back monitor view — facing the large artifact screen on the back wall
const BACK_MONITOR_POS = new Vector3(0, 2.2, -3.0);
const BACK_MONITOR_TARGET = new Vector3(0, 2.2, -6.85);

// Pre-computed base look direction for first-person yaw rotation
const FP_BASE_DIR = new Vector3().subVectors(FIRST_PERSON_TARGET, FIRST_PERSON_POS);

// Reusable temp vectors (avoid GC)
const _seatVec = new Vector3();
const _dir = new Vector3();
const _cameraPos = new Vector3();

export function CameraController({
  speakingAgent,
  seatPositions,
  isUserControllingRef,
  isFirstPerson,
  firstPersonYaw,
  isLookingBack,
}: CameraControllerProps) {
  const { camera } = useThree();
  const targetPos = useRef(WIDE_SHOT_POS.clone());
  const targetLookAt = useRef(WIDE_SHOT_TARGET.clone());
  const currentPos = useRef(camera.position.clone());
  const currentLookAt = useRef(WIDE_SHOT_TARGET.clone());

  // Priority: isLookingBack > isFirstPerson > overview
  useEffect(() => {
    // Back monitor view — highest priority
    if (isLookingBack) {
      targetPos.current.copy(BACK_MONITOR_POS);
      targetLookAt.current.copy(BACK_MONITOR_TARGET);
      return;
    }

    // First-person with yaw
    if (isFirstPerson) {
      targetPos.current.copy(FIRST_PERSON_POS);

      const yawRad = (firstPersonYaw * Math.PI) / 180;
      const cosY = Math.cos(yawRad);
      const sinY = Math.sin(yawRad);
      const rotX = FP_BASE_DIR.x * cosY + FP_BASE_DIR.z * sinY;
      const rotZ = -FP_BASE_DIR.x * sinY + FP_BASE_DIR.z * cosY;

      targetLookAt.current.set(
        FIRST_PERSON_POS.x + rotX,
        FIRST_PERSON_POS.y + FP_BASE_DIR.y,
        FIRST_PERSON_POS.z + rotZ,
      );
      return;
    }

    // Overview mode — optionally shift toward speaker
    if (speakingAgent && seatPositions[speakingAgent]) {
      const seat = seatPositions[speakingAgent];
      _seatVec.set(seat[0], seat[1], seat[2]);
      _dir.copy(_seatVec).normalize();

      _cameraPos
        .copy(WIDE_SHOT_POS)
        .addScaledVector(_dir, SPEAKER_OFFSET.z)
        .setY(WIDE_SHOT_POS.y + SPEAKER_OFFSET.y);

      targetPos.current.copy(_cameraPos);
      targetLookAt.current.set(seat[0] * 0.4, 0.9, seat[2] * 0.4);
    } else {
      targetPos.current.copy(WIDE_SHOT_POS);
      targetLookAt.current.copy(WIDE_SHOT_TARGET);
    }
  }, [isLookingBack, isFirstPerson, firstPersonYaw, speakingAgent, seatPositions]);

  useFrame((_, delta) => {
    // Always animate when in special views; yield to orbit in overview only
    if (!isLookingBack && !isFirstPerson && isUserControllingRef.current) return;

    const dampingFactor = 1 - Math.pow(0.02, delta);

    currentPos.current.lerp(targetPos.current, dampingFactor);
    currentLookAt.current.lerp(targetLookAt.current, dampingFactor);

    camera.position.copy(currentPos.current);
    camera.lookAt(currentLookAt.current);
  });

  return null;
}
