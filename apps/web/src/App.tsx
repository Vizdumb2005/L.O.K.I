import { useRef, useState } from "react";
import { CameraLab } from "./components/CameraLab.js";
import { Consent, type ShowMode } from "./components/Consent.js";
import { Performance } from "./components/Performance.js";
import { effectChoice, type EffectId } from "./lib/effects.js";
import { SensorSession } from "./lib/sensor-session.js";

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
  const [sensorMode, setSensorMode] = useState(false);
  const [sensorNotice, setSensorNotice] = useState<string | null>(null);
  const sensorRef = useRef<SensorSession | null>(null);

  const choice = effectChoice(effectId);

  const enteringRef = useRef(false);
  const enter = async (nextEffect: EffectId, nextCameraOptIn: boolean, mode: ShowMode) => {
    // Guard the async permission window: a second Enter while the browser
    // prompt is open must not double-acquire.
    if (enteringRef.current) return;
    enteringRef.current = true;
    try {
    setEffectId(nextEffect);
    setCameraOptIn(nextCameraOptIn);
    // A previous session must never linger across entries.
    if (sensorRef.current) {
      sensorRef.current.stopAll();
      sensorRef.current = null;
      setSensorMode(false);
    }
    if (mode === "sensor") {
      // Mandatory capability: the sensor-enabled performance needs the camera.
      // Failure does NOT silently fall back to click - the person chooses.
      const session = new SensorSession({
        getUserMedia:
          typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia
            ? (c) => navigator.mediaDevices.getUserMedia(c)
            : null
      });
      const stream = await session.acquire("camera");
      if (!stream) {
        sensorRef.current = null;
        setSensorNotice(
          session.state("camera") === "unsupported"
            ? "This device or browser does not expose camera capture, so the sensor-enabled performance cannot run. The click demo below is the same illusion without sensors."
            : `The camera was not available (${session.error("camera") ?? "permission not granted"}), so the sensor-enabled performance did not start. Nothing was captured. The click demo below is the same illusion without sensors.`
        );
        return;
      }
      const mic = await session.acquire("mic");
      if (!mic) {
        // The mic is a required capability of this mode (voice answers). Do
        // not start without it; release the camera that was just opened.
        session.stopAll();
        sensorRef.current = null;
        setSensorNotice(
          session.state("mic") === "unsupported"
            ? "This device or browser does not expose microphone capture, so the sensor-enabled performance cannot run. The click demo below is the same illusion without sensors."
            : `The microphone was not available (${session.error("mic") ?? "permission not granted"}), so the sensor-enabled performance did not start and the camera was released again. The click demo below is the same illusion without sensors.`
        );
        return;
      }
      sensorRef.current = session;
      setSensorMode(true);
      setSensorNotice(null);
    } else {
      setSensorMode(false);
    }
    setEntered(true);
    setScreen("show");
    } finally {
      enteringRef.current = false;
    }
  };

  const stopSensors = () => {
    // One-tap stop: release everything, end the sensor-enabled performance,
    // and land on consent where the click demo is a separate labelled choice.
    // The ref is cleared first so track "ended" events fired by our own
    // stopAll() do not re-enter this handler.
    const session = sensorRef.current;
    sensorRef.current = null;
    session?.stopAll();
    setSensorMode(false);
    setSensorNotice("Sensors stopped - the camera is released and the sensor-enabled performance has ended. The click demo below is the same illusion without sensors.");
    setHasLeft(true);
    setEntered(false);
    setScreen("show");
  };

  const leave = () => {
    // Leaving or resetting in sensor mode ends the sensor-enabled performance:
    // release the camera and any derived state, same as Stop.
    if (sensorRef.current) {
      const session = sensorRef.current;
      sensorRef.current = null;
      session.stopAll();
      if (sensorMode) setSensorNotice("Sensors stopped - the camera is released and the sensor-enabled performance has ended. The click demo below is the same illusion without sensors.");
      setSensorMode(false);
    }
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
          cameraReady={sensorMode}
          sensorMode={sensorMode}
          sensorSession={sensorRef.current}
          onStopSensors={stopSensors}
          onExit={leave}
          onOpenLab={() => setScreen("lab")}
          onToggleReducedMotion={() => setReducedMotion((value) => !value)}
          onToggleLlm={() => setLlmEnabled((value) => !value)}
        />
      ) : (
        <>
          <Consent onEnter={enter} restoreFocus={hasLeft} sensorNotice={sensorNotice} />
          <footer className="site-footer">
            <span>LOKI v3 · consent-based performance engine</span>
            <span>
              An illusion, not mind reading. No lie detection, emotion reading, or diagnosis.
              Human pilot: 0 participants.
            </span>
            <span>Camera is local-only, only in the sensor mode or the lab. Nothing is uploaded.</span>
          </footer>
        </>
      )}
    </div>
  );
}
