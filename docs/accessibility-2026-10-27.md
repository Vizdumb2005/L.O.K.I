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
