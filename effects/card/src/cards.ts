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

export const CARD_PROBES: Probe[] = [
  binaryProbe("warm-colour", "Does your card's colour feel warm?", 0.1, (c) => c.red),
  binaryProbe("heart", "Is the suit a heart?", 0.12, (c) => c.suit === "h"),
  binaryProbe("diamond", "Is it a diamond?", 0.12, (c) => c.suit === "d"),
  binaryProbe("spade", "Is it a spade?", 0.12, (c) => c.suit === "s"),
  binaryProbe("low-half", "Is the value in the low half — Ace or Two?", 0.15, (c) => c.rankValue <= 2),
  binaryProbe("high-half", "Is it a Three or a Four?", 0.15, (c) => c.rankValue >= 3),
  binaryProbe("even", "Is the value even — Two or Four?", 0.18, (c) => c.rankValue % 2 === 0),
  binaryProbe("odd", "Is the value odd — Ace or Three?", 0.18, (c) => c.rankValue % 2 === 1),
  binaryProbe("ace", "Is it the Ace?", 0.2, (c) => c.rank === "a"),
  binaryProbe("two", "Is it the Two?", 0.2, (c) => c.rank === "2"),
  binaryProbe("three", "Is it the Three?", 0.2, (c) => c.rank === "3"),
  binaryProbe("four", "Is it the Four?", 0.2, (c) => c.rank === "4"),
  binaryProbe("pip", "Is the rank a number rather than a letter?", 0.16, (c) => c.rank !== "a"),
  binaryProbe("curved-symbol", "Does the suit symbol curve rather than angle?", 0.22, (c) => c.suit !== "d"),
  binaryProbe("high-red", "Is it a high red card — a red Three or Four?", 0.25, (c) => c.red && c.rankValue >= 3),
  binaryProbe("low-black", "Is it a low black card — a black Ace or Two?", 0.25, (c) => !c.red && c.rankValue <= 2),
  binaryProbe("heart-high", "Is it a heart above a Two?", 0.24, (c) => c.suit === "h" && c.rankValue >= 3),
  binaryProbe("diamond-low", "Is it a diamond below a Three?", 0.24, (c) => c.suit === "d" && c.rankValue <= 2),
  binaryProbe("red-ace", "Is it a red Ace?", 0.26, (c) => c.red && c.rank === "a"),
  binaryProbe("spade-high", "Is it a high spade — a spade Three or Four?", 0.24, (c) => c.suit === "s" && c.rankValue >= 3)
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
