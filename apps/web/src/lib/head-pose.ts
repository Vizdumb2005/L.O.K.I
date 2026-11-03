import type { HeadPose } from "../components/avatar-types.js";

export type LandmarkPoint = { x: number; y: number; z?: number };

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(min, Math.min(max, value));
}

function isValidPoint(p: LandmarkPoint | undefined | null): boolean {
  return Boolean(
    p &&
    typeof p.x === "number" &&
    Number.isFinite(p.x) &&
    typeof p.y === "number" &&
    Number.isFinite(p.y) &&
    Number.isFinite(p.z ?? 0)
  );
}

/**
 * Extracts head pose and spectator gaze reciprocity orientation from MediaPipe landmarks.
 * Zero-allocation pure function designed for 60fps execution.
 */
export function extractHeadPose(
  landmarks: LandmarkPoint[] | null | undefined,
  reducedMotion = false
): HeadPose {
  if (!landmarks || landmarks.length < 400) {
    return { yaw: 0, pitch: 0, roll: 0, screenX: 0, screenY: 0 };
  }

  const p234 = landmarks[234]; // right tragus
  const p454 = landmarks[454]; // left tragus
  const p152 = landmarks[152]; // chin
  const p10 = landmarks[10];   // forehead / upper brow
  const p33 = landmarks[33];   // right eye outer
  const p263 = landmarks[263]; // left eye outer
  const p1 = landmarks[1];     // nose tip

  if (
    !isValidPoint(p234) ||
    !isValidPoint(p454) ||
    !isValidPoint(p152) ||
    !isValidPoint(p10) ||
    !isValidPoint(p33) ||
    !isValidPoint(p263) ||
    !isValidPoint(p1)
  ) {
    return { yaw: 0, pitch: 0, roll: 0, screenX: 0, screenY: 0 };
  }

  // 1. Raw Head Orientation Angles
  const dxTragus = p454.x - p234.x;
  const dzTragus = (p454.z ?? 0) - (p234.z ?? 0);
  const rawYawDeg = Math.atan2(dzTragus, dxTragus) * RAD2DEG;

  const dyMidline = p10.y - p152.y;
  const dzMidline = (p10.z ?? 0) - (p152.z ?? 0);
  const rawPitchDeg = (Math.atan2(dzMidline, -dyMidline) - 0.15) * RAD2DEG;

  const dxEyes = p263.x - p33.x;
  const dyEyes = p263.y - p33.y;
  const rawRollDeg = Math.atan2(dyEyes, dxEyes) * RAD2DEG;

  // 2. Spectator Screen Parallax
  const screenX = clamp(p1.x - 0.5, -0.5, 0.5);
  const screenY = clamp(p1.y - 0.5, -0.5, 0.5);

  if (reducedMotion) {
    // Clamped strictly to ±1.5° yaw/pitch and 0° roll
    const yawDeg = clamp(-4.0 * screenX + 0.1 * rawYawDeg, -1.5, 1.5);
    const pitchDeg = clamp(3.0 * screenY - 0.08 * rawPitchDeg, -1.5, 1.5);

    if (!Number.isFinite(yawDeg) || !Number.isFinite(pitchDeg) || !Number.isFinite(screenX) || !Number.isFinite(screenY)) {
      return { yaw: 0, pitch: 0, roll: 0, screenX: 0, screenY: 0 };
    }

    return {
      yaw: yawDeg * DEG2RAD,
      pitch: pitchDeg * DEG2RAD,
      roll: 0,
      screenX,
      screenY,
      isTracking: true
    };
  }

  // 3. Reciprocal Target Angles
  // Avatar turns head toward spectator's screen position and mirrors head tilt subtly
  const targetYawDeg = clamp(-18.0 * screenX + 0.25 * rawYawDeg, -12.0, 12.0);
  const targetPitchDeg = clamp(12.0 * screenY - 0.20 * rawPitchDeg, -8.0, 8.0);
  const targetRollDeg = clamp(-0.25 * rawRollDeg, -4.0, 4.0);

  if (
    !Number.isFinite(targetYawDeg) ||
    !Number.isFinite(targetPitchDeg) ||
    !Number.isFinite(targetRollDeg) ||
    !Number.isFinite(screenX) ||
    !Number.isFinite(screenY)
  ) {
    return { yaw: 0, pitch: 0, roll: 0, screenX: 0, screenY: 0 };
  }

  return {
    yaw: targetYawDeg * DEG2RAD,
    pitch: targetPitchDeg * DEG2RAD,
    roll: targetRollDeg * DEG2RAD,
    screenX,
    screenY,
    isTracking: true
  };
}

/**
 * Autonomous Nocturne Idle Drift when camera is absent, denied, or spectator is motionless.
 */
export function getNocturneIdleDrift(timeSec: number, reducedMotion = false): HeadPose {
  if (reducedMotion) {
    return { yaw: 0, pitch: 0, roll: 0, screenX: 0, screenY: 0 };
  }

  const yawDeg = 3.0 * Math.sin(0.35 * timeSec) + 1.2 * Math.sin(0.82 * timeSec + 1.0);
  const pitchDeg = 1.8 * Math.cos(0.28 * timeSec) + 0.8 * Math.sin(0.61 * timeSec);
  const rollDeg = 0.8 * Math.sin(0.18 * timeSec + 2.0);

  return {
    yaw: yawDeg * DEG2RAD,
    pitch: pitchDeg * DEG2RAD,
    roll: rollDeg * DEG2RAD,
    screenX: 0,
    screenY: 0
  };
}
