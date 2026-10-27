# LOKI v3 — evaluation report

**Status:** simulator-only evaluation. **Human participants: 0.**
This report measures a synthetic answer model, not people. It is evidence about the
implementation's behavior under controlled noise, not proof of real-world accuracy.

**Generated:** 2026-10-27T09:58:40.871Z · **Runs per cell:** 1000 ·
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
95% Wilson intervals for proportions; Brier intervals are seeded bootstrap intervals.

**Shipping result (card / greedy / 10% answer error):**

| Metric | Value |
|---|---|
| Commits | 517 / 1000 (51.7%) [48.6%, 54.8%] |
| Graceful misses | 483 / 1000 (48.3%) |
| Correct reveals | 509 |
| Wrong reveals | 8 |
| Committed accuracy | 98.5% [97.0%, 99.2%] |
| Wrong-confident reveals, all runs | 0.8% [0.4%, 1.6%] |
| Wrong-confident reveals, committed runs | 1.5% [0.8%, 3.0%] |
| Brier score (multiclass) | 0.192 [0.165, 0.219] |
| Expected calibration error (10 bins) | 0.026 |
| Mean probes answered | 6.62 [6.58, 6.65] |
| Mean recoveries | 0.61 |

### Gate decision

The pre-registered gate was **< 3% wrong-confident reveals over all runs** and
**< 10% over committed reveals**, using the upper end of the 95% interval.

- All runs: 0.8% [0.4%, 1.6%] — **PASS**
- Committed runs: 1.5% [0.8%, 3.0%] — **PASS**

**Gate result: PASS at the nominal 10% answer-error condition.**
This is a simulation gate. It does not validate the show with people, and it does not
justify a guaranteed-accuracy claim.

## 2. Card effect by policy

At 15% answer error (a stress condition), greedy and median coincide on this probe bank;
the fixed probe order often exhausts its budget without reaching τ.

| Policy | Commits | Wrong | Committed accuracy | Wrong, all runs | Brier | ECE | Mean probes |
|---|---|---|---|---|---|---|---|
| greedy | 356 / 1000 (35.6%) | 15 | 95.8% [93.2%, 97.4%] | 1.5% [0.9%, 2.5%] | 0.372 [0.336, 0.407] | 0.067 | 6.73 [6.70, 6.75] |
| median | 356 / 1000 (35.6%) | 15 | 95.8% [93.2%, 97.4%] | 1.5% [0.9%, 2.5%] | 0.372 [0.336, 0.407] | 0.067 | 6.73 [6.70, 6.75] |
| fixed | 0 / 1000 (0.0%) | 0 | — | 0.0% [0.0%, 0.4%] | 0.502 [0.467, 0.537] | 0.052 | 7.00 [7.00, 7.00] |

## 3. Card effect by answer error (greedy)

| Answer error | Commits | Wrong | Committed accuracy | Wrong, all runs | Brier | ECE | Mean probes |
|---|---|---|---|---|---|---|---|
| 0% | 923 / 1000 (92.3%) | 0 | 100.0% [99.6%, 100.0%] | 0.0% [0.0%, 0.4%] | 0.001 [0.001, 0.001] | 0.023 | 6.33 [6.30, 6.36] |
| 5% | 682 / 1000 (68.2%) | 5 | 99.3% [98.3%, 99.7%] | 0.5% [0.2%, 1.2%] | 0.073 [0.057, 0.090] | 0.045 | 6.50 [6.47, 6.53] |
| 15% | 356 / 1000 (35.6%) | 15 | 95.8% [93.2%, 97.4%] | 1.5% [0.9%, 2.5%] | 0.372 [0.336, 0.407] | 0.067 | 6.73 [6.70, 6.75] |
| 30% | 181 / 1000 (18.1%) | 65 | 64.1% [56.9%, 70.7%] | 6.5% [5.1%, 8.2%] | 0.951 [0.907, 0.995] | 0.342 | 6.85 [6.83, 6.87] |

The show degrades into abstention rather than bluffing as noise rises. At 30% error the
wrong-confident rate crosses the < 3% gate; those runs are outside the shipping envelope
and are reported rather than hidden.

