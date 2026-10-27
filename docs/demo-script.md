# The 3-minute demo

**Purpose:** show the illusion, the honesty, and the evidence in three minutes without
claiming that any of it is mind reading. The demo is a recorded or live walkthrough of the
shipping build, not a highlight reel of lucky runs.

**Setup before recording**

- Run `npm ci && npm run dev`; open `http://127.0.0.1:4173` at 1440×1000.
- Use the default **The Twelve** effect. Camera off, force off, gaze off, proxy patter off.
  This is the shipping configuration.
- Have `docs/eval-report.md` and `data/eval-results.json` open in a second tab or editor.
- Decide in advance who plays the spectator. If it is a real volunteer, they must read the
  consent screen and agree to be recorded. If not, use a rehearsed colleague and say so.
- Do not re-record until a reveal lands. A miss is usable footage and is the honest case.

**One-line frame to say first:** “This is a performance of mentalism. It is an illusion,
not mind reading, and it does not use the camera.”

---

## 0:00–0:18 — Consent is the opening shot

**Shot:** the consent screen, desktop, full frame. Cursor moves to the participation
checkbox, pauses, checks it. The camera box stays unchecked.

**Say:**

> “Before anything happens, the participant sees this. It says the show is an illusion, not
> mind reading. The camera is off and stays off. They can stop at any time. Nothing is
> uploaded. Consent is the first beat, not a legal footnote.”

**Do not:** click past the consent screen in one second or crop it out. The demo is partly
an argument that the frame is visible.

---

## 0:18–0:38 — Enter the observatory

**Shot:** press **Enter the observatory** (the primary consent button). The 3D Nocturne
Observatory fades in: twelve cards under a brass dome, dark green room, slow camera drift.

**Say:**

> “Twelve cards. Three suits, Ace through Four. The spectator chooses one in silence — no
> click, no camera, no secret input. The engine will ask at most six questions.”

**Do:** let the stage breathe for two seconds. Point out the footer: “An illusion, not mind
reading.”

---

## 0:38–1:35 — The performance

**Shot:** stage plus panel, with the question counter visible. Answer with the on-screen
buttons or keys **1** / **2**. Keep the spectator’s answers in frame.

**Spectator:** holds one card in mind. For a recorded demo, agree beforehand on a card
without telling the performer. The performer must not see it.

**Say while the questions run:**

> “Each answer is evidence, not a command. The engine keeps every card possible and only
> narrows when the answers justify it. It never hard-eliminates a card. If two answers
> disagree, it stops and spends one recovery question.”

**Do not:** narrate probabilities, say “the computer can tell,” or claim the questions are
psychologically revealing. The questions are designed binary splits.

**If the panel shows “A contradiction”:** say, “That is the recovery beat. A real answer
set can be noisy or playful. The system is allowed to notice.” Answer the recovery question.

**If the engine stops before six:** say, “It has enough evidence to commit, or it does not
have enough and will say so. Both are allowed.” Continue.

---

## 1:35–2:00 — Reveal or honest miss

**Shot A, reveal:** press **Reveal it**. The chosen card lifts, the dome light tightens, the
name appears. Hold the shot for three seconds.

**Say:**

> “If the evidence clears the gate, it reveals. The card is the one the spectator held in
> mind. That is the illusion: a small hypothesis space, designed questions, and a
> probability threshold — not access to a mind.”

**Shot B, miss:** the panel says the engine cannot tell, or the reveal is wrong. Do not cut.

**Say:**

> “This is the honest miss. The engine did not clear its confidence gate, so it refused to
> bluff. A miss is a designed outcome, not a bug we edited out. The measured wrong-confident
> rate at the shipping condition is under three percent over all simulated runs, and it is
> still not zero.”

**Do not:** call a wrong reveal a “near miss,” blame the spectator, or re-run until it hits.

---

## 2:00–2:40 — Evidence and architecture

**Shot:** cut to `docs/eval-report.md`, then a terminal or editor showing the package tree
and `npm run verify:isolation` passing.

**Say:**

> “The claim is measured, not asserted. Thirty-three thousand seeded simulator runs, one
> thousand per cell, with 95% intervals, Brier score, reliability, and ablations. At the
> shipping ten-percent answer-error condition: 517 commits out of a thousand, eight wrong,
> 509 correct among those commits, 0.8% wrong over all runs. The upper interval is 1.6%.
> The gate passes.
>
> “The core is domain-neutral. Delete the card effect and the engine, perception, and
> showrunner still typecheck and test. The toy effect proves the plugin contract. Hard
> elimination was tested and dropped: it commits on every run and is wrong on almost half.
> Gaze and force are off because they are not validated on people.”

**Do not:** turn the conditional number into an overall accuracy claim, do not omit “simulated spectators,” and
do not present the gaze ablation as human evidence.

---

## 2:40–3:00 — Close on the limit

**Shot:** return to the stage or the consent footer. Slow push-in on “Human pilot:
0 participants.”

**Say:**

> “What this is: a consent-based performance engine, a working 3D show, a plugin contract,
> and a reproducible evaluation. What it is not: mind reading, lie detection, emotion
> reading, diagnosis, or a guaranteed hit. We have zero human participants, so every number
> is a simulator result. The next step is a pre-registered pilot, not a bigger claim.”

**Final card:** LOKI v3 · an illusion, not mind reading · `docs/eval-report.md`.

---

## Contingencies

| Situation | On camera |
|---|---|
| Reveal is correct | Hold three seconds; name the illusion, not the system’s insight. |
| Reveal is wrong | Keep rolling. Say “that is a wrong-confident reveal; the measured rate is low, not zero,” then show the miss policy. |
| Engine returns an honest miss | Treat it as the primary case, not a failure. Show the confidence gate in the panel. |
| 3D stage fails or is slow | Toggle **Motion reduced**; the panel and keyboard path still carry the show. Do not fake a render. |
| Camera lab is requested | Say the lab is separate, opt-in, local-only, and never feeds the show; the show gate is closed. Do not demo gaze as a working channel. |
| Time is short | Cut the architecture shot, keep consent, the live run, and the 0-participant disclosure. |

## Recording and publication notes

- A real spectator must consent to recording separately from participating. The app’s
  consent screen does not cover video publication.
- Do not show a participant’s face if they have not agreed to publication; hands and the
  screen are enough.
- Do not add crowd reaction, fake statistics, or “world-first” language in post.
- Captions should include the disclosure line, not only the patter.
- The demo must match the shipped configuration. If the config changes, re-record rather
  than describing an older build.
