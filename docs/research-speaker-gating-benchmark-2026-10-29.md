# Speaker-gated voice answering: verified components, benchmark design

Date: 2026-10-29. Status: design + verified components; no product change.
Scope note: this is a GATING design (decide which frames/segments are the
subject, transcribe only those). It is not waveform separation. Under
simultaneous overlap, gating leaks; that failure is measured, not hidden.

## Verified facts (checked this date, primary sources)

### Models and licenses

| Component | Artifact | Size | License | Source |
|---|---|---|---|---|
| Speaker segmentation (pyannote segmentation-3.0 ONNX export) | `model.int8.onnx` in `sherpa-onnx-pyannote-segmentation-3-0.tar.bz2` | 1.5 MB | MIT (LICENSE file ships in the tarball; upstream model card: MIT) | https://github.com/k2-fsa/sherpa-onnx/releases/tag/speaker-segmentation-models , upstream https://huggingface.co/pyannote/segmentation-3.0 |
| Speaker embedding (WeSpeaker ResNet34 LM, VoxCeleb-en) | `wespeaker_en_voxceleb_resnet34_LM.onnx` | 26.5 MB | CC BY 4.0 per WeSpeaker's published policy (weights follow the training dataset's license; VoxCeleb is CC BY 4.0: https://wenet-e2e.github.io/wespeaker/pretrained.html). Attribution file ships in apps/web/public/speech-models/ATTRIBUTION.md. pyannote's wrapper of the same model is also CC-BY-4.0 | https://github.com/k2-fsa/sherpa-onnx/releases/tag/speaker-recongition-models (sic, upstream tag name), https://huggingface.co/pyannote/wespeaker-voxceleb-resnet34-LM (CC-BY-4.0, ungated) |
| ASR | onnx-community/whisper-tiny.en via transformers.js (already shipped in the lab timing check) | ~39 MB | Apache-2.0 (weights) | https://huggingface.co/onnx-community/whisper-tiny.en |
| Pipeline utilities | `diarization-js` npm 0.1.0 (fbank, wav decode, resample, segmentation/embedding wrappers, cosine) | 485 KB | Apache-2.0 (code). Not used: its PLDA/VBx clustering path and gated model downloads | https://www.npmjs.com/package/diarization-js |

Model access check: `pyannote/segmentation-3.0` on HF is MIT but GATED
(401 without an account accepting terms) - we do not touch it. The k2-fsa
GitHub releases are openly downloadable and ship the MIT license text.
`pyannote/wespeaker-voxceleb-resnet34-LM` (CC-BY-4.0) is ungated.

### Runnability verified (this date, this repo's sandbox)

- Both ONNX models load and run under onnxruntime-node 1.x:
  - segmentation: input `x` [1,1,160000] -> output `y` [1,589,7] (powerset, ~59 fps)
  - embedding: input `feats` [1,T,80] kaldi fbank -> output `embs` [1,256]
- NOT yet verified: the same models under onnxruntime-web in a browser.
  That is the first thing the benchmark build must prove; claim nothing
  about browser or phone performance until it runs there.
- Whisper-tiny.en WASM transcription already verified in-browser (lab
  timing check): correct transcript, 4.7-5.2x realtime on the sandbox.

### Test audio provenance (no capture, all synthetic mixtures)

11 clips from LibriSpeech test-clean (CC BY 4.0,
https://www.openslr.org/12, Panayotov et al. ICASSP 2015) via the
openly readable HF mirror https://huggingface.co/datasets/openslr/librispeech_asr,
converted to 16 kHz mono WAV, bundled in `apps/web/public/speech-bench/`
with exact clip IDs and reference transcripts in `manifest.json`:

- subject: speaker 6930 (1 enrollment clip 3.5 s + 4 answer clips, 5-23 s)
- non-target: speaker 1320 (4 clips)
- unknown: speaker 5639 (2 clips, never enrolled -> rejection condition)

Attribution required by CC BY 4.0 lives in the manifest.

## Benchmark design (bounded)

Explicit button; fixed bundled clips; nothing recorded, nothing uploaded.
Mixtures are rendered in-page with fixed, documented parameters so the
ground truth is exact.

Conditions (each reported separately, no cherry-picking):
1. Clean control: subject clips concatenated (0.5 s gaps). Baseline WER of
   Whisper on the subject with no gate - the number gating must not degrade.
2. Sequential non-overlap: subject and non-target clips alternating. The
   core living-room case. Metrics: frame-level false-accept rate
   (non-target frames admitted), false-reject rate (subject frames
   dropped), WER gated vs ungated vs clean control.
3. Overlap: subject + non-target mixed simultaneously at 0 dB and -5 dB
   SNR (fixed seeds). Expected to expose the gating leak - reported as a
   failure limit, not hidden.
4. Unknown-speaker rejection: unknown speaker clips only. Gate must
   abstain (no enrolled match). Metric: fraction of frames abstained;
   any transcription produced here is a false accept.

Enrollment: one 3.5 s clip of the subject, embedded once. Gate decision:
segment embeddings from the segmentation output, cosine similarity vs the
enrollment embedding, threshold reported explicitly and not tuned on the
test condition (fit on condition 2 dev split or fixed at a documented
prior; abstention zone reported).

Honesty constraints carried from the brief:
- Gate vs waveform separation stays explicit in the UI copy.
- Abstentions are first-class output, counted and shown.
- No claim that this proves an integrated phone pipeline; it proves the
  gate's behavior on synthetic mixtures in this browser.
- No enrollment of any user voice until product purpose + consent text is
  reviewed; this benchmark never touches the microphone.

## Known failure limits (from cited sources, scoped honestly)

- Overlap leaks through any frame-level gate; TSE (waveform extraction)
  exists (WeSep toolkit https://arxiv.org/html/2409.15799, ONNX-exportable)
  but no permissively licensed TSE model is verified browser-runnable, and
  independent TSE reporting shows clean speech can get worse
  (https://github.com/Zachshotamartin/target-speaker-extraction).
- Reverb and short enrollment degrade embedding separation (personal-VAD
  reproduction reports 0.80 frame accuracy on clean audiobook speech -
  real rooms are worse): https://huggingface.co/wq2012/personal-vad-v1-set-ce
- ConvTasNet blind 2-speaker separation is browser-proven
  (~20 MB, https://webai.show/models/speech-separation/) but cannot say
  WHO is whom and is CC BY-SA 4.0 - noted, not selected.
