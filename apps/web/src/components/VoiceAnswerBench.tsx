import { useCallback, useEffect, useRef, useState } from "react";
import {
  decideAnswer,
  loadVoiceAnswerModels,
  type AnswerDecision
} from "../lib/voice-answer.js";

/**
 * Voice answer-channel bench (synthetic, bounded).
 *
 * What it does: enrolls a SYNTHETIC answerer (Piper TTS voice A from the
 * bundled clips - no user voice anywhere), then runs the real pipeline
 * (speaker gate -> Whisper -> token mapping) over bundled clips: the
 * answerer saying "true"/"wrong" variants, a different talker saying the
 * same tokens, an unknown talker, distractor sentences, an overlapped
 * mixture, and silence.
 *
 * What it is NOT: not real-voice validation, not overlap detection proof,
 * not a product pipeline. Overlapped and ambiguous audio is expected to
 * come out UNCERTAIN - never an attributed answer - and that is measured,
 * not promised. Pass criteria are fixed a priori below; thresholds are the
 * same ones from the speaker-gate bench, not re-tuned.
 */

const BASE = import.meta.env.BASE_URL;
const SR = 16000;

interface ClipRef { file: string; speaker_id: number | null; role: string; expected_token: "confirm" | "deny" | null; text: string; seconds: number }
interface Manifest { clips: ClipRef[] }

interface Row {
  name: string;
  role: string;
  expected: string;
  decision: AnswerDecision;
}

type Phase =
  | { kind: "idle" }
  | { kind: "running"; step: string }
  | { kind: "done"; rows: Row[]; falseAccepts: number; answers: number; correctAnswers: number; misclassified: number; uncertain: number }
  | { kind: "error"; message: string };

function overlay(a: Float32Array, b: Float32Array, gainB: number): Float32Array {
  const n = Math.max(a.length, b.length);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (a[i] ?? 0) + gainB * (b[i % b.length] ?? 0);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]!));
  if (peak > 0.99) for (let i = 0; i < n; i++) out[i] = (out[i]! / peak) * 0.99;
  return out;
}

export function VoiceAnswerBench() {
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
      const manifest = (await (await fetch(`${BASE}voice-answer-bench/manifest.json`)).json()) as Manifest;
      const { decodeWav, cosineSimilarity } = await import("diarization-js");
      const pcms = new Map<string, Float32Array>();
      for (const c of manifest.clips) {
        const buf = await (await fetch(`${BASE}voice-answer-bench/${c.file}`)).arrayBuffer();
        pcms.set(c.file, decodeWav(buf).samples);
      }
      const models = await loadVoiceAnswerModels(BASE);

      say("Enrolling the synthetic answerer (clip, not a person)");
      const enroll = manifest.clips.find((c) => c.role === "enrollment")!;
      const eEnroll = await models.embedPcm(pcms.get(enroll.file)!);

      const noWhisper = new URLSearchParams(window.location.search).get("nowhisper") === "1";

      const rows: Row[] = [];
      const classify = async (name: string, role: string, expected: Row["expected"], pcm: Float32Array) => {
        const seconds = pcm.length / SR;
        const sim = pcm.length >= 0.3 * SR ? cosineSimilarity(Array.from(await models.embedPcm(pcm)), Array.from(eEnroll)) : null;
        const gatePre = sim === null ? "reject" : decideAnswer(pcm, seconds, sim, "").gate;
        // Whisper runs only when the gate accepts - same as production order.
        const transcript = gatePre === "accept" && !noWhisper ? await models.transcribe(pcm) : "";
        const decision = decideAnswer(pcm, seconds, sim, transcript);
        if (gatePre === "accept" && noWhisper) decision.reason = "gate accepted (ASR skipped for this run)";
        rows.push({ name, role, expected, decision });
        if (!alive()) return;
      };

      for (const c of manifest.clips) {
        if (c.role === "enrollment") continue;
        say(`Classifying: ${c.file}`);
        const expected =
          c.role === "target_answer" ? (c.expected_token ?? "?") : "uncertain";
        await classify(c.file, c.role, expected, pcms.get(c.file)!);
      }

      say("Classifying: overlapped mixture (answerer + other talker, 0 dB)");
      const ov = overlay(pcms.get("a-true-2.wav")!, pcms.get("b-sentence-1.wav")!, 1.0);
      await classify("overlap: a-true-2 + b-sentence-1 (0 dB)", "overlap", "uncertain", ov);

      let falseAccepts = 0, answers = 0, correctAnswers = 0, misclassified = 0, uncertain = 0;
      for (const r of rows) {
        if (r.decision.kind === "answer") {
          answers++;
          if (r.role === "target_answer") {
            if (r.decision.token === r.expected) correctAnswers++;
            else misclassified++;
          } else {
            falseAccepts++;
          }
        } else {
          uncertain++;
        }
      }
      if (!alive()) return;
      setPhase({ kind: "done", rows, falseAccepts, answers, correctAnswers, misclassified, uncertain });
    } catch (cause) {
      if (!alive()) return;
      setPhase({ kind: "error", message: cause instanceof Error ? cause.message : "The bench failed." });
    } finally {
      busyRef.current = false;
    }
  }, []);

  return (
    <section className="mic-lab voice-answer-bench" aria-label="Voice answer channel bench">
      <div className="status-card">
        <p className="eyebrow">Voice answer channel bench (synthetic)</p>
        <h2>Answering by voice, on clips - not on you</h2>
        <p>
          The planned answer channel carries only two tokens: confirm and deny. This bench runs the real
          pipeline - speaker gate, then Whisper, then token mapping - on bundled SYNTHETIC clips (Piper
          TTS, LibriTTS-R, CC BY 4.0). The enrolled "answerer" is a clip, never your voice.
        </p>
        <p className="tiny">
          A priori pass criteria: zero false accepts (no answer ever produced from another talker, an
          unknown voice, overlap, or silence); every accepted answer counted for correct token mapping.
          Uncertain is a first-class outcome here - overlapped or ambiguous audio must come out
          uncertain, never an attributed answer. Synthetic clips only: this says nothing yet about real
          microphones or real voices. Thresholds unchanged from the speaker-gate bench (accept 0.5,
          reject 0.35, between = uncertain). Nothing is uploaded.
        </p>

        {phase.kind === "idle" && (
          <button type="button" className="primary" onClick={() => void run()}>
            Run the answer bench
          </button>
        )}
        {phase.kind === "running" && (
          <>
            <p className="tiny">Running: {phase.step}</p>
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
            <div className="gate-results">
              {phase.rows.map((r) => (
                <div key={r.name} className="gate-row">
                  <p>
                    <strong>{r.name}</strong>{" "}
                    <span className="tiny">({r.role}, expected: {r.expected})</span>
                  </p>
                  <p className="tiny">
                    gate: {r.decision.gate}
                    {r.decision.similarity !== null ? ` (similarity ${r.decision.similarity.toFixed(3)})` : ""}
                    {" · "}
                    {r.decision.kind === "answer" ? `answer: ${r.decision.token}` : `uncertain - ${r.decision.reason}`}
                  </p>
                  {r.decision.transcript && <p className="tiny">heard: "{r.decision.transcript}"</p>}
                </div>
              ))}
            </div>
            <p className="tiny">
              Answers produced: {phase.answers} ({phase.correctAnswers} correct token, {phase.misclassified}{" "}
              wrong token) · False accepts: {phase.falseAccepts} (must be 0) · Uncertain: {phase.uncertain}.
            </p>
            <button type="button" className="chip" onClick={() => void run()}>Run it again</button>
          </>
        )}
      </div>
    </section>
  );
}
