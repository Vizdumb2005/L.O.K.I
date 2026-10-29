import { useCallback, useEffect, useRef, useState } from "react";

/**
 * On-device speech-to-text timing check for the lab.
 *
 * Boundaries, on purpose: a FIXED 11-second sample clip (JFK, public domain) is
 * transcribed - never the microphone, never anything recorded. The model
 * (whisper-tiny.en, Apache-2.0, ~39 MB) downloads once from Hugging Face when -
 * and only when - the person starts the check, and the browser caches it. All
 * inference runs in this tab; no audio or text leaves the device.
 */

interface BenchResult {
  backend: string;
  downloadMs: number;
  loadMs: number;
  clipSeconds: number;
  transcribeMs: number;
  realtimeFactor: number;
  transcript: string;
}

type Phase =
  | { kind: "idle" }
  | { kind: "downloading"; pct: number }
  | { kind: "loading" }
  | { kind: "transcribing" }
  | { kind: "done"; result: BenchResult }
  | { kind: "error"; message: string };

const SAMPLE_URL = `${import.meta.env.BASE_URL}speech-sample.wav`;

async function loadClip16k(): Promise<{ audio: Float32Array; seconds: number }> {
  const response = await fetch(SAMPLE_URL);
  if (!response.ok) throw new Error(`Sample clip fetch failed (${response.status}).`);
  const bytes = await response.arrayBuffer();
  const decode = new AudioContext();
  try {
    const buffer = await decode.decodeAudioData(bytes);
    const targetRate = 16000;
    const offline = new OfflineAudioContext(1, Math.ceil(buffer.duration * targetRate), targetRate);
    const source = offline.createBufferSource();
    source.buffer = buffer;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return { audio: rendered.getChannelData(0), seconds: buffer.duration };
  } finally {
    void decode.close().catch(() => undefined);
  }
}

export function VoiceBench() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const abortRef = useRef(0);
  const busyRef = useRef(false);

  useEffect(() => () => { abortRef.current += 1; }, []);

  const cancel = useCallback(() => {
    // Do NOT clear busyRef here: the in-flight run's finally block owns it.
    // Clearing it early would let a second run start while the first is live.
    abortRef.current += 1;
    setPhase({ kind: "idle" });
  }, []);

  const run = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    const runId = ++abortRef.current;
    const alive = () => abortRef.current === runId;
    try {
      const t0 = performance.now();
      setPhase({ kind: "downloading", pct: 0 });
      const { pipeline, env } = await import("@huggingface/transformers");
      env.allowLocalModels = false;
      let downloadMs = -1;
      const transcriber = await pipeline(
        "automatic-speech-recognition",
        "onnx-community/whisper-tiny.en",
        {
          device: "webgpu" in navigator ? "webgpu" : "wasm",
          dtype: "webgpu" in navigator ? "fp16" : "q8",
          progress_callback: (p: { status?: string; progress?: number }) => {
            if (!alive()) return;
            if (p.status === "progress" && typeof p.progress === "number") {
              setPhase({ kind: "downloading", pct: Math.round(p.progress) });
            } else if (p.status === "ready") {
              downloadMs = performance.now() - t0;
              setPhase({ kind: "loading" });
            }
          }
        } as Record<string, unknown>
      );
      if (!alive()) return;
      const loadMs = performance.now() - t0;
      setPhase({ kind: "transcribing" });

      const clip = await loadClip16k();
      if (!alive()) return;
      const t1 = performance.now();
      // A 16 kHz Float32Array is valid input: the pipeline resamples against the
      // model's own feature-extractor sampling rate (verified with a real run).
      const output = (await transcriber(clip.audio)) as
        | { text?: string }
        | Array<{ text?: string }>;
      const transcribeMs = performance.now() - t1;
      const transcript = Array.isArray(output)
        ? output.map((chunk) => chunk.text ?? "").join(" ")
        : (output.text ?? "");
      if (!alive()) return;

      setPhase({
        kind: "done",
        result: {
          backend: "webgpu" in navigator ? "WebGPU" : "WASM",
          downloadMs: downloadMs >= 0 ? downloadMs : loadMs,
          loadMs,
          clipSeconds: clip.seconds,
          transcribeMs,
          realtimeFactor: clip.seconds / (transcribeMs / 1000),
          transcript: transcript.trim()
        }
      });
    } catch (cause) {
      if (!alive()) return;
      const message =
        cause instanceof Error && /memory|wasm|simd|gpu/i.test(cause.message)
          ? `This device could not run the model (${cause.message}). That is a real result: on-device speech is not viable here.`
          : cause instanceof Error
            ? cause.message
            : "The timing check failed.";
      setPhase({ kind: "error", message });
    } finally {
      busyRef.current = false;
    }
  }, []);

  const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

  return (
    <section className="mic-lab" aria-label="On-device speech timing">
      <div className={`status-card ${phase.kind === "done" ? "is-live" : ""}`}>
        <p className="eyebrow">Speech timing check</p>
        {phase.kind === "idle" && (
          <>
            <p>
              Time speech-to-text running entirely on THIS device. It transcribes a fixed
              11-second sample clip (JFK, public domain) - never your microphone, never
              anything you say.
            </p>
            <button type="button" className="primary" onClick={() => void run()}>
              Download the model and run the timing
            </button>
            <p className="tiny">
              Downloads the whisper-tiny.en model (~39 MB, Apache-2.0) once from Hugging
              Face; the browser caches it after that. Everything runs in this tab. No
              audio, text, or usage data is uploaded anywhere.
            </p>
          </>
        )}
        {(phase.kind === "downloading" || phase.kind === "loading" || phase.kind === "transcribing") && (
          <>
            <p>
              {phase.kind === "downloading" && `Downloading the model… ${phase.pct}%`}
              {phase.kind === "loading" && "Model downloaded. Warming up the recognizer…"}
              {phase.kind === "transcribing" && "Transcribing the fixed sample clip on this device…"}
            </p>
            <button type="button" className="chip" onClick={cancel}>
              Cancel
            </button>
          </>
        )}
        {phase.kind === "done" && (
          <>
            <dl>
              <div>
                <dt>Backend</dt>
                <dd>{phase.result.backend}</dd>
              </div>
              <div>
                <dt>Model download + load</dt>
                <dd>{seconds(phase.result.loadMs)} (cached next time)</dd>
              </div>
              <div>
                <dt>Clip length</dt>
                <dd>{phase.result.clipSeconds.toFixed(1)}s of speech</dd>
              </div>
              <div>
                <dt>Transcription time</dt>
                <dd>
                  {seconds(phase.result.transcribeMs)} ({phase.result.realtimeFactor.toFixed(1)}x realtime)
                </dd>
              </div>
              <div>
                <dt>Transcript</dt>
                <dd>"{phase.result.transcript}"</dd>
              </div>
            </dl>
            <p className="tiny">
              Measured on this device, this browser, this moment. It says nothing about
              any other device - and it is timing only, not proof that voice answers
              belong in the show.
            </p>
            <button type="button" className="chip" onClick={() => void run()}>
              Run it again
            </button>
          </>
        )}
        {phase.kind === "error" && (
          <>
            <p className="error" role="alert">{phase.message}</p>
            <button type="button" className="chip" onClick={() => void run()}>
              Try again
            </button>
          </>
        )}
      </div>
    </section>
  );
}
