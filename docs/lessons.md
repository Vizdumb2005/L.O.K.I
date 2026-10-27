# Audit correction (2026-10-27)

Earlier evaluation claims below describe the old math. The audit corrected noise from
hypothesis count to observation-alphabet size and aligned policy entropy with update
temperature. Current results: 496 card commits, 490 correct, 6 wrong per 1,000 synthetic
runs. Ember abstains with its unchanged threshold. See `audit-2026-10-27.md` and the
generated report for current evidence. Historical notes below are not current metrics.

---

# Lessons — what worked, what did not, and what I would do next

This is a build log, not a victory lap. The numbers are from
`data/eval-results.json` and the automated tests. Human participants: **0**.

## 1. Process lessons

### Research before code was worth it

The strongest design decisions came from reading the noisy-20-questions literature and the
browser-gaze error studies before writing the engine:

- Entropy-greedy is optimal for a known noise channel, but the human channel is unknown.
  That is why the shipping path is soft, with an outlier mixture and a recovery probe,
  rather than a hard elimination tree.
- Browser gaze error ranges from 4.17° in the 2016 WebGazer work to 10.3–13.6° in a 2026
  head-still study. Cards are too small for that error. Gaze became a lab, not a feature.
- A force is a modest, context-dependent influence, not a guarantee. Default off.

The research log is in `docs/research.md`, with sources and confidence, not just
conclusions.

### The simulator paid for itself before the UI existed

33,000 seeded runs across cells exposed the failure mode that matters: a system that
commits confidently under noise. The hard-elimination ablation was wrong on 47.9% of all
runs. Without that stress test, the demo could have looked clever and behaved dishonestly.

### The second effect found a real contract issue

The toy was initially “eight words, three questions” in the copy, but had six probes and
overlapping features. It passed validation while the copy lied. Fixing it to four words and
three orthogonal questions made the contract test clearer and exposed how easy it is to let
effect copy drift from the actual probe bank. The UI now reads the effect's own title and
stage metadata; the copy fix is in `effects/_example`.

### A miss is a feature, and it is harder to design than a hit

The graceful miss is the most important trust surface. It needs a line that is playful,
non-punitive, and unambiguous about the illusion. The showrunner's `miss()` path and the
“You beat me” copy were tested before the 3D stage. If the reveal is the only polished
state, the product is dishonest.

## 2. Technical lessons

### Log-domain belief + outlier mixture is the right core

- Soft likelihoods with `epsilon = 0.10` and `outlierWeight = 0.06` keep the posterior from
  collapsing on one contradictory answer.
- Contradiction detection uses surprise (`-ln p`) and a consecutive-surprise rule; recovery
  spends one probe. The recovery path is exercised in tests and in the simulator.
- Hard elimination is kept only as an ablation. It is not a config switch the app can use.

### Greedy earned its place, but not by a landslide

Median/bisection was identical to greedy on this 12-card probe bank (356 commits, 15 wrong
at 15% answer error). The fixed order never reached the shipping gate (`0` commits at 15%).
Greedy ships because it is simpler to explain and test, not because it is universally
optimal. The literature's optimality conditions do not generalise to a 2-D card set.

### Threshold tuning is a safety decision, not a UX preference

The card ships at `maxProbes = 6`, `tau = 0.96`. The brief's example was `maxProbes = 5`;
the measured shipping config uses six because the extra probe buys gate margin at the
nominal noise level. This is documented rather than silently changed. At 10% error:
517 commits, 8 wrong, 509 correct among commits, 1.5% of commits wrong, 0.8% of all runs wrong. At 30% error the gate
fails (5.1% wrong-all), and the report says so; that condition is outside the shipping
envelope.

### Gaze simulation is seductive and not evidence

Gaze-on ablation improved the numbers (604 commits, 13 wrong, 97.8% committed accuracy),
but the simulator was told the gaze reliability and zone. That is a mechanical upper bound.
It does not show that MediaPipe iris landmarks on a laptop webcam can hit those zones. The
camera lab therefore shows a raw, uncalibrated signal and a hard “CLOSED” gate. This was the
right call even though it makes the demo less flashy.

### Forces are easy to implement and hard to justify

The force is a logged prior shift toward 3♦. The simulator can show a modest difference; it
cannot show that a psychological force works on a person. Default off, documented as an
unvalidated prior. The code path remains for tests and future research.

### Build/tooling surprises

- The root `node_modules/three` was an incomplete leftover; Vite resolved it from the
  hoisted `@react-three/fiber` before the workspace copy. The fix was an explicit `three`
  alias and `dedupe` in `apps/web/vite.config.ts`. Lesson: pin and verify the actual
  resolved package, not just the manifest.
- TypeScript narrows a getter across method calls in tests. `session.phaseName` stayed
  narrowed to `"recover"` after `advance()`. Reading `session.snapshot().phase` fixed the
  test. Lesson: do not rely on getter narrowing when a method mutates state.
