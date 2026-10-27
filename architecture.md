# LOKI v3 — architecture

Status: audit revision, 2026-10-27. Current evidence and limits are in docs/audit-2026-10-27.md. See `docs/handoff.md`. Any evidence-backed change made during the build is
recorded in `docs/lessons.md` and reflected here.

## 1. Shape

LOKI is a one-way pipeline. The performance layer cannot write belief state.

```
consent / calibration
        │
        ▼
SENSING (answers, timing, gaze)  ──►  Evidence{channel, value, probeId?, reliability, t}
        │                                      │
        │                                      ▼
        │                         BELIEF ENGINE (pure, deterministic)
        │                         posterior + reliability + surprise
        │                                      │
        │                                      ▼
        │                         POLICY (probe / commit / recover / abstain)
        │                                      │
        ▼                                      ▼
PRESENTATION (R3F, text, sound)  ◄──  SHOWRUNNER (beats, pacing, fallback)
        ▲                                      │
        └──────────── optional LLM patter ─────┘
                       (text only, filtered)
```

The core is domain-neutral. Words like *card*, *suit*, *rank*, *gaze-zone* exist only in
effect/perception plugins. The core speaks **hypothesis, probe, evidence, belief, beat,
claim**.

## 2. Repository graph

```
apps/web ──► effects/card, effects/_example, showrunner, perception
effects/* ──► effect-api
showrunner ──► effect-api, engine, perception
sim ──► effect-api, engine
perception ──► effect-api, engine
engine ──► effect-api
effect-api ──► (nothing)
```

No arrow points from a core package to an effect. `scripts/verify-core-isolation.mjs`
enforces this by deleting `effects/card`, running core typecheck/tests, and scanning
imports. ESLint's `no-restricted-imports` blocks `effects/*` and `@loki/effect-*` in
`packages/**`.

## 3. Effect contract (the narrowest version two effects need)

The contract is deliberately small. No registry, no config DSL, no lifecycle framework.

```ts
type HypothesisId = string;

interface Hypothesis {
  id: HypothesisId;
  label: string;          // "Ace of Hearts"
  glyph?: string;         // effect-owned display asset ("A♥")
}

interface ProbeOption { id: string; label: string; }

interface Probe {
  id: string;
  prompt: string;         // natural-language question
  options: ProbeOption[];
  cost: number;           // 0..1 reveal cost / social friction
  likelihood(itemId: HypothesisId, optionId: string): number; // P(option | item)
}

interface Evidence {
  channel: string;        // "answer" | "gaze" | "timing" | future
  value: string;
  probeId?: string;
  reliability: number;    // 0..1, adapter-owned
  at: number;             // ms since session start
  meta?: Record<string, string | number | boolean>; // never pixels/frames
}

interface ChannelBinding {
  channel: string;
  label: string;
  weight: number;         // cap on this channel's influence
  minReliability: number; // below this, drop the evidence
  values: string[];       // finite observation alphabet, for simulation
  likelihood(itemId: HypothesisId, observation: Evidence): number;
}

interface StageSpec {
  renderer: "grid";       // one generic renderer; not a plugin registry
  columns: number;
  title: string;
  instructions: string;
  items: Array<{ hypothesisId: HypothesisId; label: string; glyph?: string }>;
  zones?: Array<{ id: string; label: string; x: number; y: number; w: number; h: number }>;
}

interface ShowScript {
  beats: Array<{
    id: string;
    kind: "invite" | "think" | "attune" | "build" | "reveal" | "afterglow";
    line: string;
    when?: "always" | "camera-on" | "camera-off";
  }>;
  buildLines: string[];
  revealLine(item: Hypothesis, confidence: number): string;
  recoverLine: string;
  missLine: string;
}

interface Effect {
  id: string;
  name: string;
  tagline: string;
  config: {
    maxProbes: number;
    commitThreshold: number;
    recoveryBudget: number;
    recoverySurprise: number;
    epsilon: number;       // answer error floor
    outlierWeight: number; // mixture weight
    temperature: number;   // calibration tempering
    costWeight: number;
    gazeEnabledByDefault: boolean;
  };
  hypotheses(): Hypothesis[];
  prior(ctx: { forceEnabled: boolean }): Record<HypothesisId, number>;
  probes(): Probe[];
  channels(): ChannelBinding[];
  script(): ShowScript;
  stage(): StageSpec;
  validate(): void;
}
```

