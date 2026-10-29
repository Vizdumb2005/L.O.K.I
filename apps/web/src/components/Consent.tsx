import { useEffect, useRef, useState } from "react";
import { EFFECTS, type EffectId } from "../lib/effects.js";

export type ShowMode = "click" | "sensor";

interface ConsentProps {
  onEnter: (effectId: EffectId, cameraOptIn: boolean, mode: ShowMode) => void;
  /** True when returning from a show (Leave/Escape): move focus to the consent heading. */
  restoreFocus?: boolean;
  /** True when the sensor-enabled performance just stopped or could not start. */
  sensorNotice?: string | null;
}

export function Consent({ onEnter, restoreFocus = false, sensorNotice = null }: ConsentProps) {
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (restoreFocus) mainRef.current?.focus({ preventScroll: true });
  }, [restoreFocus]);
  const [effectId, setEffectId] = useState<EffectId>("card-twelve");
  const [understood, setUnderstood] = useState(false);
  const [cameraOptIn, setCameraOptIn] = useState(false);
  const [mode, setMode] = useState<ShowMode>("click");
  const [presenceConsent, setPresenceConsent] = useState(false);
  const [micConsent, setMicConsent] = useState(false);
  const [enrollConsent, setEnrollConsent] = useState(false);
  const sensorsSupported =
    typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";

  return (
    <main className="consent" id="main" ref={mainRef} tabIndex={-1}>
      <section className="consent-hero">
        <p className="eyebrow">A consent-based performance</p>
        <h1 className="wordmark" aria-label="LOKI">
          LOKI
        </h1>
        <p className="lede">
          I will ask you to hold something in your mind. I will ask a few questions. Then I
          will make one guess.
        </p>
        <p className="lede lede-small">
          It is an illusion, not mind reading. You are always free to stop, answer honestly,
          or lie to me.
        </p>
        <div className="consent-rule" />
        <p className="fine-print">
          LOKI does not detect lies, emotions, identity, or any medical condition. It is not
          a diagnostic or safety tool. No account is required. Nothing is uploaded.
        </p>
      </section>

      <section className="consent-panel" aria-labelledby="consent-heading">
        <h2 id="consent-heading">Before we begin</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={understood}
            onChange={(event) => setUnderstood(event.target.checked)}
          />
          <span>
            I understand this is a <strong>performance of mentalism</strong>, not mind
            reading, and that I can stop at any time.
          </span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={cameraOptIn}
            onChange={(event) => setCameraOptIn(event.target.checked)}
          />
          <span>
            <strong>Camera lab opt-in (optional).</strong> The click demo never uses the
            camera; the sensor-enabled mode uses it only as described below. In the lab,
            frames are processed locally, a visible indicator stays on, nothing is
            uploaded or stored, and I can release the camera at any time.
          </span>
        </label>

        <fieldset className="effect-picker">
          <legend>Choose an effect</legend>
          {EFFECTS.map((choice) => (
            <label
              key={choice.id}
              className={`effect-choice ${effectId === choice.id ? "is-selected" : ""}`}
            >
              <input
                type="radio"
                name="effect"
                value={choice.id}
                checked={effectId === choice.id}
                onChange={() => setEffectId(choice.id)}
              />
              <span className="effect-choice-copy">
                <span className="effect-eyebrow">{choice.eyebrow}</span>
                <span className="effect-title">{choice.title}</span>
                <span className="effect-blurb">{choice.blurb}</span>
                <span className="effect-meta">{choice.meta}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <fieldset className="effect-picker">
          <legend>How do you want to play</legend>
          <label className={`effect-choice ${mode === "click" ? "is-selected" : ""}`}>
            <input
              type="radio"
              name="mode"
              value="click"
              checked={mode === "click"}
              onChange={() => setMode("click")}
            />
            <span className="effect-choice-copy">
              <span className="effect-eyebrow">The existing show</span>
              <span className="effect-title">Click demo</span>
              <span className="effect-blurb">
                Answer by click or key. No camera, no microphone. Same method and same
                cards - without the sensor mode's presence texture.
              </span>
            </span>
          </label>
          <label
            className={`effect-choice ${mode === "sensor" ? "is-selected" : ""} ${sensorsSupported ? "" : "is-disabled"}`}
          >
            <input
              type="radio"
              name="mode"
              value="sensor"
              checked={mode === "sensor"}
              disabled={!sensorsSupported}
              onChange={() => setMode("sensor")}
            />
            <span className="effect-choice-copy">
              <span className="effect-eyebrow">Experimental - camera required</span>
              <span className="effect-title">Sensor-enabled performance</span>
              <span className="effect-blurb">
                Your camera is used for one bounded purpose: noticing that a face is present during
                the settling moment. Frames are processed in this tab and discarded immediately; the
                camera never helps guess your card. A visible indicator stays on while it is active,
                and Stop ends the performance and releases the camera.
              </span>
              <span className="effect-blurb">
                Your microphone lets you answer by voice: you say "true" or "wrong" to the
                performer's claims. Audio is processed in this tab and discarded; uncertain
                hearing falls back to click. This channel passed synthetic-clip checks only -
                real-device validation is pending, so it is labelled experimental, not proven.
                {sensorsSupported ? "" : " This device or browser does not expose camera capture."}
              </span>
            </span>
          </label>
        </fieldset>

        {mode === "sensor" && (
          <>
            <label className="check">
              <input
                type="checkbox"
                checked={presenceConsent}
                onChange={(event) => setPresenceConsent(event.target.checked)}
              />
              <span>
                I allow the camera for <strong>presence only</strong>, exactly as described above -
                required for the sensor-enabled performance.
              </span>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={micConsent}
                onChange={(event) => setMicConsent(event.target.checked)}
              />
              <span>
                I allow the microphone for <strong>answering by voice</strong>: short clips are
                processed in this tab to hear "true" or "wrong", then discarded. Nothing is
                uploaded. Required for the sensor-enabled performance.
              </span>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={enrollConsent}
                onChange={(event) => setEnrollConsent(event.target.checked)}
              />
              <span>
                I allow a <strong>voice enrollment</strong>: 3-10 seconds of my speech so LOKI can
                tell my voice from other voices in the room during this performance. The voice
                print is computed in this tab, kept only in memory, discarded when I stop or
                leave, never uploaded, and I can withdraw it any time with "Forget my voice". It
                is not identification or sign-in - and it is still sensitive, which is why nothing
                is kept. Required for the sensor-enabled performance.
              </span>
            </label>
          </>
        )}

        {sensorNotice && (
          <p className="tiny" role="status">
            {sensorNotice}
          </p>
        )}

        <button
          type="button"
          className="primary"
          disabled={!understood || (mode === "sensor" && !(presenceConsent && micConsent && enrollConsent))}
          onClick={() => onEnter(effectId, cameraOptIn, mode)}
        >
          {mode === "sensor" ? "Enter with camera" : "Enter the observatory"}
        </button>
        <p className="tiny">
          Best with a quiet room and a screen at arm's length. Captions are always on.
        </p>
      </section>
    </main>
  );
}
