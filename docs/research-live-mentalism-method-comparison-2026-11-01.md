# Critical Method Comparison: Live 1:1 Mentalism (Cards First, Then Words)

- **Date:** 2026-11-01
- **Base commit verified:** `main @ c2364e2` (`Merge pull request #33 from Vizdumb2005/docs/sample-timestamp-fix`)
- **Scope:** Critical evaluation of the attached YouTube mentalism research report (`loki_mentalism_youtube_research.md`), independent practitioner/literature analysis, side-by-side comparison of five candidate methods (where each gets its information and how each handles mistakes), and architectural justification for the selected implementation.

---

## 1. Critical Audit of the Attached Research Report (`loki_mentalism_youtube_research.md`)

### 1.1 What the report gets right
1. **Why Akinator fails as mentalism:** A question loop (`"Is your card red?"`, `"Does the word end in N?"`) places the cognitive work on the spectator and exposes a decision tree. Real 1:1 mentalists (Derren Brown, Peter Turner, Spidey) lead with **sensory/visual impressions** (*"Project it onto a screen in your mind..."*, *"Wait—there's something sharp..."*) and use **conversational check-ins** rather than database queries.
2. **The Denial Pivot ("No" as a feature, not a bug):** In live mentalism (Peter Turner's *Dare to be Bold* / *Guess What?*), when a spectator rejects a statement, the performer never says *"That's wrong. I will hold on to that."* Instead, the performer treats the denial as **pushing a competing or decoy image off the mental screen** (*"Good—push that competing impression out of the way so the real one sharpens"*).
3. **Why renaming questions as naked claims fails:** Simply changing `"Is it a Heart?"` to `"It's a heart."` or `"Is it an Ace?"` to `"It's the ace."` is still a naked taxonomic guess. When the user rejects `"It's the ace."` and the next prompt says `"It's the two."`, the binary search is completely transparent.

### 1.2 Why the report's primary recommendation (Method 1: Visual-Stream Selection) is rejected
The attached report recommends adapting Dai Vernon's *Out of Sight, Out of Mind* (`More Inner Secrets of Card Magic`, Lewis Ganson) into a digital **Visual-Stream Selection** where:
- **Beat 1:** A rapid stream of 6 cards flashes on screen (~400ms/card) while the performer asks *"Did you see your card pass?"* ($12 \to 6$).
- **Beat 2:** A second stream or color/suit filter narrows $6 \to 3$.
- **Beat 3:** The performer makes an **intentional 1-card guess/miss** among the 3 remaining cards; if denied, the performer pivots to the remaining 2 cards ($3 \to 2$).
- **Beat 4:** A final binary contrast selects between the remaining 2 cards ($2 \to 1$).

When audited against LOKI's information-channel rules, accessibility gates, and quantitative mistake-handling requirements, **Method 1 fails on four independent grounds**:

1. **Perceptual & Attention Error Amplification (Where mistakes originate):**
   - In Vernon's physical routine, a live performer watches the spectator's eyes at conversational pace and controls the spread speed. On a web screen, flashing 6 cards at ~400ms/card turns a calm psychological reading into a **visual vigilance / reaction-time test**.
   - If the spectator blinks, glances at the performer's subtitle cue, confuses `3♦` with `4♦` during a 400ms flash, or misremembers whether their card passed in Stream 1 vs Stream 2, the first partition bit ($12 \to 6$) is inverted with **zero parity check**.
2. **Mathematical Incompatibility with LOKI's `tau = 0.96` Confidence Gate:**
   - Under LOKI's mandatory soft-likelihood and outlier-mixture safeguards (`tau = 0.96`, `epsilon = 0.10`, `outlierWeight = 0.06`, `temperature = 1.0`), each balanced binary confirmation scales the true hypothesis likelihood by $L_{\text{hit}} = 0.94 \times 0.90 + 0.06 \times 0.50 = 0.876$ against $L_{\text{miss}} = 0.94 \times 0.10 + 0.06 \times 0.50 = 0.124$ (likelihood ratio $7.0645:1$).
   - Starting from a uniform prior $P_0(h) = 1/12 \approx 0.0833$:
     - After Beat 1 ($12 \to 6$): $P_1(h) = 0.1456$.
     - After Beat 2 ($6 \to 3$): $P_2(h) = 0.2738$.
     - After Beat 3 (Intentional 1-of-3 guess is **denied** on 2/3 of all runs, giving a $2\text{-of-}3$ survival branch): $P_3(h) = 0.3916$.
     - After Beat 4 ($2 \to 1$ binary contrast): $P_4(h) = \mathbf{0.8124 < 0.96}$.
   - **Result:** On the 8 out of 12 cards where the Beat 3 intentional guess is denied, a 4-beat visual-stream routine reaches only $P(h) = 0.8124 < 0.96$, causing **0% commit rate (100% abstention)** unless additional probes are asked!
   - Conversely, if the `tau = 0.96` gate is bypassed (as in `raw-tree` in `docs/method-selection-evidence-2026-10-30.md`), single-error wrong confident reveals spike to **17.7% at $p=0.05$**, **32.4% at $p=0.10$**, and **45.0% at $p=0.15$**—violating LOKI's `< 10%` error ceiling by up to $4.5\times$.
3. **Accessibility & Motion-Safety Violation:**
   - Rapidly flashing card streams violate `prefers-reduced-motion` and break keyboard/screen-reader accessibility (`silent-choices` static roster invariant tested in `tests/e2e/show.spec.ts`).
4. **No Natural Extension to Act II (`Ember Words`):**
   - Flashing subsets of 4 words on screen is pointless when all 4 words (`Sun`, `Moon`, `Comet`, `Flower`) are already visible on the stage roster.

---

## 2. Side-by-Side Comparison of Candidate Methods

| Candidate Method | Where It Gets Its Information (Information Channel & Bits) | How It Handles Mistakes (Mis-Recall, Mis-Tap, ASR Flip, Attention Lapse) | Theatrical / Anti-Akinator Feel | Honest / Ethical Compliance | Verdict |
|---|---|---|---|---|---|
| **1. Visual-Stream Subset Timing** (*Out of Sight, Out of Mind* digital flash + intentional miss) | 2 binary visual-stream timing checks ($12 \to 6 \to 3$, $2.0\text{ bits}$) + 1 intentional 1-card guess ($3 \to 2$, $0.58\text{ bits}$) + 1 binary contrast ($2 \to 1$, $1.0\text{ bit}$) via voice/tap. | **Brittle.** Adds visual flash-miss error on top of answer error. Without $\tau=0.96$, yields **32.4% wrong reveals at $p=0.10$**. With $\tau=0.96$, reaches only $P(h)=0.812 < 0.96$ on the denial branch (**8/12 cards never commit** in 4 beats). | High novelty on Beat 1, but feels like a speed-vision test rather than psychological reading. | Breaks `prefers-reduced-motion` and screen-reader parity. | **Rejected** |
| **2. Verbal Equivoque / Magician's Choice** | **0 bits of inference.** Forces a pre-selected target by asking the user to split subsets and changing the keep/discard rule post-hoc. | Cannot recover if the spectator already locked a free silent choice in the `think` phase; post-hoc rule-flipping feels dishonest after $>2$ steps. | Feels manipulative when the user has already silently chosen a card from the 12-card table. | **Violates Integrity Rule #2** (must not covertly contradict user's free silent choice). | **Rejected** |
| **3. Deterministic Branching Statement Tree / Progressive Anagram** (`statement-tree.ts`) | Fixed binary decision tree ($\le 5$ statements, $\le 2$ denials) over declarative claims via voice/tap. | **Zero parity redundancy.** Un-gated: **32.4% wrong reveals at $p=0.10$**, **45.0% at $p=0.15$**. Gated by $\tau=0.96$ (`C-tree-order+gate`): **4 blind cards (`d-3`, `d-4`, `s-3`, `s-4`) with 0/240 commits**. | Low denial count on clean runs, but stalls or guesses wrong on a single slip. | Fails honesty-under-noise gate (`wrong < 10%` at $p=0.15$). | **Rejected for main show** (kept in `/statement-lab`) |
| **4. Baseline Claim-Renamed Flow** (`main @ c2364e2`) | Active EIG/cost selection over 21 binary card claims (`tau=0.96`, `maxProbes=6`) and 5 orthographic word questions (`tau=0.85`, `maxProbes=3`) via speaker-gated voice or tap. | **Strong.** Soft likelihoods ($\epsilon=0.10$, $w_{\text{out}}=0.06$) + surprise-triggered `recover` probe + honest `miss`. `0.60%` wrong at $p=0.05$, `6.96% < 10%` wrong at $p=0.15$, `12/12` card coverage. | **Weak (Still feels like Akinator):** naked rank/suit claims (`"It's a heart."`, `"It's the ace."`), literal spelling questions in Ember (`"Does the word end in n?"`), flat denial acks (`"That's wrong. I will hold on to that."`), no Act I $\to$ Act II arc. | Passes all honesty and sensor gates. | **Superseded** |
| **5. Two-Act Soft-Bayesian Mental-Screen & Sensory Reading with Denial Pivot** (**Selected**) | Active EIG/cost selection over **21 mental-screen visual/geometric card impressions** (`tau=0.96`, `maxProbes=6`) and **5 sensory/archetypal word impressions** (`tau=0.85`, `maxProbes=3`) via speaker-gated voice or tap. Zero covert camera inference. | **Strong (Identical mathematical guarantees to Candidate 4):** Soft likelihoods ($\epsilon=0.10$, $w_{\text{out}}=0.06$), surprise-triggered contradiction recovery framed as *two overlapping impressions*, and calibrated honest abstention (`miss`). `0.60%` wrong at $p=0.05$, `6.96% < 10%` wrong at $p=0.15$, `12/12` card and `4/4` word coverage. | **High:** Derren Brown mental-screen framing, Spidey geometric/weight impressions, Peter Turner **Denial Pivot** on rejected claims, zero spelling/taxonomic questions, spectator-performed reveal gate on both Cards and Words, and seamless Act I $\to$ Act II progression. | Preserves mandatory camera+mic framing, real per-sensor consent, presence-only camera boundary, honest speaker-gating copy, and honest misses. | **Selected & Implemented** |

