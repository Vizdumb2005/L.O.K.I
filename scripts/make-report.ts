import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { calibrationSvg } from "@loki/sim";
import type { ReliabilityBin } from "@loki/engine";

interface Cell {
  label: string;
  effectId: string;
  effectName: string;
  policy: string;
  answerError: number;
  gaze: boolean;
  force: boolean;
  hardMode: boolean;
  useOutlier: boolean;
  n: number;
  seed: number;
  commits: number;
  misses: number;
  correct: number;
  wrong: number;
  commitRate: [number, number];
  committedAccuracy: [number, number];
  matchRateAll: [number, number];
  wrongConfidentRateAll: [number, number];
  wrongConfidentRateCommits: [number, number];
  missRate: [number, number];
  meanProbes: number;
  meanProbesCI: [number, number];
  meanRecoveries: number;
  meanConfidence: number;
  brier: number;
  brierCI: [number, number];
  ece: number;
  bins: ReliabilityBin[];
}

interface EvalFile {
  meta: {
    name: string;
    createdAt: string;
    runsPerCell: number;
    seedBase: number;
    noiseLevels: number[];
    policies: string[];
    humanParticipants: number;
    notes: string[];
  };
  cells: Cell[];
}

const data = JSON.parse(await readFile(resolve("data/eval-results.json"), "utf8")) as EvalFile;

function cell(label: string): Cell {
  const found = data.cells.find((c) => c.label === label);
  if (!found) throw new Error(`missing eval cell: ${label}`);
  return found;
}

const pct = (x: number, digits = 1): string => `${(x * 100).toFixed(digits)}%`;
const ci = (interval: [number, number], digits = 1): string =>
  `[${pct(interval[0], digits)}, ${pct(interval[1], digits)}]`;
const rawCi = (interval: [number, number], digits = 2): string =>
  `[${interval[0].toFixed(digits)}, ${interval[1].toFixed(digits)}]`;
const num = (x: number, digits = 2): string => x.toFixed(digits);
const row = (label: string, c: Cell, extra = ""): string =>
  `| ${label} | ${c.commits} / ${c.n} (${pct(c.commits / c.n)}) | ${c.wrong} | ` +
  `${c.commits ? `${pct(c.correct / c.commits)} ${ci(c.committedAccuracy)}` : "—"} | ` +
  `${pct(c.wrong / c.n)} ${ci(c.wrongConfidentRateAll)} | ` +
  `${num(c.brier, 3)} ${rawCi(c.brierCI, 3)} | ${num(c.ece, 3)} | ` +
  `${num(c.meanProbes)} ${rawCi(c.meanProbesCI, 2)} |${extra ? ` ${extra} |` : ""}`;

const shipping = cell("card / shipping / noise 0.1");
const toy = cell("example / shipping / noise 0.1");
const heldout = JSON.parse(await readFile(resolve("data/provenance/eval-heldout-results.json"), "utf8")) as {
  heldOutCells: Array<{ label: string; wrong: number }>;
  meta: { runsPerCell: number };
};
const heldoutToy = heldout.heldOutCells.find((c) => c.label === "example / shipping / noise 0.1");
if (!heldoutToy) throw new Error("missing held-out toy cell");
const noiseLevels = data.meta.noiseLevels;
const policies = data.meta.policies;

const gateAll = shipping.wrongConfidentRateAll[1] < 0.03;
const gateCommits = shipping.wrongConfidentRateCommits[1] < 0.1;
const gate = gateAll && gateCommits;

const cardGreedy = noiseLevels.map((n) => cell(`card-twelve / greedy / noise ${n}`));
const cardPolicies = policies.map((p) => cell(`card-twelve / ${p} / noise 0.15`));
const toyPolicies = policies.map((p) => cell(`ember-words / ${p} / noise 0.15`));

