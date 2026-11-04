import { describe, expect, it } from "vitest";
import { EFFECTS, effectChoice, type EffectId } from "./effects.js";

describe("show continuation (next-act handoffs)", () => {
  it("every act names the act it hands off to", () => {
    for (const choice of EFFECTS) {
      expect(choice.next, `${choice.id} has no next act`).toBeDefined();
    }
  });

  it("next pointers form one continuous loop through all three acts", () => {
    const seen: EffectId[] = [];
    let current = EFFECTS[0]!;
    for (let step = 0; step < EFFECTS.length; step++) {
      seen.push(current.id);
      current = effectChoice(current.next!.id);
    }
    expect(seen.sort()).toEqual([...EFFECTS.map((e) => e.id)].sort());
    // The loop closes: after visiting every act we are back at the start.
    expect(current.id).toBe(EFFECTS[0]!.id);
  });

  it("theatrical order: Twelve hands to Ember, Ember hands to the Countdown", () => {
    expect(effectChoice("card-twelve").next?.id).toBe("ember-words");
    expect(effectChoice("ember-words").next?.id).toBe("countdown-force");
    expect(effectChoice("countdown-force").next?.id).toBe("card-twelve");
  });

  it("handoff labels name the destination act", () => {
    expect(effectChoice("card-twelve").next?.label).toContain("Ember Words");
    expect(effectChoice("ember-words").next?.label).toContain("Countdown");
    expect(effectChoice("countdown-force").next?.label).toContain("The Twelve");
  });
});