Contracts are runtime-validated (`validateEffect`): unique IDs, complete priors, row
stochastic likelihoods, non-degenerate probes, stage coverage, required beats, sane config.
The same validator is run in each effect's test.

The contract was exercised by the tiny `Ember Words` effect (4 words, 3 attribute probes,
one reveal) before the card effect was polished. It changed two things: (1) `stage()` must
cover every hypothesis or the generic renderer breaks; (2) `revealLine` needs the item and
confidence, not just a string, so a second effect can phrase its own reveal. No card concept
entered the core.

## 4. Belief engine

Pure TypeScript. No DOM, no network, no clock. Arrays over hypothesis IDs.

### 4.1 Representation

- Posterior stored as log-probabilities, normalized with log-sum-exp.
- Full evidence log: prior, each observation, per-observation surprise and posterior
  snapshot. This permits replay and audit.
- Priors from the effect. Default uniform. A force is an explicit, logged prior shift.
- No hard elimination in the shipped path. `hardMode` exists only for the ablation and is
  clearly marked non-shipping.

### 4.2 Answer likelihood

For probe `q`, chosen option `a`, item `h`:

```
raw = q.likelihood(h, a)                       // effect truth table, [0,1]
smoothed = raw*(1-eps) + (1-raw)*eps/(K-1)     // K answer options
mixed = (1-w)*smoothed + w*(1/K)               // uniform over answer options
p(obs|h) = mixed
```

`eps >= 0.05` (card ships 0.10), `w >= 0.02` (card ships 0.06). This survives misclicks,
misremembering, and one deliberate lie. It is the main reliability fix relative to a
single-answer elimination engine.

### 4.3 Gaze likelihood

The adapter emits one aggregated window at a time, never per-frame. The effect's binding
maps the zone to hypotheses:

```
raw = binding.likelihood(h, window)            // zone → item set
p = reliability*raw + (1-reliability)*(1/|values|)
then outlier mixture and channel weight
```

- Reliability comes from calibration residual, face confidence, head pose, eye
  disagreement, and brightness. Floor 0.35; below it, drop and release.
- A single window contributes at most `weight` (card: 0.7); at most two windows per show.
- Adjacent frames are correlated by construction; they are aggregated, never multiplied.
- The effect owns the zone map. The core only sees a categorical observation.

### 4.4 Contradiction and recovery

Before updating, compute the posterior predictive of the observation:

```
pred = Σ_h p(h) * p(obs|h)
surprise = -ln(pred)
```

- `surprise ≥ config.recoverySurprise` or two consecutive `surprise ≥ 2.0` enters
  `RECOVER`.
- `RECOVER` asks one disambiguating probe chosen for information gain (cost ignored).
- After recovery, commit only if the gate is met; otherwise abstain with the honest miss.
- The gate is `maxPosterior ≥ tau` **and** no unresolved contradiction **and** at least
  two probes answered. Gaze alone cannot trigger a commit.
- Exhausting `maxProbes` never triggers a reveal by itself.

### 4.5 Calibration

- Temperature scaling `p^(1/T)` after each update; `T` tuned on simulation (and pilot when
  available), not on the demo.
- Multiclass Brier, top-label reliability bins, ECE, and 95% bootstrap CIs are computed by
  `packages/engine/src/calibration.ts` and the simulator.
- If calibration is poor, the report says so. We do not hide an over-confident result.

### 4.6 Policies

| ID | Rule | Role |
|---|---|---|
| `greedy` | minimise expected posterior entropy + `costWeight * cost` | shipping candidate |
| `median` | choose the probe whose partition mass is closest to 0.5 (multi-option: minimise max group mass), tie-break entropy | challenger B |
| `fixed` | effect order, no adaptation | control C |

All use the same soft likelihood and the same stop/recovery rules so the comparison is
fair. The chosen policy is the one that wins the simulator on wrong-confident rate first,
accuracy second, mean probes third. If `median` or `fixed` does not beat `greedy`, greedy
ships. Results and the decision are in `docs/eval-report.md`.

## 5. Showrunner

A deterministic state machine, not a chatbot.

```
INVITE → THINK → [ATTUNE] → PROBE* → BUILD → REVEAL → AFTERGLOW → DONE
                         ↘ RECOVER → (BUILD|MISS) ↗
                         ↘ MISS ─────────────────┘
```

