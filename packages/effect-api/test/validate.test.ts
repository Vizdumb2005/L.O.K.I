import { describe, expect, it } from "vitest";
import {
  checkEffect,
  findBannedClaim,
  uniformPrior,
  type Effect,
  type Hypothesis,
  type Probe
} from "../src/index.js";

const hypotheses: Hypothesis[] = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" }
];

const probes: Probe[] = [
  {
    id: "p1",
    prompt: "Is it A?",
    options: [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }],
    cost: 0.2,
    likelihood: (item, option) => (option === "yes" ? (item === "a" ? 1 : 0) : item === "a" ? 0 : 1)
  },
  {
    id: "p2",
    prompt: "Does it feel first?",
    options: [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }],
    cost: 0.3,
    likelihood: (item, option) => (option === "yes" ? (item === "a" ? 0.8 : 0.2) : item === "a" ? 0.2 : 0.8)
  }
];

function makeEffect(overrides: Partial<Effect> = {}): Effect {
  const base: Effect = {
    id: "test",
    name: "Test effect",
    tagline: "A test",
    config: {
      maxProbes: 3,
      commitThreshold: 0.85,
      recoveryBudget: 1,
      recoverySurprise: 3,
      epsilon: 0.1,
      outlierWeight: 0.05,
      temperature: 1,
      costWeight: 0.02,
      gazeEnabledByDefault: false
    },
    hypotheses: () => hypotheses,
    prior: () => uniformPrior(hypotheses),
    probes: () => probes,
    channels: () => [],
    script: () => ({
      beats: [
        { id: "invite", kind: "invite", line: "Welcome to the illusion." },
        { id: "think", kind: "think", line: "Think of one." },
        { id: "build", kind: "build", line: "Narrowing." },
        { id: "reveal", kind: "reveal", line: "It is {item}." },
        { id: "afterglow", kind: "afterglow", line: "Thank you." }
      ],
      buildLines: ["The signal is clearing."],
      revealLine: (item) => `It is ${item.label}.`,
      recoverLine: "Two signals are fighting.",
      missLine: "You beat me."
    }),
    stage: () => ({
      renderer: "grid",
      columns: 2,
      title: "Test",
      instructions: "Pick one.",
      items: [
        { hypothesisId: "a", label: "Alpha" },
        { hypothesisId: "b", label: "Beta" }
      ]
    }),
    validate: () => undefined
  };
  return { ...base, ...overrides };
}

describe("effect validation", () => {
  it("accepts a well-formed effect", () => {
    expect(checkEffect(makeEffect())).toEqual([]);
  });

  it("rejects a prior that does not sum to one", () => {
    const effect = makeEffect({ prior: () => ({ a: 0.8, b: 0.5 }) });
    expect(checkEffect(effect).join(" ")).toContain("prior sums");
  });

  it("rejects a non-stochastic likelihood row", () => {
    const badProbe = {
      ...probes[0]!,
      likelihood: () => 0.7
    };
    const effect = makeEffect({ probes: () => [badProbe, probes[1]!] });
    expect(checkEffect(effect).join(" ")).toContain("sums to");
  });

  it("rejects a stage that does not cover every hypothesis", () => {
    const effect = makeEffect({
      stage: () => ({
        renderer: "grid",
        columns: 1,
        title: "Broken",
        instructions: "Pick",
        items: [{ hypothesisId: "a", label: "Alpha" }]
      })
    });
    expect(checkEffect(effect).join(" ")).toContain("stage is missing hypothesis b");
  });

  it("rejects banned claims in the script", () => {
    const effect = makeEffect({
      script: () => {
        const s = makeEffect().script();
        return { ...s, missLine: "I never miss. I can read your mind." };
      }
    });
    const issues = checkEffect(effect).join(" ");
    expect(issues).toContain("banned claim");
  });
});

describe("claim filter", () => {
  it("catches explicit mind-reading and guarantees", () => {
    expect(findBannedClaim("I can read your mind")).not.toBeNull();
    expect(findBannedClaim("This is 100% guaranteed")).not.toBeNull();
    expect(findBannedClaim("A diagnosis of your personality")).not.toBeNull();
  });

  it("allows honest mentalism framing", () => {
    expect(findBannedClaim("This is an illusion, not mind reading.")).toBeNull();
    expect(findBannedClaim("You beat me. That was a good game.")).toBeNull();
    expect(findBannedClaim("A moment of mentalism.")).toBeNull();
  });
});
