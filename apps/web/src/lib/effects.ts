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
  sealed: boolean;
  effect: Effect;
}

export const EFFECTS: EffectChoice[] = [
  {
    id: "card-twelve",
    title: "The Twelve",
    eyebrow: "Act I · Primary effect",
    blurb: "Twelve playing cards projected onto a mental screen. Sensory and geometric impressions, then one reveal.",
    meta: "12 cards · 2 impressions · abstains below 89%",
    sealed: false,
    effect: cardEffect
  },
  {
    id: "ember-words",
    title: "Ember Words",
    eyebrow: "Act II · Word reading",
    blurb: "Four archetypal words read through sensory mental-screen impressions on the same showrunner contract. One prediction is sealed before your first answer.",
    meta: "4 words · 2 impressions · sealed prediction · abstains below 85%",
    sealed: true,
    effect: exampleEffect
  }
];

export function effectChoice(id: EffectId): EffectChoice {
  return EFFECTS.find((item) => item.id === id) ?? EFFECTS[0]!;
}

export const getEffectChoice = effectChoice;
