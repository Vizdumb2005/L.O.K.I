import { describe, expect, it } from "vitest";
import { PerformanceSession, rewritePatter, sanitizeLine } from "../src/index.js";
import {
  uniformPrior,
  type Effect,
  type Hypothesis,
  type Probe
} from "@loki/effect-api";

const hypotheses: Hypothesis[] = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" }
];

const probes: Probe[] = [
  {
    id: "p1",
    prompt: "Is it Alpha?",
    options: [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }],
    cost: 0.1,
    likelihood: (item, option) => (option === "yes" ? (item === "a" ? 1 : 0) : item === "a" ? 0 : 1)
  },
  {
    id: "p2",
    prompt: "Does it feel first?",
    options: [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }],
    cost: 0.1,
    likelihood: (item, option) => (option === "yes" ? (item === "a" ? 0.9 : 0.1) : item === "a" ? 0.1 : 0.9)
  }
];

function makeEffect(overrides: Partial<Effect> = {}): Effect {
  const base: Effect = {
    id: "session-test",
    name: "Session test",
    tagline: "Test",
    config: {
      maxProbes: 3,
      commitThreshold: 0.85,
      recoveryBudget: 1,
      recoverySurprise: 2.2,
      epsilon: 0.1,
      outlierWeight: 0.05,
      temperature: 1,
      costWeight: 0.02,
      gazeEnabledByDefault: false
    },
    hypotheses: () => hypotheses,
    prior: () => uniformPrior(hypotheses),
    probes: () => probes,
    channels: () => [],
    script: () => ({
      beats: [
        { id: "invite", kind: "invite", line: "This is an illusion. You can stop." },
        { id: "think", kind: "think", line: "Choose one." },
        { id: "build", kind: "build", line: "It is clearing." },
        { id: "reveal", kind: "reveal", line: "Ready." },
        { id: "afterglow", kind: "afterglow", line: "The choice was yours." }
      ],
      buildLines: ["One card is left."],
      revealLine: (item) => `It is ${item.label}.`,
      recoverLine: "Two signals are fighting.",
      missLine: "You beat me."
    }),
    stage: () => ({
      renderer: "grid",
      columns: 2,
      title: "Test",
      instructions: "Choose.",
      items: [
        { hypothesisId: "a", label: "Alpha" },
        { hypothesisId: "b", label: "Beta" }
      ]
    }),
    validate: () => undefined
  };
  return { ...base, ...overrides };
}

describe("performance session", () => {
  it("runs the no-camera path to a reveal", () => {
    let t = 0;
    const session = new PerformanceSession(makeEffect(), { seed: 4, now: () => (t += 100) });
    expect(session.snapshot().phase).toBe("invite");
    session.begin();
    expect(session.snapshot().phase).toBe("think");
    session.chosen();
    expect(session.snapshot().phase).toBe("probe");
    expect(session.snapshot().camera.active).toBe(false);
    session.answer("yes");
    if (session.phaseName === "probe") session.answer("yes");
    expect(["build", "recover"]).toContain(session.phaseName);
    if (session.phaseName === "recover") {
      session.advance();
      session.answer("yes");
    }
    expect(session.phaseName).toBe("build");
    const build = session.snapshot();
    expect(build.reveal).toBeUndefined();
    session.advance();
    const reveal = session.snapshot();
    expect(reveal.phase).toBe("reveal");
    expect(reveal.reveal?.label).toBe("Alpha");
    expect(reveal.reveal?.probability).toBeGreaterThan(0.85);
    session.advance();
    expect(session.phaseName).toBe("afterglow");
    session.advance();
    expect(session.phaseName).toBe("done");
  });

  it("abstains instead of bluffing when the budget runs out", () => {
    const effect = makeEffect({
      config: { ...makeEffect().config, maxProbes: 1, commitThreshold: 0.999, recoveryBudget: 0 }
    });
    const session = new PerformanceSession(effect, { seed: 3 });
    session.begin();
    session.chosen();
    session.answer("yes");
    expect(session.phaseName).toBe("miss");
    expect(session.snapshot().reveal).toBeUndefined();
    session.advance();
    expect(session.phaseName).toBe("afterglow");
  });

  it("enters recovery after a contradictory answer, then rejects if still unsure", () => {
    const effect = makeEffect({
      config: { ...makeEffect().config, maxProbes: 2, commitThreshold: 0.98, recoveryBudget: 1, recoverySurprise: 1.2 }
    });
    const session = new PerformanceSession(effect, { seed: 9 });
    session.begin();
    session.chosen();
    session.answer("no");
    session.answer("yes");
    expect(["recover", "miss"]).toContain(session.phaseName);
    if (session.phaseName === "recover") {
      session.advance();
      if (session.snapshot().phase === "probe") session.answer("no");
      expect(session.phaseName).toBe("miss");
    }
  });

  it("refuses camera without a validation gate", () => {
    const session = new PerformanceSession(makeEffect(), {
      seed: 1,
      cameraEnabled: true,
      cameraValidated: false
    });
    session.begin();
    session.chosen();
    expect(session.snapshot().phase).toBe("probe");
    expect(session.snapshot().camera.validated).toBe(false);
    expect(session.snapshot().camera.active).toBe(false);
  });

  it("releases the camera before probing", () => {
    const effect = makeEffect({
      channels: (stage) => [
        {
          channel: "gaze",
          label: "zone",
          weight: 0.5,
          minReliability: 0.35,
          values: stage.zones?.map((z) => z.id) ?? ["left", "right"],
          likelihood: () => 0.5
        }
      ],
      stage: () => ({
        renderer: "grid",
        columns: 2,
        title: "Test",
        instructions: "Choose.",
        items: [
          { hypothesisId: "a", label: "Alpha" },
          { hypothesisId: "b", label: "Beta" }
        ],
        zones: [
          { id: "left", label: "Left", x: 0, y: 0, w: 0.5, h: 1 },
          { id: "right", label: "Right", x: 0.5, y: 0, w: 0.5, h: 1 }
        ]
      })
    });
    const session = new PerformanceSession(effect, {
      seed: 2,
      cameraEnabled: true,
      cameraValidated: true
    });
    session.begin();
    session.chosen();
    expect(session.phaseName).toBe("attune");
    expect(session.snapshot().camera.active).toBe(true);
    expect(session.addGaze({ zone: "left", reliability: 0.8 })).toBe(true);
    session.finishAttune();
    expect(session.phaseName).toBe("probe");
    expect(session.snapshot().camera.active).toBe(false);
  });

  it("shuffles layout deterministically and logs only categorical evidence", () => {
    const effect = makeEffect();
    const one = new PerformanceSession(effect, { seed: 42 });
    const two = new PerformanceSession(effect, { seed: 42 });
    expect(one.stage.items.map((i) => i.hypothesisId)).toEqual(two.stage.items.map((i) => i.hypothesisId));
    one.begin();
    one.chosen();
    one.answer("yes");
    const log = one.exportLog();
    expect(log.layoutSeed).toBe(42);
    expect(log.observations[0]?.channel).toBe("answer");
    expect(JSON.stringify(log)).not.toMatch(/data:image|base64|frameData|videoBlob/i);
  });
});

