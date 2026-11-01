import { cardEffect } from "@loki/effect-card";
import { exampleEffect } from "@loki/effect-example";
import type { Effect } from "@loki/effect-api";

export type EffectId = "card-twelve" | "ember-words";

export interface EffectChoice {
  id: EffectId;
  title: string;
  eyebrow: string;
  blurb: string;
  meta: string;
  effect: Effect;
}

export const EFFECTS: EffectChoice[] = [
  {
    id: "card-twelve",
    title: "The Twelve",
    eyebrow: "Act I · Primary effect",
    blurb: "Twelve playing cards projected onto a mental screen. Sensory and geometric impressions, then one reveal.",
    meta: "12 cards · 4 to 6 impressions · abstains below 96%",
    effect: cardEffect
  },
  {
    id: "ember-words",
    title: "Ember Words",
    eyebrow: "Act II · Word reading",
    blurb: "Four archetypal words read through sensory mental-screen impressions on the same showrunner contract.",
    meta: "4 words · 2 to 3 impressions · abstains below 85%",
    effect: exampleEffect
  }
];

export function effectChoice(id: EffectId): EffectChoice {
  return EFFECTS.find((item) => item.id === id) ?? EFFECTS[0]!;
}

export const getEffectChoice = effectChoice;
