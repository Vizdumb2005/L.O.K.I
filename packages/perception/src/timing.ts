import type { Evidence } from "@loki/effect-api";

/**
 * Timing is a deliberately weak channel. It is useful as a lab measurement, not as a
 * claim about deception. A slow answer is not a lie.
 */
export interface TimingSample {
  probeId: string;
  elapsedMs: number;
  baselineMs: number;
  at: number;
}

export function timingEvidence(sample: TimingSample): Evidence {
  const ratio = sample.baselineMs > 0 ? sample.elapsedMs / sample.baselineMs : 1;
  const value = ratio > 1.8 ? "slow" : ratio < 0.55 ? "fast" : "typical";
  const distance = Math.abs(Math.log(Math.max(0.01, ratio)));
  return {
    channel: "timing",
    value,
    probeId: sample.probeId,
    reliability: Math.min(0.25, 0.05 + distance * 0.08),
    at: sample.at,
    meta: { elapsedMs: Math.round(sample.elapsedMs), ratio: Number(ratio.toFixed(2)) }
  };
}
