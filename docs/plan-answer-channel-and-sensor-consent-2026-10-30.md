# Bounded camera+mic permission/stop flow and safe answer channel — plan

Date: 2026-10-30. Status: plan, not implementation. Trigger: user's request that
camera and mic become part of the experience, and the performer's need for a
natural answer channel. This plan is deliberately bounded by two rules from the
owner's review:

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

One unified, per-sensor, per-purpose consent surface (effect + lab):

- Separate toggles for Camera and Microphone. No bundling, no pre-ticked
  boxes. Browser permission is requested only at the moment of enabling.
- Each toggle states: the purpose ("answer by voice"), exactly what is
  captured, where it is processed (this tab only), retention (none), and how
  to stop.
- Active sensors show a persistent indicator. One-tap Stop: media tracks
  stopped, workers terminated, derived state (including any voice embedding)
  discarded, answering returns to click mid-effect without penalty.
- No inferred permission for third parties: copy states the effect listens
  for the enrolled answerer only; other voices are rejected, never
  attributed. A bystander's speech is data we actively discard.
- Unsupported devices (no getUserMedia, WASM SIMD missing, model download
  fails): answer channel stays click, stated in the UI, not an error.

## Voice enrollment (3-10 s) — new sensitive voice processing

Enrollment is a separate consent step, distinct from mic permission, shown
before any collection:

- Purpose: "so LOKI can tell your voice from other voices in the room during
  this effect."
- Capture: 3-10 seconds of speech, in this tab, while a sentence is read
  aloud. No third parties: if the gate hears more than one voice during
  enrollment, enrollment fails honestly and asks for a quieter moment.
- Processing: a speaker embedding (WeSpeaker) computed locally, held in
  memory only.
- Retention: none. The embedding is discarded on Stop, on effect end, and on
  tab close. Nothing is uploaded; no account exists to attach it to.
- Withdrawal: a "Forget my voice" control, available whenever enrolled,
  with the same teardown as Stop.
- Explicit non-claims: this is not identification, authentication, or any
  statement about who the person is; it is a same-session discriminator
  between the enrolled answerer and other sound.

Preparation without any user voice: the enrollment, gating, and
answer-mapping pipeline will be built and tested against the bundled
LibriSpeech clips (CC BY 4.0, already in the repo for PR #22) through a
synthetic-capture test mode that drives the same code path. Real-voice
collection begins only after this consent surface exists and the pipeline
has passed its synthetic gates.

## Failure, repeat, overlap, and abstention (answer channel)

- Abstain/low confidence: the statement is re-presented once, then that
  answer falls back to click. Abstention is first-class; it is never
  silently resolved into an answer.
- Overlap (two voices): rejected, not attributed; copy: "I heard more than
  one voice - I need yours alone." Statement re-presented.
- Repeat: re-presentation is bounded (once per statement) so a noisy room
  degrades to click, not to a loop.
- Expected quality, stated honestly: PR #22's turn-taking rejection and
  overlap-drop behaviour are synthetic-clip results. Real microphones add
  echo, noise, and far-field speech; the prototype treats the click channel
  as the correctness floor and voice as an optional texture.

## Camera

Camera answers nothing today: no measured channel qualifies. The unified
permission flow covers camera now because the experience request includes
camera presence, but any future camera-fed answer or presence beat requires
its own measured, a priori gate - same discipline as the voice channel.

## Validation gates before any product enablement

1. Synthetic: enrollment + gate + answer mapping on the bundled clips,
   a priori pass criteria (0 false accepts of non-target answers in
   turn-taking; overlap answers abstained/rejected, never resolved).
2. Real-device: repeat the PR #22 benchmark conditions (quiet, fan noise,
   overlap) through actual microphone capture on at least one laptop-class
   and one phone-class device, same a priori thresholds.
3. If either gate fails: product enablement is blocked, the experimental
   lab mode is preserved, and the exact ready test is reported (device
   class, condition, threshold, observed numbers). No threshold weakening
   to force a pass.
