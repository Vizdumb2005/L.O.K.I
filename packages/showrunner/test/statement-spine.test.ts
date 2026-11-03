import { describe, expect, it } from "vitest";
import { PerformanceSession } from "../src/index.js";
import { uniformPrior, type Effect, type Hypothesis, type Probe } from "@loki/effect-api";

const hypotheses: Hypothesis[] = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" }
];

function makeEffect(probes: Probe[], overrides: Partial<Effect> = {}): Effect {
  const base: Effect = {
    id: "spine-test",
    name: "Spine test",
    tagline: "Test",
    config: {
      maxProbes: 3,
      commitThreshold: 0.85,
      recoveryBudget: 0,
      recoverySurprise: 2.2,
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
        { id: "invite", kind: "invite", line: "This is an illusion. You can stop." },
        { id: "think", kind: "think", line: "Choose one." },
        { id: "build", kind: "build", line: "It is clearing." },
        { id: "reveal", kind: "reveal", line: "Ready." },
        { id: "afterglow", kind: "afterglow", line: "The choice was yours." }
      ],
      buildLines: ["One is left."],
      revealLine: (item) => `It is ${item.label}.`,
      recoverLine: "Two signals are fighting.",
      missLine: "You beat me."
    }),
    stage: () => ({
      renderer: "grid",
      columns: 2,
      title: "Test",
      instructions: "Choose.",
      items: hypotheses.map((h) => ({ hypothesisId: h.id, label: h.label }))
    }),
    validate: () => undefined
  };
  return { ...base, ...overrides };
}

describe("statement spine", () => {
  it("statements are presented in effect order before any question", () => {
    const s1: Probe = { id: "s1", prompt: "First image rests.", discourse: "statement", options: [{ id: "yes", label: "True" }, { id: "no", label: "That's wrong" }], cost: 0.1, likelihood: (_i, o) => (o === "yes" ? 0.6 : 0.4) };
    const s2: Probe = { id: "s2", prompt: "Second image rests.", discourse: "statement", options: [{ id: "yes", label: "True" }, { id: "no", label: "That's wrong" }], cost: 0.1, likelihood: (_i, o) => (o === "yes" ? 0.6 : 0.4) };
    const q: Probe = { id: "q1", prompt: "Is it Alpha?", options: [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }], cost: 0.1, likelihood: (item, o) => (o === "yes" ? (item === "a" ? 1 : 0) : item === "a" ? 0 : 1) };
    const session = new PerformanceSession(makeEffect([s1, s2, q]), { seed: 2 });
    session.begin(); session.chosen();
    expect(session.snapshot().probeId).toBe("s1");
    session.answer("yes"); session.clearAck();
    expect(session.snapshot().probeId).toBe("s2");
  });

  it("a genuine tie after statements are exhausted triggers exactly one tie-break question", () => {
    const neutralStatement: Probe = {
      id: "s-neutral",
      prompt: "A quiet image rests on the screen.",
      discourse: "statement",
      options: [{ id: "yes", label: "True" }, { id: "no", label: "That's wrong" }],
      cost: 0.1,
      likelihood: (_item, option) => (option === "yes" ? 0.5 : 0.5)
    };
    const question: Probe = {
      id: "q-alpha",
      prompt: "Is it Alpha?",
      discourse: "question",
      options: [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }],
      cost: 0.1,
      likelihood: (item, option) => (option === "yes" ? (item === "a" ? 1 : 0) : item === "a" ? 0 : 1)
    };
    const session = new PerformanceSession(makeEffect([neutralStatement, question]), { seed: 2 });
    session.begin();
    session.chosen();
    expect(session.snapshot().probeId).toBe("s-neutral");
    session.answer("yes");
    session.clearAck();
    expect(session.snapshot().probeId).toBe("q-alpha");
    session.answer("yes");
    session.clearAck();
    // Question answered; no second generic question is presented.
    expect(session.phaseName).not.toBe("probe");
  });

  it("pool-exhausted non-tie commits or misses without a question", () => {
    const strongStatement: Probe = {
      id: "s-strong",
      prompt: "Alpha rests alone on the screen.",
      discourse: "statement",
      options: [{ id: "yes", label: "True" }, { id: "no", label: "That's wrong" }],
      cost: 0.1,
      likelihood: (item, option) => (option === "yes" ? (item === "a" ? 1 : 0) : item === "a" ? 0 : 1)
    };
    const question: Probe = {
      id: "q-alpha",
      prompt: "Is it Alpha?",
      options: [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }],
      cost: 0.1,
      likelihood: (item, option) => (option === "yes" ? (item === "a" ? 1 : 0) : item === "a" ? 0 : 1)
    };
    const session = new PerformanceSession(makeEffect([strongStatement, question]), { seed: 2 });
    session.begin();
    session.chosen();
    expect(session.snapshot().probeId).toBe("s-strong");
    session.answer("yes");
    session.clearAck();
    expect(session.snapshot().probeId).not.toBe("q-alpha");
    expect(["build", "miss"]).toContain(session.phaseName);
  });
});
