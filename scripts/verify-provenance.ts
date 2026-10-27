#!/usr/bin/env tsx
// Full deterministic check: all cells, all metrics and seed/run metadata.
// Timestamps are intentionally excluded. Historical originals are never overwritten.
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { runCell, type CellMetrics } from "@loki/sim";
import { cardEffect } from "@loki/effect-card";
import { EVAL_SPECS, RUNS, SEED, NOISE, POLICIES } from "./eval-spec.js";

// Default mode: exact equality of every cell (the supported runtime, Node 22).
// `--cross-runtime`: a separate diagnostic. Outcome fields stay exact; only calibration fields get
// bounds taken from observed Node 22 vs Node 24 drift (aggregates up to 0.0038, bin count up to 7,
// bin values up to 0.03) with headroom of about 1.4x to 2.6x. It never replaces the exact check.
// Calibration statistics are sums of exp/log/pow floats. Different V8/Node builds can round
// them differently (a probability can land on the other side of a bin edge). Outcome fields
// (commits, correct, wrong, misses, rates, probes) must match EXACTLY. Only these fields get a tolerance.
const CROSS_RUNTIME = process.argv.includes("--cross-runtime");
const CALIBRATION_FIELDS = new Set(["meanConfidence", "brier", "brierCI", "ece", "bins"]);
const FLOAT_TOLERANCE = 0.01;
const BIN_FLOAT_TOLERANCE = 0.05;
const BIN_COUNT_TOLERANCE = 10;

function approxEqual(a: unknown, b: unknown, key = "", inBins = false): boolean {
  if (typeof a === "number" && typeof b === "number") {
    if (key === "count") return Math.abs(a - b) <= BIN_COUNT_TOLERANCE;
    return Math.abs(a - b) <= (inBins ? BIN_FLOAT_TOLERANCE : FLOAT_TOLERANCE);
  }
  if (key === "bins" && Array.isArray(a) && Array.isArray(b)) {
    const total = (bins: unknown[]): number => bins.reduce<number>((n, bin) => n + ((bin as { count: number }).count ?? 0), 0);
    return total(a) === total(b) && a.length === b.length && a.every((v, i) => approxEqual(v, b[i], "bin", true));
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => approxEqual(v, b[i], key, inBins));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    return ka.length === kb.length && ka.every((k) => approxEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], k, inBins));
  }
  return isDeepStrictEqual(a, b);
}

function cellsMatch(fresh: CellMetrics, committed: CellMetrics): boolean {
  const f = fresh as unknown as Record<string, unknown>;
  const c = committed as unknown as Record<string, unknown>;
  const keys = Object.keys(f);
  if (keys.length !== Object.keys(c).length) return false;
  return keys.every((k) => (CALIBRATION_FIELDS.has(k) ? approxEqual(f[k], c[k], k) : isDeepStrictEqual(f[k], c[k])));
}

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
    const exact = isDeepStrictEqual(fresh, committed.cells[index]);
    if (!exact && !(CROSS_RUNTIME && cellsMatch(fresh, committed.cells[index]))) {
      if (cellsMatch(fresh, committed.cells[index])) {
        console.error(`Only calibration floats differ within the cross-runtime bounds (Node ${process.versions.node}). ` +
          "Supported runtime is Node 22 (.nvmrc); this is not an exact reproduction. Re-run with --cross-runtime for a diagnostic pass.");
      }
      throw new Error(`Stale, missing, reordered or changed cell: ${spec.label}. Run npm run eval and npm run eval:report.`);
    }
    console.log(`${exact ? "OK" : "OK (cross-runtime, NOT exact)"}: ${spec.label}`);
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
