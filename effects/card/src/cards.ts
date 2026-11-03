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
    discourse: "statement",
    cost,
    options: [
      { id: "yes", label: "True of my card" },
      { id: "no", label: "That's wrong" }
    ],
    likelihood: (itemId, optionId) => {
      const card = CARD_BY_ID.get(itemId);
      if (!card) return 0;
      const yes = test(card) ? 1 : 0;
      return optionId === "yes" ? yes : 1 - yes;
    }
  };
}

function choiceProbe(
  id: string,
  prompt: string,
  cost: number,
  options: Array<{ id: string; label: string }>,
  answer: (card: Card) => string
): Probe {
  return {
    id,
    prompt,
    discourse: "statement",
    cost,
    options,
    likelihood: (itemId, optionId) => {
      const card = CARD_BY_ID.get(itemId);
      if (!card) return 0;
      return answer(card) === optionId ? 1 : 0;
    }
  };
}

export const CARD_PROBES: Probe[] = [
  // Spine order is information order: two multi-way impressions (suit, then
  // rank) uniquely place one card in twelve, so a truthful run commits inside
  // the 2-beat statement budget. Binary impressions follow as tie-break pool.
  choiceProbe(
    "suit-impression",
    "Let the center symbol fill the screen — what shape holds the light first: rounded lobes, sharp angles, or a dark spearhead.",
    0.14,
    [
      { id: "h", label: "Rounded lobes" },
      { id: "d", label: "Sharp angles" },
      { id: "s", label: "Dark spearhead" }
    ],
    (c) => c.suit
  ),
  choiceProbe(
    "rank-impression",
    "Now the count on the face — how many emblems hold the frame: one alone, a facing pair, a center spine, or four corners.",
    0.16,
    [
      { id: "a", label: "One alone" },
      { id: "2", label: "A facing pair" },
      { id: "3", label: "A center spine" },
      { id: "4", label: "Four corners" }
    ],
    (c) => c.rank
  ),
  // Mental-screen visual projection & geometric cold-reading impressions
  // (docs/research-live-mentalism-method-comparison-2026-11-01.md).
  // Every impression leads with sensory/spatial imagery on the mental screen
  // while keeping an unambiguous visual anchor so the spectator never misreads it.
  binaryProbe(
    "warm-colour",
    "Project the card onto a dark screen in your mind. The ink coming off the face is warm crimson — red, not black.",
    0.1,
    (c) => c.red
  ),
  binaryProbe(
    "heart",
    "Stay with the center symbol — it swells at the top into two rounded lobes that meet in a soft heart.",
    0.12,
    (c) => c.suit === "h"
  ),
  binaryProbe(
    "diamond",
    "Look at the symbol on that screen — it cuts into four straight, sharp-angled edges like a tilted diamond.",
    0.12,
    (c) => c.suit === "d"
  ),
  binaryProbe(
    "spade",
    "The ink is cold and dark, rising to a single upward spearhead with a narrow stem — a spade.",
    0.12,
    (c) => c.suit === "s"
  ),
  binaryProbe(
    "low-half",
    "Notice how open the face feels — mostly blank card stock, holding only one or two pips, an Ace or a Two.",
    0.15,
    (c) => c.rankValue <= 2
  ),
  binaryProbe(
    "high-half",
    "The face feels fuller and more weighted — three or four pips filling the frame.",
    0.15,
    (c) => c.rankValue >= 3
  ),
  binaryProbe(
    "even",
    "Look at the very center of the face — the middle is open while the pips balance in even pairs, a Two or a Four.",
    0.18,
    (c) => c.rankValue % 2 === 0
  ),
  binaryProbe(
    "odd",
    "Look at the dead center of the card face — a pip is pinned right in the middle, an odd rank, Ace or Three.",
    0.18,
    (c) => c.rankValue % 2 === 1
  ),
  binaryProbe(
    "ace",
    "All the surrounding space drops away, leaving one solitary emblem floating alone in the center — the Ace.",
    0.2,
    (c) => c.rank === "a"
  ),
  binaryProbe(
    "two",
    "Two emblems face each other across an open middle — one high and one low, the Two.",
    0.2,
    (c) => c.rank === "2"
  ),
  binaryProbe(
    "three",
    "Three emblems line up in a single vertical spine right down the center of the card — the Three.",
    0.2,
    (c) => c.rank === "3"
  ),
  binaryProbe(
    "four",
    "Four emblems anchor the four corners of the face, framing the middle like a square — the Four.",
    0.2,
    (c) => c.rank === "4"
  ),
  binaryProbe(
    "pip",
    "Glance at the corner index in your mind — it shows a number with multiple pips on the face, not the letter A.",
    0.16,
    (c) => c.rank !== "a"
  ),
  binaryProbe(
    "curved-symbol",
    "Trace the outer edge of the symbol — it rounds into a curve rather than cutting into four straight diamond angles.",
    0.22,
    (c) => c.suit !== "d"
  ),
  binaryProbe(
    "high-red",
    "Warm crimson ink on a fuller face — three or four red pips holding the frame.",
    0.25,
    (c) => c.red && c.rankValue >= 3
  ),
  binaryProbe(
    "low-black",
    "Cool black ink on a sparse, open face — only one or two dark spades.",
    0.25,
    (c) => !c.red && c.rankValue <= 2
  ),
  binaryProbe(
    "heart-high",
    "Rounded crimson hearts filling the frame — three or four of them on the face.",
    0.24,
    (c) => c.suit === "h" && c.rankValue >= 3
  ),
  binaryProbe(
    "heart-even",
    "Balanced pairs of crimson hearts — either two mirroring each other or four in the corners.",
    0.24,
    (c) => c.suit === "h" && c.rankValue % 2 === 0
  ),
  binaryProbe(
    "diamond-low",
    "Sharp-angled red diamonds on a sparse face — just one or two on the card.",
    0.24,
    (c) => c.suit === "d" && c.rankValue <= 2
  ),
  binaryProbe(
    "red-ace",
    "A single, solitary crimson emblem suspended in the center of an open white card — a red Ace.",
    0.26,
    (c) => c.red && c.rank === "a"
  ),
  binaryProbe(
    "spade-high",
    "Dark upward points crowding the frame — three or four black spades on the face.",
    0.24,
    (c) => c.suit === "s" && c.rankValue >= 3
  )
];

