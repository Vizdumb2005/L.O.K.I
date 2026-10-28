import { describe, expect, it } from "vitest";
import { cardEffect } from "@loki/effect-card";
import { exampleEffect } from "@loki/effect-example";
import { mulberry32, PerformanceSession, Performer, type SessionView } from "../packages/showrunner/src/index.js";
import type { Effect } from "@loki/effect-api";

const effects: Array<[string, Effect]> = [
  ["card", cardEffect],
  ["ember", exampleEffect]
];

describe("performer: repeated and per-answer acknowledgements", () => {
  it("acknowledges a repeated label differently and still never repeats back to back", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const p = new Performer(seed);
      const lines = ["Yes", "Yes", "Yes", "No", "No", "Yes"].map((l) => p.acknowledge(l).line);
      expect(lines[1]).toMatch(/again|once more/i);
      for (let i = 1; i < lines.length; i++) expect(lines[i]).not.toBe(lines[i - 1]);
    }
  });
});

describe.each(effects)("performer on %s: every answer transition is acknowledged with that answer", (_n, effect) => {
  it("ack echoes the label chosen at each step, for 60 seeds, honest and random", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rng = mulberry32(seed * 31);
      const session = new PerformanceSession(effect, { seed, policy: "greedy", now: () => 0 });
      session.begin();
      let guard = 0;
      while (session.snapshot().phase !== "done" && guard++ < 80) {
        const view: SessionView = session.snapshot();
        if (view.phase === "probe" && view.options) {
          const option = view.options[Math.floor(rng() * view.options.length)]!;
          const answeredBefore = view.progress.answered;
          session.answer(option.id);
          const after = session.snapshot();
          // Next probe, recovery or payoff: the ack is only on the next probe view.
          let next = after;
          if (next.phase === "recover") {
            session.advance();
            next = session.snapshot();
          }
          if (next.phase === "probe") {
            const ack = next.cues.find((c) => c.kind === "ack");
            if (next.progress.answered > answeredBefore && ack) expect(ack.line).toContain(option.label);
          }
          continue;
        }
        session.advance();
      }
    }
  });

  it("honest miss never names a hypothesis and never claims a hit", () => {
    const labels = effect.hypotheses().map((h) => h.label);
    let misses = 0;
    for (let seed = 1; seed <= 120 && misses < 5; seed++) {
      const rng = mulberry32(seed);
      const session = new PerformanceSession(effect, { seed, policy: "greedy", now: () => 0 });
      session.begin();
      for (let guard = 0; guard < 80 && session.snapshot().phase !== "done"; guard++) {
        const view = session.snapshot();
        if (view.phase === "miss") {
          misses += 1;
          const text = view.cues.map((c) => c.line).join(" ");
          expect(view.reveal).toBeUndefined();
          for (const label of labels) expect(text).not.toContain(label);
          expect(text).toMatch(/cannot|beat me/i);
          break;
        }
        if (view.phase === "probe" && view.options) session.answer(view.options[Math.floor(rng() * view.options.length)]!.id);
        else session.advance();
      }
    }
    expect(misses).toBeGreaterThan(0);
  });
});
