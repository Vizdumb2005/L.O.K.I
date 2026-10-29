/**
 * Branching statement tree for The Twelve.
 *
 * Same construction as the offline solver verified 2026-10-30 (see
 * docs/research-card-method-design-2026-10-30.md): exhaustive greedy search
 * over natural attributes (suit, rank, color, rank parity, card-name
 * letters). A LINEAR first-denial schedule does not exist for these 12
 * cards with these attributes (verified by enumeration), but a branching
 * tree does. Worst case is computed at build time and asserted in tests:
 * at most 5 statements and 2 denials per card on this attribute alphabet.
 *
 * Deterministic: same cards in, same tree out.
 */

export interface StatementCard {
  id: string;
  label: string;
  suit: string;
  rank: string;
  rankValue: number;
  red: boolean;
}

interface Statement {
  desc: string;
  deny: Set<string>;
}

export interface TreeNode {
  /** Statement to present, or null at a leaf. */
  desc: string | null;
  /** Cards that would deny this statement (empty at a leaf). */
  deny: Set<string>;
  /** Card id at a leaf. */
  card: string | null;
  /** Branch when the statement FITS the spectator's card (no denial). */
  fits: TreeNode | null;
  /** Branch when the spectator says THAT'S WRONG (denial). */
  denies: TreeNode | null;
}

const SUIT_NAMES: Record<string, string> = { h: "Heart", d: "Diamond", s: "Spade" };
const RANK_NAMES: Record<string, string> = { a: "Ace", "2": "Two", "3": "Three", "4": "Four" };

function buildStatements(cards: StatementCard[]): Statement[] {
  const stmts: Statement[] = [];
  for (const suit of [...new Set(cards.map((c) => c.suit))]) {
    stmts.push({ desc: `not a ${SUIT_NAMES[suit] ?? suit}`, deny: new Set(cards.filter((c) => c.suit === suit).map((c) => c.id)) });
  }
  for (const rank of [...new Set(cards.map((c) => c.rank))]) {
    const name = RANK_NAMES[rank] ?? rank;
    stmts.push({ desc: name === "Ace" ? "not an Ace" : `not a ${name}`, deny: new Set(cards.filter((c) => c.rank === rank).map((c) => c.id)) });
  }
  stmts.push({ desc: "not a red card", deny: new Set(cards.filter((c) => c.red).map((c) => c.id)) });
  stmts.push({ desc: "not a black card", deny: new Set(cards.filter((c) => !c.red).map((c) => c.id)) });
  stmts.push({ desc: "not an odd rank", deny: new Set(cards.filter((c) => c.rankValue % 2 === 1).map((c) => c.id)) });
  stmts.push({ desc: "not an even rank", deny: new Set(cards.filter((c) => c.rankValue % 2 === 0).map((c) => c.id)) });
  const letters = new Set<string>();
  for (const c of cards) for (const ch of c.label.toUpperCase().replace(/[^A-Z]/g, "")) letters.add(ch);
  for (const letter of [...letters].sort()) {
    stmts.push({
      desc: `no ${letter} in its name`,
      deny: new Set(cards.filter((c) => c.label.toUpperCase().replace(/[^A-Z]/g, "").includes(letter)).map((c) => c.id))
    });
  }
  return stmts;
}

export interface BuiltTree {
  root: TreeNode;
  worstStatements: number;
  worstDenials: number;
}

export function buildStatementTree(cards: StatementCard[]): BuiltTree {
  const stmts = buildStatements(cards);
  let worstStatements = 0;
  let worstDenials = 0;

  function build(remaining: Set<string>, depth: number, denials: number): TreeNode {
    if (remaining.size === 1) {
      worstStatements = Math.max(worstStatements, depth);
      worstDenials = Math.max(worstDenials, denials);
      return { desc: null, deny: new Set(), card: [...remaining][0]!, fits: null, denies: null };
    }
    let best: { stmt: Statement; inP: Set<string>; outP: Set<string> } | null = null;
    let bestScore: [number, number, number] | null = null;
    for (const stmt of stmts) {
      const inP = new Set([...remaining].filter((id) => stmt.deny.has(id)));
      const outP = new Set([...remaining].filter((id) => !stmt.deny.has(id)));
      if (inP.size === 0 || outP.size === 0) continue;
      // Prefer statements whose denial branch resolves in one (singleton
      // denial set), then small denial branches (fewer "no"s), then large
      // continuation (shorter fits path).
      const score: [number, number, number] = [inP.size === 1 ? 1 : 0, -inP.size, -outP.size];
      if (
        !bestScore ||
        score[0] > bestScore[0] ||
        (score[0] === bestScore[0] && (score[1] > bestScore[1] || (score[1] === bestScore[1] && score[2] > bestScore[2])))
      ) {
        bestScore = score;
        best = { stmt, inP, outP };
      }
    }
    if (!best) {
      // No natural attribute splits this remainder; name one card directly
      // (honest singleton statement, still denial-answerable).
      const [first, ...rest] = [...remaining];
      const label = cards.find((c) => c.id === first)?.label ?? first!;
      return {
        desc: `It's not the ${label}.`,
        card: null,
        deny: new Set([first!]),
        fits: build(new Set(rest), depth + 1, denials),
        denies: build(new Set([first!]), depth + 1, denials + 1)
      };
    }
    return {
      desc: `It's ${best.stmt.desc}.`,
      card: null,
      deny: best.stmt.deny,
      fits: build(best.outP, depth + 1, denials),
      denies: build(best.inP, depth + 1, denials + 1)
    };
  }

  const root = build(new Set(cards.map((c) => c.id)), 0, 0);
  return { root, worstStatements, worstDenials };
}

/** Answer the tree truthfully for a card; returns the leaf reached. */
export function traceCard(root: TreeNode, cardId: string): { leaf: string | null; statements: number; denials: number } {
  let node: TreeNode | null = root;
  let statements = 0;
  let denials = 0;
  while (node && node.desc !== null) {
    statements += 1;
    if (node.deny.has(cardId)) {
      denials += 1;
      node = node.denies;
    } else {
      node = node.fits;
    }
  }
  return { leaf: node?.card ?? null, statements, denials };
}
