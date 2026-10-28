import { useEffect, useRef, useState } from "react";
import { EFFECTS, type EffectId } from "../lib/effects.js";

interface ConsentProps {
  onEnter: (effectId: EffectId, cameraOptIn: boolean) => void;
  /** True when returning from a show (Leave/Escape): move focus to the consent heading. */
  restoreFocus?: boolean;
}

export function Consent({ onEnter, restoreFocus = false }: ConsentProps) {
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (restoreFocus) mainRef.current?.focus({ preventScroll: true });
  }, [restoreFocus]);
  const [effectId, setEffectId] = useState<EffectId>("card-twelve");
  const [understood, setUnderstood] = useState(false);
  const [cameraOptIn, setCameraOptIn] = useState(false);

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
            <strong>Camera lab opt-in (optional).</strong> The show itself never uses the
            camera. If I visit the lab, frames are processed locally, a visible indicator
            stays on, nothing is uploaded or stored, and I can release the camera at any
            time.
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

        <button
          type="button"
          className="primary"
          disabled={!understood}
          onClick={() => onEnter(effectId, cameraOptIn)}
        >
          Enter the observatory
        </button>
        <p className="tiny">
          Best with a quiet room and a screen at arm's length. Captions are always on.
        </p>
      </section>
    </main>
  );
}
