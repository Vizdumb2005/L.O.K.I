import { describe, expect, it } from "vitest";
import { PerformanceSession } from "@loki/showrunner";
import { cardEffect } from "../src/index.js";

// Answer truthfully on behalf of the spectator's actual card: pick the option
// whose likelihood is highest for that card on the session's current probe.
function answerTruth(session: PerformanceSession, trueId: string): void {
  const view = session.snapshot();
  const probe = cardEffect.probes(session.stage).find((p) => p.id === view.probeId);
  if (!probe) throw new Error("no probe");
  let best = probe.options[0]!.id;
  let bestP = -1;
  for (const option of probe.options) {
    const p = probe.likelihood(trueId, option.id);
    if (p > bestP) {
      bestP = p;
      best = option.id;
    }
  }
  session.answer(best);
  session.clearAck();
}

function gazedBuild(attuneEndMs: number) {
  let now = 0;
  const session = new PerformanceSession(cardEffect, {
    seed: 11,
    cameraEnabled: true,
    cameraValidated: true,
    presenceEnabled: true,
    now: () => now
  });
  session.begin();
  session.chosen();
  expect(session.phaseName).toBe("attune");
  const zone = session.stage.zones![0]!.id;
  session.addGaze({ zone, reliability: 0.8 });
  session.addGaze({ zone, reliability: 0.8 });
  now = attuneEndMs;
  session.finishAttune();
  expect(session.phaseName).toBe("probe");
  // Honest regime: gaze zones hold 2 cards at ~0.47 each, so one answer no
  // longer commits at the 0.96 bar (the 11-03 build committed here only via
  // its 0.60 gaze trapdoor). Answer truthfully for a zone-0 card until the
  // session commits, bounded by the honest probe budget.
  const trueId = session.stage.items[0]!.hypothesisId;
  for (let i = 0; i < 8 && session.phaseName !== "build"; i++) {
    if (session.phaseName === "recover") {
      session.advance();
      continue;
    }
    if (session.phaseName === "probe") answerTruth(session, trueId);
  }
  expect(session.phaseName).toBe("build");
  expect(session.internal().revealedId).toBe(trueId);
  return session;
}

describe("time misdirection", () => {
  it("brief attune selects bucket 0 and build exposes no reveal candidate", () => {
    const session = gazedBuild(5_000);
    const view = session.snapshot();
    expect(view.reveal).toBeUndefined();
    expect(session.internal().revealedId).toBeDefined();
    const lines = view.cues.map((c) => c.line);
    expect(lines).toContain(cardEffect.script().timeBeatLines![0]);
    for (const line of lines) expect(line).not.toMatch(/\d+\s*(ms|second)/i);
    session.advance();
    expect(session.snapshot().reveal?.id).toBe(session.internal().revealedId);
  });

  it("settled attune selects bucket 1", () => {
    const session = gazedBuild(15_000);
    expect(session.snapshot().cues.map((c) => c.line)).toContain(cardEffect.script().timeBeatLines![1]);
  });

  it("long attune selects bucket 2", () => {
    const session = gazedBuild(30_000);
    expect(session.snapshot().cues.map((c) => c.line)).toContain(cardEffect.script().timeBeatLines![2]);
  });

  it("no-attune sessions have no time cue and view carries no progress/resonance", () => {
    const session = new PerformanceSession(cardEffect, { seed: 7 });
    session.begin();
    session.chosen();
    const view = session.snapshot();
    expect(view).not.toHaveProperty("progress");
    expect(view).not.toHaveProperty("resonance");
    expect(typeof view.turn).toBe("number");
    const timeLines = cardEffect.script().timeBeatLines!;
    for (const cue of view.cues) expect(timeLines).not.toContain(cue.line);
  });
});
