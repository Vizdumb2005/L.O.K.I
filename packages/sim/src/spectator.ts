import type { Effect, Probe, StageSpec } from "@loki/effect-api";
import { sampleCategorical } from "./rng.js";

export interface SpectatorConfig {
  answerError: number; // 0..1 probability of choosing a wrong option
  force: boolean;
  gaze: boolean;
  gazeAccuracy: number; // P(sample the true item's zone distribution)
  gazeReliability: number;
  itemBias?: { itemId: string; multiplier: number };
  /** Ordinal probe number (1-based) to answer wrongly on purpose; failure suite only. */
  lieAt?: number;
}

export function sampleTruth(effect: Effect, config: SpectatorConfig, seed: number): string {
  const random = (() => {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();
  const prior = effect.prior({ forceEnabled: config.force });
  const items = effect.hypotheses();
  const weights = items.map((h) => {
    let w = Math.max(0, prior[h.id] ?? 0);
    if (config.itemBias && config.itemBias.itemId === h.id) w *= config.itemBias.multiplier;
    return w;
  });
  return items[sampleCategorical(weights, random)]!.id;
}

export function truthOption(probe: Probe, trueId: string): string {
  let best = probe.options[0]!.id;
  let bestP = -1;
  for (const option of probe.options) {
    const p = probe.likelihood(trueId, option.id);
    if (p > bestP) {
      bestP = p;
      best = option.id;
    }
  }
  return best;
}

export function chooseAnswer(
  probe: Probe,
  trueId: string,
  config: SpectatorConfig,
  ordinal: number,
  random: () => number
): string {
  const truth = truthOption(probe, trueId);
  const flip = ordinal === config.lieAt || random() < config.answerError;
  if (!flip) return truth;
  const wrong = probe.options.filter((o) => o.id !== truth);
  if (wrong.length === 0) return truth;
  return wrong[Math.floor(random() * wrong.length)]!.id;
}

export interface SimulatedGaze {
  zone: string;
  reliability: number;
}

export function sampleGaze(
  effect: Effect,
  stage: StageSpec,
  trueId: string,
  config: SpectatorConfig,
  random: () => number
): SimulatedGaze | null {
  if (!config.gaze) return null;
  const binding = effect.channels(stage).find((c) => c.channel === "gaze");
  if (!binding || binding.values.length === 0) return null;
  const weights = binding.values.map((value) =>
    Math.max(0, binding.likelihood(trueId, { channel: "gaze", value, reliability: 1, at: 0 }))
  );
  let zone: string;
  if (random() < config.gazeAccuracy) {
    zone = binding.values[sampleCategorical(weights, random)]!;
  } else {
    zone = binding.values[Math.floor(random() * binding.values.length)]!;
  }
  const jitter = (random() - 0.5) * 0.08;
  const reliability = Math.min(1, Math.max(0, config.gazeReliability + jitter));
  return { zone, reliability };
}
