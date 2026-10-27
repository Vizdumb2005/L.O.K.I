# LOKI v3 — evaluation report

**Status:** simulator-only evaluation. **Human participants: 0.**
This report measures a synthetic answer model, not people. It is evidence about the
implementation's behavior under controlled noise, not proof of real-world accuracy.

**Generated:** 2026-10-27T18:37:33.583Z · **Runs per cell:** 1000 ·
**Seed base:** 20261027 · **Cells:** 33 ·
**Total runs:** 33000

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
| Commits | 747 / 1000 (74.7%) [71.9%, 77.3%] |
| Graceful misses | 253 / 1000 (25.3%) |
| Correct reveals | 734 |
| Wrong reveals | 13 |
| Committed accuracy | 98.3% [97.0%, 99.0%] |
| Wrong-confident reveals, all runs | 1.3% [0.8%, 2.2%] |
| Wrong-confident reveals, committed runs | 1.7% [1.0%, 3.0%] |
| Brier score (multiclass) | 0.100 [0.080, 0.120] |
| Expected calibration error (10 bins) | 0.027 |
| Mean probes answered | 5.20 [5.11, 5.28] |
| Mean recoveries | 0.35 |

### Gate decision

The pre-registered gate was **< 3% wrong-confident reveals over all runs** and
**< 10% over committed reveals**, using the upper end of the 95% interval.

- All runs: 1.3% [0.8%, 2.2%] — **PASS**
- Committed runs: 1.7% [1.0%, 3.0%] — **PASS**

**Gate result: PASS at the nominal 10% answer-error condition.**
This is a simulation gate. It does not validate the show with people, and it does not
justify a guaranteed-accuracy claim.

## 2. Card effect by policy

At 15% answer error (a stress condition), compare the policies directly in the table below; the fixed probe order often
exhausts its budget without reaching τ.

| Policy | Commits | Wrong | Committed accuracy | Wrong, all runs | Brier | ECE | Mean probes |
|---|---|---|---|---|---|---|---|
| greedy | 605 / 1000 (60.5%) | 30 | 95.0% [93.0%, 96.5%] | 3.0% [2.1%, 4.3%] | 0.210 [0.181, 0.239] | 0.027 | 5.62 [5.53, 5.71] |
| median | 605 / 1000 (60.5%) | 30 | 95.0% [93.0%, 96.5%] | 3.0% [2.1%, 4.3%] | 0.211 [0.182, 0.240] | 0.025 | 5.62 [5.53, 5.71] |
| fixed | 461 / 1000 (46.1%) | 25 | 94.6% [92.1%, 96.3%] | 2.5% [1.7%, 3.7%] | 0.294 [0.262, 0.325] | 0.035 | 7.00 [6.99, 7.00] |

## 3. Card effect by answer error (greedy)

| Answer error | Commits | Wrong | Committed accuracy | Wrong, all runs | Brier | ECE | Mean probes |
|---|---|---|---|---|---|---|---|
| 0% | 1000 / 1000 (100.0%) | 0 | 100.0% [99.6%, 100.0%] | 0.0% [0.0%, 0.4%] | 0.001 [0.001, 0.001] | 0.029 | 4.24 [4.22, 4.27] |
| 5% | 865 / 1000 (86.5%) | 5 | 99.4% [98.7%, 99.8%] | 0.5% [0.2%, 1.2%] | 0.029 [0.018, 0.039] | 0.032 | 4.79 [4.72, 4.86] |
| 15% | 605 / 1000 (60.5%) | 30 | 95.0% [93.0%, 96.5%] | 3.0% [2.1%, 4.3%] | 0.210 [0.181, 0.239] | 0.027 | 5.62 [5.53, 5.71] |
| 30% | 382 / 1000 (38.2%) | 107 | 72.0% [67.3%, 76.3%] | 10.7% [8.9%, 12.8%] | 0.718 [0.672, 0.764] | 0.234 | 6.17 [6.09, 6.26] |

The show degrades into abstention rather than bluffing as noise rises. At 30% error the
wrong-confident rate crosses the < 3% gate; those runs are outside the shipping envelope
and are reported rather than hidden.

## 4. Ablations

All ablation cells use the card effect, greedy policy, and 15% answer error (a stress
condition), 1,000 runs each.

