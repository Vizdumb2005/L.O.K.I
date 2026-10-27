# Card: multi-option probes (2026-10-28)

The card effect had only yes/no probes, so six questions often could not reach the
0.96 commit threshold (about half of simulated shows ended in an honest miss).
The probe contract already supports multi-option questions, so two were added:
"Which suit?" (3 options) and "Which value?" (4 options). The binary probes remain as
verification and recovery questions.

Unchanged: commitThreshold 0.96, epsilon 0.10, outlierWeight 0.06, temperature 1,
maxProbes 6, recovery settings, the inference core and the safety rules.

Coding route: first patch from OpenCode 1.19.4 (separate npm install, exact free
`opencode/deepseek-v4.1-flash-free`, `max` variant, recorded cost 0). Evaluation,
regression run, pixel check and documentation were done independently.

## Simulated results (1,000 runs per cell, greedy policy)

| Condition | Commits before | Wrong before | Commits now | Wrong now |
|---|---:|---:|---:|---:|
| Primary seed, 10% answer error | 496 | 6 | 747 | 13 |
| Held-out seed, 10% answer error | 483 | 11 | 754 | 19 |

Commit rate rises about 50%. Wrong reveals also rise (1.3% of all runs primary, 1.9%
held-out; 1.7% and 2.5% of commits). The shipping gates (under 3% wrong over all runs,
under 10% of commits) still pass, with less margin. Pre-change artifacts are kept in
`data/provenance/pre-card-multiway-40226d0/`. The simulator uses independent per-answer
noise; real people make correlated mistakes (for example misreading a suit), so these
numbers are not human accuracy. 0 human participants. No camera or device validation.

Visual check: mobile (390x844) question screen shows the 4-option value question with
all choices readable.