/**
 * Blueprint v4 §3 — the zone progressive statements, generated per show.
 *
 * The session shuffles the stage, so each zone's two cards differ every show.
 * A statement is crafted from the actual pair: true for the zone's first card
 * (described by its suit and rank imagery), false for its partner, and
 * strongly denied for cards outside the pair. Gaze collapses the pool to one
 * zone, so a single statement commits the read; a denial pivots to the partner.
 * Every statement stays within the recovery-safe patter length (CRIT-01).
 */
const SUIT_IMAGERY: Record<Suit, string> = {
  s: "Cold dark ink, a single spade spearhead rising",
  h: "Warm crimson ink, soft heart lobes meeting in a curve",
  d: "Sharp red diamond angles cutting the frame"
};

const RANK_IMAGERY: Record<Rank, string> = {
  a: "one solitary emblem floating alone in the wide-open center.",
  "2": "two emblems facing each other across an open middle.",
  "3": "three emblems lined up in a single vertical spine down the center.",
  "4": "four emblems anchoring the corners, framing the middle like a square."
};

function statementForCard(card: Card): string {
  return `${SUIT_IMAGERY[card.suit]}. The face holds ${RANK_IMAGERY[card.rank]}`;
}

export function denialPivotForPair(lower: Card, upper: Card): string {
  if (lower.suit === upper.suit) {
    const decoys: Record<Rank, string> = {
      a: "not one solitary emblem in the center",
      "2": "not two emblems across the middle",
      "3": "not three down the center",
      "4": "not four pips framing the corners"
    };
    const corrections: Record<Rank, string> = {
      a: "A solitary emblem just locked into the center",
      "2": "Two emblems just mirrored across the middle",
      "3": "Three emblems just aligned down the center",
      "4": "A fourth pip just locked into the corners"
    };
    return `Wait—${decoys[lower.rank]}. ${corrections[upper.rank]}. The ${upper.label}.`;
  }
  const colorA = lower.red ? "crimson" : "dark";
  return `Wait—push that decoy aside. It is not ${colorA} ink; ${SUIT_IMAGERY[upper.suit]}, the ${upper.label}.`;
}

