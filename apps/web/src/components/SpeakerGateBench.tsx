import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Speaker-gate feasibility benchmark (synthetic, bounded).
 *
 * What it does: given FIXED bundled clips (LibriSpeech test-clean, CC BY 4.0,
 * exact IDs in manifest.json), it renders four deterministic mixtures IN PAGE,
 * enrolls one subject clip, and measures how well an on-device speaker gate
 * (pyannote segmentation + WeSpeaker embedding match, MIT / Apache-2.0 code)
 * keeps only the subject's speech for Whisper.
 *
 * What it is NOT: not waveform separation, not a product pipeline, not proof
 * about any phone. The microphone is never touched. Nothing is uploaded.
 * Overlap is expected to leak - that failure is measured and shown.
 */

const BASE = import.meta.env.BASE_URL;
const SR = 16000;
const GAP = 0.5 * SR;
// A priori decision thresholds, fixed before any run. The gray zone between
// them is abstention - counted, never silently resolved.
const TAU_ACCEPT = 0.5;
const TAU_REJECT = 0.35;
const WIN_SEC = 3;
const HOP_SEC = 1.5;

interface ClipRef { file: string; id: string; speaker: number; role: string; seconds: number }
interface Manifest { clips: ClipRef[]; transcripts: Record<string, string> }

interface Region { start: number; end: number; truth: "subject" | "non_target" | "unknown" | "silence" }

interface ConditionResult {
  name: string;
  seconds: number;
  windows: number;
  falseAccepts: number;
  falseRejects: number;
  abstentions: number;
  correctKeeps: number;
  correctDrops: number;
  werUngated: number | null;
  werGated: number | null;
  gatedTranscript: string;
  note: string;
}

type Phase =
  | { kind: "idle" }
  | { kind: "running"; step: string }
  | { kind: "done"; results: ConditionResult[]; cleanWer: number | null }
  | { kind: "error"; message: string };

