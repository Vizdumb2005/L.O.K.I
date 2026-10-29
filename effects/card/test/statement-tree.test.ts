import { describe, expect, it } from "vitest";
import { CARDS } from "@loki/effect-card";
import { buildStatementTree, traceCard } from "@loki/showrunner";

const tree = buildStatementTree(CARDS);

describe("statement tree for The Twelve", () => {
  it("resolves every card to itself on truthful answers", () => {
    for (const card of CARDS) {
      const trace = traceCard(tree.root, card.id);
      expect(trace.leaf).toBe(card.id);
    }
  });

  it("matches the offline solver's measured worst case: 5 statements, 2 denials", () => {
    expect(tree.worstStatements).toBeLessThanOrEqual(5);
    expect(tree.worstDenials).toBeLessThanOrEqual(2);
    for (const card of CARDS) {
      const trace = traceCard(tree.root, card.id);
      expect(trace.statements).toBeLessThanOrEqual(tree.worstStatements);
      expect(trace.denials).toBeLessThanOrEqual(tree.worstDenials);
    }
  });

  it("has no linear perfect schedule (no singleton-denial statement at the root)", () => {
    expect(tree.root.deny.size).toBeGreaterThan(1);
  });
});
