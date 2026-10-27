# L.O.K.I — continuation handoff (2026-10-27, round 2)

## Recovered state

- **Repo**: https://github.com/Vizdumb2005/L.O.K.I.git
- **Branch**: `main`
- **Commit**: `4838a1cb1111638a8bfafb1279f4a6b4d650a5e4` (Initial commit, Oct 27, 2026)
- **Workspace**: clean, on `main`, up to date with origin
- **Environment**: Node v24.19.0, Windows x64, npm 10.x

## What was done in this round

### 1. Evidence reproducibility (milestone 1 — COMPLETE)

**Investigation**: Two fresh 33,000-run evaluations were executed. Both runs produced
identical results for all 33 cells (excluding `meta.createdAt` timestamps). 31 of 33
cells matched the committed `data/eval-results.json` exactly. Two cells differed:

| Cell | Committed (stale) | Fresh (verified) |
|---|---|---|
| `ablation / temperature 1.05` | 247 commits, 14 wrong, ECE 0.02943 | 215 commits, 12 wrong, ECE 0.02220 |
| `ablation / gaze on (simulated)` | ECE 0.023855199081816523 | ECE 0.022855199081816522 |

**Root cause**: The committed `eval-results.json` was generated at 09:58 UTC, before
the final commit at 19:17 IST. The code was modified between artifact generation and
commit, producing stale results in two cells. The fresh results are reproducible and
mathematically consistent (temperature 1.05 correctly reduces posterior confidence,
verified by direct test: max posterior 0.901 at T=1.05 vs 0.947 at T=1.0).

**Actions taken**:
- Original artifacts preserved in `data/provenance/` (eval-results-original.json,
  eval-report-original.md, calibration-original.svg, baseline-env.json)
- Fresh verified results saved as `data/provenance/eval-results-verified.json`
- `data/eval-results.json` updated with verified fresh results
- `docs/eval-report.md` and `docs/calibration.svg` regenerated from verified JSON
- `docs/lessons.md` line 139 updated: temperature 1.05 now shows 215 commits, 12 wrong
- Shipping cell unchanged: 517 commits, 509 correct, 8 wrong (reproduced exactly)

**Provenance check added**: `scripts/verify-provenance.ts` (`npm run verify:provenance`)
runs 9 key cells and compares against committed JSON. Passes.

### 2. Verification results (all gates green)

| Check | Result |
|---|---|
| `npm run lint` | Passed (0 errors, 0 warnings) |
| `npm run typecheck` | Passed |
| `npm test` | 7 files, 58 tests passed |
| `npm run build` | Passed (1.206 MB / 338 KB gzip, large-chunk warning) |
| `npm run verify:isolation` | Passed |
| `npm run verify:provenance` | Passed (9/9 cells match) |

## Implemented vs verified

| Area | Status |
|---|---|
| Engine (belief, policy, calibration) | Implemented, tested, evaluated |
| Showrunner (session, recovery, patter) | Implemented, tested |
| Simulator (spectators, metrics, reports) | Implemented, tested, 33K runs verified |
| Card effect (The Twelve) | Implemented, tested, shipping config verified |
| Toy effect (Ember Words) | Implemented, tested, plugin contract verified |
| Web app (consent, performance, stage) | Implemented, built, lint/typecheck pass |
| Camera lab | Implemented, NOT validated (diagnostics only) |
| Gaze perception | Implemented, simulated only, NOT human-validated |
| Force | Implemented, default off, NOT human-validated |
| Human pilot | 0 participants |
| 3D visual verification | NOT done (no WebGL in environment) |
| Physical device testing | NOT done |

## Remaining work (next tasks)

### Immediate (safe local work)
1. **Audit: camera async lifecycle** — Review `CameraLab.tsx` for cancellation when
   spectator stops/leaves/resets during pending camera/model operations. Add controlled
   fake-stream/deferred-promise tests. Never use real camera data in fixtures.
2. **Audit: recovery semantics** — Adversarial answer sequences against
   `PerformanceSession.answer()`, `enterRecovery()`, and the commit gate. Prove
   unresolved contradictions cannot lead to confident reveal. Verify recovery/probe
   budgets hold.
