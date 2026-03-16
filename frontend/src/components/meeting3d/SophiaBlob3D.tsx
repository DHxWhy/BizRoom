/**
 * SophiaBlob3D — AIBlob-style animated gradient globe on a Billboard CircleGeometry.
 *
 * Exact port of the AIBlob fragment shader (perlin noise + 4-color gradient
 * + rim glow + inner caustics) onto an R3F Billboard mesh.
 * State-reactive animation speed for idle / speaking / thinking.
 */

import { useRef, useMemo, memo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Billboard, Text } from "@react-three/drei";
import { S } from "../../constants/strings";

interface SophiaBlob3DProps {
  position: [number, number, number];
  isThinking?: boolean;
  isSpeaking?: boolean;
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    // CircleGeometry uv: (0.5,0.5) at center, 0..1 range
    // Map to -1.5..1.5 to match original AIBlob coordinate space
    vUv = (uv * 2.0 - 1.0) * 1.5;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Exact AIBlob fragment shader — only change: use vUv instead of gl_FragCoord
const fragmentShader = /* glsl */ `
  precision mediump float;

  uniform float uTime;
  uniform float uSpeed;
  uniform float uInnerSpeed;
  uniform float uGlowIntensity;
  uniform float uNoiseScale;
  uniform float uInnerScale;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform vec3 uColor4;

  varying vec2 vUv;

  #define PI_TWO 6.28318530718

  float rng(vec2 n) {
    return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
  }

  float perlin(vec2 p) {
    vec2 ip = floor(p);
    vec2 u = fract(p);
    u = u * u * (3.0 - 2.0 * u);
    float res = mix(
      mix(rng(ip), rng(ip + vec2(1.0, 0.0)), u.x),
      mix(rng(ip + vec2(0.0, 1.0)), rng(ip + vec2(1.0, 1.0)), u.x), u.y);
    return res * res;
  }

  float fractal(vec2 p, int octaves) {
    float s = 0.0;
    float m = 0.0;
    float a = 0.5;
    s += a * perlin(p); m += a; a *= 0.5; p *= 2.0;
    if (octaves >= 2) { s += a * perlin(p); m += a; }
    return s / m;
  }

  float brightness(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
  }

  mat3 rotateX(float angle) {
    float s = sin(angle), c = cos(angle);
    return mat3(1,0,0, 0,c,-s, 0,s,c);
  }
  mat3 rotateY(float angle) {
    float s = sin(angle), c = cos(angle);
    return mat3(c,0,s, 0,1,0, -s,0,c);
  }
  mat3 rotateZ(float angle) {
    float s = sin(angle), c = cos(angle);
    return mat3(c,-s,0, s,c,0, 0,0,1);
  }

  void main() {
    vec2 uv = vUv;
    float t = uTime * uSpeed;
    float it = uTime * uInnerSpeed; // separate inner wave time

    float l = dot(uv, uv);
    if (l > 2.5) discard;

    float sm = smoothstep(1.04, 0.96, l);

    float z = sqrt(max(0.0, 1.0 - min(l, 1.0)));
    vec3 noisePos = normalize(vec3(uv.x, uv.y, z));

    float angleX = sin(t * 0.23) * 1.5 + cos(t * 0.37) * 0.6;
    float angleY = sin(t * 0.19) * 1.3 + cos(t * 0.41) * 0.7;
    float angleZ = sin(t * 0.31) * 1.1 + cos(t * 0.29) * 0.5;

    noisePos = rotateX(angleX) * noisePos;
    noisePos = rotateY(angleY) * noisePos;
    noisePos = rotateZ(angleZ) * noisePos;

    float d = sm * l * l * l * 2.0;
    vec3 norm = normalize(vec3(uv.x, uv.y, 0.7 - d));

    float nx = fractal(noisePos.xy * 2.0 * uNoiseScale / 3.0 + it * 0.4 + 25.69, 2);
    float ny = fractal(noisePos.xy * 2.0 * uNoiseScale / 3.0 + it * 0.4 + 86.31, 2);
    float n = fractal(noisePos.xy * uNoiseScale + 2.0 * vec2(nx, ny), 2);
    vec3 col = vec3(n * 0.5 + 0.25);
    float a = atan(noisePos.y, noisePos.x) / PI_TWO + t * 0.1;

    // 4-color gradient
    float gradPos = fract(a);
    vec3 gradientColor;
    if (gradPos < 0.25) {
      gradientColor = mix(uColor1, uColor2, gradPos * 4.0);
    } else if (gradPos < 0.5) {
      gradientColor = mix(uColor2, uColor3, (gradPos - 0.25) * 4.0);
    } else if (gradPos < 0.75) {
      gradientColor = mix(uColor3, uColor4, (gradPos - 0.5) * 4.0);
    } else {
      gradientColor = mix(uColor4, uColor1, (gradPos - 0.75) * 4.0);
    }

    col *= gradientColor;
    col *= 2.0 * uGlowIntensity * 1.25;
    vec3 cd = abs(col);
    vec3 c = col * d;

    float lightDot = max(0.0, dot(norm, vec3(0, 0, -1)));
    c += (c * 0.5 + vec3(1.0) - brightness(c)) * vec3(pow(lightDot, 5.0) * 3.0);

    float g = 1.5 * smoothstep(0.5, 1.0, fractal(noisePos.xy * uInnerScale / (1.0 + noisePos.z), 1)) * d;
    c += g * uGlowIntensity;

    float uvLen = length(uv);
    col = c + col * pow((1.0 - smoothstep(1.0, 0.98, l) - pow(max(0.0, uvLen - 1.0), 0.2)) * 2.0, 4.0);

    float f = fractal(noisePos.xy * 2.0 + it, 2) + 0.1;
    vec2 innerUV = uv * (f + 0.1) * 0.5 / uInnerScale;
    float innerL = dot(innerUV, innerUV);
    vec3 ins = normalize(cd) + 0.1;
    float ind = 0.2 + pow(smoothstep(0.0, 1.5, sqrt(innerL)) * 48.0, 0.25);
    ind *= ind * ind * ind;
    ind = 1.0 / ind;
    ins *= ind;
    col += ins * ins * sm * smoothstep(0.7, 1.0, ind) * uGlowIntensity;
    col += abs(norm) * (1.0 - d) * sm * 0.25;

    float colBrightness = brightness(col);
    float alpha = sm * pow(colBrightness, 2.5) * 2.0;
    alpha = clamp(alpha, 0.0, 1.0);

    float edgeFalloff = smoothstep(1.0, 0.95, uvLen);
    alpha *= edgeFalloff;

    col = pow(col, vec3(0.95));

    if (alpha < 0.01) discard;

    gl_FragColor = vec4(col, alpha);
  }
`;

// Microsoft signature 4 colors
const COLOR1 = new THREE.Vector3(0.949, 0.314, 0.133); // #F25022 Red
const COLOR2 = new THREE.Vector3(0.498, 0.729, 0.000); // #7FBA00 Green
const COLOR3 = new THREE.Vector3(0.000, 0.643, 0.937); // #00A4EF Blue
const COLOR4 = new THREE.Vector3(1.000, 0.725, 0.000); // #FFB900 Yellow

export const SophiaBlob3D = memo(function SophiaBlob3D({
  position,
  isThinking = false,
  isSpeaking = false,
}: SophiaBlob3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const baseY = position[1];

  const speed = useMemo(() => {
    if (isThinking) return 1.6;
    if (isSpeaking) return 1.0;
    return 0.5;
  }, [isThinking, isSpeaking]);

  const innerSpeed = useMemo(() => {
    if (isThinking) return 2.0;
    if (isSpeaking) return 2.5; // inner waves pulse faster when speaking
    return 0.5;
  }, [isThinking, isSpeaking]);

  const glowIntensity = useMemo(() => {
    if (isThinking) return 1.2;
    if (isSpeaking) return 1.1;
    return 0.8;
  }, [isThinking, isSpeaking]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSpeed: { value: speed },
      uInnerSpeed: { value: innerSpeed },
      uGlowIntensity: { value: glowIntensity },
      uNoiseScale: { value: 3.0 },
      uInnerScale: { value: 1.0 },
      uColor1: { value: COLOR1.clone() },
      uColor2: { value: COLOR2.clone() },
      uColor3: { value: COLOR3.clone() },
      uColor4: { value: COLOR4.clone() },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.position.y =
        baseY + Math.sin(Date.now() * 0.001 * 0.8) * 0.025;
    }
    if (materialRef.current) {
      const u = materialRef.current.uniforms;
      u.uTime.value += delta;
      const lerp = Math.min(delta * 3, 1);
      u.uSpeed.value += (speed - u.uSpeed.value) * lerp;
      u.uInnerSpeed.value += (innerSpeed - u.uInnerSpeed.value) * lerp;
      u.uGlowIntensity.value += (glowIntensity - u.uGlowIntensity.value) * lerp;
    }
  });

  return (
    <group position={position} ref={groupRef}>
      <Billboard>
        <mesh>
          <circleGeometry args={[0.14, 64]} />
          <shaderMaterial
            ref={materialRef}
            vertexShader={vertexShader}
            fragmentShader={fragmentShader}
            uniforms={uniforms}
            transparent
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.NormalBlending}
          />
        </mesh>
      </Billboard>

      <Billboard position={[0, 0.22, 0]}>
        <Text
          fontSize={0.055}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          fillOpacity={1.0}
          outlineWidth={0.004}
          outlineColor="#00A4EF"
        >
          {S.agents.sophia.name.toUpperCase()}
        </Text>
        <Text
          fontSize={0.028}
          color="#00A4EF"
          anchorX="center"
          anchorY="middle"
          position={[0, -0.05, 0]}
          fillOpacity={0.9}
        >
          {S.agents.sophia.role.toUpperCase()}
        </Text>
      </Billboard>
    </group>
  );
});
