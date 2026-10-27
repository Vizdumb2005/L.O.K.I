# Design notes — Nocturne Observatory

LOKI is a short, one-spectator performance. The design goal is not to look like a chatbot
or a dashboard. It should feel like a small room built for one trick: dark, warm, precise,
and honest at the edges.

## 1. Experience principles

1. **One decision at a time.** The show has one primary action per beat. Choosing,
   answering, revealing, and leaving are never mixed into a wall of controls.
2. **The stage carries the drama; the copy carries the truth.** The 3D room is decorative
   and marked as such for assistive technology. Captions and the consent copy do the
   ethical work.
3. **The spectator has agency.** They can lie, stop, skip the camera, or leave. The show
   never asks them to click their chosen card, which would turn mentalism into a form.
4. **A miss is designed.** The honest ending is not an error screen. It is a beat: “You
   beat me. The choice stays yours.”
5. **No fake instrumentation.** We do not show a fake brain scan, a “confidence” percentage
   that implies certainty, or a gaze waveform that does not exist. The camera lab labels its
   output uncalibrated and its gate closed.

## 2. User journey

### Consent

The opening screen is a two-column composition: a large wordmark and a short promise on the
left; a consent panel and effect picker on the right. The primary button is disabled until
the illusion disclosure is checked. Camera opt-in is a separate, unchecked box. The screen
says “No account is required. Nothing is uploaded.”

### The show

The stage is a 4×3 (or 2×2 for the toy) arrangement of cards on a brass observatory table,
under a dark green sky with a dust field. Cards float a few pixels, lit by a warm key and a
cool rim. The camera drifts slowly unless reduced motion is requested. The table is
deliberately shallow: the spectator should feel a physical arrangement, not a menu.

The control panel below the stage holds the current line, the answer choices, and one
primary action. Progress is a row of small brass dots, not a percentage. We never show the
posterior or an accuracy estimate during the show: that would turn a performance into a
telemetry dashboard and invite false precision.

### The reveal

The chosen card lifts toward the camera and the others dim. The line is delivered by the
effect, sanitized by the showrunner. If the engine cannot commit, the cards dim and the miss
line appears. The afterglow states the frame again: “You chose it. I only narrowed the
room.”

### The camera lab

The lab is a separate screen with a large local preview, a visible live badge, and a
diagnostics column. It is framed as an experiment, not a feature. The gate card is a hard
red “CLOSED.” The lab can show face presence, luma, raw iris displacement, frames, and FPS.
It does not display a confident gaze zone because this build has no calibrated, validated
mapping.

## 3. Visual system

- **Palette:** near-black green (`#07110f`), deep green surfaces (`#0b1a17`), warm paper
  (`#efe3cc`), brass (`#d8b877`), muted sage (`#93a8a1`), and a rust accent used only for
  warnings and the live camera dot.
- **Type:** an old-style serif for the wordmark, stage lines, and effect titles; a mono for
  labels, telemetry, and legal asides; a humanist sans for body copy. No external font
  requests, so the app remains offline-friendly.
- **Texture:** CSS grain and a soft vignette over the WebGL canvas give the stage a print
  quality without adding image assets.
- **Cards:** generated at runtime as canvas textures. Cream stock, a thin double rule,
  large suit/word glyph, small “NO. 0x” mark, and a faint horizontal grain. This keeps the
  repo asset-free and makes the toy effect possible without new art.
- **Motion:** slow camera drift, card breathing, a pulsing table ring, and a lift on reveal.
  All motion is decorative and stops under `prefers-reduced-motion`.

## 4. Stage implementation

`apps/web/src/components/Stage.tsx`

- React Three Fiber `<Canvas>` with a single `<Scene>`.
- Cards are a thin box with a canvas-texture face plane. The texture is generated from the
  effect's `StageItem` label/glyph, so the stage is effect-agnostic.
- Layout uses `stage.columns` and item count; 12 cards become 4×3, 4 words become 2×2.
- A `useFrame` loop interpolates position, scale, rotation, and face opacity. The revealed
  card lifts to `z + 2.1`, scales to 1.18, and gets a gold backing plane; others drop to 28%
  opacity.
- A ring, pedestal, 260-point dust field, warm key light, teal rim, and fog build the room.
- Responsive scale is derived from canvas width. The layout is centered and fits a 390 px
  viewport without horizontal scrolling.
- A React error boundary falls back to a flat HTML card grid if WebGL fails. The stage
  wrapper is `aria-hidden`; captions and controls carry the accessible experience.

## 5. State machine and copy

The UI renders the existing `PerformanceSession` public view. It does not duplicate the
belief logic.

| Phase | What the spectator sees | Primary action |
|---|---|---|
| `think` | “Choose one card. Do not say it…” | “I have chosen” |
| `probe` | One question + Yes/No | 1/2 or click |
| `recover` | Contradiction line | “One clean question” |
| `build` | Build line | “Reveal it” |
| `reveal` | The card + reveal line | “Continue” |
| `miss` | Honest miss line | “Continue” |
| `afterglow` | Frame restored | “Begin again” / “Leave the room” |