- Playwright's browser needs system libraries. The environment's apt mirror was slow and
  the default `install-deps` path hung; `Acquire::ForceIPv4=true` plus an explicit package
  list was the workaround. A different Debian mirror (`mirror.leaseweb.com`) was fast enough
  to finish the install. This is an environment issue, not a product dependency.
- Headless WebGL is unusable in this container. Chromium (headless and headed under Xvfb),
  Firefox, and a minimal Three.js cube all lose or refuse a GL context; it is not the app’s
  scene. The app now listens for `webglcontextlost` and swaps to the flat stage, in addition
  to the React error boundary. The screenshots therefore show the flat fallback. The 3D
  path is typechecked and built, but could not be visually verified here.
- The Playwright flow initially looped on the first answer and missed the recovery button.
  Driving the primary action slot, rather than matching one label, fixed the test. The
  screenshot run now uses deterministic Three of Diamonds answers so a correct reveal is
  reproducible instead of depending on a lucky miss.
- The MediaPipe bundle is loaded only when the camera lab opens, so the default show bundle
  does not pay for vision code. The main Three.js chunk is still large (~338 KiB gzip);
  acceptable for a 3D demo, and a candidate for a future split.

## 3. Product lessons

- **Consent is a design surface, not a checkbox.** The camera opt-in is separate, unchecked,
  and explains local processing. The show cannot open the camera. The lab has its own
  explicit action and stop control.
- **Do not show the posterior.** Early UI sketches had a “confidence” meter. It invites
  false precision and makes the performance feel like a classifier demo. Progress dots and
  the stage carry the tension instead.
- **The 3D stage needs a flat fallback.** WebGL can fail on low-end devices or after a
  context loss. The error boundary and the `webglcontextlost` listener both keep the card
  layout and the show usable. This is not decorative: the build container exercised the
  fallback on every browser engine.
- **Use generated card textures.** No external art, no asset licensing, and the toy effect
  inherits the stage automatically. The cost is a runtime canvas draw per card, which is
  small at 12 items.
- **The toy effect should be small and honest.** It is labelled “platform test,” not a
  second product. Its lower accuracy under noise is reported rather than hidden.

## 4. What was dropped, with numbers

| Dropped | Evidence | Decision |
|---|---|---|
| Hard elimination | 1,000/1,000 commits, 479 wrong, 47.9% of all runs | Never ship |
| No outlier mixture | 411 commits, 20 wrong, 1.3% all-runs wrong, worse ECE | Keep outlier |
| Fixed probe order | 0 card commits at 15% error | Not shipping |
| Median policy | Identical to greedy on this bank | Keep as challenger only |
| Gaze in show | Simulated only; no human calibration; 4.17°–13.6° literature | Lab only |
| Force default-on | Prior shift only; no human evidence | Off |
| Temperature 0.95 | 465 commits, 38 wrong (8.2% of commits) | Rejected |
| Temperature 1.05 | 215 commits, 12 wrong; fewer commits, no accuracy gain | Rejected |
| 52-card deck | Probe length, gaze resolution, scope | Roadmap |
| Voice input | Permissions/noise without proof value | Roadmap |

## 5. What I would do with more time

1. **Run the human pilot** in `docs/ethics.md` / `docs/pilot-protocol.md` with 30–60
   participants, pre-registered, no camera by default. Report answer-error distributions,
   not just synthetic 10%.
2. **Calibrate the camera lab** with a 5/9-point protocol and a held-out set. Only then
   consider a zone-level channel, and only with a gate. The current lab is diagnostics.
3. **Test the physical device matrix**: Safari, low-end Android, phone cameras, 200% text
   zoom, and screen readers. The current screenshots are Chromium at desktop/mobile widths,
   not a device lab.
4. **Add a session replay viewer** over the exported evidence log (already versioned and
   categorical) so a researcher can audit every answer.
5. **Split the Three.js bundle** and add a WebGL capability check before mounting the
   canvas, instead of relying on the error boundary alone.
6. **Run a larger simulator grid** over correlated answer errors, per-probe bias, and
   heterogeneous spectators. The current independent-error model is a floor, not a model
   of people.

## 6. Disclosure

The previous LOKI repository mentioned in the brief was **not read** during this build.
This version was built from the specification and new research. Any overlap with earlier
work is coincidental; the absence of a read is recorded here rather than implying
continuity that did not happen.

## 7. Remaining unresolved items

- Human participants: **0**; no external validity.
- Camera/gaze: unvalidated, default off, gate closed.
- Force: unvalidated, default off.
- Public repo/demo format: `[UNRESOLVED]`.
- Physical devices/Safari: not tested.
- 3D stage: not visually verified on a WebGL-capable machine; all local browser engines
  failed to create or retain a context, even for a minimal Three.js cube. The flat fallback
  is verified by screenshots and e2e.
- LLM proxy: optional, route verified in research, not exercised with a key here; the
  no-key fallback and `/health` endpoint were exercised locally.
- Long sessions, groups, 52 cards, voice, and other effects: out of scope.
