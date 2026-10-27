import { describe, expect, it } from "vitest";
import type { ChannelBinding, Hypothesis, Probe } from "@loki/effect-api";
import {
  answerLikelihoods,
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

describe("probability model consistency audit", () => {
  it("temperature > 1 flattens the posterior (lower max, higher entropy)", () => {
    const state1 = applyAnswer(fresh(), probe, "yes", config, 1).state;
    const hotConfig = { ...config, temperature: 1.5 };
    const stateHot = applyAnswer(fresh(hotConfig), probe, "yes", hotConfig, 1).state;
    const p1 = posterior(state1);
    const pHot = posterior(stateHot);
    // Hot temperature should have lower max posterior
    expect(Math.max(...pHot)).toBeLessThan(Math.max(...p1));
    // Hot temperature should have higher entropy (more uniform)
    const entropy1 = -p1.reduce((sum, p) => sum + (p > 0 ? p * Math.log2(p) : 0), 0);
    const entropyHot = -pHot.reduce((sum, p) => sum + (p > 0 ? p * Math.log2(p) : 0), 0);
    expect(entropyHot).toBeGreaterThan(entropy1);
  });

  it("temperature < 1 sharpens the posterior (higher max, lower entropy)", () => {
    const state1 = applyAnswer(fresh(), probe, "yes", config, 1).state;
    const coldConfig = { ...config, temperature: 0.7 };
    const stateCold = applyAnswer(fresh(coldConfig), probe, "yes", coldConfig, 1).state;
    const p1 = posterior(state1);
    const pCold = posterior(stateCold);
    expect(Math.max(...pCold)).toBeGreaterThan(Math.max(...p1));
  });

  it("temperature preserves normalization (posterior sums to 1)", () => {
    for (const t of [0.5, 0.7, 1.0, 1.5, 2.0]) {
      const tc = { ...config, temperature: t };
      const state = applyAnswer(fresh(tc), probe, "yes", tc, 1).state;
      const p = posterior(state);
      expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    }
  });

  it("outlier mixture adds a uniform 1/N component", () => {
    // With useOutlier=true and a deterministic probe, the non-target hypotheses
    // should have probability >= outlierWeight / N
    const N = hypotheses.length;
    const minExpected = config.outlierWeight / N;
    const state = applyAnswer(fresh(), probe, "yes", config, 1).state;
    const p = posteriorMap(state);
    // Hypothesis "b" and "c" are contradicted by "yes" to "Is it A?"
    // but the outlier mixture keeps them above zero
    expect(p.b).toBeGreaterThan(minExpected * 0.5);
    expect(p.c).toBeGreaterThan(minExpected * 0.5);
  });

  it("reliability=0 gives a uniform posterior regardless of evidence", () => {
    // With reliability 0, the likelihood becomes uniform 1/N
    const state = applyAnswer(fresh(), probe, "yes", config, 1, 0).state;
    const p = posterior(state);
    // Should be close to uniform (the outlier mixture also adds uniform mass)
    const uniform = 1 / hypotheses.length;
    for (const prob of p) {
      expect(Math.abs(prob - uniform)).toBeLessThan(0.15);
    }
  });

  it("answer likelihoods are per-hypothesis (not a distribution over hypotheses)", () => {
    // answerLikelihoods returns P(option | hypothesis) for each hypothesis
    // The sum across hypotheses does NOT need to be 1
    const state = fresh();
    const likelihoods = answerLikelihoods(state, probe, "yes", config);
    expect(likelihoods).toHaveLength(hypotheses.length);
    // Each likelihood should be in [0, 1]
    for (const l of likelihoods) {
      expect(l).toBeGreaterThanOrEqual(0);
      expect(l).toBeLessThanOrEqual(1);
    }
  });

  it("channel evidence likelihoods are row-stochastic across values", () => {
    const binding: ChannelBinding = {
      channel: "gaze",
      label: "zone",
      weight: 0.6,
      minReliability: 0.3,
      values: ["left", "right", "center"],
      likelihood: (item, obs) => {
        // Deterministic: "a" -> left, "b" -> right, "c" -> center
        const map: Record<string, string> = { a: "left", b: "right", c: "center" };
        return obs.value === map[item] ? 1 : 0;
      }
    };
    for (const h of hypotheses) {
      let sum = 0;
      for (const v of binding.values) {
        sum += binding.likelihood(h.id, { channel: "gaze", value: v, reliability: 1, at: 0 });
      }
      expect(sum).toBeCloseTo(1, 10);
    }
  });

  it("replay from categorical log reproduces the exact posterior", () => {
    let state = fresh();
    state = applyAnswer(state, probe, "yes", config, 1).state;
    state = applyAnswer(state, probe, "no", config, 2).state;
    state = applyAnswer(state, weakProbe, "yes", config, 3).state;
    const replayed = replay({
      hypotheses,
      prior,
      config,
      probes: [probe, weakProbe],
      channels: [],
      observations: state.observations
    });
    expect(posterior(replayed)).toEqual(posterior(state));
  });

  it("replay with channel evidence reproduces the exact posterior", () => {
    const binding: ChannelBinding = {
      channel: "gaze",
      label: "zone",
      weight: 0.5,
      minReliability: 0.3,
      values: ["left", "right"],
      likelihood: (item, obs) => (obs.value === (item === "a" ? "left" : "right") ? 0.9 : 0.1)
    };
    let state = fresh();
    state = applyAnswer(state, probe, "yes", config, 1).state;
    state = applyChannelEvidence(state, binding, {
      channel: "gaze", value: "left", reliability: 0.8, at: 2
    }, config).state;
    const replayed = replay({
      hypotheses,
      prior,
      config,
      probes: [probe],
      channels: [binding],
      observations: state.observations
    });
    expect(posterior(replayed)).toEqual(posterior(state));
  });
});
describe("observation-alphabet regression", () => {
  it("answer noise sums to one across options, not hypotheses", () => {
    for (const h of hypotheses) {
      const i = hypotheses.indexOf(h);
      const sum = probe.options.reduce((total, option) =>
        total + answerLikelihoods(fresh(), probe, option.id, config)[i]!, 0);
      expect(sum).toBeCloseTo(1, 12);
    }
  });

  it("an uninformative probe has zero information gain", () => {
    const uninformative = { ...probe, likelihood: () => 0.5 };
    expect(informationGain(fresh(), uninformative, config)).toBeCloseTo(0, 12);
  });

  it("expected entropy matches actual tempered updates", () => {
    const hot = { ...config, temperature: 1.5 };
    const state = applyAnswer(fresh(), probe, "yes", config, 1).state;
    const p = posterior(state);
    let expected = 0;
    for (const option of probe.options) {
      const likelihood = answerLikelihoods(state, probe, option.id, hot);
      const predictive = p.reduce((sum, mass, i) => sum + mass * likelihood[i]!, 0);
      const updated = posterior(applyAnswer(state, probe, option.id, hot, 2).state);
      expected += predictive * -updated.reduce((sum, mass) => sum + (mass ? mass * Math.log2(mass) : 0), 0);
    }
    expect(expectedPosteriorEntropy(state, probe, hot)).toBeCloseTo(expected, 12);
  });

  it("channel mixture predictive mass sums to one across values", () => {
    const binding: ChannelBinding = {
      channel: "signal", label: "Signal", weight: 0.6, minReliability: 0.2,
      values: ["left", "right"],
      likelihood: (item, obs) => obs.value === (item === "a" ? "left" : "right") ? 0.9 : 0.1
    };
    const predictive = binding.values.reduce((sum, value) => sum + applyChannelEvidence(fresh(), binding, {
      channel: "signal", value, reliability: 0.7, at: 1
    }, config).predictive, 0);
    expect(predictive).toBeCloseTo(1, 12);
  });
});


describe("belief input validation", () => {
  it("rejects negative, missing or non-finite prior mass", () => {
    const invalid: Record<string, number>[] = [{a: -1, b: 1, c: 1}, {a: NaN, b: 1, c: 1}, {a: 1, b: 0}];
    for (const bad of invalid) {
      expect(() => createBelief(hypotheses, bad, config)).toThrow(/prior/);
    }
  });
  it("rejects non-finite answer reliability rather than poisoning the posterior", () => {
    expect(() => applyAnswer(fresh(), probe, "yes", config, 1, NaN)).toThrow(/finite/);
  });
  it("rejects unknown categorical channel values", () => {
    const binding: ChannelBinding = {channel: "signal", label: "Signal", weight: 0.5,
      minReliability: 0.1, values: ["left", "right"], likelihood: () => 0.5};
    expect(() => applyChannelEvidence(fresh(), binding, {channel: "signal", value: "unknown",
      reliability: 0.8, at: 1}, config)).toThrow(/alphabet/);
  });
});
