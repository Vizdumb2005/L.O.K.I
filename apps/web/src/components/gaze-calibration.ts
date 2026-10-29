/**
 * Gaze-zone measurement for the camera lab.
 *
 * This is a measuring instrument, not a gate: it records how well the raw iris
 * offset on THIS device separates the six coarse stage zones while the person
 * deliberately looks at marked targets, and it opens nothing. A trial - not a
 * frame - is the unit of analysis, because consecutive frames are correlated.
 * Fit and held-out trials are kept apart: centroids are learned from one half
 * and scored only on the other. Ground truth is the highlighted target, never
 * the fitted labels.
 */

export interface CalibrationSample {
  x: number;
  y: number;
  at: number;
}

export interface TrialMeasurement {
  zoneId: string;
  /** Median iris offset over the dwell window; null when the trial abstained. */
  x: number | null;
  y: number | null;
  samples: number;
  abstained: boolean;
  /** Mean scene brightness during the trial, 0..1, for drift context. */
  luma: number | null;
}

export interface ZoneCentroid {
  zoneId: string;
  x: number;
  y: number;
  n: number;
}

/** Median of a numeric list; null on empty. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Collapse one dwell window into a single trial measurement. */
export function aggregateTrial(
  zoneId: string,
  samples: CalibrationSample[],
  minSamples: number,
  luma: number | null = null
): TrialMeasurement {
  if (samples.length < minSamples) {
    return { zoneId, x: null, y: null, samples: samples.length, abstained: true, luma };
  }
  return {
    zoneId,
    x: median(samples.map((s) => s.x)),
    y: median(samples.map((s) => s.y)),
    samples: samples.length,
    abstained: false,
    luma
  };
}

/** Learn one centroid per zone from the fit half only. */
export function fitCentroids(measurements: TrialMeasurement[]): ZoneCentroid[] {
  const byZone = new Map<string, { xs: number[]; ys: number[] }>();
  for (const m of measurements) {
    if (m.abstained || m.x === null || m.y === null) continue;
    const entry = byZone.get(m.zoneId) ?? { xs: [], ys: [] };
    entry.xs.push(m.x);
    entry.ys.push(m.y);
    byZone.set(m.zoneId, entry);
  }
  return [...byZone.entries()].map(([zoneId, { xs, ys }]) => ({
    zoneId,
    x: xs.reduce((a, b) => a + b, 0) / xs.length,
    y: ys.reduce((a, b) => a + b, 0) / ys.length,
    n: xs.length
  }));
}

/** Nearest-centroid prediction; null when nothing was fitted. */
export function predictZone(centroids: ZoneCentroid[], x: number, y: number): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const c of centroids) {
    const d = (c.x - x) ** 2 + (c.y - y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = c.zoneId;
    }
  }
  return best;
}

/**
 * Fixed, fit-independent mapping: raw offset space cut into the same 3x2 grid
 * as the stage zones. Crude on purpose - it is the baseline any fitted mapping
 * must beat, and it uses no trial data at all.
 */
export function fixedZoneOf(x: number, y: number): string {
  const row = y < -0.15 ? 0 : y <= 0.15 ? 1 : 2;
  const col = x < 0 ? 0 : 1;
  return `${row === 0 ? "top" : row === 1 ? "mid" : "bottom"}-${col === 0 ? "left" : "right"}`;
}

export interface CalibrationMetrics {
  trials: number;
  abstained: number;
  /** Held-out accuracy of centroids fitted on the fit half. */
  fittedAccuracy: number | null;
  /** Held-out accuracy of the fixed grid mapping. */
  fixedAccuracy: number | null;
  chance: number;
  /** true zone -> predicted zone -> count (fitted mapping, held-out only). */
  confusion: Record<string, Record<string, number>>;
}

export function evaluate(
  fit: TrialMeasurement[],
  heldOut: TrialMeasurement[],
  zoneIds: string[]
): CalibrationMetrics {
  const centroids = fitCentroids(fit);
  const all = [...fit, ...heldOut];
  const abstained = all.filter((m) => m.abstained).length;
  const scored = heldOut.filter((m) => !m.abstained && m.x !== null && m.y !== null);
  const chance = 1 / Math.max(1, zoneIds.length);
  const confusion: CalibrationMetrics["confusion"] = {};
  for (const id of zoneIds) confusion[id] = {};

  if (scored.length === 0) {
    return {
      trials: all.length,
      abstained,
      fittedAccuracy: null,
      fixedAccuracy: null,
      chance,
      confusion
    };
  }

  let fittedHits = 0;
  let fixedHits = 0;
  for (const m of scored) {
    const fitted = predictZone(centroids, m.x!, m.y!);
    const fixed = fixedZoneOf(m.x!, m.y!);
    if (fitted === m.zoneId) fittedHits += 1;
    if (fixed === m.zoneId) fixedHits += 1;
    const row = confusion[m.zoneId] ?? {};
    const key = fitted ?? "none";
    row[key] = (row[key] ?? 0) + 1;
    confusion[m.zoneId] = row;
  }

  return {
    trials: all.length,
    abstained,
    fittedAccuracy: fittedHits / scored.length,
    fixedAccuracy: fixedHits / scored.length,
    chance,
    confusion
  };
}

/** Split per zone: earlier trials fit, later trials held out. No reshuffling - order is kept. */
export function splitFitHeldOut(measurements: TrialMeasurement[]): {
  fit: TrialMeasurement[];
  heldOut: TrialMeasurement[];
} {
  const byZone = new Map<string, TrialMeasurement[]>();
  for (const m of measurements) {
    const list = byZone.get(m.zoneId) ?? [];
    list.push(m);
    byZone.set(m.zoneId, list);
  }
  const fit: TrialMeasurement[] = [];
  const heldOut: TrialMeasurement[] = [];
  for (const list of byZone.values()) {
    const cut = Math.ceil(list.length / 2);
    fit.push(...list.slice(0, cut));
    heldOut.push(...list.slice(cut));
  }
  return { fit, heldOut };
}
