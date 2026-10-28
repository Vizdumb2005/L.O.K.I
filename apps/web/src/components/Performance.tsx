import { useEffect, useRef, useState } from "react";
import type { Effect } from "@loki/effect-api";
import { rewritePatter } from "@loki/showrunner";
import { Stage } from "./Stage.js";
import { usePerformance } from "../lib/performance.js";
import type { SessionView } from "@loki/showrunner";

interface PerformanceProps {
  effect: Effect;
  reducedMotion: boolean;
  llmEnabled: boolean;
  cameraReady: boolean;
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
      return view.progress.answered >= view.progress.max
        ? "Recovery question"
        : `Question ${view.progress.answered + 1} of ${view.progress.max}`;
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
  onExit,
  onOpenLab,
  onToggleReducedMotion,
  onToggleLlm
}: PerformanceProps) {
  const { view, error, advance, answer, restart } = usePerformance(effect);
  const [displayLine, setDisplayLine] = useState("");
  const [cueIndex, setCueIndex] = useState(0);
  const [patterSource, setPatterSource] = useState<"template" | "llm">("template");
  const primaryRef = useRef<HTMLButtonElement>(null);
  const lineRef = useRef<HTMLParagraphElement>(null);

  const cues = view?.cues ?? [];
  const cueKey = cues.map((c) => c.id).join("|");
  const lastCue = Math.max(0, cues.length - 1);
  const cuePending = cueIndex < lastCue;
  const cuePendingRef = useRef(false);
  const lastCueRef = useRef(0);
  cuePendingRef.current = cuePending;
  lastCueRef.current = lastCue;

  useEffect(() => {
    setCueIndex(reducedMotion ? lastCue : 0);
    if (reducedMotion || lastCue === 0) return;
    let index = 0;
    let timer = 0;
    const step = () => {
      const hold = cues[index]?.holdMs ?? 0;
      if (index >= lastCue || hold <= 0) return;
      timer = window.setTimeout(() => {
        index += 1;
        setCueIndex(index);
        step();
      }, hold);
    };
    step();
    return () => window.clearTimeout(timer);
  }, [cueKey, reducedMotion]);

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
    const timer = window.setTimeout(() => primaryRef.current?.focus({ preventScroll: true }), 140);
    return () => window.clearTimeout(timer);
  }, [view?.phase, view?.progress.answered]);

  useEffect(() => {
    if (!view) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // Text-entry controls keep their keys. Buttons keep Space/Enter (native activation), but
      // answer shortcuts (digits, Y) never activate a button, so they must still work when an
      // answer button has focus (keyboard-only users land on one).
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
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
        else if (view.canAdvance) advance();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, answer, advance, restart]);

  if (!view) {
    return (
      <main className="performance loading" id="main">
        <p className="eyebrow">Setting the table</p>
        <h1>One moment.</h1>
        {error && <p className="error">{error}</p>}
      </main>
    );
  }

  const isProbe = view.phase === "probe" && view.options;
  const isEnd = view.phase === "afterglow" || view.phase === "done";
  const canContinue = view.canAdvance && !isProbe && !isEnd;
  // Reveal and miss are the payoff: the first press only skips ahead to the line, never past it.
  const skipOnly = cuePending && (view.phase === "reveal" || view.phase === "miss");
  const continueLabel =
    view.phase === "think"
      ? "I have chosen"
      : view.phase === "recover"
        ? "One clean question"
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

      <section className="stage-shell" aria-label={`${view.stage.title} stage`}>
        <div className="stage-vignette" />
        <Stage effect={effect} view={view} reducedMotion={reducedMotion} />
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
            {cuePending ? cues[cueIndex]?.line : displayLine}
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
        </div>

        <div className="panel-actions" role="group" aria-label="Choices">
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
          {canContinue && (
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
