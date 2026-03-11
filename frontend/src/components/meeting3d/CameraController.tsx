import { useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";

interface CameraControllerProps {
  speakingAgent: string | null;
  seatPositions: Record<string, [number, number, number]>;
  isUserControlling: boolean;
}

const WIDE_SHOT_POS = new Vector3(0, 3.5, 5.5);
const WIDE_SHOT_TARGET = new Vector3(0, 0.8, -0.3);
// Subtle shift toward speaker — NOT aggressive zoom-in
const SPEAKER_OFFSET = new Vector3(0, 0.3, 0.6);

// Reusable temp vectors (avoid GC)
const _seatVec = new Vector3();
const _dir = new Vector3();
const _cameraPos = new Vector3();

export function CameraController({
  speakingAgent,
  seatPositions,
  isUserControlling,
}: CameraControllerProps) {
  const { camera } = useThree();
  const targetPos = useRef(WIDE_SHOT_POS.clone());
  const targetLookAt = useRef(WIDE_SHOT_TARGET.clone());
  const currentPos = useRef(camera.position.clone());
  const currentLookAt = useRef(WIDE_SHOT_TARGET.clone());
  const lastSpeaker = useRef<string | null>(null);

  useEffect(() => {
    if (speakingAgent !== lastSpeaker.current) {
      lastSpeaker.current = speakingAgent;

      if (speakingAgent && seatPositions[speakingAgent]) {
        const seat = seatPositions[speakingAgent];
        _seatVec.set(seat[0], seat[1], seat[2]);
        _dir.copy(_seatVec).normalize();

        // Keep mostly wide shot, just gently shift toward speaker
        _cameraPos
          .copy(WIDE_SHOT_POS)
          .addScaledVector(_dir, SPEAKER_OFFSET.z)
          .setY(WIDE_SHOT_POS.y + SPEAKER_OFFSET.y);

        targetPos.current.copy(_cameraPos);
        // Look slightly toward speaker but keep table center visible
        targetLookAt.current.set(
          seat[0] * 0.4,
          0.9,
          seat[2] * 0.4,
        );
      } else {
        targetPos.current.copy(WIDE_SHOT_POS);
        targetLookAt.current.copy(WIDE_SHOT_TARGET);
      }
    }
  }, [speakingAgent, seatPositions]);

  useFrame((_, delta) => {
    if (isUserControlling) return;

    // Frame-rate independent exponential damping (slower = smoother)
    const dampingFactor = 1 - Math.pow(0.02, delta);

    currentPos.current.lerp(targetPos.current, dampingFactor);
    currentLookAt.current.lerp(targetLookAt.current, dampingFactor);

    camera.position.copy(currentPos.current);
    camera.lookAt(currentLookAt.current);
  });

  return null;
}
