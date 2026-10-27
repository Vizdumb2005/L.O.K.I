# LOKI v3 — task

## Mission

Build a consent-based **performance engine for digital mentalism**: a domain-neutral
core that senses, infers under uncertainty, and performs, with effects as plugins. The
12-card effect is the proof of concept. A small second effect proves the plugin contract.
The product is an illusion; it is not mind reading.

## Deadline (verified 2026-10-27)

- **Official deadline:** 2026-11-05 02:00 UTC = 2026-11-04 21:00 US Eastern =
  2026-11-05 07:30 IST.
- The platform exposes a 6-hour grace field. **We do not rely on it.**
- **Internal submission target:** 2026-11-03 18:00 UTC. Final day is buffer only.
- Exact submission-portal fields and whether a public repo/demo URL are mandatory:
  `[UNRESOLVED]`. The repo and video are prepared public-ready regardless.

## Scope

### In scope

1. Research log (`docs/research.md`) completed before product code.
2. These three planning documents before product code.
3. `packages/effect-api` — the narrow plugin contract, validation, and shared test suite.
4. `packages/engine` — pure, deterministic belief updating, soft likelihoods, outlier
   mixture, contradiction detection, policies, calibration, replay.
5. `packages/sim` — effect-agnostic synthetic spectators, seeded RNG, metrics, CIs.
6. `packages/showrunner` — beat state machine, graceful-miss/recovery, patter safety,
   optional LLM rewrite with offline fallback.
7. `packages/perception` — answers, timing, and gaze adapters; gaze zones + reliability,
   window aggregation, no frames retained.
8. `effects/card` — 12-card grid (3 suits × ranks A–4), 12–20 designed probes, script,
   stage, optional force prior logged; default off.
9. `effects/_example` — a small 1-of-4 word/symbol effect (~100 lines) that exercises the
   same contract.
10. `apps/web` — React/Vite/R3F stage, consent, no-camera path, camera lab (default off in
    show), captions, keyboard path, reduced motion, mobile support.
11. Simulator evaluation: ≥1000 runs per cell, 95% CIs, Brier/reliability, wrong-confident
    reveal rate; ablations; both effects.
12. Failure suite: liar, misclick, contradictions, camera denied/lost, low light, glasses,
    LLM timeout, offline.
13. Docs: README, LICENSE, research, lessons, design, ethics, eval report, demo script.
14. Real-browser screenshots at desktop and mobile widths, inspected.
15. Git history with small commits and green tests.

### Out of scope / roadmap

- Number, Beast, Sigil, 52-card, group, voice/text effects.
- A plugin registry/framework or config DSL.
- Human pilot data (no participants available). Protocol is shipped; result is **0
  participants**, not fabricated.
- World-first claims, guaranteed accuracy, emotion/lie/diagnosis detection.
- Paid dependencies or default API spend.
- Production auth, accounts, database, analytics, cloud storage.

## Acceptance criteria

### Product

- [x] Consent screen states illusion, camera opt-in, local processing, no upload/storage.
- [x] A full no-camera show works end to end: invite → think → probes → build → reveal or
      graceful miss → afterglow.
- [x] The 12-card stage is 3D, distinctive, responsive, and keyboard operable.
- [x] Captions are visible; sound is optional; reduced motion respects the OS setting.
- [x] Camera, if opened at all, shows a visible indicator and is released on stop/error.
- [x] Camera lab is explicitly experimental and does not feed the show without a passed
      validation gate.
- [x] Optional LLM patter is off by default, proxy-only, safe-filtered, and falls back on
      timeout/ban/offline.

### Correctness

- [x] No hard elimination in the shipped engine; every answer is soft.
- [x] Outlier mixture and contradiction/recovery are exercised by tests.
- [x] Posterior is log-domain, normalized, replayable from the evidence log.
- [x] Commit only at `maxPosterior ≥ tau` and no unresolved contradiction; probe-budget
      exhaustion alone never reveals.
