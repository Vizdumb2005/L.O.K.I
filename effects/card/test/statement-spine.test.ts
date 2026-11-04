import { describe, expect, it } from "vitest";
import { PerformanceSession } from "@loki/showrunner";
import { cardEffect, CARDS } from "../src/index.js";
import type { Probe } from "@loki/effect-api";

function truthfulOption(session: PerformanceSession, probes: Probe[], trueId: string): string {
  const view = session.snapshot();
  const probe = probes.find((p) => p.id === view.probeId)!;
  let best = view.options![0]!.id;
  let bestP = -1;
  for (const o of view.options!) {
    const p = probe.likelihood(trueId, o.id);
    if (p > bestP) { bestP = p; best = o.id; }
  }
  return best;
}

describe("card statement spine", () => {
  it("no-gaze show is led by statements (greedy order), decision within the honest budget, 0 generic leaks", () => {
    // Semantic change (honesty repair): the 11-03 build pinned authored array
    // order and a <=2-answer clamp, which only held up via the 0.89/0.60 commit
    // bars that produced 12-16% wrong reveals on the held-out gate. The restored
    // regime keeps the anti-Akinator presentation (every probe is a statement;
    // selection is greedy information-seeking over the statement pool) with the
    // honest 0.96 commit bar and maxProbes-6 budget.
    const statementIds = new Set(
      cardEffect.probes(cardEffect.stage())
        .filter((p) => p.discourse === "statement" && !p.channelHint && !p.id.startsWith("card-equivocation"))
        .map((p) => p.id)
    );
    for (const card of CARDS) {
      const session = new PerformanceSession(cardEffect, { seed: 7 });
      session.begin();
      session.chosen();
      const presented: string[] = [];
      for (let guard = 0; guard < 8 && session.phaseName === "probe"; guard++) {
        const view = session.snapshot();
        presented.push(view.probeId!);
        const probe = cardEffect.probes(session.stage).find((p) => p.id === view.probeId)!;
        expect(probe.discourse).toBe("statement");
        expect(statementIds.has(probe.id)).toBe(true);
        session.answer(truthfulOption(session, cardEffect.probes(session.stage), card.id));
        session.clearAck();
      }
      expect(["build", "miss", "recover"]).toContain(session.phaseName);
      expect(session.internal().answered).toBeLessThanOrEqual(6);
    }
  });

  it("gazed and equivocation paths present 0 generic (non-statement) probes", () => {
    // Semantic change (honesty repair): zone-statement probes and the
    // card-equivocation-gesture are no longer in the shipping probe set - their
    // 0.0-likelihood hard eliminations plus the 0.60 trapdoor were the core of
    // the 11-03 held-out failure. They remain exported for lab research. Both
    // the gazed and the uncalibrated-camera paths now lead with the same honest
    // statement pool; assertions pin discourse, not the removed choreography.
    const gazed = new PerformanceSession(cardEffect, { seed: 11, cameraEnabled: true, cameraValidated: true, presenceEnabled: true });
    gazed.begin();
    gazed.chosen();
    const zone = gazed.stage.zones![0]!.id;
    gazed.addGaze({ zone, reliability: 0.8 });
    gazed.addGaze({ zone, reliability: 0.8 });
    gazed.finishAttune();
    const gazedProbe = cardEffect.probes(gazed.stage).find((p) => p.id === gazed.snapshot().probeId)!;
    expect(gazedProbe.discourse).toBe("statement");
    expect(gazedProbe.id.startsWith("zone-statement-")).toBe(false);

    const equiv = new PerformanceSession(cardEffect, { seed: 5, cameraEnabled: true, cameraValidated: false });
    equiv.begin();
    equiv.chosen();
    const equivProbe = cardEffect.probes(equiv.stage).find((p) => p.id === equiv.snapshot().probeId)!;
    expect(equivProbe.discourse).toBe("statement");
    expect(equivProbe.id).not.toBe("card-equivocation-gesture");
    // The uncalibrated-camera path is the ordinary honest statement loop: a
    // truthful answer keeps it in statement discourse within the budget.
    equiv.answer(truthfulOption(equiv, cardEffect.probes(equiv.stage), "h-a"));
    equiv.clearAck();
    if (equiv.phaseName === "probe") {
      const next = cardEffect.probes(equiv.stage).find((p) => p.id === equiv.snapshot().probeId)!;
      expect(next.discourse).toBe("statement");
      expect(equiv.internal().answered).toBeLessThanOrEqual(6);
    }
  });

  it("recovery probe is led by a statement, not a generic question", () => {
    const session = new PerformanceSession(cardEffect, { seed: 7 });
    session.begin();
    session.chosen();
    for (let guard = 0; guard < 8; guard++) {
      if (session.phaseName === "recover") {
        session.advance();
        if (session.snapshot().phase === "probe") {
          const probe = cardEffect.probes(session.stage).find((p) => p.id === session.snapshot().probeId)!;
          expect(probe.discourse).toBe("statement");
          expect(session.snapshot().line.startsWith("One clean claim.")).toBe(true);
        }
        break;
      }
      if (session.phaseName !== "probe") break;
      session.answer(truthfulOption(session, cardEffect.probes(session.stage), "h-a"));
      session.clearAck();
    }
  });
});
