# Real-device validation spec (gate 2): sensor-enabled performance

Status: ready to run. Requires one real device with camera + microphone and
one or two real people. This is the gate-2 test for the sensor-enabled
performance build; it complements the felt-quality pilot in
`docs/pilot-protocol.md` and `docs/pilot-script-2026-10-29.md` (human
participants: 0; no participant outreach is authorized by this document).
Everything below is a measurement protocol with a priori thresholds -
thresholds are not weakened after the fact; a miss is a bug report, not a
re-definition.

## What this validates (and what it does not)

Validates, on real hardware with real voices:

- Enrollment capture: 4 s of speech produces a usable in-memory voice print.
- Turn-taking voice answering: the enrolled person's spoken answers are heard
  and mapped to the intended option.
- Speaker gate: a non-enrolled voice answering the same probes is not
  accepted. A rejection never claims identity - only "could not confidently
  match the enrolled voice - no answer accepted".
- Abstention: silence, too-short audio, and ambiguous speech never become
  answers; the manual tap fallback is offered explicitly, never silently.
- Teardown: Stop / Leave / Forget-my-voice release every track and dispose
  the embedding; losing required capture (mic or camera unplugged or
  OS-revoked) pauses or ends the sensor-enabled performance.
- Presence at attune: the presence check runs; frames stay in-tab.

Does NOT validate (stays unclaimed after this test):

- Overlap robustness: two people talking at once. Fixture measurements show
  the gate drops ambiguous audio rather than leaking, but reliable overlap
  detection is not proven.
- Felt quality: whether the show feels like a performer. That is the
  participant pilot's question and is never self-declared.
- Any identity, emotion, or mind-reading claim.

## Fixture baseline (what the synthetic benches already show)

These are plumbing checks on fixed clips, not device validation:

- Speaker-gate bench (LibriSpeech test-clean, CC BY 4.0): turn-taking
  0 false accepts on fixtures, WER 55% -> 3% on subject clips; unknown
  speakers 18/18 rejected; overlap degrades to rejection, not leakage.
- Voice-answer bench (Piper TTS / LibriTTS-R, CC BY 4.0): 0 false accepts
  on fixtures; 3/3 accepted answers mapped to the correct token; utterances
  under ~0.5 s are unreliable, so prompts ask for phrases.

## Setup

- One laptop or phone with a working camera and microphone, current Chrome
  or Safari. Quiet room, one speaker at a time.
- Person A (enrolled) sits at the device. Person B (not enrolled) is in the
  room for the rejection steps. If only one person is available, the B
  steps use a phone playing a recorded voice and are marked as such.
- Open the deployed build, choose "Sensor-enabled performance", check all
  four consent boxes, enter with camera + mic.
- Total time: about 10 minutes.

## Procedure and a priori pass thresholds

1. Enrollment. Enroll A's voice (say "I am thinking of one card", ~4 s).
   Pass: enrollment accepted on the first or second attempt.
2. Enrolled answering. On the next 6 answerable probes, A speaks scripted
   answers (3 confirmations, 3 denials, or the spoken option label on
   multi-option probes). Pass: at least 5 of 6 accepted and mapped to the
   intended option, each confirmed by the "I heard ..." line.
3. Rejection. On 2 probes, B (or the recording) speaks the answer instead.
   Pass: 0 of 2 accepted; the feedback line is the identity-safe
   "could not confidently match the enrolled voice - no answer accepted".
4. Abstention. On 1 probe stay silent for the whole window; on 1 probe say
   "um, maybe". Pass: 0 accepted; after one retry the tap fallback is
   offered and labelled as a manual answer.
5. Manual fallback. Tap the remaining probes. Pass: tap answers always
   work, during and after listening windows.
6. Forget my voice. Mid-show, press "Forget my voice". Pass: the mic
   indicator disappears, the feedback says voice answers are off and tap
   answers are manual, and "Enroll voice" re-opens enrollment.
7. Capture loss. With the show running, unplug the microphone (or revoke
   mic permission in the OS/browser). Pass: the sensor-enabled performance
   pauses or ends with a notice - it does not continue unchanged. Repeat
   for the camera if practical.
8. Teardown. Press Stop sensors, then Leave. Pass: OS camera/mic
   indicators go dark; returning to consent shows the sensor-stopped
   notice; no upload or storage is claimed anywhere.

Any failed threshold: record the step, the device, the browser, and the
exact feedback line shown, and file it as a bug. Do not adjust the
thresholds to make the run pass.

## Evidence to keep

- A screen recording of the full run.
- The list of feedback lines shown at steps 3 and 4 (verbatim).