---

## 3. Root-Cause Diagnosis & Architectural Design of Candidate 5

### 3.1 Where Candidate 5 gets every bit of its information
1. **Explicit Answer Channel Only (Voice or Manual Tap/Key):**
   - In `The Twelve` (Act I: Cards, $\log_2 12 \approx 3.585\text{ bits}$), information enters exclusively when the spectator responds `"True of my card"` or `"That's wrong"` (by speaking `"yes" / "right" / "true"` vs `"no" / "wrong" / "not that"` into the speaker-gated microphone channel, or by tapping/pressing `1`/`2`).
   - In `Ember Words` (Act II: Words, $\log_2 4 = 2.0\text{ bits}$), information enters exclusively when the spectator responds `"Yes"` / `"No"` (or selects a 4-way sensory image) to the performer's sensory/archetypal impressions.
2. **Role of Mandatory Camera + Mic Sensors (Honest Disclosure):**
   - **Camera:** Verifies live 1:1 presence in the frame (`presence` status in the sensor pill) so the performer paces the reading for a person sitting in front of the lens. The camera **never** reads thoughts, emotions, micro-expressions, or card identity, and the Gaze Lab remains **CLOSED** (`mean Angular Error = 10°–13.6°`, unusable for item discrimination).
   - **Microphone:** Runs local WebRTC VAD + WeSpeaker speaker verification + Whisper Tiny (`onnx-community/whisper-tiny.en`) to transcribe the enrolled participant's spoken confirmations/denials while gating out non-target utterances (`>= 70%` non-target rejection). It is **never** presented as waveform voice separation.