Copy rules:

- Always “illusion,” “performance,” “mentalism,” “guess,” “narrowed.”
- Never “read your mind,” “detect lies,” “emotion reading,” “diagnosis,” “guaranteed,”
  “100%,” “world-first.”
- A miss is playful, not punitive: “You beat me. The choice stays yours.”
- The probe note says: “Answer honestly, or not. There is no penalty for misleading me.”

Every line passes `sanitizeLine` (length, newline, URL, braces, banned-claim filter).

## 6. Accessibility

- Semantic landmarks (`header`, `nav`, `main`, `footer`), one `h1` per screen.
- Skip link to `#main`.
- Captions are always visible and marked `aria-live="polite"`.
- The question/answer group is labelled; buttons are real buttons.
- Keyboard: `1`/`2` or `Y` answers; `Space`/`Enter` advances; `Tab` reaches every control.
  The global shortcut ignores events originating in a control so it does not double-fire.
- Focus moves to the primary action after a beat change, with `preventScroll`.
- The 3D canvas is decorative; the same information is in the caption and the card labels in
  the effect's stage data.
- Reduced motion: OS preference is detected on load and can be toggled in the show header;
  CSS transitions and the R3F drift/float stop.
- Color is never the only signal: the selected effect has a border, the live camera has a
  text badge plus a dot, and the gate says “CLOSED” in words.
- Contrast: cream on near-black, gold on dark, and muted sage on dark are checked visually;
  the rust warning is paired with text.

## 7. Responsive behavior

- Desktop: consent is two columns, performance panel is copy + actions, stage is up to
  560 px tall.
- Tablet: consent stacks; panel stacks; stage remains 3D.
- Mobile (≤720 px): header compresses, nav loses the camera label, stage is 300–420 px,
  buttons become full-width, footer stacks. The mobile screenshot is captured at
  390×844.
- No horizontal scroll; stage canvas is absolutely sized to its shell.

## 8. Camera lab design

- One explicit “Open camera lab” button. No autoplay.
- Live badge + red dot while active; a stop button remains visible.
- The raw iris reticle is drawn on the mirrored canvas with the label “RAW IRIS SIGNAL ·
  UNCALIBRATED.” It is intentionally not framed as a gaze cursor.
- Diagnostics show what is actually measured: face detected, luma, raw iris side, frames,
  FPS. They do not show a fake confidence score.
- The gate card explains why the show ignores the camera: no calibration baseline, no human
  validation, iris landmarks are not gaze ground truth.
- The glasses checkbox changes the copy only; it does not silently boost or lower a score.
- On error, the placeholder returns with an explicit message that the show works without
  the camera.
- The lab prefers local MediaPipe assets; otherwise it fetches the model/WASM from a public
  CDN. No frame data is part of those requests.

## 9. Optional LLM patter

- Off by default; the toggle is labelled “Patter off” / “Proxy patter.”
- Only `build` and `afterglow` lines are eligible. Questions and reveals are never rewritten.
- The local proxy sends a short prompt/template; the response is filtered again on the
  client by `sanitizeLine`.
- The UI shows “Optional proxy patter · filtered” or “Bundled patter · offline fallback.”
- If the proxy is not running, the request fails closed; the performance is unchanged.

## 10. Rejected design alternatives

| Alternative | Why not |
|---|---|
| 52-card deck | Longer probe path; adjacent cards are below credible gaze resolution; 12 cards is enough for a measured proof. |
| Click your card | Destroys the mentalism premise and adds a selection log we do not need. |
| Gaze in the show | No human validation; browser error is too large; the gate stays closed. |
| Force by default | The simulation prior shift is not evidence that a force works; keep it off and log tests. |
| Confidence percentage on stage | Invites false precision and a “mind-reading” reading. The engine’s numbers stay internal. |
| Chat-style transcript | Makes the show feel like a quiz bot and leaks the probe structure. One beat at a time is stronger. |
| Voice input | Adds permissions, noise, and accessibility failure modes without improving the proof. |
| Always-on AI patter | Cost, latency, safety surface, and a weaker default. Bundled lines are the product. |

## 11. Screenshots

- `docs/screenshots/consent-desktop.png`
- `docs/screenshots/stage-desktop.png`
- `docs/screenshots/reveal-desktop.png`
- `docs/screenshots/consent-mobile.png`
- `docs/screenshots/stage-mobile.png`

Captured with Playwright at 1440×1000 and 390×844. The camera lab screenshot is optional
because a real camera is not available in the build environment.

The build container has no usable WebGL: Chromium, Firefox, and headed Chromium under
Xvfb all lose or refuse the GL context, including for a minimal Three.js cube. The app
therefore captured its **flat-stage fallback** (the same `FlatStage` component used after
a WebGL context loss or a render error). This is a limitation of the capture environment,
not a mock-up; `docs/screenshots/stage-desktop.png` is exactly what the shipping build
renders when WebGL is unavailable. The 3D path is exercised by types, build, and component
review, but it could not be visually verified here; see `[UNRESOLVED]` in
`docs/lessons.md`.
