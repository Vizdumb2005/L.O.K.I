import { describe, expect, it } from "vitest";
import { cardEffect, CARDS, CARD_FORCE_TARGET, CARD_PROBES } from "../src/index.js";
import { checkEffect, validateEffect } from "@loki/effect-api";
import { PerformanceSession } from "@loki/showrunner";

function answerTruth(session: PerformanceSession, trueId: string): void {
  const view = session.snapshot();
  const probe = cardEffect.probes().find((p) => p.id === view.probeId);
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

describe("card effect contract", () => {
  it("validates against the shared contract", () => {
    expect(checkEffect(cardEffect)).toEqual([]);
    expect(() => validateEffect(cardEffect)).not.toThrow();
  });

  it("has 12 cards, 21 claim probes and a 3x4 stage", () => {
    expect(CARDS).toHaveLength(12);
    expect(CARD_PROBES).toHaveLength(21);
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(12);
    expect(cardEffect.stage().columns).toBe(4);
    expect(cardEffect.stage().items).toHaveLength(12);
    expect(CARDS.some((c) => c.id === CARD_FORCE_TARGET)).toBe(true);
  });

  it("keeps every probe likelihood row-stochastic", () => {
    for (const probe of CARD_PROBES) {
      for (const card of CARDS) {
        const total = probe.options.reduce(
          (sum, option) => sum + probe.likelihood(card.id, option.id),
          0
        );
        expect(total).toBeCloseTo(1, 12);
      }
    }
  });

  it("uses a uniform prior by default and a logged force shift when enabled", () => {
    const off = cardEffect.prior({ forceEnabled: false });
    const on = cardEffect.prior({ forceEnabled: true });
    expect(off[CARD_FORCE_TARGET]).toBeCloseTo(1 / 12);
    expect(on[CARD_FORCE_TARGET]).toBeCloseTo(0.18);
    expect(Object.values(on).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("maps shuffled stage positions to their coarse zones", () => {
    const stage = cardEffect.stage();
    const binding = cardEffect.channels(stage)[0]!;
    expect(binding.values).toHaveLength(6);
    expect(binding.likelihood("h-a", { channel: "gaze", value: "top-left", reliability: 1, at: 0 })).toBe(1);
    expect(binding.likelihood("h-a", { channel: "gaze", value: "top-right", reliability: 1, at: 0 })).toBe(0);
    expect(binding.likelihood("s-4", { channel: "gaze", value: "bottom-right", reliability: 1, at: 0 })).toBe(1);

    const reversed = { ...stage, items: [...stage.items].reverse() };
    const shuffledBinding = cardEffect.channels(reversed)[0]!;
    expect(
      shuffledBinding.likelihood("h-a", { channel: "gaze", value: "bottom-right", reliability: 1, at: 0 })
    ).toBe(1);
  });

  it("reaches the right card with truthful answers and abstains otherwise", () => {
    let t = 0;
    const session = new PerformanceSession(cardEffect, { seed: 11, now: () => (t += 100) });
    session.begin();
    session.chosen();
    for (let i = 0; i < 8; i++) {
      if (session.phaseName === "recover") {
        session.advance();
        continue;
      }
      if (session.phaseName === "probe") {
        answerTruth(session, CARD_FORCE_TARGET);
        continue;
      }
      break;
    }
    expect(session.phaseName).toBe("build");
    session.advance();
    expect(session.snapshot().phase).toBe("reveal");
    expect(session.snapshot().reveal?.id).toBe(CARD_FORCE_TARGET);
  });
});
