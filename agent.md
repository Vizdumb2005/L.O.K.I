# agent.md — rules for anyone (human or AI) working on LOKI

## Prime directive

Build an honest, consent-based **mentalism illusion**. Never claim or imply real mind
reading, lie detection, emotion reading, or diagnosis. When a claim and the evidence
disagree, the evidence wins.

## Order of work

1. Research before code. Record question, source URL, actual finding, design impact, and
   confidence in `docs/research.md`.
2. Planning docs (`task.md`, `architecture.md`, `agent.md`) before product code.
3. Engine + simulator with tests before UI polish.
4. Never polish before the engine passes evaluation.
5. Commit small. Run the gates on every commit.

## Forbidden

- Copying code from `github.com/Vizdumb2005/LOKI`. This build has not read that repository.
  If a future agent reads it, they must disclose exactly what and why in `docs/lessons.md`.
- Hard elimination in the shipped engine. Soft likelihoods only.
- Committing API keys, `.env`, tokens, or camera data.
- Uploading, recording, or storing camera frames/audio.
- Fake telemetry, fake "brain" meters, or probability bars presented as mind reading.
- Claims: "world's first", "guaranteed", "100%", "98%", "reads minds", "lie detector",
  "emotion reading", "diagnosis", "psychic", "telepathy".
- Quoting a study-specific rate as a product guarantee.
- Making SAM 3.1 a gaze estimator.
- Adding paid dependencies or default API spend.
- Tuning the demo or evaluation to a known spectator.
- Fabricating human participants, hit rates, or screenshots.
- Adding effects beyond card + the tiny toy effect.

## Required language

- UI, README, and docs say **illusion** and **mentalism**.
- Results say **simulated**, with N, seeds, conditions, and 95% intervals.
- Human pilot: if none, write **0 participants** and ship the protocol instead.
- Camera: "optional, processed locally in your browser, never uploaded, never stored."
- A miss is called a win for the spectator, not a failure to hide.

## Architecture boundaries

- `packages/effect-api`, `engine`, `perception`, `showrunner`, `sim` are core. They must
  not import `effects/*` or `@loki/effect-*`.
- Core vocabulary: hypothesis, probe, evidence, belief, beat, claim. No card/suit/rank.
- Effects may import core. Core may not import effects.
- Presentation cannot write belief state. It renders a session view.
- Perception adapters emit generic `Evidence`. They do not know about items.
- The showrunner may call the engine; the engine never calls the showrunner.
- No speculative plugin registry or config DSL.

## Test gates (must pass before a commit is called done)

```bash
npm run lint
npm run typecheck
npm test
npm run test:core
npm run build
npm run verify:isolation
```

Playwright before UI commits:

```bash
npm run test:e2e
```

Evaluation before release:

```bash
npm run eval
npm run eval:report
```

Gates are not advisory. If a gate is slow, optimise the gate, not the truth.

## Commit style

Conventional-ish, imperative, scoped:

```
feat(engine): add soft likelihood mixture
test(showrunner): cover contradiction recovery
fix(web): release camera on route change
docs(eval): report 95% intervals
```

One logical change per commit. No generated `dist/`, no `node_modules/`, no secrets, no
large model binaries unless explicitly licensed and necessary. Screenshots are committed
only when they are evidence, and they must be inspected.

## Evaluation honesty

- Every cell ≥1000 runs, fixed seeds recorded.
- Report accuracy, mean probes, wrong-confident-reveal rate, Brier/ECE, 95% CIs.
- Separate "all runs" from "committed runs" for wrong-confident rate.
- Report ablations in one table. State which experiments were kept and dropped.
- Simulator numbers are never described as human results.
- If gaze/force does not beat the baseline, disable it and say so.
- Wrong-confident reveals are worse than misses. Prefer abstention.
- Calibration is measured, not asserted.

## Privacy and consent

- Camera only after an explicit click; visible indicator; release on stop, error, route
  change, or show end.
- No frames leave the tab. No storage. No analytics.
- Evidence logs contain categorical events only.
- The spectator can stop at any time; the UI must make that obvious.
- The consent screen explains the illusion in one plain sentence.

## Accessibility

- Keyboard path for every action; visible focus.
- Captions for every spoken line (`aria-live`).
- Sound opt-in, never required.
- `prefers-reduced-motion` respected in CSS and 3D.
- Contrast checked; no meaning conveyed by color alone.
- Mobile no-camera flow works at 360 px width.

## Research rules

- Re-open sources; do not trust the prompt.
- Record sample size, conditions, and limitations.
- Distinguish "not found" from "does not exist".
- Mark unresolved items `[UNRESOLVED]` with a fallback.
- No source, no claim.

## Deadline discipline

- Official: 2026-11-05 02:00 UTC.
- Internal: 2026-11-03 18:00 UTC.
- Final day is buffer only. Do not start features.
- Cut order: extra effects → LLM → forces → gaze → visual extras. Never cut tests,
  contract, miss path, consent, or eval.

## Definition of done

A stranger can clone the repo, run `npm install && npm test && npm run build`, read the
limits, run the simulator, and get the same numbers. The demo shows a hit and, if it
happens, a graceful miss. No claim outruns the measurement.


## Repository cleanup and audit (2026-10-27)

User-requested scope: separate accidental BrowserOS/MCP installation files from the
product, preserve external browser access, and fix verified defects without a redesign.
Plan: remove only unused harness copies; ignore local installations; add camera
cancellation regressions; audit fallback/validation/export boundaries; run local gates.
The domain-neutral engine and effects remain intact. No paid calls or deployment.


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

Current bounded accessibility work: keep silent choice accessible without asking users
to click their chosen item. Use generic stage labels, not effect-specific imports.

Milestone evidence: docs/accessibility-2026-10-27.md. Readable generic choice roster and
height-aware grid framing verified with88unit/72isolated/11browser tests plus full
provenance. No inference or creative-direction change.
