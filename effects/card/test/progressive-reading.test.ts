import { describe, expect, it } from "vitest";
import { cardEffect } from "../src/index.js";
import { CARDS } from "../src/cards.js";
import { PerformanceSession } from "@loki/showrunner";

/**
 * Blueprint v4 §3 — asymmetric 1-turn progressive reading.
 *
 * Gaze collapses the pool to one zone's two cards before the verbal act; a single
 * progressive cold-reading statement then commits (or its denial pivots to the
 * pair's other card). Without gaze the general impressions still resolve a
 * truthful spectator within the CRIT-03 budget: <= 4 explicit probes, zero
 * false-contradiction detours.
 */

function answerTruthfully(session: PerformanceSession, trueId: string): void {
  const view = session.snapshot();
  if (!view.probeId || !view.options) throw new Error("expected an active probe");
  // The session builds stage-crafted probes; look them up on THIS session's stage.
  const probe = cardEffect.probes(session.stage).find((p) => p.id === view.probeId);
  if (!probe) throw new Error(`unknown probe ${view.probeId}`);
  let best = view.options.some((o) => o.id === "no") ? "no" : view.options[0]!.id;
  let bestP = 0;
  for (const option of view.options) {
    const p = probe.likelihood(trueId, option.id);
    if (p > bestP) {
      bestP = p;
      best = option.id;
    }
  }
  session.answer(best);
  session.clearAck();
}

/** Drive a truthful spectator (no gaze) until the show leaves the probe phase. */
function runTruthful(trueId: string): PerformanceSession {
  const session = new PerformanceSession(cardEffect, { seed: 7 });
  session.begin();
  session.chosen();
  for (let guard = 0; guard < 14; guard++) {
    const phase = session.phaseName;
    if (phase === "probe") {
      answerTruthfully(session, trueId);
      continue;
    }
    if (phase === "recover") {
      session.advance();
      continue;
    }
    break;
  }
  return session;
}

describe("CRIT-03 / blueprint §3: the asymmetric method", () => {
  it("no-gaze truthful runs commit within 2 statement beats or honestly miss, never bluff", () => {
    // With maxProbes 2 the no-gaze show is led by authored statements only.
    // Two binary statements cannot identify 12 cards, so the honest outcomes
    // are: commit correctly within the budget, enter the CRIT-03 tie-break
    // recovery (one extra statement), or miss. A wrong reveal is never allowed.
    for (const card of CARDS) {
      const session = runTruthful(card.id);
      expect(["build", "miss"]).toContain(session.phaseName);
      const internal = session.internal();
      // 2 default beats + at most the single CRIT-03 recovery statement.
      expect(internal.answered).toBeLessThanOrEqual(3);
      expect(internal.recoveries).toBeLessThanOrEqual(1);
      if (session.phaseName === "build") {
        expect(internal.revealedId).toBe(card.id);
      } else {
        expect(internal.revealedId).toBeUndefined();
      }
    }
  });

  it("keeps honest abstention: two deliberate lies still miss rather than bluff", () => {
    for (const card of CARDS) {
      const session = new PerformanceSession(cardEffect, { seed: 9 });
      session.begin();
      session.chosen();
      let lies = 0;
      for (let guard = 0; guard < 14; guard++) {
        const phase = session.phaseName;
        if (phase === "miss" || phase === "build" || phase === "reveal") break;
        if (phase === "recover") {
          session.advance();
          continue;
        }
        if (phase !== "probe") break;
        const view = session.snapshot();
        const probe = cardEffect.probes(session.stage).find((p) => p.id === view.probeId)!;
        // Truthful choice first, then lie twice.
        if (lies < 2) {
          const truthful = view.options!.find((o) => {
            const ps = probe.likelihood(card.id, o.id);
            return ps >= Math.max(...view.options!.map((x) => probe.likelihood(card.id, x.id)));
          })!;
          const lie = view.options!.find((o) => o.id !== truthful.id)!;
          session.answer(lie.id);
          session.clearAck();
          lies += 1;
        } else {
          answerTruthfully(session, card.id);
        }
      }
      const finalPhase = session.phaseName;
      expect(["miss", "build", "reveal"]).toContain(finalPhase);
      if (finalPhase === "build" || finalPhase === "reveal") {
        // A committed reveal after two lies must NOT be the true card (it was misled).
        expect(session.internal().revealedId).not.toBe(card.id);
      }
    }
  });
});

