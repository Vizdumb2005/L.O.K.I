# Runtime reproducibility of the evaluation check (2026-10-28)

An independent reviewer (Blitz) reported `verify:provenance` failing on Node 24.19.0 at main
40226d0 (cells "ablation / temperature 0.95" and "1.05"), while Node 22.23.4 passed all 33.
Reproduced here on Linux x86_64 with the repo lockfile: Node 24.19.0 fails at 40226d0 and the
differing fields are only calibration statistics (meanConfidence, brier, brierCI, ece, bins).
Counts of commits, correct, wrong and misses are identical. Example bin shift: 31 -> 32.

Likely cause (not proven): floating-point exp/log/pow rounding differs between V8 builds, so a
confidence lands on the other side of a bin edge. This is a toolchain difference, not a change in
show behavior.

Change (revised after review): `npm run verify:provenance` stays EXACT for every cell and
every metadata field; the supported runtime is Node 22 (`.nvmrc`, CI). On a different runtime that
fails only on calibration floats it still fails, but says so. A separate diagnostic,
`npm run verify:provenance:cross-runtime`, keeps outcome fields exact and allows only bounded drift in
calibration fields, and labels each such cell "NOT exact". It never replaces the exact check.

Bounds come from observed Node 22 vs 24 drift on cells 31-32: aggregates up to 0.0038 (bound 0.01);
reliability-bin counts up to 7 (bound +-10) with the bin total unchanged; bin values up to
0.03 (bound 0.05). Headroom is 1.4x to 2.6x, so it is not a wide pass.

Checks run (Node 22 and Node 24.19.0, Linux x86_64): exact passes on both for current main; exact
fails on Node 24 at 40226d0 as reported; cross-runtime passes there; Node 22 exact passes at 40226d0.
Negative controls under cross-runtime all fail: +1 wrong, ece +0.02, meanConfidence +0.02,
brier +0.02, a bin count +20, bin accuracy +0.1, and a bin count shifted without keeping the total.
Cause (float rounding moving a confidence across a bin edge) remains a hypothesis. Do not regenerate
artifacts to make another runtime pass.
