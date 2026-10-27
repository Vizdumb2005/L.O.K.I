# Human pilot protocol

**Status: not run. Human participants: 0.** No human-subject data was collected for this
build. This document is the minimum protocol for a future pilot. It is not evidence that a
pilot happened, and no result in this repository comes from it.

The operating ethics policy is [docs/ethics.md](ethics.md). If the two documents disagree,
the stricter rule applies.

## 1. Research questions

1. Under a consent-based, no-camera performance, what is the distribution of answer errors,
   completion, correct reveals, wrong reveals, and honest misses for The Twelve?
2. Does the shipping confidence gate hold outside the simulator, and how far does observed
   calibration depart from the simulator’s Brier/ECE?
3. Do participants understand the illusion frame, feel agency, and remain comfortable?
4. Does an optional, separate gaze lab produce a signal reliable enough to justify a future
   validation study? (The gaze channel is not used to drive a scored reveal in this pilot.)

This is a descriptive, single-site pilot. It is not powered to compare effects, personas, or
subgroups, and it cannot establish real-world accuracy for a product.

## 2. Design

- **Within-subject**, two conditions in counterbalanced order:
  - **Adaptive:** the shipping The Twelve policy (`tau = 0.96`, max 6 probes, one recovery
    probe, gaze off, force off).
  - **Control:** a fixed, non-adaptive sequence of the same maximum length, using the same
    card set and answer format, with the same reveal/miss wording. The control isolates the
    value of adaptive question selection rather than the value of mentalism.
- **Order:** randomized in blocks of two by a pre-generated seed; the allocation is logged.
- **Target N:** 40 adults (20 per order). This is a precision-oriented pilot, not a
  hypothesis test. Recruitment stops at 40 or at the pre-registered date, whichever first.
- **Setting:** a quiet room, one participant and one facilitator. No audience. No payment
  that could impair voluntariness; a small inconvenience reimbursement is allowed if
  approved.
- **Duration:** about 20 minutes per participant, including consent, two short runs, the
  form, and the debrief.

## 3. Participants

**Inclusion**

- Age 18 or older.
- Able to read the consent screen and the show language.
- Able to give informed consent.
- No dependent relationship with the performer or research team (not a student, employee,
  or close contact of the facilitator).

**Exclusion**

- Anyone who believes the performance is a medical test, a security/surveillance system, or
  genuine communication with the dead.
- Anyone in acute distress or unable to consent.
- Anyone who has seen the mechanism or the card effect before (to avoid priming).
- Anyone who does not consent to the data handling below.

**Recruitment copy must say** that this is a study of a mentalism performance and an
inference engine, not a test of the participant, and that they can withdraw at any time
without explanation.

## 4. Consent

The facilitator reads the consent screen aloud and answers questions. The participant
checks the participation box themselves. The camera box is separate, unchecked by default,
and not required. Consent covers:

- the illusion frame and the right to stop;
- what is recorded (categorical answers, timings, condition, order, questionnaire
  responses; no video or audio by default);
- the purpose (evaluation of the prototype), the storage location, the retention period,
  and the deletion procedure;
- the fact that the performance may miss and that a miss is not their failure;
- contact information for questions or withdrawal.

A paper or electronic signature is collected separately from the app. The app’s consent
screen is a UX gate, not a substitute for study consent.

## 5. Procedure

1. **Welcome and consent** (5 min). Read the consent form; confirm comprehension with two
   questions (“What is the show not doing?” “Can you stop, and what happens to your data?”).
   Record only after consent.
2. **Practice answer** (1 min). Show the two-button answer format with a neutral example so
   the interface is not mistaken for a test.
3. **Condition A** (4 min). The participant holds one card in mind, answers the probes, and
   sees the reveal or miss. The facilitator does not comment on correctness during the run.
4. **Short break** (1 min). No performance talk; water offered.
5. **Condition B** (4 min). Same procedure with the other condition. A different card is
   chosen to reduce memory effects.
6. **Post-show form** (4 min). See measures. Complete it before the mechanism debrief so
   that perceived accuracy is not anchored by the explanation.
7. **Debrief** (3 min). State plainly that the system did not read their mind. Explain the
   hypothesis space, the questions, and the confidence gate at the level they want. Offer
   the written explanation. Ask whether they want their data deleted.
8. **Close**. Thank them; confirm deletion choice; provide contact details.

### Measuring answer correctness without contaminating the run

The participant writes their chosen card on a folded slip before the run and keeps it face
down. After the reveal/miss, they turn the slip over and the facilitator records
chosen card, revealed card (or miss), and whether the reveal was correct. The performer does
not see the slip during the run. If a participant prefers not to write, they may point to
the card on a printed sheet after the run; the choice is recorded the same way. No secret
camera, eye tracker, or keystroke log is used to infer the choice.

### Optional gaze lab