function wer(reference: string, hypothesis: string): number {
  const r = reference.toLowerCase().replace(/[^a-z0-9' ]/g, " ").split(/\s+/).filter(Boolean);
  const h = hypothesis.toLowerCase().replace(/[^a-z0-9' ]/g, " ").split(/\s+/).filter(Boolean);
  if (r.length === 0) return h.length === 0 ? 0 : 1;
  const dp: number[] = Array.from({ length: h.length + 1 }, (_, j) => j);
  for (let i = 1; i <= r.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= h.length; j++) {
      const t = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (r[i - 1] === h[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return dp[h.length] / r.length;
}

function mix(clips: { pcm: Float32Array; truth: Region["truth"] }[]): { pcm: Float32Array; regions: Region[] } {
  const total = clips.reduce((n, c) => n + c.pcm.length + GAP, 0);
  const pcm = new Float32Array(total);
  const regions: Region[] = [];
  let at = 0;
  for (const c of clips) {
    pcm.set(c.pcm, at);
    regions.push({ start: at, end: at + c.pcm.length, truth: c.truth });
    at += c.pcm.length + GAP;
  }
  return { pcm, regions };
}

function overlay(
  subject: { pcm: Float32Array }[],
  bg: { pcm: Float32Array }[],
  bgGain: number
): { pcm: Float32Array; regions: Region[] } {
  const base = mix(subject.map((c) => ({ ...c, truth: "subject" as const })));
  const regions = [...base.regions];
  let at = 0;
  for (let i = 0; i < bg.length; i++) {
    const start = base.regions[Math.min(i, base.regions.length - 1)].start;
    const b = bg[i].pcm;
    for (let s = 0; s < b.length && start + s < base.pcm.length; s++) {
      base.pcm[start + s] = Math.max(-1, Math.min(1, base.pcm[start + s] + b[s] * bgGain));
    }
    regions.push({ start, end: start + b.length, truth: "non_target" });
    at = start + b.length;
  }
  return { pcm: base.pcm, regions };
}

function truthAt(regions: Region[], t0: number, t1: number): Region["truth"] {
  const hits = regions.filter((r) => r.end > t0 && r.start < t1).map((r) => r.truth);
  const active = hits.filter((h) => h !== "silence");
  if (active.length === 0) return "silence";
  return active.includes("subject") ? "subject" : active[0];
}

export function SpeakerGateBench() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const abortRef = useRef(0);
  const busyRef = useRef(false);
  useEffect(() => () => { abortRef.current += 1; }, []);
  const cancel = useCallback(() => { abortRef.current += 1; setPhase({ kind: "idle" }); }, []);

  const run = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    const runId = ++abortRef.current;
    const alive = () => abortRef.current === runId;
    const say = (step: string) => { if (alive()) setPhase({ kind: "running", step }); };
    try {
      say("Loading clips and models");
      const manifest = (await (await fetch(`${BASE}speech-bench/manifest.json`)).json()) as Manifest;
      const pcms = new Map<string, Float32Array>();
      const { decodeWav } = await import("diarization-js");
      for (const c of manifest.clips) {
        const buf = await (await fetch(`${BASE}speech-bench/${c.file}`)).arrayBuffer();
        pcms.set(c.file, decodeWav(buf).samples);
      }
      const ort = await import("onnxruntime-web");
      ort.env.wasm.wasmPaths = `${BASE}ort/`;
      const dj = await import("diarization-js");
      const ortRuntime = ort as unknown as import("diarization-js").OrtRuntime;
      const segBytes = new Uint8Array(await (await fetch(`${BASE}speech-models/segmentation-3-0.int8.onnx`)).arrayBuffer());
      const embBytes = new Uint8Array(await (await fetch(`${BASE}speech-models/wespeaker-resnet34-lm.onnx`)).arrayBuffer());
      const seg = await dj.SegmentationModel.load(segBytes, ortRuntime);
      const emb = await dj.EmbeddingModel.load(embBytes, ortRuntime);

      say("Enrolling the fixed subject clip");
      const enrollClip = manifest.clips.find((c) => c.role === "enrollment")!;
      const enrollPcm = pcms.get(enrollClip.file)!;
      const enrollFb = dj.pyannoteFbank(enrollPcm);
      const eEnroll = await emb.embed(enrollFb.data, enrollFb.numFrames);

      const test = manifest.clips.filter((c) => c.role === "subject_test");
      const bg = manifest.clips.filter((c) => c.role === "non_target");
      const unk = manifest.clips.filter((c) => c.role === "unknown_rejection");
      const clipOf = (c: ClipRef) => pcms.get(c.file)!;

      const conditions: { name: string; pcm: Float32Array; regions: Region[]; ref: string; note: string }[] = [
        (() => { const m = mix(test.map((c) => ({ pcm: clipOf(c), truth: "subject" as const })));
          return { name: "Clean control (subject only)", ...m, ref: test.map((c) => manifest.transcripts[c.file]).join(" "), note: "Baseline: no gate needed; gating must not hurt this." }; })(),
        (() => { const seq: { pcm: Float32Array; truth: Region["truth"] }[] = [];
          for (let i = 0; i < test.length; i++) { seq.push({ pcm: clipOf(test[i]), truth: "subject" }); if (bg[i]) seq.push({ pcm: clipOf(bg[i]), truth: "non_target" }); }
          const m = mix(seq);
          return { name: "Sequential, no overlap", ...m, ref: test.map((c) => manifest.transcripts[c.file]).join(" "), note: "The living-room case: talkers take turns." }; })(),
        (() => { const m = overlay(test.map((c) => ({ pcm: clipOf(c) })), bg.map((c) => ({ pcm: clipOf(c) })), 1.0);
          return { name: "Overlap at 0 dB", ...m, ref: test.map((c) => manifest.transcripts[c.file]).join(" "), note: "Expected to leak: a gate cannot un-mix simultaneous speech." }; })(),
        (() => { const m = mix(unk.map((c) => ({ pcm: clipOf(c), truth: "unknown" as const })));
          return { name: "Unknown speaker (never enrolled)", ...m, ref: "", note: "The gate must abstain or reject; any subject transcript here is a false accept." }; })()
      ];

      const { pipeline } = await import("@huggingface/transformers");
      let transcriber: ((audio: Float32Array) => Promise<{ text?: string } | Array<{ text?: string }>>) | null = null;

      const results: ConditionResult[] = [];
      for (const cond of conditions) {
        if (!alive()) return;
        say(`Segmenting: ${cond.name}`);
        const segRes = await seg.run(cond.pcm, { stepRatio: 0.5 });
        // Speech activity from segmentation: any local speaker active per frame.
        const frameAct: boolean[] = new Array(segRes.numFrames).fill(false);
        const nSpk = segRes.numLocalSpeakers;
        for (let ch = 0; ch < segRes.numChunks; ch++) {
          const startFrame = Math.round((segRes.chunkStarts[ch] * SR) / (segRes.frameDurationSec * SR));
          for (let f = 0; f < segRes.numFrames; f++) {
            const idx = (ch * segRes.numFrames + f) * nSpk;
            let any = false;
            for (let s = 0; s < nSpk; s++) if (segRes.data[idx + s]) any = true;
            if (any) frameAct[Math.min(startFrame + f, frameAct.length - 1)] = true;
          }
        }

        say(`Gating windows: ${cond.name}`);
        let fa = 0, fr = 0, abst = 0, keep = 0, drop = 0;
        const gatedChunks: Float32Array[] = [];
        let windows = 0;
        for (let w0 = 0; w0 + WIN_SEC * SR <= cond.pcm.length; w0 += HOP_SEC * SR) {
          const w1 = w0 + WIN_SEC * SR;
          const f0 = Math.floor(w0 / (segRes.frameDurationSec * SR));
          const f1 = Math.min(frameAct.length - 1, Math.floor(w1 / (segRes.frameDurationSec * SR)));
          let speech = 0;
          for (let f = f0; f <= f1; f++) if (frameAct[f]) speech++;
          if (speech / Math.max(1, f1 - f0 + 1) < 0.3) continue;
          windows++;
          const slice = cond.pcm.slice(w0, w1);
          const fb = dj.pyannoteFbank(slice);
          const e = await emb.embed(fb.data, fb.numFrames);
          const sim = dj.cosineSimilarity(e, eEnroll);
          const truth = truthAt(cond.regions, w0, w1);
          const wants = truth === "subject";
          if (sim >= TAU_ACCEPT) {
            if (wants) { keep++; gatedChunks.push(slice); } else { fa++; }
          } else if (sim <= TAU_REJECT) {
            if (wants) fr++; else drop++;
          } else abst++;
          if (!alive()) return;
        }

        say(`Transcribing: ${cond.name}`);
        const join = (chunks: Float32Array[]) => {
          const n = chunks.reduce((a, c) => a + c.length, 0);
          const out = new Float32Array(n);
          let at = 0; for (const c of chunks) { out.set(c, at); at += c.length; }
          return out;
        };
        let werU: number | null = null, werG: number | null = null, gatedText = "";
        if (cond.ref) {
          if (!transcriber) {
            say("Downloading the Whisper model (one time, ~39 MB)");
            transcriber = (await pipeline("automatic-speech-recognition", "onnx-community/whisper-tiny.en", { device: "webgpu" in navigator ? "webgpu" : "wasm", dtype: "webgpu" in navigator ? "fp16" : "q8" } as Record<string, unknown>)) as unknown as typeof transcriber;
          }
          const text = async (audio: Float32Array) => {
            const o = await transcriber!(audio);
            return (Array.isArray(o) ? o.map((c) => c.text ?? "").join(" ") : (o.text ?? "")).trim();
          };
          werU = wer(cond.ref, await text(cond.pcm));
          if (gatedChunks.length > 0) {
            gatedText = await text(join(gatedChunks));
            werG = wer(cond.ref, gatedText);
          }
        } else if (gatedChunks.length > 0) {
          gatedText = "Gate ACCEPTED unknown speech (false accept) - no transcript produced by design.";
        } else {
          gatedText = "Nothing accepted - correct abstention.";
        }

        results.push({
          name: cond.name, seconds: cond.pcm.length / SR, windows,
          falseAccepts: fa, falseRejects: fr, abstentions: abst,
          correctKeeps: keep, correctDrops: drop,
          werUngated: werU, werGated: werG, gatedTranscript: gatedText, note: cond.note
        });
      }
      if (!alive()) return;
      setPhase({ kind: "done", results, cleanWer: results[0]?.werGated ?? null });
    } catch (cause) {
      if (!alive()) return;
      setPhase({ kind: "error", message: cause instanceof Error ? cause.message : "The benchmark failed." });
    } finally {
      busyRef.current = false;
    }
  }, []);

  const pct = (x: number | null) => (x === null ? "-" : `${(x * 100).toFixed(0)}%`);

  return (
    <section className="mic-lab" aria-label="Speaker gate benchmark">
      <div className={`status-card ${phase.kind === "done" ? "is-live" : ""}`}>
        <p className="eyebrow">Speaker gate benchmark (synthetic)</p>
        {phase.kind === "idle" && (
          <>
            <p>
              Measures an on-device speaker GATE on fixed synthetic mixtures: given one
              enrollment clip, which speech frames belong to that voice, and what does
              gating do to transcription? Uses bundled LibriSpeech clips (CC BY 4.0) -
              never your microphone, nothing uploaded.
            </p>
            <button type="button" className="primary" onClick={() => void run()}>
              Run the gate benchmark
            </button>
            <p className="tiny">
              Downloads ~28 MB of models (segmentation MIT, embedding WeSpeaker).
              Gate, not waveform separation: overlapped speech is expected to leak and
              that condition is reported, not hidden. Thresholds are fixed in advance
              (accept {TAU_ACCEPT}, reject {TAU_REJECT}); in between counts as abstain.
            </p>
          </>
        )}
        {phase.kind === "running" && (
          <>
            <p>{phase.step}…</p>
            <button type="button" className="chip" onClick={cancel}>Cancel</button>
          </>
        )}
        {phase.kind === "error" && (
          <>
            <p className="error" role="alert">{phase.message}</p>
            <button type="button" className="chip" onClick={() => void run()}>Try again</button>
          </>
        )}
        {phase.kind === "done" && (
          <>
            {phase.results.map((r) => (
              <div key={r.name} style={{ marginBottom: "0.75rem" }}>
                <p><strong>{r.name}</strong> <span className="tiny">({r.seconds.toFixed(0)}s, {r.windows} windows)</span></p>
                <p className="tiny">{r.note}</p>
                <dl>
                  <div><dt>Kept correctly</dt><dd>{r.correctKeeps}</dd></div>
                  <div><dt>Dropped correctly</dt><dd>{r.correctDrops}</dd></div>
                  <div><dt>False accepts</dt><dd>{r.falseAccepts}</dd></div>
                  <div><dt>False rejects</dt><dd>{r.falseRejects}</dd></div>
                  <div><dt>Abstentions</dt><dd>{r.abstentions}</dd></div>
                  {r.werUngated !== null && <div><dt>WER ungated</dt><dd>{pct(r.werUngated)}</dd></div>}
                  {r.werGated !== null && <div><dt>WER gated</dt><dd>{pct(r.werGated)}</dd></div>}
                </dl>
                <p className="tiny">Gated output: {r.gatedTranscript.slice(0, 220) || "(empty)"}</p>
              </div>
            ))}
            <p className="tiny">
              Synthetic mixtures from fixed clips on this device, this browser, this
              moment. It measures gate behavior; it is not waveform separation and says
              nothing about any other device or a real room.
            </p>
            <button type="button" className="chip" onClick={() => void run()}>Run it again</button>
          </>
        )}
      </div>
    </section>
  );
}