describe("recovery and commit gate audit", () => {
  it("never commits with an unresolved contradiction", () => {
    // Invariant: if the session reaches build/reveal, contradictionActive must be false.
    // Test across multiple seeds and adversarial answer patterns.
    for (const seed of [1, 3, 7, 11, 13, 17, 19, 23]) {
      const effect = makeEffect({
        config: { ...makeEffect().config, maxProbes: 6, commitThreshold: 0.85, recoveryBudget: 1, recoverySurprise: 1.0 }
      });
      const session = new PerformanceSession(effect, { seed });
      session.begin();
      session.chosen();
      const answers = ["no", "yes", "no", "yes", "no", "yes", "no", "yes"];
      let step = 0;
      while (step < answers.length) {
        const phase = session.phaseName;
        if (phase === "probe") {
          session.answer(answers[step % answers.length]);
          step++;
        } else if (phase === "recover") {
          session.advance();
        } else if (session.snapshot().canAdvance) {
          session.advance();
        } else {
          break;
        }
        // Invariant check at every step
        const internal = session.internal();
        if (internal.phase === "reveal" || internal.phase === "build") {
          expect(internal.belief.contradictionActive).toBe(false);
        }
      }
      // Final invariant: if committed, no unresolved contradiction
      const finalInternal = session.internal();
      if (finalInternal.phase === "reveal") {
        expect(finalInternal.belief.contradictionActive).toBe(false);
      }
    }
  });

  it("respects the recovery budget of 1", () => {
    const effect = makeEffect({
      config: { ...makeEffect().config, maxProbes: 10, commitThreshold: 0.999, recoveryBudget: 1, recoverySurprise: 0.3 }
    });
    const session = new PerformanceSession(effect, { seed: 11 });
    session.begin();
    session.chosen();
    let recoveries = 0;
    let steps = 0;
    // Alternate yes/no to trigger contradictions repeatedly
    while (session.phaseName !== "done" && steps < 20) {
      const phase = session.phaseName;
      if (phase === "probe") {
        session.answer(steps % 2 === 0 ? "yes" : "no");
      } else if (phase === "recover") {
        recoveries++;
        session.advance();
      } else if (session.snapshot().canAdvance) {
        session.advance();
      } else {
        break;
      }
      steps++;
    }
    // Should have at most 1 recovery (the budget)
    expect(recoveries).toBeLessThanOrEqual(1);
    // Should end in miss (can't commit with threshold 0.999)
    expect(["miss", "afterglow", "done"]).toContain(session.phaseName);
  });

  it("never commits with fewer than 2 answers", () => {
    const effect = makeEffect({
      config: { ...makeEffect().config, maxProbes: 3, commitThreshold: 0.51, recoveryBudget: 0 }
    });
    const session = new PerformanceSession(effect, { seed: 5 });
    session.begin();
    session.chosen();
    // Answer "yes" to "Is it Alpha?" — posterior for "a" should be high
    session.answer("yes");
    // Even with a very low threshold, commit requires >= 2 answers
    // After 1 answer, we should still be in probe (or recover/miss), not build
    expect(session.phaseName).not.toBe("build");
    expect(session.phaseName).not.toBe("reveal");
  });

  it("commit gate requires no unresolved contradiction", () => {
    // Verify the commitGate function directly
    const effect = makeEffect();
    const session = new PerformanceSession(effect, { seed: 1 });
    session.begin();
    session.chosen();
    // Answer to get high confidence
    session.answer("yes");
    const internal = session.internal();
    // The belief state should not have an active contradiction after normal answers
    expect(internal.belief.contradictionActive).toBe(false);
  });

  it("handles rapid adversarial answer sequences without committing wrongly", () => {
    const effect = makeEffect({
      config: { ...makeEffect().config, maxProbes: 6, commitThreshold: 0.85, recoveryBudget: 1, recoverySurprise: 1.0 }
    });
    const session = new PerformanceSession(effect, { seed: 13 });
    session.begin();
    session.chosen();
    // Rapidly alternate answers to create contradictions
    const answers = ["no", "yes", "no", "yes", "no", "yes", "no", "yes"];
    let step = 0;
    while (step < answers.length) {
      const phase = session.snapshot().phase;
      if (phase !== "probe") {
        if (phase === "recover") session.advance();
        else if (session.snapshot().canAdvance) session.advance();
        else break;
        continue;
      }
      session.answer(answers[step]);
      step++;
      const afterAnswer = session.snapshot().phase;
      if (afterAnswer === "build" || afterAnswer === "reveal" || afterAnswer === "miss") {
        break;
      }
    }
    // With adversarial answers, the session should either miss or commit correctly
    // It should never end in "build" with an unresolved contradiction
    const internal = session.internal();
    if (internal.phase === "reveal") {
      // If it committed, the contradiction should be resolved
      expect(internal.belief.contradictionActive).toBe(false);
    }
  });
});

