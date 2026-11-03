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
};

/**
 * Act II — Ember Words: a four-word sensory & archetypal image reading that
 * proves the plugin contract. Four words are separated by three balanced
 * mental-screen imagery impressions (pairwise Hamming distance 2) and two
 * four-way sensory projections; no core code knows about words, and the same
 * session/simulator harness runs it unchanged.
 */
const WORDS: Word[] = [
  { id: "sun", label: "Sun", glyph: "☀" },
  { id: "moon", label: "Moon", glyph: "☾" },
  { id: "comet", label: "Comet", glyph: "☄" },
  { id: "flower", label: "Flower", glyph: "✿" }
];

const letters = (word: Word): string => word.label.toLowerCase();

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
    discourse: "statement",
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

function choiceProbe(
  id: string,
  prompt: string,
  cost: number,
  options: Probe["options"],
  answer: (word: Word) => string
): Probe {
  return {
    id,
    prompt,
    discourse: "statement",
    cost,
    options,
    likelihood: (itemId, optionId) => {
      const word = BY_ID.get(itemId);
      if (!word) return 0;
      return answer(word) === optionId ? 1 : 0;
    }
  };
}

export const EMBER_FORCE_TARGET = "comet";
const EMBER_FORCE_PROBABILITY = 0.34;

// Spine order is salience order: Comet-favouring beats first; the four-way
// projection second so a truthful run genuinely commits within two beats
// (two binary beats alone reach only ~0.77, below the 0.85 threshold).
const PROBES: Probe[] = [
  probe(
    "has-m",
    "The scene around your image is dark — you are looking up into the night sky at the Moon or a streaking Comet, not standing in warm daylight.",
    0.14,
    (w) => letters(w).includes("m")
  ),
  choiceProbe(
    "first-letter",
    "Let the atmosphere around the image fill the screen — what pulls at your senses first: blazing daylight, silver night, a streaking tail, or living petals.",
    0.18,
    [
      { id: "s", label: "Daylight" },
      { id: "m", label: "Night" },
      { id: "c", label: "Streak" },
      { id: "f", label: "Petals" }
    ],
    (w) => letters(w)[0]!
  ),
  probe(
    "odd-length",
    "Fierce heat radiates from the image — blazing solar light or a burning streak, the Sun or the Comet, not the quiet coolness of Moon or Flower.",
    0.14,
    (w) => letters(w).length % 2 === 1
  ),
  probe(
    "ends-n",
    "Picture your word on the mental screen — one of the two permanent sky lights, the Sun or the Moon, not a passing comet or bloom.",
    0.1,
    (w) => letters(w).endsWith("n")
  ),
  choiceProbe(
    "letter-count",
    "Trace the outline of the image in your mind's eye — its silhouette is a golden disc, a pale crescent, a bright tail, or an opening bloom.",
    0.18,
    [
      { id: "3", label: "Disc" },
      { id: "4", label: "Crescent" },
      { id: "5", label: "Tail" },
      { id: "6", label: "Bloom" }
    ],
    (w) => String(letters(w).length)
  )
];

export const exampleEffect: Effect = {
  id: "ember-words",
  name: "Ember Words",
  tagline: "Act II — Four words, sensory mental-screen impressions, one quiet reading.",
  config: {
    maxProbes: 2,
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
  prior: ({ forceEnabled }) => {
    if (!forceEnabled) return uniformPrior(WORDS);
    const rest = (1 - EMBER_FORCE_PROBABILITY) / (WORDS.length - 1);
    const p = Object.fromEntries(WORDS.map((w) => [w.id, rest]));
    p[EMBER_FORCE_TARGET] = EMBER_FORCE_PROBABILITY;
    return p;
  },
  forceSpec: ({ forceEnabled }) =>
    forceEnabled ? { targetId: EMBER_FORCE_TARGET, salience: EMBER_FORCE_PROBABILITY } : null,
  probes: () => PROBES,
  channels: () => [],
  script: () => ({
    beats: [
      {
        id: "words-invite",
        kind: "invite",
        line: "Act II — a sensory word illusion, not mind reading. Picture the image of one word on your mental screen."
      },
      {
        id: "words-think",
        kind: "think",
        line: "Choose one word from the four. Keep it to yourself and picture what it looks and feels like."
      },
      {
        id: "words-attune",
        kind: "attune",
        when: "camera-on",
        line: "Let the image of your word fill the quiet screen in front of you."
      },
      { id: "words-build", kind: "build", line: "The competing images have faded." },
      { id: "words-reveal", kind: "reveal", line: "The word is waiting." },
      { id: "words-afterglow", kind: "afterglow", line: "You held the image. I only followed the light." }
    ],
    buildLines: ["The competing images have faded.", "Only one image is left glowing on the screen."],
    revealMode: "sealed",
    timeBeatLines: [
      "That image arrived quickly — it was already lit.",
      "You held that one image glowing while the room went quiet.",
      "All that time with a single image held in the light — it stayed with you."
    ],
    revealLine: (item) => `Your word was ${item.label}.`,
    recoverLine: "Two images are overlapping on the screen. Give me one clean answer to separate them.",
    missLine: "You beat me. The word stays yours."
  }),
  stage: () => ({
    renderer: "grid",
    columns: 2,
    title: "Ember Words",
    instructions: "Choose one word. Do not say it out loud. Picture its image in your mind.",
    items: WORDS.map((w) => ({ hypothesisId: w.id, label: w.label, glyph: w.glyph }))
  }),
  validate: () => validateEffect(exampleEffect)
};

export { WORDS };
export default exampleEffect;