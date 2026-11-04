import { describe, expect, it } from "vitest";
import { PerformanceSession } from "@loki/showrunner";
import { cardEffect } from "../src/index.js";

/**
 * F12, honest regime: low-gaze / failed-calibration fallback.
 *
 * Semantic change (honesty repair): the 11-03 build replaced the statement loop
 * with a "card-equivocation-gesture" (magician's-choice pantomime) whose
 * 0.0-likelihood updates HARD-eliminated cards regardless of actual spectator
 * behavior, then committed through a hard-coded 0.60 bar in at most 2 beats.
 * That choreography produced 12-16% wrong confident reveals on the held-out
 * gate and was removed from the shipping probe set (the probes remain exported
 * for lab research). The honest fallback for weak or missing gaze is the
 * ordinary statement loop: full budget, 0.96 commit bar, abstain when the
 * evidence cannot commit. These tests pin that contract.
 */

function answerTruthfully(session: PerformanceSession, trueId: string): void {
  const view = session.snapshot();
  const probe = cardEffect.probes(session.stage).find((p) => p.id === view.probeId);
  if (!probe) throw new Error(`unknown probe ${view.probeId}`);
  let best = view.options![0]!.id;
  let bestP = -1;
  for (const option of view.options!) {
    const p = probe.likelihood(trueId, option.id);
    if (p > bestP) {
      bestP = p;
      best = option.id;
    }
  }
  session.answer(best);
  session.clearAck();
}

describe("F12 honest fallback: weak or missing gaze uses the ordinary statement loop", () => {
  it("low-reliability gaze (< 0.50) leads with a shipping statement, never the gesture", () => {
    const session = new PerformanceSession(cardEffect, {
      seed: 42,
      cameraEnabled: true,
      cameraValidated: true,
      presenceEnabled: true
    });
    session.begin();
    session.chosen();
    expect(session.addGaze({ zone: "top-left", reliability: 0.45 })).toBe(true);
    session.finishAttune();

    expect(session.phaseName).toBe("probe");
    const view = session.snapshot();
    expect(view.probeId).not.toBe("card-equivocation-gesture");
    const probe = cardEffect.probes(session.stage).find((p) => p.id === view.probeId)!;
    expect(probe.discourse).toBe("statement");
    // Honest budget, not the 2-beat equivocation clamp.
    expect(session.effectiveMaxProbes).toBeGreaterThanOrEqual(4);
  });

  it("failed camera calibration also leads with a shipping statement", () => {
    const session = new PerformanceSession(cardEffect, {
      seed: 43,
      cameraEnabled: true,
      cameraValidated: false,
      presenceEnabled: true
    });
    session.begin();
    session.chosen();
    session.finishAttune();

    expect(session.phaseName).toBe("probe");
    const view = session.snapshot();
    expect(view.probeId).not.toBe("card-equivocation-gesture");
    const probe = cardEffect.probes(session.stage).find((p) => p.id === view.probeId)!;
    expect(probe.discourse).toBe("statement");
    expect(session.effectiveMaxProbes).toBe(cardEffect.config.maxProbes);
  });

  it("truthful low-gaze run commits at the honest bar or misses; never bluffs", () => {
    for (const trueId of ["s-a", "d-3", "h-4", "c-k"]) {
      const session = new PerformanceSession(cardEffect, {
        seed: 44,
        cameraEnabled: true,
        cameraValidated: true,
        presenceEnabled: true
      });
      session.begin();
      session.chosen();
      session.addGaze({ zone: "top-left", reliability: 0.45 });
      session.finishAttune();
      for (let guard = 0; guard < 10; guard++) {
        if (session.phaseName === "recover") {
          session.advance();
          continue;
        }
        if (session.phaseName !== "probe") break;
        answerTruthfully(session, trueId);
      }
      expect(["build", "miss"]).toContain(session.phaseName);
      if (session.phaseName === "build") {
        expect(session.internal().revealedId).toBe(trueId);
        expect(session.internal().confidence).toBeGreaterThanOrEqual(0.96);
      }
    }
  });

  it("no answer ever hard-eliminates: contradicted cards keep nonzero recovery weight", () => {
    const session = new PerformanceSession(cardEffect, {
      seed: 45,
      cameraEnabled: true,
      cameraValidated: true,
      presenceEnabled: true
    });
    session.begin();
    session.chosen();
    session.addGaze({ zone: "top-left", reliability: 0.45 });
    session.finishAttune();
    // Lie once (answer against the true card), then answer truthfully.
    const trueId = "s-a";
    const view = session.snapshot();
    const probe = cardEffect.probes(session.stage).find((p) => p.id === view.probeId)!;
    let truthful = view.options![0]!.id;
    let bestP = -1;
    for (const option of view.options!) {
      const p = probe.likelihood(trueId, option.id);
      if (p > bestP) {
        bestP = p;
        truthful = option.id;
      }
    }
    const lie = view.options!.find((o) => o.id !== truthful)!;
    session.answer(lie.id);
    session.clearAck();
    // The true card's posterior is reduced but NOT zeroed: outlier weight keeps
    // a recovery path (the 11-03 gesture zeroed whole halves unconditionally).
    const post = session.internal().posterior;
    expect(post[trueId]).toBeGreaterThan(0);
  });
});
