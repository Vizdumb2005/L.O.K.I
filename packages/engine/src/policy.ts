import type { Probe } from "@loki/effect-api";
import {
  answerLikelihoods,
  type BeliefConfig,
  type BeliefState,
  beliefEntropy,
  maxPosterior,
  posterior
} from "./belief.js";
import { entropy, normalizeProbabilities } from "./distribution.js";

export type PolicyId = "greedy" | "median" | "fixed";

export interface PolicyConfig {
  policy: PolicyId;
  costWeight: number;
}

export function probePosteriorMass(state: BeliefState, probe: Probe): number[] {
  const p = posterior(state);
  return probe.options.map((option) =>
    p.reduce((sum, ph, i) => {
      const h = state.hypotheses[i]!;
      return sum + ph * Math.max(0, probe.likelihood(h.id, option.id));
    }, 0)
  );
}

export function expectedPosteriorEntropy(
  state: BeliefState,
  probe: Probe,
  config: BeliefConfig
): number {
  const prior = posterior(state);
  let expected = 0;
  for (const option of probe.options) {
    const likelihood = answerLikelihoods(state, probe, option.id, {
      ...config,
      hardMode: false,
      useOutlier: config.useOutlier
    });
    const predictive = prior.reduce((sum, ph, i) => sum + ph * likelihood[i]!, 0);
    if (!(predictive > 0)) continue;
    const untempered = normalizeProbabilities(prior.map((ph, i) => ph * likelihood[i]!));
    const temperature = Math.max(0.5, config.temperature);
    const next = normalizeProbabilities(untempered.map((p) => Math.pow(p, 1 / temperature)));
    expected += predictive * entropy(next);
  }
  return expected;
}

export function informationGain(state: BeliefState, probe: Probe, config: BeliefConfig): number {
  return beliefEntropy(state) - expectedPosteriorEntropy(state, probe, config);
}

export interface ProbeChoice {
  probe: Probe;
  score: number;
  informationGain: number;
}

/**
 * Policy A: greedy expected information gain, penalised by reveal cost.
 * Policy B: balanced partition (posterior-median analogue for a categorical set).
 * Policy C: effect order, no adaptation.
 */
export function selectProbe(
  state: BeliefState,
  probes: Probe[],
  usedProbeIds: ReadonlySet<string>,
  policy: PolicyId,
  config: BeliefConfig,
  costWeight: number
): ProbeChoice | null {
  const available = probes.filter((p) => !usedProbeIds.has(p.id));
  if (available.length === 0) return null;

  if (policy === "fixed") {
    const probe = available[0]!;
    return { probe, score: 0, informationGain: informationGain(state, probe, config) };
  }

  let best: ProbeChoice | null = null;
  for (const probe of available) {
    const gain = informationGain(state, probe, config);
    let score: number;
    if (policy === "greedy") {
      score = -gain + costWeight * probe.cost;
    } else {
      const masses = probePosteriorMass(state, probe);
      const maxMass = Math.max(...masses);
      const balancePenalty = maxMass;
      score = balancePenalty * 10 + costWeight * probe.cost * 0.1 - gain * 0.001;
    }
    if (!best || score < best.score) {
      best = { probe, score, informationGain: gain };
    }
  }
  return best;
}

export function commitGate(
  state: BeliefState,
  commitThreshold: number,
  probesAnswered: number
): boolean {
  return probesAnswered >= 2 && !state.contradictionActive && maxPosterior(state) >= commitThreshold;
}
