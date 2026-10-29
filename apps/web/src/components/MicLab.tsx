import { useCallback, useEffect, useRef, useState } from "react";
import { MicVad, rmsToDb, type VadState } from "./mic-vad.js";

interface MicSettings {
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  channelCount?: number;
  sampleRate?: number;
}

/**
 * Microphone check for the lab: local-only levels, an adaptive noise floor, and an
 * energy-based sound-activity indicator. Nothing is recorded, stored, or transmitted;
 * the audio graph feeds an analyser and is discarded frame by frame.
 */
export function MicLab() {
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);
  const vadRef = useRef(new MicVad());
  const lastPushRef = useRef(0);
  const bufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<VadState>({ levelDb: -120, floorDb: -60, active: false });
  const [settings, setSettings] = useState<MicSettings | null>(null);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void contextRef.current?.close().catch(() => undefined);
    contextRef.current = null;
    vadRef.current.reset();
    setRunning(false);
    setState({ levelDb: -120, floorDb: -60, active: false });
    setSettings(null);
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    if (starting || streamRef.current) return;
    setStarting(true);
    setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser does not expose a microphone API.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false
      });
      streamRef.current = stream;
      const track = stream.getAudioTracks()[0];
      if (track) {
        const raw = track.getSettings() as MediaTrackSettings & MicSettings;
        setSettings({
          echoCancellation: raw.echoCancellation,
          noiseSuppression: raw.noiseSuppression,
          autoGainControl: raw.autoGainControl,
          channelCount: raw.channelCount,
          sampleRate: raw.sampleRate
        });
        track.addEventListener("ended", () => stop());
      }

      const context = new AudioContext();
      contextRef.current = context;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser); // analyser only; nothing is rendered, recorded or sent
      bufferRef.current = new Float32Array(analyser.fftSize);

      const tick = (now: number) => {
        if (!contextRef.current) return;
        const buffer = bufferRef.current!;
        analyser.getFloatTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i]! * buffer[i]!;
        const rms = Math.sqrt(sum / buffer.length);
        const next = vadRef.current.update(rmsToDb(rms), now);
        // React state at ~10 Hz; the analyser itself runs every frame.
        if (now - lastPushRef.current > 100) {
          lastPushRef.current = now;
          setState({ ...next });
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      setRunning(true);
    } catch (cause) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setError(
        cause instanceof DOMException && cause.name === "NotAllowedError"
          ? "Microphone permission was declined. Nothing was captured."
          : cause instanceof Error
            ? cause.message
            : "The microphone could not be opened."
      );
    } finally {
      setStarting(false);
    }
  }, [starting, stop]);

  // Map dBFS (-70..0) onto the bar.
  const toPct = (db: number) => Math.max(0, Math.min(100, ((db + 70) / 70) * 100));

  return (
    <section className="mic-lab" aria-label="Microphone check">
      <div className={`status-card ${running ? "is-live" : ""}`}>
        <p className="eyebrow">Microphone check</p>
        {!running ? (
          <>
            <p>
              Hear what the room looks like as a signal: the live level, the noise floor
              the lab has learned, and whether sound is clearly above it.
            </p>
            <button type="button" className="primary" disabled={starting} onClick={() => void start()}>
              {starting ? "Opening microphone…" : "Start microphone check"}
            </button>
            <p className="tiny">
              Your browser will ask for microphone permission. Audio is analysed in this
              tab and thrown away immediately - nothing is recorded, stored, or sent
              anywhere.
            </p>
          </>
        ) : (
          <>
            <div className="mic-meter" role="img" aria-label="Live microphone level">
              <div className="mic-level" style={{ width: `${toPct(state.levelDb)}%` }} />
              <div
                className="mic-floor"
                style={{ left: `${toPct(state.floorDb + 12)}%` }}
                title="Noise floor + margin"
              />
            </div>
            <dl>
              <div>
                <dt>Room signal</dt>
                <dd>{state.active ? "sound above the room's floor" : "quiet"}</dd>
              </div>
              <div>
                <dt>Level</dt>
                <dd>{Math.round(state.levelDb)} dBFS</dd>
              </div>
              <div>
                <dt>Learned noise floor</dt>
                <dd>{Math.round(state.floorDb)} dBFS</dd>
              </div>
              {settings && (
                <div>
                  <dt>Browser processing</dt>
                  <dd>
                    {[
                      settings.noiseSuppression ? "noise suppression on" : "noise suppression off",
                      settings.echoCancellation ? "echo cancellation on" : "echo cancellation off"
                    ].join(" · ")}
                  </dd>
                </div>
              )}
            </dl>
            <button type="button" className="chip" onClick={stop}>
              Stop microphone
            </button>
          </>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
      <div className="gate-card">
        <p className="eyebrow">What this can and cannot do</p>
        <p>
          It can tell that sound rose above the room's floor. It cannot tell speech from
          music or clatter, it cannot tell who is speaking, and it cannot pull one voice
          out of background voices. Nothing here hears words, and nothing here feeds the
          show.
        </p>
        <p className="tiny">
          Separating the subject's voice from other voices in the room is not something
          this build does or claims. A quiet room stays a hard requirement for any future
          voice input.
        </p>
      </div>
    </section>
  );
}
