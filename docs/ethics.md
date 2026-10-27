# Ethics and participant protection

LOKI is a **performance of mentalism**. It creates the experience of being read while using
consent, a small hypothesis space, designed questions, and explicit uncertainty. It does
not access thoughts, detect lies, read emotions, diagnose anything, or predict behaviour.

This document is the operating policy for the prototype. It is deliberately conservative
because a convincing illusion can create a power imbalance even when the code is honest.

## 1. Non-negotiable commitments

1. **Name the illusion.** The consent screen and the show footer say “illusion, not mind
   reading.” The demo script does the same. We do not use “psychic,” “telepathy,” “mind
   reader,” “lie detector,” “emotion reader,” or “diagnosis” as product claims.
2. **Consent is specific and revocable.** The participant chooses to begin, chooses whether
   to opt into the camera lab, and can stop at any time. Camera consent is separate from
   participation consent.
3. **No hidden camera.** The show does not open the camera. The camera exists only in the
   explicitly labelled lab, with a visible indicator. The show gate is closed in this
   build.
4. **No recording, upload, or storage of frames/audio.** The camera stream stays in the
   page. The lab draws frames to a local canvas for diagnostics; it does not record. The
   evidence log stores categorical answers and (in tests) gaze zones/timestamps only.
   Nothing is sent to a server.
5. **No diagnosis or safety decisions.** LOKI is not a medical, mental-health, employment,
   insurance, education, or security tool. It must not be used to make decisions about a
   person.
6. **The participant may lie.** The UI says so. The simulator includes wrong answers. A
   miss is an acceptable and designed outcome.
7. **No guaranteed accuracy.** We report a simulator gate, not a promise. We do not claim
   “100%,” “98%,” “never wrong,” or “world-first.”
8. **No vulnerable-person targeting.** Do not use the show on children, people who cannot
   consent, or anyone who believes the performance is real communication with the dead,
   a medical test, or an intelligence/surveillance system.
9. **Stop on distress.** If a participant looks uncomfortable, stop the performance, drop
   the frame, and say plainly: “This is an illusion. You are in control.” Do not argue with
   a participant who wants to leave.
10. **No covert data enrichment.** We do not combine answers with identity, location,
    social profiles, or third-party data.

## 2. Consent language

The shipping consent screen contains these points:

- “I understand this is a performance of mentalism, not mind reading, and that I can stop
  at any time.”
- “Camera lab opt-in (optional). The show itself never uses the camera. If I visit the lab,
  frames are processed locally, a visible indicator stays on, nothing is uploaded or
  stored, and I can release the camera at any time.”
- “No account is required. Nothing is uploaded.”
- “LOKI does not detect lies, emotions, identity, or any medical condition. It is not a
  diagnostic or safety tool.”

The begin button is disabled until the first box is checked. The camera box is unchecked by
default.

## 3. Power, deception, and the “mentalist” frame

Mentalism is a performance tradition that uses suggestion, framing, and ambiguity. That is
allowed here only when the frame is clear. The following are prohibited:

- Telling a participant the system has access to their memories, search history, messages,
  biometrics, or “subconscious.”
- Using a real personal secret to increase the effect.
- Presenting a miss as the participant’s failure, or a hit as proof of surveillance.
- Using the performance to sell a belief, a therapy, a supplement, a religion, or a
  political claim.
- Recording a reaction for marketing without separate, explicit consent.

The honest frame is also better craft: the audience can enjoy the construction, the
uncertainty, and the graceful miss.

## 4. Camera and gaze

The camera is **not** part of the shipping show. It exists as a lab because the research
question is interesting and because the spec requires a local-only path.

- The lab is opt-in, separate, and labelled “Experimental · never used by the show.”
- A visible red indicator and “CAMERA ON · LOCAL ONLY” badge remain while the stream is
  open.
- The show gate is hard-coded closed (`cameraValidated: false`). A gaze estimate cannot
  reach the belief engine even if the lab produces one.
- The lab reports raw iris displacement as **uncalibrated**. Iris landmarks are not a gaze
  ground truth.
- **Stop camera** and leaving the page stop all tracks and clear the video element.
- MediaPipe model/WASM assets may be fetched from a public CDN when the lab opens; no frame
  data is included in that request. `npm run fetch:gaze-assets` enables a local copy.
- Glasses, low light, head motion, and device differences are known failure modes. The lab
  flags them; it does not claim to solve them.
