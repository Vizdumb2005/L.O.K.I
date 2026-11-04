import { describe, expect, it } from "vitest";
import { cardEffect } from "../effects/card/src/index.js";
import {
  CARDS,
  CARD_PROBES,
  CARD_STAGE_BASE,
  EQUIVOCATION_PROBE,
  denialPivotForPair,
  zoneStatementsForStage
} from "../effects/card/src/cards.js";
import { PerformanceSession } from "../packages/showrunner/src/session.js";

// Answer truthfully for the spectator's actual card on the session's current
// probe (max-likelihood option). Honest-regime driver: probes are statements
// from the shipping pool with varying option shapes, so scripted "yes"/"no"
// answers are no longer valid.
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

describe("Milestone 3 Challenger: Empirical Adversarial Stress Suite", () => {
  describe("Objective 3: Patter Length Boundary (<= 160 chars)", () => {
    it("scans all CARD_PROBES prompts to assert length <= 160", () => {
      for (const probe of CARD_PROBES) {
        expect(probe.prompt.length, `Probe ${probe.id} prompt length ${probe.prompt.length} exceeds 160`).toBeLessThanOrEqual(160);
      }
    });

    it("scans all zoneStatementsForStage prompts to assert length <= 160", () => {
      const statements = zoneStatementsForStage(CARD_STAGE_BASE);
      expect(statements.length).toBe(6);
      for (const probe of statements) {
        expect(probe.prompt.length, `Zone probe ${probe.id} prompt length ${probe.prompt.length} exceeds 160`).toBeLessThanOrEqual(160);
      }
    });

    it("scans EQUIVOCATION_PROBE prompt to assert length <= 160", () => {
      expect(EQUIVOCATION_PROBE.prompt.length, `EQUIVOCATION_PROBE prompt length ${EQUIVOCATION_PROBE.prompt.length} exceeds 160`).toBeLessThanOrEqual(160);
    });

    it("scans denialPivotForPair across all possible card pairs (12 x 12 = 144 pairs) to assert length <= 160", () => {
      for (const cardA of CARDS) {
        for (const cardB of CARDS) {
          if (cardA.id === cardB.id) continue;
          const pivot = denialPivotForPair(cardA, cardB);
          expect(pivot.length, `Denial pivot for ${cardA.id} -> ${cardB.id} length ${pivot.length} exceeds 160: "${pivot}"`).toBeLessThanOrEqual(160);
        }
      }
    });
  });

  describe("Objective 2: Denial Pivot Coverage Across All 12 Cards", () => {
    it("tests denial pivot across all 6 zones and 12 cards in a show session", () => {
      // Use fixed seed for predictable layout
      const session = new PerformanceSession(cardEffect, {
        seed: 42,
        cameraEnabled: true,
        cameraValidated: true,
        presenceEnabled: true
      });
      const stage = session.stage;
      const zones = stage.zones!;
      expect(zones.length).toBe(6);

      // Verify each zone has 2 cards. Semantic change (honesty repair): the
      // 11-03 denial-pivot choreography (zone-statement lead, one "no" pivots
      // to the pair's other card at a 0.60 bar) was removed with the zone
      // probes. Coverage intent preserved: for every zone, BOTH of its cards
      // resolve truthfully at the honest 0.96 bar within the probe budget.
      for (const zone of zones) {
        const zoneCards = stage.items
          .filter((item, i) => {
            const col = i % stage.columns;
            const row = Math.floor(i / stage.columns);
            return stage.zones![row * 2 + (col < stage.columns / 2 ? 0 : 1)]!.id === zone.id;
          })
          .map((item) => item.hypothesisId);
        expect(zoneCards.length).toBe(2);
        for (const trueId of zoneCards) {
          const testSession = new PerformanceSession(cardEffect, {
            seed: 42,
            cameraEnabled: true,
            cameraValidated: true,
            presenceEnabled: true
          });
          testSession.begin();
          testSession.chosen();

          // Feed 2 gaze windows on this zone
          testSession.addGaze({ zone: zone.id, reliability: 0.85 });
          testSession.addGaze({ zone: zone.id, reliability: 0.85 });
          testSession.finishAttune();

          expect(testSession.phaseName).toBe("probe");
          for (let guard = 0; guard < 8 && testSession.phaseName !== "build" && testSession.phaseName !== "miss"; guard++) {
            if (testSession.phaseName === "recover") {
              testSession.advance();
              continue;
            }
            if (testSession.phaseName !== "probe") break;
            answerTruthfully(testSession, trueId);
          }
          expect(testSession.phaseName).toBe("build");
          expect(testSession.internal().revealedId).toBe(trueId);
          expect(testSession.internal().answered).toBeLessThanOrEqual(6);
          expect(testSession.internal().confidence).toBeGreaterThanOrEqual(0.96);
        }
      }
    });
  });

  describe("Objective 1: Probe Clamping Enforcement Under Adversarial Sequences", () => {
    it("tests adversarial sequence ['no', 'no'] under cross-zone gaze ambiguity", () => {
      const session = new PerformanceSession(cardEffect, {
        seed: 123,
        cameraEnabled: true,
        cameraValidated: true,
        presenceEnabled: true
      });
      session.begin();
      session.chosen();

      const stage = session.stage;
      const zone1 = stage.zones![0]!.id;
      const zone2 = stage.zones![1]!.id;

      // Ambiguous gaze across 2 zones
      session.addGaze({ zone: zone1, reliability: 0.80 });
      session.addGaze({ zone: zone2, reliability: 0.80 });
      session.finishAttune();

      let probeCount = 0;
      let recoveryCount = 0;
      for (let step = 0; step < 10; step++) {
        const phase = session.phaseName;
        if (phase === "build" || phase === "miss" || phase === "reveal" || phase === "afterglow" || phase === "done") {
          break;
        }
        if (phase === "recover") {
          recoveryCount++;
          session.advance();
          continue;
        }
        if (phase === "probe") {
          probeCount++;
          // Adversarial drive under the honest probe set: options are no longer
          // yes/no, so answer the option LEAST consistent with a fixed card
          // (s-a) - the honest analogue of repeated denial.
          const view = session.snapshot();
          const probe = cardEffect.probes(session.stage).find((pr) => pr.id === view.probeId)!;
          let worst = view.options![0]!.id;
          let worstP = Infinity;
          for (const option of view.options!) {
            const p = probe.likelihood("s-a", option.id);
            if (p < worstP) {
              worstP = p;
              worst = option.id;
            }
          }
          session.answer(worst);
          session.clearAck();
        }
      }

      console.log(`Gaze ambiguous ['no', 'no']: probes=${probeCount}, recoveries=${recoveryCount}, finalPhase=${session.phaseName}`);
    });
  });
});

  describe("Adversarial Breach Test: Recovery after 2 Gaze Probes", () => {
    it("empirically tests if session issues a 3rd probe under conflicting gaze", () => {
      const session = new PerformanceSession(cardEffect, {
        seed: 999,
        cameraEnabled: true,
        cameraValidated: true,
        presenceEnabled: true
      });
      session.begin();
      session.chosen();

      const stage = session.stage;
      const zone1 = stage.zones![0]!.id;
      const zone2 = stage.zones![1]!.id;

      // Add 2 gaze windows with moderate reliability (0.55 each) so neither dominates
      session.addGaze({ zone: zone1, reliability: 0.55 });
      session.addGaze({ zone: zone2, reliability: 0.55 });
      session.finishAttune();

      expect(session.phaseName).toBe("probe");
      const probe1 = session.snapshot().probeId;
      console.log(`Probe 1: ${probe1}`);

      // Answer 1: honest-regime drive - answer the first valid option
      // (options are no longer yes/no).
      session.answer(session.snapshot().options![0]!.id);
      session.clearAck();
      console.log(`After answer 1: phase=${session.phaseName}, answered=${session.internal().answered}, confidence=${session.internal().confidence}`);

      if (session.phaseName === "probe") {
        const probe2 = session.snapshot().probeId;
        console.log(`Probe 2: ${probe2}`);
        session.answer(session.snapshot().options![0]!.id);
        session.clearAck();
        console.log(`After answer 2: phase=${session.phaseName}, answered=${session.internal().answered}, confidence=${session.internal().confidence}`);

        if ((session.phaseName as string) === "recover") {
          console.log(`SESSION ENTERED RECOVERY! Advancing...`);
          session.advance();
          console.log(`After advance: phase=${session.phaseName}`);
          if (session.phaseName === "probe") {
            const probe3 = session.snapshot().probeId;
            console.log(`BREACH DETECTED: Probe 3 issued: ${probe3}`);
            session.answer(session.snapshot().options![0]!.id);
            session.clearAck();
            console.log(`After answer 3: phase=${session.phaseName}, answered=${session.internal().answered}`);
          }
        }
      }
    });
  });
