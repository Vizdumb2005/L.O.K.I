import { describe, expect, it } from "vitest";
import { PerformanceSession } from "@loki/showrunner";
import { cardEffect } from "../effects/card/src/index.js";
import { CARD_PROBES, CARDS, Card } from "../effects/card/src/cards.js";
import { posterior, beliefEntropy } from "@loki/engine";

describe("Milestone 3 Challenger: Empirical Adversarial Testing & Verification", () => {
  // Honest-regime driver: answer the option with maximum likelihood for the
  // spectator's actual card. Shipping probes are statements with varying
  // option shapes, so scripted "yes"/"no"/"cast-black" answers are invalid.
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

  it("Objective 1: honest-regime robustness sweep (100 trials across low-reliability gaze and uncalibrated camera)", () => {
    // Semantic change (honesty repair): the 11-03 version of this sweep asserted
    // 100% equivocation-gesture dispatch, zone-statement beat 2, and <= 2-beat
    // resolution - the choreography whose hard eliminations and 0.60 bar failed
    // the held-out gate. This sweep pins the honest contract under the SAME
    // adverse conditions: statement-pool leads, truthful runs commit at 0.96 or
    // honestly miss, never a wrong reveal, within the honest budget.
    const trialsCount = 100;
    let committed = 0;
    let missed = 0;
    let wrongReveal = 0;
    let gestureLeads = 0;
    let overBudget = 0;

    for (let trial = 0; trial < trialsCount; trial++) {
      const seed = 2000 + trial;
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
      const zones = stage.zones!;
      const targetZone = zones[trial % zones.length]!.id;
      const trueId = zoneCardsOf(stage, targetZone)[trial % 2]!;

      if (!isUncalibrated) {
        session.addGaze({ zone: targetZone, reliability });
      }
      session.finishAttune();

      expect(session.phaseName).toBe("probe");
      if (session.snapshot().probeId === "card-equivocation-gesture") gestureLeads++;
      const leadProbe = cardEffect.probes(session.stage).find((pr) => pr.id === session.snapshot().probeId)!;
      expect(leadProbe.discourse).toBe("statement");

      for (let guard = 0; guard < 12; guard++) {
        if (session.phaseName === "recover") {
          session.advance();
          continue;
        }
        if (session.phaseName !== "probe") break;
        answerTruthfully(session, trueId);
      }

      const finalPhase = session.phaseName;
      if (finalPhase === "build") {
        committed++;
        if (session.internal().revealedId !== trueId) wrongReveal++;
        if (session.internal().confidence < 0.96) overBudget++;
      } else if (finalPhase === "miss") {
        missed++;
      }
      expect(session.internal().answered).toBeLessThanOrEqual(8);
    }

    console.log(`=== HONEST 100-TRIAL SWEEP: committed=${committed} missed=${missed} wrong=${wrongReveal} gestureLeads=${gestureLeads} ===`);
    expect(gestureLeads).toBe(0);
    expect(wrongReveal).toBe(0);
    expect(overBudget).toBe(0);
  });

  it("Objective 2: gaze-pair resolution across candidate space at the honest bar", () => {
    // Semantic change (honesty repair): the 11-03 denial pivot asserted one "no"
    // answer moves the pair's other card to >= 0.90 and commits - reachable only
    // through the 0.60 trapdoor. Honest regime: after two 0.85 windows the pair
    // holds ~97% mass split ~0.48/0.48; truthful statements resolve either card
    // to the 0.96 bar within budget. Same coverage: all 6 seeds x both zone cards.
    const seeds = [42, 101, 202, 303, 404, 505];
    const results: any[] = [];

    for (const seed of seeds) {
      for (const pick of [0, 1]) {
        const session = new PerformanceSession(cardEffect, {
          seed,
          cameraEnabled: true,
          cameraValidated: true,
          presenceEnabled: true
        });
        session.begin();
        session.chosen();

        const stage = session.stage;
        const zone = stage.zones![0]!.id;
        const itemsInZone = zoneCardsOf(stage, zone);
        const trueId = itemsInZone[pick]!;

        session.addGaze({ zone, reliability: 0.85 });
        session.addGaze({ zone, reliability: 0.85 });
        session.finishAttune();

        const state1 = session.internal().belief;
        const postGaze = posterior(state1);
        const trueIdx = state1.hypotheses.findIndex((h) => h.id === trueId);
        const pGazeTrue = postGaze[trueIdx]!;
        const pGazePair = itemsInZone.reduce((sum, id) => {
          const i = state1.hypotheses.findIndex((h) => h.id === id);
          return sum + postGaze[i]!;
        }, 0);

        for (let guard = 0; guard < 8 && session.phaseName === "probe"; guard++) {
          answerTruthfully(session, trueId);
        }

        results.push({
          seed,
          trueId,
          pGazePair: Number((pGazePair * 100).toFixed(2)),
          pGazeTrue: Number((pGazeTrue * 100).toFixed(2)),
          answered: session.internal().answered,
          finalConf: Number((session.internal().confidence * 100).toFixed(2)),
          finalPhase: session.phaseName
        });

        expect(session.phaseName).toBe("build");
        expect(session.internal().revealedId).toBe(trueId);
        expect(session.internal().confidence).toBeGreaterThanOrEqual(0.96);
        expect(session.internal().answered).toBeLessThanOrEqual(6);
      }
    }

    console.log("\n=== OBJECTIVE 2 HONEST GAZE-PAIR RESOLUTION DATA ===");
    console.table(results);
  });

  it("Objective 3: No Akinator leakage - every probe with gaze evidence is a statement", () => {
    // Semantic change (honesty repair): the 11-03 test defined leakage as "a
    // CARD_PROBES probe presented while gaze is present" because its shipping
    // set split statement choreography from generic probes. The honest shipping
    // set IS the statement pool; the anti-Akinator invariant that survives is
    // discourse-level: every probe presented - with or without gaze - is a
    // cold-reading statement, never a naked binary taxonomic question.
    let nonStatement = 0;
    const leakedDetails: any[] = [];

    for (let s = 1; s <= 50; s++) {
      const session = new PerformanceSession(cardEffect, {
        seed: s,
        cameraEnabled: true,
        cameraValidated: true,
        presenceEnabled: true
      });
      session.begin();
      session.chosen();

      const zone = session.stage.zones![s % 6]!.id;
      session.addGaze({ zone, reliability: 0.80 });
      session.finishAttune();

      for (let beat = 0; beat < 3 && session.phaseName === "probe"; beat++) {
        const view = session.snapshot();
        const probe = cardEffect.probes(session.stage).find((pr) => pr.id === view.probeId)!;
        if (probe.discourse !== "statement") {
          nonStatement++;
          leakedDetails.push({ seed: s, probe: probe.id, beat });
        }
        answerTruthfully(session, zoneCardsOf(session.stage, zone)[0]!);
      }
    }

    console.log(`\n=== OBJECTIVE 3 ANTI-AKINATOR DISCOURSE TEST (50 seeds, nominal gaze) ===`);
    console.log(`Non-statement probes presented: ${nonStatement}`);
    expect(nonStatement, `leaks: ${JSON.stringify(leakedDetails)}`).toBe(0);
  });
});
