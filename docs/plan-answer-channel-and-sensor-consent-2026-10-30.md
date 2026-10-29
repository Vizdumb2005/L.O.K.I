# Bounded camera+mic permission/stop flow and safe answer channel — plan

Date: 2026-10-30. Status: plan, not implementation. Trigger: the user's
explicit request that camera and mic be MANDATORY parts of the experience, and
the performer's need for a natural answer channel. This plan preserves that
mandatory intent: the intended mode is a sensor-enabled performance, not a
click show with optional sensors. It is deliberately bounded by two rules from
the owner's review:

1. Sensors never infer the card. No card inference from camera or mic where no
   measured channel exists. Gaze-zone measurement stays a lab instrument with
   its gate CLOSED; it is not an answer channel and not a card channel.
2. Felt quality is a participant-validation hypothesis. Nothing here declares
   the experience "human".

## What an answer channel is (and is not)

The effect already asks questions/probes and, in the statement-flow prototype
(PR #24), presents claims. An answer channel is only how the spectator answers:
today by click. The safe sensor answer channel proposed here carries exactly
two tokens - "true of my card" / "that's wrong" (equivalently yes/no) - and
nothing else. It does not carry identity, emotion, attention, or any inferred
state.

## Current repo facts this builds on

- `Consent.tsx`: two explicit checkboxes before entry (illusion understood;
  camera opt-in), "stop at any time" copy.
- `CameraLab`: camera opens only on explicit action; stop tears down; frames
  local and discarded; zone measurement is fit/held-out with the gate CLOSED.
- `MicLab`: browser mic permission requested only on explicit start; audio
  analysed in-tab and discarded immediately; stop tears down.
- `VoiceBench` (PR #21): Whisper-tiny WASM runs locally; timing verified.
- `SpeakerGateBench` (PR #22): on-device speaker gate (pyannote segmentation
  int8 + WeSpeaker resnet34), fixed LibriSpeech clips, a priori thresholds
  (accept 0.5, reject 0.35, between = abstain). Measured: turn-taking subject
  speech kept with every non-target window rejected (0 false accepts, WER
  55%->3%); overlap is dropped rather than un-mixed (WER stays poor - honest
  rejection, not separation); unknown voices rejected 18/18; abstentions
  counted. These are synthetic-clip numbers, not device numbers.

## Permission and stop flow (to build)

Mandatory capability, per-purpose consent. The user asked for camera and mic
to be mandatory. Consent being per-purpose does not make the sensors optional
for the sensor-enabled performance: BOTH camera and microphone permissions are
required to run that mode, each requested and explained for its own purpose.
That combination is compatible when it is explained plainly - the person
agrees to each purpose, and the mode needs both.

- Separate consent steps for Camera and Microphone, each stating: the
  purpose, exactly what is captured, where it is processed (this tab only),
  retention (none), and how to stop. No bundling of unrelated lab data or
  enrollment into the show's permission; the lab benches keep their own
  separate scopes.
- If a sensor is declined or unsupported (no getUserMedia, WASM SIMD
  missing, model download fails): the sensor-enabled performance cannot run.
  What is offered instead is the EXISTING click demo, clearly labelled as
  the click demo - never presented as the same experience, and the
  unmet requirement is stated explicitly.
- Active sensors show a persistent indicator. One-tap Stop: media tracks
  stopped, workers terminated, derived state (including any voice embedding)
  discarded - and the sensor-enabled performance PAUSES OR ENDS. It does not
  silently continue on click as if the mandatory capability were still met;
  the click demo may be offered as a separate, labelled choice.
- No inferred permission for third parties: copy states the effect listens
  for the enrolled answerer only; other voices are never attributed.

## Voice enrollment (3-10 s) — new sensitive voice processing

Enrollment is a separate consent step, distinct from mic permission, shown
before any collection:

- Purpose: "so LOKI can tell your voice from other voices in the room during
  this effect."
- Capture: 3-10 seconds of speech, in this tab, while a sentence is read
  aloud. No third parties: enrollment asks for a quiet moment with one
  speaker. Whether multi-voice contamination during enrollment can be
  RELIABLY detected is an implemented-check question to be measured, not a
  promise - see the honesty note below.
- Processing: a speaker embedding (WeSpeaker) computed locally, held in
  memory only.
- Retention: none. The embedding is discarded on Stop, on effect end, and on
  tab close. Nothing is uploaded; no account exists to attach it to.
- Withdrawal: a "Forget my voice" control, available whenever enrolled,
  with the same teardown as Stop.
- Explicit non-claims: this is not identification, authentication, or any
  statement about who the person is; it is a same-session discriminator
  between the enrolled answerer and other sound. The non-authentication
  framing does not reduce its sensitivity: a voice embedding is
  biometric-adjacent data, hence no persistence, no sharing, and the
  withdrawal control above.

Preparation without any user voice: the enrollment, gating, and
answer-mapping pipeline will be built and tested against the bundled
LibriSpeech clips (CC BY 4.0, already in the repo for PR #22) through a
synthetic-capture test mode that drives the same code path. Real-voice
collection begins only after this consent surface exists and the pipeline
has passed its synthetic gates.

## Failure, repeat, overlap, and abstention (answer channel)

Honesty note first: PR #22 did NOT prove reliable overlap DETECTION. On
synthetic mixtures the gate often dropped or rejected overlapped speech, but
that is not a guarantee, and no implemented check yet promises "overlap
rejected" or "multi-voice enrollment fails". Those behaviours are targets to
implement and measure, not claims.

- Ambiguous audio is UNCERTAIN, never attributed: low confidence, possible
  overlap, or an unclear token leads to the statement being re-presented,
  with the click alternative offered - never silently resolved into an
  answer and never assigned to a voice.
- Repeat: re-presentation is bounded (once per statement) so a noisy room
  degrades to click, not to a loop.
- Expected quality, stated honestly: PR #22's turn-taking rejection and
  overlap-drop behaviour are synthetic-clip results. Real microphones add
  echo, noise, and far-field speech; the prototype treats the click channel
  as the correctness floor and voice as the intended mandatory texture that
  must earn its place through the validation gates below.

## Camera

The user's request makes camera mandatory; that does not justify pointless
mandatory capture, and sensors still never infer the card. Camera needs a
grounded functional purpose. Candidates, with status:

- Face presence for the existing "attune" beat (the effect script already
  has a camera-on attunement beat): honest, bounded, no inference about the
  card. Needs only presence detection, which the MediaPipe landmarker
  already provides locally.
- Gesture answering (nod/shake as confirm/deny): plausible answer channel,
  but gesture semantics vary by culture and individual, so it requires
  per-person calibration before use and its own measured gate. Not
  validated today.

If no camera purpose passes validation at implementation time, camera stays
in experimental enablement and the unmet part of the user's mandatory-camera
requirement is made explicit to them - the requirement is reported as
unresolved, not silently dropped and not satisfied by capture without
function.

## Validation gates before any product enablement

1. Synthetic: enrollment + gate + answer mapping on the bundled clips,
   a priori pass criteria (0 false accepts of non-target answers in
   turn-taking; ambiguous/overlap audio surfaced as uncertain, never
   resolved into an answer; the implemented overlap/multi-voice checks
   measured honestly against their targets).
2. Real-device: repeat the PR #22 benchmark conditions (quiet, fan noise,
   overlap) through actual microphone capture on at least one laptop-class
   and one phone-class device, same a priori thresholds.
3. If either gate fails: product enablement is blocked, the experimental
   lab mode is preserved, and the exact ready test is reported (device
   class, condition, threshold, observed numbers). No threshold weakening
   to force a pass.
