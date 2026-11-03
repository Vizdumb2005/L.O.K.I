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
    it("tests denial pivot and affirmative commit across all 6 zones and 12 cards", () => {
      const testedUpperCards = new Set<string>();
      const testedLowerCards = new Set<string>();

      // Test across multiple seeds to ensure all 12 cards are tested as both lower and upper
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

        // Map items by zone
        const columns = stage.columns;
        const itemsByZone = new Map<string, string[]>();
        stage.items.forEach((item, idx) => {
          const row = Math.floor(idx / columns);
          const col = idx % columns;
          const half = col < columns / 2 ? 0 : 1;
          const zoneId = stage.zones![row * 2 + half]!.id;
          const list = itemsByZone.get(zoneId) ?? [];
          list.push(item.hypothesisId);
          itemsByZone.set(zoneId, list);
        });

        for (const zone of zones) {
          const pair = itemsByZone.get(zone.id)!;
          expect(pair.length).toBe(2);
          const lowerCard = CARD_BY_ID.get(pair[0]!)!;
          const upperCard = CARD_BY_ID.get(pair[1]!)!;

          // TEST CASE A: Spectator thinking of Card B (Upper). Answers "no" to Card A's probe.
          {
            const session = new PerformanceSession(cardEffect, {
              seed,
              cameraEnabled: true,
              cameraValidated: true,
              presenceEnabled: true
            });
            session.begin();
            session.chosen();

            // Provide 2 strong gaze windows on this zone
            session.addGaze({ zone: zone.id, reliability: 0.88 });
            session.addGaze({ zone: zone.id, reliability: 0.88 });
            session.finishAttune();

            expect(session.phaseName).toBe("probe");
            expect(session.snapshot().probeId).toBe(`zone-statement-${zone.id}`);

            // Spectator denies lower card
            session.answer("no");
            session.clearAck();

            // Verify clean commit in <= 2 beats (here exactly Beat 1)
            const internal = session.internal();
            expect(session.phaseName).toBe("build");
            expect(internal.answered).toBeLessThanOrEqual(2);
            expect(internal.confidence).toBeGreaterThanOrEqual(0.94);
            expect(internal.revealedId).toBe(upperCard.id);

            // Verify denial pivot patter was captured and injected in build sequence cues
            const expectedPivot = denialPivotForPair(lowerCard, upperCard);
            const cues = session.snapshot().cues;
            const pivotCue = cues.find((c) => c.id === "denial-pivot" || c.line?.includes("Wait—"));
            expect(pivotCue, `Expected denial-pivot cue containing "${expectedPivot}"`).toBeDefined();
            expect(pivotCue!.line).toBe(expectedPivot);

            testedUpperCards.add(upperCard.id);
          }

          // TEST CASE B: Spectator thinking of Card A (Lower). Answers "yes" to Card A's probe.
          {
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
            expect(session.snapshot().probeId).toBe(`zone-statement-${zone.id}`);

            // Spectator affirms lower card
            session.answer("yes");
            session.clearAck();

            const internal = session.internal();
            expect(session.phaseName).toBe("build");
            expect(internal.answered).toBeLessThanOrEqual(2);
            expect(internal.confidence).toBeGreaterThanOrEqual(0.94);
            expect(internal.revealedId).toBe(lowerCard.id);

            testedLowerCards.add(lowerCard.id);
          }
        }
      }

      // Verify all 12 cards were covered as upper (denial pivot target) and lower (affirmative target)
      expect(testedUpperCards.size).toBe(12);
      expect(testedLowerCards.size).toBe(12);
    });
  });

  // =========================================================================
  // OBJECTIVE 1: Probe Clamping Enforcement Under Adversarial Sequences
  // =========================================================================
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

    it("verifies single-zone gaze commits cleanly in 1 beat for affirmative and denial answers", () => {
      for (let seed = 1; seed <= 20; seed++) {
        // Test with 2 gaze windows (standard think phase output): posterior >= 0.94
        const session2W = new PerformanceSession(cardEffect, {
          seed,
          cameraEnabled: true,
          cameraValidated: true,
          presenceEnabled: true
        });
        session2W.begin();
        session2W.chosen();
        session2W.addGaze({ zone: "top-left", reliability: 0.88 });
        session2W.addGaze({ zone: "top-left", reliability: 0.88 });
        session2W.finishAttune();
        expect(session2W.phaseName).toBe("probe");
        session2W.answer("yes");
        session2W.clearAck();
        expect(session2W.phaseName).toBe("build");
        expect(session2W.internal().answered).toBe(1);
        expect(session2W.internal().confidence).toBeGreaterThanOrEqual(0.94);

        // Test with 1 gaze window: posterior >= commitThresholdGazed (0.82)
        const session1W = new PerformanceSession(cardEffect, {
          seed,
          cameraEnabled: true,
          cameraValidated: true,
          presenceEnabled: true
        });
        session1W.begin();
        session1W.chosen();
        session1W.addGaze({ zone: "top-left", reliability: 0.88 });
        session1W.finishAttune();
        expect(session1W.phaseName).toBe("probe");
        session1W.answer("no");
        session1W.clearAck();
        expect(session1W.phaseName).toBe("build");
        expect(session1W.internal().answered).toBe(1);
        expect(session1W.internal().confidence).toBeGreaterThanOrEqual(0.82);
      }
    });

    // CRITICAL ADVERSARIAL TEST:
    // When gaze evidence exists, under NO circumstances does the session issue more than 2 probes.
    it("empirically tests if session ever issues > 2 probes under conflicting gaze and ['no', 'no'] answers", () => {
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

      // Conflicting gaze between zone 1 and zone 2 (moderate reliability)
      session.addGaze({ zone: zone1, reliability: 0.55 });
      session.addGaze({ zone: zone2, reliability: 0.55 });
      session.finishAttune();

      let probesIssued = 0;
      let steps = 0;
      const maxSteps = 15;

      while (steps < maxSteps) {
        steps++;
        const phase = session.phaseName;

        if (phase === "build" || phase === "miss" || phase === "reveal" || phase === "afterglow" || phase === "done") {
          break;
        }

        if (phase === "recover") {
          // In recovery, session is advanced to see what happens next
          session.advance();
          continue;
        }

        if (phase === "probe") {
          probesIssued++;
          session.answer("no");
          session.clearAck();
        }
      }

      console.log(`[Empirical Result] Conflicting gaze ['no', 'no']: probesIssued = ${probesIssued}, answered = ${session.internal().answered}, finalPhase = ${session.phaseName}`);

      // THE CORE ASSERTION: Under gaze evidence, under NO circumstances does the session issue more than 2 probes
      expect(probesIssued).toBeLessThanOrEqual(2);
      expect(session.internal().answered).toBeLessThanOrEqual(2);
    });

    it("sweeps 100 seeds with conflicting gaze and adversarial ['no', 'no', 'no'] sequence to check probe clamping", () => {
      const violations: Array<{ seed: number; probesIssued: number; answered: number; finalPhase: string }> = [];

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
        const zone1 = stage.zones![0]!.id;
        const zone2 = stage.zones![1]!.id;

        session.addGaze({ zone: zone1, reliability: 0.52 });
        session.addGaze({ zone: zone2, reliability: 0.52 });
        session.finishAttune();

        let probesIssued = 0;
        let steps = 0;
        const maxSteps = 10;

        while (steps < maxSteps) {
          steps++;
          const phase = session.phaseName;

          if (phase === "build" || phase === "miss" || phase === "reveal" || phase === "afterglow" || phase === "done") {
            break;
          }

          if (phase === "recover") {
            session.advance();
            continue;
          }

          if (phase === "probe") {
            probesIssued++;
            session.answer("no");
            session.clearAck();
          }
        }

        if (probesIssued > 2 || session.internal().answered > 2) {
          violations.push({
            seed,
            probesIssued,
            answered: session.internal().answered,
            finalPhase: session.phaseName
          });
        }
      }

      console.log(`[Empirical Result] Probe Clamping Sweep: ${violations.length} of 100 seeds violated probe clamping`);
      if (violations.length > 0) {
        console.log(`Sample violations:`, violations.slice(0, 5));
      }

      expect(violations.length, `Probe clamping breached in ${violations.length} of 100 runs!`).toBe(0);
    });

    it("tests equivocation fallback probe clamping under adversarial ['cast-black', 'no'] answers", () => {
      const equivocationViolations: Array<{ seed: number; probesIssued: number; answered: number; finalPhase: string }> = [];

      // Sweep seeds with low-reliability gaze (equivocation path)
      for (let seed = 1; seed <= 50; seed++) {
        const session = new PerformanceSession(cardEffect, {
          seed,
          cameraEnabled: true,
          cameraValidated: true,
          presenceEnabled: true
        });
        session.begin();
        session.chosen();

        // Feed low reliability (< 0.50) gaze window
        session.addGaze({ zone: "top-left", reliability: 0.40 });
        session.finishAttune();

        let probesIssued = 0;
        let steps = 0;
        const maxSteps = 10;

        while (steps < maxSteps) {
          steps++;
          const phase = session.phaseName;

          if (phase === "build" || phase === "miss" || phase === "reveal" || phase === "afterglow" || phase === "done") {
            break;
          }

          if (phase === "recover") {
            session.advance();
            continue;
          }

          if (phase === "probe") {
            probesIssued++;
            const probeId = session.snapshot().probeId;
            if (probeId === "card-equivocation-gesture") {
              session.answer("cast-black");
            } else {
              session.answer("no");
            }
            session.clearAck();
          }
        }

        if (probesIssued > 2 || session.internal().answered > 2) {
          equivocationViolations.push({
            seed,
            probesIssued,
            answered: session.internal().answered,
            finalPhase: session.phaseName
          });
        }
      }

      console.log(`[Empirical Result] Equivocation Clamping Sweep: ${equivocationViolations.length} of 50 seeds violated probe clamping`);
      if (equivocationViolations.length > 0) {
        console.log(`Sample equivocation violations:`, equivocationViolations.slice(0, 5));
      }

      expect(equivocationViolations.length, `Equivocation probe clamping breached in ${equivocationViolations.length} of 50 runs!`).toBe(0);
    });
  });
});