- No calibration with human participants was performed in this build. The gate remains
  closed.

If a future pilot validates gaze, the gate requires: a pre-registered calibration
protocol, a held-out validation set, measured zone accuracy, a reliability floor, and a
documented decision to include the channel. It is not enough that the demo “looks good.”

## 5. Optional LLM patter

- Off by default. The default build uses bundled lines and spends nothing.
- When on, only a short text template, beat label, and tone go to the local proxy. No
  camera frames, audio, names, or answers are sent.
- The proxy filters output for banned claims and length. On timeout, missing key, refusal,
  rate limit, or bad output, the app keeps the bundled line.
- The LLM never chooses the revealed item, changes the belief state, or writes the consent
  copy.
- The proxy is bound to `127.0.0.1`; do not expose it publicly without authentication and
  spend controls.

## 6. Human pilot protocol (not run)

**Status: 0 participants.** No human-subject data was collected. The protocol below is the
minimum design for a future pilot; it is not a claim that a pilot happened.

### Research question

Under a consent-based, no-camera performance, what is the distribution of answer errors,
completion, perceived agency, and discomfort for The Twelve, and does the shipping gate
hold outside the simulator?

### Design

- Within-subject, counterbalanced order: The Twelve vs a non-adaptive control with the same
  probe budget.
- Target N = 30–60 adults, recruited with no dependent relationship to the performer.
- Inclusion: adult, fluent in the show language, able to read the consent screen.
- Exclusion: anyone who believes the performance is a medical test, anyone in acute
  distress, anyone who cannot consent.
- No deception about data collection. The “mentalism” frame is disclosed up front.

### Procedure

1. Read the consent screen; answer questions; sign/acknowledge.
2. No camera by default. Camera lab is a separate optional session and is not required.
3. Perform The Twelve; answers are categorical only.
4. Complete a short post-show form: perceived accuracy (before/after disclosure), agency,
   comfort, whether they felt pressured, SUS/UX items, and free text.
5. Debrief explicitly: the system did not read their mind; here is the mechanism at the
   level they want.
6. Offer deletion of their session log; do not record video or audio by default.

### Measures

- Per-question answer error (self-report vs chosen card), commit rate, correct/wrong
  reveals, graceful-miss rate.
- Calibration of the reveal confidence against observed correctness (Brier/ECE).
- Perceived agency and comfort (Likert), disclosure comprehension.
- Optional gaze lab: calibration RMSE, zone accuracy, reliability flags; never used to
  drive a scored reveal in the pilot until validated.

### Stopping and adverse events

- Stop immediately on request or visible distress.
- Any participant who believes the system has special access is debriefed and, if needed,
  the session ends.
- Report adverse events and drop-outs; do not silently exclude them.
- No financial or legal incentives that could impair voluntariness.

### Data handling

- Local-first: categorical answers in memory, export only with explicit consent.
- No camera frames stored. If a future study records video, it needs separate consent,
  encryption, a retention period, and a deletion procedure.
- No names, emails, or identifiers in the evaluation dataset.
- Analysis code and de-identified data are published only if consent allows.

### Ethics review

`[UNRESOLVED]` No IRB/ethics-board approval was obtained for this build because no human
subjects were run. A future pilot must obtain the appropriate review before recruitment.

## 7. Accessibility and audience care

- Captions are always visible; the stage is decorative and marked `aria-hidden`.
- The show is keyboard-operable (1/2 to answer, Space/Enter to continue), with visible
  focus and a skip link.
- Reduced-motion preference is respected; the 3D camera drift and card float stop.
- A miss is presented without blame. “You beat me” is the line; it is not a failure state.
- The show should not be performed on someone who has not consented, including in a group
  setting where pressure to participate is high.

## 8. Reporting concerns

If you find a claim, UI string, or behaviour that violates this policy, open an issue with
the exact string and a reproduction. Claims are filtered in code
(`packages/effect-api/src/claims.ts`) and reviewed in docs. Do not ship a demo that relies
on a banned claim even if the filter misses it.

## 9. Known gaps

- 0 human participants; no external validity.
- Gaze is unvalidated and off.
- Force is unvalidated and off.
- The LLM proxy is optional and can fail; the fallback is the product.
- The public repo/demo format is `[UNRESOLVED]`.
- Physical-device and browser coverage is incomplete.
- Long sessions, group dynamics, and repeat performances are out of scope.
