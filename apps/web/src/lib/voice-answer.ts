/**
 * Voice answer channel pipeline (synthetic-first).
 *
 * Carries exactly two tokens - confirm ("true of my card") and deny
 * ("that's wrong") - from the enrolled answerer's voice. Everything else
 * is UNCERTAIN: rejected or abstained at the speaker gate, too short,
 * silence, or speech that does not map to a clear token. Uncertain is a
 * first-class outcome: the caller re-presents the statement or offers the
 * click alternative; it is never silently resolved into an answer and
 * never attributed to a voice.
 *
 * Bounded by the PR #22 measurements: the speaker gate keeps an enrolled
 * voice and rejects other talkers in turn-taking on synthetic clips, but
 * reliable overlap DETECTION is not proven - overlapped or ambiguous audio
 * here becomes "uncertain", never an attributed answer.
 *
 * Nothing is uploaded; models run in-tab; the enrollment embedding lives
 * only in memory for the session.
 */

// A priori thresholds, fixed before any run (same discipline as PR #22).
export const TAU_ACCEPT = 0.5;
export const TAU_REJECT = 0.35;
export const MIN_ANSWER_SECONDS = 0.3;
export const MIN_RMS = 0.001; // digital silence floor

export type AnswerToken = "confirm" | "deny";

export interface AnswerDecision {
  kind: "answer" | "uncertain";
  token: AnswerToken | null;
  gate: "accept" | "abstain" | "reject";
  similarity: number | null;
  transcript: string;
  reason: string;
}

const CONFIRM_CUES = ["true", "yes", "yeah", "yep", "fits", "fit", "correct", "right", "sure", "agree"];
const DENY_CUES = ["wrong", "no", "nope", "not", "dont", "don't", "doesnt", "doesn't", "incorrect", "false", "deny"];

/** Map a transcript to an answer token. Returns null when unclear or conflicting. */
export function mapAnswerToken(transcript: string): AnswerToken | null {
  const norm = ` ${transcript.toLowerCase().replace(/[^a-z'\s]/g, " ").replace(/\s+/g, " ")} `;
  let confirm = 0;
  let deny = 0;
  for (const cue of CONFIRM_CUES) if (norm.includes(` ${cue} `)) confirm++;
  for (const cue of DENY_CUES) if (norm.includes(` ${cue} `) || norm.includes(` ${cue}'`)) deny++;
  // "not" negates a following confirm cue: "not true" is a denial.
  if (norm.includes(" not true") || norm.includes(" not correct") || norm.includes(" not right") || norm.includes(" doesn't fit") || norm.includes(" does not fit")) {
    deny += 1;
    confirm = Math.max(0, confirm - 1);
  }
  if (confirm > 0 && deny === 0) return "confirm";
  if (deny > 0 && confirm === 0) return "deny";
  return null;
}

const YES_LABEL = /^(yes|y)$|true|fits|\bright\b|correct/i;
const NO_LABEL = /^(no|n)$|wrong|false|incorrect/i;

/**
 * Match a transcript against the spoken form of each option label.
 * Yes/No options accept the confirm/deny cue sets (the prompt tells the
 * person to say "true" or "wrong"); other labels match as whole words.
 * Returns the single matching index, or null when zero or several match -
 * an ambiguous hearing never becomes an answer.
 */
export function matchSpokenOption(transcript: string, labels: string[]): number | null {
  const norm = ` ${transcript.toLowerCase().replace(/[^a-z'\s]/g, " ").replace(/\s+/g, " ")} `;
  const hits: number[] = [];
  labels.forEach((label, i) => {
    let matched = false;
    if (YES_LABEL.test(label)) {
      matched = CONFIRM_CUES.some((cue) => norm.includes(` ${cue} `)) &&
        !(norm.includes(" not true") || norm.includes(" not correct") || norm.includes(" not right") || norm.includes(" doesn't fit") || norm.includes(" does not fit"));
    } else if (NO_LABEL.test(label)) {
      matched = DENY_CUES.some((cue) => norm.includes(` ${cue} `) || norm.includes(` ${cue}'`)) ||
        norm.includes(" not true") || norm.includes(" not correct") || norm.includes(" not right") || norm.includes(" doesn't fit") || norm.includes(" does not fit");
    } else {
      const word = label.toLowerCase().replace(/[^a-z'\s]/g, " ").trim();
      matched = word.length > 0 && norm.includes(` ${word} `);
    }
    if (matched) hits.push(i);
  });
  return hits.length === 1 ? hits[0]! : null;
}

export function rmsLevel(pcm: Float32Array): number {
  if (pcm.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) sum += pcm[i]! * pcm[i]!;
  return Math.sqrt(sum / pcm.length);
}

interface OrtLike {
  InferenceSession: { create(bytes: Uint8Array, opts: Record<string, unknown>): Promise<{ run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array }>> }> };
  Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown;
}

export interface VoiceAnswerModels {
  embedPcm: (pcm: Float32Array) => Promise<Float32Array>;
  transcribe: (pcm: Float32Array) => Promise<string>;
}

interface GpuAdapterInfoLike {
  isFallbackAdapter?: boolean;
}

/**
 * WebGPU is worth its speed only when a real GPU backs it. A software
 * (fallback) adapter renders Whisper through CPU emulation with a much
 * higher memory footprint than the plain WASM build - in testing, three
 * sensor-mode page loads on a software adapter exhausted the browser. When
 * the adapter cannot prove it is hardware (no adapter, no info API, or an
 * explicit fallback adapter), take the WASM/q8 path: slower per clip, far
 * smaller and steadier in memory.
 */
export async function qualifyWebGPU(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("gpu" in navigator)) return false;
  // Requesting an adapter can initialize an expensive software graphics
  // stack before it ever answers. On small devices that allocation alone
  // is a memory hazard (measured: repeated probing on a 2 GB device
  // exhausted the browser). Where deviceMemory says the device is small,
  // take the WASM path without touching WebGPU at all.
  const memoryGB = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  if (typeof memoryGB === "number" && memoryGB <= 4) return false;
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<{ info?: GpuAdapterInfoLike } | null> } }).gpu;
    const adapter = await gpu?.requestAdapter();
    if (!adapter || !adapter.info) return false;
    return adapter.info.isFallbackAdapter !== true;
  } catch {
    return false;
  }
}

