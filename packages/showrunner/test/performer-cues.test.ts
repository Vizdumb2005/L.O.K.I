import { describe, expect, it } from "vitest";
import { Performer, HESITATE_HOLD_MS, PUNCHLINE_HUSH_MS } from "../src/performer.js";

describe("performer hesitate / punchline cues", () => {
  it("hesitate lines are sanitised, short, and never repeat consecutively", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const performer = new Performer(seed);
      let previous = "";
      for (let i = 0; i < 6; i++) {
        const cue = performer.hesitate();
        expect(cue.kind).toBe("hesitate");
        expect(cue.holdMs).toBe(HESITATE_HOLD_MS);
        expect(cue.line.length).toBeLessThanOrEqual(180);
        expect(cue.line).not.toBe(previous);
        previous = cue.line;
      }
    }
  });

  it("buildSequence inserts middle cues between recap and build", () => {
    const performer = new Performer(3);
    const recap = performer.recap(["True of my card"]);
    const hesitate = performer.hesitate();
    const withMiddle = performer.buildSequence(recap, "It is becoming clear.", [hesitate]);
    expect(withMiddle.map((c) => c.kind)).toEqual(["recap", "hesitate", "build"]);
    const plain = performer.buildSequence(recap, "It is becoming clear.");
    expect(plain.map((c) => c.kind)).toEqual(["recap", "build"]);
  });

  it("punchlineSequence holds [1700, 1900, 0] with kinds [hush, punchline, reveal]", () => {
    const cues = new Performer(3).punchlineSequence("It was Alpha.");
    expect(cues.map((c) => c.holdMs)).toEqual([1700, PUNCHLINE_HUSH_MS, 0]);
    expect(cues.map((c) => c.kind)).toEqual(["hush", "punchline", "reveal"]);
    expect(PUNCHLINE_HUSH_MS).toBe(1900);
  });
});
