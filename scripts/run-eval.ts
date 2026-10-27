import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runCell } from "@loki/sim";
import { EVAL_SPECS, RUNS, SEED, NOISE, POLICIES } from "./eval-spec.js";

const cells = EVAL_SPECS.map((spec) => {
  const cell = runCell(spec);
  console.log(`${cell.label}: commits=${cell.commits} wrong=${cell.wrong} n=${cell.n}`);
  return cell;
});

const output = {
  meta: {
    name: "LOKI v3 simulator evaluation",
    createdAt: new Date().toISOString(),
    runsPerCell: RUNS,
    seedBase: SEED,
    noiseLevels: NOISE,
    policies: POLICIES,
    humanParticipants: 0,
    notes: [
      "All figures are from synthetic spectators, not humans.",
      "Same per-run seed across policies keeps comparisons paired.",
      "No camera frames are used or stored; gaze is a categorical zone simulation.",
      "Ablation gaze-on is a mechanical upper bound, not evidence that webcam gaze works.",
      "Ablation force-on shifts the sampled target prior; it is not evidence that a psychological force works."
    ]
  },
  cells
};

const target = resolve("data/eval-results.json");
await writeFile(target, JSON.stringify(output, null, 2) + "\n");
console.log(`\nWrote ${cells.length} cells / ${cells.length * RUNS} runs to ${target}`);
