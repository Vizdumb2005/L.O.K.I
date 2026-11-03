import { assessGazeQuality, type GazeQuality } from "@loki/perception";
import { affineRmse, fitAffineMap, type AffineMap, type Point } from "./gaze-map.js";

/**
 * Blueprint v4 §2.2 — the disguised attunement calibration.
 *
 * A soft golden ember drifts across four theatrical anchor points of the stage
 * while the spectator follows it with their eyes. No test screens, no crosses:
 * the calibration is the ritual. The collected iris samples fit one affine map
 * from raw iris offsets to normalized stage coordinates, and the show only opens
 * the gaze channel when the residual and the signal quality both pass.
 */

/** The four ember anchors in normalized stage coordinates. */
export const EMBER_ANCHORS: readonly Point[] = [
  { x: 0.25, y: 0.25 },
  { x: 0.75, y: 0.25 },
  { x: 0.75, y: 0.75 },
  { x: 0.25, y: 0.75 }
];

export interface EmberStep {
  anchor: Point;
  /** Saccade + latency before samples count. */
  settleMs: number;
  /** Collection window at the anchor. */
  dwellMs: number;
}

export function attunementSchedule(): EmberStep[] {
  return EMBER_ANCHORS.map((anchor) => ({ anchor, settleMs: 700, dwellMs: 900 }));
}

/** One calibration observation: the median iris offset at one anchor. */
export interface EmberSample {
  source: Point;
  /** Normalized stage coordinate of the anchor. */
  target: Point;
}

/** Residual gate in normalized stage units (~120px on an ~800px stage). */
export const CALIBRATION_RMSE_MAX = 0.15;
export const MIN_EMBER_SAMPLES = 4;

export interface CalibrationVerdict {
  calibrated: boolean;
  /** Residual of the fitted map, or null when no map could be fit. */
  rmse: number | null;
  map: AffineMap | null;
}

/**
 * The honest gate: a calibration passes only when the affine fit residual is
 * small AND the signal quality (calibration, face, head, light, frames) is
 * usable. A poor camera never opens the gaze channel.
 */
export function calibrationVerdict(samples: EmberSample[], quality: GazeQuality): CalibrationVerdict {
  if (samples.length < MIN_EMBER_SAMPLES || !quality.usable) {
    return { calibrated: false, rmse: null, map: null };
  }
  const map = fitAffineMap(samples);
  if (!map) return { calibrated: false, rmse: null, map: null };
  const rmse = affineRmse(map, samples);
  return { calibrated: rmse <= CALIBRATION_RMSE_MAX, rmse, map };
}

/** Median of a numeric list; null when empty. */
export function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * Reduce a dwell window's raw iris samples into one EmberSample (median offset),
 * mirroring the lab's trial discipline: frames are correlated, the median of a
 * dwell is the independent unit.
 */
export function emberSampleAt(
  anchor: Point,
  samples: Array<{ x: number; y: number }>
): EmberSample | null {
  if (samples.length === 0) return null;
  const xs = samples.map((s) => s.x);
  const ys = samples.map((s) => s.y);
  const x = medianOf(xs);
  const y = medianOf(ys);
  if (x === null || y === null) return null;
  return { source: { x, y }, target: anchor };
}

export { assessGazeQuality, applyAffineMapFromMap };

function applyAffineMapFromMap(map: AffineMap, source: Point): Point {
  return {
    x: map.a11 * source.x + map.a12 * source.y + map.tx,
    y: map.a21 * source.x + map.a22 * source.y + map.ty
  };
}
