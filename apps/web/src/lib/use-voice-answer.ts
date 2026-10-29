/**
 * Voice answering for the sensor-enabled performance: enrollment capture,
 * per-probe listening, and the confirm/deny decision from voice-answer.ts.
 *
 * Honesty rules baked in:
 * - Abstention is first-class: an uncertain clip NEVER becomes an answer.
 *   The retry and the click buttons are explicitly offered manual answers.
 * - A gate rejection never claims identity; the reason string comes from
 *   decideAnswer verbatim.
 * - The embedding lives in memory only and is registered as derived state,
 *   so Stop/Leave/Forget dispose it with everything else.
 * - When voice cannot work (models fail, the person chooses tap answers,
 *   or the enrollment is withdrawn), the microphone is released - capture
 *   without a function is not allowed to linger.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  decideAnswer,
  loadVoiceAnswerModels,
  rmsLevel,
  MIN_RMS,
  type AnswerToken,
  type VoiceAnswerModels
} from "./voice-answer.js";
import { recordClip } from "./capture.js";
import type { SensorSession } from "./sensor-session.js";

export type VoiceState = "loading" | "enroll" | "recording" | "ready" | "manual" | "unavailable";

export interface VoiceOption { id: string; label: string; }

interface VoiceDeps {
  active: boolean;
  session: SensorSession | null;
  /** True while a probe is awaiting an answer (options on screen). */
  probeActive: boolean;
  /** Changes per probe so each question gets exactly one listening cycle. */
  probeKey: string;
  options: VoiceOption[] | undefined;
  onAnswer: (optionId: string) => void;
  /** Voice cannot or will not use the mic - release that capture. */
  onReleaseMic: () => void;
}

const ENROLL_SECONDS = 4;
const ANSWER_SECONDS = 3;

export function mapTokenToOption(token: AnswerToken, options: VoiceOption[] | undefined): VoiceOption | null {
  if (!options?.length) return null;
  const want = token === "confirm" ? /yes|true|right|correct|confirm/i : /no|false|wrong|deny/i;
  return options.find((o) => want.test(o.label) || want.test(o.id)) ?? null;
}

export function useVoiceAnswer({ active, session, probeActive, probeKey, options, onAnswer, onReleaseMic }: VoiceDeps) {
  const [state, setState] = useState<VoiceState>("loading");
  const [listening, setListening] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const modelsRef = useRef<Promise<VoiceAnswerModels> | null>(null);
  const embRef = useRef<Float32Array | null>(null);
  const cancelledRef = useRef(false);
  const listenedKeyRef = useRef<string | null>(null);
  const onAnswerRef = useRef(onAnswer);
  onAnswerRef.current = onAnswer;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const onReleaseMicRef = useRef(onReleaseMic);
  onReleaseMicRef.current = onReleaseMic;

  // Load the on-device models once per session entry.
  useEffect(() => {
    if (!active || modelsRef.current) return;
    const p = loadVoiceAnswerModels(import.meta.env.BASE_URL);
    modelsRef.current = p;
    p.then(() => {
      setState((s) => (s === "loading" ? "enroll" : s));
    }).catch(() => {
      setState("unavailable");
      setFeedback("Voice answering could not load on this device, so the microphone was released. Tap answers continue to work.");
      onReleaseMicRef.current();
    });
  }, [active]);

  const enroll = useCallback(async () => {
    const stream = session?.stream("mic") as unknown as MediaStream | null;
    const modelsP = modelsRef.current;
    if (!stream || !modelsP) return;
    setState("recording");
    setFeedback(null);
    try {
      const clip = await recordClip(stream, ENROLL_SECONDS);
      if (rmsLevel(clip) < MIN_RMS) {
        setState("enroll");
        setFeedback("I could not hear a voice - try again, a little closer to the microphone.");
        return;
      }
      const models = await modelsP;
      const emb = await models.embedPcm(clip);
      embRef.current = emb;
      // Registered as derived state: Stop/Leave dispose it with the rest.
      session?.registerDerived("voice-embedding", () => emb.fill(0));
      setState("ready");
      setFeedback(null);
    } catch {
      setState("enroll");
      setFeedback("Enrollment failed on this device - try again, or use tap answers.");
    }
  }, [session]);

  /** Withdraw voice answering entirely: dispose the embedding, release the mic. */
  const useManual = useCallback(() => {
    cancelledRef.current = true;
    session?.forget("voice-embedding");
    embRef.current = null;
    setState("manual");
    setListening(false);
    setFeedback("Voice answers are off - tap your answers. They are manual answers, not voice.");
    onReleaseMicRef.current();
  }, [session]);

  /** Re-open enrollment after a withdrawal (mic is re-acquired by the caller). */
  const reEnroll = useCallback(() => {
    setFeedback(null);
    setState("enroll");
  }, []);

  // One listening cycle per probe. Abstention-first: uncertain clips never
  // become answers; the fallback is an explicitly labelled manual answer.
  useEffect(() => {
    if (!probeActive || state !== "ready" || listenedKeyRef.current === probeKey) return;
    const stream = session?.stream("mic") as unknown as MediaStream | null;
    const modelsP = modelsRef.current;
    const emb = embRef.current;
    if (!stream || !modelsP || !emb) return;
    listenedKeyRef.current = probeKey;
    cancelledRef.current = false;
    setListening(true);
    setFeedback('Listening for your answer - say "true" or "wrong", or tap.');
    let retried = false;
    const run = async () => {
      const models = await modelsP;
      while (!cancelledRef.current) {
        let clip: Float32Array;
        try {
          clip = await recordClip(stream, ANSWER_SECONDS);
        } catch {
          if (!cancelledRef.current) {
            setListening(false);
            setFeedback("Voice listening failed on this device - tap your answer instead (a manual answer).");
          }
          return;
        }
        if (cancelledRef.current) return;
        const seconds = clip.length / 16000;
        let sim: number | null = null;
        let transcript = "";
        try {
          const dj = await import("diarization-js");
          sim = dj.cosineSimilarity(Array.from(await models.embedPcm(clip)), Array.from(emb)) as number;
          transcript = await models.transcribe(clip);
        } catch {
          sim = null;
          transcript = "";
        }
        if (cancelledRef.current) return;
        const decision = decideAnswer(clip, seconds, sim, transcript);
        if (decision.kind === "answer" && decision.token) {
          const option = mapTokenToOption(decision.token, optionsRef.current);
          if (option) {
            setListening(false);
            setFeedback(`I heard "${decision.token === "confirm" ? "true" : "wrong"}".`);
            onAnswerRef.current(option.id);
            return;
          }
        }
        if (!retried) {
          retried = true;
          setFeedback(`I could not hear a clear "true" or "wrong" (${decision.reason}). One more try - or tap your answer instead (a manual answer).`);
          continue;
        }
        setListening(false);
        setFeedback("Still no clear voice answer - tap your answer instead. That is a manual answer, not voice.");
        return;
      }
    };
    void run();
    return () => {
      cancelledRef.current = true;
      setListening(false);
    };
  }, [probeActive, probeKey, state, session]);

  return { state, listening, feedback, enrolled: state === "ready", enroll, useManual, reEnroll };
}
