/**
 * SophiaBlob3D — Futuristic AI assistant presence floating above the meeting table.
 *
 * Real 3D shader blob using SphereGeometry + custom ShaderMaterial with:
 * - Vertex: layered sine-wave displacement + breathing scale
 * - Fragment: gradient color blending on world normals, fresnel rim glow,
 *   metallic specular highlight, additive blending for ethereal feel
 *
 * State-reactive: idle (slow morph), speaking (medium), thinking (fast).
 */

import { useRef, useMemo, memo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Billboard, Text } from "@react-three/drei";
import { S } from "../../constants/strings";

interface SophiaBlob3DProps {
  position: [number, number, number];
  /** Sophia is generating a visualization */
  isThinking?: boolean;
  /** Sophia is "speaking" (broadcasting a message) */
  isSpeaking?: boolean;
}

// ── GLSL Shaders ──

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uMorphIntensity;
  uniform float uBreatheSpeed;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vViewDirection;

  void main() {
    vec3 pos = position;

    // --- Layered sine-wave displacement (3 wave layers) ---
    float wave1 = sin(pos.x * 2.0 + uTime) * sin(pos.y * 2.0 + uTime * 0.5);
    float wave2 = sin(pos.y * 3.0 + uTime * 0.7) * sin(pos.z * 2.5 + uTime * 1.1);
    float wave3 = sin(pos.z * 1.8 + uTime * 1.3) * sin(pos.x * 3.2 + uTime * 0.8);

    float displacement = (wave1 + wave2 * 0.7 + wave3 * 0.5) * 0.15 * uMorphIntensity;

    // Displace along the normal direction
    pos += normal * displacement;

    // --- Breathing: uniform scale oscillation ---
    float breathe = 1.0 + sin(uTime * uBreatheSpeed) * 0.08;
    pos *= breathe;

    // Compute world-space values for fragment shader
    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vWorldPosition = worldPos.xyz;
    vNormal = normalize(normalMatrix * normal);
    vViewDirection = normalize(cameraPosition - worldPos.xyz);

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uPrimaryColor;
  uniform vec3 uSecondaryColor;
  uniform vec3 uAccentColor;
  uniform vec3 uBaseColor;
  uniform float uOpacity;
  uniform float uFresnelPower;
  uniform float uGlowIntensity;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vViewDirection;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewDirection);

    // --- Gradient color blending based on world normal direction ---
    // Smooth transitions using smoothstep on normal components
    float xFactor = smoothstep(-0.5, 0.5, normal.x);
    float yFactor = smoothstep(-0.3, 0.7, normal.y);
    float timeFactor = sin(uTime * 0.3) * 0.5 + 0.5;

    // Blend four colors based on normal direction + time
    vec3 color = mix(uPrimaryColor, uSecondaryColor, xFactor);
    color = mix(color, uAccentColor, yFactor * 0.6);
    color = mix(color, uBaseColor, timeFactor * 0.25);

    // --- Fresnel rim glow for ethereal edge effect ---
    float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), uFresnelPower);
    vec3 fresnelColor = mix(uAccentColor, uSecondaryColor, fresnel);
    color += fresnelColor * fresnel * uGlowIntensity;

    // --- Metallic specular highlight from directional light above ---
    vec3 lightDir = normalize(vec3(0.3, 1.0, 0.5));
    vec3 halfVec = normalize(lightDir + viewDir);
    float specular = pow(max(dot(normal, halfVec), 0.0), 32.0);
    color += vec3(1.0, 0.95, 0.9) * specular * 0.5;

    // --- Inner glow: darker center, brighter edges ---
    float innerGlow = fresnel * 0.3 + 0.7;
    color *= innerGlow;

    // --- Subtle pulsing emission ---
    float pulse = sin(uTime * 1.5) * 0.05 + 0.05;
    color += uSecondaryColor * pulse;

    // Final opacity: more transparent at center, more opaque at edges
    float alpha = uOpacity * (0.5 + fresnel * 0.5);

    gl_FragColor = vec4(color, alpha);
  }
