import { Suspense, useMemo, useRef, useState, useCallback, useEffect, memo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, ContactShadows, Billboard, Text } from "@react-three/drei";
import { RPMAgentAvatar } from "./RPMAgentAvatar";
import { AgentAvatar3D } from "./AgentAvatar3D";
import { MeetingTable3D } from "./MeetingTable3D";
import { RoomEnvironment3D } from "./RoomEnvironment3D";
import { CameraController } from "./CameraController";
import { ArtifactScreen3D } from "./ArtifactScreen3D";
import { HoloMonitor3D } from "./HoloMonitor3D";
import type { ArtifactData } from "./ArtifactScreen3D";
import type { BigScreenUpdateEvent } from "../../types";
import { S } from "../../constants/strings";

interface AgentSeat {
  position: [number, number, number];
  rotation: [number, number, number];
  agent: string;
  name: string;
  color: string;
}

/** Calculate rotation for a +Z-facing avatar to look toward table center [0,0,0] */
function faceCenter(pos: [number, number, number]): [number, number, number] {
  return [0, Math.atan2(pos[0], pos[2]) + Math.PI, 0];
}

const SEAT_CONFIG: AgentSeat[] = [
  // Head of table (far side) — Chairman (user)
  {
    position: [0, 0, -2.2],
    rotation: faceCenter([0, 0, -2.2]),
    agent: "chairman",
    name: "Chairman",
    color: "#8b5cf6",
  },
  // Left side (3 seats)
  {
    position: [-1.9, 0, -1.0],
    rotation: faceCenter([-1.9, 0, -1.0]),
    agent: "coo",
    name: "Hudson",
    color: "#3b82f6",
  },
  {
    position: [-2.1, 0, 0.2],
    rotation: faceCenter([-2.1, 0, 0.2]),
    agent: "cfo",
    name: "Amelia",
    color: "#10b981",
  },
  {
    position: [-1.7, 0, 1.3],
    rotation: faceCenter([-1.7, 0, 1.3]),
    agent: "clo",
    name: "Bradley",
    color: "#84cc16",
  },
  // Right side (3 seats)
  {
    position: [1.9, 0, -1.0],
    rotation: faceCenter([1.9, 0, -1.0]),
    agent: "cmo",
    name: "Yusef",
    color: "#f97316",
  },
  {
    position: [2.1, 0, 0.2],
    rotation: faceCenter([2.1, 0, 0.2]),
    agent: "cto",
    name: "Kelvin",
    color: "#06b6d4",
  },
  {
    position: [1.7, 0, 1.3],
    rotation: faceCenter([1.7, 0, 1.3]),
    agent: "cdo",
    name: "Jonas",
    color: "#ec4899",
  },
];

/** Human participant seats — far end of table, facing Chairman (max 2 extra) */
const HUMAN_EXTRA_SEATS: [number, number, number][] = [
  [-0.9, 0, 2.1],
  [0.9, 0, 2.1],
];

/** Sophia secretary — standing beside the big screen */
const SOPHIA_CONFIG = {
  position: [2.0, 0, -6.5] as [number, number, number],
  rotation: [0, -Math.PI / 4, 0] as [number, number, number],
  name: "Sophia",
  role: "Secretary",
  color: "#F59E0B",
};

// Memoize static sub-scenes to prevent unnecessary re-renders
const MemoizedRoom = memo(RoomEnvironment3D);
const MemoizedTable = memo(MeetingTable3D);

/** Compute holographic monitor position from a seat position */
function getMonitorTransform(pos: [number, number, number]): {
  position: [number, number, number];
  rotationY: number;
} {
  const dx = -pos[0];
  const dz = -pos[2];
  const dist = Math.sqrt(dx * dx + dz * dz);
  const nx = dx / dist;
  const nz = dz / dist;
  const offset = 0.5;
  return {
    position: [pos[0] + nx * offset, 1.05, pos[2] + nz * offset],
    rotationY: Math.atan2(pos[0], pos[2]) + Math.PI,
  };
}

