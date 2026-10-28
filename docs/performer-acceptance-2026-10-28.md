# Performer layer: definition of done and acceptance matrix (2026-10-28)

Governing intent (user, 2026-10-28 23:31 IST): study how mentalists read people and perform,
digitize it, and recreate the receiving-end feel of a live 1:1 performance. Cards and words
are baseline proofs of a domain-neutral performer. Approved direction (23:51 IST): build the
performer layer on cards first, then words. Free-only. Safeguards unchanged: thresholds
(card 0.96, Ember 0.85), epsilon 0.10, outlier 0.06, temperature 1, honest abstention, no
covert capture, no timing/biometric inference, no claim of reading minds.

Base: main ccf2f04. Work branch: feat/performer-layer.

## Definition of done (software)
1. Cards deliver a performed 1:1 sequence (acknowledge, build, staged reveal or honest
   miss), not a bare questionnaire.
2. The same performer module drives Ember and the example effect with zero effect-specific
   strings or logic in the performer.
3. Suspense, reveal and miss are deliberate, timed cues the person can skip or slow.
4. Consent, accessibility (keyboard, screen reader, reduced motion) and error recovery work.
5. Unit, e2e, provenance, Kilo and CI pass at the final head; live deploy verified.
6. Build and pilot instructions are ready for human study; every unproven claim is marked.

Not claimed by "done": that it feels like a live performance. Only people can show that.

## Acceptance matrix
| ID | Requirement | Measure | Test |
|---|---|---|---|
| P1 | Every answered probe gets a short acknowledgement that echoes only what the person chose (their own option label) and claims no knowledge | 100% of answer transitions yield a cue; text contains the chosen label; banned-claim scan passes | showrunner unit |
| P2 | Acknowledgements vary and never repeat back to back | no identical consecutive acks in 200 seeded runs | unit |
| P3 | Build beat recaps the person's own choices (thought echo) using labels from their answers | recap contains each answered label, in order | unit |
| P4 | Reveal is a staged sequence of at least 3 cues with minimum dwell per cue; miss is a staged honest sequence of at least 2 | cue count and holdMs bounds | unit |
| P5 | Honest miss still says it missed and the choice stays the person's; no cue turns a miss into a hit | miss cues contain no target label; reveal cues only after commit gate | unit |
| P6 | Performer is domain-neutral | performer source has no card/word identifiers; runs against the card effect and Ember Words (`effects/_example` IS Ember, not a third effect) and, in a bare-label unit test, with no effect at all | unit + source scan |
| P7 | Cues respect reduced motion and can be skipped | with prefers-reduced-motion the sequence shows without timed delays; a Skip/Continue control is always present | e2e |
| P8 | Timed cues are exposed to assistive tech without spam | one polite live region update per cue; no duplicate announcements | e2e |
| P9 | Keyboard-only run completes the card show including miss and reveal paths | Tab/Enter/digits/Escape complete both paths | e2e |
| P10 | Engine behaviour unchanged | provenance verify exact; simulator commit/wrong counts identical to docs/pilot-readiness at same seeds | `verify:provenance`, sim tests |
| P11 | Performer cannot leak the hidden target before reveal | no cue before reveal contains any hypothesis label that the person did not select | unit |
| P12 | Pilot kit ready | docs/pilot-protocol.md has felt-liveness and the separate experience measures; `docs/pilot-script-2026-10-29.md` has runner script, six separate ratings asked before correctness is disclosed, and the scorecard | doc review |

## Out of scope
New effects, any camera or microphone use by the show, response-time or voice inference,
LLM hosting, threshold changes, claims of validated live feel.

## Evidence rule
Simulation shows the engine behaves. It says nothing about experience. Experience items
(P1-P9) are tested for mechanics only; felt liveness is a pilot question.

## Implementation status and evidence (updated 2026-10-29)
Mechanical, tested in `tests/performer.test.ts`, `tests/performer-extra.test.ts`, `tests/e2e/performer*.spec.ts`:
- P1/P2 acknowledgement echoes the chosen label; repeated label gets its own phrasing; no identical consecutive acknowledgements across 200 seeds.
- P3 recap lists the person's own labels in order.
- P4/P5 reveal has 3 cues, honest miss has 2, last cue rests; miss text names no hypothesis.
- P6 source scan plus runs on card and Ember Words through the same session.
- P7 reduced motion shows cues without timers and keeps earlier lines readable; Skip ahead is present while a pause is pending.
- P9 focus lands on the first answer, Skip ahead or Continue as the moment changes and returns to the consent screen on leave; Escape skips a pending pause, then leaves the show; digits, Space and Enter drive a full run.
- P8 exactly one polite live region on the performance screen.
Stale-claim note: `docs/pilot-readiness-2026-10-28.md` cites main 4eddfe4; the base for this work is ccf2f04 and later heads. Its simulator counts are unchanged because the performer uses a separate random stream and never touches engine beliefs.
Not shown by any of this: that the performance feels live, suspenseful or comfortable to a person, or how a real screen reader reads it. Those are pilot questions.
