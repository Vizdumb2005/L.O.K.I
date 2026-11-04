import { cardEffect } from "@loki/effect-card";
import { exampleEffect } from "@loki/effect-example";
import type { Effect } from "@loki/effect-api";

export type EffectId = "card-twelve" | "ember-words" | "countdown-force";

export interface EffectChoice {
  id: EffectId;
  title: string;
  eyebrow: string;
  blurb: string;
  meta: string;
  sealed: boolean;
  /** The showrunner contract effect. Null for stages with their own engine (countdown). */
  effect: Effect | null;
  /** The act this one hands off to in its afterglow, keeping the show continuous. */
  next?: { id: EffectId; label: string };
}

export const EFFECTS: EffectChoice[] = [
  {
    id: "countdown-force",
    title: "The Countdown",
    eyebrow: "Featured \u00b7 A number becomes a card",
    blurb:
      "Name a number from 10 to 19. Your own deal and count land on the card sealed before you spoke.",
    meta: "52 cards \u00b7 your number \u00b7 sealed prediction \u00b7 method disclosed",
    sealed: true,
    effect: null,
    next: { id: "card-twelve", label: "Continue to Act I: The Twelve" }
  },
  {
    id: "card-twelve",
    title: "The Twelve",
    eyebrow: "Act I \u00b7 Primary effect",
    blurb:
      "Twelve playing cards projected onto a mental screen. Sensory and geometric impressions, then one reveal - or an honest abstain.",
    meta: "12 cards \u00b7 6 impressions \u00b7 abstains below 96% \u00b7 retuned 11-04",
    sealed: true,
    effect: cardEffect,
    next: { id: "ember-words", label: "Continue to Act II: Ember Words" }
  },
  {
    id: "ember-words",
    title: "Ember Words",
    eyebrow: "Act II \u00b7 Word reading",
    blurb:
      "Four archetypal words read through sensory mental-screen impressions on the same showrunner contract. One prediction is sealed before your first answer.",
    meta: "4 words \u00b7 3 impressions \u00b7 sealed prediction \u00b7 abstains below 85%",
    sealed: true,
    effect: exampleEffect,
    next: { id: "countdown-force", label: "Continue to Act III: The Countdown" }
  }
];

export function effectChoice(id: EffectId): EffectChoice {
  return EFFECTS.find((item) => item.id === id) ?? EFFECTS[0]!;
}

export const getEffectChoice = effectChoice;