export function equivocationProbeForStage(_stage?: StageSpec): Probe {
  return {
    id: "card-equivocation-gesture",
    prompt: "Reach out toward your screen and mentally cast half the cards into shadow. Push the black cards away from you.",
    discourse: "statement",
    cost: 0.05,
    options: [
      { id: "cast-black", label: "I've cast them away" },
      { id: "keep-crimson", label: "I hold the red in mind" }
    ],
    likelihood: (itemId, _optionId) => {
      const card = CARD_BY_ID.get(itemId);
      if (!card) return 0;
      return card.red ? 1 : 0;
    }
  };
}

export const EQUIVOCATION_PROBE: Probe = equivocationProbeForStage();

export const EQUIVOCATION_SECONDARY_PROBE: Probe = {
  id: "card-equivocation-secondary",
  prompt: "Hold the crimson in mind. I sense sharp diamond angles cutting through the haze, holding three points of light.",
  discourse: "statement",
  cost: 0.05,
  denialPivot: "Wait—push that decoy aside. It is not sharp diamonds; the crimson softens into a curve—the Ace of Hearts.",
  options: [
    { id: "yes", label: "True of my card" },
    { id: "no", label: "That's wrong" }
  ],
  likelihood: (itemId, optionId) => {
    if (itemId === CARD_FORCE_TARGET) return optionId === "yes" ? 1 : 0;
    if (itemId === "h-a") return optionId === "yes" ? 0 : 1;
    return 0.0;
  }
};

export function zoneStatementsForStage(stage: StageSpec): Probe[] {
  const columns = stage.columns;
  const zoneOf = (index: number): string | null => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const half = column < columns / 2 ? 0 : 1;
    return stage.zones?.[row * 2 + half]?.id ?? null;
  };
  const byZone = new Map<string, string[]>();
  stage.items.forEach((item, index) => {
    const zone = zoneOf(index);
    if (!zone) return;
    const list = byZone.get(zone) ?? [];
    list.push(item.hypothesisId);
    byZone.set(zone, list);
  });
  const statements: Probe[] = [];
  for (const [zone, pair] of byZone) {
    if (pair.length !== 2) continue;
    const lower = CARD_BY_ID.get(pair[0]!);
    const upper = CARD_BY_ID.get(pair[1]!);
    if (!lower || !upper) continue;
    statements.push({
      id: `zone-statement-${zone}`,
      prompt: statementForCard(lower),
      discourse: "statement",
      cost: 0.05,
      // Blueprint §3: this statement is the scripted follow-up for a gaze
      // fixation on this zone.
      channelHint: { channel: "gaze", value: zone },
      denialPivot: denialPivotForPair(lower, upper),
      options: [
        { id: "yes", label: "True of my card" },
        { id: "no", label: "That's wrong" }
      ],
      likelihood: (itemId, optionId) => {
        if (itemId === lower.id) return optionId === "yes" ? 1 : 0;
        if (itemId === upper.id) return optionId === "yes" ? 0 : 1;
        // Outside the pair the crafted claim does not fit: outside cards receive 0.0 so they do not dilute the candidate pair
        return 0.0;
      }
    });
  }
  return statements;
}


export const CARD_STAGE_BASE: StageSpec = {
  renderer: "grid",
  columns: 4,
  title: "The Twelve",
  instructions: "Choose one card. Do not say it, click it, or tell me. Project its face onto a screen in your mind.",
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