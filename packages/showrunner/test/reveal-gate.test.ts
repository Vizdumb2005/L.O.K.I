import { describe, expect, it } from "vitest";
import { uniformPrior, type Effect, type Hypothesis, type Probe, type ShowScript } from "@loki/effect-api";
import { PerformanceSession } from "../src/session.js";

const hypotheses: Hypothesis[] = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" }
];

const probes: Probe[] = [
  {
    id: "p1",
    prompt: "Is it Alpha?",
    options: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" }
    ],
    cost: 0.1,
    likelihood: (item, option) => (option === "yes" ? (item === "a" ? 1 : 0) : item === "a" ? 0 : 1)
  },
  {
    id: "p2",
    prompt: "Does it feel first?",
    options: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" }
    ],
    cost: 0.1,
    likelihood: (item, option) => (option === "yes" ? (item === "a" ? 0.9 : 0.1) : item === "a" ? 0.1 : 0.9)
  }
];

function makeEffect(script: Partial<ShowScript>): Effect {
  return {
    id: "reveal-gate-test",
    name: "Reveal gate test",
    tagline: "Test",
    config: {
      maxProbes: 2,
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
        { id: "invite", kind: "invite", line: "An illusion." },
        { id: "think", kind: "think", line: "Choose one." },
        { id: "build", kind: "build", line: "It is clearing." },
        { id: "reveal", kind: "reveal", line: "Ready." },
        { id: "afterglow", kind: "afterglow", line: "The choice was yours." }
      ],
      buildLines: ["One remains."],
      revealLine: (item) => `It was ${item.label}.`,
      recoverLine: "One clean question.",
      missLine: "You beat me.",
      ...script
    }),
    stage: () => ({
      renderer: "grid",
      columns: 2,
      title: "Test",
      instructions: "Pick one.",
      items: hypotheses.map((h) => ({ hypothesisId: h.id, label: h.label }))
    }),
    validate: () => {}
  };
}

function driveToReveal(effect: Effect): PerformanceSession {
  const session = new PerformanceSession(effect, { seed: 7 });
  session.begin();
  session.chosen();
  for (let i = 0; i < 12; i++) {
    const phase = session.phaseName;
    if (phase === "probe") {
      session.answer(session.snapshot().options![0]!.id);
      continue;
    }
    if (phase === "build") {
      session.advance();
      break;
    }
    if (phase === "reveal" || phase === "miss") break;
    session.advance();
  }
  return session;
}

describe("user-performed reveal gate", () => {
  it("exposes the gate during the reveal when the script asks for it", () => {
    const session = driveToReveal(
      makeEffect({ revealInvite: "You turn it over.", revealAction: "Turn it over" })
    );
    const view = session.snapshot();
    expect(view.phase).toBe("reveal");
    expect(view.revealGate).toEqual({ invite: "You turn it over.", action: "Turn it over" });
    // The reveal itself is still present; only the lighting is gated (client-side).
    expect(view.reveal).toBeDefined();
  });

  it("is absent when the script does not ask for it", () => {
    const session = driveToReveal(makeEffect({}));
    const view = session.snapshot();
    expect(view.phase).toBe("reveal");
    expect(view.revealGate).toBeUndefined();
  });
});