### 3.2 How Candidate 5 handles mistakes
1. **Comprehension Mistake Prevention (Dual-Anchored Sensory Claims):**
   - Purely poetic cold reading (e.g., *"Your card feels lonely"*) causes high human answer error because spectators disagree on whether a `2♥` or `A♠` feels "lonely".
   - Conversely, naked taxonomic statements (`"It's a heart."`, `"It's the ace."`) feel like a computer checklist.
   - Candidate 5 solves this tradeoff using **Dual-Anchored Mental-Screen Impressions**: every probe leads with a vivid Derren Brown / Spidey sensory projection (ink warmth on the mental screen, curved vs blade-sharp geometry, a solitary center emblem vs mirrored top-and-bottom balance, a three-beat spine vs four-corner symmetry) and pairs it with an **unambiguous visual anchor** so the spectator knows immediately and without guesswork whether the impression matches their card or word.
2. **Observation & Speech Error Absorption (`epsilon = 0.10`, `outlierWeight = 0.06`):**
   - Every probe uses `softBinaryLikelihood` or `softChoiceLikelihood` so a mis-tap, momentary memory slip, or ASR mis-recognition never zeroes out the true hypothesis (`min(L) > 0`).
3. **Contradiction Detection & Narrative Recovery (`surpriseBits > 1.8`):**
   - When an answer sharply contradicts the current posterior ($-\log_2 P(o \mid b) > 1.8\text{ bits}$ and $> 1$ probe remains), `ShowSession` enters the `recover` beat.
   - Rather than sounding like an error dialog, the performer uses Peter Turner's "competing decoy thought" framing (*"Hold on — a second impression just crossed the screen and muddied the first. Let your eyes settle back on the single card you chose..."*) before delivering a recovery probe.
