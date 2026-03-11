import { useRef, useMemo, useEffect, memo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, Text, Billboard } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";
import { AnimationMixer } from "three";
import type { Group, Mesh } from "three";
import { AVATAR_CONFIGS, DEFAULT_AVATAR, getUniqueModelUrls } from "./avatarConfig";

interface GLBAgentAvatarProps {
  agentRole: string;
  agentName: string;
  position: [number, number, number];
  rotation: [number, number, number];
  isSpeaking: boolean;
  isThinking: boolean;
  color: string;
}

export const GLBAgentAvatar = memo(function GLBAgentAvatar({
  agentRole,
  agentName,
  position,
  rotation,
  isSpeaking,
  isThinking,
  color,
}: GLBAgentAvatarProps) {
  const config = AVATAR_CONFIGS[agentRole] ?? DEFAULT_AVATAR;
  const { scene, animations } = useGLTF(config.url);

  // Clone scene so each avatar has its own skeleton
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);

  const groupRef = useRef<Group>(null);
  const speakingRingRef = useRef<Mesh>(null);

  // Create animation mixer directly on the clone (not parent group)
  const mixer = useMemo(() => new AnimationMixer(clone), [clone]);

  useEffect(() => {
    if (animations.length === 0) return;
    // Try to find idle animation, fallback to first available
    const idleClip =
      animations.find((c) => /idle/i.test(c.name)) ??
      animations[0];
    if (idleClip) {
      const action = mixer.clipAction(idleClip);
      action.play();
    }
    return () => mixer.stopAllAction();
  }, [mixer, animations]);

  // Tick animation mixer + breathing + speaking ring
  useFrame((state, delta) => {
    // Update animation mixer every frame
    mixer.update(delta);

    const t = state.clock.elapsedTime;
    if (!groupRef.current) return;

    // Breathing
    const amp = isSpeaking ? 0.008 : 0.003;
    groupRef.current.position.y =
      position[1] + config.yOffset + Math.sin(t * 1.5) * amp;

    // Speaking ring
    if (speakingRingRef.current) {
      speakingRingRef.current.visible = isSpeaking;
      if (isSpeaking) {
        const s = 1 + Math.sin(t * 3) * 0.12;
        speakingRingRef.current.scale.set(s, s, 1);
        const mat = speakingRingRef.current.material as { opacity: number };
        mat.opacity = 0.3 + Math.sin(t * 2) * 0.15;
      }
    }
  });

  return (
    <group ref={groupRef} position={position} rotation={rotation}>
      {/* GLB Model */}
      <primitive object={clone} scale={config.scale} />

      {/* Name plate */}
      <Billboard position={[0, config.nameHeight ?? 2.0, 0]} follow>
        <group>
          <mesh position={[0, 0, -0.01]}>
            <planeGeometry args={[0.8, 0.24]} />
            <meshBasicMaterial
              color={isSpeaking ? color : isThinking ? "#fbbf24" : "#1a1a2e"}
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

      {/* Speaking glow ring */}
      <mesh
        ref={speakingRingRef}
        position={[0, 0.01, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={false}
      >
        <ringGeometry args={[0.5, 0.65, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.4} />
      </mesh>

      {/* Thinking dots */}
      {isThinking && (
        <Billboard position={[0.4, (config.nameHeight ?? 2.0) - 0.2, 0]}>
          <ThinkingDots />
        </Billboard>
      )}
    </group>
  );
});

function ThinkingDots() {
  const group = useRef<Group>(null);
  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    group.current.children.forEach((child, i) => {
      child.position.y = Math.sin(t * 4 + i * 0.8) * 0.03;
    });
  });

  return (
    <group ref={group}>
      {[-0.06, 0, 0.06].map((x, i) => (
        <mesh key={i} position={[x, 0, 0]}>
          <sphereGeometry args={[0.025, 8, 8]} />
          <meshBasicMaterial color="#fbbf24" />
        </mesh>
      ))}
    </group>
  );
}

/** Preload all avatar models */
export function preloadAvatarModels() {
  getUniqueModelUrls().forEach((url) => useGLTF.preload(url));
}
