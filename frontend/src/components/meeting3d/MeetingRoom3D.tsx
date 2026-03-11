import { Suspense, useMemo, useRef, useState, useCallback, memo } from "react";
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  ContactShadows,
  Sparkles,
} from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { AgentAvatar3D } from "./AgentAvatar3D";
import { MeetingTable3D } from "./MeetingTable3D";
import { RoomEnvironment3D } from "./RoomEnvironment3D";
import { CameraController } from "./CameraController";
import { ArtifactScreen3D } from "./ArtifactScreen3D";
import type { ArtifactData } from "./ArtifactScreen3D";

interface AgentSeat {
  position: [number, number, number];
  rotation: [number, number, number];
  agent: string;
  name: string;
  color: string;
}

const SEAT_CONFIG: AgentSeat[] = [
  {
    position: [0, 0, -1.8],
    rotation: [0, Math.PI, 0],
    agent: "coo",
    name: "Hudson",
    color: "#3b82f6",
  },
  {
    position: [-1.55, 0, -0.9],
    rotation: [0, Math.PI * 0.72, 0],
    agent: "cfo",
    name: "Amelia",
    color: "#10b981",
  },
  {
    position: [1.55, 0, -0.9],
    rotation: [0, -Math.PI * 0.72, 0],
    agent: "cmo",
    name: "Yusef",
    color: "#f97316",
  },
  {
    position: [0, 0, 1.8],
    rotation: [0, 0, 0],
    agent: "chairman",
    name: "Chairman",
    color: "#8b5cf6",
  },
];

// Memoize static sub-scenes to prevent unnecessary re-renders
const MemoizedRoom = memo(RoomEnvironment3D);
const MemoizedTable = memo(MeetingTable3D);

/**
 * Compute gaze target for an agent based on who is speaking.
 *
 * - Speaking agent looks at table center (audience).
 * - Other agents look toward the speaker's head position.
 * - Idle (nobody speaking) returns null -> avatar defaults to looking at laptop/table.
 */
function getGazeTarget(
  agentRole: string,
  speakingAgent: string | null,
  seatPositions: Record<string, [number, number, number]>,
): [number, number, number] | null {
  if (speakingAgent === agentRole) {
    // Speaking -> look at table center (audience)
    return [0, 0.8, 0];
  }
  if (speakingAgent && seatPositions[speakingAgent]) {
    // Someone else speaking -> look at speaker's head position
    const seat = seatPositions[speakingAgent];
    return [seat[0], 1.15, seat[2]];
  }
  // Idle -> look slightly down at table/laptop (handled inside avatar as null)
  return null;
}

/**
 * Compute laptop position: slightly in front of the avatar toward the table center.
 * The laptop sits on the table surface (y ~ 0.76) between the avatar and center.
 */
function getLaptopTransform(seat: AgentSeat): {
  position: [number, number, number];
  rotationY: number;
} {
  const dx = -seat.position[0];
  const dz = -seat.position[2];
  const dist = Math.sqrt(dx * dx + dz * dz);
  const nx = dx / dist;
  const nz = dz / dist;
  // Place laptop 0.55 units toward center from seat
  const offset = 0.55;
  return {
    position: [
      seat.position[0] + nx * offset,
      0.76,
      seat.position[2] + nz * offset,
    ],
    rotationY: seat.rotation[1],
  };
}

/** Small laptop/notebook prop on the table in front of each agent */
const LaptopProp = memo(function LaptopProp({
  position,
  rotationY,
}: {
  position: [number, number, number];
  rotationY: number;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Laptop base */}
      <mesh position={[0, 0, 0]} castShadow>
        <boxGeometry args={[0.25, 0.01, 0.18]} />
        <meshStandardMaterial color="#1a1a2a" roughness={0.3} metalness={0.4} />
      </mesh>
      {/* Screen (slight emissive glow) */}
      <mesh position={[0, 0.006, 0]}>
        <boxGeometry args={[0.22, 0.002, 0.15]} />
        <meshStandardMaterial
          color="#1e293b"
          emissive="#334155"
          emissiveIntensity={0.6}
          roughness={0.2}
          metalness={0.1}
        />
      </mesh>
    </group>
  );
});

interface MeetingRoom3DProps {
  speakingAgent: string | null;
  thinkingAgents: string[];
  meetingPhase: string;
  /** Artifact to display on the back-wall screen, or null for idle state */
  currentArtifact?: ArtifactData | null;
}

