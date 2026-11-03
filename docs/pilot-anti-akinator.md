# Step 8 Pilot Kit — Anti-Akinator (10-person pilot)

Status: **protocol ready; no human results recorded.** No pilot claim is made
until real sessions are run and logged below. Do not pre-fill, back-fill, or
simulate scores — an honest miss or a low score is valid data.

## What is being tested

The statement-first show (Act I "The Twelve" and Act II "Ember Words") should
feel like a reading, not a quiz: at most two performed statement beats before a
build/reveal or honest miss (plus at most one preserved recovery beat), a
sealed prediction committed before the first answer (Ember Words), and no
visible machine (no progress dots, counts, percentages, or narrowing stage).

## Participants

- 10 people, not developers on this project; each does one session.
- Mix: at least 5 with camera/gaze declined (no-gaze path) and, if consenting,
  up to 5 with camera on (gazed/equivocation paths). Record path, not identity.
- No payment-for-positive-feedback; tell them honest criticism is the goal.

## Setup

- Built app: `npm run build`, then `npm run preview` (or the deployed URL).
- Quiet room, one facilitator, one observer/log-keeper (can be same person).
- Reset between participants (fresh page load; "Forget my voice" if used).

## Protocol (per participant, ~10 minutes)

1. Read the consent screen together. Confirm the copy is understood: "This is
   a performance of mentalism — an illusion, not mind reading. You can stop
   whenever you like." Participant must actively consent to start.
2. Participant silently chooses a card (Act I) — do not watch the choice.
3. Let the show run untouched. Facilitator says nothing about probes, gaze,
   sealing, or the force. If the show honestly misses, let it miss — never
   restart mid-show to chase a reveal, never hint an answer.
4. Repeat with Ember Words (Act II). Note whether they noticed the sealed
   line ("Sealed before your first answer …") before it was opened.
5. Stop at the afterglow. Do not explain the method before the exit questions.

## Exit questions (ask verbatim, score 1–5 immediately)

| # | Question | 1 | 5 |
|---|----------|---|---|
| Q1 | "Did it feel like your mind was being read?" (mind-reading feel) | "Not at all — it felt mechanical" | "Completely — it felt like a reading of me" |
| Q2 | "Did it feel like a quiz — like you were answering 20 questions?" (quiz feel; lower is better) | "Completely a quiz" | "Not at all a quiz" |
| Q3 | "What was the strongest moment?" — rate how strong the strongest moment felt, then write it down verbatim | "Nothing stood out" | "Genuinely astonishing" |

Also ask, unscored: "When did you guess how it worked, if ever?" and
"Did you see anything that looked like a score, count, or search?"

## Success gate (decided before running; do not move after seeing data)

For each of Q1 and Q3: **median of the 10 scores >= 4**.
For Q2 (quiz feel): **median >= 4** on the scale above (i.e. median participant
agrees it did *not* feel like a quiz).
Gate passes only if all three medians meet >= 4. Report medians and the full
distribution per question; a passed median with a bimodal split is still a
finding, not a clean pass. Missing/unrun sessions mean the gate is **not
evaluated**, never "passed".

## Logging template (one row per participant; append, never overwrite)

| # | Date | Act | Path (no-gaze/gazed/equivocation) | Outcome (reveal / honest miss) | Answers given (count only) | Saw sealed line before reveal? (y/n) | Q1 (1-5) | Q2 (1-5) | Q3 (1-5) | Strongest moment (verbatim) | Guessed method when? | Saw score/count/search? | Notes |
|---|------|-----------------------------------|--------------------------------|----------------------------|------|------------------|---------|---------|---------|------------------------------|----------------------|-------|
| 1 | | | | | | | | | | | | | |
| 2 | | | | | | | | | | | | | |
| 3 | | | | | | | | | | | | | |
| 4 | | | | | | | | | | | | | |
| 5 | | | | | | | | | | | | | |
| 6 | | | | | | | | | | | | | |
| 7 | | | | | | | | | | | | | |
| 8 | | | | | | | | | | | | | |
| 9 | | | | | | | | | | | | | |
| 10 | | | | | | | | | | | | | |

Results summary (fill only after all 10 rows exist):

- Q1 median: __ / Q2 median: __ / Q3 median: __
- Gate: PASS / FAIL (delete one, only when computed from the 10 real rows)
- Reveal vs honest-miss count: __
- Recurring strongest moments: __

## Honesty rules

- No cherry-picking: log every started session, including misses and bored
  participants.
- No coaching, hinting, restarting, or swapping a choice to force a reveal.
- If fewer than 10 sessions are run, report the pilot as incomplete.
