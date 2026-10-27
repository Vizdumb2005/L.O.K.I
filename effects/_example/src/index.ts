import {
  uniformPrior,
  validateEffect,
  type Effect,
  type Hypothesis,
  type Probe
} from "@loki/effect-api";

type Word = Hypothesis & {
  id: string;
  label: string;
  glyph: string;
  sky: boolean;
  warm: boolean;
  round: boolean;
};

/**
 * A tiny second effect that proves the plugin contract. Four words are
 * separated by three designed binary questions; no core code knows about
 * words, and the same session/simulator harness runs it unchanged.
 */
const WORDS: Word[] = [
  { id: "sun", label: "Sun", glyph: "☀", sky: true, warm: true, round: true },
  { id: "moon", label: "Moon", glyph: "☾", sky: true, warm: false, round: true },
  { id: "comet", label: "Comet", glyph: "☄", sky: true, warm: true, round: false },
  { id: "flower", label: "Flower", glyph: "✿", sky: false, warm: true, round: true }
];

const BY_ID = new Map(WORDS.map((w) => [w.id, w]));

function probe(
  id: string,
  prompt: string,
  cost: number,
  test: (word: Word) => boolean
): Probe {
  return {
    id,
    prompt,
    cost,
    options: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" }
    ],
    likelihood: (itemId, optionId) => {
      const word = BY_ID.get(itemId);
      if (!word) return 0;
      const yes = test(word) ? 1 : 0;
      return optionId === "yes" ? yes : 1 - yes;
    }
  };
}

const PROBES: Probe[] = [
  probe("sky", "Does it belong to the sky?", 0.1, (w) => w.sky),
  probe("warm", "Does it feel warm?", 0.14, (w) => w.warm),
  probe("round", "Is its shape round?", 0.14, (w) => w.round)
];

export const exampleEffect: Effect = {
  id: "ember-words",
  name: "Ember Words",
  tagline: "Four words, three questions, one small illusion.",
  config: {
    maxProbes: 3,
    commitThreshold: 0.85,
    recoveryBudget: 1,
    recoverySurprise: 3.6,
    epsilon: 0.1,
    outlierWeight: 0.06,
    temperature: 1,
    costWeight: 0.02,
    gazeEnabledByDefault: false
  },
  hypotheses: () => WORDS,
  prior: () => uniformPrior(WORDS),
  probes: () => PROBES,
  channels: () => [],
  script: () => ({
    beats: [
      {
        id: "words-invite",
        kind: "invite",
        line: "A short mentalism illusion. Not mind reading. Three questions, then a guess."
      },
      { id: "words-think", kind: "think", line: "Choose one word from the four. Keep it to yourself." },
      { id: "words-build", kind: "build", line: "The word is taking shape." },
      { id: "words-reveal", kind: "reveal", line: "The word is waiting." },
      { id: "words-afterglow", kind: "afterglow", line: "You chose it. I only narrowed the room." }
    ],
    buildLines: ["The word is taking shape.", "Only one shape is left in the light."],
    revealLine: (item) => `Your word was ${item.label}.`,
    recoverLine: "Two words are overlapping. Give me one clean answer.",
    missLine: "You beat me. The word stays yours."
  }),
  stage: () => ({
    renderer: "grid",
    columns: 2,
    title: "Ember Words",
    instructions: "Choose one word. Do not say it out loud.",
    items: WORDS.map((w) => ({ hypothesisId: w.id, label: w.label, glyph: w.glyph }))
  }),
  validate: () => validateEffect(exampleEffect)
};

export { WORDS };
export default exampleEffect;
