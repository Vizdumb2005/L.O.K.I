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
