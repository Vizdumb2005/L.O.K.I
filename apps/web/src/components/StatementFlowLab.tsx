import { useMemo, useState } from "react";
import { CARDS } from "@loki/effect-card";
import { buildStatementTree, type TreeNode } from "./statement-tree.js";

/**
 * Statement-flow prototype for The Twelve (lab only, click input).
 *
 * What it is: the branching statement tree from
 * docs/research-card-method-design-2026-10-30.md, computed live by the same
 * greedy solver. The spectator thinks of any of the twelve cards - a real
 * free choice, no force - and answers statements with "true of my card" or
 * "that's wrong". Denials branch the tree; they are not failures.
 *
 * What it is NOT: not validated as feeling different from the question
 * version (that is a participant-test hypothesis, not declared here), not
 * wired to camera or mic - gesture/voice answering would sit behind the
 * observatory consent before any use. No audio, no video, nothing leaves
 * the page.
 */

type Phase =
  | { kind: "intro" }
  | { kind: "flow"; node: TreeNode; statements: number; denials: number }
  | { kind: "reveal"; cardId: string; statements: number; denials: number }
  | { kind: "miss" };

export function StatementFlowLab() {
  const tree = useMemo(() => buildStatementTree(CARDS), []);
  const [phase, setPhase] = useState<Phase>({ kind: "intro" });

  const answer = (denied: boolean) => {
    if (phase.kind !== "flow") return;
    const next = (denied ? phase.node.denies : phase.node.fits)!;
    const statements = phase.statements + 1;
    const denials = phase.denials + (denied ? 1 : 0);
    if (next.card) setPhase({ kind: "reveal", cardId: next.card, statements, denials });
    else setPhase({ kind: "flow", node: next, statements, denials });
  };

  return (
    <section className="mic-lab statement-flow" aria-label="Statement flow prototype">
      <div className="status-card">
        <p className="eyebrow">Statement flow prototype (The Twelve)</p>
        <h2>Claims, not questions</h2>
        <p>
          The card effect today asks up to six questions. This prototype tries the progressive-anagram
          texture instead: short claims you only ever confirm or deny. Think of any one of the twelve -
          a real free choice, no force - and answer honestly. Wrong answers branch the flow; they are
          never a failure.
        </p>
        <p className="tiny">
          Measured on this exact card set by exhaustive solver search: at most{" "}
          {tree.worstStatements} statements and {tree.worstDenials} denials, worst case. A one-denial
          linear schedule provably does not exist for these twelve cards with natural attributes. Click
          input only; whether this <em>feels</em> different from questions is a participant-test
          hypothesis, not declared here.
        </p>

        {phase.kind === "intro" && (
          <>
            <p className="glyphs" aria-label="The twelve cards">
              {CARDS.map((c) => (
                <span key={c.id} className={c.red ? "glyph red" : "glyph"}>
                  {c.glyph}
                </span>
              ))}
            </p>
            <button type="button" className="primary" onClick={() => setPhase({ kind: "flow", node: tree.root, statements: 0, denials: 0 })}>
              I have a card in mind
            </button>
          </>
        )}

        {phase.kind === "flow" && (
          <>
            <p className="statement" role="status">
              {phase.node.desc}
            </p>
            <div className="row">
              <button type="button" className="primary" onClick={() => answer(false)}>
                True of my card
              </button>
              <button type="button" className="chip" onClick={() => answer(true)}>
                That's wrong
              </button>
            </div>
            <p className="tiny">
              Statement {phase.statements + 1} · denials so far: {phase.denials}
            </p>
          </>
        )}

        {phase.kind === "reveal" && (
          <>
            <p className="statement">
              Then it was the <strong>{CARDS.find((c) => c.id === phase.cardId)?.label}</strong>.
            </p>
            <p className="tiny">
              {phase.statements} statements, {phase.denials}{" "}
              {phase.denials === 1 ? "denial" : "denials"}.
            </p>
            <div className="row">
              <button type="button" className="chip" onClick={() => setPhase({ kind: "intro" })}>
                Run it again
              </button>
              <button type="button" className="chip" onClick={() => setPhase({ kind: "miss" })}>
                It wasn't
              </button>
            </div>
          </>
        )}

        {phase.kind === "miss" && (
          <>
            <p className="statement">You beat me. The card stays yours.</p>
            <p className="tiny">
              The tree is deterministic and covers all twelve cards, so a miss means an answer did not
              match the card in mind - the honest-failure path, not a hidden guess.
            </p>
            <button type="button" className="chip" onClick={() => setPhase({ kind: "intro" })}>
              Run it again
            </button>
          </>
        )}
      </div>
    </section>
  );
}
