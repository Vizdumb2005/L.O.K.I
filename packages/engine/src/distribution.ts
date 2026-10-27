export type NumericDistribution = number[];

export function logSumExp(values: number[]): number {
  if (values.length === 0) return -Infinity;
  let max = -Infinity;
  for (const v of values) if (v > max) max = v;
  if (max === -Infinity) return -Infinity;
  let sum = 0;
  for (const v of values) sum += Math.exp(v - max);
  return max + Math.log(sum);
}

export function normalize(logValues: number[]): number[] {
  const lse = logSumExp(logValues);
  if (!Number.isFinite(lse)) {
    const p = 1 / logValues.length;
    return logValues.map(() => p);
  }
  return logValues.map((v) => Math.exp(v - lse));
}

export function normalizeProbabilities(values: number[]): number[] {
  const sum = values.reduce((a, b) => a + Math.max(0, b), 0);
  if (!(sum > 0) || !Number.isFinite(sum)) {
    return values.map(() => 1 / values.length);
  }
  return values.map((v) => Math.max(0, v) / sum);
}

export function entropy(probabilities: number[]): number {
  let h = 0;
  for (const p of probabilities) {
    if (p > 0) h -= p * Math.log2(p);
  }
  return h;
}

export function argmax(values: number[]): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i]! > values[best]!) best = i;
  }
  return best;
}

export function topIndices(values: number[], k: number): number[] {
  return values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => b.value - a.value)
    .slice(0, Math.max(0, k))
    .map((x) => x.index);
}

/** Multivariate (multi-class) Brier score for one observation. Lower is better. */
export function multiclassBrier(probabilities: number[], truthIndex: number): number {
  let sum = 0;
  for (let i = 0; i < probabilities.length; i++) {
    const target = i === truthIndex ? 1 : 0;
    const d = probabilities[i]! - target;
    sum += d * d;
  }
  return sum;
}

export interface ReliabilityBin {
  lower: number;
  upper: number;
  count: number;
  meanConfidence: number;
  accuracy: number;
}

export function reliabilityBins(
  predictions: Array<{ probabilities: number[]; truthIndex: number }>,
  binCount = 10
): ReliabilityBin[] {
  const bins: Array<{ count: number; conf: number; correct: number }> = Array.from(
    { length: binCount },
    () => ({ count: 0, conf: 0, correct: 0 })
  );
  for (const { probabilities, truthIndex } of predictions) {
    const idx = argmax(probabilities);
    const conf = probabilities[idx]!;
    const bin = Math.min(binCount - 1, Math.max(0, Math.floor(conf * binCount)));
    const b = bins[bin]!;
    b.count += 1;
    b.conf += conf;
    b.correct += idx === truthIndex ? 1 : 0;
  }
  return bins.map((b, i) => ({
    lower: i / binCount,
    upper: (i + 1) / binCount,
    count: b.count,
    meanConfidence: b.count ? b.conf / b.count : 0,
    accuracy: b.count ? b.correct / b.count : 0
  }));
}

export function expectedCalibrationError(
  predictions: Array<{ probabilities: number[]; truthIndex: number }>,
  binCount = 10
): number {
  if (predictions.length === 0) return 0;
  const bins = reliabilityBins(predictions, binCount);
  return bins.reduce((sum, b) => sum + (b.count / predictions.length) * Math.abs(b.accuracy - b.meanConfidence), 0);
}

export function wilsonInterval(successes: number, n: number, z = 1.959963984540054): [number, number] {
  if (n === 0) return [0, 1];
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function sampleStd(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1));
}

/** Normal-approximation 95% CI for a mean. Fine for the simulator's n>=1000 cells. */
export function meanCI(values: number[]): [number, number] {
  if (values.length === 0) return [0, 0];
  const m = mean(values);
  const se = sampleStd(values) / Math.sqrt(values.length);
  return [m - 1.959963984540054 * se, m + 1.959963984540054 * se];
}
