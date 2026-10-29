# Card-method design: statement-driven answering applied to cards

Date: 2026-10-30. Status: design study, no product change, no participant data.
Scope honesty: the speaker-gate benchmark (PR #22) is lab evidence, not the
show pipeline. Mandatory show camera/mic, card method implementation, and the
production voice path remain open. This document bounds one of them: the
answering channel for the card effect.

## The problem restated

User feedback (2026-10-29): the show reads as "100% anikator type" - a
questionnaire wearing a mentalism costume. Two levers were already tested and
killed with simulation data: psychological priors barely reduce question
count (5.18 -> 4.93 mean probes), and a zero-question sealed prediction hits
only 8-25%. The information must come from answers; the only real lever left
is WHAT answering feels like.

## What the progressive anagram actually teaches

Sources:
- https://themagicoval.com/blog/2025/08/24/toward-better-progressive-anagrams/
- https://themagicoval.com/blog/2025/10/01/how-we-generate-the-best-anagrams-around/
- https://mentalismapps.bartnijs.be/ (progressive anagram generator)
- https://www.thejerx.com/blog/2025/6/1/progressive-anagram-tool

The principle, separated from the word-guessing dressing:

1. The performer makes STATEMENTS, not questions ("there is no A in your
   word"). The spectator only acts when a statement is wrong.
2. In a "perfect" progressive anagram, the FIRST denial identifies the word:
   the statement list is constructed (per candidate set) so that every
   candidate agrees with every statement except at a unique position.
3. Documented failure modes (practitioner sources, not lab data): imperfect
   sets need many statements; the presentation gets trapped into
   letter-fishing texture; a miss must be spun into a hit by the performer.

What transfers is the interaction grammar - statements answered by
denial-only - not the letter content.

## Card applicability (the actual question)

Does a "perfect" denial-only sequence exist for 52 cards?

- A statement in card land is a subset claim: "it's not a red card", "not a
   court card", "not a spade". Each denial eliminates the claimed subset's
   complement... exactly like word PAs, the candidate set must be curated so
   every card has a unique denial position.
- For words this works because letter-membership gives ~26 binary
   coordinates with lots of slack. Cards give far fewer natural coordinates
   (color, suit, court/number, high/low, odd/even rank): about 5-6 usable
   bits for 52 outcomes - no slack. A perfect first-denial-identifies
   sequence over ALL 52 cards does not exist with natural card attributes.
Measured against the ACTUAL current effect (correcting an earlier version
   of this section that discussed a hypothetical spread choice): the shipped
   card effect is already a 12-card spread - "The Twelve", 3 suits
   (Hearts, Diamonds, Spades) x 4 ranks (Ace-Four) in
   effects/card/src/cards.ts. No spread-vs-deck fork exists; nothing to
   escalate.

   Solver results (exhaustive greedy search over natural attributes: suit,
   rank, color, rank parity, card-name letter membership; run 2026-10-30):
   - A LINEAR perfect schedule (first denial identifies, the classic word-PA
     property) does NOT exist for these 12 cards with natural attributes:
     no attribute has a singleton denial set, so the linear construction
     stalls immediately. Verified by enumeration, not bit-count intuition.
   - A BRANCHING statement tree (what practitioners call a branching
     anagram) DOES exist: worst case 5 statements and 2 denials per card,
     measured by exhaustive greedy search. Example spine: "not a Heart" ->
     "not a Diamond" -> rank statements for the Spades branch; each denial
     branches into a sub-tree.
   - Texture alternatives exist within the same solver: letter-membership
     statements ("your card's name has no W" - only the Twos deny) can be
     mixed in so the flow is not pure attribute elimination. Which texture
     reads best is a felt-quality question, unvalidated.
   - Interpretation stays honest: max-2-denials is a measured property of
     this attribute alphabet on these 12 cards; it is not a proof about
     other spreads, and the impossibility claim is scoped to LINEAR
     schedules with THESE natural attributes.

## The answer channel: nod/shake and voice, with failure limits

Denial-only answering means the spectator rarely acts, which is exactly
what makes light channels viable. Candidate channels:

1. Head gesture (nod = keep going / shake = that's wrong). MediaPipe Face
   Landmarker runs on-device in-browser under Apache-2.0 and outputs a full
   head-pose transformation matrix plus 52 blendshapes
   (https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker).
   Requirements BEFORE any build, not assumptions:
   - False-accept validation: ordinary head motion (reading, shifting,
     looking away) must not register as an answer. Needs a deliberate-motion
     detector (amplitude + speed + dwell) measured against a recorded-motion
     baseline, and an on-screen confirmation echo with an undo.
   - Gesture variation: head-gesture semantics vary by culture and by
     individual (a side-to-side wobble reads as agreement in some cultures,
     negation in others). Any gesture channel must be calibrated per person
     or deliberately chosen - never assumed from demographics.
   - Never an inference channel: nod/shake is an INPUT device (button
     replacement), never a truth/lie or emotion signal. Copy says so.
2. Voice denial (the speaker gate). PR #22's measured result: on synthetic
   turn-taking speech the gate rejected 23/23 non-target windows and held
   WER at 3%; under overlap it drops rather than leaks. A spoken "no"
   pipeline is now a legitimate candidate, gated on the enrollment step the
   user has not yet approved as a product flow (purpose + consent text
   review required first; no user voice enrollment without it).
3. Gaze stays a measurement instrument only. Webcam gaze error in the
   cited studies is zone-level at best even with calibration
   (https://ijcai.org/proceedings/2016/0540.pdf - ~130-175 px with
   continuous click recalibration; https://doi.org/10.3390/jemr19050099 -
   far worse without dense calibration). Not an answer channel.

## Felt-quality status: hypothesis, not finding

"Statements with denial-only answering feel less like a questionnaire" is a
DESIGN HYPOTHESIS grounded in practitioner literature, not a validated
result. No Akinator-comparison claim without participants. A cheap
validation path exists before any show build: a scripted prototype of the
statement flow with the user as the first spectator - his reaction is the
first data point, and his Oct 29 feedback is the criterion it must move.

## What this does NOT solve (kept visible)

- Card detection reliability (the original "card not detected correctly"
  complaint) is an implementation/QA problem in the current engine, not
  addressed here.
- Overlap separation in audio (gate drops overlapped speech - PR #22
  numbers) means voice answering needs a quiet, turn-taking room.
- The mandatory camera/mic show pipeline is still not a delivered feature;
  channels above are candidates with prerequisites, each with its own
  consent step.
