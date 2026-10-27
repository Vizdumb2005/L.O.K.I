import { describe, expect, it } from "vitest";
import type { ChannelBinding, Hypothesis, Probe } from "@loki/effect-api";
import {
  applyAnswer,
  applyChannelEvidence,
  bestHypothesis,
  createBelief,
  expectedPosteriorEntropy,
  fitTemperature,
  informationGain,
  maxPosterior,
  multiclassBrier,
  posterior,
  posteriorMap,
  replay,
  selectProbe,
  wilsonInterval,
  type BeliefConfig
} from "../src/index.js";

const hypotheses: Hypothesis[] = [
  { id: "a", label: "A" },
  { id: "b", label: "B" },
  { id: "c", label: "C" }
];

const prior = { a: 1 / 3, b: 1 / 3, c: 1 / 3 };

const config: BeliefConfig = {
  epsilon: 0.1,
  outlierWeight: 0.05,
  temperature: 1,
  recoverySurprise: 3.5,
  hardMode: false,
  useOutlier: true
};

const probe: Probe = {
  id: "is-a",
  prompt: "Is it A?",
  options: [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }],
  cost: 0.1,
  likelihood: (item, option) => (option === "yes" ? (item === "a" ? 1 : 0) : item === "a" ? 0 : 1)
};

const weakProbe: Probe = {
  id: "weak",
  prompt: "A weak question",
  options: [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }],
  cost: 0.9,
  likelihood: (item, option) => (option === "yes" ? (item === "a" ? 0.55 : 0.5) : item === "a" ? 0.45 : 0.5)
};

function fresh(c: BeliefConfig = config) {
  return createBelief(hypotheses, prior, c);
}

describe("belief engine", () => {
  it("normalizes the posterior after every update", () => {
    const state = applyAnswer(fresh(), probe, "yes", config, 1).state;
    expect(posterior(state).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it("keeps every hypothesis possible under soft likelihoods", () => {
    const state = applyAnswer(fresh(), probe, "yes", config, 1).state;
    const p = posteriorMap(state);
    expect(p.a).toBeGreaterThan(0.75);
    expect(p.b).toBeGreaterThan(0);
    expect(p.c).toBeGreaterThan(0);
  });

  it("can eliminate hypotheses in the hard ablation", () => {
    const hard = { ...config, hardMode: true, useOutlier: false };
    const state = applyAnswer(fresh(hard), probe, "yes", hard, 1).state;
    const p = posteriorMap(state);
    expect(p.b).toBeLessThan(1e-100);
    expect(p.c).toBeLessThan(1e-100);
  });

  it("drops contradicted-looking evidence only softly", () => {
    let state = fresh();
    state = applyAnswer(state, probe, "no", config, 1).state;
    state = applyAnswer(state, probe, "yes", config, 2).state;
    const p = posteriorMap(state);
    expect(p.a).toBeGreaterThan(0);
    expect(p.b).toBeGreaterThan(0);
    expect(state.observations).toHaveLength(2);
  });

  it("flags a surprise and then resolves it", () => {
    const result = applyAnswer(fresh(), weakProbe, "yes", config, 1);
    expect(result.surprise).toBeGreaterThan(0);
    const state = applyAnswer(fresh(), probe, "yes", { ...config, epsilon: 0.05, recoverySurprise: 0.2, outlierWeight: 0.02 }, 1);
    expect(state.contradiction).toBe(true);
  });

  it("replays the exact same posterior from the categorical log", () => {
    let state = fresh();
    state = applyAnswer(state, probe, "yes", config, 1).state;
    state = applyAnswer(state, probe, "no", config, 2).state;
    const replayed = replay({
      hypotheses,
      prior,
      config,
      probes: [probe],
      channels: [],
      observations: state.observations
    });
    expect(posterior(replayed)).toEqual(posterior(state));
  });

  it("reports the best hypothesis with its probability", () => {
    const state = applyAnswer(fresh(), probe, "yes", config, 1).state;
    const best = bestHypothesis(state);
    expect(best.hypothesis.id).toBe("a");
    expect(best.probability).toBe(maxPosterior(state));
  });
});

describe("evidence channels", () => {
  const binding: ChannelBinding = {
    channel: "gaze",
    label: "Gaze zone",
    weight: 0.6,
    minReliability: 0.4,
    values: ["left", "right"],
    likelihood: (item, observation) => {
      const left = item !== "c";
      return observation.value === (left ? "left" : "right") ? 0.9 : 0.1;
    }
  };

  it("drops low-reliability observations without changing belief", () => {
    const state = fresh();
    const before = posterior(state);
    const result = applyChannelEvidence(
      state,
      binding,
      { channel: "gaze", value: "left", reliability: 0.2, at: 1 },
      config
    );
    expect(result.dropped).toBe(true);
    expect(posterior(result.state)).toEqual(before);
    expect(result.state.observations[0]?.dropped).toBe(true);
  });

  it("caps a single channel's weight", () => {
    const heavy = { ...binding, weight: 1 };
    const light = { ...binding, weight: 0.2 };
    const evidence = { channel: "gaze", value: "left", reliability: 0.9, at: 1 };
    const pHeavy = posterior(applyChannelEvidence(fresh(), heavy, evidence, config).state)[0]!;
    const pLight = posterior(applyChannelEvidence(fresh(), light, evidence, config).state)[0]!;
    expect(pHeavy).toBeGreaterThan(pLight);
  });
});

describe("policy", () => {
  it("prefers the informative probe over the costly weak one", () => {
    const state = fresh();
    const choice = selectProbe(state, [weakProbe, probe], new Set(), "greedy", config, 0.02);
    expect(choice?.probe.id).toBe("is-a");
    expect(informationGain(state, probe, config)).toBeGreaterThan(
      informationGain(state, weakProbe, config)
    );
    expect(expectedPosteriorEntropy(state, probe, config)).toBeLessThan(2);
  });

  it("honours fixed order", () => {
    const state = fresh();
    const choice = selectProbe(state, [weakProbe, probe], new Set(), "fixed", config, 0.02);
    expect(choice?.probe.id).toBe("weak");
  });

  it("does not select an already-used probe", () => {
    const state = fresh();
    const choice = selectProbe(state, [probe], new Set(["is-a"]), "greedy", config, 0.02);
    expect(choice).toBeNull();
  });
});

describe("calibration", () => {
  it("computes the multi-class Brier score", () => {
    expect(multiclassBrier([1, 0, 0], 0)).toBe(0);
    expect(multiclassBrier([0.5, 0.5, 0], 0)).toBeCloseTo(0.5);
  });

  it("computes a Wilson interval that contains the point estimate", () => {
    const [lo, hi] = wilsonInterval(80, 100);
    expect(lo).toBeLessThan(0.8);
    expect(hi).toBeGreaterThan(0.8);
  });

  it("fits a temperature on a separable calibration sample", () => {
    const samples = [
      { probabilities: [0.7, 0.2, 0.1], truthIndex: 0 },
      { probabilities: [0.6, 0.3, 0.1], truthIndex: 0 },
      { probabilities: [0.55, 0.3, 0.15], truthIndex: 0 }
    ];
    const t = fitTemperature(samples);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThanOrEqual(1.5);
  });
});
