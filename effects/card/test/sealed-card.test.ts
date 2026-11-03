import { describe, expect, it } from "vitest";
import { PerformanceSession } from "@loki/showrunner";
import { cardEffect, CARD_FORCE_TARGET } from "../src/index.js";

describe("card soft force stays unsealed (design seal scope: Ember first)", () => {
  it("declares no forceSpec, keeps the logged prior lift, and exposes no seal", () => {
    expect(cardEffect.forceSpec).toBeUndefined();
    expect(cardEffect.script().revealMode).toBeUndefined();
    const off = cardEffect.prior({ forceEnabled: false });
    const on = cardEffect.prior({ forceEnabled: true });
    expect(off[CARD_FORCE_TARGET]).toBeCloseTo(1 / 12);
    expect(on[CARD_FORCE_TARGET]!).toBeGreaterThan(off[CARD_FORCE_TARGET]!);

    let t = 0;
    const session = new PerformanceSession(cardEffect, { seed: 7, forceEnabled: true, now: () => (t += 100) });
    session.begin();
    session.chosen();
    expect(session.snapshot().sealedCommitment).toBeUndefined();
    expect(session.snapshot().sealedOpened).toBeUndefined();
    expect(session.exportLog().sealed).toBeUndefined();
  });
});
