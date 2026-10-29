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
  decideOptionAnswer,
  loadVoiceAnswerModels,
  rmsLevel,
  MIN_RMS,
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
  /**
   * Voice cannot or will not run (models failed, enrollment declined or
   * withdrawn). The mic is a REQUIRED capability of this mode, so this must
   * end or pause the sensor-enabled performance - never continue it
   * camera-only with tap answers.
   */
  onEndSensorMode: (reason: string) => void;
}

const ENROLL_SECONDS = 4;
const ANSWER_SECONDS = 3;

export function useVoiceAnswer({ active, session, probeActive, probeKey, options, onAnswer, onEndSensorMode }: VoiceDeps) {
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
  const onEndSensorModeRef = useRef(onEndSensorMode);
  onEndSensorModeRef.current = onEndSensorMode;

  // Load the on-device models once per session entry.
  useEffect(() => {
    if (!active || modelsRef.current) return;
    const p = loadVoiceAnswerModels(import.meta.env.BASE_URL);
    modelsRef.current = p;
    p.then(() => {
      setState((s) => (s === "loading" ? "enroll" : s));
    }).catch(() => {
      setState("unavailable");
      onEndSensorModeRef.current(
        "The on-device voice models could not load here, and the sensor-enabled performance requires voice answering - so it has ended, and every sensor was released. The click demo below runs without sensors."
      );
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

  /**
   * Decline or withdraw voice answering. The mic is a required capability of
   * this mode, so this ends the sensor-enabled performance (same teardown as
   * Stop); the click demo remains a separate, clearly labelled choice.
   */
  const useManual = useCallback((reason: "declined" | "forgotten") => {
    cancelledRef.current = true;
    session?.forget("voice-embedding");
    embRef.current = null;
    setState("manual");
    setListening(false);
    onEndSensorModeRef.current(
      reason === "forgotten"
        ? "Your voice enrollment was withdrawn, and the sensor-enabled performance requires voice answering - so it has ended, and every sensor was released. The click demo below runs without sensors."
        : "Voice answering was declined, and the sensor-enabled performance requires it - so it did not start, and every sensor was released. The click demo below runs without sensors."
    );
  }, [session]);

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
    const labels = (optionsRef.current ?? []).map((o) => o.label);
    const yesNo =
      labels.length === 2 &&
      /^(yes|y)$|true|fits|\bright\b|correct/i.test(labels[0] ?? "") &&
      /^(no|n)$|wrong|false|incorrect/i.test(labels[1] ?? "");
    setListening(true);
    setFeedback(
      yesNo
        ? 'Listening for your answer - say "true" or "wrong", or tap.'
        : `Listening for your answer - say one of: ${labels.join(", ")} - or tap.`
    );
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
        const decision = decideOptionAnswer(clip, seconds, sim, transcript, labels);
        if (decision.kind === "answer" && decision.index !== null) {
          const option = (optionsRef.current ?? [])[decision.index];
          if (option) {
            setListening(false);
            setFeedback(`I heard "${option.label}".`);
            onAnswerRef.current(option.id);
            return;
          }
        }
        if (!retried) {
          retried = true;
          setFeedback(`I could not hear a clear answer (${decision.reason}). One more try - or tap your answer instead (a manual answer).`);
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

  return { state, listening, feedback, enrolled: state === "ready", enroll, useManual };
}
