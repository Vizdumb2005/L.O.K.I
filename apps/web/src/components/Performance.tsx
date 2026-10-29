import { useCallback, useEffect, useRef, useState } from "react";
import type { Effect } from "@loki/effect-api";
import { rewritePatter } from "@loki/showrunner";
import { Stage } from "./Stage.js";
import { usePerformance } from "../lib/performance.js";
import type { SessionView } from "@loki/showrunner";
import type { SensorSession } from "../lib/sensor-session.js";
import { createPresenceDetector } from "../lib/presence.js";
import { useVoiceAnswer } from "../lib/use-voice-answer.js";

interface PerformanceProps {
  effect: Effect;
  reducedMotion: boolean;
  llmEnabled: boolean;
  cameraReady: boolean;
  sensorMode?: boolean;
  sensorSession?: SensorSession | null;
  onStopSensors?: (notice?: string) => void;
  onExit: () => void;
  onOpenLab: () => void;
  onToggleReducedMotion: () => void;
  onToggleLlm: () => void;
}

function phaseLabel(view: SessionView): string {
  switch (view.phase) {
    case "invite":
      return "Invitation";
    case "think":
      return "Choose in silence";
    case "attune":
      return "Attunement";
    case "probe":
      return view.progress.answered >= view.progress.max ? "One clean answer" : "The reading";
    case "recover":
      return "A contradiction";
    case "build":
      return "Building the reveal";
    case "reveal":
      return "The reveal";
    case "miss":
      return "The honest miss";
    case "afterglow":
      return "Afterglow";
    default:
      return "Curtain";
  }
}