- `Invite`: consent, illusion framing, camera explanation if offered.
- `Think`: spectator chooses silently; no input captured.
- `Attune`: only when a validated camera channel is enabled. Skipped otherwise.
- `Probe`: one question at a time; answers are evidence, not commands.
- `Build`: specific-then-general line only if posterior supports it; no probability bars.
- `Reveal`: item + confidence; dramatic but short.
- `Recover`: one disambiguating probe, honest line ("two signals fighting").
- `Miss`: playful "you beat me", no false reveal.
- `Afterglow`: memorable close, no method explanation.

The showrunner owns no effect vocabulary. It calls `effect.script()`, `effect.stage()`,
and `effect.probes()`. It applies the patter filter to every line. The presentation layer
reads only the session view; it cannot mutate beliefs.

**Misdirection of the machine.** The stage renders atmosphere from real belief entropy:
light temperature, particle coherence, and a slow ring. It never shows numeric
probabilities. This is honest (the state is real) but not literal.

**Graceful miss.** Mandatory and tested. A wrong confident reveal is the worst outcome;
an honest miss is a feature. The UI labels a miss as a win for the spectator.

## 6. Presentation

- React + Vite + React Three Fiber. One generic grid renderer consumes `StageSpec`.
- Textures are generated in-browser (no external card art). Card faces use CSS/canvas so
  the repo has no asset license issues and works offline.
- Art direction "Nocturne Observatory": ink/teal, bone, brass, signal rust; serif display
  and mono utility type; no purple gradients, no chatbot frame. See `docs/design.md`.
- Signature moment: **The Collapse** — on reveal, the particle field contracts, the table
  dims, and the chosen card rises face-up under a single warm key light.
- Accessibility: semantic buttons for all choices, visible focus, 1–5 keyboard shortcuts,
  captions via `aria-live`, sound opt-in, `prefers-reduced-motion` kills drift/particles.
- Mobile: stacked layout, reduced card count per row, no camera path required.
- Camera: a separate **Gaze Lab** route/modal. Visible recording indicator (the browser
  indicator plus an in-app dot), stop/release on close, no upload. It reports quality and
  zone. It does not feed the show unless a validation gate is explicitly passed; that gate
  is false in this build.

## 7. Optional LLM patter

- Default: offline templates only. Zero network, zero spend.
- Optional: `scripts/llm-proxy.mjs` reads `BASETEN_API_KEY` and calls
  `https://inference.baseten.co/v1` with `meta-models/muse-spark-open`.
- The browser sends only `{beat, tone, allowedClaims, template}` to the proxy.
- The proxy never receives camera data, belief state, or spectator identity.
- Response must pass: length ≤ 160 chars, no banned claims, no URL/newline/placeholders,
  one sentence. Any failure/timeout → template.
- The LLM never touches belief state and cannot change the reveal item.

## 8. Privacy and ethics

- Camera opt-in, local WASM, frames never leave the tab, never recorded.
- Evidence log contains only categorical answers, zones, reliability, timestamps, layout
  seed. No images, embeddings, or audio.
- No analytics, no telemetry, no accounts.
- No claims of mind reading, lie detection, emotion reading, or diagnosis.
- Consent screen states the illusion and the spectator's right to stop.
- Minors: the show is aimed at general audiences; a live performer should follow local
  safeguarding rules. Documented in `docs/ethics.md`.

## 9. Evaluation architecture

`packages/sim` is effect-agnostic:

1. Load any `Effect` (card, toy).
2. Sample a true hypothesis from the effect prior (or uniform) with seed.
3. Optionally apply a force prior (logging the target).
4. Generate answers from the probe likelihood with configurable error rate, including
   deliberate-lie and contradiction modes.
5. Optionally generate one gaze window from the binding's finite values, with configurable
   reliability.
6. Run the same session/policy code as the app.
7. Record commit/miss, correct/wrong, probes used, final posterior, Brier, surprise,
   recovery count.
8. Aggregate with Wilson intervals for proportions and seeded bootstrap for means/Brier.

Cells: 4 noise levels × 3 policies × 2 effects, ≥1000 runs each. Ablations: soft/hard,
outlier on/off, gaze on/off, force on/off, temperature. Fixed seeds in `data/`.