export function MeetingRoom3D({
  speakingAgent,
  thinkingAgents,
  meetingPhase,
  currentArtifact = null,
}: MeetingRoom3DProps) {
  const [isUserControlling, setIsUserControlling] = useState(false);
  const controlTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const seatPositions = useMemo(() => {
    const map: Record<string, [number, number, number]> = {};
    for (const seat of SEAT_CONFIG) {
      map[seat.agent] = seat.position;
    }
    return map;
  }, []);

  // Stabilize thinking set to avoid unnecessary avatar re-renders
  const thinkingSet = useMemo(() => new Set(thinkingAgents), [thinkingAgents]);

  // Pre-compute laptop transforms (static, never changes)
  const laptopTransforms = useMemo(
    () => SEAT_CONFIG.map((seat) => getLaptopTransform(seat)),
    [],
  );

  const handleOrbitStart = useCallback(() => {
    setIsUserControlling(true);
    if (controlTimeoutRef.current) {
      clearTimeout(controlTimeoutRef.current);
    }
  }, []);

  const handleOrbitEnd = useCallback(() => {
    controlTimeoutRef.current = setTimeout(() => {
      setIsUserControlling(false);
    }, 3000);
  }, []);

  return (
    <div className="w-full h-full relative">
      <Canvas
        shadows
        camera={{ position: [0, 3.5, 5.5], fov: 45, near: 0.1, far: 50 }}
        gl={{ antialias: true, toneMapping: 3 }}
        dpr={[1, 1.5]}
      >
        <Suspense fallback={null}>
          {/* ═══ LIGHTING ═══ */}
          <ambientLight intensity={0.35} color="#c8d0e0" />
          <directionalLight
            position={[5, 8, 5]}
            intensity={1.2}
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
            shadow-camera-far={20}
            shadow-camera-left={-5}
            shadow-camera-right={5}
            shadow-camera-top={5}
            shadow-camera-bottom={-5}
            shadow-bias={-0.0001}
            color="#f0f0ff"
          />
          <directionalLight
            position={[-3, 4, -2]}
            intensity={0.3}
            color="#6366f1"
          />
          <pointLight
            position={[0, 3.5, 0]}
            intensity={0.5}
            color="#e0e0ff"
            distance={8}
          />
          <pointLight
            position={[0, 0.5, 0]}
            intensity={0.15}
            color="#fef3c7"
            distance={3}
          />

          {/* ═══ ENVIRONMENT ═══ */}
          <Environment preset="city" background={false} />
          {/* Floating dust particles for atmosphere */}
          <Sparkles
            count={40}
            size={1.5}
            scale={8}
            speed={0.2}
            opacity={0.12}
            color="#8888ff"
          />

          {/* ═══ ROOM (memoized - never re-renders) ═══ */}
          <MemoizedRoom />

          {/* ═══ TABLE + PROPS (memoized) ═══ */}
          <MemoizedTable />

          {/* ═══ LAPTOP PROPS on table ═══ */}
          {laptopTransforms.map((lt, i) => (
            <LaptopProp
              key={SEAT_CONFIG[i].agent}
              position={lt.position}
              rotationY={lt.rotationY}
            />
          ))}

          {/* ═══ ARTIFACT SCREEN (back wall) ═══ */}
          <ArtifactScreen3D artifact={currentArtifact} />

          {/* ═══ CONTACT SHADOWS (baked once) ═══ */}
          <ContactShadows
            position={[0, 0, 0]}
            opacity={0.6}
            scale={10}
            blur={2}
            far={4}
            color="#000020"
            resolution={256}
            frames={1}
          />

          {/* ═══ AVATARS ═══ */}
          {SEAT_CONFIG.map((seat) => (
            <AgentAvatar3D
              key={seat.agent}
              agentRole={seat.agent}
              agentName={seat.name}
              position={seat.position}
              rotation={seat.rotation}
              isSpeaking={speakingAgent === seat.agent}
              isThinking={thinkingSet.has(seat.agent)}
              color={seat.color}
              gazeTarget={getGazeTarget(seat.agent, speakingAgent, seatPositions)}
            />
          ))}

          {/* ═══ CAMERA ═══ */}
          <CameraController
            speakingAgent={speakingAgent}
            seatPositions={seatPositions}
            isUserControlling={isUserControlling}
          />
          <OrbitControls
            makeDefault
            enabled={isUserControlling || !speakingAgent}
            enablePan={false}
            minPolarAngle={Math.PI / 8}
            maxPolarAngle={Math.PI / 2.3}
            minDistance={2}
            maxDistance={12}
            onStart={handleOrbitStart}
            onEnd={handleOrbitEnd}
          />

          {/* ═══ POST-PROCESSING ═══ */}
          <EffectComposer multisampling={0}>
            <Bloom
              luminanceThreshold={0.6}
              luminanceSmoothing={0.4}
              intensity={0.5}
              mipmapBlur
            />
            <Vignette eskil={false} offset={0.25} darkness={0.6} />
          </EffectComposer>
        </Suspense>
      </Canvas>
    </div>
  );
}
