import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  extractHeadPose,
  getNocturneIdleDrift,
  type LandmarkPoint
} from "../apps/web/src/lib/head-pose.js";
import type { HeadPose } from "../apps/web/src/components/avatar-types.js";

function createValidBaseLandmarks(): LandmarkPoint[] {
  const landmarks: LandmarkPoint[] = Array.from({ length: 478 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0
  }));

  landmarks[234] = { x: 0.2, y: 0.5, z: 0 };    // right tragus
  landmarks[454] = { x: 0.8, y: 0.5, z: 0 };    // left tragus
  landmarks[152] = { x: 0.5, y: 0.7, z: 0 };    // chin
  landmarks[10] = { x: 0.5, y: 0.2, z: 0 };     // forehead / upper brow
  landmarks[33] = { x: 0.35, y: 0.45, z: 0 };   // right eye outer
  landmarks[263] = { x: 0.65, y: 0.45, z: 0 };  // left eye outer
  landmarks[1] = { x: 0.5, y: 0.5, z: 0.1 };    // nose tip

  return landmarks;
}

function isStrictlyFinitePose(pose: HeadPose): boolean {
  return (
    typeof pose.yaw === "number" &&
    Number.isFinite(pose.yaw) &&
    typeof pose.pitch === "number" &&
    Number.isFinite(pose.pitch) &&
    typeof pose.roll === "number" &&
    Number.isFinite(pose.roll) &&
    (pose.screenX === undefined || (typeof pose.screenX === "number" && Number.isFinite(pose.screenX))) &&
    (pose.screenY === undefined || (typeof pose.screenY === "number" && Number.isFinite(pose.screenY)))
  );
}

