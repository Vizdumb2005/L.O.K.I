import { describe, expect, it } from "vitest";
import { sha256Hex, verifySealedPrediction } from "@loki/effect-api";
import { PerformanceSession } from "@loki/showrunner";
import { exampleEffect, WORDS } from "../src/index.js";

function answerTruth(session: PerformanceSession, trueId: string): void {
  const view = session.snapshot();
  const probe = exampleEffect.probes().find((p) => p.id === view.probeId);
  if (!probe) throw new Error(`no probe in phase ${view.phase}`);
  let best = probe.options[0]!.id;
  let bestP = -1;
  for (const option of probe.options) {
    const p = probe.likelihood(trueId, option.id);
    if (p > bestP) { bestP = p; best = option.id; }
  }
  session.answer(best);
  session.clearAck();
}

function drive(session: PerformanceSession, trueId: string): void {
  for (let i = 0; i < 12; i++) {
    const phase = session.phaseName;
    if (phase === "probe") { answerTruth(session, trueId); continue; }
    if (phase === "recover" || phase === "build") { session.advance(); continue; }
    break;
  }
}

function sealedSession() {
  let t = 0;
  const session = new PerformanceSession(exampleEffect, {
    seed: 7,
    forceEnabled: true,
    now: () => (t += 100)
  });
  session.begin();
  return session;
}

describe("sealed prediction (Ember Words)", () => {
  it("commits before any answer and never leaks the target pre-reveal", () => {
    const session = sealedSession();
    expect(session.snapshot().sealedCommitment).toBeUndefined();
    session.chosen();
    const first = session.snapshot();
    expect(first.phase).toBe("probe");
    expect(first.sealedCommitment).toMatch(/^[0-9a-f]{64}$/);
    // The stage legitimately lists every word; the seal must add no target/nonce leak.
    expect(first.sealedOpened).toBeUndefined();
    const firstJson = JSON.stringify(first);
    answerTruth(session, "comet");
    const second = session.snapshot();
    expect(second.sealedCommitment).toBe(first.sealedCommitment);
    expect(second.sealedOpened).toBeUndefined();
    expect(session.exportLog().sealed).toBeUndefined();
    // After the show, prove the pre-answer view never contained the nonce.
    drive(session, "comet");
    const nonce = session.exportLog().sealed!.nonce;
    expect(firstJson).not.toContain(nonce);
    expect(JSON.stringify(second)).not.toContain(nonce);
  });

  it("force success reveals, opens verbatim, verifies, and uses the punchline hush", () => {
    const session = sealedSession();
    session.chosen();
    const commitment = session.snapshot().sealedCommitment!;
    drive(session, "comet");
    expect(session.phaseName).toBe("reveal");
    expect(session.snapshot().reveal?.id).toBe("comet");
    const opened = session.exportLog().sealed;
    expect(opened).toBeDefined();
    expect(opened!.hypothesisId).toBe("comet");
    expect(opened!.commitment).toBe(commitment);
    expect(opened!.verified).toBe(true);
    expect(sha256Hex(`${opened!.hypothesisId}:${opened!.nonce}`)).toBe(commitment);
    expect(verifySealedPrediction(
      { hypothesisId: opened!.hypothesisId, nonce: opened!.nonce, commitment: opened!.commitment, committedAt: 0 },
      opened!.hypothesisId,
      opened!.nonce
    )).toBe(true);
    expect(session.snapshot().sealedOpened).toEqual({
      commitment,
      hypothesisId: "comet",
      nonce: opened!.nonce,
      verified: true
    });
    const cues = session.snapshot().cues;
    expect(cues.map((c) => c.kind)).toEqual(["hush", "punchline", "reveal"]);
    expect(cues.map((c) => c.holdMs)).toEqual([1700, 1900, 0]);
  });

  it("force failure is an honest miss: prediction opens as-is and is never swapped", () => {
    const session = sealedSession();
    session.chosen();
    const commitment = session.snapshot().sealedCommitment!;
    drive(session, "sun");
    // Inference reached Sun, the seal said Comet: the only honest end is a miss.
    expect(session.phaseName).toBe("miss");
    expect(session.snapshot().reveal).toBeUndefined();
    const opened = session.exportLog().sealed;
    expect(opened!.hypothesisId).toBe("comet");
    expect(opened!.commitment).toBe(commitment);
    expect(opened!.verified).toBe(false);
    expect(sha256Hex(`${opened!.hypothesisId}:${opened!.nonce}`)).toBe(commitment);
  });

  it("tampering with the commitment fails verification and misses", () => {
    const session = sealedSession();
    session.chosen();
    const inner = session as unknown as { sealed: { commitment: string } };
    inner.sealed.commitment = "0".repeat(64);
    drive(session, "comet");
    expect(session.phaseName).toBe("miss");
    expect(session.snapshot().reveal).toBeUndefined();
    expect(session.exportLog().sealed?.verified).toBe(false);
    expect(session.exportLog().sealed?.hypothesisId).toBe("comet");
  });

  it("unsealed shows expose no commitment and no opened seal", () => {
    let t = 0;
    const session = new PerformanceSession(exampleEffect, { seed: 7, forceEnabled: false, now: () => (t += 100) });
    session.begin();
    session.chosen();
    expect(session.snapshot().sealedCommitment).toBeUndefined();
    drive(session, "moon");
    expect(session.phaseName).toBe("reveal");
    expect(session.exportLog().sealed).toBeUndefined();
    expect(session.snapshot().sealedOpened).toBeUndefined();
    // Unsealed reveal keeps the classic two-hush delivery, no punchline.
    expect(session.snapshot().cues.map((c) => c.kind)).toEqual(["hush", "hush", "reveal"]);
  });

  it("truthful Ember runs commit in at most two answered beats", () => {
    for (const word of WORDS) {
      let t = 0;
      const session = new PerformanceSession(exampleEffect, { seed: 5, now: () => (t += 100) });
      session.begin();
      session.chosen();
      drive(session, word.id);
      expect(session.phaseName).toBe("reveal");
      expect(session.snapshot().reveal?.id).toBe(word.id);
      expect(session.internal().answered).toBeLessThanOrEqual(2);
    }
  });
});