const ablations = [
  ["Soft likelihoods + outlier mixture", cell("ablation / soft + outlier"), "Shipping math. Kept as the reference."],
  ["Hard elimination", cell("ablation / hard elimination"), "Dropped. Confidently wrong on half of all runs."],
  ["No outlier mixture", cell("ablation / no outlier"), "Dropped. More wrong reveals and worse calibration."],
  ["Gaze on (simulated)", cell("ablation / gaze on (simulated)"), "Lab only. Mechanical upper bound, not human evidence."],
  ["Force on (prior shift)", cell("ablation / force on (prior shift)"), "Default off. Modest simulated effect, no human evidence."],
  ["Temperature 0.95", cell("ablation / temperature 0.95"), "Dropped. Overconfident and more wrong commits."],
  ["Temperature 1.05", cell("ablation / temperature 1.05"), "Dropped. Fewer commits without a clear accuracy gain."]
] as const;

const calibration = calibrationSvg(
  shipping.bins,
  "The Twelve — shipping config (simulator, n=1000)"
);

await writeFile(resolve("docs/calibration.svg"), calibration + "\n");

const report = `# LOKI v3 — evaluation report

**Status:** simulator-only evaluation. **Human participants: ${data.meta.humanParticipants}.**
This report measures a synthetic answer model, not people. It is evidence about the
implementation's behavior under controlled noise, not proof of real-world accuracy.

**Generated:** ${data.meta.createdAt} · **Runs per cell:** ${data.meta.runsPerCell} ·
**Seed base:** ${data.meta.seedBase} · **Cells:** ${data.cells.length} ·
**Total runs:** ${data.cells.length * data.meta.runsPerCell}

> LOKI is a performance of mentalism — an illusion, not mind reading. The engine uses
> consent-based answers and soft probabilistic inference. It does not detect lies,
> emotions, identity, or any diagnosis.

## 1. Shipping configuration

| Setting | Value |
|---|---|
| Effect | The Twelve (12 cards: 3 suits × ranks A–4) |
| Policy | Greedy expected-information probe selection |
| Max probes | 6 |
| Commit threshold (τ) | 0.96 |
| Answer-error smoothing (ε) | 0.10 |
| Outlier mixture | 0.06 |
| Temperature | 1.0 |
| Gaze | Off (lab only) |
| Force | Off (logged prior, default off) |
| Commit rule | max posterior ≥ τ, at least 2 answers, no unresolved contradiction |

The shipping run uses 1,000 seeded synthetic spectators, each answering with a 10%
per-question error probability. Runs are paired by seed across policies. Intervals are
95% Wilson intervals for proportions; Brier and mean-probe intervals use a normal approximation to the sample mean.

**Shipping result (card / greedy / 10% answer error):**

| Metric | Value |
|---|---|
| Commits | ${shipping.commits} / ${shipping.n} (${pct(shipping.commits / shipping.n)}) ${ci(shipping.commitRate)} |
| Graceful misses | ${shipping.misses} / ${shipping.n} (${pct(shipping.misses / shipping.n)}) |
| Correct reveals | ${shipping.correct} |
| Wrong reveals | ${shipping.wrong} |
| Committed accuracy | ${pct(shipping.correct / shipping.commits)} ${ci(shipping.committedAccuracy)} |
| Wrong-confident reveals, all runs | ${pct(shipping.wrong / shipping.n)} ${ci(shipping.wrongConfidentRateAll)} |
| Wrong-confident reveals, committed runs | ${pct(shipping.wrong / shipping.commits)} ${ci(shipping.wrongConfidentRateCommits)} |
| Brier score (multiclass) | ${num(shipping.brier, 3)} ${rawCi(shipping.brierCI, 3)} |
| Expected calibration error (10 bins) | ${num(shipping.ece, 3)} |
| Mean probes answered | ${num(shipping.meanProbes)} ${rawCi(shipping.meanProbesCI, 2)} |
| Mean recoveries | ${num(shipping.meanRecoveries)} |

### Gate decision

The pre-registered gate was **< 3% wrong-confident reveals over all runs** and
**< 10% over committed reveals**, using the upper end of the 95% interval.

- All runs: ${pct(shipping.wrong / shipping.n)} ${ci(shipping.wrongConfidentRateAll)} — **${gateAll ? "PASS" : "FAIL"}**
- Committed runs: ${pct(shipping.wrong / shipping.commits)} ${ci(shipping.wrongConfidentRateCommits)} — **${gateCommits ? "PASS" : "FAIL"}**

**Gate result: ${gate ? "PASS at the nominal 10% answer-error condition." : "FAIL."}**
This is a simulation gate. It does not validate the show with people, and it does not
justify a guaranteed-accuracy claim.

## 2. Card effect by policy

At 15% answer error (a stress condition), compare the policies directly in the table below; the fixed probe order often
exhausts its budget without reaching τ.

| Policy | Commits | Wrong | Committed accuracy | Wrong, all runs | Brier | ECE | Mean probes |
|---|---|---|---|---|---|---|---|
${cardPolicies.map((c) => row(c.policy, c)).join("\n")}

## 3. Card effect by answer error (greedy)

| Answer error | Commits | Wrong | Committed accuracy | Wrong, all runs | Brier | ECE | Mean probes |
|---|---|---|---|---|---|---|---|
${cardGreedy.map((c) => row(pct(c.answerError, 0), c)).join("\n")}

The show degrades into abstention rather than bluffing as noise rises. At 30% error the
wrong-confident rate crosses the < 3% gate; those runs are outside the shipping envelope
and are reported rather than hidden.

## 4. Ablations

All ablation cells use the card effect, greedy policy, and 15% answer error (a stress
condition), 1,000 runs each.

| Condition | Commits | Wrong | Committed accuracy | Wrong, all runs | Brier | ECE | Mean probes | Decision |
|---|---|---|---|---|---|---|---|---|
${ablations.map(([name, c, decision]) => row(name, c, ` ${decision}`)).join("\n")}

Interpretation:

- **Soft likelihoods + outlier mixture are non-negotiable.** Hard elimination commits on
  every run and is wrong on roughly half; it is an ablation, never the shipped path.
- **The outlier mixture earns its place.** Removing it produces more wrong reveals and
  worse calibration at the same stress level.
- **Gaze-on results are mechanical.** The simulator feeds a categorical zone with a chosen
  reliability. It cannot show that a browser webcam achieves that reliability. Gaze stays
  in the lab and off in the show.
- **Force-on results are a prior shift.** The simulator samples the forced target more
  often; it is not evidence that a psychological force works on people. Default off.
- **Temperature 1.0 is the best trade.** Lower temperature is overconfident; higher
  temperature buys safety by abstaining more, without a clear accuracy gain.

## 5. Toy effect (plugin contract)

The toy is **Ember Words**: four words, three binary probes, τ = 0.85, max 3 probes. It
exists to prove that the core and simulator do not depend on the card effect. It is not a
shipping effect and was not tuned for the same accuracy target.

| Policy | Commits | Wrong | Committed accuracy | Wrong, all runs | Brier | ECE | Mean probes |
|---|---|---|---|---|---|---|---|
${toyPolicies.map((c) => row(c.policy, c)).join("\n")}

Toy shipping cell at 10% error: ${toy.commits} commits, ${toy.wrong} wrong,
${toy.commits ? pct(toy.correct / toy.commits) : "N/A (no commits)"} committed accuracy, Brier
${num(toy.brier, 3)}. The three probes now ask objective spelling properties: ends in n,
contains m, and odd letter count. They form distinct balanced partitions whose truth
codewords have pairwise Hamming distance two. All four truthful paths reveal; every
single flipped answer abstains. Two flips can imitate another word and cause a wrong
reveal. Threshold, noise, temperature and probe budget are unchanged.

This is a spelling-puzzle plugin proof, not a shipping mentalism accuracy claim. The
independent per-answer simulator cannot establish human calibration: spelling mistakes
may be correlated. The held-out seed gives ${heldoutToy.wrong} wrong out of ${heldout.meta.runsPerCell} runs;
its point error rate is ${pct(heldoutToy.wrong / heldout.meta.runsPerCell)} before interval uncertainty. Do not describe Ember as passing
the card shipping gates. It runs through the identical session, belief, recovery and
simulation code.

## 6. Calibration

![Reliability diagram for the shipping card configuration](calibration.svg)

Points track the diagonal in the high-confidence region where the show commits. ECE is
${num(shipping.ece, 3)} for the shipping cell. The diagram is generated from the same
seeded run data as the table, not from a separate demo. Bins with no observations are
omitted.

## 7. Failure suite

Automated tests exercise: a liar/misclick answer stream, contradictory answers, recovery
budget exhaustion, camera denied, low light/low reliability, glasses (unvalidated), LLM
timeout, offline fallback, and invalid effect definitions. These are correctness tests,
not accuracy measurements; they do not add human evidence. The camera-lab stop/release
path is implemented but was not exercised against a physical camera in this environment.

The no-camera path is the primary product path. Camera code is gated behind an explicit
lab opt-in, processes locally, shows a visible indicator, and is released on stop or error.
No frames, audio, identity data, or embeddings are uploaded or stored.

## 8. Kept and dropped experiments

| Experiment | Decision | Evidence |
|---|---|---|
| Soft likelihoods + outlier mixture | **Kept** | Shipping gate passes; hard elimination fails badly. |
| Contradiction recovery probe | **Kept** | Recovery logic is tested; no isolated recovery ablation was run. |
| Greedy probe selection | **Kept** | Best commit rate; simplest to explain and test. |
| Median / bisection challenger | **Dropped from shipping** | Compare measured trade-offs above; optimality does not generalise to 2-D card hypotheses. |
| Fixed probe order | **Dropped from shipping** | Usually exhausts the budget without a commit. |
| 30% answer-error operation | **Outside envelope** | Gate fails; reported as a stress result. |
| Gaze in the show | **Dropped; lab only** | No human validation; browser gaze error is too large for item-level resolution. |
| Force on by default | **Dropped; default off** | Simulation prior shift is not human evidence; logged when enabled in tests. |
| Temperature ≠ 1.0 | **Dropped** | Worse calibration or unnecessary abstention. |
| 52-card deck | **Roadmap** | Probe length and gaze resolution; 12 cards is the measurable proof. |

## 9. Limitations and unresolved items

- **0 human participants.** No claim about real spectators, real answer-error rates, or
  real-world show accuracy is supported. A pilot protocol is documented; it was not run.
- **Synthetic noise is simplistic.** Answers are independent with a fixed per-question
  error rate. People are correlated, strategic, and affected by wording and pacing.
- **Gaze is unvalidated.** MediaPipe iris landmarks are not a gaze ground truth. The
  camera lab displays quality and never feeds the show without a passed validation gate.
- **Force is unvalidated.** The 3♦ force is implemented as a logged prior and remains off.
- **Optional LLM patter is unvalidated in this environment.** The proxy is off by default,
  requires a key, and falls back to bundled lines on timeout, refusal, or offline.
- **Public repo/demo format:** [UNRESOLVED] The event page does not state whether a public
  URL or a specific video format is required. The repo is prepared public-ready.
- **Physical-device coverage:** browser screenshots are captured at desktop and mobile
  widths; no physical phone, Safari, or low-end GPU was available for this build.
- **Long sessions and group dynamics:** out of scope; the evaluation is one spectator and
  one short effect.
- **Model route:** the verified Baseten route is \`meta-models/muse-spark-open\`; the dated
  ID in the brief was not found. No paid call is made by the default build.

## 10. Reproduction

\`\`\`bash
npm ci
npm run eval          # writes data/eval-results.json (deterministic for the fixed seed)
npm run eval:report   # writes docs/eval-report.md and docs/calibration.svg
npm test              # unit, property, session, simulator, and plugin-contract tests
npm run verify        # lint, typecheck, tests, build, and core-isolation check
\`\`\`

The generated JSON is the machine-readable source of truth. This Markdown report is
derived from it; do not hand-edit numbers.
`;

await writeFile(resolve("docs/eval-report.md"), report);
console.log(
  `wrote docs/eval-report.md and docs/calibration.svg — ` +
    `shipping ${shipping.commits}/${shipping.n} commits, ${shipping.wrong} wrong, gate ${gate ? "PASS" : "FAIL"}`
);
