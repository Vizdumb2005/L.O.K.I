import {
  uniformPrior,
  validateEffect,
  type ChannelBinding,
  type Effect,
  type StageSpec
} from "@loki/effect-api";
import { CARD_FORCE_TARGET, CARD_PROBES, CARD_STAGE_BASE, CARDS } from "./cards.js";

const FORCE_TARGET_PROBABILITY = 0.18;

function zoneForItem(stage: StageSpec, itemId: string): string | null {
  const index = stage.items.findIndex((item) => item.hypothesisId === itemId);
  if (index < 0) return null;
  const columns = stage.columns;
  const row = Math.floor(index / columns);
  const column = index % columns;
  const half = column < columns / 2 ? 0 : 1;
  const zoneIndex = row * 2 + half;
  return stage.zones?.[zoneIndex]?.id ?? null;
}

export const cardEffect: Effect = {
  id: "card-twelve",
  name: "The Twelve",
  tagline: "Twelve cards. A few true-or-wrong checks. One reveal - or an honest miss.",
  config: {
    maxProbes: 6,
    commitThreshold: 0.96,
    recoveryBudget: 1,
    recoverySurprise: 3.6,
    epsilon: 0.1,
    outlierWeight: 0.06,
    temperature: 1,
    costWeight: 0.03,
    gazeEnabledByDefault: false
  },

  hypotheses: () => CARDS,

  prior: ({ forceEnabled }) => {
    if (!forceEnabled) return uniformPrior(CARDS);
    const prior = Object.fromEntries(CARDS.map((c) => [c.id, (1 - FORCE_TARGET_PROBABILITY) / (CARDS.length - 1)]));
    prior[CARD_FORCE_TARGET] = FORCE_TARGET_PROBABILITY;
    return prior;
  },

  probes: () => CARD_PROBES,

  channels: (stage) => [
    {
      channel: "gaze",
      label: "Coarse gaze zone",
      weight: 0.65,
      minReliability: 0.35,
      values: (stage.zones ?? []).map((z) => z.id),
      likelihood: (itemId, observation) => {
        const zone = zoneForItem(stage, itemId);
        if (!zone) return 0;
        return observation.value === zone ? 1 : 0;
      }
    } satisfies ChannelBinding
  ],

  script: () => ({
    beats: [
      {
        id: "card-invite",
        kind: "invite",
        line: "This is a performance of mentalism — an illusion, not mind reading. No medical claims. You can stop whenever you like."
      },
      {
        id: "card-think",
        kind: "think",
        line: "Choose one card from the twelve. Do not say it, click it, or tell me. Hold its face in your mind."
      },
      {
        id: "card-attune",
        kind: "attune",
        when: "camera-on",
        line: "Let the room settle. Look where you like; this is a performance, not a test."
      },
      {
        id: "card-build",
        kind: "build",
        line: "The noise is falling away."
      },
      {
        id: "card-reveal",
        kind: "reveal",
        line: "Your card is waiting."
      },
      {
        id: "card-afterglow",
        kind: "afterglow",
        line: "The choice was always yours. That is the trick."
      }
    ],
    buildLines: [
      "The noise is falling away.",
      "Two shapes are becoming one.",
      "I am not guessing now — I am listening to what is left.",
      "There is only one card still holding the light."
    ],
    revealLine: (item, confidence) =>
      confidence >= 0.96
        ? `Your card was the ${item.label}.`
        : `The card that kept returning was the ${item.label}.`,
    recoverLine: "Two cards are fighting for the same light. One clean answer settles it.",
    missLine: "You beat me. The card stays yours.",
    revealInvite: "Don't tell me. You turn it over - whenever you are ready.",
    revealAction: "Turn it over"
  }),

  stage: () => CARD_STAGE_BASE,

  validate: () => validateEffect(cardEffect)
};

export { CARD_FORCE_TARGET, CARDS, CARD_PROBES } from "./cards.js";
export default cardEffect;