4. **Calibrated Honest Abstention (`miss`):**
   - If `maxProbes` is reached with $\max_h P(h) < \tau$ ($\tau = 0.96$ for cards, $\tau = 0.85$ for words), LOKI refuses to guess and runs `missSequence` (*"Wait. The image keeps splitting in two... I cannot quite catch it cleanly — I would rather stop here than guess. You beat me."*).

### 3.3 How Candidate 5 removes the Akinator feel across Four Layers
1. **Layer 1 — Polarity-Aware Performer Acknowledgement & Denial Pivot (`packages/showrunner/src/performer.ts`):**
   - `performer.ts` remains 100% domain-neutral (zero references to `card`, `suit`, `hearts`, `spade`, `word`, `ember`, `letter`) and preserves every P1–P11 invariant (`ack.line` contains `safeLabel`, no consecutive template index repeats across 200 seeds, `"again"` / `"once more"` on repeated answers).
   - When `label` is a denial (`"That's wrong"`, `"No"`), `acknowledge()` selects from **Denial-Pivot templates** that treat the rejection as clearing noise from the mental screen (e.g., `"That's wrong — good, push that competing image out of the way."`, `"That's wrong. Let that decoy impression drop from the screen."`).
   - When `label` is an affirmation (`"True of my card"`, `"Yes"`), `acknowledge()` selects from **Image-Lock templates** (e.g., `"True of my card — hold that part of the image steady."`).
2. **Layer 2 — Act I (`The Twelve` Cards, `effects/card/src/cards.ts` & `index.ts`):**
   - Replaces all naked suit/rank guesses (`"It's a heart."`, `"It's the ace."`, `"It's the two."`, etc.) with 21 mental-screen visual-projection impressions across five sensory families (`color-warmth`, `suit-geometry`, `pip-layout`, `pip-silhouette`, `screen-focus`), preserving the exact boolean membership matrix, probe IDs, and costs so all 33 benchmark evaluation cells and provenance hashes remain 100% verified.
3. **Layer 3 — Act II (`Ember Words`, `effects/_example/src/index.ts`):**
   - Replaces all 5 orthographic/spelling questions (`"Does the word end in the letter n?"`, `"Does the word contain the letter m?"`, `"Does the word have an odd number of letters?"`, `"Which letter does the word start with?"`, `"How many letters?"`) with **Sensory & Archetypal Image Impressions** (`p1` permanent sky light vs passing/living form, `p2` night-sky darkness vs daylight warmth, `p3` blazing heat/fire vs cool stillness, `p4` elemental pull, `p5` mind's-eye silhouette).
   - Preserves the exact 2-of-4 balanced Hamming-distance-2 binary partitions and 4-way choice structures (`costs: 1.0, 1.0, 1.0, 1.35, 1.35`).
   - Adds `revealInvite` and `revealAction` (`"Turn it over"`) so Act II also climaxes with a spectator-performed reveal gate.
4. **Layer 4 — Two-Act Show Flow & Mandatory Sensor Consent (`Consent.tsx`, `Stage.tsx`, `Performance.tsx`):**
   - `Consent.tsx` defaults to the live 1:1 **Sensor-enabled performance (`camera + mic required`)** while preserving honest per-sensor disclosures, explicit camera-presence / speaker-gating boundaries, and the manual click mode for accessibility and headless testing.
   - `Stage.tsx` frames `The Twelve` as **Act I** and `Ember Words` as **Act II**, providing a direct **"Continue to Act II: Ember Words"** transition button as soon as Act I completes.