/** Minimal office chair (standalone, world-space Y=0 is floor) */
const HumanChair = memo(function HumanChair({
  position,
  rotationY,
}: {
  position: [number, number, number];
  rotationY: number;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Seat cushion */}
      <mesh position={[0, 0.55, 0.08]}>
        <boxGeometry args={[0.44, 0.05, 0.42]} />
        <meshStandardMaterial color="#1a1a24" roughness={0.8} />
      </mesh>
      {/* Backrest */}
      <mesh position={[0, 0.85, -0.12]}>
        <boxGeometry args={[0.4, 0.55, 0.04]} />
        <meshStandardMaterial color="#1a1a24" roughness={0.75} />
      </mesh>
      {/* Backrest cushion */}
      <mesh position={[0, 0.85, -0.09]}>
        <boxGeometry args={[0.36, 0.48, 0.02]} />
        <meshStandardMaterial color="#252530" roughness={0.85} />
      </mesh>
      {/* Center post */}
      <mesh position={[0, 0.275, 0.08]}>
        <cylinderGeometry args={[0.025, 0.035, 0.55, 8]} />
        <meshStandardMaterial color="#2a2a35" roughness={0.3} metalness={0.7} />
      </mesh>
      {/* Base disc */}
      <mesh position={[0, 0.015, 0.08]}>
        <cylinderGeometry args={[0.25, 0.25, 0.03, 24]} />
        <meshStandardMaterial color="#1a1a24" roughness={0.4} metalness={0.5} />
      </mesh>
      {/* Armrests */}
      <mesh position={[-0.22, 0.71, 0.1]}>
        <boxGeometry args={[0.04, 0.03, 0.22]} />
        <meshStandardMaterial color="#222" roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh position={[0.22, 0.71, 0.1]}>
        <boxGeometry args={[0.04, 0.03, 0.22]} />
        <meshStandardMaterial color="#222" roughness={0.6} metalness={0.2} />
      </mesh>
    </group>
  );
});

/** Human participant data */
export interface HumanParticipant {
  name: string;
  color?: string;
}

interface MeetingRoom3DProps {
  speakingAgent: string | null;
  thinkingAgents: string[];
  meetingPhase: string;
  /** Artifact to display on the back-wall screen, or null for idle state */
  currentArtifact?: ArtifactData | null;
  /** Additional human participants (max 2) sitting across from Chairman */
  humanParticipants?: HumanParticipant[];
  /** Current BigScreen visualization event */
  bigScreenEvent?: BigScreenUpdateEvent | null;
  /** Current page info for BigScreen history navigation */
  bigScreenPage?: { current: number; total: number } | null;
  /** Callback for Q/E keyboard navigation through BigScreen history */
  onBigScreenNav?: (dir: "prev" | "next") => void;
}