**Wrong-confident-reveal rate** is reported over *all runs* (primary) and over *committed
runs* (secondary). Gate: <3% of all runs and <10% of commits for the shipping config. If
not met, raise `tau`, reduce max probes, or ship more abstention. We do not tune on the
demo.

## 10. Platform test

`npm run verify:isolation`:

1. Fail if any `packages/**` source imports `effects/*` or `@loki/effect-*`.
2. Temporarily rename `effects/card` out of the tree.
3. Run `tsc -p tsconfig.core.json --noEmit` and `vitest run` over core packages plus
   `effects/_example`.
4. Restore the folder in a `finally` block.
5. Assert the toy effect passed the same session/sim tests.

This is the real proof, not a README claim.

## 11. Decisions challenged / changed from the prompt

| Prompt decision | Change | Evidence |
|---|---|---|
| Model `muse-spark-open-1026` | Use `muse-spark-open` | Official cookbook; dated ID not found |
| Gaze in the show | Lab only, default off | 10–13.6° 2026 error; no human validation |
| Forces in the show | Implemented as logged prior, default off | Modest 17.8% effect; no pilot |
| Median/bisection challenger | Kept but not assumed better | Optimality only for 1-D symmetric interval queries |
| 52-card deck | 12 cards (3 suits × A–4), includes 3♦ for force | Probe length, measurable, gaze cannot resolve 52 |
| Public repo/demo rules | Marked `[UNRESOLVED]`, prepared public-ready | Event page does not state format |

## 12. Risks

- **Simulator realism:** synthetic answer noise is not human behavior. External validity is
  limited; human pilot absent. Report it loudly.
- **Calibration:** temperature tuned on simulation can be optimistic; report both raw and
  tempered, with conditions.
- **Gaze:** unvalidated; disabled. Camera code can fail on Safari/older devices; no-camera
  path is the product.
- **3D performance:** mobile thermals/WebGL fallback. Provide a CSS card grid fallback.
- **Deadline:** scope is cut aggressively; no extra effects.
- **Ethics:** mentalism can deceive. Consent, framing, and no diagnosis claims are
  non-negotiable.

## Repository cleanup and audit (2026-10-27)

User-requested scope: separate accidental BrowserOS/MCP installation files from the
product, preserve external browser access, and fix verified defects without a redesign.
Plan: remove only unused harness copies; ignore local installations; add camera
cancellation regressions; audit fallback/validation/export boundaries; run local gates.
The domain-neutral engine and effects remain intact. No paid calls or deployment.


## Ember follow-through with OpenCode (2026-10-27)

Use the verified free `opencode/deepseek-v4.1-flash-free` model, `max` reasoning variant,
installed outside this repository. Keep provider configuration, credentials and generated
coding-session logs outside git. Never switch to a paid or alternate model automatically.
First milestone: redesign the tiny Ember probe set to carry enough distinguishable
information under the corrected observation model. Preserve threshold 0.85, epsilon 0.10,
outlier 0.06 and temperature 1. Test all four truth paths and noisy/contradictory paths
through the shared engine. Use natural, unambiguous questions, not secret answers or
simulator-specific shortcuts. Regenerate the complete evaluation and independent heldout
results; report any tradeoff or abstention, with 0 human participants. No redesign, new
effect, networked runtime dependency, camera activation, merge, deployment or paid calls.

Milestone result: Ember uses three balanced spelling partitions (ends in n, contains m,
odd length), preserving all safety parameters and maxProbes=3. All truthful and all
single-flip paths are tested across three policies. Exhaustive answer patterns expose
wrong reveals after two flips, rather than hiding them. See docs/development-2026-10-27.md.

Silent-choice accessibility: while `view.phase === "think"`, presentation also exposes
the generic `StageSpec.items` as a semantic HTML list. The spectator chooses privately;
there is no item click handler, selected state or disclosure to the engine. The decorative
3D stage remains aria-hidden. Hide the roster after choosing so it cannot expose a
candidate or alter the reveal choreography.

Milestone evidence: docs/accessibility-2026-10-27.md. Readable generic choice roster and
height-aware grid framing verified with88unit/72isolated/11browser tests plus full
provenance. No inference or creative-direction change.

Patter response provenance: explicit `source: "template"` from the proxy must remain
source=template in the client. Only validated LLM responses or supported legacy line-only
responses count as rewrites. This metadata must not change the belief/reveal state.
