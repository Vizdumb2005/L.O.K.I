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
  it("no-gaze show is led by statements in effect order, <=2 answers before a decision, 0 generic leaks", () => {
    const authoredStatements = cardEffect.probes(cardEffect.stage())
      .filter((p) => p.discourse === "statement" && !p.channelHint && !p.id.startsWith("card-equivocation"))
      .map((p) => p.id);
    for (const card of CARDS) {
      const session = new PerformanceSession(cardEffect, { seed: 7 });
      session.begin();
      session.chosen();
      const presented: string[] = [];
      for (let guard = 0; guard < 6 && session.phaseName === "probe"; guard++) {
        const view = session.snapshot();
        presented.push(view.probeId!);
        const probe = cardEffect.probes(session.stage).find((p) => p.id === view.probeId)!;
        expect(probe.discourse).toBe("statement");
        session.answer(truthfulOption(session, cardEffect.probes(session.stage), card.id));
        session.clearAck();
      }
      expect(["build", "miss", "recover"]).toContain(session.phaseName);
      expect(session.internal().answered).toBeLessThanOrEqual(2);
      expect(presented).toEqual(authoredStatements.slice(0, presented.length));
    }
  });

  it("gazed and equivocation paths present 0 generic (non-statement) probes", () => {
    const gazed = new PerformanceSession(cardEffect, { seed: 11, cameraEnabled: true, cameraValidated: true, presenceEnabled: true });
    gazed.begin();
    gazed.chosen();
    const zone = gazed.stage.zones![0]!.id;
    gazed.addGaze({ zone, reliability: 0.8 });
    gazed.addGaze({ zone, reliability: 0.8 });
    gazed.finishAttune();
    expect(gazed.snapshot().probeId).toMatch(/^zone-statement-/);
    expect(cardEffect.probes(gazed.stage).find((p) => p.id === gazed.snapshot().probeId)!.discourse).toBe("statement");

    const equiv = new PerformanceSession(cardEffect, { seed: 5, cameraEnabled: true, cameraValidated: false });
    equiv.begin();
    equiv.chosen();
    expect(equiv.snapshot().probeId).toBe("card-equivocation-gesture");
    expect(cardEffect.probes(equiv.stage).find((p) => p.id === equiv.snapshot().probeId)!.discourse).toBe("statement");
    equiv.answer("cast-black");
    equiv.clearAck();
    if (equiv.phaseName === "probe") {
      const next = cardEffect.probes(equiv.stage).find((p) => p.id === equiv.snapshot().probeId)!;
      expect(next.discourse).toBe("statement");
      expect(equiv.internal().answered).toBeLessThanOrEqual(2);
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