export const MeetingRoom3D = memo(function MeetingRoom3D({
  speakingAgent,
  thinkingAgents,
  currentArtifact = null,
  humanParticipants = [],
  bigScreenEvent = null,
  bigScreenPage = null,
  onBigScreenNav,
}: MeetingRoom3DProps) {
  // useRef instead of useState to avoid re-renders on drag
  const isUserControllingRef = useRef(false);
  const controlTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // V key toggles first-person view (rare toggle, useState is fine)
  const [isFirstPerson, setIsFirstPerson] = useState(false);
  // A/D keys rotate look direction in first-person: -50, 0, +50 degrees
  const [firstPersonYaw, setFirstPersonYaw] = useState(0);
  // Backtick key toggles back-wall monitor view (works in any mode)
  const [isLookingBack, setIsLookingBack] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle keys if user is typing in an input field
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable)
        return;

      // V: toggle first-person view
      if (e.key === "v" || e.key === "V") {
        setIsFirstPerson((prev) => {
          if (prev) setFirstPersonYaw(0);
          return !prev;
        });
        setIsLookingBack(false);
      }

      // Backtick: toggle back-wall monitor view
      if (e.key === "`") {
        setIsLookingBack((prev) => !prev);
      }

      // A/D: rotate look direction in first-person mode only
      if (isFirstPerson && !isLookingBack) {
        if (e.key === "a" || e.key === "A") {
          setFirstPersonYaw((prev) => Math.min(prev + 50, 50));
        }
        if (e.key === "d" || e.key === "D") {
          setFirstPersonYaw((prev) => Math.max(prev - 50, -50));
        }
      }

      // Q/E: navigate BigScreen history (only when multiple pages exist)
      if (e.key === "q" || e.key === "Q") {
        onBigScreenNav?.("prev");
      }
      if (e.key === "e" || e.key === "E") {
        onBigScreenNav?.("next");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFirstPerson, isLookingBack, onBigScreenNav]);

  const seatPositions = useMemo(() => {
    const map: Record<string, [number, number, number]> = {};
    for (const seat of SEAT_CONFIG) {
      map[seat.agent] = seat.position;
    }
    return map;
  }, []);

  // Stabilize thinking set to avoid unnecessary avatar re-renders
  const thinkingSet = useMemo(() => new Set(thinkingAgents), [thinkingAgents]);

  // Gaze target: all agents look at the speaking agent
  const gazeTarget = useMemo<[number, number, number] | null>(() => {
    if (!speakingAgent) return null;
    const speakerSeat = SEAT_CONFIG.find((s) => s.agent === speakingAgent);
    if (!speakerSeat) return null;
    return [speakerSeat.position[0], 1.2, speakerSeat.position[2]];
  }, [speakingAgent]);

  // Pre-compute holographic monitor transforms for AI agents
  const monitorTransforms = useMemo(
    () => SEAT_CONFIG.map((seat) => getMonitorTransform(seat.position)),
    [],
  );

  // Pre-compute transforms for human participant seats
  const humanSeatData = useMemo(
    () =>
      HUMAN_EXTRA_SEATS.map((pos) => ({
        position: pos,
        rotationY: Math.atan2(pos[0], pos[2]) + Math.PI,
        monitor: getMonitorTransform(pos),
      })),
    [],
  );

  const handleOrbitStart = useCallback(() => {
    isUserControllingRef.current = true;
    if (controlTimeoutRef.current) {
      clearTimeout(controlTimeoutRef.current);
    }
  }, []);

  const handleOrbitEnd = useCallback(() => {
    controlTimeoutRef.current = setTimeout(() => {
      isUserControllingRef.current = false;
    }, 3000);
  }, []);

  return (
    <div className="w-full h-full relative">
      <Canvas
        shadows
        camera={{ position: [0, 5.0, -4.5], fov: 45, near: 0.1, far: 50 }}
        gl={{ antialias: true, toneMapping: 3, powerPreference: "high-performance" }}
        dpr={1}
      >
        <Suspense fallback={null}>
          {/* ═══ LIGHTING ═══ */}
          <ambientLight intensity={1.6} color="#eeeef4" />
          <directionalLight
            position={[5, 8, 5]}
            intensity={2.5}
            castShadow
            shadow-mapSize-width={256}
            shadow-mapSize-height={256}
            shadow-camera-far={20}
            shadow-camera-left={-6}
            shadow-camera-right={6}
            shadow-camera-top={6}
            shadow-camera-bottom={-6}
            shadow-bias={-0.0001}
            color="#f8f8ff"
          />
          <directionalLight position={[-4, 6, -3]} intensity={1.0} color="#d4d4ff" />

          {/* ═══ ENVIRONMENT ═══ */}
          <Environment background={false}>
            <color attach="background" args={["#1a1530"]} />
          </Environment>

          {/* ═══ ROOM (memoized - never re-renders) ═══ */}
          <MemoizedRoom />

          {/* ═══ TABLE + PROPS (memoized) ═══ */}
          <MemoizedTable />

          {/* ═══ HOLOGRAPHIC MONITORS — AI agents ═══ */}
          {monitorTransforms.map((mt, i) =>
            SEAT_CONFIG[i].agent === "chairman" ? null : (
              <HoloMonitor3D
                key={SEAT_CONFIG[i].agent}
                position={mt.position}
                rotationY={mt.rotationY}
                agentRole={SEAT_CONFIG[i].agent}
                agentName={SEAT_CONFIG[i].name}
                color={SEAT_CONFIG[i].color}
              />
            ),
          )}

          {/* ═══ HUMAN PARTICIPANT SEATS (max 2, far end facing Chairman) ═══ */}
          {humanParticipants.slice(0, 2).map((participant, i) => {
            const seat = humanSeatData[i];
            const pColor = participant.color || "#a78bfa";
            return (
              <group key={`human-${i}`}>
                {/* Chair */}
                <HumanChair position={seat.position} rotationY={seat.rotationY} />
                {/* Holographic monitor */}
                <HoloMonitor3D
                  position={seat.monitor.position}
                  rotationY={seat.monitor.rotationY}
                  agentRole="MEMBER"
                  agentName={participant.name}
                  color={pColor}
                />
                {/* Name badge above seat */}
                <Billboard position={[seat.position[0], 1.75, seat.position[2]]}>
                  <mesh>
                    <planeGeometry args={[0.65, 0.15]} />
                    <meshBasicMaterial color="#1a1a2a" transparent opacity={0.88} />
                  </mesh>
                  <mesh position={[0, 0, -0.001]}>
                    <planeGeometry args={[0.67, 0.17]} />
                    <meshBasicMaterial color={pColor} transparent opacity={0.3} />
                  </mesh>
                  <Text
                    position={[0, 0, 0.001]}
                    fontSize={0.058}
                    color={pColor}
                    anchorX="center"
                    anchorY="middle"
                    maxWidth={0.6}
                  >
                    {participant.name}
                  </Text>
                </Billboard>
              </group>
            );
          })}

          {/* ═══ SOPHIA — standing beside big screen ═══ */}
          <group position={SOPHIA_CONFIG.position} rotation={SOPHIA_CONFIG.rotation}>
            <AgentAvatar3D
              agentName={SOPHIA_CONFIG.name}
              agentRole={SOPHIA_CONFIG.role.toLowerCase()}
              position={[0, 0, 0]}
              rotation={[0, 0, 0]}
              isSpeaking={false}
              isThinking={false}
              color={SOPHIA_CONFIG.color}
            />
            <HoloMonitor3D
              position={[0, 1.8, 0.3]}
              rotationY={0}
              agentRole="secretary"
              agentName="Sophia"
              color={SOPHIA_CONFIG.color}
            />
          </group>

          {/* ═══ ARTIFACT SCREEN (back wall) ═══ */}
          <ArtifactScreen3D
            artifact={currentArtifact}
            bigScreenEvent={bigScreenEvent}
            pageInfo={bigScreenPage}
          />

          {/* ═══ CONTACT SHADOWS (baked once) ═══ */}
          <ContactShadows
            position={[0, 0, 0]}
            opacity={0.35}
            scale={10}
            blur={3}
            far={3}
            color="#000020"
            resolution={128}
            frames={1}
          />

          {/* ═══ AVATARS (Ready Player Me GLB models, seated) ═══ */}
          {SEAT_CONFIG.map((seat) =>
            isFirstPerson && seat.agent === "chairman" ? null : (
              <RPMAgentAvatar
                key={seat.agent}
                agentRole={seat.agent}
                agentName={seat.name}
                position={seat.position}
                rotation={seat.rotation}
                isSpeaking={speakingAgent === seat.agent}
                isThinking={thinkingSet.has(seat.agent)}
                color={seat.color}
                gazeTarget={seat.agent === speakingAgent ? null : gazeTarget}
              />
            ),
          )}

          {/* ═══ CAMERA ═══ */}
          <CameraController
            speakingAgent={speakingAgent}
            seatPositions={seatPositions}
            isUserControllingRef={isUserControllingRef}
            isFirstPerson={isFirstPerson}
            firstPersonYaw={firstPersonYaw}
            isLookingBack={isLookingBack}
          />
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.08}
            enablePan={false}
            minPolarAngle={Math.PI / 8}
            maxPolarAngle={Math.PI / 2.3}
            minDistance={2}
            maxDistance={12}
            enabled={!isFirstPerson && !isLookingBack}
            onStart={handleOrbitStart}
            onEnd={handleOrbitEnd}
          />

          {/* Post-processing removed for performance */}
        </Suspense>
      </Canvas>

      {/* ═══ VIEW MODE INDICATOR (HTML overlay) ═══ */}
      {(isFirstPerson || isLookingBack) && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/30 text-white/50 text-xs px-3 py-1.5 rounded-full backdrop-blur-sm pointer-events-none select-none flex items-center gap-2">
          {isLookingBack ? (
            <span>{S.camera.backMonitorHint}</span>
          ) : (
            <>
              <span className={firstPersonYaw > 0 ? "text-indigo-400" : "text-white/40"}>
                A &larr;
              </span>
              <span>{S.camera.firstPersonHint}</span>
              <span className={firstPersonYaw < 0 ? "text-indigo-400" : "text-white/40"}>
                &rarr; D
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
});
