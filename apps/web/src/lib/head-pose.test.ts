import { describe, expect, it } from "vitest";
import { extractHeadPose, getNocturneIdleDrift, type LandmarkPoint } from "./head-pose.js";

function createSyntheticLandmarks(
  params: {
    tragusDx?: number;
    tragusDz?: number;
    midlineDy?: number;
    midlineDz?: number;
    noseX?: number;
    noseY?: number;
    eyesDy?: number;
  } = {}
): LandmarkPoint[] {
  const landmarks: LandmarkPoint[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));

  const tragusDx = params.tragusDx ?? 0.6; // e.g. -0.3 to +0.3
  const tragusDz = params.tragusDz ?? 0;
  landmarks[234] = { x: 0.5 - tragusDx / 2, y: 0.5, z: -tragusDz / 2 };
  landmarks[454] = { x: 0.5 + tragusDx / 2, y: 0.5, z: tragusDz / 2 };

  const midlineDy = params.midlineDy ?? -0.5; // p10 (brow) is higher (smaller y) than p152 (chin)
  const midlineDz = params.midlineDz ?? 0;
  landmarks[152] = { x: 0.5, y: 0.7, z: 0 };
  landmarks[10] = { x: 0.5, y: 0.7 + midlineDy, z: midlineDz };

  const eyesDy = params.eyesDy ?? 0;
  landmarks[33] = { x: 0.35, y: 0.45, z: 0 };
  landmarks[263] = { x: 0.65, y: 0.45 + eyesDy, z: 0 };

  landmarks[1] = { x: params.noseX ?? 0.5, y: params.noseY ?? 0.5, z: 0.1 };

  return landmarks;
}

describe("Head Pose Extraction & Reciprocity (F16)", () => {
  it("extracts neutral pose when face is centered and frontal", () => {
    const landmarks = createSyntheticLandmarks();
    const pose = extractHeadPose(landmarks, false);

    expect(Math.abs(pose.yaw)).toBeLessThan(0.05); // near 0 rad
    expect(Math.abs(pose.pitch)).toBeLessThan(0.06);
    expect(Math.abs(pose.roll)).toBeLessThan(0.02);
    expect(pose.screenX).toBeCloseTo(0, 2);
    expect(pose.screenY).toBeCloseTo(0, 2);
  });

  it("handles null, undefined, or empty landmarks gracefully with zero pose", () => {
    expect(extractHeadPose(null)).toEqual({ yaw: 0, pitch: 0, roll: 0, screenX: 0, screenY: 0 });
    expect(extractHeadPose(undefined)).toEqual({ yaw: 0, pitch: 0, roll: 0, screenX: 0, screenY: 0 });
    expect(extractHeadPose([])).toEqual({ yaw: 0, pitch: 0, roll: 0, screenX: 0, screenY: 0 });
  });

  it("clamps yaw to ±12 degrees (±0.21 rad) even under extreme turning or screen offset", () => {
    // Extreme spectator turn & far right offset
    const extremeRight = createSyntheticLandmarks({ noseX: 1.0, tragusDz: 0.8, tragusDx: 0.2 });
    const poseRight = extractHeadPose(extremeRight, false);
    const maxRadYaw = (12.0 * Math.PI) / 180;
    expect(poseRight.yaw).toBeLessThanOrEqual(maxRadYaw + 0.001);
    expect(poseRight.yaw).toBeGreaterThanOrEqual(-maxRadYaw - 0.001);

    const extremeLeft = createSyntheticLandmarks({ noseX: 0.0, tragusDz: -0.8, tragusDx: 0.2 });
    const poseLeft = extractHeadPose(extremeLeft, false);
    expect(poseLeft.yaw).toBeLessThanOrEqual(maxRadYaw + 0.001);
    expect(poseLeft.yaw).toBeGreaterThanOrEqual(-maxRadYaw - 0.001);
  });

  it("clamps pitch to ±8 degrees (±0.14 rad) under extreme vertical tilts", () => {
    const extremeUp = createSyntheticLandmarks({ noseY: 0.0, midlineDz: 0.6 });
    const poseUp = extractHeadPose(extremeUp, false);
    const maxRadPitch = (8.0 * Math.PI) / 180;
    expect(poseUp.pitch).toBeLessThanOrEqual(maxRadPitch + 0.001);
    expect(poseUp.pitch).toBeGreaterThanOrEqual(-maxRadPitch - 0.001);
  });

  it("enforces strict reducedMotion limits (±1.5 deg for yaw/pitch, 0 deg for roll)", () => {
    const extreme = createSyntheticLandmarks({ noseX: 1.0, noseY: 1.0, eyesDy: 0.3 });
    const pose = extractHeadPose(extreme, true);
    const maxRad = (1.5 * Math.PI) / 180;

    expect(Math.abs(pose.yaw)).toBeLessThanOrEqual(maxRad + 0.001);
    expect(Math.abs(pose.pitch)).toBeLessThanOrEqual(maxRad + 0.001);
    expect(pose.roll).toBe(0);
  });

  it("generates continuous organic Nocturne idle drift when no spectator input is active", () => {
    const t0 = getNocturneIdleDrift(0);
    const t1 = getNocturneIdleDrift(2.5);
    const t2 = getNocturneIdleDrift(5.0);

    // Dynamic movement across time
    expect(t0.yaw).not.toBe(t1.yaw);
    expect(t1.pitch).not.toBe(t2.pitch);

    // Drifts remain within gentle aesthetic bounds (under ±5 deg)
    const maxDriftRad = (5.0 * Math.PI) / 180;
    expect(Math.abs(t1.yaw)).toBeLessThanOrEqual(maxDriftRad);
    expect(Math.abs(t1.pitch)).toBeLessThanOrEqual(maxDriftRad);

    // Freezes completely on reduced motion
    const rmDrift = getNocturneIdleDrift(2.5, true);
    expect(rmDrift).toEqual({ yaw: 0, pitch: 0, roll: 0, screenX: 0, screenY: 0 });
  });
});