| Condition | Commits | Wrong | Committed accuracy | Wrong, all runs | Brier | ECE | Mean probes | Decision |
|---|---|---|---|---|---|---|---|---|
| Soft likelihoods + outlier mixture | 605 / 1000 (60.5%) | 30 | 95.0% [93.0%, 96.5%] | 3.0% [2.1%, 4.3%] | 0.210 [0.181, 0.239] | 0.027 | 5.62 [5.53, 5.71] |  Shipping math. Kept as the reference. |
| Hard elimination | 1000 / 1000 (100.0%) | 301 | 69.9% [67.0%, 72.7%] | 30.1% [27.3%, 33.0%] | 0.602 [0.545, 0.659] | 0.301 | 2.00 [2.00, 2.00] |  Dropped. Confidently wrong on half of all runs. |
| No outlier mixture | 696 / 1000 (69.6%) | 38 | 94.5% [92.6%, 96.0%] | 3.8% [2.8%, 5.2%] | 0.217 [0.186, 0.248] | 0.041 | 5.56 [5.47, 5.65] |  Dropped. More wrong reveals and worse calibration. |
| Gaze on (simulated) | 766 / 1000 (76.6%) | 15 | 98.0% [96.8%, 98.8%] | 1.5% [0.9%, 2.5%] | 0.121 [0.097, 0.144] | 0.019 | 4.79 [4.69, 4.90] |  Lab only. Mechanical upper bound, not human evidence. |
| Force on (prior shift) | 618 / 1000 (61.8%) | 27 | 95.6% [93.7%, 97.0%] | 2.7% [1.9%, 3.9%] | 0.207 [0.178, 0.237] | 0.022 | 5.65 [5.56, 5.73] |  Default off. Modest simulated effect, no human evidence. |
| Temperature 0.95 | 741 / 1000 (74.1%) | 39 | 94.7% [92.9%, 96.1%] | 3.9% [2.9%, 5.3%] | 0.218 [0.185, 0.250] | 0.054 | 5.37 [5.28, 5.46] |  Dropped. Overconfident and more wrong commits. |
| Temperature 1.05 | 399 / 1000 (39.9%) | 9 | 97.7% [95.8%, 98.8%] | 0.9% [0.5%, 1.7%] | 0.204 [0.178, 0.229] | 0.034 | 6.29 [6.23, 6.34] |  Dropped. Fewer commits without a clear accuracy gain. |

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
| greedy | 630 / 1000 (63.0%) | 48 | 92.4% [90.0%, 94.2%] | 4.8% [3.6%, 6.3%] | 0.340 [0.311, 0.369] | 0.024 | 3.00 [3.00, 3.00] |
| median | 630 / 1000 (63.0%) | 48 | 92.4% [90.0%, 94.2%] | 4.8% [3.6%, 6.3%] | 0.340 [0.311, 0.369] | 0.024 | 3.00 [3.00, 3.00] |
| fixed | 630 / 1000 (63.0%) | 48 | 92.4% [90.0%, 94.2%] | 4.8% [3.6%, 6.3%] | 0.340 [0.311, 0.369] | 0.024 | 3.00 [3.00, 3.00] |

Toy shipping cell at 10% error: 739 commits, 20 wrong,
97.3% committed accuracy, Brier
0.215. The three probes now ask objective spelling properties: ends in n,
contains m, and odd letter count. They form distinct balanced partitions whose truth
codewords have pairwise Hamming distance two. All four truthful paths reveal; every
single flipped answer abstains. Two flips can imitate another word and cause a wrong
reveal. Threshold, noise, temperature and probe budget are unchanged.

This is a spelling-puzzle plugin proof, not a shipping mentalism accuracy claim. The
independent per-answer simulator cannot establish human calibration: spelling mistakes
may be correlated. The held-out seed gives 31 wrong out of 1000 runs;
its point error rate is 3.1% before interval uncertainty. Do not describe Ember as passing
the card shipping gates. It runs through the identical session, belief, recovery and
simulation code.

## 6. Calibration

![Reliability diagram for the shipping card configuration](calibration.svg)

Points track the diagonal in the high-confidence region where the show commits. ECE is
0.027 for the shipping cell. The diagram is generated from the same
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
- **Model route:** the verified Baseten route is `meta-models/muse-spark-open`; the dated
  ID in the brief was not found. No paid call is made by the default build.

## 10. Reproduction

```bash
npm ci
npm run eval          # writes data/eval-results.json (deterministic for the fixed seed)
npm run eval:report   # writes docs/eval-report.md and docs/calibration.svg
npm test              # unit, property, session, simulator, and plugin-contract tests
npm run verify        # lint, typecheck, tests, build, and core-isolation check
```

The generated JSON is the machine-readable source of truth. This Markdown report is
derived from it; do not hand-edit numbers.
