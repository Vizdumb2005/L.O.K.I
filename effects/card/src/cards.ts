import type { Hypothesis, Probe, StageSpec } from "@loki/effect-api";

export type Suit = "h" | "d" | "s";
export type Rank = "a" | "2" | "3" | "4";

export interface Card extends Hypothesis {
  id: string;
  label: string;
  glyph: string;
  suit: Suit;
  rank: Rank;
  rankValue: number;
  red: boolean;
}

const suits: Array<{ id: Suit; name: string; glyph: string; red: boolean }> = [
  { id: "h", name: "Hearts", glyph: "♥", red: true },
  { id: "d", name: "Diamonds", glyph: "♦", red: true },
  { id: "s", name: "Spades", glyph: "♠", red: false }
];

const ranks: Array<{ id: Rank; name: string; value: number }> = [
  { id: "a", name: "Ace", value: 1 },
  { id: "2", name: "Two", value: 2 },
  { id: "3", name: "Three", value: 3 },
  { id: "4", name: "Four", value: 4 }
];

export const CARDS: Card[] = suits.flatMap((suit) =>
  ranks.map((rank) => ({
    id: `${suit.id}-${rank.id}`,
    label: `${rank.name} of ${suit.name}`,
    glyph: rank.id === "a" ? `A${suit.glyph}` : `${rank.id}${suit.glyph}`,
    suit: suit.id,
    rank: rank.id,
    rankValue: rank.value,
    red: suit.red
  }))
);

export const CARD_BY_ID = new Map(CARDS.map((c) => [c.id, c]));
export const CARD_FORCE_TARGET = "d-3";

function binaryProbe(
  id: string,
  prompt: string,
  cost: number,
  test: (card: Card) => boolean
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
      const card = CARD_BY_ID.get(itemId);
      if (!card) return 0;
      const yes = test(card) ? 1 : 0;
      return optionId === "yes" ? yes : 1 - yes;
    }
  };
}

function categoricalProbe(
  id: string,
  prompt: string,
  cost: number,
  options: Array<{ id: string; label: string }>,
  category: (card: Card) => string
): Probe {
  return {
    id,
    prompt,
    cost,
    options,
    likelihood: (itemId, optionId) => {
      const card = CARD_BY_ID.get(itemId);
      if (!card) return 0;
      return category(card) === optionId ? 1 : 0;
    }
  };
}

export const CARD_PROBES: Probe[] = [
  categoricalProbe(
    "suit",
    "Don't tell me the card. Just let the symbol come forward - is it hearts, diamonds, or spades?",
    0.1,
    [
      { id: "h", label: "Hearts" },
      { id: "d", label: "Diamonds" },
      { id: "s", label: "Spades" }
    ],
    (c) => c.suit
  ),
  categoricalProbe(
    "value",
    "And its rank - ace, two, three, or four?",
    0.1,
    [
      { id: "a", label: "Ace" },
      { id: "2", label: "Two" },
      { id: "3", label: "Three" },
      { id: "4", label: "Four" }
    ],
    (c) => c.rank
  ),
  binaryProbe("warm-colour", "Some cards feel warm, some feel cool. Does yours feel like one of the warm ones?", 0.1, (c) => c.red),
  binaryProbe("heart", "Stay with the symbol a moment. Could it be a heart?", 0.12, (c) => c.suit === "h"),
  binaryProbe("diamond", "Could it be a diamond?", 0.12, (c) => c.suit === "d"),
  binaryProbe("spade", "Could it be a spade?", 0.12, (c) => c.suit === "s"),
  binaryProbe("low-half", "Think of its weight now. Does it sit low - an ace or a two?", 0.15, (c) => c.rankValue <= 2),
  binaryProbe("high-half", "Does it sit high - a three or a four?", 0.15, (c) => c.rankValue >= 3),
  binaryProbe("even", "Is its number even - a two or a four?", 0.18, (c) => c.rankValue % 2 === 0),
  binaryProbe("odd", "Is it odd - the ace or the three?", 0.18, (c) => c.rankValue % 2 === 1),
  binaryProbe("ace", "Could it be the ace?", 0.2, (c) => c.rank === "a"),
  binaryProbe("two", "Could it be the two?", 0.2, (c) => c.rank === "2"),
  binaryProbe("three", "Could it be the three?", 0.2, (c) => c.rank === "3"),
  binaryProbe("four", "Could it be the four?", 0.2, (c) => c.rank === "4"),
  binaryProbe("pip", "Is its face a number rather than a letter?", 0.16, (c) => c.rank !== "a"),
  binaryProbe("curved-symbol", "Does the symbol curve, rather than cut into angles?", 0.22, (c) => c.suit !== "d"),
  binaryProbe("high-red", "Is it a high red card - a red three or four?", 0.25, (c) => c.red && c.rankValue >= 3),
  binaryProbe("low-black", "Is it a low black card - a black ace or two?", 0.25, (c) => !c.red && c.rankValue <= 2),
  binaryProbe("heart-high", "A heart, and above a two?", 0.24, (c) => c.suit === "h" && c.rankValue >= 3),
  binaryProbe("diamond-low", "A diamond, below a three?", 0.24, (c) => c.suit === "d" && c.rankValue <= 2),
  binaryProbe("red-ace", "Could it be a red ace?", 0.26, (c) => c.red && c.rank === "a"),
  binaryProbe("spade-high", "A high spade - the three or the four?", 0.24, (c) => c.suit === "s" && c.rankValue >= 3)
];

export const CARD_STAGE_BASE: StageSpec = {
  renderer: "grid",
  columns: 4,
  title: "The Twelve",
  instructions: "Choose one card. Do not say it, click it, or tell me. Keep its face in mind.",
  items: CARDS.map((c) => ({ hypothesisId: c.id, label: c.label, glyph: c.glyph })),
  zones: [
    { id: "top-left", label: "Top left", x: 0, y: 0, w: 0.5, h: 1 / 3 },
    { id: "top-right", label: "Top right", x: 0.5, y: 0, w: 0.5, h: 1 / 3 },
    { id: "mid-left", label: "Middle left", x: 0, y: 1 / 3, w: 0.5, h: 1 / 3 },
    { id: "mid-right", label: "Middle right", x: 0.5, y: 1 / 3, w: 0.5, h: 1 / 3 },
    { id: "bottom-left", label: "Bottom left", x: 0, y: 2 / 3, w: 0.5, h: 1 / 3 },
    { id: "bottom-right", label: "Bottom right", x: 0.5, y: 2 / 3, w: 0.5, h: 1 / 3 }
  ]
};