/** Load the embedding model and Whisper. Mirrors the PR #21/#22 loading paths. */
export async function loadVoiceAnswerModels(base: string): Promise<VoiceAnswerModels> {
  const ort = (await import("onnxruntime-web")) as unknown as OrtLike & { env: { wasm: { wasmPaths: string } } };
  ort.env.wasm.wasmPaths = `${base}ort/`;
  const embBytes = new Uint8Array(await (await fetch(`${base}speech-models/wespeaker-resnet34-lm.onnx`)).arrayBuffer());
  const emb = await ort.InferenceSession.create(embBytes, { executionProviders: ["wasm"] });
  const dj = await import("diarization-js");
  const embedPcm = async (pcm: Float32Array) => {
    const fb = dj.pyannoteFbank(pcm);
    const t = new ort.Tensor("float32", new Float32Array(fb.data), [1, fb.numFrames, fb.numBins]);
    const o = await emb.run({ feats: t });
    return o.embs.data as Float32Array;
  };
  const { pipeline } = await import("@huggingface/transformers");
  const useWebGPU = await qualifyWebGPU();
  const asr = (await pipeline("automatic-speech-recognition", "onnx-community/whisper-tiny.en", {
    device: useWebGPU ? "webgpu" : "wasm",
    dtype: useWebGPU ? "fp16" : "q8"
  } as Record<string, unknown>)) as unknown as (audio: Float32Array, opts?: Record<string, unknown>) => Promise<{ text?: string } | Array<{ text?: string }>>;
  const transcribe = async (pcm: Float32Array) => {
    const o = await asr(pcm, { chunk_length_s: 30, stride_length_s: 5 } as Record<string, unknown>);
    return (Array.isArray(o) ? o.map((c) => c.text ?? "").join(" ") : (o.text ?? "")).trim();
  };
  return { embedPcm, transcribe };
}

export function gateDecision(similarity: number): "accept" | "abstain" | "reject" {
  if (similarity >= TAU_ACCEPT) return "accept";
  if (similarity <= TAU_REJECT) return "reject";
  return "abstain";
}

/**
 * Classify one answer utterance. `cosineSimilarity` is injected so the pure
 * decision path is testable without the models.
 */
export function decideAnswer(
  pcm: Float32Array,
  seconds: number,
  similarity: number | null,
  transcript: string
): AnswerDecision {
  if (seconds < MIN_ANSWER_SECONDS) {
    return { kind: "uncertain", token: null, gate: "reject", similarity, transcript, reason: "too short to be an answer" };
  }
  if (rmsLevel(pcm) < MIN_RMS) {
    return { kind: "uncertain", token: null, gate: "reject", similarity, transcript, reason: "silence" };
  }
  const gate = similarity === null ? "abstain" : gateDecision(similarity);
  if (gate !== "accept") {
    return {
      kind: "uncertain",
      token: null,
      gate,
      similarity,
      transcript: "",
      reason:
        gate === "reject"
          ? "could not confidently match the enrolled voice - no answer accepted"
          : "voice match uncertain - no answer accepted"
    };
  }
  const token = mapAnswerToken(transcript);
  if (!token) {
    return { kind: "uncertain", token: null, gate, similarity, transcript, reason: "no clear true-or-wrong in what was heard" };
  }
  return { kind: "answer", token, gate, similarity, transcript, reason: "" };
}

export interface OptionDecision {
  kind: "answer" | "uncertain";
  index: number | null;
  gate: "accept" | "abstain" | "reject";
  reason: string;
}

/**
 * Classify one answer utterance against arbitrary option labels. Same
 * length/silence/speaker gate as decideAnswer; the what-was-said match is
 * matchSpokenOption. Abstention-first: any ambiguity is uncertain, and a
 * gate rejection never claims identity.
 */
export function decideOptionAnswer(
  pcm: Float32Array,
  seconds: number,
  similarity: number | null,
  transcript: string,
  labels: string[]
): OptionDecision {
  if (seconds < MIN_ANSWER_SECONDS) {
    return { kind: "uncertain", index: null, gate: "reject", reason: "too short to be an answer" };
  }
  if (rmsLevel(pcm) < MIN_RMS) {
    return { kind: "uncertain", index: null, gate: "reject", reason: "silence" };
  }
  const gate = similarity === null ? "abstain" : gateDecision(similarity);
  if (gate !== "accept") {
    return {
      kind: "uncertain",
      index: null,
      gate,
      reason:
        gate === "reject"
          ? "could not confidently match the enrolled voice - no answer accepted"
          : "voice match uncertain - no answer accepted"
    };
  }
  const index = matchSpokenOption(transcript, labels);
  if (index === null) {
    return { kind: "uncertain", index: null, gate, reason: "no single clear option in what was heard" };
  }
  return { kind: "answer", index, gate, reason: "" };
}
