#!/usr/bin/env tsx
/**
 * Provenance and regression check for committed evaluation artifacts.
 *
 * Verifies that data/eval-results.json is reproducible from the current code
 * and seed. Runs a fast subset (shipping + ablation cells) and compares
 * against the committed JSON, excluding the meta.createdAt timestamp.
 *
 * Usage: npm run verify:provenance
 * Exit 0 = pass, exit 1 = stale or mismatched artifacts.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runCell } from "@loki/sim";
import { cardEffect } from "@loki/effect-card";
import { exampleEffect } from "@loki/effect-example";

const RUNS = 1000;
const SEED = 20261027;

interface CellMetrics {
  label: string;
  commits: number;
  wrong: number;
  correct: number;
  misses: number;
  ece: number;
  brier: number;
  meanProbes: number;
  meanConfidence: number;
  meanRecoveries: number;
}

interface EvalFile {
  meta: { createdAt: string; runsPerCell: number; seedBase: number; [key: string]: unknown };
  cells: CellMetrics[];
}

// The cells to check (subset for speed: shipping + key ablations)
const CHECK_CELLS = [
  { label: "card / shipping / noise 0.1", effect: cardEffect, policy: "greedy" as const, answerError: 0.1, gaze: false, force: false },
  { label: "example / shipping / noise 0.1", effect: exampleEffect, policy: "greedy" as const, answerError: 0.1, gaze: false, force: false },
  { label: "ablation / soft + outlier", effect: cardEffect, policy: "greedy" as const, answerError: 0.15, gaze: false, force: false },
  { label: "ablation / hard elimination", effect: cardEffect, policy: "greedy" as const, answerError: 0.15, gaze: false, force: false, hardMode: true, useOutlier: false },
  { label: "ablation / no outlier", effect: cardEffect, policy: "greedy" as const, answerError: 0.15, gaze: false, force: false, useOutlier: false },
  { label: "ablation / gaze on (simulated)", effect: cardEffect, policy: "greedy" as const, answerError: 0.15, gaze: true, force: false, gazeAccuracy: 0.65, gazeReliability: 0.65 },
  { label: "ablation / force on (prior shift)", effect: cardEffect, policy: "greedy" as const, answerError: 0.15, gaze: false, force: true },
  { label: "ablation / temperature 0.95", effect: { ...cardEffect, config: { ...cardEffect.config, temperature: 0.95 } }, policy: "greedy" as const, answerError: 0.15, gaze: false, force: false },
  { label: "ablation / temperature 1.05", effect: { ...cardEffect, config: { ...cardEffect.config, temperature: 1.05 } }, policy: "greedy" as const, answerError: 0.15, gaze: false, force: false },
];

async function main(): Promise<void> {
  const committedPath = resolve("data/eval-results.json");
  let committed: EvalFile;
  try {
    committed = JSON.parse(await readFile(committedPath, "utf8")) as EvalFile;
  } catch {
    console.error("FAIL: data/eval-results.json not found or invalid JSON");
    process.exit(1);
  }

  console.log("Provenance check: committed eval-results.json");
  console.log("  meta.createdAt:", committed.meta.createdAt);
  console.log("  meta.seedBase:", committed.meta.seedBase);
  console.log("  meta.runsPerCell:", committed.meta.runsPerCell);
  console.log("  cells:", committed.cells.length);
  console.log("");

  let failures = 0;
  for (const spec of CHECK_CELLS) {
    const cell = runCell({
      runs: RUNS,
      seed: SEED,
      gaze: spec.gaze,
      force: spec.force,
      label: spec.label,
      effect: spec.effect,
      policy: spec.policy,
      answerError: spec.answerError,
      gazeAccuracy: "gazeAccuracy" in spec ? spec.gazeAccuracy : undefined,
      gazeReliability: "gazeReliability" in spec ? spec.gazeReliability : undefined,
      hardMode: "hardMode" in spec ? spec.hardMode : undefined,
      useOutlier: "useOutlier" in spec ? spec.useOutlier : undefined,
    });

    const committedCell = committed.cells.find((c) => c.label === spec.label);
    if (!committedCell) {
      console.error("FAIL: committed JSON missing cell: " + spec.label);
      failures++;
      continue;
    }

    const fields: Array<[string, number, number]> = [
      ["commits", cell.commits, committedCell.commits],
      ["wrong", cell.wrong, committedCell.wrong],
      ["correct", cell.correct, committedCell.correct],
      ["ece", cell.ece, committedCell.ece],
      ["brier", cell.brier, committedCell.brier],
    ];

    const diffs: string[] = [];
    for (const [name, fresh, committedVal] of fields) {
      if (fresh !== committedVal) {
        diffs.push(name + ": fresh=" + fresh + " committed=" + committedVal);
      }
    }

    if (diffs.length > 0) {
      console.error("STALE: " + spec.label);
      for (const d of diffs) console.error("  " + d);
      failures++;
    } else {
      console.log("OK:    " + spec.label + " (commits=" + cell.commits + " wrong=" + cell.wrong + " ece=" + cell.ece.toFixed(6) + ")");
    }
  }

  console.log("");
  if (failures > 0) {
    console.error("FAIL: " + failures + " cell(s) are stale. Run 'npm run eval' to regenerate.");
    process.exit(1);
  }
  console.log("PASS: all " + CHECK_CELLS.length + " checked cells match the committed artifact.");
  console.log("(This is a subset check. Run 'npm run eval' for the full 33-cell evaluation.)");
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