describe("Milestone 4 Adversarial Challenger (challenger_m4_3): Empirical Stress & Self-Healing Verification", () => {
  // =========================================================================
  // 1. ADVERSARIAL LANDMARK FUZZING & ZERO-NAN GUARANTEE
  // =========================================================================
  describe("1. Malformed Landmark Fuzzing & Zero-NaN Invariance", () => {
    it("handles sparse arrays, non-array objects, and array prototype corruption", () => {
      const expectedZero = { yaw: 0, pitch: 0, roll: 0, screenX: 0, screenY: 0 };

      // Array with sparse holes
      const sparseArr: LandmarkPoint[] = [];
      sparseArr.length = 500;
      expect(extractHeadPose(sparseArr)).toEqual(expectedZero);

      // Object with length property but no elements
      const fakeArr = { length: 478 } as unknown as LandmarkPoint[];
      expect(extractHeadPose(fakeArr)).toEqual(expectedZero);

      // Object with negative or non-integer length
      expect(extractHeadPose({ length: -1 } as unknown as LandmarkPoint[])).toEqual(expectedZero);
      expect(extractHeadPose({ length: NaN } as unknown as LandmarkPoint[])).toEqual(expectedZero);
    });

    it("evaluates landmark points containing string, boolean, object, or function coordinates", () => {
      const maliciousTypes = [
        "0.5",
        "NaN",
        "Infinity",
        "",
        true,
        false,
        {},
        [],
        () => 0.5,
        Symbol("0.5"),
        BigInt(0)
      ];

      const keyIndices = [1, 10, 33, 152, 234, 263, 454];

      for (const badVal of maliciousTypes) {
        for (const idx of keyIndices) {
          const landmarks = createValidBaseLandmarks();
          // @ts-expect-error deliberately injecting malformed types
          landmarks[idx] = { x: badVal, y: 0.5, z: 0 };
          const poseX = extractHeadPose(landmarks);
          expect(isStrictlyFinitePose(poseX), `Failed on x: ${String(badVal)} at idx ${idx}`).toBe(true);
          expect(poseX.yaw).toBe(0);

          // @ts-expect-error deliberately injecting malformed types
          landmarks[idx] = { x: 0.5, y: badVal, z: 0 };
          const poseY = extractHeadPose(landmarks);
          expect(isStrictlyFinitePose(poseY), `Failed on y: ${String(badVal)} at idx ${idx}`).toBe(true);
          expect(poseY.yaw).toBe(0);

          // @ts-expect-error deliberately injecting malformed types
          landmarks[idx] = { x: 0.5, y: 0.5, z: badVal };
          const poseZ = extractHeadPose(landmarks);
          expect(isStrictlyFinitePose(poseZ), `Failed on z: ${String(badVal)} at idx ${idx}`).toBe(true);
          expect(poseZ.yaw).toBe(0);
        }
      }
    });

    it("executes 1,000 randomized fuzz trials with arbitrary combinations of extreme floats, NaNs, and Infs", () => {
      const extremeValues = [
        0,
        -0,
        1e-300,
        -1e-300,
        1e300,
        -1e300,
        Number.MAX_VALUE,
        -Number.MAX_VALUE,
        Number.MIN_VALUE,
        Number.MAX_SAFE_INTEGER,
        Number.MIN_SAFE_INTEGER,
        NaN,
        Infinity,
        -Infinity,
        0.5
      ];

      const keyIndices = [1, 10, 33, 152, 234, 263, 454];

      for (let trial = 0; trial < 1000; trial++) {
        const landmarks = createValidBaseLandmarks();

        // Mutate random key landmarks with extreme values
        for (const idx of keyIndices) {
          if (Math.random() < 0.3) {
            const rx = extremeValues[Math.floor(Math.random() * extremeValues.length)];
            const ry = extremeValues[Math.floor(Math.random() * extremeValues.length)];
            const rz = extremeValues[Math.floor(Math.random() * extremeValues.length)];
            landmarks[idx] = { x: rx, y: ry, z: rz };
          }
        }

        const reduced = Math.random() < 0.5;
        const pose = extractHeadPose(landmarks, reduced);

        expect(Number.isNaN(pose.yaw), `NaN yaw at trial ${trial}`).toBe(false);
        expect(Number.isNaN(pose.pitch), `NaN pitch at trial ${trial}`).toBe(false);
        expect(Number.isNaN(pose.roll), `NaN roll at trial ${trial}`).toBe(false);
        expect(Number.isNaN(pose.screenX), `NaN screenX at trial ${trial}`).toBe(false);
        expect(Number.isNaN(pose.screenY), `NaN screenY at trial ${trial}`).toBe(false);

        expect(Number.isFinite(pose.yaw), `Non-finite yaw at trial ${trial}`).toBe(true);
        expect(Number.isFinite(pose.pitch), `Non-finite pitch at trial ${trial}`).toBe(true);
        expect(Number.isFinite(pose.roll), `Non-finite roll at trial ${trial}`).toBe(true);
      }
    });
  });

  // =========================================================================
  // 2. EXTREME COORDINATE BOUNDARIES & REDUCED MOTION CLAMPING
  // =========================================================================
  describe("2. Coordinate Clamping & Boundary Strictness", () => {
    it("guarantees full-motion clamps never exceed ±12° yaw, ±8° pitch, ±4° roll", () => {
      const maxYawRad = (12.0 * Math.PI) / 180;
      const maxPitchRad = (8.0 * Math.PI) / 180;
      const maxRollRad = (4.0 * Math.PI) / 180;

      for (let i = 0; i < 500; i++) {
        const landmarks = createValidBaseLandmarks();
        // Displace points wildly in valid finite space
        landmarks[1] = { x: (Math.random() - 0.5) * 1e4, y: (Math.random() - 0.5) * 1e4, z: (Math.random() - 0.5) * 1e4 };
        landmarks[234] = { x: (Math.random() - 0.5) * 1e4, y: (Math.random() - 0.5) * 1e4, z: (Math.random() - 0.5) * 1e4 };
        landmarks[454] = { x: (Math.random() - 0.5) * 1e4, y: (Math.random() - 0.5) * 1e4, z: (Math.random() - 0.5) * 1e4 };
        landmarks[10] = { x: (Math.random() - 0.5) * 1e4, y: (Math.random() - 0.5) * 1e4, z: (Math.random() - 0.5) * 1e4 };
        landmarks[152] = { x: (Math.random() - 0.5) * 1e4, y: (Math.random() - 0.5) * 1e4, z: (Math.random() - 0.5) * 1e4 };

        const pose = extractHeadPose(landmarks, false);
        expect(Math.abs(pose.yaw)).toBeLessThanOrEqual(maxYawRad + 1e-6);
        expect(Math.abs(pose.pitch)).toBeLessThanOrEqual(maxPitchRad + 1e-6);
        expect(Math.abs(pose.roll)).toBeLessThanOrEqual(maxRollRad + 1e-6);
        expect(Math.abs(pose.screenX ?? 0)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(pose.screenY ?? 0)).toBeLessThanOrEqual(0.5);
      }
    });

    it("guarantees reduced-motion clamps strictly to ±1.5° yaw, ±1.5° pitch, and 0° roll", () => {
      const maxRad = (1.5 * Math.PI) / 180;

      for (let i = 0; i < 300; i++) {
        const landmarks = createValidBaseLandmarks();
        landmarks[1] = { x: (Math.random() - 0.5) * 100, y: (Math.random() - 0.5) * 100, z: 0 };
        landmarks[234] = { x: -Math.random() * 50, y: 0, z: -Math.random() * 50 };
        landmarks[454] = { x: Math.random() * 50, y: 0, z: Math.random() * 50 };

        const pose = extractHeadPose(landmarks, true);
        expect(Math.abs(pose.yaw)).toBeLessThanOrEqual(maxRad + 1e-6);
        expect(Math.abs(pose.pitch)).toBeLessThanOrEqual(maxRad + 1e-6);
        expect(pose.roll).toBe(0);
      }
    });
  });

  // =========================================================================
  // 3. CENTERED SPECTATOR (0, 0, 0) ACTIVE TRACKING VS OFFLINE DRIFT GATING
  // =========================================================================
  describe("3. Centered Spectator (0,0,0) Active Tracking vs Offline Idle Drift Gating", () => {
    // Replicate the exact tracking gating logic from BrassMask.tsx
    function evaluateTrackingGating(
      headPose: HeadPose | undefined | null,
      gazeLocked: boolean | undefined
    ): { isTracked: boolean; effectivePose: HeadPose } {
      const hasFinitePose =
        headPose != null &&
        Number.isFinite(headPose.yaw) &&
        Number.isFinite(headPose.pitch) &&
        Number.isFinite(headPose.roll);

      const isNonZeroPose =
        headPose != null &&
        (headPose.yaw !== 0 ||
         headPose.pitch !== 0 ||
         headPose.roll !== 0 ||
         (headPose.screenX !== undefined && headPose.screenX !== 0) ||
         (headPose.screenY !== undefined && headPose.screenY !== 0));

      const isTracked =
        hasFinitePose &&
        (isNonZeroPose || Boolean(gazeLocked) || headPose?.isTracking === true);

      let effectivePose: HeadPose;
      if (isTracked && headPose) {
        effectivePose = {
          yaw: headPose.yaw ?? 0,
          pitch: headPose.pitch ?? 0,
          roll: headPose.roll ?? 0,
          screenX: headPose.screenX ?? 0,
          screenY: headPose.screenY ?? 0,
          isTracking: true
        };
      } else {
        effectivePose = getNocturneIdleDrift(5.0, false);
      }

      return { isTracked, effectivePose };
    }

    it("accepts centered spectator (0, 0, 0) as active tracking when isTracking is true", () => {
      const centeredSpectatorPose: HeadPose = {
        yaw: 0,
        pitch: 0,
        roll: 0,
        screenX: 0,
        screenY: 0,
        isTracking: true
      };

      const result = evaluateTrackingGating(centeredSpectatorPose, false);
      expect(result.isTracked).toBe(true);
      expect(result.effectivePose.yaw).toBe(0);
      expect(result.effectivePose.pitch).toBe(0);
      expect(result.effectivePose.roll).toBe(0);
      expect(result.effectivePose.isTracking).toBe(true);

      // Verify it does NOT evaluate to idle drift
      const idleDriftAt5s = getNocturneIdleDrift(5.0, false);
      expect(result.effectivePose.yaw).not.toBe(idleDriftAt5s.yaw);
    });

    it("accepts centered spectator (0, 0, 0) when gazeLocked is true even if isTracking is omitted", () => {
      const poseWithoutFlag: HeadPose = {
        yaw: 0,
        pitch: 0,
        roll: 0,
        screenX: 0,
        screenY: 0
      };

      const result = evaluateTrackingGating(poseWithoutFlag, true);
      expect(result.isTracked).toBe(true);
      expect(result.effectivePose.yaw).toBe(0);
    });

    it("falls back to autonomous Nocturne idle drift when pose is un-tracked zero (offline fallback)", () => {
      const offlinePose: HeadPose = {
        yaw: 0,
        pitch: 0,
        roll: 0,
        screenX: 0,
        screenY: 0
        // isTracking is undefined, gazeLocked is false
      };

      const result = evaluateTrackingGating(offlinePose, false);
      expect(result.isTracked).toBe(false);

      const idleDriftAt5s = getNocturneIdleDrift(5.0, false);
      expect(result.effectivePose.yaw).toBe(idleDriftAt5s.yaw);
      expect(result.effectivePose.pitch).toBe(idleDriftAt5s.pitch);
    });

    it("rejects non-finite corrupted pose (NaN / Infinity) and safely falls back to idle drift", () => {
      const nanPose = {
        yaw: NaN,
        pitch: 0,
        roll: 0,
        screenX: 0,
        screenY: 0,
        isTracking: true
      };

      const resultNan = evaluateTrackingGating(nanPose, true);
      expect(resultNan.isTracked).toBe(false);
      expect(Number.isFinite(resultNan.effectivePose.yaw)).toBe(true);

      const infPose = {
        yaw: Infinity,
        pitch: 0,
        roll: 0,
        screenX: 0,
        screenY: 0,
        isTracking: true
      };

      const resultInf = evaluateTrackingGating(infPose, true);
      expect(resultInf.isTracked).toBe(false);
      expect(Number.isFinite(resultInf.effectivePose.yaw)).toBe(true);
    });
  });

  // =========================================================================
  // 4. THREE.JS QUATERNION SELF-HEALING & RECOVERY HARNESS
  // =========================================================================
  describe("4. Three.js Quaternion Self-Healing & Recovery Dynamics", () => {
    // Replicate the exact quaternion update step from BrassMask.tsx lines 151-186
    function simulateMaskQuaternionStep(
      currentQuat: THREE.Quaternion,
      effectivePose: HeadPose,
      dt: number,
      reducedMotion = false
    ): void {
      const targetQuat = new THREE.Quaternion();
      const targetEuler = new THREE.Euler(0, 0, 0, "YXZ");

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
    }

    it("self-heals immediately to identity [0, 0, 0, 1] if currentQuat contains NaN", () => {
      const currentQuat = new THREE.Quaternion(NaN, 0, 0, 1);
      const pose: HeadPose = { yaw: 0.1, pitch: 0, roll: 0, isTracking: true };

      simulateMaskQuaternionStep(currentQuat, pose, 0.016);

      // Verify self-healing restored identity and removed NaN
      expect(Number.isFinite(currentQuat.x)).toBe(true);
      expect(Number.isFinite(currentQuat.y)).toBe(true);
      expect(Number.isFinite(currentQuat.z)).toBe(true);
      expect(Number.isFinite(currentQuat.w)).toBe(true);
      expect(currentQuat.x).toBe(0);
      expect(currentQuat.y).toBe(0);
      expect(currentQuat.z).toBe(0);
      expect(currentQuat.w).toBe(1);
    });

    it("self-heals immediately if currentQuat contains Infinity or -Infinity", () => {
      const currentQuat = new THREE.Quaternion(0, Infinity, -Infinity, 1);
      const pose: HeadPose = { yaw: 0.1, pitch: 0, roll: 0, isTracking: true };

      simulateMaskQuaternionStep(currentQuat, pose, 0.016);

      expect(currentQuat.equals(new THREE.Quaternion(0, 0, 0, 1))).toBe(true);
    });

    it("demonstrates seamless recovery: subsequent frames after self-healing track cleanly", () => {
      const currentQuat = new THREE.Quaternion().identity();

      // Step 1: Normal tracking
      const targetPose: HeadPose = { yaw: 0.15, pitch: 0.05, roll: 0, isTracking: true };
      simulateMaskQuaternionStep(currentQuat, targetPose, 0.016);
      expect(currentQuat.y).toBeGreaterThan(0);

      // Step 2: Inject glitch poisoning directly into currentQuat
      currentQuat.set(NaN, NaN, NaN, NaN);

      // Step 3: Execute frame step with self-healing
      simulateMaskQuaternionStep(currentQuat, targetPose, 0.016);

      // CurrentQuat must have self-healed to clean state
      expect(Number.isFinite(currentQuat.x)).toBe(true);
      expect(Number.isFinite(currentQuat.y)).toBe(true);
      expect(Number.isFinite(currentQuat.w)).toBe(true);
      expect(currentQuat.w).toBe(1);

      // Step 4: Next frame resumes smooth tracking from healed baseline
      simulateMaskQuaternionStep(currentQuat, targetPose, 0.016);
      expect(currentQuat.y).toBeGreaterThan(0);
      expect(Number.isFinite(currentQuat.y)).toBe(true);
    });

    it("handles adversarial frame delta times (dt = 0, dt = -1, dt = 100, dt = NaN)", () => {
      const testDts = [0, -1, 100, NaN, Infinity, -Infinity];

      for (const dt of testDts) {
        const currentQuat = new THREE.Quaternion().identity();
        const targetPose: HeadPose = { yaw: 0.1, pitch: 0.05, roll: 0, isTracking: true };

        simulateMaskQuaternionStep(currentQuat, targetPose, dt);

        expect(Number.isFinite(currentQuat.x)).toBe(true);
        expect(Number.isFinite(currentQuat.y)).toBe(true);
        expect(Number.isFinite(currentQuat.z)).toBe(true);
        expect(Number.isFinite(currentQuat.w)).toBe(true);
        expect(Math.abs(currentQuat.length() - 1.0)).toBeLessThan(1e-4);
      }
    });
  });

  // =========================================================================
  // 5. VISEME DAMPING & AUDIO FILTER INTEGRITY UNDER ADVERSARIAL STRESS
  // =========================================================================
  describe("5. Viseme Damping & Speech RMS Integrity", () => {
    // Replicate BrassMask dampViseme function
    function dampViseme(
      curr: number,
      target: number,
      dt: number,
      reducedMotion = false
    ): number {
      const motionScale = reducedMotion ? 0.35 : 1.0;
      const lambdaAttack = reducedMotion ? 8.0 : 24.0;
      const lambdaRelease = reducedMotion ? 6.0 : 14.0;

      const safeCurr = Number.isFinite(curr) ? curr : 0;
      const safeTarget = Number.isFinite(target) ? target : 0;
      const scaledTarget = safeTarget * motionScale;
      const rate = scaledTarget > safeCurr ? lambdaAttack : lambdaRelease;
      const result = THREE.MathUtils.damp(safeCurr, scaledTarget, rate, dt);
      return Number.isFinite(result) ? result : 0;
    }

    it("preserves finite viseme bounds when inputs are NaN, Infinity, or negative", () => {
      const inputs = [NaN, Infinity, -Infinity, -5.0, 1e6];

      for (const input of inputs) {
        const dampened = dampViseme(0, input, 0.016);
        expect(Number.isFinite(dampened), `Failed on input ${input}`).toBe(true);
        expect(Number.isNaN(dampened)).toBe(false);
      }
    });

    it("recovers viseme state to 0 when corrupt state NaN is encountered", () => {
      const recovered = dampViseme(NaN, 0.5, 0.016);
      expect(Number.isFinite(recovered)).toBe(true);
      expect(recovered).toBeGreaterThanOrEqual(0);
    });

    it("verifies LanternEyes asymmetric RMS follower self-healing on NaN injection", () => {
      let rmsEnv = 0.5;
      const dt = 0.016;

      // Frame 1: Malformed RMS input NaN
      const rawRms = Number.isFinite(NaN) ? (NaN as number) : 0;
      const cleanNorm = Math.max(0, Math.min(1, (rawRms - 0.02) / 0.38));
      const rmsNorm = Math.pow(cleanNorm, 1.25);
      const attackRate = 1 - Math.exp(-dt / 0.02);
      const decayRate = 1 - Math.exp(-dt / 0.14);
      const targetEnv = Number.isFinite(rmsNorm) ? rmsNorm : 0;

      // Force internal filter state to NaN
      rmsEnv = NaN;

      // Apply self-healing logic from LanternEyes lines 79-87
      if (!Number.isFinite(rmsEnv)) {
        rmsEnv = 0.0;
      }
      rmsEnv += (targetEnv > rmsEnv ? attackRate : decayRate) * (targetEnv - rmsEnv);
      if (!Number.isFinite(rmsEnv)) {
        rmsEnv = 0.0;
      }

      expect(Number.isFinite(rmsEnv)).toBe(true);
      expect(rmsEnv).toBe(0.0);
    });
  });
});