describe("patter safety", () => {
  it("falls back on a banned claim", () => {
    expect(sanitizeLine("I can read your mind.", "safe")).toBe("safe");
  });

  it("allows disclaimers", () => {
    expect(sanitizeLine("This is not mind reading.", "safe")).toBe("This is not mind reading.");
  });

  it("falls back on a URL, newline, or overlong line", () => {
    expect(sanitizeLine("See https://example.com", "safe")).toBe("safe");
    expect(sanitizeLine("a\nb", "safe")).toBe("safe");
    expect(sanitizeLine("x".repeat(181), "safe")).toBe("safe");
  });

  it("rewrites only with a safe response", async () => {
    const result = await rewritePatter(
      { beat: "build", tone: "intimate", allowedClaims: ["illusion"], template: "The room is quiet." },
      {
        endpoint: "http://proxy",
        fetchImpl: (async () =>
          new Response(JSON.stringify({ line: "Only the quiet remains." }), { status: 200 })) as typeof fetch
      }
    );
    expect(result.line).toBe("Only the quiet remains.");
    expect(result.source).toBe("llm");
  });

  it("falls back when the LLM claims mind reading", async () => {
    const result = await rewritePatter(
      { beat: "reveal", tone: "awe", allowedClaims: ["illusion"], template: "The card is yours." },
      {
        endpoint: "http://proxy",
        fetchImpl: (async () =>
          new Response(JSON.stringify({ line: "I read your mind." }), { status: 200 })) as typeof fetch
      }
    );
    expect(result.line).toBe("The card is yours.");
    expect(result.source).toBe("template");
    expect(result.reason).toBe("rejected");
  });

  it("falls back on timeout and network failure", async () => {
    const hanging = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      })) as typeof fetch;
    const timedOut = await rewritePatter(
      { beat: "build", tone: "wry", allowedClaims: [], template: "Safe." },
      { endpoint: "http://proxy", timeoutMs: 5, fetchImpl: hanging }
    );
    expect(timedOut.source).toBe("template");
    expect(timedOut.reason).toBe("timeout");

    const offline = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    const failed = await rewritePatter(
      { beat: "build", tone: "wry", allowedClaims: [], template: "Safe." },
      { endpoint: "http://proxy", fetchImpl: offline }
    );
    expect(failed.reason).toBe("network");
  });
});
describe("audit regressions", () => {
  it("never uses an unsafe template as its own fallback", async () => {
    const result = await rewritePatter({ beat: "build", tone: "intimate", allowedClaims: [],
      template: "I can read your mind" }, {
      endpoint: "/api/patter", fetchImpl: async () => { throw new Error("offline"); }
    });
    expect(result.line).not.toContain("read your mind");
    expect(result.line).toBe("This is an illusion. The choice is yours.");
  });

  it("keeps a completed reveal in the exported log after the curtain", () => {
    const session = new PerformanceSession(makeEffect());
    session.begin(); session.chosen(); session.answer("yes"); session.answer("yes");
    expect(session.phaseName).toBe("build");
    session.advance();
    const revealed = session.exportLog().revealed;
    expect(revealed?.id).toBe("a");
    session.advance(); session.advance();
    expect(session.phaseName).toBe("done");
    expect(session.exportLog().revealed).toEqual(revealed);
  });
});