export function Performance({
  effect,
  reducedMotion,
  llmEnabled,
  cameraReady,
  sensorMode = false,
  sensorSession = null,
  onStopSensors,
  onExit,
  onOpenLab,
  onToggleReducedMotion,
  onToggleLlm
}: PerformanceProps) {
  const { view, error, advance, answer, restart } = usePerformance(effect, sensorMode);
  const [presence, setPresence] = useState<"unknown" | "present" | "absent" | "unavailable">("unknown");
  const [showPreview, setShowPreview] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoMounted, setVideoMounted] = useState(false);
  const attuning = sensorMode && view?.phase === "attune";

  // Attach the session camera the moment the preview element exists (it only
  // renders after the session view loads, so an effect keyed on props would
  // fire too early and never retry). Callback refs fire on element mount.
  const attachVideo = useCallback(
    (video: HTMLVideoElement | null) => {
      videoRef.current = video;
      if (!video) return;
      const stream = sensorSession?.stream("camera");
      if (!stream) return;
      video.srcObject = stream as unknown as MediaStream;
      void video.play().catch(() => undefined);
      setVideoMounted(true);
    },
    [sensorSession]
  );

  // Presence checks run only during the attune beat. One frame in, one
  // boolean out; frames are never stored. Detection failure is honest:
  // the show continues and says it could not see you.
  useEffect(() => {
    if (!attuning || !videoRef.current) return;
    let live = true;
    let timer = 0;
    let failures = 0;
    let detector: Awaited<ReturnType<typeof createPresenceDetector>> | null = null;
    setPresence("unknown");
    void createPresenceDetector(videoRef.current)
      .then((d) => {
        if (!live) { d.close(); return; }
        detector = d;
        const tick = async () => {
          if (!live || !detector) return;
          const video = videoRef.current;
          if (!video || video.readyState < 2 || video.videoWidth === 0) {
            timer = window.setTimeout(() => void tick(), 600);
            return;
          }
          try {
            const seen = await detector.check();
            failures = 0;
            if (live) setPresence(seen ? "present" : "absent");
          } catch {
            failures += 1;
            // Persistent failure is stated honestly, never masked as "checking".
            if (live && failures >= 5) {
              setPresence("unavailable");
              return;
            }
          }
          timer = window.setTimeout(() => void tick(), 600);
        };
        void tick();
      })
      .catch(() => { if (live) setPresence("unavailable"); });
    return () => {
      live = false;
      window.clearTimeout(timer);
      detector?.close();
    };
  }, [attuning, videoMounted]);
  const [displayLine, setDisplayLine] = useState("");
  const [cueIndex, setCueIndex] = useState(0);
  const [indexKey, setIndexKey] = useState("");
  const [patterSource, setPatterSource] = useState<"template" | "llm">("template");
  const [userRevealed, setUserRevealed] = useState(false);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLParagraphElement>(null);

  const cues = view?.cues ?? [];
  const cueKey = cues.map((c) => c.id).join("|");
  const lastCue = Math.max(0, cues.length - 1);
  // The index only counts for the cue set it was recorded against; for the first render of a new
  // set (before the effect below runs) the sequence is at its start, so nothing flashes early.
  const effectiveIndex = indexKey === cueKey ? cueIndex : reducedMotion ? lastCue : 0;
  const cuePending = effectiveIndex < lastCue;
  const cuePendingRef = useRef(false);
  const lastCueRef = useRef(0);
  cuePendingRef.current = cuePending;
  lastCueRef.current = lastCue;

  useEffect(() => {
    setCueIndex(reducedMotion ? lastCue : 0);
    setIndexKey(cueKey);
    setUserRevealed(false);
  }, [cueKey, reducedMotion]);

  // One timer per step, owned by the current index. Skipping changes the index, which clears the
  // pending timer, so a late timer can never pull a skipped sequence back to an earlier cue.
  useEffect(() => {
    if (reducedMotion || indexKey !== cueKey || cueIndex >= lastCue) return;
    const hold = cues[cueIndex]?.holdMs ?? 0;
    if (hold <= 0) return;
    const timer = window.setTimeout(() => setCueIndex((i) => Math.min(i + 1, lastCue)), hold);
    return () => window.clearTimeout(timer);
  }, [cueIndex, indexKey, cueKey, reducedMotion, lastCue]);

  useEffect(() => {
    setDisplayLine(view?.line ?? "");
    setPatterSource("template");
    if (!view) return;
    if (!llmEnabled || !["build", "afterglow"].includes(view.phase)) return;
    let live = true;
    void rewritePatter(
      {
        beat: view.phase,
        tone: view.phase === "afterglow" ? "reassuring" : "intimate",
        allowedClaims: ["mentalism", "illusion", "performance", "consent"],
        template: view.line
      },
      { endpoint: "/api/patter", timeoutMs: 1200 }
    ).then((result) => {
      if (!live) return;
      setDisplayLine(result.line);
      setPatterSource(result.source);
    });
    return () => {
      live = false;
    };
  }, [view?.line, view?.phase, llmEnabled]);

  useEffect(() => {
    if (!view) return;
    // Focus follows the moment: first answer in a question, the Skip/Continue control during pauses
    // and payoffs, "Begin again" at the end. Keyboard and screen-reader users never get stranded
    // on a removed element.
    const timer = window.setTimeout(() => {
      const target = actionsRef.current?.querySelector<HTMLButtonElement>("button.choice, button.primary, button.ghost");
      (target ?? primaryRef.current)?.focus({ preventScroll: true });
    }, 140);
    return () => window.clearTimeout(timer);
  }, [view?.phase, view?.progress.answered, cuePending]);

  useEffect(() => {
    if (!view) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // Text-entry controls keep their keys. Buttons keep Space/Enter (native activation), but
      // answer shortcuts (digits, Y) never activate a button, so they must still work when an
      // answer button has focus (keyboard-only users land on one).
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "Escape") {
        // Escape never ends a pause by accident: first press skips the pause, a press with nothing
        // pending leaves the show (the consent screen is one press away).
        event.preventDefault();
        if (cuePendingRef.current) setCueIndex(lastCueRef.current);
        else onExit();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const onControl = Boolean(target?.closest("button, a"));
      if (view.phase === "probe" && view.options) {
        const index = Number(event.key) - 1;
        const option =
          view.options[index] ?? (event.key.toLowerCase() === "y" ? view.options[0] : undefined);
        if (option) {
          event.preventDefault();
          answer(option.id);
        }
        return;
      }
      if (onControl) return;
      if ([" ", "Enter"].includes(event.key)) {
        event.preventDefault();
        if (cuePendingRef.current && (view.phase === "reveal" || view.phase === "miss")) {
          setCueIndex(lastCueRef.current);
          return;
        }
        if (view.phase === "afterglow" || view.phase === "done") restart();
        else if (revealGated) setUserRevealed(true);
        else if (view.canAdvance) advance();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, answer, advance, restart, onExit]);

  const endSensorMode = useCallback(
    (reason: string) => {
      onStopSensors?.(reason);
    },
    [onStopSensors]
  );
  const voice = useVoiceAnswer({
    active: sensorMode,
    session: sensorSession ?? null,
    probeActive: sensorMode && view?.phase === "probe" && Boolean(view?.options),
    probeKey: `${view?.phase ?? ""}:${view?.progress.answered ?? 0}`,
    options: view?.options,
    onAnswer: answer,
    onEndSensorMode: endSensorMode
  });
  // Losing REQUIRED capture (camera unplugged, OS revoked the mic) pauses the
  // sensor-enabled performance - it never continues unchanged without a
  // sensor it declared mandatory. Intentional mic release is exempt.
  const onStopSensorsRef = useRef(onStopSensors);
  onStopSensorsRef.current = onStopSensors;
  useEffect(() => {
    if (!sensorMode || !sensorSession) return;
    const subs: Array<[MediaStreamTrack, () => void]> = [];
    const watch = (stream: MediaStream | null, kind: "camera" | "mic") => {
      stream?.getTracks().forEach((t) => {
        const h = () => {
          onStopSensorsRef.current?.(
            kind === "mic"
              ? "The microphone capture ended, and the sensor-enabled performance requires it - so the performance has ended and every sensor was released. The click demo below is the same illusion without sensors."
              : "The camera capture ended, and the sensor-enabled performance requires it - so the performance has ended and every sensor was released. The click demo below is the same illusion without sensors."
          );
        };
        t.addEventListener("ended", h);
        subs.push([t, h]);
      });
    };
    watch(sensorSession.stream("camera") as unknown as MediaStream | null, "camera");
    watch(sensorSession.stream("mic") as unknown as MediaStream | null, "mic");
    return () => subs.forEach(([t, h]) => t.removeEventListener("ended", h));
  }, [sensorMode, sensorSession]);

  if (!view) {
    return (
      <main className="performance loading" id="main">
        <p className="eyebrow">Setting the table</p>
        <h1>One moment.</h1>
        {error && <p className="error">{error}</p>}
      </main>
    );
  }

  // Voice setup gates the sensor-enabled performance: enrollment (or an
  // explicit tap-answers choice) happens before the show content is live.
  const voiceOverlay =
    sensorMode && (voice.state === "loading" || voice.state === "enroll" || voice.state === "recording");
  if (voiceOverlay) {
    return (
      <main className="performance" id="main">
        <section className="sensor-bar" aria-label="Sensor status">
          <span className="sensor-indicator" role="status">
            Camera on - presence only. Frames are processed here and discarded.
          </span>
          <span className="sensor-indicator" role="status">
            Mic on - voice answers (experimental). Clips are processed here and discarded.
          </span>
          <button type="button" className="chip" onClick={() => onStopSensors?.()}>
            Stop sensors
          </button>
        </section>
        <section className="panel" aria-labelledby="voice-enroll-heading">
          <div className="panel-copy">
            <p className="eyebrow">Voice setup · experimental</p>
            {voice.state === "loading" ? (
              <>
                <h2 id="voice-enroll-heading">Loading the on-device voice models</h2>
                <p className="line">One moment. The models download into this tab and never leave it.</p>
              </>
            ) : voice.state === "recording" ? (
              <>
                <h2 id="voice-enroll-heading">Recording your enrollment</h2>
                <p className="line">
                  Say clearly: "I am thinking of one card." About four seconds, then it stops on its own.
                </p>
              </>
            ) : (
              <>
                <h2 id="voice-enroll-heading">Enroll your voice for this performance</h2>
                <p className="line">
                  This is an experimental attempt to recognize your enrolled voice when you answer -
                  it may reject you, or accept another speaker, and it is not reliable separation of
                  voices in a room, especially when people talk over each other. It has been checked
                  on synthetic clips only, not yet on a real device. About four seconds of speech;
                  the voice print is computed in this tab, kept only in memory, never uploaded, and
                  discarded when you stop or leave. Withdraw it any time with "Forget my voice" -
                  that ends the sensor performance. It is not identification or sign-in.
                </p>
                {voice.feedback && (
                  <p className="prompt-note" role="status">
                    {voice.feedback}
                  </p>
                )}
                <div className="panel-actions" role="group" aria-label="Voice setup choices">
                  <button type="button" className="primary" onClick={() => void voice.enroll()}>
                    Enroll my voice
                  </button>
                  <button type="button" className="ghost" onClick={() => voice.useManual("declined")}>
                    No voice - end the sensor performance
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      </main>
    );
  }

  // The target is lit only when the resting reveal cue is on screen, never during the hush beats.
  // When the effect asks the person to perform the reveal, it also stays dark behind the
  // invitation until they turn it over themselves.
  const revealGated = Boolean(view.revealGate) && view.phase === "reveal" && !cuePending && !userRevealed;
  const stageView: SessionView =
    view.reveal && view.phase === "reveal" && (cuePending || revealGated) ? { ...view, reveal: undefined } : view;
  const isProbe = view.phase === "probe" && view.options;
  const isEnd = view.phase === "afterglow" || view.phase === "done";
  const canContinue = view.canAdvance && !isProbe && !isEnd;
  // Reveal and miss are the payoff: the first press only skips ahead to the line, never past it.
  const skipOnly = cuePending && (view.phase === "reveal" || view.phase === "miss");
  const continueLabel =
    view.phase === "think"
      ? "I have chosen"
      : view.phase === "recover"
        ? "One clean claim"
        : view.phase === "build"
          ? "Reveal it"
          : view.phase === "reveal" || view.phase === "miss"
            ? "Continue"
            : "Continue";

  return (
    <main className="performance" id="main">
      <section className="perform-top" aria-label="Performance controls">
        <div className="perform-id">
          <p className="eyebrow">{effect.name}</p>
          <p className="perform-phase">{phaseLabel(view)}</p>
        </div>
        <div className="dots" aria-hidden="true">
          {Array.from({ length: view.progress.max }, (_, index) => (
            <span
              key={index}
              className={`dot ${index < view.progress.answered ? "is-filled" : ""}`}
            />
          ))}
        </div>
        <div className="top-actions">
          <button type="button" className="chip" onClick={onToggleReducedMotion} aria-pressed={reducedMotion}>
            {reducedMotion ? "Motion reduced" : "Motion on"}
          </button>
          <button type="button" className="chip" onClick={onToggleLlm} aria-pressed={llmEnabled}>
            {llmEnabled ? "Proxy patter" : "Patter off"}
          </button>
          <button type="button" className="chip" onClick={onExit}>
            Leave
          </button>
        </div>
      </section>

      {sensorMode && (
        <section className="sensor-bar" aria-label="Sensor status">
          {/* The camera runs even with the preview hidden - the indicator, not
              the thumbnail, is the honesty surface. Preview is a setup aid. */}
          <video
            ref={attachVideo}
            className={showPreview ? "sensor-preview" : "sensor-preview sensor-preview-hidden"}
            muted
            playsInline
            aria-hidden={showPreview ? undefined : true}
            aria-label="Camera preview - presence only"
          />
          <span className="sensor-indicator" role="status">
            Camera on - presence only. Frames are processed here and discarded.
          </span>
          {(voice.state === "loading" || voice.state === "enroll" || voice.state === "recording" || voice.state === "ready") && (
            <span className="sensor-indicator" role="status">
              Mic on - voice answers (experimental). Clips are processed here and discarded.
            </span>
          )}
          {voice.enrolled && (
            <button type="button" className="chip" onClick={() => voice.useManual("forgotten")}>
              Forget my voice
            </button>
          )}
          <button type="button" className="chip" onClick={() => setShowPreview((v) => !v)} aria-pressed={showPreview}>
            {showPreview ? "Hide preview" : "Show preview"}
          </button>
          <button type="button" className="chip" onClick={() => onStopSensors?.()}>
            Stop sensors
          </button>
        </section>
      )}

      <section className="stage-shell" aria-label={`${view.stage.title} stage`} data-target-lit={stageView.reveal ? "true" : "false"}>
        <div className="stage-vignette" />
        <Stage effect={effect} view={stageView} reducedMotion={reducedMotion} />
        <div className="stage-caption" aria-hidden="true">
          <span>NOCTURNE OBSERVATORY</span>
          <span>{view.stage.items.length} OBJECTS IN THE LIGHT</span>
        </div>
        {!cameraReady && view.camera.enabled && (
          <div className="camera-badge">Camera unavailable · no-camera path active</div>
        )}
      </section>

      {view.phase === "think" && (
        <section className="silent-choices" aria-labelledby="silent-choices-heading">
          <h2 id="silent-choices-heading">Choose privately</h2>
          <p>Hold one in mind. Do not tap or say which one.</p>
          <ul className="silent-choice-list" role="list" aria-label={`${view.stage.title} items`}>
            {view.stage.items.map((item) => (
              <li key={item.hypothesisId} className="silent-choice">
                <span className="silent-choice-glyph" aria-hidden="true">
                  {item.glyph ?? "·"}
                </span>
                <span className="silent-choice-label">{item.label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={`panel panel-${view.phase}`} aria-labelledby="line-heading">
        <div className="panel-copy">
          <p className="eyebrow">{view.stage.title}</p>
          <p id="line-heading" ref={lineRef} className="line" aria-live="polite">
            {cuePending ? cues[effectiveIndex]?.line : revealGated ? view.revealGate!.invite : displayLine}
          </p>
          {reducedMotion && cues.length > 1 && (
            <ul className="cue-trail" aria-label="Earlier lines of this moment">
              {cues.slice(0, lastCue).map((cue) => (
                <li key={cue.id}>{cue.line}</li>
              ))}
            </ul>
          )}
          {llmEnabled && (view.phase === "build" || view.phase === "afterglow") && (
            <p className="source-line">
              {patterSource === "llm" ? "Optional proxy patter · filtered" : "Bundled patter · offline fallback"}
            </p>
          )}
          {isProbe && (
            <p className="prompt-note">Answer honestly, or not. There is no penalty for misleading me.</p>
          )}
          {sensorMode && voice.feedback && (
            <p className="prompt-note" role="status">
              {voice.feedback}
            </p>
          )}
          {attuning && (
            <p className="prompt-note" role="status">
              {presence === "present"
                ? "I can see you are here. Nothing is recorded - presence only."
                : presence === "absent"
                  ? "I do not see a face yet. The camera only checks presence; you can continue whenever you like."
                  : presence === "unavailable"
                    ? "The presence check is unavailable here - the camera is still presence-only, and you can continue."
                    : "Checking that someone is here - presence only, nothing is recorded."}
            </p>
          )}
        </div>

        <div ref={actionsRef} className="panel-actions" role="group" aria-label="Choices">
          {isProbe && view.options?.map((option, index) => (
            <button
              key={option.id}
              type="button"
              className="choice"
              onClick={() => answer(option.id)}
            >
              <span className="key">{index + 1}</span>
              {option.label}
            </button>
          ))}
          {cuePending && !canContinue && !isProbe && (
            <button type="button" className="ghost" onClick={() => setCueIndex(lastCue)}>
              Skip ahead
            </button>
          )}
          {revealGated && (
            <button
              ref={primaryRef}
              type="button"
              className="primary"
              onClick={() => setUserRevealed(true)}
            >
              {view.revealGate!.action}
            </button>
          )}
          {canContinue && !revealGated && (
            <button
              ref={primaryRef}
              type="button"
              className="primary"
              onClick={() => (skipOnly ? setCueIndex(lastCue) : advance())}
            >
              {skipOnly ? "Skip ahead" : continueLabel}
            </button>
          )}
          {isEnd && (
            <div className="end-actions">
              <button ref={primaryRef} type="button" className="primary" onClick={restart}>
                Begin again
              </button>
              <button type="button" className="ghost" onClick={onExit}>
                Leave the room
              </button>
            </div>
          )}
        </div>
      </section>

      <p className="sr-only">
        Keyboard: press a number key (1 to the number of choices) to answer, Space or Enter to continue. The stage is decorative.
      </p>
      {error && <p className="error">{error}</p>}
      <footer className="perf-footer">
        <span>An illusion, not mind reading.</span>
        <button type="button" className="link" onClick={onOpenLab}>
          Experimental camera lab
        </button>
        <span>No frames are uploaded or stored.</span>
      </footer>
    </main>
  );
}
