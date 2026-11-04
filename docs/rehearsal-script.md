# Countdown Force - demo rehearsal script (offline path)

Run-of-show for the recorded demo. The offline path (no conductor endpoint
configured) is the default recording: it proves the act, the seal, and the
honesty contract without any network dependency. If hosted mode is approved
and budget-verified, the same beats run with the opt-in shown on camera.

## Setup (before recording)

- `npm run dev` in the repo root; open the app at the local URL.
- Fresh profile or cleared storage so the seal is new.
- Confirm the badge never appears in script mode: no "words written live"
  badge is honest because every line is scripted.

## Beats (target: under 3 minutes)

1. **Arrive at Act III (Countdown).** The seal panel is already visible.
   Show the commitment hash. Say: "This was sealed before you chose a number."
   (Never "before you arrived" - the hash binds the prediction to the
   arrangement, it is not an external timestamp.)
2. **Name a number.** Enter a spectator-style choice in 10-19, e.g. 13.
   Show the rejection path once with an out-of-range value (e.g. 25) to prove
   the number is honored verbatim, never reinterpreted.
3. **Deal.** Watch the deal order animate. The oracle line narrates.
4. **Count.** Tap through the digit-sum count (13 -> 1+3 = 4 cards). The last
   card counted is the selection.
5. **Open the seal.** Reveal lands theatrically - just the match and the
   sealed card, no method explanation on this screen.
6. **Optional: "How it works".** Toggle the trace panel. This is where the
   method, the arithmetic, and the full interaction trace live - available,
   never forced.

## Honesty checks to keep on camera

- The trace panel shows: named number, counted steps, produced card, sealed
  target, seal verification. Nothing hidden.
- A miss is possible and owned: the seal opens and says so. (Do not stage a
  miss in the main recording; mention it in voiceover if time allows.)
- No claim that a model predicted anything. If hosted mode is shown, the
  on-screen opt-in states exactly what is sent (public trace state only) and
  the badge reads "words written live by Muse Spark Open" on model lines
  only - text, no voice.

## Fallback rules during recording

- If anything stutters, the scripted voice continues the show; never
  re-record just because a model line fell back.
- No retakes that change the named number after the seal is shown - the seal
  hash on camera must match the run.
