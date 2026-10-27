import { describe, expect, it } from "vitest";
import { exampleEffect, WORDS } from "../src/index.js";
import { checkEffect } from "@loki/effect-api";
import { PerformanceSession } from "@loki/showrunner";
import type { PolicyId } from "@loki/engine";

function answerTruth(session: PerformanceSession, trueId: string, flip: boolean): void {
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
  if (flip) {
    best = probe.options.find((option) => option.id !== best)!.id;
  }
  session.answer(best);
}

function runWord(trueId: string, flipProbeIds: string[] = [], policy: PolicyId = "greedy"): PerformanceSession {
  let t = 0;
  const session = new PerformanceSession(exampleEffect, { seed: 5, policy, now: () => (t += 100) });
  session.begin();
  session.chosen();
  for (let i = 0; i < 12; i++) {
    if (session.phaseName === "recover" || session.phaseName === "build") {
      session.advance();
      continue;
    }
    if (session.phaseName === "probe") {
      answerTruth(session, trueId, flipProbeIds.includes(session.snapshot().probeId!));
      continue;
    }
    break;
  }
  return session;
}

describe("toy effect", () => {
  it("validates and has four words and three probes", () => {
    expect(checkEffect(exampleEffect)).toEqual([]);
    expect(WORDS).toHaveLength(4);
    expect(exampleEffect.probes()).toHaveLength(3);
  });

  it("reveals every word through the same harness with no errors", () => {
    for (const word of WORDS) {
      const session = runWord(word.id);
      expect(session.phaseName).toBe("reveal");
      expect(session.snapshot().reveal).toBeDefined();
      expect(session.snapshot().reveal?.id).toBe(word.id);
      expect(session.internal().confidence).toBeGreaterThanOrEqual(
        exampleEffect.config.commitThreshold
      );
    }
  });

  it("preserves the audited safety settings and balanced distinct partitions", () => {
    expect(exampleEffect.config).toMatchObject({ maxProbes: 3, commitThreshold: 0.85, epsilon: 0.1, outlierWeight: 0.06, temperature: 1 });
    const codes = WORDS.map((word) => exampleEffect.probes().map((probe) => probe.likelihood(word.id, "yes")));
    for (let i = 0; i < 3; i++) expect(codes.filter((code) => code[i] === 1)).toHaveLength(2);
    for (let i = 0; i < codes.length; i++) {
      for (let j = i + 1; j < codes.length; j++) {
        expect(codes[i]!.filter((bit, k) => bit !== codes[j]![k])).toHaveLength(2);
      }
    }
  });

  it("checks every answer pattern and policy, including unavoidable double-flip misses", () => {
    const probes = exampleEffect.probes();
    for (const policy of ["greedy", "median", "fixed"] as const) {
      for (const word of WORDS) {
        for (let mask = 0; mask < 8; mask++) {
          const flips = probes.filter((_, i) => mask & (1 << i)).map((probe) => probe.id);
          const session = runWord(word.id, flips, policy);
          if (flips.length === 0) {
            expect(session.snapshot().reveal?.id).toBe(word.id);
          } else if (flips.length === 2) {
            // Distance two cannot correct two correlated mistakes: show this limitation.
            expect(session.phaseName).toBe("reveal");
            expect(session.snapshot().reveal?.id).not.toBe(word.id);
          } else {
            expect(session.phaseName).toBe("miss");
            expect(session.snapshot().reveal).toBeUndefined();
          }
        }
      }
    }
  });

  it("abstains for every single flipped answer", () => {
    for (const word of WORDS) {
      for (const probe of exampleEffect.probes()) {
        const session = runWord(word.id, [probe.id]);
        expect(session.phaseName).toBe("miss");
        expect(session.snapshot().reveal).toBeUndefined();
        expect(session.internal().confidence).toBeLessThan(
          exampleEffect.config.commitThreshold
        );
      }
    }
  });
});
