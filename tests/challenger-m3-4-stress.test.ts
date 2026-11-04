import { describe, expect, it } from "vitest";
import { PerformanceSession } from "../packages/showrunner/src/session.js";
import { cardEffect } from "../effects/card/src/index.js";

/**
 * Milestone 3 Iteration 2 stress suite, honest regime.
 *
 * Semantic change (honesty repair): the 11-03 version of this suite pinned the
 * equivocation choreography end to end - the gesture probe lead, hard
 * eliminations, 2-beat commits to CARD_FORCE_TARGET at a 0.60 bar regardless
 * of the spectator's answers (Suites 3/5/6 literally asserted the force target
 * is revealed no matter what was answered). That is precisely the dishonesty
 * the held-out gate caught (12-16% wrong confident reveals). The choreography
 * was removed from the shipping probe set. This suite keeps each original
 * stress dimension as an honest invariant instead.
 */

function answerTruthfully(session: PerformanceSession, trueId: string): void {
  const view = session.snapshot();
  const probe = cardEffect.probes(session.stage).find((pr) => pr.id === view.probeId);
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

function answerAdversarial(session: PerformanceSession, refId: string): void {
  const view = session.snapshot();
  const probe = cardEffect.probes(session.stage).find((pr) => pr.id === view.probeId);
  if (!probe) throw new Error(`unknown probe ${view.probeId}`);
  let worst = view.options![0]!.id;
  let worstP = Infinity;
  for (const option of view.options!) {
    const p = probe.likelihood(refId, option.id);
    if (p < worstP) {
      worstP = p;
      worst = option.id;
    }
  }
  session.answer(worst);
  session.clearAck();
}

function zoneCardsOf(stage: any, zoneId: string): string[] {
  return stage.items
    .filter((_: any, idx: number) => {
      const row = Math.floor(idx / stage.columns);
      const col = idx % stage.columns;
      const half = col < stage.columns / 2 ? 0 : 1;
      return stage.zones![row * 2 + half]!.id === zoneId;
    })
    .map((i: any) => i.hypothesisId);
}

function drive(session: PerformanceSession, answer: () => void): void {
  for (let guard = 0; guard < 12; guard++) {
    const phase = session.phaseName;
    if (phase === "build" || phase === "miss" || phase === "reveal" || phase === "afterglow" || phase === "done") break;
    if (phase === "recover") {
      session.advance();
      continue;
    }
    if (phase === "probe") answer();
  }
}

describe("Milestone 3 Iteration 2 Challenger M3-4 Empirical Stress Suite (honest regime)", () => {
  it("Suite 1: 100-trial truthful sweep across uncalibrated / dropped / accepted gaze", () => {
    let committed = 0;
    let missed = 0;
    let wrong = 0;
    for (let trial = 0; trial < 100; trial++) {
      const seed = 3000 + trial;
      const isUncalibrated = trial < 50;
      const reliability = isUncalibrated ? 0 : 0.10 + (trial - 50) * (0.39 / 49);
      const session = new PerformanceSession(cardEffect, {
        seed,
        cameraEnabled: true,
        cameraValidated: !isUncalibrated,
        presenceEnabled: true
      });
      session.begin();
      session.chosen();
      const stage = session.stage;
      const targetZone = stage.zones![trial % 6]!.id;
      const trueId = zoneCardsOf(stage, targetZone)[trial % 2]!;
      if (!isUncalibrated) session.addGaze({ zone: targetZone, reliability });
      session.finishAttune();
      expect(session.phaseName).toBe("probe");
      expect(session.snapshot().probeId).not.toBe("card-equivocation-gesture");
      drive(session, () => answerTruthfully(session, trueId));
      if (session.phaseName === "build") {
        committed++;
        if (session.internal().revealedId !== trueId) wrong++;
        expect(session.internal().confidence).toBeGreaterThanOrEqual(0.96);
      } else {
        missed++;
        expect(session.phaseName).toBe("miss");
      }
      expect(session.internal().answered).toBeLessThanOrEqual(8);
    }
    console.log(`Suite 1 honest sweep: committed=${committed} missed=${missed} wrong=${wrong}`);
    expect(wrong).toBe(0);
    expect(committed).toBeGreaterThan(0);
  });

  it("Suite 2: adversarial answers across 100 trials - budget and bar never breached", () => {
    const violations: Array<{ seed: number; answered: number; finalPhase: string }> = [];
    for (let seed = 1; seed <= 100; seed++) {
      const session = new PerformanceSession(cardEffect, {
        seed,
        cameraEnabled: true,
        cameraValidated: true,
        presenceEnabled: true
      });
      session.begin();
      session.chosen();
      session.addGaze({ zone: session.stage.zones![seed % 6]!.id, reliability: 0.45 });
      session.finishAttune();
      drive(session, () => answerAdversarial(session, "s-a"));
      const internal = session.internal();
      const committedLow = session.phaseName === "build" && internal.confidence < 0.96;
      if (internal.answered > cardEffect.config.maxProbes + 1 || committedLow) {
        violations.push({ seed, answered: internal.answered, finalPhase: session.phaseName });
      }
    }
    console.log(`Suite 2 honest adversarial sweep: ${violations.length} violations`);
    expect(violations.length).toBe(0);
  });

  it("Suite 3: option invariance - every valid option sequence keeps the run sound", () => {
    // Original intent: the show must not break or bluff whatever the spectator
    // picks. Honest regime: for each beat-1 option of the actual lead probe,
    // the run stays in a valid phase, never commits wrong, never exceeds budget.
    for (let s = 1; s <= 20; s++) {
      const probeSession = new PerformanceSession(cardEffect, {
        seed: s * 10,
        cameraEnabled: true,
        cameraValidated: false
      });
      probeSession.begin();
      probeSession.chosen();
      probeSession.finishAttune();
      const view = probeSession.snapshot();
      expect(view.probeId).not.toBe("card-equivocation-gesture");
      for (const opt of view.options!) {
        const session = new PerformanceSession(cardEffect, {
          seed: s * 10,
          cameraEnabled: true,
          cameraValidated: false
        });
        session.begin();
        session.chosen();
        session.finishAttune();
        session.answer(opt.id);
        session.clearAck();
        // Truthful-ish continuation for a fixed card keeps driving
        drive(session, () => answerTruthfully(session, "h-a"));
        expect(["build", "miss", "reveal", "probe", "recover"]).toContain(session.phaseName);
        if (session.phaseName === "build") {
          expect(session.internal().confidence).toBeGreaterThanOrEqual(0.96);
        }
        expect(session.internal().answered).toBeLessThanOrEqual(8);
      }
    }
  });

  it("Suite 4: zone invariance - truthful runs resolve equivalently across all zones", () => {
    // Original intent: black-card zones must not trigger false contradictions.
    // Honest regime: no zone produces a contradiction or a wrong reveal.
    for (let seed = 1; seed <= 10; seed++) {
      const template = new PerformanceSession(cardEffect, { seed });
      const zones = template.stage.zones!;
      for (const zone of zones) {
        for (const pick of [0, 1]) {
          const session = new PerformanceSession(cardEffect, {
            seed,
            cameraEnabled: true,
            cameraValidated: true
          });
          session.begin();
          session.chosen();
          const trueId = zoneCardsOf(session.stage, zone.id)[pick]!;
          // Dropped low-reliability gaze (0.25 < minReliability 0.35)
          session.addGaze({ zone: zone.id, reliability: 0.25 });
          session.finishAttune();
          expect(session.snapshot().probeId).not.toBe("card-equivocation-gesture");
          drive(session, () => answerTruthfully(session, trueId));
          expect(["build", "miss"]).toContain(session.phaseName);
          if (session.phaseName === "build") {
            expect(session.internal().revealedId).toBe(trueId);
            expect(session.internal().confidence).toBeGreaterThanOrEqual(0.96);
          }
          expect(session.internal().answered).toBeLessThanOrEqual(8);
        }
      }
    }
  });

  it("Suite 5: calibrated camera but zero gaze windows - the statement loop carries the show", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const session = new PerformanceSession(cardEffect, {
        seed,
        cameraEnabled: true,
        cameraValidated: true
      });
      session.begin();
      session.chosen();
      session.finishAttune();
      expect(session.phaseName).toBe("probe");
      expect(session.snapshot().probeId).not.toBe("card-equivocation-gesture");
      const trueId = session.stage.items[seed % 12]!.hypothesisId;
      drive(session, () => answerTruthfully(session, trueId));
      expect(["build", "miss"]).toContain(session.phaseName);
      if (session.phaseName === "build") {
        expect(session.internal().revealedId).toBe(trueId);
        expect(session.internal().confidence).toBeGreaterThanOrEqual(0.96);
      }
      expect(session.internal().answered).toBeLessThanOrEqual(8);
    }
  });

  it("Suite 6: extremely low gaze reliability (0.05) is ignored; the statement loop carries the show", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const session = new PerformanceSession(cardEffect, {
        seed,
        cameraEnabled: true,
        cameraValidated: true
      });
      session.begin();
      session.chosen();
      session.addGaze({ zone: "top-left", reliability: 0.05 });
      session.finishAttune();
      expect(session.internal().gazeWindows).toBe(0);
      expect(session.snapshot().probeId).not.toBe("card-equivocation-gesture");
      const trueId = session.stage.items[seed % 12]!.hypothesisId;
      drive(session, () => answerTruthfully(session, trueId));
      expect(["build", "miss"]).toContain(session.phaseName);
      if (session.phaseName === "build") {
        expect(session.internal().revealedId).toBe(trueId);
        expect(session.internal().confidence).toBeGreaterThanOrEqual(0.96);
      }
      expect(session.internal().answered).toBeLessThanOrEqual(8);
    }
  });
});
