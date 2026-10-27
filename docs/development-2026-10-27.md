# Ember follow-through

Base: audit branch 933909690a037fdab67210bc29588f0ddd4eeb5c. This is a separate
reviewable milestone, not a merge or deployment. The prior audit is retained as history.

## Coding-tool setup

OpenCode 1.19.4 was installed with npm in a separate directory through the terminal.
Its source repository was not cloned. No OpenCode dependency, configuration, credentials
or session logs were added to LOKI. The exact model was
`opencode/deepseek-v4.1-flash-free`, with its catalogue's native `max` variant
(`reasoningEffort=max`). Completed steps reported cost 0; no billing was configured,
no other model was substituted. Initial unbounded max requests were slow, so subsequent
requests kept max reasoning with a bounded output-token budget. OpenCode produced a
probe-design review and a two-file patch. Independent review strengthened its tests,
kept illusion framing, and regenerated the evidence and documentation.

Sources checked 2026-10-27:
- https://opencode.ai/docs/ - npm installation route.
- https://opencode.ai/docs/zen/ - exact free model, limited-time availability and privacy policy.
- https://opencode.ai/docs/models/ - provider/model IDs and variant semantics.

This records one run, not a guarantee that a free endpoint remains available.

## Why the probes changed

The old sky/warm/round questions produced uneven 3-to-1 partitions and subjective
answers. Under corrected observation noise, they could not support the unchanged
0.85 threshold. Replacing them with three objective English-spelling questions gives
three distinct balanced partitions:

| Word | Ends in n | Contains m | Odd letter count |
|---|---|---|---|
| Sun | yes | no | yes |
| Moon | yes | yes | no |
| Comet | no | yes | yes |
| Flower | no | no | no |

Every pair of truth codewords differs in two positions. All four truthful paths now
reach a correct reveal. Every one-answer flip produces an ambiguous pattern and an
honest miss. Two flips can imitate a different word and cause a wrong reveal; this is
explicitly covered, not hidden. All 96 word/policy/answer-pattern combinations are
checked across greedy, median and fixed policies. Partition shape and the unchanged
safety settings have separate regression assertions.

No inference core, card effect or camera code changed. A visual review caught an existing
3D framing bug: revealing a top-row item enlarged it in that slot and clipped it against
the canvas. The shared renderer now brings the selected item to the stage center before
its perspective lift. Two layout regressions cover all shuffled slots and projected
corner bounds at desktop/mobile sizes, with and without reduced motion. Threshold 0.85, epsilon
0.10, outlier mixture 0.06, temperature 1 and the three-question budget remain unchanged.
The toy is now plainly described as a spelling-based illusion/plugin proof. It does
not improve the theatrical card effect or establish human performance.

## Fresh simulated evidence

1,000 runs per cell; primary seed 20261027, held-out seed 99999. Full 33-cell
primary evaluation regenerated and independently reproduced. Pre-change artifacts
are retained under `data/provenance/pre-ember-9339096/`.

| Effect and seed | Commits | Correct | Wrong | Abstentions |
|---|---:|---:|---:|---:|
| Ember primary | 739 | 719 | 20 | 261 |
| Ember held-out | 769 | 738 | 31 | 231 |
| Card primary (unchanged) | 496 | 490 | 6 | 504 |
| Card held-out (unchanged) | 483 | 472 | 11 | 517 |

Ember is not a shipping accuracy pass. Its held-out point wrong rate is 3.1% over all
runs, exceeding the card's 3% target even before confidence intervals. Correlated human
spelling mistakes are not modeled by the simulator's independent per-answer noise.
Card's existing nominal 95% upper-bound gates still pass. Broader stress comparisons
remain CAUTION (the hard-elimination ablation varies by 40 wrong counts).

## Verification and limits

- Lint/typecheck/build, 87 unit tests and 72 isolated-core tests pass.
- All 33 complete provenance cells reproduce.
- Ten browser behavioral tests pass, including all five camera lifecycle regressions.
  The new flow initially raced the effect-updated caption; its answer selection now waits
  for a complete probe caption rather than treating transient text as a question.
- Desktop/mobile reveal pixels were inspected after the framing correction; the selected
  card is fully within the canvas. Small card labels on mobile remain hard to read, while
  the main reveal caption is readable. This is not physical-device validation.
- 0 human participants. No physical camera, Safari or real-device 3D validation.
- Optional runtime LLM patter was not called. The coding model is separate from the app.
- Existing large-bundle warning remains. No paid calls, confidence tuning, deployment,
  merge or public-hosting claim.
