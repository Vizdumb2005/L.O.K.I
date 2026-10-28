import { useState } from "react";
import { CameraLab } from "./components/CameraLab.js";
import { Consent } from "./components/Consent.js";
import { Performance } from "./components/Performance.js";
import { effectChoice, type EffectId } from "./lib/effects.js";

type Screen = "show" | "lab";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function App() {
  const [entered, setEntered] = useState(false);
  const [hasLeft, setHasLeft] = useState(false);
  const [screen, setScreen] = useState<Screen>("show");
  const [effectId, setEffectId] = useState<EffectId>("card-twelve");
  const [cameraOptIn, setCameraOptIn] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const [llmEnabled, setLlmEnabled] = useState(false);

  const choice = effectChoice(effectId);

  const enter = (nextEffect: EffectId, nextCameraOptIn: boolean) => {
    setEffectId(nextEffect);
    setCameraOptIn(nextCameraOptIn);
    setEntered(true);
    setScreen("show");
  };

  const leave = () => {
    setHasLeft(true);
    setEntered(false);
    setScreen("show");
  };

  return (
    <div className={`app ${reducedMotion ? "reduce-motion" : ""}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {entered ? (
        <header className="app-header">
          <button type="button" className="brand-button" onClick={() => setScreen("show")}>
            <span className="brand-mark" aria-hidden="true">
              L
            </span>
            <span>
              <span className="brand-word">LOKI</span>
              <span className="brand-sub">Nocturne Observatory</span>
            </span>
          </button>
          <nav className="app-nav" aria-label="Primary">
            <button
              type="button"
              className={screen === "show" ? "nav-link is-active" : "nav-link"}
              onClick={() => setScreen("show")}
            >
              The show
            </button>
            <button
              type="button"
              className={screen === "lab" ? "nav-link is-active" : "nav-link"}
              onClick={() => setScreen("lab")}
              disabled={!cameraOptIn}
              title={cameraOptIn ? "Experimental camera lab" : "Camera lab was not opted in"}
            >
              Camera lab
              <span className="nav-note">experimental</span>
            </button>
            <button type="button" className="nav-link" onClick={leave}>
              Reset
            </button>
          </nav>
        </header>
      ) : (
        <header className="app-header app-header-bare">
          <span className="brand-word">LOKI</span>
          <span className="brand-sub">A performance of mentalism</span>
        </header>
      )}

      {entered && screen === "lab" ? (
        <CameraLab
          cameraOptIn={cameraOptIn}
          onBack={() => setScreen("show")}
          onReviewConsent={leave}
        />
      ) : entered ? (
        <Performance
          effect={choice.effect}
          reducedMotion={reducedMotion}
          llmEnabled={llmEnabled}
          cameraReady={false}
          onExit={leave}
          onOpenLab={() => setScreen("lab")}
          onToggleReducedMotion={() => setReducedMotion((value) => !value)}
          onToggleLlm={() => setLlmEnabled((value) => !value)}
        />
      ) : (
        <>
          <Consent onEnter={enter} restoreFocus={hasLeft} />
          <footer className="site-footer">
            <span>LOKI v3 · consent-based performance engine</span>
            <span>
              An illusion, not mind reading. No lie detection, emotion reading, or diagnosis.
              Human pilot: 0 participants.
            </span>
            <span>Camera optional and local-only. The show never uses it.</span>
          </footer>
        </>
      )}
    </div>
  );
}