Offered only after both conditions and only with separate consent. The participant may
decline without affecting participation. The lab shows raw, uncalibrated iris diagnostics
and a visible local-only indicator. No frames are stored. The show gate remains closed in
this build; the lab is a feasibility probe, not a treatment.

## 6. Measures

**Performance**

- Chosen card and whether each answer was correct (self-report against the slip).
- Number of probes used; recovery used; commit vs honest miss.
- Revealed card, correct/wrong, and stated confidence.
- Response time per question (client-side, no content).

**Calibration**

- Brier score and expected calibration error of the stated confidence against observed
  correctness, with 95% intervals.
- Reliability plot by confidence bin; bin counts reported so small cells are visible.
- Wrong-confident-reveal rate over all runs and over committed runs, with Wilson intervals.

**Experience**

- Perceived accuracy before and after disclosure (0–100).
- Agency (“I felt in control”), comfort (“I felt comfortable”), pressure (“I felt pressure to
  continue”), and disclosure comprehension (Likert 1–5).
- Free text: what they thought was happening, what felt good or bad, and whether they would
  recommend the experience.
- Facilitator note: interruptions, distress, technical failures, deviations.

**Gaze feasibility (optional lab only)**

- Calibration error in degrees, zone accuracy on held-out targets, missing-frame rate, and
  reliability flags. Reported descriptively; never pooled with performance accuracy.

## 7. Analysis plan

- Report all enrolled participants, including withdrawals and protocol deviations. Do not
  silently exclude runs.
- Primary descriptive table: condition × (commit, correct, wrong, miss), with counts and
  Wilson 95% intervals.
- Calibration: Brier and ECE with bootstrap intervals, plus a reliability plot. Do not
  compare Brier scores across conditions without paired uncertainty.
- Experience: median and interquartile range for Likert items; paired differences with
  bootstrap intervals, clearly labeled exploratory.
- Qualitative notes: two coders, independent coding of free text into “understood illusion,”
  “uncertain,” “believed special access,” plus discomfort themes; disagreements resolved by
  discussion and reported.
- No subgroup claims, no significance-star fishing, and no “accuracy” claim from a small
  sample. The simulator remains the primary quantitative evidence; the pilot tests whether
  the assumptions survive contact with people.

## 8. Stopping and adverse events

- Stop immediately on request, visible distress, or any sign that the participant believes
  the system has special access and is frightened.
- If a participant becomes upset: stop, drop the frame, say “This is an illusion. You are in
  control,” offer a break, and do not argue. Record the event in the adverse-event log.
- A participant may withdraw at any point, including after the session, and may request
  deletion of their data.
- The whole study pauses if two or more participants report a serious comprehension failure
  or distress, pending review.
- Technical failures are logged but do not count as participant errors; if the show cannot
  run, the session is rescheduled or excluded with the reason recorded.

## 9. Data handling and retention

- **Collected:** study ID, condition order, categorical answers, chosen/revealed card,
  timings, questionnaire responses, facilitator notes. No names, emails, or free-text
  identifiers in the analysis file.
- **Not collected by default:** video, audio, camera frames, gaze video, biometric data.
- **Storage:** encrypted local disk, access limited to the named researcher and analyst.
  The mapping from study ID to consent form is stored separately, encrypted, and destroyed
  after the retention period.
- **Retention:** 12 months after analysis, then deletion. Consent forms retained only as
  long as required by the reviewing body.
- **Publication:** de-identified aggregate data and analysis code may be published. Free
  text is quoted only with separate permission and identifiers removed.
- **Deletion:** a participant can request deletion by study ID at any time before
  publication; the request is logged and the record removed.
- **Sharing:** no third-party analytics, no cloud inference, no LLM processing of
  participant data.

## 10. Ethics review and registration

- `[UNRESOLVED]` No IRB/ethics-board approval was obtained because no human subjects were
  run. A future pilot must obtain the appropriate review before recruitment.
- `[UNRESOLVED]` Pre-registration venue and timestamp. The analysis plan above should be
  registered before the first participant; deviations must be reported.
- `[UNRESOLVED]` Local data-protection requirements (GDPR/UK GDPR or equivalent) for the
  study site. The protocol assumes a lawful basis of consent and data minimization, but
  this must be confirmed by the reviewing body.
- `[UNRESOLVED]` Whether the optional gaze lab needs separate ethics review; treat it as
  requiring review until confirmed otherwise.

## 11. What would change the shipping build

A pilot could justify including gaze only if all of the following hold: a pre-registered
calibration protocol, held-out validation, zone accuracy high enough for adjacent cards,
a reliability floor, no material increase in discomfort, and a documented decision to
include the channel. A pilot cannot justify “mind reading,” “lie detection,” “emotion
reading,” or a guaranteed hit; those are outside the product regardless of results.

A wrong-confident rate above the shipping gate, or a cluster of comprehension failures,
would block a public show and trigger a fix-and-retest cycle. A miss rate that is too high
for the format would be handled by changing the effect design or the probe budget, not by
lowering the confidence gate after seeing the data.
