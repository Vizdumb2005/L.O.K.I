import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  extractHeadPose,
  getNocturneIdleDrift,
  type LandmarkPoint
} from "../apps/web/src/lib/head-pose.js";

function createBaseLandmarks(): LandmarkPoint[] {
  const landmarks: LandmarkPoint[] = Array.from({ length: 478 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0
  }));

  // Canonical neutral landmarks
  landmarks[234] = { x: 0.2, y: 0.5, z: 0 };    // right tragus
  landmarks[454] = { x: 0.8, y: 0.5, z: 0 };    // left tragus
  landmarks[152] = { x: 0.5, y: 0.7, z: 0 };    // chin
  landmarks[10] = { x: 0.5, y: 0.2, z: 0 };     // forehead
  landmarks[33] = { x: 0.35, y: 0.45, z: 0 };   // right eye outer
  landmarks[263] = { x: 0.65, y: 0.45, z: 0 };  // left eye outer
  landmarks[1] = { x: 0.5, y: 0.5, z: 0.1 };    // nose tip

  return landmarks;
}

describe("Milestone 4 Adversarial Challenger 1: Empirical Verification", () => {
  // =========================================================================
  // 1. TRUNCATION & MALFORMED INPUT FUZZING
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
        // @ts-expect-error testing undefined/null
        landmarks[idx] = undefined;
        expect(extractHeadPose(landmarks), `Missing landmark ${idx} should return zero`).toEqual(
          expectedZero
        );

        const landmarksNull = createBaseLandmarks();
        // @ts-expect-error testing null
        landmarksNull[idx] = null;
        expect(extractHeadPose(landmarksNull), `Null landmark ${idx} should return zero`).toEqual(
          expectedZero
        );
      }
    });

    it("evaluates behavior when landmark objects are empty or missing x/y", () => {
      const landmarks = createBaseLandmarks();
      // @ts-expect-error testing malformed point
      landmarks[1] = {}; // missing x and y
      const pose = extractHeadPose(landmarks);
      // If x is undefined, x - 0.5 is NaN. Does it propagate NaN?
      const isClean = Number.isFinite(pose.yaw) && Number.isFinite(pose.pitch) && Number.isFinite(pose.screenX);
      expect(isClean, "extractHeadPose must not return NaN when landmark point is missing coordinates").toBe(true);
    });
  });

  // =========================================================================
  // 2. EXTREME COORDINATES & NAN / INFINITY ROBUSTNESS
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

    it("evaluates behavior when coordinates contain NaN", () => {
      const landmarks = createBaseLandmarks();
      landmarks[1] = { x: NaN, y: 0.5, z: 0 };
      const pose = extractHeadPose(landmarks, false);
      const isFinitePose =
        Number.isFinite(pose.yaw) &&
        Number.isFinite(pose.pitch) &&
        Number.isFinite(pose.roll) &&
        Number.isFinite(pose.screenX) &&
        Number.isFinite(pose.screenY);

      expect(isFinitePose, "Pose must not contain NaN when nose tip coordinate is NaN").toBe(true);
    });

    it("evaluates behavior when tragus contains Infinity", () => {
      const landmarks = createBaseLandmarks();
      landmarks[454] = { x: Infinity, y: 0.5, z: 0 };
      landmarks[234] = { x: -Infinity, y: 0.5, z: 0 };
      const pose = extractHeadPose(landmarks, false);

      const isFinitePose =
        Number.isFinite(pose.yaw) &&
        Number.isFinite(pose.pitch) &&
        Number.isFinite(pose.roll);

      expect(isFinitePose, "Pose must not contain NaN when tragus has Infinite coordinate").toBe(true);
    });

    it("handles degenerate geometric configurations (dx=0, dy=0, identical points)", () => {
      const landmarks = createBaseLandmarks();
      // Tragus points identical: dx=0, dz=0
      landmarks[234] = { x: 0.5, y: 0.5, z: 0 };
      landmarks[454] = { x: 0.5, y: 0.5, z: 0 };
      // Midline points identical: dy=0, dz=0
      landmarks[10] = { x: 0.5, y: 0.5, z: 0 };
      landmarks[152] = { x: 0.5, y: 0.5, z: 0 };
      // Eyes identical: dx=0, dy=0
      landmarks[33] = { x: 0.5, y: 0.5, z: 0 };
      landmarks[263] = { x: 0.5, y: 0.5, z: 0 };

      const pose = extractHeadPose(landmarks, false);
      expect(Number.isFinite(pose.yaw)).toBe(true);
      expect(Number.isFinite(pose.pitch)).toBe(true);
      expect(Number.isFinite(pose.roll)).toBe(true);
    });
  });

  // =========================================================================
  // 3. ANGLE CLAMPING BOUNDARIES (±12° yaw, ±8° pitch, ±1.5° reducedMotion)
  // =========================================================================
  describe("3. Strict Angle Clamping Boundaries", () => {
    it("guarantees yaw is strictly in [-12°, +12°] across 200 random orientations", () => {
      const maxYawRad = (12.0 * Math.PI) / 180;

      for (let i = 0; i < 200; i++) {
        const landmarks = createBaseLandmarks();
        // Random nose position
        landmarks[1] = {
          x: (Math.random() - 0.5) * 10,
          y: (Math.random() - 0.5) * 10,
          z: (Math.random() - 0.5) * 10
        };
        // Random tragus orientation
        landmarks[234] = {
          x: (Math.random() - 0.5) * 10,
          y: (Math.random() - 0.5) * 10,
          z: (Math.random() - 0.5) * 10
        };
        landmarks[454] = {
          x: (Math.random() - 0.5) * 10,
          y: (Math.random() - 0.5) * 10,
          z: (Math.random() - 0.5) * 10
        };

        const pose = extractHeadPose(landmarks, false);
        if (Number.isFinite(pose.yaw)) {
          expect(pose.yaw).toBeLessThanOrEqual(maxYawRad + 1e-6);
          expect(pose.yaw).toBeGreaterThanOrEqual(-maxYawRad - 1e-6);
        }
      }
    });

    it("guarantees pitch is strictly in [-8°, +8°] across 200 random orientations", () => {
      const maxPitchRad = (8.0 * Math.PI) / 180;

      for (let i = 0; i < 200; i++) {
        const landmarks = createBaseLandmarks();
        landmarks[10] = {
          x: (Math.random() - 0.5) * 10,
          y: (Math.random() - 0.5) * 10,
          z: (Math.random() - 0.5) * 10
        };
        landmarks[152] = {
          x: (Math.random() - 0.5) * 10,
          y: (Math.random() - 0.5) * 10,
          z: (Math.random() - 0.5) * 10
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

      for (let i = 0; i < 100; i++) {
        const landmarks = createBaseLandmarks();
        landmarks[1] = { x: Math.random() * 2 - 0.5, y: Math.random() * 2 - 0.5, z: 0 };
        landmarks[234] = { x: -Math.random() * 5, y: 0, z: -Math.random() * 5 };
        landmarks[454] = { x: Math.random() * 5, y: 0, z: Math.random() * 5 };

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
  describe("4. 10,000s Nocturne Idle Drift Continuity", () => {
    it("maintains smooth, bounded drift over 10,000 simulated seconds with zero NaN", () => {
      const maxDriftRad = (4.5 * Math.PI) / 180; // analytical max is ~4.2 deg yaw, 2.6 deg pitch
      let prevYaw = 0;
      let prevPitch = 0;
      let prevRoll = 0;

      // Sample every 1.0 second over 10,000 seconds
      for (let t = 0; t <= 10000; t += 1.0) {
        const drift = getNocturneIdleDrift(t, false);

        expect(Number.isFinite(drift.yaw), `NaN at t=${t}`).toBe(true);
        expect(Number.isFinite(drift.pitch), `NaN at t=${t}`).toBe(true);
        expect(Number.isFinite(drift.roll), `NaN at t=${t}`).toBe(true);

        expect(Math.abs(drift.yaw)).toBeLessThanOrEqual(maxDriftRad);
        expect(Math.abs(drift.pitch)).toBeLessThanOrEqual(maxDriftRad);
        expect(Math.abs(drift.roll)).toBeLessThanOrEqual(maxDriftRad);

        // Check continuity (derivative bounded: no sudden teleportation)
        if (t > 0) {
          const dYaw = Math.abs(drift.yaw - prevYaw);
          const dPitch = Math.abs(drift.pitch - prevPitch);
          const dRoll = Math.abs(drift.roll - prevRoll);
          // With dt=1.0s, maximum analytical derivative for yaw is ~2.03 deg/s (~0.035 rad/s)
          expect(dYaw).toBeLessThan(0.06); // ~3.4 deg/s max
          expect(dPitch).toBeLessThan(0.06);
          expect(dRoll).toBeLessThan(0.03);
        }

        prevYaw = drift.yaw;
        prevPitch = drift.pitch;
        prevRoll = drift.roll;
      }
    });

    it("returns strictly zero across all times when reducedMotion is true", () => {
      const timeSamples = [0, 1, 10, 100, 500, 1000, 5000, 10000];
      for (const t of timeSamples) {
        const drift = getNocturneIdleDrift(t, true);
        expect(drift).toEqual({ yaw: 0, pitch: 0, roll: 0, screenX: 0, screenY: 0 });
      }
    });
  });

  // =========================================================================
  // 5. QUATERNION SLERP & EXTREME 180° TURN SINGULARITY
  // =========================================================================
  describe("5. Quaternion Slerp & Abrupt Head Turn Singularity", () => {
    it("handles 180° abrupt turns smoothly without gimbal lock or NaN", () => {
      const currentQuat = new THREE.Quaternion();
      const targetQuat = new THREE.Quaternion();
      const targetEuler = new THREE.Euler(0, 0, 0, "YXZ");

      // Current at neutral [0, 0, 0, 1]
      currentQuat.identity();

      // Instantaneous 180° yaw turn
      targetEuler.set(0, Math.PI, 0, "YXZ");
      targetQuat.setFromEuler(targetEuler);

      // Verify targetQuat is normalized
      expect(Math.abs(targetQuat.length() - 1.0)).toBeLessThan(1e-5);

      // Slerp step with 60fps dt (0.016s) and lambda 4.8
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
      const q2 = new THREE.Quaternion(0, -0.1, 0, -0.995).normalize(); // antipodal representation of same rotation

      const initialDot = q1.dot(q2);
      expect(initialDot).toBeLessThan(-0.99); // opposite sign

      const qInterp = q1.clone().slerp(q2, 0.5);

      // Three.js slerp inverts target when dot < 0, so rotation does not spin 360°
      expect(Number.isFinite(qInterp.x)).toBe(true);
      expect(Number.isFinite(qInterp.y)).toBe(true);
      expect(Number.isFinite(qInterp.z)).toBe(true);
      expect(Number.isFinite(qInterp.w)).toBe(true);
    });

    it("demonstrates catastrophic permanent quaternion poisoning if pose contains NaN", () => {
      const currentQuat = new THREE.Quaternion().identity();
      const targetQuat = new THREE.Quaternion();
      const targetEuler = new THREE.Euler(0, 0, 0, "YXZ");

      // Frame 1: Pose containing NaN from unvalidated landmark
      const nanPose = { yaw: NaN, pitch: 0, roll: 0, screenX: 0, screenY: 0 };
      targetEuler.set(nanPose.pitch, nanPose.yaw, nanPose.roll, "YXZ");
      targetQuat.setFromEuler(targetEuler);

      const dt = 0.016;
      const slerpFactor = 1 - Math.exp(-4.8 * dt);
      currentQuat.slerp(targetQuat, slerpFactor);

      // Verify currentQuat is now poisoned with NaN
      const isCorrupted =
        Number.isNaN(currentQuat.x) ||
        Number.isNaN(currentQuat.y) ||
        Number.isNaN(currentQuat.z) ||
        Number.isNaN(currentQuat.w);
      expect(isCorrupted).toBe(true);

      // Frame 2: Spectator landmark recovers and yields perfectly valid target
      const validTargetEuler = new THREE.Euler(0, 0.1, 0, "YXZ");
      const validTargetQuat = new THREE.Quaternion().setFromEuler(validTargetEuler);

      currentQuat.slerp(validTargetQuat, slerpFactor);

      // CRITICAL VULNERABILITY: Even after valid frames arrive, Three.js slerp CANNOT recover from NaN!
      const remainsCorrupted =
        Number.isNaN(currentQuat.x) ||
        Number.isNaN(currentQuat.y) ||
        Number.isNaN(currentQuat.z) ||
        Number.isNaN(currentQuat.w);
      expect(remainsCorrupted).toBe(true);
    });
  });
});
