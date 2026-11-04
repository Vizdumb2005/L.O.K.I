/** Standard 52-card deck for the Countdown Force stage. */

export interface CountdownCard {
  id: string;
  label: string;
  glyph: string;
  red: boolean;
}

const SUITS = [
  { id: "h", name: "Hearts", glyph: "\u2665", red: true },
  { id: "d", name: "Diamonds", glyph: "\u2666", red: true },
  { id: "s", name: "Spades", glyph: "\u2660", red: false },
  { id: "c", name: "Clubs", glyph: "\u2663", red: false }
] as const;

const RANKS = [
  { id: "a", name: "Ace", glyph: "A" },
  { id: "2", name: "Two", glyph: "2" },
  { id: "3", name: "Three", glyph: "3" },
  { id: "4", name: "Four", glyph: "4" },
  { id: "5", name: "Five", glyph: "5" },
  { id: "6", name: "Six", glyph: "6" },
  { id: "7", name: "Seven", glyph: "7" },
  { id: "8", name: "Eight", glyph: "8" },
  { id: "9", name: "Nine", glyph: "9" },
  { id: "10", name: "Ten", glyph: "10" },
  { id: "j", name: "Jack", glyph: "J" },
  { id: "q", name: "Queen", glyph: "Q" },
  { id: "k", name: "King", glyph: "K" }
] as const;

export const COUNTDOWN_DECK: CountdownCard[] = SUITS.flatMap((suit) =>
  RANKS.map((rank) => ({
    id: `${rank.id}${suit.id}`,
    label: `${rank.name} of ${suit.name}`,
    glyph: `${rank.glyph}${suit.glyph}`,
    red: suit.red
  }))
);

export const COUNTDOWN_CARD_BY_ID = new Map(COUNTDOWN_DECK.map((c) => [c.id, c]));

/**
 * Arrange a deck with `targetId` at `position` (1-based, from the top).
 * The remaining 51 cards keep their standard order around it.
 */
export function arrangeWithTargetAt(targetId: string, position: number): string[] {
  const rest = COUNTDOWN_DECK.map((c) => c.id).filter((id) => id !== targetId);
  return [...rest.slice(0, position - 1), targetId, ...rest.slice(position - 1)];
}
