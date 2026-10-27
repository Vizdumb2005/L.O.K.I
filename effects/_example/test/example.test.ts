import { describe, expect, it } from "vitest";
import { exampleEffect, WORDS } from "../src/index.js";
import { checkEffect } from "@loki/effect-api";
import { PerformanceSession } from "@loki/showrunner";
import { runOne } from "@loki/sim";

function answerTruth(session: PerformanceSession, trueId: string): void {
  const view = session.snapshot();
  const probe = exampleEffect.probes().find((p) => p.id === view.probeId);
  if (!probe) throw new Error("no probe");
  let best = probe.options[0]!.id;
  let bestP = -1;
  for (const option of probe.options) {
    const p = probe.likelihood(trueId, option.id);
    if (p > bestP) {
      bestP = p;
      best = option.id;
    }
  }
  session.answer(best);
}

describe("toy effect", () => {
  it("validates and has four words", () => {
    expect(checkEffect(exampleEffect)).toEqual([]);
    expect(WORDS).toHaveLength(4);
    expect(exampleEffect.probes()).toHaveLength(3);
  });

  it("uses the same harness and abstains when three noisy probes are insufficient", () => {
    let t = 0;
    const session = new PerformanceSession(exampleEffect, { seed: 5, now: () => (t += 100) });
    session.begin();
    session.chosen();
    for (let i = 0; i < 6; i++) {
      if (session.phaseName === "recover") {
        session.advance();
        continue;
      }
      if (session.phaseName === "probe") {
        answerTruth(session, "comet");
        continue;
      }
      break;
    }
    expect(session.phaseName).toBe("miss");
    expect(session.snapshot().reveal).toBeUndefined();
    expect(session.internal().confidence).toBeLessThan(exampleEffect.config.commitThreshold);

    const result = runOne({
      effect: exampleEffect,
      seed: 123,
      policy: "greedy",
      spectator: {
        answerError: 0,
        force: false,
        gaze: false,
        gazeAccuracy: 0,
        gazeReliability: 0
      },
      trueId: "comet"
    });
    expect(result.trueId).toBe("comet");
    expect(result.committed).toBe(false);
    expect(result.wrongConfident).toBe(false);
    expect(result.phase).toBe("miss");
  });
});