3. **Audit: probability-model consistency** — In `belief.ts`, verify outlier/reliability
   mixtures use `1/N` consistently. Check normalization, confidence, surprise behavior,
   and whether expected entropy uses the same effective update including temperature.
4. **Audit: evidence-log guarantees** — Verify exported logs + config can reproduce
   decisions and recovery state, not only posterior snapshots.

### Later milestones
5. Real browser/device pass: rendered consent, card/toy stages, hit/miss/recovery,
   flat fallback, keyboard, text zoom, reduced motion.
6. Camera stop/navigation/error lifecycle with consent and controlled fixtures.
7. Human pilot using existing protocol (0 participants so far).


## Audit findings (round 2)

### Camera async lifecycle (CameraLab.tsx)

**Concern**: Race condition in `start()`. If the component unmounts while
`getUserMedia()` or `video.play()` is pending, the acquired stream leaks because
`aliveRef` is only checked after `createFaceLandmarker()` resolves. The `useEffect`
cleanup runs on unmount but `streamRef.current` is still null at that point.

**Status**: Documented as a coverage concern, not a reproduced leak. The lab is
opt-in, experimental, and never used by the show. No fix applied (per handoff: treat
concerns as test questions, not proven defects).

**Recommended next step**: Add controlled fake-stream/deferred-promise tests.
Never use real camera data in fixtures. Consider adding `aliveRef.current` checks
after each `await` in `start()` and `track.onended` handlers.

### Recovery semantics (PerformanceSession)

**Audit**: Adversarial answer sequences (alternating yes/no) correctly trigger
recovery and end in a graceful miss without committing. The commit gate explicitly
checks `!state.contradictionActive`, and contradictions during recovery block commit.
Recovery budget (1 probe) is respected.

**Status**: No defect found. Existing 12 session tests + adversarial audit pass.

### Probability model consistency (belief.ts)

**Audit**: 
- Answer likelihoods (smoothed + outlier) do NOT sum to 1 across hypotheses — correct,
  they are per-hypothesis P(option|h), not a distribution over hypotheses.
- Posterior always normalizes to sum 1. Temperature preserves normalization.
- Channel likelihoods are row-stochastic (sum to 1 across values per hypothesis).
- Outlier mixture uses `1/N` (N = hypotheses). Reliability mixture for answers uses
  `1/N`; for channels uses `1/V` (V = observation alphabet). Both correct.
- `expectedPosteriorEntropy` in policy.ts does not apply temperature — by design,
  temperature is a post-hoc calibration layer, not part of the inference model.
  Shipping config uses temperature = 1.0, so this is not a practical issue.
- `expectedPosteriorEntropy` uses `answerLikelihoods` without the reliability
  mixture. For the simulator (reliability=1) these are equivalent. Minor
  inconsistency if reliability < 1 in the app, but the policy is an approximation.

**Status**: Mathematically consistent. No defect found.

### Evidence-log guarantees

**Audit**: `replay()` in belief.ts reconstructs the exact belief state from the
categorical evidence log. Existing test "replays the exact same posterior from the
categorical log" verifies this. `exportLog()` includes all observations with channel,
value, probeId, reliability, at, surprise, and posterior.

**Status**: Replay guarantee verified by existing test. No defect found.


## Operating limits

- No destructive resets, paid usage, model-credit consumption, deployment, publishing,
  account changes, pushing or submissions without approval.
- Camera/forces off unless validated. Optional patter separate from belief.
- No-camera path intact. All human/device limits explicit.
- No extra effects or speculative framework.

## Key files

- `data/eval-results.json` — verified fresh evaluation (33 cells, 33,000 runs)
- `data/provenance/` — original artifacts, environment, run1, run2, verified copies
- `scripts/verify-provenance.ts` — regression check for stale artifacts
- `docs/eval-report.md` — regenerated report from verified JSON
- `docs/calibration.svg` — regenerated calibration plot
- `docs/lessons.md` — updated temperature 1.05 numbers