import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { BrassMaskProps, VisemeState, HeadPose } from "./avatar-types.js";
import {
  createProceduralMaskGeometries,
  disposeMaskGeometries,
  type MaskGeometries
} from "./brass-mask-geometry.js";
import {
  createCaravaggioBrassMaterial,
  createObsidianBackingMaterial
} from "./CaravaggioBrassMaterial.js";
import { LanternEyes } from "./LanternEyes.js";
import { getNocturneIdleDrift } from "../lib/head-pose.js";

const DEFAULT_POSITION: [number, number, number] = [0, 1.85, -1.8];
const DEFAULT_SCALE = 0.92;

/**
 * Procedural Chiaroscuro Brass Mask Avatar (Nocturne Artificer).
 *
 * Implements:
 * - F13: Native R3F WebGL 3D avatar with procedural Three.js geometries (~780 tris)
 *        and Caravaggio Cook-Torrance GGX chiaroscuro PBR shader.
 * - F14: Optical stack glowing amber lantern eyes with dynamic speech RMS & gaze lock flare.
 * - F15: Real-time phonetic visemes with articulated mandible & mouth deformation.
 * - F16: Dynamic spectator head pose reciprocity and autonomous Nocturne idle drift.
 */
export function BrassMask(props: BrassMaskProps) {
  const rootRef = useRef<THREE.Group>(null);
  const headGroupRef = useRef<THREE.Group>(null);
  const mandiblePivotRef = useRef<THREE.Group>(null);
  const philtrumMeshRef = useRef<THREE.Mesh>(null);

  // Procedural geometries & materials
  const geos: MaskGeometries = useMemo(() => createProceduralMaskGeometries(), []);
  const brassMaterial = useMemo(() => createCaravaggioBrassMaterial(), []);
  const obsidianMaterial = useMemo(() => createObsidianBackingMaterial(), []);

  // Dispose GPU resources on unmount
  useEffect(() => {
    return () => {
      disposeMaskGeometries(geos);
      brassMaterial.dispose();
      obsidianMaterial.dispose();
      if (typeof window !== "undefined" && window.__LOKI_AVATAR_STATE__) {
        window.__LOKI_AVATAR_STATE__.mounted = false;
      }
    };
  }, [geos, brassMaterial, obsidianMaterial]);

  // Orientation tracking quaternion state
  const currentQuat = useMemo(() => new THREE.Quaternion(), []);
  const targetQuat = useMemo(() => new THREE.Quaternion(), []);
  const targetEuler = useMemo(() => new THREE.Euler(0, 0, 0, "YXZ"), []);

  // Filtered viseme state
  const currentVisemes = useRef<VisemeState>({
    jawOpen: 0,
    mouthWide: 0,
    mouthRound: 0
  });

  useFrame(({ clock }, delta) => {
    const dt = Math.min(0.066, delta);
    const t = clock.getElapsedTime();
    const reducedMotion = Boolean(props.reducedMotion);

    // Update shader time uniform for subtle micro-shimmer
    if (brassMaterial.uniforms.uTime) {
      brassMaterial.uniforms.uTime.value = t;
    }

    // 1. Viseme Filtering & Mandible Articulation (F15)
    const targetVisemes: VisemeState = {
      jawOpen: Number.isFinite(props.visemes?.jawOpen) ? props.visemes!.jawOpen! : 0,
      mouthWide: Number.isFinite(props.visemes?.mouthWide) ? props.visemes!.mouthWide! : 0,
      mouthRound: Number.isFinite(props.visemes?.mouthRound) ? props.visemes!.mouthRound! : 0
    };

    // Asymmetric damping rates (attack 24.0 s^-1, release 14.0 s^-1)
    const lambdaAttack = reducedMotion ? 8.0 : 24.0;
    const lambdaRelease = reducedMotion ? 6.0 : 14.0;
    const motionScale = reducedMotion ? 0.35 : 1.0;

    const dampViseme = (curr: number, target: number) => {
      const safeCurr = Number.isFinite(curr) ? curr : 0;
      const safeTarget = Number.isFinite(target) ? target : 0;
      const scaledTarget = safeTarget * motionScale;
      const rate = scaledTarget > safeCurr ? lambdaAttack : lambdaRelease;
      const result = THREE.MathUtils.damp(safeCurr, scaledTarget, rate, dt);
      return Number.isFinite(result) ? result : 0;
    };

    currentVisemes.current.jawOpen = dampViseme(currentVisemes.current.jawOpen, targetVisemes.jawOpen);
    currentVisemes.current.mouthWide = dampViseme(currentVisemes.current.mouthWide, targetVisemes.mouthWide);
    currentVisemes.current.mouthRound = dampViseme(currentVisemes.current.mouthRound, targetVisemes.mouthRound);

    const { jawOpen, mouthWide, mouthRound } = currentVisemes.current;

    // Articulated Mandible: pivot at temporomandibular joint
    if (mandiblePivotRef.current) {
      mandiblePivotRef.current.rotation.x = -jawOpen * 0.24; // pitch down up to -13.7°
      mandiblePivotRef.current.position.y = -0.14 - jawOpen * 0.085;
      mandiblePivotRef.current.position.z = -0.05 - jawOpen * 0.025;
    }

    // Philtrum / Lip Deformation
    if (philtrumMeshRef.current) {
      const scaleX = 1.0 + mouthWide * 0.32 - mouthRound * 0.22;
      const scaleY = 1.0 - mouthWide * 0.12 + mouthRound * 0.18;
      philtrumMeshRef.current.scale.set(scaleX, scaleY, 1.0);
      philtrumMeshRef.current.position.z = 0.22 + mouthRound * 0.055;
    }

    // 2. Head Pose Reciprocity & Autonomous Idle Drift (F16)
    let effectivePose: HeadPose;

    const hasFinitePose =
      props.headPose != null &&
      Number.isFinite(props.headPose.yaw) &&
      Number.isFinite(props.headPose.pitch) &&
      Number.isFinite(props.headPose.roll);

    const isNonZeroPose =
      props.headPose != null &&
      (props.headPose.yaw !== 0 ||
       props.headPose.pitch !== 0 ||
       props.headPose.roll !== 0 ||
       (props.headPose.screenX !== undefined && props.headPose.screenX !== 0) ||
       (props.headPose.screenY !== undefined && props.headPose.screenY !== 0));

    const isTracked =
      hasFinitePose &&
      (isNonZeroPose || Boolean(props.gazeLocked) || props.headPose?.isTracking === true);

    if (isTracked && props.headPose) {
      effectivePose = {
        yaw: props.headPose.yaw ?? 0,
        pitch: props.headPose.pitch ?? 0,
        roll: props.headPose.roll ?? 0,
        screenX: props.headPose.screenX ?? 0,
        screenY: props.headPose.screenY ?? 0,
        isTracking: true
      };
    } else {
      effectivePose = getNocturneIdleDrift(t, reducedMotion);
    }

    const isPoseFinite =
      Number.isFinite(effectivePose.pitch) &&
      Number.isFinite(effectivePose.yaw) &&
      Number.isFinite(effectivePose.roll);

    if (isPoseFinite) {
      targetEuler.set(effectivePose.pitch, effectivePose.yaw, effectivePose.roll, "YXZ");
      targetQuat.setFromEuler(targetEuler);
    } else {
      targetEuler.set(0, 0, 0, "YXZ");
      targetQuat.identity();
    }

    const isTargetQuatFinite =
      Number.isFinite(targetQuat.x) &&
      Number.isFinite(targetQuat.y) &&
      Number.isFinite(targetQuat.z) &&
      Number.isFinite(targetQuat.w);

    const slerpLambda = reducedMotion ? 1.0 : 4.8;
    const slerpFactor = 1 - Math.exp(-slerpLambda * dt);

    if (isTargetQuatFinite && Number.isFinite(slerpFactor) && slerpFactor >= 0 && slerpFactor <= 1) {
      currentQuat.slerp(targetQuat, slerpFactor);
    }

    // Defensive self-healing reset: restore identity if currentQuat is ever corrupted
    if (
      !Number.isFinite(currentQuat.x) ||
      !Number.isFinite(currentQuat.y) ||
      !Number.isFinite(currentQuat.z) ||
      !Number.isFinite(currentQuat.w)
    ) {
      currentQuat.identity();
    }

    if (headGroupRef.current) {
      headGroupRef.current.quaternion.copy(currentQuat);
    }

    // Floating breathing bob
    if (rootRef.current && !reducedMotion) {
      const breath = Math.sin(t * 0.8) * 0.015;
      rootRef.current.position.y = (props.position?.[1] ?? DEFAULT_POSITION[1]) + breath;
    }

    // 3. Expose Live Telemetry for Deterministic Testing & Profiling
    if (typeof window !== "undefined") {
      window.__LOKI_AVATAR_STATE__ = {
        mounted: true,
        visemes: { ...currentVisemes.current },
        headPose: { ...effectivePose },
        eyeIntensity: reducedMotion
          ? Math.min(1.4, 1.0 + (props.audioRms ?? 0) * 0.4 + (props.gazeLocked ? 0.4 : 0))
          : 1.0 + (props.audioRms ?? 0) * 3.2 + (props.gazeLocked ? 2.4 : 0),
        gazeLocked: Boolean(props.gazeLocked),
        speaking: Boolean(props.speaking || (props.audioRms ?? 0) > 0.05),
        audioRms: props.audioRms ?? 0,
        lastFrameTime: t
      };
    }
  });

  const position = props.position ?? DEFAULT_POSITION;
  const scale = props.scale ?? DEFAULT_SCALE;

  return (
    <group ref={rootRef} position={position} scale={scale} rotation={props.rotation}>
      {/* Head Assembly (Tracks Head Pose Quaternion) */}
      <group ref={headGroupRef}>
        {/* 1. Forehead Cranium Dome */}
        <mesh
          geometry={geos.cranium}
          material={brassMaterial}
          position={[0, 0.48, 0.0]}
          rotation={[0, 0, 0]}
        />

        {/* 2. Brow Ridge Arch (Creates deep chiaroscuro orbital shadows) */}
        <mesh
          geometry={geos.brow}
          material={brassMaterial}
          position={[0, 0.28, 0.22]}
        />

        {/* 3. Left & Right Orbital Bezels */}
        <mesh
          geometry={geos.orbitalBezel}
          material={brassMaterial}
          position={[-0.28, 0.22, 0.24]}
        />
        <mesh
          geometry={geos.orbitalBezel}
          material={brassMaterial}
          position={[0.28, 0.22, 0.24]}
        />

        {/* 4. Glowing Amber Lantern Eyes Optical Stack (F14) */}
        <LanternEyes
          audioRms={props.audioRms}
          gazeLocked={props.gazeLocked}
          revealPulse={props.revealPulse}
          reducedMotion={props.reducedMotion}
          headPose={props.headPose}
        />

        {/* 5. Nose Bridge Pyramid */}
        <mesh
          geometry={geos.nose}
          material={brassMaterial}
          position={[0, 0.04, 0.28]}
          rotation={[-0.12, 0, 0]}
        />

        {/* 6. Zygomatic Cheek Plates */}
        <mesh
          geometry={geos.cheek}
          material={brassMaterial}
          position={[-0.42, -0.02, 0.14]}
          rotation={[0, 0.35, -0.08]}
        />
        <mesh
          geometry={geos.cheek}
          material={brassMaterial}
          position={[0.42, -0.02, 0.14]}
          rotation={[0, -0.35, 0.08]}
        />

        {/* 7. Philtrum Upper Lip */}
        <mesh
          ref={philtrumMeshRef}
          geometry={geos.philtrum}
          material={brassMaterial}
          position={[0, -0.16, 0.22]}
        />

        {/* 8. Articulated Mandible / Lower Jaw Pivot Group (F15) */}
        <group ref={mandiblePivotRef} position={[0, -0.14, -0.05]}>
          <mesh
            geometry={geos.mandible}
            material={brassMaterial}
            position={[0, -0.22, 0.17]}
          />
        </group>

        {/* 9. Obsidian Backing Interior Shell */}
        <mesh
          geometry={geos.backing}
          material={obsidianMaterial}
          position={[0, 0.1, -0.1]}
        />
      </group>
    </group>
  );
}