- [x] Wrong confident reveal rate is measured and below the justified gate (<3% of all
      simulated runs; <10% of committed reveals) for the shipping configuration.
- [x] Calibration (Brier + reliability/ECE) is reported for the shipping config.

### Platform

- [x] `npm run lint` passes; a lint rule forbids core importing `effects/*`.
- [x] `npm run typecheck` passes.
- [x] `npm test` passes.
- [x] `npm run test:core` passes with `effects/card` temporarily removed.
- [x] `effects/_example` runs through the same session/sim harness.
- [x] `npm run build` succeeds.
- [x] Playwright flow passes with camera denied/no camera.
- [x] `npm run eval` is deterministic for fixed seeds and writes machine-readable results.
- [x] `npm run eval:report` writes `docs/eval-report.md` and a calibration SVG.
- [x] `npm run verify:provenance` catches stale committed evaluation artifacts.

### Evidence and honesty

- [x] Results include N, seeds, conditions, 95% CIs, and are labeled simulator-only.
- [x] 0 human participants is stated explicitly.
- [x] Kept/dropped experiments are logged with numbers, including gaze and forces.
- [x] All remaining `[UNRESOLVED]` items are listed in the final report.
- [x] No banned claims in UI, README, docs, or demo script.

## Historical status at continuation rounds 1-5 (2026-10-27, 21:15 IST)

### Milestone 1: Evidence reproducibility — COMPLETE
Two fresh 33K-run evaluations matched each other; 31/33 cells matched the committed
artifact. Two stale cells (temperature 1.05, gaze ECE) were regenerated from the
current commit. Original artifacts preserved in `data/provenance/`. Provenance check
(`npm run verify:provenance`) added and passing. Held-out seed evaluation confirms
generalization (shipping gate PASSES on seed 99999).

### Milestone 2: Audit risk areas — COMPLETE
- Camera async lifecycle: race condition FIXED (aliveRef checks + track.onended)
- Recovery semantics: 5 adversarial tests added, no defects found
- Probability model: 9 consistency tests added, initial audit claim; superseded by observation-alphabet fix
- Evidence-log guarantees: replay round-trip tests added, verified

### Verification status (all gates green)
| Gate | Result |
|---|---|
| lint | PASS (0 errors, 0 warnings) |
| typecheck | PASS |
| unit tests | PASS (7 files, 73 tests) |
| build | PASS |
| core isolation | PASS (manual: typecheck + 46 core tests) |
| verify:provenance | PASS (9/9 cells) |
| Playwright e2e | PASS (4/4 behavioral tests, 25.0s) |
| held-out seed eval | PASS (shipping gate 1.2% wrong) |

### Remaining work
- React Testing Library for CameraLab fake-stream tests
- Real browser/device visual pass
- Human pilot (0 participants)

## Historical status at handoff (2026-10-27)

All acceptance boxes above are met by the implementation and the automated gates, with
three evidence limits: no human participants (0), no physical camera/device validation,
and no WebGL-capable capture environment. The 3D path is implemented and built; the
committed screenshots show the app's tested flat-stage fallback. See `docs/lessons.md`
and the final handoff for the exact `[UNRESOLVED]` list.

## Milestones (re-planned to 8 days)

| Day | Date | Work | Gate |
|---|---|---|---|
| 0 | Oct 27 | Research, task/architecture/agent docs, repo, CI | Docs exist before code |
| 1 | Oct 28 | effect-api, engine, tests | Unit + property tests green |
| 2 | Oct 29 | simulator + eval v1 | ≥1000 runs/cell, CIs |
| 3 | Oct 30 | showrunner + plain UI no-camera e2e | Recovery path exercised |
| 4 | Oct 31 | card + toy effects through same harness | Core passes with card removed |
| 5 | Nov 1 | 3D presentation, accessibility, gaze lab | Screenshots desktop/mobile |
| 6 | Nov 2 | eval full, ablations, failure suite | Eval report + calibration plot |
| 7 | Nov 3 | README, ethics, demo script, repo audit | Internal submission target |
| 8 | Nov 4 | Buffer/recording only | Official deadline |

