#!/usr/bin/env tsx
// Full deterministic check: all cells, all metrics and seed/run metadata.
// Timestamps are intentionally excluded. Historical originals are never overwritten.
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { runCell, type CellMetrics } from "@loki/sim";
import { cardEffect } from "@loki/effect-card";
import { EVAL_SPECS, RUNS, SEED, NOISE, POLICIES } from "./eval-spec.js";

async function main(): Promise<void> {
  const committed = JSON.parse(await readFile("data/eval-results.json", "utf8")) as {
    meta: { seedBase: number; runsPerCell: number; humanParticipants: number; noiseLevels: number[]; policies: string[] };
    cells: CellMetrics[];
  };
  if (committed.meta.seedBase !== SEED || committed.meta.runsPerCell !== RUNS ||
      committed.meta.humanParticipants !== 0 ||
      !isDeepStrictEqual(committed.meta.noiseLevels, [...NOISE]) ||
      !isDeepStrictEqual(committed.meta.policies, [...POLICIES]) ||
      committed.cells.length !== EVAL_SPECS.length) {
    throw new Error("Evaluation metadata/cell count does not match the declared specification");
  }
  for (const [index, spec] of EVAL_SPECS.entries()) {
    const fresh = runCell(spec);
    if (!isDeepStrictEqual(fresh, committed.cells[index])) {
      throw new Error(`Stale, missing, reordered or changed cell: ${spec.label}. Run npm run eval and npm run eval:report.`);
    }
    console.log(`OK: ${spec.label}`);
  }
  const heldOut = runCell({ runs: RUNS, seed: 99999, effect: cardEffect, policy: "greedy",
    answerError: 0.1, gaze: false, force: false, label: "held-out / card / shipping / noise 0.1" });
  // Both gates are required. Zero commits cannot pass the conditional gate vacuously.
  if (!(heldOut.wrongConfidentRateAll[1] < 0.03 && heldOut.commits > 0 && heldOut.wrongConfidentRateCommits[1] < 0.1)) {
    throw new Error("Held-out shipping gate failed");
  }
  console.log(`PASS: all ${EVAL_SPECS.length} complete cells match. Held-out: ${heldOut.commits} commits, ${heldOut.wrong} wrong.`);
  console.log("Synthetic seed robustness only. No human or camera validation is established.");
}
main().catch(error => { console.error("FAIL:", error); process.exitCode = 1; });