describe("blueprint §2.1 + §3: gaze-driven 1-turn reading", () => {
  function zoneOfCard(session: PerformanceSession, cardId: string): string {
    const stage = session.stage;
    const index = stage.items.findIndex((item) => item.hypothesisId === cardId);
    expect(index).toBeGreaterThanOrEqual(0);
    const row = Math.floor(index / stage.columns);
    const column = index % stage.columns;
    const half = column < stage.columns / 2 ? 0 : 1;
    return stage.zones![row * 2 + half]!.id;
  }

  it("one progressive statement commits either card of the fixated zone in a single turn with >= 0.98 posterior", () => {
    for (const cardId of ["s-a", "s-2", "d-3", "h-4"]) {
      const session = new PerformanceSession(cardEffect, {
        seed: 11,
        cameraEnabled: true,
        cameraValidated: true,
        presenceEnabled: true
      });
      session.begin();
      session.chosen();
      const zone = zoneOfCard(session, cardId);
      expect(session.addGaze({ zone, reliability: 0.8 })).toBe(true);
      expect(session.addGaze({ zone, reliability: 0.8 })).toBe(true);
      session.finishAttune();
      expect(session.phaseName).toBe("probe");
      const view = session.snapshot();
      // The first beat is the zone's progressive statement, not a symmetric question.
      expect(view.probeId).toMatch(/^zone-statement-/);
      // Either truthful confirmation or the denial pivot commits in ONE answer with >= 0.94 posterior.
      answerTruthfully(session, cardId);
      expect(session.phaseName).toBe("build");
      expect(session.internal().answered).toBe(1);
      expect(session.internal().revealedId).toBe(cardId);
      expect(session.internal().confidence).toBeGreaterThanOrEqual(0.94);
    }
  });

  it("asserts 1-beat commit on confirmation 'yes' with >= 0.98 posterior belief", () => {
    const session = new PerformanceSession(cardEffect, {
      seed: 21,
      cameraEnabled: true,
      cameraValidated: true,
      presenceEnabled: true
    });
    session.begin();
    session.chosen();
    // In seed 21, find the lower card of the first zone
    const stage = session.stage;
    const lowerCardId = stage.items[0]!.hypothesisId;
    const zone = stage.zones![0]!.id;
    expect(session.addGaze({ zone, reliability: 0.8 })).toBe(true);
    expect(session.addGaze({ zone, reliability: 0.8 })).toBe(true);
    session.finishAttune();
    expect(session.phaseName).toBe("probe");
    session.answer("yes");
    session.clearAck();
    expect(session.phaseName).toBe("build");
    expect(session.internal().answered).toBe(1);
    expect(session.internal().revealedId).toBe(lowerCardId);
    expect(session.internal().confidence).toBeGreaterThanOrEqual(0.94);
  });

  it("asserts 1-beat commit on denial pivot 'no' with >= 0.94 posterior belief", () => {
    const session = new PerformanceSession(cardEffect, {
      seed: 22,
      cameraEnabled: true,
      cameraValidated: true,
      presenceEnabled: true
    });
    session.begin();
    session.chosen();
    // In seed 22, find the upper card of the first zone
    const stage = session.stage;
    const upperCardId = stage.items[1]!.hypothesisId;
    const zone = stage.zones![0]!.id;
    expect(session.addGaze({ zone, reliability: 0.8 })).toBe(true);
    expect(session.addGaze({ zone, reliability: 0.8 })).toBe(true);
    session.finishAttune();
    expect(session.phaseName).toBe("probe");
    session.answer("no");
    session.clearAck();
    expect(session.phaseName).toBe("build");
    expect(session.internal().answered).toBe(1);
    expect(session.internal().revealedId).toBe(upperCardId);
    expect(session.internal().confidence).toBeGreaterThanOrEqual(0.94);
    const view = session.snapshot();
    expect(view.cues[0]?.line).not.toContain("You told me That's wrong");
    expect(view.cues[0]?.line).toContain("Wait—");
  });

  it("gaze ambiguity across two zones resolves within two conversational beats", () => {
    const session = new PerformanceSession(cardEffect, {
      seed: 12,
      cameraEnabled: true,
      cameraValidated: true,
      presenceEnabled: true
    });
    session.begin();
    session.chosen();
    // Gaze the truthful card's actual zone plus one neighbouring zone: the shuffled
    // layout means four candidates remain across two zones.
    const truthful = "s-3";
    const truthZone = zoneOfCard(session, truthful);
    const otherZone = session.stage.zones!.find((z) => z.id !== truthZone)!.id;
    expect(session.addGaze({ zone: otherZone, reliability: 0.8 })).toBe(true);
    expect(session.addGaze({ zone: truthZone, reliability: 0.8 })).toBe(true);
    session.finishAttune();
    let beats = 0;
    for (let guard = 0; guard < 6; guard++) {
      const phase = session.phaseName;
      if (phase === "build" || phase === "miss") break;
      if (phase === "recover") {
        session.advance();
        continue;
      }
      if (phase !== "probe") break;
      answerTruthfully(session, truthful);
      beats += 1;
    }
    expect(beats).toBeLessThanOrEqual(2);
    expect(session.phaseName).toBe("build");
    expect(session.internal().revealedId).toBe(truthful);
  });

  it("every progressive statement prompt fits the recovery-safe length", () => {
    const statements = cardEffect.probes().filter((p) => p.id.startsWith("zone-statement-"));
    expect(statements.length).toBe(6);
    for (const probe of statements) {
      expect(probe.prompt.length).toBeLessThanOrEqual(163);
    }
  });
});