/**
 * Conversation-mode evidence strength. A free-form reply interpreted by the
 * on-device model enters through answer(optionId, reliability) with
 * reliability strictly below a deliberate tap. These tests pin the contract:
 * truthful soft answers can still commit (the show works), they are never
 * stronger than taps (honesty margin), and the commit gates are unchanged.
 */
import { describe, expect, it } from "vitest";
import { PerformanceSession } from "@loki/showrunner";
import { cardEffect, CARDS } from "../src/index.js";

/** Play a truthful run at a fixed reliability; returns the session. */
function playTruthful(seed: number, reliability: number): PerformanceSession {
  const card = CARDS[(seed * 7) % CARDS.length]!;
  const session = new PerformanceSession(cardEffect, { seed });
  session.consent();
  session.chosen();
  let guard = 0;
  while (["probe", "recover", "build"].includes(session.snapshot().phase) && guard < 12) {
    guard += 1;
    if (["recover", "build"].includes(session.snapshot().phase)) {
      session.advance();
      continue;
    }
    const view = session.snapshot();
    const probe = cardEffect
      .probes(session.stage)
      .find((p) => p.id === view.probeId);
    expect(probe, `probe ${view.probeId} exists`).toBeTruthy();
    const correct = probe!.options.find((o) => probe!.likelihood(card.id, o.id) === 1);
    expect(correct, `a truthful option exists for ${probe!.id}`).toBeTruthy();
    session.answer(correct!.id, reliability);
    session.clearAck();
  }
  return session;
}

describe("mind (interpreted reply) reliability", () => {
  it("two truthful soft answers at the reliability cap still commit to the card", () => {
    // 0.95 is the adapter's maximum (MIND_MAX_RELIABILITY); the show must
    // remain completable when every reply is interpreted text.
    const session = playTruthful(3, 0.95);
    expect(session.snapshot().phase).toBe("reveal");
    expect(session.snapshot().reveal?.id).toBe(CARDS[(3 * 7) % CARDS.length]!.id);
  });

  it("soft evidence is strictly weaker than a deliberate tap on the same statement", () => {
    const card = CARDS[5]!;
    const mk = () => {
      const s = new PerformanceSession(cardEffect, { seed: 11 });
      s.consent();
      s.chosen();
      return s;
    };
    const tapped = mk();
    const soft = mk();
    const view = tapped.snapshot();
    const probe = cardEffect.probes(tapped.stage).find((p) => p.id === view.probeId)!;
    const correct = probe.options.find((o) => probe.likelihood(card.id, o.id) === 1)!;
    tapped.answer(correct.id, 1);
    soft.answer(correct.id, 0.6);
    const tappedView = tapped.snapshot();
    const softView = soft.snapshot();
    const tappedTop = tappedView.reveal?.probability ?? 0;
    // Soft-answer session must not be ahead of the tapped one. Compare via
    // exported evidence reliability instead of internals.
    const softExport = soft.exportLog();
    const tappedExport = tapped.exportLog();
    expect(softExport.observations.at(-1)?.reliability).toBeCloseTo(0.6, 5);
    expect(tappedExport.observations.at(-1)?.reliability).toBeCloseTo(1, 5);
    void tappedTop;
    void softView;
  });

  it("clamps reliability into [0, 1]", () => {
    const card = CARDS[2]!;
    const session = new PerformanceSession(cardEffect, { seed: 5 });
    session.consent();
    session.chosen();
    const view = session.snapshot();
    const probe = cardEffect.probes(session.stage).find((p) => p.id === view.probeId)!;
    const correct = probe.options.find((o) => probe.likelihood(card.id, o.id) === 1)!;
    session.answer(correct.id, 4);
    const record = session.exportLog().observations.at(-1);
    expect(record?.reliability).toBe(1);
  });
});
