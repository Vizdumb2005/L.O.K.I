import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { LanternEyesProps } from "./avatar-types.js";

const COLOR_AMBER = new THREE.Color("#e68a00");
const COLOR_GOLD = new THREE.Color("#ffea77");
const DEG2RAD = Math.PI / 180;

function createSoftRadialTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255, 255, 255, 1.0)");
    gradient.addColorStop(0.35, "rgba(255, 230, 150, 0.7)");
    gradient.addColorStop(0.7, "rgba(255, 180, 50, 0.25)");
    gradient.addColorStop(1.0, "rgba(255, 150, 0, 0.0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/**
 * Optical stack for the Nocturne Artificer avatar's glowing amber lantern eyes.
 * Uses recessed dark sockets, incandescent filament cores, internal point lights,
 * and dual concentric additive bloom billboards without external postprocessing packages.
 */
export function LanternEyes(props: LanternEyesProps) {
  const leftSocketRef = useRef<THREE.Group>(null);
  const rightSocketRef = useRef<THREE.Group>(null);

  const leftPointLightRef = useRef<THREE.PointLight>(null);
  const rightPointLightRef = useRef<THREE.PointLight>(null);

  const leftFilamentMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const rightFilamentMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const leftCoronaMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const rightCoronaMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const leftHaloMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const rightHaloMatRef = useRef<THREE.MeshBasicMaterial>(null);

  // Dynamic filter state
  const rmsEnvRef = useRef(0);
  const lockStateRef = useRef(0);
  const currentColorRef = useRef(new THREE.Color("#e68a00"));

  const radialTexture = useMemo(() => createSoftRadialTexture(), []);

  // Cleanup WebGL CanvasTexture on unmount to prevent GPU resource leaks
  useEffect(() => {
    return () => {
      radialTexture.dispose();
    };
  }, [radialTexture]);

  useFrame(({ clock }, delta) => {
    const dt = Math.min(0.066, delta);
    const t = clock.getElapsedTime();
    const reducedMotion = Boolean(props.reducedMotion);

    // 1. Asymmetric Speech RMS Follower with Self-Healing Filter State
    const rawRms = Number.isFinite(props.audioRms) ? (props.audioRms as number) : 0;
    const cleanNorm = Math.max(0, Math.min(1, (rawRms - 0.02) / 0.38));
    const rmsNorm = Math.pow(cleanNorm, 1.25);
    const attackRate = 1 - Math.exp(-dt / 0.02); // 20 ms attack
    const decayRate = 1 - Math.exp(-dt / 0.14);  // 140 ms decay
    const targetEnv = Number.isFinite(rmsNorm) ? rmsNorm : 0;

    if (!Number.isFinite(rmsEnvRef.current)) {
      rmsEnvRef.current = 0.0;
    }

    rmsEnvRef.current += (targetEnv > rmsEnvRef.current ? attackRate : decayRate) * (targetEnv - rmsEnvRef.current);

    if (!Number.isFinite(rmsEnvRef.current)) {
      rmsEnvRef.current = 0.0;
    }

    // 2. Gaze Lock Transition
    const targetLock = props.gazeLocked ? 1.0 : 0.0;
    const lockRate = 1 - Math.exp(-dt / 0.18);
    if (!Number.isFinite(lockStateRef.current)) {
      lockStateRef.current = 0.0;
    }
    lockStateRef.current += lockRate * (targetLock - lockStateRef.current);
    if (!Number.isFinite(lockStateRef.current)) {
      lockStateRef.current = 0.0;
    }

    // 3. Composite Intensity Transfer Function
    let totalIntensity: number;

    if (reducedMotion) {
      // Gentle, non-strobing intensity in [1.0, 1.4]
      const rmsBoost = rmsEnvRef.current * 0.4;
      const lockBoost = lockStateRef.current * 0.4;
      totalIntensity = Math.min(1.4, 1.0 + rmsBoost + lockBoost);
    } else {
      // Living simmer baseline
      const simmer = 1.0 + 0.14 * Math.sin(2.3 * t) + 0.08 * Math.sin(5.7 * t + 1.2) + 0.04 * Math.cos(11.3 * t);
      // Speech audio pulse
      const rmsPulse = 3.2 * rmsEnvRef.current;
      // Gaze lock flare (+2.4) with high-frequency arc shimmer
      const lockPulse = 2.4 * lockStateRef.current;
      const lockFlicker = 0.07 * lockStateRef.current * Math.sin(31.4 * t);
      // Reveal burst
      const revealPulse = 4.0 * (props.revealPulse ?? 0);

      totalIntensity = Math.max(0.6, simmer + rmsPulse + lockPulse + lockFlicker + revealPulse);
    }

    // 4. Dynamic Color Temperature Shift: Amber #e68a00 -> Warm Incandescent Gold #ffea77
    const colorT = Math.max(0, Math.min(1, (totalIntensity - 1.0) / 3.5));
    currentColorRef.current.copy(COLOR_AMBER).lerp(COLOR_GOLD, colorT);

    // 5. Update Point Lights
    const lightIntensity = 0.6 * totalIntensity;
    if (leftPointLightRef.current) {
      leftPointLightRef.current.intensity = lightIntensity;
      leftPointLightRef.current.color.copy(currentColorRef.current);
    }
    if (rightPointLightRef.current) {
      rightPointLightRef.current.intensity = lightIntensity;
      rightPointLightRef.current.color.copy(currentColorRef.current);
    }

    // 6. Update Materials & Additive Billboards
    const innerAlpha = Math.max(0, Math.min(0.95, 0.35 + 0.14 * totalIntensity));
    const outerAlpha = Math.max(0, Math.min(0.85, 0.25 + 0.10 * totalIntensity));

    if (leftFilamentMatRef.current) leftFilamentMatRef.current.color.copy(currentColorRef.current);
    if (rightFilamentMatRef.current) rightFilamentMatRef.current.color.copy(currentColorRef.current);

    if (leftCoronaMatRef.current) {
      leftCoronaMatRef.current.color.copy(currentColorRef.current);
      leftCoronaMatRef.current.opacity = innerAlpha;
    }
    if (rightCoronaMatRef.current) {
      rightCoronaMatRef.current.color.copy(currentColorRef.current);
      rightCoronaMatRef.current.opacity = innerAlpha;
    }

    if (leftHaloMatRef.current) {
      leftHaloMatRef.current.color.copy(currentColorRef.current);
      leftHaloMatRef.current.opacity = outerAlpha;
    }
    if (rightHaloMatRef.current) {
      rightHaloMatRef.current.color.copy(currentColorRef.current);
      rightHaloMatRef.current.opacity = outerAlpha;
    }

    // 7. Independent Eye Orientation & Inward Vergence
    if (!reducedMotion) {
      const screenX = Number.isFinite(props.headPose?.screenX) ? props.headPose!.screenX! : 0;
      const screenY = Number.isFinite(props.headPose?.screenY) ? props.headPose!.screenY! : 0;
      const targetYaw = Number.isFinite(props.headPose?.yaw) ? props.headPose!.yaw! / DEG2RAD : 0;
      const targetPitch = Number.isFinite(props.headPose?.pitch) ? props.headPose!.pitch! / DEG2RAD : 0;

      // Compensatory tracking relative to head angle
      const eyeYawDeg = Math.max(-5.0, Math.min(5.0, -8.0 * screenX - 0.35 * targetYaw));
      const eyePitchDeg = Math.max(-4.0, Math.min(4.0, 6.0 * screenY - 0.35 * targetPitch));

      // Inward vergence: Left eye points inward (+X), Right eye points inward (-X)
      const vergence = props.gazeLocked ? 1.8 : 1.2;
      const leftYawRad = (eyeYawDeg + vergence) * DEG2RAD;
      const rightYawRad = (eyeYawDeg - vergence) * DEG2RAD;
      const pitchRad = eyePitchDeg * DEG2RAD;

      if (leftSocketRef.current) {
        leftSocketRef.current.rotation.y = leftYawRad;
        leftSocketRef.current.rotation.x = pitchRad;
      }
      if (rightSocketRef.current) {
        rightSocketRef.current.rotation.y = rightYawRad;
        rightSocketRef.current.rotation.x = pitchRad;
      }
    }
  });

  return (
    <group position={props.position} scale={props.scale}>
      {/* Left Eye Assembly (at local X = -0.28, Y = 0.22, Z = 0.20) */}
      <group position={[-0.28, 0.22, 0.2]}>
        {/* Recessed Socket Well (Darkened cylinder blocking light leak) */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.08, 0.05, 0.14, 16, 1, true]} />
          <meshStandardMaterial color="#120e0a" roughness={0.92} metalness={0.15} />
        </mesh>

        <group ref={leftSocketRef}>
          {/* Incandescent Core Sphere (Filament) */}
          <mesh position={[0, 0, -0.04]}>
            <sphereGeometry args={[0.038, 16, 16]} />
            <meshBasicMaterial ref={leftFilamentMatRef} color="#e68a00" />
          </mesh>

          {/* Internal Volumetric Point Light */}
          <pointLight
            ref={leftPointLightRef}
            position={[0, 0, 0.02]}
            color="#e68a00"
            intensity={1.0}
            distance={2.8}
            decay={2}
          />

          {/* Inner Corona Disc (Concentric Additive Billboard) */}
          <mesh position={[0, 0, 0.025]}>
            <circleGeometry args={[0.065, 24]} />
            <meshBasicMaterial
              ref={leftCoronaMatRef}
              color="#e68a00"
              transparent
              opacity={0.55}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>

          {/* Outer Flare Halo (Soft Radial Falloff Additive Billboard) */}
          <mesh position={[0, 0, 0.03]}>
            <planeGeometry args={[0.26, 0.26]} />
            <meshBasicMaterial
              ref={leftHaloMatRef}
              map={radialTexture}
              color="#e68a00"
              transparent
              opacity={0.4}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </group>
      </group>

      {/* Right Eye Assembly (at local X = +0.28, Y = 0.22, Z = 0.20) */}
      <group position={[0.28, 0.22, 0.2]}>
        {/* Recessed Socket Well */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.08, 0.05, 0.14, 16, 1, true]} />
          <meshStandardMaterial color="#120e0a" roughness={0.92} metalness={0.15} />
        </mesh>

        <group ref={rightSocketRef}>
          {/* Incandescent Core Sphere (Filament) */}
          <mesh position={[0, 0, -0.04]}>
            <sphereGeometry args={[0.038, 16, 16]} />
            <meshBasicMaterial ref={rightFilamentMatRef} color="#e68a00" />
          </mesh>

          {/* Internal Volumetric Point Light */}
          <pointLight
            ref={rightPointLightRef}
            position={[0, 0, 0.02]}
            color="#e68a00"
            intensity={1.0}
            distance={2.8}
            decay={2}
          />

          {/* Inner Corona Disc */}
          <mesh position={[0, 0, 0.025]}>
            <circleGeometry args={[0.065, 24]} />
            <meshBasicMaterial
              ref={rightCoronaMatRef}
              color="#e68a00"
              transparent
              opacity={0.55}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>

          {/* Outer Flare Halo */}
          <mesh position={[0, 0, 0.03]}>
            <planeGeometry args={[0.26, 0.26]} />
            <meshBasicMaterial
              ref={rightHaloMatRef}
              map={radialTexture}
              color="#e68a00"
              transparent
              opacity={0.4}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </group>
      </group>
    </group>
  );
}