## Cut order (if time runs short)

1. Any effect beyond card + toy.
2. Optional LLM patter.
3. Forces.
4. Gaze (keep lab, no-camera show).
5. Visual extras.

Never cut: engine tests, plugin contract + second-effect test, graceful miss, consent,
eval report, platform isolation test.

## Definition of done

A public-ready repository that a stranger can clone, install, test, evaluate, and run
offline; a working 3D show with an honest miss path; a reproducible evaluation with
intervals; and a 3-minute demo script that shows both the magic and the honesty. No
claims beyond what was measured.

## Repository cleanup and audit (2026-10-27)

User-requested scope: separate accidental BrowserOS/MCP installation files from the
product, preserve external browser access, and fix verified defects without a redesign.
Plan: remove only unused harness copies; ignore local installations; add camera
cancellation regressions; audit fallback/validation/export boundaries; run local gates.
The domain-neutral engine and effects remain intact. No paid calls or deployment.

## Current audit result (2026-10-27)

See `docs/audit-2026-10-27.md`. Cleanup and verified cancellation/inference/patter/export
fixes are on the audit branch. 82 unit tests and 9 browser behavioral tests pass. Core
isolation passes 69 tests. Full 33-cell provenance passes. Card is 496/490/6
(commits/correct/wrong); held-out 483/472/11. Ember abstains after normalized noise:
not all earlier acceptance claims remain valid. Human and physical-device validation
remain open. No confidence threshold was relaxed to manufacture a successful reveal.


## Ember follow-through with OpenCode (2026-10-27)

Use the verified free `opencode/deepseek-v4.1-flash-free` model, `max` reasoning variant,
installed outside this repository. Keep provider configuration, credentials and generated
coding-session logs outside git. Never switch to a paid or alternate model automatically.
First milestone: redesign the tiny Ember probe set to carry enough distinguishable
information under the corrected observation model. Preserve threshold 0.85, epsilon 0.10,
outlier 0.06 and temperature 1. Test all four truth paths and noisy/contradictory paths
through the shared engine. Use natural, unambiguous questions, not secret answers or
simulator-specific shortcuts. Regenerate the complete evaluation and independent heldout
results; report any tradeoff or abstention, with 0 human participants. No redesign, new
effect, networked runtime dependency, camera activation, merge, deployment or paid calls.

Milestone result: Ember uses three balanced spelling partitions (ends in n, contains m,
odd length), preserving all safety parameters and maxProbes=3. All truthful and all
single-flip paths are tested across three policies. Exhaustive answer patterns expose
wrong reveals after two flips, rather than hiding them. See docs/development-2026-10-27.md.

## Silent-choice accessibility milestone

The decorative stage is aria-hidden and its labels are tiny on mobile. Add an HTML
roster of available items during the think phase only: generic stage items, readable
labels, no selection controls, no captured choice. Preserve stage art and inference.
Test keyboard/screen-reader semantics plus card/word mobile layout. No creative direction
change, paid calls, merge or deploy. This follows the provisional Ember milestone.

Milestone evidence: docs/accessibility-2026-10-27.md. Readable generic choice roster and
height-aware grid framing verified with88unit/72isolated/11browser tests plus full
provenance. No inference or creative-direction change.

## Patter provenance correction

The optional rewrite client ignores a proxy's explicit template/fallback source and
reports LLM generation. Reproduce with a mocked no-key fallback, then preserve source
and fallback reason. Legacy line-only endpoints stay compatible. No runtime model call,
spend or inference change. Continue PR3 with a separate small commit, not another PR.

## Free static deployment (GitHub Pages)

Static build of the web app deploys from `main` with `.github/workflows/pages.yml` to
https://vizdumb2005.github.io/L.O.K.I/ . No server: the optional `/api/patter` proxy is
absent there, so the show uses its built-in template lines (labelled as such). Camera
lab falls back to the public MediaPipe CDN. Free only; no paid hosting or secrets.
