import { describe, expect, it } from "vitest";
import { cardEffect } from "../effects/card/src/index.js";
import {
  CARDS,
  CARD_BY_ID,
  CARD_PROBES,
  CARD_STAGE_BASE,
  EQUIVOCATION_PROBE,
  denialPivotForPair,
  zoneStatementsForStage
} from "../effects/card/src/cards.js";
import { PerformanceSession } from "../packages/showrunner/src/session.js";
import { posterior } from "../packages/engine/src/belief.js";

describe("Milestone 3 Challenger Empirical Adversarial Stress Suite", () => {
  // Honest-regime drivers. Semantic change (honesty repair): the 11-03 suite
  // scripted yes/no/cast-black answers against the equivocation choreography
  // (hard-eliminating zone probes, 0.60 commit bar, 2-probe clamp). That regime
  // produced 12-16% wrong confident reveals on the held-out gate and was
  // removed. Shipping probes are statements with varying option shapes, so
  // tests drive options by likelihood, not by hardcoded option ids.
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

  // Adversarial drive: repeatedly answer the option LEAST consistent with a
  // fixed reference card - the honest-regime analogue of scripted "no" spam.
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

  // =========================================================================
  // OBJECTIVE 3: Patter Length Boundary (<= 160 chars)
  // =========================================================================
  describe("Objective 3: Patter Length Boundary (<= 160 chars)", () => {
    it("asserts all CARD_PROBES prompt strings <= 160 characters", () => {
      for (const probe of CARD_PROBES) {
        expect(
          probe.prompt.length,
          `CARD_PROBES [${probe.id}] length ${probe.prompt.length} exceeds 160: "${probe.prompt}"`
        ).toBeLessThanOrEqual(160);
      }
    });

    it("asserts all zoneStatementsForStage prompts <= 160 across 50 random shuffles", () => {
      for (let seed = 1; seed <= 50; seed++) {
        const session = new PerformanceSession(cardEffect, { seed });
        const statements = zoneStatementsForStage(session.stage);
        expect(statements.length).toBe(6);
        for (const probe of statements) {
          expect(
            probe.prompt.length,
            `Seed ${seed} Zone probe [${probe.id}] length ${probe.prompt.length} exceeds 160: "${probe.prompt}"`
          ).toBeLessThanOrEqual(160);
        }
      }
    });

    it("asserts EQUIVOCATION_PROBE prompt string <= 160 characters", () => {
      expect(
        EQUIVOCATION_PROBE.prompt.length,
        `EQUIVOCATION_PROBE prompt length ${EQUIVOCATION_PROBE.prompt.length} exceeds 160: "${EQUIVOCATION_PROBE.prompt}"`
      ).toBeLessThanOrEqual(160);
    });

    it("asserts denialPivotForPair <= 160 across all 144 card pair combinations", () => {
      for (const cardA of CARDS) {
        for (const cardB of CARDS) {
          if (cardA.id === cardB.id) continue;
          const pivot = denialPivotForPair(cardA, cardB);
          expect(
            pivot.length,
            `denialPivotForPair(${cardA.id}, ${cardB.id}) length ${pivot.length} exceeds 160: "${pivot}"`
          ).toBeLessThanOrEqual(160);
        }
      }
    });
  });

  // =========================================================================
  // OBJECTIVE 2: Denial Pivot Coverage Across All 12 Cards
  // =========================================================================
  describe("Objective 2: Denial Pivot Coverage Across All 12 Cards", () => {
    it("truthful resolution across all 6 zones and 12 cards at the honest bar", () => {
      // Honest regime: replaces the 11-03 denial-pivot commit test. For every
      // seed layout, every zone, and both cards of the zone, a truthful run
      // after two gaze windows must commit to the true card at the 0.96 bar
      // within the probe budget - never via a relaxed gaze bar.
      for (let seed = 10; seed <= 20; seed++) {
        const templateSession = new PerformanceSession(cardEffect, {
          seed,
          cameraEnabled: true,
          cameraValidated: true,
          presenceEnabled: true
        });
        const stage = templateSession.stage;
        const zones = stage.zones!;
        expect(zones.length).toBe(6);

        for (const zone of zones) {
          const pair = zoneCardsOf(stage, zone.id);
          expect(pair.length).toBe(2);

          for (const trueId of pair) {
            const session = new PerformanceSession(cardEffect, {
              seed,
              cameraEnabled: true,
              cameraValidated: true,
              presenceEnabled: true
            });
            session.begin();
            session.chosen();
            session.addGaze({ zone: zone.id, reliability: 0.88 });
            session.addGaze({ zone: zone.id, reliability: 0.88 });
            session.finishAttune();

            expect(session.phaseName).toBe("probe");
            for (let guard = 0; guard < 8 && session.phaseName === "probe"; guard++) {
              answerTruthfully(session, trueId);
            }
            const internal = session.internal();
            expect(session.phaseName).toBe("build");
            expect(internal.revealedId).toBe(trueId);
            expect(internal.answered).toBeLessThanOrEqual(6);
            expect(internal.confidence).toBeGreaterThanOrEqual(0.96);
          }
        }
      }
    });
  });

  describe("Objective 1: Probe Clamping Enforcement Under Adversarial Sequences", () => {
    it("asserts rapid clicks while ackCue is pending are rejected and do not advance answered count", () => {
      // In un-gazed mode where minProbes = 2, first answer leaves phase as probe while ackCue is active
      const session = new PerformanceSession(cardEffect, {
        seed: 42,
        cameraEnabled: false,
        presenceEnabled: false
      });
      session.begin();
      session.chosen();

      expect(session.phaseName).toBe("probe");
      const firstOption = session.snapshot().options?.[0]?.id;
      if (!firstOption) throw new Error("expected a first probe option");
      session.answer(firstOption);

      // While ackCue is pending, subsequent clicks must be rejected
      const answeredBefore = session.internal().answered;
      expect(answeredBefore).toBe(1);

      // Attempt rapid second answer without clearing ackCue
      const secondOption = session.snapshot().options?.[0]?.id ?? firstOption;
      session.answer(secondOption);
      expect(session.internal().answered).toBe(1);

      // Clear ackCue; now next answer is accepted
      session.clearAck();
      session.answer(secondOption);
      expect(session.internal().answered).toBe(2);
    });

    it("verifies unknown option strings throw an error and do not corrupt session state", () => {
      const session = new PerformanceSession(cardEffect, {
        seed: 42,
        cameraEnabled: true,
        cameraValidated: true,
        presenceEnabled: true
      });
      session.begin();
      session.chosen();
      session.addGaze({ zone: "top-left", reliability: 0.88 });
      session.finishAttune();

      expect(session.phaseName).toBe("probe");
      expect(() => session.answer("unrecognized-option")).toThrowError(/unknown option/);
      expect(session.internal().answered).toBe(0);
      expect(session.phaseName).toBe("probe");
    });

    it("verifies single-zone gaze resolves truthfully at the honest bar for both cards of the pair", () => {
      // Honest regime: one answer after gaze cannot commit (zone pair starts at
      // ~0.47/card); the 11-03 1-beat commits used 0.82/0.60 bars. Truthful
      // statements resolve either card within budget at 0.96.
      for (let seed = 1; seed <= 20; seed++) {
        for (const pick of [0, 1]) {
          const session = new PerformanceSession(cardEffect, {
            seed,
            cameraEnabled: true,
            cameraValidated: true,
            presenceEnabled: true
          });
          session.begin();
          session.chosen();
          const trueId = zoneCardsOf(session.stage, "top-left")[pick]!;
          session.addGaze({ zone: "top-left", reliability: 0.88 });
          session.addGaze({ zone: "top-left", reliability: 0.88 });
          session.finishAttune();
          expect(session.phaseName).toBe("probe");
          for (let guard = 0; guard < 8 && session.phaseName === "probe"; guard++) {
            answerTruthfully(session, trueId);
          }
          expect(session.phaseName).toBe("build");
          expect(session.internal().revealedId).toBe(trueId);
          expect(session.internal().answered).toBeLessThanOrEqual(6);
          expect(session.internal().confidence).toBeGreaterThanOrEqual(0.96);
        }
      }
    });

    // CRITICAL ADVERSARIAL TEST:
    // When gaze evidence exists, under NO circumstances does the session issue more than 2 probes.
    it("conflicting gaze + adversarial answers: terminates within the honest budget, never a relaxed commit", () => {
      // Honest invariant replacing the 11-03 2-probe clamp: with contradictory
      // evidence the show must END (miss/recovery) inside the honest budget and
      // must never commit below 0.96.
      const session = new PerformanceSession(cardEffect, {
        seed: 999,
        cameraEnabled: true,
        cameraValidated: true,
        presenceEnabled: true
      });
      session.begin();
      session.chosen();

      const stage = session.stage;
      session.addGaze({ zone: stage.zones![0]!.id, reliability: 0.55 });
      session.addGaze({ zone: stage.zones![1]!.id, reliability: 0.55 });
      session.finishAttune();

      let steps = 0;
      while (steps < 15) {
        steps++;
        const phase = session.phaseName;
        if (phase === "build" || phase === "miss" || phase === "reveal" || phase === "afterglow" || phase === "done") break;
        if (phase === "recover") {
          session.advance();
          continue;
        }
        if (phase === "probe") answerAdversarial(session, "s-a");
      }

      const internal = session.internal();
      console.log(`[Empirical Result] conflicting gaze adversarial: answered=${internal.answered}, finalPhase=${session.phaseName}`);
      // Honest budget: maxProbesGazed plus at most one CRIT-03 recovery statement.
      expect(internal.answered).toBeLessThanOrEqual(cardEffect.config.maxProbesGazed! + 1);
      if (session.phaseName === "build") {
        expect(internal.confidence).toBeGreaterThanOrEqual(0.96);
      }
    });

    it("sweeps 100 seeds with conflicting gaze and adversarial answers: budget and bar never breached", () => {
      // Honest invariant replacing the 11-03 clamp sweep: across 100 seeds, an
      // adversarial spectator under conflicting gaze never triggers a commit
      // below 0.96 and never exceeds the honest budget.
      const violations: Array<{ seed: number; answered: number; finalPhase: string; confidence: number }> = [];

      for (let seed = 1; seed <= 100; seed++) {
        const session = new PerformanceSession(cardEffect, {
          seed,
          cameraEnabled: true,
          cameraValidated: true,
          presenceEnabled: true
        });
        session.begin();
        session.chosen();

        const stage = session.stage;
        session.addGaze({ zone: stage.zones![0]!.id, reliability: 0.52 });
        session.addGaze({ zone: stage.zones![1]!.id, reliability: 0.52 });
        session.finishAttune();

        let steps = 0;
        while (steps < 10) {
          steps++;
          const phase = session.phaseName;
          if (phase === "build" || phase === "miss" || phase === "reveal" || phase === "afterglow" || phase === "done") break;
          if (phase === "recover") {
            session.advance();
            continue;
          }
          if (phase === "probe") answerAdversarial(session, "s-a");
        }

        const internal = session.internal();
        const committedLow = session.phaseName === "build" && internal.confidence < 0.96;
        if (internal.answered > cardEffect.config.maxProbesGazed! + 1 || committedLow) {
          violations.push({
            seed,
            answered: internal.answered,
            finalPhase: session.phaseName,
            confidence: internal.confidence
          });
        }
      }

      console.log(`[Empirical Result] Honest adversarial sweep: ${violations.length} of 100 seeds breached budget/bar`);
      if (violations.length > 0) console.log(`Sample violations:`, violations.slice(0, 5));
      expect(violations.length, `Honest budget/bar breached in ${violations.length} of 100 runs!`).toBe(0);
    });

    it("low-reliability gaze path: adversarial answers stay in the honest statement loop", () => {
      // Honest invariant replacing the 11-03 equivocation clamp sweep: the
      // gesture probe never appears, adversarial answers terminate within the
      // honest budget, and no commit lands below 0.96.
      const violations: Array<{ seed: number; answered: number; finalPhase: string }> = [];

      for (let seed = 1; seed <= 50; seed++) {
        const session = new PerformanceSession(cardEffect, {
          seed,
          cameraEnabled: true,
          cameraValidated: true,
          presenceEnabled: true
        });
        session.begin();
        session.chosen();
        session.addGaze({ zone: "top-left", reliability: 0.40 });
        session.finishAttune();

        let steps = 0;
        while (steps < 12) {
          steps++;
          const phase = session.phaseName;
          if (phase === "build" || phase === "miss" || phase === "reveal" || phase === "afterglow" || phase === "done") break;
          if (phase === "recover") {
            session.advance();
            continue;
          }
          if (phase === "probe") {
            expect(session.snapshot().probeId).not.toBe("card-equivocation-gesture");
            answerAdversarial(session, "s-a");
          }
        }

        const internal = session.internal();
        const committedLow = session.phaseName === "build" && internal.confidence < 0.96;
        if (internal.answered > cardEffect.config.maxProbes + 1 || committedLow) {
          violations.push({ seed, answered: internal.answered, finalPhase: session.phaseName });
        }
      }

      console.log(`[Empirical Result] Honest low-gaze adversarial sweep: ${violations.length} of 50 seeds breached budget/bar`);
      expect(violations.length, `Honest budget/bar breached in ${violations.length} of 50 runs!`).toBe(0);
    });
  });
});
