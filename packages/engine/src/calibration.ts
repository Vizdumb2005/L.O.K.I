import { normalize } from "./distribution.js";

export interface CalibrationSample {
  probabilities: number[];
  truthIndex: number;
}

/**
 * Fit a temperature that maximises the mean log-likelihood of the truth under
 * p^(1/T). Used on a *calibration* seed split, never on the final eval split.
 */
export function fitTemperature(
  samples: CalibrationSample[],
  grid: number[] = [0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.2, 1.3, 1.4, 1.5]
): number {
  if (samples.length === 0) return 1;
  let bestT = 1;
  let best = -Infinity;
  for (const t of grid) {
    let ll = 0;
    for (const s of samples) {
      const logs = s.probabilities.map((p) => Math.log(Math.max(p, 1e-300)) / t);
      const p = normalize(logs);
      ll += Math.log(Math.max(p[s.truthIndex] ?? 0, 1e-300));
    }
    if (ll > best) {
      best = ll;
      bestT = t;
    }
  }
  return bestT;
}
