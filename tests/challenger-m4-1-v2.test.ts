import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  extractHeadPose,
  getNocturneIdleDrift,
  type LandmarkPoint
} from "../apps/web/src/lib/head-pose.js";
import type { HeadPose } from "../apps/web/src/components/avatar-types.js";

function createBaseLandmarks(): LandmarkPoint[] {
  const landmarks: LandmarkPoint[] = Array.from({ length: 478 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0
  }));

  landmarks[234] = { x: 0.2, y: 0.5, z: 0 };    // right tragus
  landmarks[454] = { x: 0.8, y: 0.5, z: 0 };    // left tragus
  landmarks[152] = { x: 0.5, y: 0.7, z: 0 };    // chin
  landmarks[10] = { x: 0.5, y: 0.2, z: 0 };     // forehead / brow
  landmarks[33] = { x: 0.35, y: 0.45, z: 0 };   // right eye outer
  landmarks[263] = { x: 0.65, y: 0.45, z: 0 };  // left eye outer
  landmarks[1] = { x: 0.5, y: 0.5, z: 0.1 };    // nose tip

  return landmarks;
}

describe("Milestone 4 Adversarial Challenger 1 v2: Mathematical Stability & Head Pose Fuzzing", () => {
  // =========================================================================
  // 1. TRUNCATION, SPARSE & MALFORMED INPUT FUZZING
  // =========================================================================
  describe("1. Truncation, Sparse & Malformed Input Handling", () => {
    it("returns strictly zero pose on null, undefined, and empty array", () => {
      const expectedZero = { yaw: 0, pitch: 0, roll: 0, screenX: 0, screenY: 0 };
      expect(extractHeadPose(null)).toEqual(expectedZero);
      expect(extractHeadPose(undefined)).toEqual(expectedZero);
      expect(extractHeadPose([])).toEqual(expectedZero);
    });

    it("returns zero pose on arrays below 400 elements or with missing tragus (454)", () => {
      const expectedZero = { yaw: 0, pitch: 0, roll: 0, screenX: 0, screenY: 0 };
      expect(extractHeadPose(new Array(0))).toEqual(expectedZero);
      expect(extractHeadPose(new Array(100))).toEqual(expectedZero);
      expect(extractHeadPose(new Array(399))).toEqual(expectedZero);
      // Array of length 450 has length >= 400, but index 454 is out of bounds
      const arr450 = Array.from({ length: 450 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
      expect(extractHeadPose(arr450)).toEqual(expectedZero);
    });

    it("returns zero pose when any critical landmark index is missing or null", () => {
      const expectedZero = { yaw: 0, pitch: 0, roll: 0, screenX: 0, screenY: 0 };
      const indices = [1, 10, 33, 152, 234, 263, 454];

      for (const idx of indices) {
        const landmarks = createBaseLandmarks();
        // @ts-expect-error testing undefined landmark point
        landmarks[idx] = undefined;
        expect(extractHeadPose(landmarks), `Missing landmark ${idx} should return zero`).toEqual(
          expectedZero
        );

        const landmarksNull = createBaseLandmarks();
        // @ts-expect-error testing null landmark point
        landmarksNull[idx] = null;
        expect(extractHeadPose(landmarksNull), `Null landmark ${idx} should return zero`).toEqual(
          expectedZero
        );
      }
    });

    it("sanitizes landmark objects missing x or y coordinates and returns safe zero pose", () => {
      const landmarks = createBaseLandmarks();
      // @ts-expect-error testing malformed point
      landmarks[1] = {}; // missing x and y
      const pose = extractHeadPose(landmarks);
      expect(Number.isFinite(pose.yaw) && Number.isFinite(pose.pitch) && Number.isFinite(pose.screenX)).toBe(true);
      expect(pose.yaw).toBe(0);
    });
  });

  // =========================================================================
  // 2. EXTREME COORDINATES & NON-FINITE NUMBERS (NAN / INFINITY)
  // =========================================================================
  describe("2. Extreme Coordinates & Non-Finite Numbers", () => {
    it("handles extreme coordinate values (±1000, ±1e6) without breaking clamp", () => {
      const landmarks = createBaseLandmarks();
      landmarks[1] = { x: 1000, y: -1000, z: 500 };
      landmarks[234] = { x: -10000, y: 0, z: -5000 };
      landmarks[454] = { x: 10000, y: 0, z: 5000 };

      const pose = extractHeadPose(landmarks, false);
      const maxYaw = (12.0 * Math.PI) / 180;
      const maxPitch = (8.0 * Math.PI) / 180;
      const maxRoll = (4.0 * Math.PI) / 180;

      expect(Math.abs(pose.yaw)).toBeLessThanOrEqual(maxYaw + 1e-5);
      expect(Math.abs(pose.pitch)).toBeLessThanOrEqual(maxPitch + 1e-5);
      expect(Math.abs(pose.roll)).toBeLessThanOrEqual(maxRoll + 1e-5);
      expect(Math.abs(pose.screenX ?? 0)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(pose.screenY ?? 0)).toBeLessThanOrEqual(0.5);
    });

    it("sanitizes NaN coordinates and returns safe zero pose", () => {
      const landmarks = createBaseLandmarks();
      landmarks[1] = { x: NaN, y: 0.5, z: 0 };
      const pose = extractHeadPose(landmarks, false);
      expect(Number.isNaN(pose.screenX)).toBe(false);
      expect(Number.isNaN(pose.yaw)).toBe(false);
      expect(pose.yaw).toBe(0);
    });

    it("sanitizes Infinity - Infinity producing zero pose rather than NaN", () => {
      const landmarks = createBaseLandmarks();
      landmarks[454] = { x: Infinity, y: 0.5, z: 0 };
      landmarks[234] = { x: Infinity, y: 0.5, z: 0 }; // Infinity - Infinity = NaN
      const pose = extractHeadPose(landmarks, false);
      expect(Number.isNaN(pose.yaw)).toBe(false);
      expect(pose.yaw).toBe(0);
    });

    it("handles degenerate geometric configurations (dx=0, dy=0, identical points) safely", () => {
      const landmarks = createBaseLandmarks();
      landmarks[234] = { x: 0.5, y: 0.5, z: 0 };
      landmarks[454] = { x: 0.5, y: 0.5, z: 0 };
      landmarks[10] = { x: 0.5, y: 0.5, z: 0 };
      landmarks[152] = { x: 0.5, y: 0.5, z: 0 };
      landmarks[33] = { x: 0.5, y: 0.5, z: 0 };
      landmarks[263] = { x: 0.5, y: 0.5, z: 0 };

      const pose = extractHeadPose(landmarks, false);
      expect(Number.isFinite(pose.yaw)).toBe(true);
      expect(Number.isFinite(pose.pitch)).toBe(true);
      expect(Number.isFinite(pose.roll)).toBe(true);
    });
  });

  // =========================================================================
  // 3. STRICT ANGLE CLAMPING BOUNDARIES
  // =========================================================================
  describe("3. Strict Angle Clamping Boundaries", () => {
    it("guarantees yaw is strictly in [-12°, +12°] across 500 randomized orientations", () => {
      const maxYawRad = (12.0 * Math.PI) / 180;

      for (let i = 0; i < 500; i++) {
        const landmarks = createBaseLandmarks();
        landmarks[1] = {
          x: (Math.random() - 0.5) * 20,
          y: (Math.random() - 0.5) * 20,
          z: (Math.random() - 0.5) * 20
        };
        landmarks[234] = {
          x: (Math.random() - 0.5) * 20,
          y: (Math.random() - 0.5) * 20,
          z: (Math.random() - 0.5) * 20
        };
        landmarks[454] = {
          x: (Math.random() - 0.5) * 20,
          y: (Math.random() - 0.5) * 20,
          z: (Math.random() - 0.5) * 20
        };

        const pose = extractHeadPose(landmarks, false);
        if (Number.isFinite(pose.yaw)) {
          expect(pose.yaw).toBeLessThanOrEqual(maxYawRad + 1e-6);
          expect(pose.yaw).toBeGreaterThanOrEqual(-maxYawRad - 1e-6);
        }
      }
    });

    it("guarantees pitch is strictly in [-8°, +8°] across 500 randomized orientations", () => {
      const maxPitchRad = (8.0 * Math.PI) / 180;

      for (let i = 0; i < 500; i++) {
        const landmarks = createBaseLandmarks();
        landmarks[10] = {
          x: (Math.random() - 0.5) * 20,
          y: (Math.random() - 0.5) * 20,
          z: (Math.random() - 0.5) * 20
        };
        landmarks[152] = {
          x: (Math.random() - 0.5) * 20,
          y: (Math.random() - 0.5) * 20,
          z: (Math.random() - 0.5) * 20
        };

        const pose = extractHeadPose(landmarks, false);
        if (Number.isFinite(pose.pitch)) {
          expect(pose.pitch).toBeLessThanOrEqual(maxPitchRad + 1e-6);
          expect(pose.pitch).toBeGreaterThanOrEqual(-maxPitchRad - 1e-6);
        }
      }
    });

    it("guarantees reducedMotion clamps strictly to ±1.5° yaw/pitch and 0° roll", () => {
      const maxRad = (1.5 * Math.PI) / 180;

      for (let i = 0; i < 200; i++) {
        const landmarks = createBaseLandmarks();
        landmarks[1] = { x: Math.random() * 4 - 2, y: Math.random() * 4 - 2, z: 0 };
        landmarks[234] = { x: -Math.random() * 10, y: 0, z: -Math.random() * 10 };
        landmarks[454] = { x: Math.random() * 10, y: 0, z: Math.random() * 10 };

        const pose = extractHeadPose(landmarks, true);
        if (Number.isFinite(pose.yaw) && Number.isFinite(pose.pitch)) {
          expect(Math.abs(pose.yaw)).toBeLessThanOrEqual(maxRad + 1e-6);
          expect(Math.abs(pose.pitch)).toBeLessThanOrEqual(maxRad + 1e-6);
          expect(pose.roll).toBe(0);
        }
      }
    });
  });

  // =========================================================================
  // 4. 10,000s NOCTURNE IDLE DRIFT CONTINUITY & BOUNDS
  // =========================================================================
  describe("4. 10,000s Nocturne Idle Drift Continuity & Stability", () => {
    it("maintains smooth, bounded drift over 10,000 simulated seconds with zero NaN", () => {
      const maxDriftRad = (4.5 * Math.PI) / 180;
      let prevYaw = 0;
      let prevPitch = 0;
      let prevRoll = 0;

      // Sample every 0.5s over 10,000s (20,000 evaluations)
      for (let t = 0; t <= 10000; t += 0.5) {
        const drift = getNocturneIdleDrift(t, false);

        expect(Number.isFinite(drift.yaw), `NaN at t=${t}`).toBe(true);
        expect(Number.isFinite(drift.pitch), `NaN at t=${t}`).toBe(true);
        expect(Number.isFinite(drift.roll), `NaN at t=${t}`).toBe(true);

        expect(Math.abs(drift.yaw)).toBeLessThanOrEqual(maxDriftRad);
        expect(Math.abs(drift.pitch)).toBeLessThanOrEqual(maxDriftRad);
        expect(Math.abs(drift.roll)).toBeLessThanOrEqual(maxDriftRad);

        if (t > 0) {
          const dYaw = Math.abs(drift.yaw - prevYaw);
          const dPitch = Math.abs(drift.pitch - prevPitch);
          const dRoll = Math.abs(drift.roll - prevRoll);
          expect(dYaw).toBeLessThan(0.03); // smooth derivative
          expect(dPitch).toBeLessThan(0.03);
          expect(dRoll).toBeLessThan(0.02);
        }

        prevYaw = drift.yaw;
        prevPitch = drift.pitch;
        prevRoll = drift.roll;
      }
    });

    it("returns strictly zero across all times when reducedMotion is true", () => {
      const timeSamples = [0, 0.5, 1, 10, 100, 500, 1000, 5000, 10000];
      for (const t of timeSamples) {
        const drift = getNocturneIdleDrift(t, true);
        expect(drift).toEqual({ yaw: 0, pitch: 0, roll: 0, screenX: 0, screenY: 0 });
      }
    });
  });

  // =========================================================================
  // 5. QUATERNION SLERP & ARCHITECTURAL VULNERABILITY ANALYSIS
  // =========================================================================
  describe("5. Quaternion Slerp & Abrupt Head Turn Singularity", () => {
    it("handles 180° abrupt turns smoothly without gimbal lock or NaN", () => {
      const currentQuat = new THREE.Quaternion().identity();
      const targetQuat = new THREE.Quaternion();
      const targetEuler = new THREE.Euler(0, 0, 0, "YXZ");

      targetEuler.set(0, Math.PI, 0, "YXZ");
      targetQuat.setFromEuler(targetEuler);

      expect(Math.abs(targetQuat.length() - 1.0)).toBeLessThan(1e-5);

      const dt = 0.016;
      const slerpFactor = 1 - Math.exp(-4.8 * dt);

      currentQuat.slerp(targetQuat, slerpFactor);

      expect(Number.isFinite(currentQuat.x)).toBe(true);
      expect(Number.isFinite(currentQuat.y)).toBe(true);
      expect(Number.isFinite(currentQuat.z)).toBe(true);
      expect(Number.isFinite(currentQuat.w)).toBe(true);
      expect(Math.abs(currentQuat.length() - 1.0)).toBeLessThan(1e-4);
    });

    it("verifies antipodal quaternions take the shortest arc without flipping", () => {
      const q1 = new THREE.Quaternion(0, 0.1, 0, 0.995).normalize();
      const q2 = new THREE.Quaternion(0, -0.1, 0, -0.995).normalize();

      const initialDot = q1.dot(q2);
      expect(initialDot).toBeLessThan(-0.99);

      const qInterp = q1.clone().slerp(q2, 0.5);

      expect(Number.isFinite(qInterp.x)).toBe(true);
      expect(Number.isFinite(qInterp.y)).toBe(true);
      expect(Number.isFinite(qInterp.z)).toBe(true);
      expect(Number.isFinite(qInterp.w)).toBe(true);
    });

    it("vulnerability demonstration: catastrophic unrecoverable quaternion poisoning from NaN", () => {
      const currentQuat = new THREE.Quaternion().identity();
      const targetQuat = new THREE.Quaternion();
      const targetEuler = new THREE.Euler(0, 0, 0, "YXZ");

      // Frame 1: Glitch frame injects NaN pose into target
      const nanPose = { yaw: NaN, pitch: 0, roll: 0, screenX: 0, screenY: 0 };
      targetEuler.set(nanPose.pitch, nanPose.yaw, nanPose.roll, "YXZ");
      targetQuat.setFromEuler(targetEuler);

      const dt = 0.016;
      const slerpFactor = 1 - Math.exp(-4.8 * dt);
      currentQuat.slerp(targetQuat, slerpFactor);

      // Verify currentQuat is corrupted
      expect(Number.isNaN(currentQuat.x) || Number.isNaN(currentQuat.y) || Number.isNaN(currentQuat.w)).toBe(true);

      // Frame 2: Stream returns to normal, providing clean target
      const validTargetEuler = new THREE.Euler(0, 0.1, 0, "YXZ");
      const validTargetQuat = new THREE.Quaternion().setFromEuler(validTargetEuler);
      currentQuat.slerp(validTargetQuat, slerpFactor);

      // CRITICAL PROOF: currentQuat CANNOT recover from NaN; it remains poisoned permanently
      expect(Number.isNaN(currentQuat.w)).toBe(true);
    });

    it("BrassMask active tracking condition rejects NaN and accepts true zero pose when actively tracked", () => {
      // Case A: Spectator actively tracked front-and-center
      const trackedZeroPose: HeadPose = { yaw: 0, pitch: 0, roll: 0, screenX: 0, screenY: 0, isTracking: true };
      const isTrackedZero = Boolean(
        trackedZeroPose &&
        Number.isFinite(trackedZeroPose.yaw) &&
        (trackedZeroPose.yaw !== 0 || trackedZeroPose.isTracking === true)
      );
      expect(isTrackedZero).toBe(true);

      // Case B: Corrupted pose containing NaN
      const nanPose = { yaw: NaN, pitch: 0, roll: 0, screenX: 0, screenY: 0 };
      const isNanTracked = Boolean(
        nanPose &&
        Number.isFinite(nanPose.yaw) &&
        (nanPose.yaw !== 0 || nanPose.pitch !== 0)
      );
      expect(isNanTracked).toBe(false);
    });
  });
});
