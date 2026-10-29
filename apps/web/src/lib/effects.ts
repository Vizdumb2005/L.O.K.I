import type { Effect } from "@loki/effect-api";
import { cardEffect } from "@loki/effect-card";
import { exampleEffect } from "@loki/effect-example";

export type EffectId = "card-twelve" | "ember-words";

export interface EffectChoice {
  id: EffectId;
  effect: Effect;
  eyebrow: string;
  title: string;
  blurb: string;
  meta: string;
  accent: string;
}

export const EFFECTS: EffectChoice[] = [
  {
    id: "card-twelve",
    effect: cardEffect,
    eyebrow: "The proof of concept",
    title: "The Twelve",
    blurb: "A deck of twelve cards. Think of one. Answer each check - true of your card, or wrong. I will name it - or admit that I cannot.",
    meta: "12 cards · true-or-wrong checks · click demo: no camera",
    accent: "brass"
  },
  {
    id: "ember-words",
    effect: exampleEffect,
    eyebrow: "The platform test",
    title: "Ember Words",
    blurb: "A small second effect built on the same contract. Four words, three questions, one honest guess.",
    meta: "4 words · 3 questions · plugin proof",
    accent: "moss"
  }
];

export function effectChoice(id: EffectId): EffectChoice {
  return EFFECTS.find((choice) => choice.id === id) ?? EFFECTS[0]!;
}