`;

// ── Color constants (hex → THREE.Color) ──
const COLOR_PRIMARY = new THREE.Color("#6366F1"); // indigo
const COLOR_SECONDARY = new THREE.Color("#F59E0B"); // amber
const COLOR_ACCENT = new THREE.Color("#A78BFA"); // purple
const COLOR_BASE = new THREE.Color("#818CF8"); // lighter indigo

export const SophiaBlob3D = memo(function SophiaBlob3D({
  position,
  isThinking = false,
  isSpeaking = false,
}: SophiaBlob3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const timeRef = useRef(0);

  // Cache base Y from initial position to prevent useFrame override
  const baseY = position[1];

  // State-derived parameters (memoized)
  const stateParams = useMemo(() => {
    if (isThinking) {
      return {
        morphIntensity: 1.5,
        breatheSpeed: 3.0,
        fresnelPower: 2.0,
        glowIntensity: 1.8,
        opacity: 0.75,
        lightTarget: 3.5,
        morphSpeed: 1.5,
      };
    }
    if (isSpeaking) {
      return {
        morphIntensity: 0.8,
        breatheSpeed: 2.0,
        fresnelPower: 2.5,
        glowIntensity: 1.3,
        opacity: 0.7,
        lightTarget: 2.5,
        morphSpeed: 0.8,
      };
    }
    // Idle
    return {
      morphIntensity: 0.3,
      breatheSpeed: 1.0,
      fresnelPower: 3.0,
      glowIntensity: 0.8,
      opacity: 0.6,
      lightTarget: 1.2,
      morphSpeed: 0.3,
    };
  }, [isThinking, isSpeaking]);

  // Shader uniforms (created once, updated via ref in useFrame)
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMorphIntensity: { value: stateParams.morphIntensity },
      uBreatheSpeed: { value: stateParams.breatheSpeed },
      uPrimaryColor: { value: COLOR_PRIMARY.clone() },
      uSecondaryColor: { value: COLOR_SECONDARY.clone() },
      uAccentColor: { value: COLOR_ACCENT.clone() },
      uBaseColor: { value: COLOR_BASE.clone() },
      uOpacity: { value: stateParams.opacity },
      uFresnelPower: { value: stateParams.fresnelPower },
      uGlowIntensity: { value: stateParams.glowIntensity },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [], // uniforms object created once; values updated in useFrame
  );

  useFrame((_, delta) => {
    timeRef.current += delta * stateParams.morphSpeed;

    // Float bob (gentle Y oscillation)
    if (groupRef.current) {
      groupRef.current.position.y =
        baseY + Math.sin(timeRef.current * 0.8) * 0.06;
    }

    // Smoothly interpolate uniform values toward targets
    if (materialRef.current) {
      const u = materialRef.current.uniforms;
      const lerp = Math.min(delta * 3, 1);

      u.uTime.value = timeRef.current;
      u.uMorphIntensity.value +=
        (stateParams.morphIntensity - u.uMorphIntensity.value) * lerp;
      u.uBreatheSpeed.value +=
        (stateParams.breatheSpeed - u.uBreatheSpeed.value) * lerp;
      u.uOpacity.value +=
        (stateParams.opacity - u.uOpacity.value) * lerp;
      u.uFresnelPower.value +=
        (stateParams.fresnelPower - u.uFresnelPower.value) * lerp;
      u.uGlowIntensity.value +=
        (stateParams.glowIntensity - u.uGlowIntensity.value) * lerp;
    }

    // Point light intensity follows activity
    if (lightRef.current) {
      lightRef.current.intensity +=
        (stateParams.lightTarget - lightRef.current.intensity) * delta * 3;
    }
  });

  return (
    <group position={position} ref={groupRef}>
      {/* ═══ 3D Shader Blob ═══ */}
      <mesh>
        <sphereGeometry args={[0.25, 64, 64]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          transparent
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Inner core glow — smaller, brighter sphere */}
      <mesh>
        <sphereGeometry args={[0.12, 32, 32]} />
        <meshBasicMaterial
          color="#F59E0B"
          transparent
          opacity={0.15}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Outer halo — larger, very faint sphere */}
      <mesh>
        <sphereGeometry args={[0.35, 32, 32]} />
        <meshBasicMaterial
          color="#A78BFA"
          transparent
          opacity={0.05}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Point light for warm glow on table surface below */}
      <pointLight
        ref={lightRef}
        color="#F59E0B"
        intensity={1.2}
        distance={4}
        decay={2}
        position={[0, -0.2, 0]}
      />

      {/* Name label */}
      <Billboard position={[0, 0.65, 0]}>
        <Text
          fontSize={0.08}
          color="#F59E0B"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.7}
        >
          {S.agents.sophia.name.toUpperCase()}
        </Text>
        <Text
          fontSize={0.045}
          color="#a0a0b0"
          anchorX="center"
          anchorY="middle"
          position={[0, -0.08, 0]}
          fillOpacity={0.5}
        >
          {S.agents.sophia.role.toUpperCase()}
        </Text>
      </Billboard>
    </group>
  );
});
