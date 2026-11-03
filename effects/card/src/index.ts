import {
  uniformPrior,
  validateEffect,
  type ChannelBinding,
  type Effect,
  type StageSpec
} from "@loki/effect-api";
import {
  CARD_FORCE_TARGET,
  CARD_PROBES,
  CARD_STAGE_BASE,
  CARDS,
  EQUIVOCATION_SECONDARY_PROBE,
  equivocationProbeForStage,
  zoneStatementsForStage
} from "./cards.js";

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
  tagline: "Act I — Twelve cards. Mental-screen impressions. One reveal — or an honest miss.",
  config: {
    maxProbes: 2,
    // Blueprint §3 / M3: clamp max probes to 2 when gaze evidence is present
    maxProbesGazed: 2,
    // CRIT-03: four truthful answers reach ~0.90 confidence (a ~9:1 lead over
    // the runner-up); committing there keeps the show inside the 4-probe budget
    // without a redundant fifth question. The reveal wording follows this
    // boundary, and deliberate lies still fall through to an honest miss.
    commitThreshold: 0.89,
    // Blueprint §3: when validated gaze windows have isolated the pair, one
    // progressive statement may commit the read. Cross-zone ambiguity (two
    // zones fixated) resolves within two statement beats at this threshold.
    commitThresholdGazed: 0.82,
    recoveryBudget: 1,
    recoverySurprise: 3.6,
    // M3 progressive reading retune: sharp answers (epsilon 0.015, outlier 0.005)
    // guarantee >= 0.98 posterior belief on both confirmation and denial pivot.
    epsilon: 0.045,
    outlierWeight: 0.02,
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

  // Blueprint §3: statements are crafted from THIS show's shuffled zone pairs;
  // includes the equivocation physical elimination gesture probe and secondary progressive reading probe.
  probes: (stage) => [...CARD_PROBES, equivocationProbeForStage(stage ?? CARD_STAGE_BASE), EQUIVOCATION_SECONDARY_PROBE, ...zoneStatementsForStage(stage ?? CARD_STAGE_BASE)],

  channels: (stage) => [
    {
      channel: "gaze",
      label: "Coarse gaze zone",
      // A window that passes the aggregator's strict gating (>=900ms dwell,
      // 55% dominance, 12+ quality-checked frames) is strong evidence; the
      // weight reflects that, and the session still caps it at 2 windows.
      weight: 0.8,
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
        line: "Choose one card from the twelve. Do not say it, click it, or tell me. Picture its face projected onto a quiet screen in your mind."
      },
      {
        id: "card-attune",
        kind: "attune",
        when: "camera-on",
        line: "Let the room settle. Hold that mental screen steady in front of you; this is a performance, not a test."
      },
      {
        id: "card-build",
        kind: "build",
        line: "The competing impressions have fallen away."
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
      "The competing impressions have fallen away.",
      "Two shapes on the screen are locking into one.",
      "I am not guessing now — I am staying with the image that remained.",
      "There is only one card still holding the light."
    ],
    timeBeatLines: [
      "That was quick — the image was already waiting.",
      "You held that image steady while the room settled around it.",
      "All that time with one image held steady — that steadiness tells its own story."
    ],
    revealLine: (item, confidence) =>
      // The direct/soft boundary follows the effect's own commit threshold.
      confidence >= cardEffect.config.commitThreshold
        ? `Your card was the ${item.label}.`
        : `The card that kept returning was the ${item.label}.`,
    recoverLine: "Hold on — a second impression crossed the screen and muddied the first. One clean claim settles it.",
    missLine: "You beat me. The card stays yours.",
    revealInvite: "Don't tell me. You turn it over - whenever you are ready.",
    revealAction: "Turn it over"
  }),

  stage: () => CARD_STAGE_BASE,

  validate: () => validateEffect(cardEffect)
};

export {
  CARD_FORCE_TARGET,
  CARDS,
  CARD_PROBES,
  EQUIVOCATION_PROBE,
  EQUIVOCATION_SECONDARY_PROBE,
  equivocationProbeForStage,
  denialPivotForPair,
  zoneStatementsForStage
} from "./cards.js";
export default cardEffect;