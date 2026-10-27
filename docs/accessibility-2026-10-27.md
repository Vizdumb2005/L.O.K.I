# Silent-choice accessibility and grid framing

Base: PR #2 head 2ff078bc946d614c5b3a18e287fd30d3e2dff6ff. A bounded follow-on,
not a merge, deployment or new creative direction for the provisional Ember toy.

## Defects and correction

The 3D stage was decorative/aria-hidden and the silent-choice caption did not enumerate
its items. Screen-reader users could not discover the available choices. On narrow
screens, labels rendered inside the decorative textures were too small to read.

The think phase now exposes a semantic HTML list of generic `StageSpec.items`, with
16px labels and decorative glyphs hidden from assistive technology. There are no item
buttons, focus targets, selected states, handlers or captured choice. It disappears when
the spectator says "I have chosen", before any question. The theatrical 3D stage remains.
The roster follows the same shuffled order. On mobile it is a two-column list and makes
the initial screen longer: this is a readability tradeoff, not a condensed performance.
The primary continue control and keyboard path remain unchanged.

Pixel review also caught top-row cards clipped in the desktop twelve-card grid when
reduced motion was active. The camera now always aims at the stage center; reduced
motion only disables camera drift. Grid scale also respects the current frustum height
and number of rows rather than desktop width alone. Projected-corner tests cover short
desktop and mobile canvases. Revealed-item centering from PR #2 is preserved.

## Evidence

OpenCode was reused from its separate npm installation, exact
`opencode/deepseek-v4.1-flash-free`, native max reasoning variant. It wrote the initial
HTML/CSS correction, then independent review retained the camera-unavailable status
semantics, added Safari-safe explicit list role, browser checks and framing tests.
No OpenCode files or runtime dependency were added to the project. Completed coding
steps reported cost 0. No paid fallback, billing, runtime model or credential exposure.

- Lint/typecheck/build, 88 unit tests, 72 isolated-core tests: pass.
- 11 browser behavioral tests: pass, including both effects' mobile label count,
  16px size, no horizontal overflow, no choice controls/state, and removal after choosing.
- Full 33-cell provenance reproduces. No inference/effect/simulator artifacts changed.
- Inspected actual desktop twelve-card and mobile card/word choice pixels after fixes:
  complete grid inside the canvas; readable roster; no horizontal clipping.
- No real screen-reader/device test, Safari or physical camera validation. This establishes
  accessible semantics and browser layout, not a complete accessibility conformance claim.
- 0 human participants. Existing simulation/Ember limitations from PR #2 remain unchanged.

## Follow-on: truthful optional patter provenance

A mocked response reproduced a client defect: a proxy reply explicitly marked
`source: "template", reason: "no-key"` was returned as `source: "llm"`, causing the
UI to claim proxy generation when it was using an offline fallback. The client now
preserves explicit safe source/reason fields, rejects unknown source values and
malformed/null payloads, and retains legacy line-only endpoint compatibility.
Unsafe lines still fall back. OpenCode's same separate free/max route produced the
initial correction; independent tests cover explicit fallback, generated/legacy,
unknown/malformed and unsafe cases. No actual runtime model endpoint was called.

The new regression fails on the old client and passes on the corrected client.
Updated local gates: 90 unit tests, 74 isolated-core tests, 11 browser tests and full
33-cell provenance pass. No inference/effect/evaluation changes. This is a separate
small commit on the existing PR #3, not another inclusive pull request.

## Merge-review boundary correction

Kilo's older PR #1 review flagged inconsistent alphabet-size handling. The quoted
zero-option division is blocked by unknown-option validation, and normal sessions
already validate >=2options. Direct engine API calls with one-option probes were not
explicitly rejected, however. Both likelihood and answer-update entry points now
reject fewer than two options before calculation. The new boundary regression fails
on the prior implementation and passes after. Valid effects' probabilities and all
33 evaluation cells are unchanged. The merge still awaits fresh exact-head Kilo and
CI; the user's conditional merge authorization, not the bot's recommendation, governs.
