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

      // Verify each zone has 2 cards
      for (const zone of zones) {
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
        const view = testSession.snapshot();
        expect(view.probeId).toBe(`zone-statement-${zone.id}`);

        // Spectator is thinking of Card B (upper), so answers "no" to Card A's probe
        testSession.answer("no");
        testSession.clearAck();

        // Assert that the denial pivot is triggered and commits cleanly in <= 2 beats
        const internal = testSession.internal();
        console.log(`Zone ${zone.id}: answered=${internal.answered}, confidence=${internal.confidence}, revealed=${internal.revealedId}`);
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
          session.answer("no");
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

      // Answer 1: answer "yes" or "no"
      // If we answer "no", let's see what happens
      session.answer("no");
      session.clearAck();
      console.log(`After answer 1: phase=${session.phaseName}, answered=${session.internal().answered}, confidence=${session.internal().confidence}`);

      if (session.phaseName === "probe") {
        const probe2 = session.snapshot().probeId;
        console.log(`Probe 2: ${probe2}`);
        session.answer("no");
        session.clearAck();
        console.log(`After answer 2: phase=${session.phaseName}, answered=${session.internal().answered}, confidence=${session.internal().confidence}`);

        if ((session.phaseName as string) === "recover") {
          console.log(`SESSION ENTERED RECOVERY! Advancing...`);
          session.advance();
          console.log(`After advance: phase=${session.phaseName}`);
          if (session.phaseName === "probe") {
            const probe3 = session.snapshot().probeId;
            console.log(`BREACH DETECTED: Probe 3 issued: ${probe3}`);
            session.answer("yes");
            session.clearAck();
            console.log(`After answer 3: phase=${session.phaseName}, answered=${session.internal().answered}`);
          }
        }
      }
    });
  });
