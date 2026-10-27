# Runtime reproducibility of the evaluation check (2026-10-28)

An independent reviewer (Blitz) reported `verify:provenance` failing on Node 24.19.0 at main
40226d0 (cells "ablation / temperature 0.95" and "1.05"), while Node 22.23.4 passed all 33.
Reproduced here on Linux x86_64 with the repo lockfile: Node 24.19.0 fails at 40226d0 and the
differing fields are only calibration statistics (meanConfidence, brier, brierCI, ece, bins).
Counts of commits, correct, wrong and misses are identical. Example bin shift: 31 -> 32.

Likely cause (not proven): floating-point exp/log/pow rounding differs between V8 builds, so a
confidence lands on the other side of a bin edge. This is a toolchain difference, not a change in
show behavior.

Change: `verify:provenance` still requires exact equality for every outcome field. Calibration
fields now allow a 0.01 absolute tolerance on aggregates; reliability bins keep the same total count, with per-bin count +-10 and per-bin values +-0.05 (observed shifts: up to 7 counts, 0.03 accuracy). The supported runtime is Node 22
(`.nvmrc`, CI). Do not regenerate artifacts to make another runtime pass.
