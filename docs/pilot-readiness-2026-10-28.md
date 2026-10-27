# Pilot readiness (2026-10-28)

State: main 4eddfe4, live at https://vizdumb2005.github.io/L.O.K.I/ (GitHub Pages, free,
static; no LLM proxy, template lines only). Card and Ember both use multi-option probes.
Simulated, independent-noise results (10% answer error, 1,000 runs):

| Effect | Seed | Commits | Wrong |
|---|---|---:|---:|
| Card | primary / held-out | 747 / 754 | 13 / 19 |
| Ember | primary / held-out | 953 / 958 | 2 / 10 |

These are simulation only. Nothing here is human accuracy.

## What software work is finished
Engine, two effects through one contract, honest abstention, consent gate, camera
lifecycle, accessible choice roster, free static deployment, CI (lint, types, unit, e2e,
33-cell provenance), per-change independent evidence docs.

## What only people and devices can settle
1. Human pilot (docs/pilot-protocol.md): real error rates, correlated mistakes (misread
   suits, jokes, deliberate misleading), whether the reveal feels like magic. 0 participants so far.
2. Calibration with human data: replace the independent-noise assumption; re-tune only then.
3. Real devices: Safari/iOS, Android, screen readers, low-end GPUs for the 3D stage.
4. Camera/gaze: stays out of inference until validated on real laptops/phones.
5. Creative direction: Ember is a spelling-based plugin proof; a better effect is a
   product decision, not something simulation can pick.
6. Optional LLM patter proxy is not deployed (needs a server and keys; free-only so far).
7. Merge rule in force: current-head Kilo review plus all checks, per the owner's instruction.