## 4. Ablations

All ablation cells use the card effect, greedy policy, and 15% answer error (a stress
condition), 1,000 runs each.

| Condition | Commits | Wrong | Committed accuracy | Wrong, all runs | Brier | ECE | Mean probes | Decision |
|---|---|---|---|---|---|---|---|---|
| Soft likelihoods + outlier mixture | 356 / 1000 (35.6%) | 15 | 95.8% [93.2%, 97.4%] | 1.5% [0.9%, 2.5%] | 0.372 [0.336, 0.407] | 0.067 | 6.73 [6.70, 6.75] |  Shipping math. Kept as the reference. |
| Hard elimination | 1000 / 1000 (100.0%) | 479 | 52.1% [49.0%, 55.2%] | 47.9% [44.8%, 51.0%] | 0.958 [0.896, 1.020] | 0.479 | 3.60 [3.57, 3.63] |  Dropped. Confidently wrong on half of all runs. |
| No outlier mixture | 411 / 1000 (41.1%) | 20 | 95.1% [92.6%, 96.8%] | 2.0% [1.3%, 3.1%] | 0.375 [0.339, 0.412] | 0.074 | 6.58 [6.55, 6.62] |  Dropped. More wrong reveals and worse calibration. |
| Gaze on (simulated) | 604 / 1000 (60.4%) | 13 | 97.8% [96.4%, 98.7%] | 1.3% [0.8%, 2.2%] | 0.215 [0.187, 0.243] | 0.024 | 5.77 [5.68, 5.86] |  Lab only. Mechanical upper bound, not human evidence. |
| Force on (prior shift) | 381 / 1000 (38.1%) | 18 | 95.3% [92.7%, 97.0%] | 1.8% [1.1%, 2.8%] | 0.364 [0.328, 0.400] | 0.053 | 6.59 [6.55, 6.64] |  Default off. Modest simulated effect, no human evidence. |
| Temperature 0.95 | 465 / 1000 (46.5%) | 38 | 91.8% [89.0%, 94.0%] | 3.8% [2.8%, 5.2%] | 0.416 [0.375, 0.457] | 0.117 | 6.31 [6.26, 6.36] |  Dropped. Overconfident and more wrong commits. |
| Temperature 1.05 | 247 / 1000 (24.7%) | 14 | 94.3% [90.7%, 96.6%] | 1.4% [0.8%, 2.3%] | 0.367 [0.335, 0.399] | 0.029 | 6.86 [6.84, 6.88] |  Dropped. Fewer commits without a clear accuracy gain. |

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
| greedy | 546 / 1000 (54.6%) | 108 | 80.2% [76.7%, 83.3%] | 10.8% [9.0%, 12.9%] | 0.457 [0.422, 0.493] | 0.071 | 3.00 [3.00, 3.00] |
| median | 546 / 1000 (54.6%) | 108 | 80.2% [76.7%, 83.3%] | 10.8% [9.0%, 12.9%] | 0.457 [0.422, 0.493] | 0.071 | 3.00 [3.00, 3.00] |
| fixed | 546 / 1000 (54.6%) | 108 | 80.2% [76.7%, 83.3%] | 10.8% [9.0%, 12.9%] | 0.457 [0.422, 0.493] | 0.071 | 3.00 [3.00, 3.00] |

Toy shipping cell at 10% error: 619 commits, 75 wrong,
87.9% committed accuracy, Brier
0.328. The lower performance is expected from a three-question toy and is
reported as-is; the platform test is that it runs through the identical session,
belief, recovery, and simulation code.

## 6. Calibration

![Reliability diagram for the shipping card configuration](calibration.svg)

Points track the diagonal in the high-confidence region where the show commits. ECE is
0.026 for the shipping cell. The diagram is generated from the same
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
| Contradiction recovery probe | **Kept** | Raises commit rate and avoids bluffing on surprise. |
| Greedy probe selection | **Kept** | Best commit rate; simplest to explain and test. |
| Median / bisection challenger | **Dropped from shipping** | No difference from greedy on this bank; optimality does not generalise to 2-D card hypotheses. |
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
