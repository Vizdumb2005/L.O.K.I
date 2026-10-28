import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findBannedClaim, type Effect } from "@loki/effect-api";
import { cardEffect } from "@loki/effect-card";
import { exampleEffect } from "@loki/effect-example";
import { PerformanceSession, Performer, type Cue, type SessionView } from "../packages/showrunner/src/index.js";

function play(effect: Effect, seed: number, pick: (n: number) => number): SessionView[] {
  const session = new PerformanceSession(effect, { seed, policy: "greedy", now: () => 0 });
  session.begin();
  const views: SessionView[] = [session.snapshot()];
  for (let guard = 0; guard < 60; guard++) {
    const view = session.snapshot();
    if (view.phase === "probe" && view.options) {
      session.answer(view.options[pick(guard) % view.options.length]!.id);
    } else if (view.phase === "done") {
      break;
    } else {
      session.advance();
    }
    views.push(session.snapshot());
  }
  return views;
}

const effects: Array<[string, Effect]> = [
  ["card", cardEffect],
  ["example", exampleEffect]
];

describe("performer cues", () => {
  it("never repeats an acknowledgement template back to back", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const performer = new Performer(seed);
      let previous = "";
      for (let i = 0; i < 6; i++) {
        const line = performer.acknowledge("Yes").line;
        expect(line).not.toBe(previous);
        previous = line;
      }
    }
  });

  it("acknowledges only the chosen label and passes the banned-claim scan", () => {
    const performer = new Performer(7);
    for (const label of ["Hearts", "No", "Low card"]) {
      const cue = performer.acknowledge(label);
      expect(cue.line).toContain(label);
      expect(findBannedClaim(cue.line)).toBeNull();
      expect(cue.holdMs).toBeGreaterThan(0);
    }
  });

  it("builds a staged reveal (>=3 cues, last rests) and honest miss (>=2 cues, last rests)", () => {
    const performer = new Performer(3);
    const reveal = performer.revealSequence("It was X.");
    expect(reveal.length).toBeGreaterThanOrEqual(3);
    expect(reveal.slice(0, -1).every((c) => c.holdMs >= 1000)).toBe(true);
    expect(reveal[reveal.length - 1]).toMatchObject({ kind: "reveal", holdMs: 0 });
    const miss = performer.missSequence("You beat me.");
    expect(miss.length).toBeGreaterThanOrEqual(2);
    expect(miss[0]!.line).toMatch(/cannot/);
    expect(miss[miss.length - 1]).toMatchObject({ kind: "miss", holdMs: 0 });
  });

  it("recaps only the person's own labels in order", () => {
    const cue = new Performer(1).recap(["Hearts", "Low", "Yes"]);
    expect(cue.line).toBe("You told me Hearts, Low and Yes. I have kept all of it.");
  });
});

describe.each(effects)("performer through the shared session (%s)", (_name, effect) => {
  it("last cue always equals the line and rests; every probe answer is acknowledged", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const views = play(effect, seed, (n) => n + seed);
      let sawAck = false;
      for (const view of views) {
        const last = view.cues[view.cues.length - 1]!;
        expect(last.line).toBe(view.line);
        expect(last.holdMs).toBe(0);
        view.cues.slice(0, -1).forEach((c: Cue) => expect(c.holdMs).toBeGreaterThan(0));
        if (view.phase === "probe" && view.progress.answered > 0 && view.cues[0]!.kind === "ack") sawAck = true;
      }
      expect(sawAck || views.every((v) => v.phase !== "probe" || v.progress.answered === 0)).toBe(true);
    }
  });

  it("only adds reveal cues in the reveal phase and only after the commit gate", () => {
    for (let seed = 1; seed <= 25; seed++) {
      for (const view of play(effect, seed, (n) => n)) {
        const hasHush = view.cues.some((c) => c.kind === "hush" || c.kind === "reveal");
        expect(hasHush).toBe(view.phase === "reveal");
        const hasConcede = view.cues.some((c) => c.kind === "concede");
        expect(hasConcede).toBe(view.phase === "miss");
      }
    }
  });

  it("does not name any hypothesis before the reveal, except labels the person chose", () => {
    const labels = effect.hypotheses().map((h) => h.label);
    for (let seed = 1; seed <= 25; seed++) {
      const picked: string[] = [];
      const session = new PerformanceSession(effect, { seed, policy: "greedy", now: () => 0 });
      session.begin();
      for (let guard = 0; guard < 60; guard++) {
        const view = session.snapshot();
        if (view.phase === "reveal" || view.phase === "miss" || view.phase === "done") break;
        if (view.phase === "build") {
          // Recap and build cues may only contain what the person chose.
          for (const cue of view.cues.filter((c) => c.kind === "recap")) {
            for (const label of labels) {
              if (picked.every((p) => !p.includes(label))) expect(cue.line).not.toContain(label);
            }
          }
        }
        if (view.phase === "probe" && view.options) {
          const option = view.options[guard % view.options.length]!;
          picked.push(option.label);
          session.answer(option.id);
        } else {
          session.advance();
        }
      }
    }
  });
});

describe("performer is domain neutral", () => {
  it("has no card, word or effect identifiers in its source", () => {
    const source = readFileSync(new URL("../packages/showrunner/src/performer.ts", import.meta.url), "utf8");
    for (const banned of [/\bcard\b/i, /\bsuit\b/i, /hearts/i, /spade/i, /\bword\b/i, /ember/i, /letter/i]) {
      expect(source).not.toMatch(banned);
    }
  });
});
