# Ember: multi-option probes (2026-10-28)

Ember Words had three yes/no spelling probes and a 3-question budget. Two multi-option
probes were added ("starts with S, M, C or F", "3, 4, 5 or 6 letters"); the old three remain.
Unchanged: commitThreshold 0.85, epsilon 0.10, outlierWeight 0.06, temperature 1, maxProbes 3.
Ember is still a spelling-based plugin proof, not a settled creative direction.

Coding route: first patch from OpenCode 1.19.4 (separate npm install, exact free
`opencode/deepseek-v4.1-flash-free`, `max`, cost 0). Evaluation, e2e update and docs done independently.

| Condition (greedy, 10% answer error, 1,000 runs) | Commits | Wrong |
|---|---:|---:|
| Primary seed before | 739 | 20 |
| Primary seed now | 953 | 2 |
| Held-out seed before | 769 | 31 |
| Held-out seed now | 958 | 10 |

Held-out wrong over all runs is now 1.0%, under the 3% gate. Simulator noise is independent per
answer; real spelling/reading errors are correlated. 0 human participants. Pre-change artifacts:
`data/provenance/pre-ember-multiway-db2af3f/`. Card numbers are unchanged (747/13, 754/19).
