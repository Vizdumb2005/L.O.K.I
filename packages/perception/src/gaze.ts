import type { Evidence, StageZone } from "@loki/effect-api";

export interface GazeQualityInput {
  /** Root-mean-square calibration residual in CSS pixels. Null means not calibrated. */
  calibrationRmsePx: number | null;
  /** MediaPipe face presence / landmark confidence, 0..1. */
  faceConfidence: number;
  headYawDeg: number;
  headPitchDeg: number;
  /** Absolute difference between left and right eye horizontal estimates, degrees. */
  eyeDisagreementDeg: number;
  /** Mean luma of the camera frame, 0..1. */
  brightness: number;
  frames: number;
  /** Self-reported; not detected from landmarks. */
  glasses?: boolean;
}

export interface GazeQuality {
  reliability: number;
  usable: boolean;
  flags: string[];
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export function assessGazeQuality(input: GazeQualityInput): GazeQuality {
  const flags: string[] = [];
  if (input.calibrationRmsePx === null) {
    return { reliability: 0, usable: false, flags: ["no-calibration"] };
  }
  if (input.frames < 6) flags.push("too-few-frames");
  if (input.faceConfidence < 0.55) flags.push("low-face-confidence");
  if (Math.max(Math.abs(input.headYawDeg), Math.abs(input.headPitchDeg)) > 12) {
    flags.push("head-motion");
  }
  if (input.eyeDisagreementDeg > 8) flags.push("eye-disagreement");
  if (input.brightness < 0.18) flags.push("low-light");
  if (input.brightness > 0.92) flags.push("overexposed");
  if (input.glasses) flags.push("glasses-risk");
  if (input.calibrationRmsePx > 180) flags.push("poor-calibration");

  const calibrationFactor = 1 - Math.min(0.75, Math.max(0, input.calibrationRmsePx - 35) / 200);
  const confidenceFactor = 0.35 + 0.65 * clamp01(input.faceConfidence);
  const headDeviation = Math.max(Math.abs(input.headYawDeg), Math.abs(input.headPitchDeg));
  const headFactor = 1 - Math.min(0.55, Math.max(0, headDeviation - 8) / 32);
  const eyeFactor = 1 - Math.min(0.35, Math.max(0, input.eyeDisagreementDeg - 4) / 25);
  let lightFactor = 1;
  if (input.brightness < 0.18) lightFactor = 0.5;
  else if (input.brightness > 0.92) lightFactor = 0.85;
  const frameFactor = input.frames < 4 ? 0.2 : input.frames < 12 ? 0.55 : 1;
  const glassesFactor = input.glasses ? 0.9 : 1;

  const reliability = clamp01(
    calibrationFactor * confidenceFactor * headFactor * eyeFactor * lightFactor * frameFactor * glassesFactor
  );
  const usable =
    reliability >= 0.35 &&
    input.calibrationRmsePx <= 180 &&
    input.faceConfidence >= 0.55 &&
    input.frames >= 12;
  return { reliability, usable, flags };
}

export interface CalibrationPoint {
  targetX: number;
  targetY: number;
  sampleX: number;
  sampleY: number;
}

/** RMS residual in the same units as the points (CSS pixels for screen calibration). */
export function calibrationRmse(points: CalibrationPoint[]): number {
  if (points.length === 0) return Number.POSITIVE_INFINITY;
  const sum = points.reduce((acc, p) => acc + (p.sampleX - p.targetX) ** 2 + (p.sampleY - p.targetY) ** 2, 0);
  return Math.sqrt(sum / points.length);
}

export interface GazeZone extends StageZone {
  id: string;
}

export function zoneAtPoint(zones: StageZone[], x: number, y: number): string | null {
  for (const zone of zones) {
    if (x >= zone.x && x <= zone.x + zone.w && y >= zone.y && y <= zone.y + zone.h) {
      return zone.id;
    }
  }
  return null;
}

export interface GazeFrame {
  zone: string;
  at: number;
  reliability: number;
}

export interface GazeWindow {
  zone: string;
  dwellMs: number;
  dominance: number;
  reliability: number;
  frameCount: number;
  flags: string[];
}

/**
 * Aggregate a fixation window. Frames are correlated, so this function emits one
 * window-level observation, not one likelihood per frame. The caller must not feed
 * individual frames to the belief engine.
 */
export class GazeWindowAggregator {
  private frames: GazeFrame[] = [];

  constructor(private readonly minDwellMs = 900) {}

  add(frame: GazeFrame): void {
    this.frames.push(frame);
  }

  reset(): void {
    this.frames = [];
  }

  get frameCount(): number {
    return this.frames.length;
  }

  finalize(): GazeWindow | null {
    if (this.frames.length < 12) return null;
    const dwell = new Map<string, number>();
    const rel = new Map<string, number[]>();
    const sorted = [...this.frames].sort((a, b) => a.at - b.at);
    for (let i = 0; i < sorted.length; i++) {
      const frame = sorted[i]!;
      const next = sorted[i + 1];
      const duration = next ? Math.min(120, Math.max(0, next.at - frame.at)) : 33;
      dwell.set(frame.zone, (dwell.get(frame.zone) ?? 0) + duration);
      const list = rel.get(frame.zone) ?? [];
      list.push(frame.reliability);
      rel.set(frame.zone, list);
    }
    const ranked = [...dwell.entries()].sort((a, b) => b[1] - a[1]);
    const [zone, dwellMs] = ranked[0] ?? ["", 0];
    if (!zone || dwellMs < this.minDwellMs) return null;
    const total = [...dwell.values()].reduce((a, b) => a + b, 0);
    const dominance = total > 0 ? dwellMs / total : 0;
    const second = ranked[1]?.[1] ?? 0;
    if (dominance < 0.55 || dwellMs < 1.4 * second) return null;
    const reliabilities = rel.get(zone) ?? [];
    const meanRel = reliabilities.reduce((a, b) => a + b, 0) / Math.max(1, reliabilities.length);
    const reliability = Math.min(1, meanRel * (0.6 + 0.4 * dominance));
    return {
      zone,
      dwellMs: Math.round(dwellMs),
      dominance: Number(dominance.toFixed(3)),
      reliability: Number(reliability.toFixed(3)),
      frameCount: this.frames.length,
      flags: reliability < 0.35 ? ["low-reliability"] : []
    };
  }
}

export function gazeEvidence(window: GazeWindow, at: number): Evidence {
  return {
    channel: "gaze",
    value: window.zone,
    reliability: window.reliability,
    at,
    meta: {
      dwellMs: window.dwellMs,
      dominance: window.dominance,
      frameCount: window.frameCount,
      flags: window.flags.join(",")
    }
  };
}

/** Conservative check used by the show gate. No calibration, no camera evidence. */
export function gazeMayFeedShow(quality: GazeQuality, validatedInPilot: boolean): boolean {
  return validatedInPilot && quality.usable;
}
