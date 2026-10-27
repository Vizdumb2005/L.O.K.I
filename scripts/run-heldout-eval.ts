#!/usr/bin/env tsx
/**
 * Held-out seed evaluation: verify the simulator generalizes beyond the
 * primary seed (20261027). Runs key cells with a different seed and compares
 * against the committed results.
 *
 * Usage: npm run eval:heldout
 */
import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { runCell, type CellMetrics, type CellSpec } from "@loki/sim";
import { cardEffect } from "@loki/effect-card";
import { exampleEffect } from "@loki/effect-example";

const RUNS = 1000;
const PRIMARY_SEED = 20261027;
const HELD_OUT_SEED = 99999;

const CELLS: Array<{ label: string; spec: Omit<CellSpec, "runs" | "seed" | "label"> }> = [
  { label: "card / shipping / noise 0.1", spec: { effect: cardEffect, policy: "greedy", answerError: 0.1, gaze: false, force: false } },
  { label: "example / shipping / noise 0.1", spec: { effect: exampleEffect, policy: "greedy", answerError: 0.1, gaze: false, force: false } },
  { label: "card-twelve / greedy / noise 0.15", spec: { effect: cardEffect, policy: "greedy", answerError: 0.15, gaze: false, force: false } },
  { label: "card-twelve / greedy / noise 0.3", spec: { effect: cardEffect, policy: "greedy", answerError: 0.3, gaze: false, force: false } },
  { label: "ablation / hard elimination", spec: { effect: cardEffect, policy: "greedy", answerError: 0.15, gaze: false, force: false, hardMode: true, useOutlier: false } },
  { label: "ablation / temperature 1.05", spec: { effect: { ...cardEffect, config: { ...cardEffect.config, temperature: 1.05 } }, policy: "greedy", answerError: 0.15, gaze: false, force: false } },
  { label: "ablation / gaze on (simulated)", spec: { effect: cardEffect, policy: "greedy", answerError: 0.15, gaze: true, force: false, gazeAccuracy: 0.65, gazeReliability: 0.65 } },
];

interface ComparisonRow {
  label: string;
  primaryCommits: number;
  heldOutCommits: number;
  primaryWrong: number;
  heldOutWrong: number;
  commitDiffPct: number;
  wrongDiff: number;
}

async function main(): Promise<void> {
  console.log("Held-out seed evaluation");
  console.log("  Primary seed: " + PRIMARY_SEED);
  console.log("  Held-out seed: " + HELD_OUT_SEED);
  console.log("  Runs per cell: " + RUNS);
  console.log("");

  const heldOutCells: CellMetrics[] = [];
  for (const { label, spec } of CELLS) {
    const cell = runCell({ runs: RUNS, seed: HELD_OUT_SEED, label, ...spec });
    heldOutCells.push(cell);
    console.log("  " + label.padEnd(36) + " commits=" + cell.commits + " wrong=" + cell.wrong + " ece=" + cell.ece.toFixed(4));
  }

  console.log("");
  console.log("Running primary seed cells for comparison...");
  const primaryCells: CellMetrics[] = [];
  for (const { label, spec } of CELLS) {
    const cell = runCell({ runs: RUNS, seed: PRIMARY_SEED, label, ...spec });
    primaryCells.push(cell);
  }

  console.log("");
  console.log("=== Comparison: primary vs held-out seed ===");
  console.log("");
  const rows: ComparisonRow[] = [];
  for (let i = 0; i < CELLS.length; i++) {
    const p = primaryCells[i]!;
    const h = heldOutCells[i]!;
    const commitDiffPct = p.commits > 0 ? Math.abs(h.commits - p.commits) / p.commits : 0;
    rows.push({
      label: CELLS[i]!.label,
      primaryCommits: p.commits,
      heldOutCommits: h.commits,
      primaryWrong: p.wrong,
      heldOutWrong: h.wrong,
      commitDiffPct,
      wrongDiff: Math.abs(h.wrong - p.wrong)
    });
  }

  console.log("| Cell | Primary commits | Held-out commits | Diff % | Primary wrong | Held-out wrong | Diff |");
  console.log("|---|---|---|---|---|---|---|");
  for (const r of rows) {
    console.log("| " + r.label + " | " + r.primaryCommits + " | " + r.heldOutCommits + " | " + (r.commitDiffPct * 100).toFixed(1) + "% | " + r.primaryWrong + " | " + r.heldOutWrong + " | " + r.wrongDiff + " |");
  }

  const maxCommitDiff = Math.max(...rows.map(r => r.commitDiffPct));
  const maxWrongDiff = Math.max(...rows.map(r => r.wrongDiff));
  console.log("");
  console.log("Max commit rate difference: " + (maxCommitDiff * 100).toFixed(1) + "%");
  console.log("Max wrong count difference: " + maxWrongDiff);

  const shipping = rows.find(r => r.label.includes("shipping") && r.label.includes("card"))!;
  const shippingCell = heldOutCells.find(c => c.label === "card / shipping / noise 0.1")!;
  const gatePass = shippingCell.commits > 0 && shippingCell.wrongConfidentRateAll[1] < 0.03 &&
    shippingCell.wrongConfidentRateCommits[1] < 0.1;
  console.log("");
  console.log("Shipping cell held-out gates (<3% all runs, <10% committed): " + (gatePass ? "PASS" : "FAIL") + " (" + (shipping.heldOutWrong / RUNS * 100).toFixed(1) + "% wrong)");

  const assessment = maxCommitDiff < 0.15 && maxWrongDiff <= 15 ? "PASS" : "CAUTION";
  if (assessment === "PASS") {
    console.log("");
    console.log("ASSESSMENT: PASS — held-out seed produces results in a similar range.");
    console.log("This checks seed robustness within the same simulator, not human generalization.");
  } else {
    console.log("");
    console.log("ASSESSMENT: CAUTION — held-out seed differs more than expected.");
  }

  await mkdir("data/provenance", { recursive: true });
  const output = {
    meta: {
      name: "LOKI v3 held-out seed evaluation",
      createdAt: new Date().toISOString(),
      primarySeed: PRIMARY_SEED,
      heldOutSeed: HELD_OUT_SEED,
      runsPerCell: RUNS,
      cells: rows.length,
      assessment
    },
    comparison: rows,
    heldOutCells: heldOutCells.map(c => ({
      label: c.label, commits: c.commits, wrong: c.wrong, correct: c.correct,
      ece: c.ece, brier: c.brier, meanProbes: c.meanProbes
    }))
  };
  const target = resolve("data/provenance/eval-heldout-results.json");
  await writeFile(target, JSON.stringify(output, null, 2) + "\n");
  console.log("");
  console.log("Saved to " + target);
  if (!gatePass) process.exitCode = 1;
}

main().catch((err) => { console.error(err); process.exit(1); });
