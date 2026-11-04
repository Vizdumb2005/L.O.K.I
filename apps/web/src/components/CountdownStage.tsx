import { useEffect, useRef, useState } from "react";
import { ModelConductor, type Beat, type ConductionLine } from "../lib/conductor.js";
import {
  CountdownForce,
  COUNTDOWN_CARD_BY_ID,
  FORCED_POSITION,
  MAX_NUMBER,
  MIN_NUMBER,
  arrangeWithTargetAt,
  countedStepsFor,
  type CountdownTrace
} from "@loki/effect-countdown";

/**
 * The Countdown Force stage: a sealed-prediction effect constrained by
 * arithmetic, performed straight. The honesty contract is part of the copy:
 * the spectator's number is honored verbatim, the procedure is announced
 * before it runs, and the seal is opened even on a miss.
 */

interface CountdownStageProps {
  onExit: () => void;
}

type UiPhase = "seal" | "name" | "deal" | "count" | "open";

export function CountdownStage({ onExit }: CountdownStageProps) {
  // One force per mount. The target is picked once, placed at the forced
  // position, and sealed before the spectator names anything.
  const forceRef = useRef<CountdownForce | null>(null);
  if (!forceRef.current) {
    const ids = Array.from(COUNTDOWN_CARD_BY_ID.keys());
    const targetId = ids[Math.floor(Math.random() * ids.length)]!;
    forceRef.current = new CountdownForce(arrangeWithTargetAt(targetId, FORCED_POSITION), targetId);
  }
  const force = forceRef.current;

  const [phase, setPhase] = useState<UiPhase>("seal");
  const [numberInput, setNumberInput] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [counted, setCounted] = useState(0);
  const [trace, setTrace] = useState<CountdownTrace | null>(force.trace());
  const [showTrace, setShowTrace] = useState(false);
  const [line, setLine] = useState<ConductionLine | null>(null);

  // The Oracle's voice. Endpoint absent => scripted conduction, always. The
  // "hosted" mode flag drives the privacy copy: only a configured endpoint
  // ever sends spectator text/state anywhere.
  const conductorRef = useRef(
    new ModelConductor({
      endpoint: (import.meta.env as Record<string, string | undefined>).VITE_CONDUCTOR_ENDPOINT ?? null
    })
  );
  const hosted = (import.meta.env as Record<string, string | undefined>).VITE_CONDUCTOR_ENDPOINT != null;

  const beat: Beat =
    phase === "seal" ? "seal"
    : phase === "name" ? "invite-number"
    : phase === "deal" ? (counted > 0 ? "count" : "deal")
    : phase === "count" ? "count"
    : trace?.sealVerified === false ? "miss"
    : "reveal";

  useEffect(() => {
    let live = true;
    const label =
      beat === "reveal" || beat === "miss"
        ? (trace?.sealedTargetId ? (COUNTDOWN_CARD_BY_ID.get(trace.sealedTargetId)?.label ?? null) : null)
        : null;
    void conductorRef.current.conduct(beat, trace ?? force.trace(), label).then((l) => {
      if (live) setLine(l);
    });
    return () => {
      live = false;
    };
  }, [beat, trace?.namedNumber, trace?.sealVerified]);

  const named = trace?.namedNumber ?? null;
  const steps = named === null ? 0 : countedStepsFor(named);
  const dealt = trace?.dealOrder ?? [];
  // The selection is the card the count lands on: dealt[named - steps].
  const selectionId =
    trace && trace.namedNumber !== null && trace.countedSteps !== null
      ? dealt[trace.namedNumber - trace.countedSteps] ?? null
      : null;

  const cardLabel = (id: string | null) => (id ? COUNTDOWN_CARD_BY_ID.get(id)?.label ?? id : "—");
  const cardGlyph = (id: string | null) => (id ? COUNTDOWN_CARD_BY_ID.get(id)?.glyph ?? "?" : "?");
  const cardRed = (id: string | null) => (id ? COUNTDOWN_CARD_BY_ID.get(id)?.red ?? false : false);

  const submitNumber = () => {
    const n = Number(numberInput);
    if (!Number.isInteger(n) || n < MIN_NUMBER || n > MAX_NUMBER) {
      setInputError(`Name a whole number from ${MIN_NUMBER} to ${MAX_NUMBER}. Nothing else can be honored.`);
      return;
    }
    setInputError(null);
    force.nameNumber(n);
    force.deal();
    setTrace(force.trace());
    setPhase("deal");
  };

  const countOne = () => {
    const next = counted + 1;
    setCounted(next);
    if (next >= steps) setPhase("count");
  };

  const openSeal = () => {
    force.openSeal();
    setTrace(force.trace());
    setPhase("open");
  };

  const oracleLine = line && (
    <p
      aria-live="polite"
      data-testid="oracle-line"
      data-voice={line.voice}
      style={{ fontStyle: "italic", fontSize: "1.05rem", opacity: 0.9, minHeight: "1.6em" }}
    >
      {line.text}
      {line.voice === "model" && (
        <span style={{ display: "block", fontSize: "0.7rem", opacity: 0.6, fontStyle: "normal" }} data-testid="oracle-live-badge">
          performed live by Muse Spark Open
        </span>
      )}
    </p>
  );

  const header = (
    <header style={{ textAlign: "center", marginBottom: "1.5rem" }}>
      <p style={{ letterSpacing: "0.2em", textTransform: "uppercase", opacity: 0.6, fontSize: "0.75rem" }}>
        Act III · The Countdown
      </p>
      <h1 style={{ fontSize: "1.75rem", margin: "0.25rem 0" }}>A number becomes a card</h1>
    </header>
  );

  const sealPanel = (
    <section aria-label="Sealed prediction" style={panelStyle}>
      <p>
        One card is already sealed - before you choose a number. This is its commitment, the fingerprint
        it can be checked against when the seal is opened:
      </p>
      <code style={codeStyle} data-testid="seal-commitment">
        {force.sealed.commitment}
      </code>
      <p style={{ opacity: 0.7, fontSize: "0.85rem" }}>
        It will be opened at the end, whatever happens. If the procedure does not produce the sealed
        card, you will see the miss. An illusion of prediction - no thought is read.{" "}
        {hosted
          ? "To give the Oracle its live voice, your named number and the state of the act are sent to the model; no camera or microphone is used."
          : "Nothing leaves this page."}
      </p>
      {phase === "seal" && (
        <button type="button" style={buttonStyle} onClick={() => setPhase("name")} data-testid="begin-countdown">
          Begin
        </button>
      )}
    </section>
  );

  const namePanel = phase === "name" && (
    <section aria-label="Name a number" style={panelStyle}>
      <p>
        Name any whole number from {MIN_NUMBER} to {MAX_NUMBER}. Your number is used exactly as named -
        the deal is announced before it happens: your number of cards is dealt into a pile, then you
        count the digit-sum of your number from the top of that pile. The last card counted is yours.
      </p>
      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}>
        <input
          type="number"
          min={MIN_NUMBER}
          max={MAX_NUMBER}
          value={numberInput}
          onChange={(e) => setNumberInput(e.target.value)}
          aria-label="Your number"
          data-testid="countdown-number-input"
          style={inputStyle}
        />
        <button type="button" style={buttonStyle} onClick={submitNumber} data-testid="countdown-deal">
          Deal
        </button>
      </div>
      {inputError && (
        <p role="alert" style={{ color: "#e8a0a0" }} data-testid="countdown-input-error">
          {inputError}
        </p>
      )}
    </section>
  );

  const dealPanel = (phase === "deal" || phase === "count" || phase === "open") && trace && named !== null && (
    <section aria-label="The deal" style={panelStyle}>
      <p>
        You named <strong>{named}</strong>. {named} cards were dealt into a pile. Now count{" "}
        <strong>{steps}</strong> (the digit-sum of {named}) from the top of the pile - one click per
        card, out loud if you like.
      </p>
      <div
        aria-label="Dealt pile"
        data-testid="countdown-pile"
        style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", justifyContent: "center", margin: "1rem 0" }}
      >
        {/* Pile top is the LAST dealt card: render deal order reversed. */}
        {[...dealt].reverse().map((id, visualIndex) => {
          const countIndex = visualIndex + 1; // 1 = top of pile
          const isCounted = countIndex <= counted;
          const isSelection = countIndex === steps && counted >= steps;
          return (
            <span
              key={`${id}-${visualIndex}`}
              data-testid={isSelection ? "countdown-selection" : undefined}
              style={{
                ...miniCardStyle,
                outline: isSelection ? "2px solid #e8c87a" : isCounted ? "2px solid #7aa8e8" : "1px solid #555",
                opacity: isCounted ? 1 : 0.45
              }}
            >
              {isSelection && phase !== "deal" ? (
                <span style={{ color: cardRed(id) ? "#e87a7a" : "#ddd", fontWeight: 700 }}>{cardGlyph(id)}</span>
              ) : (
                <span aria-hidden="true">🂠</span>
              )}
            </span>
          );
        })}
      </div>
      {counted < steps ? (
        <button type="button" style={buttonStyle} onClick={countOne} data-testid="countdown-count">
          Count card {counted + 1} of {steps}
        </button>
      ) : phase === "count" ? (
        <button type="button" style={buttonStyle} onClick={openSeal} data-testid="countdown-open-seal">
          Open the seal
        </button>
      ) : null}
    </section>
  );

  const openPanel = phase === "open" && trace && (
    <section aria-label="The reveal" style={panelStyle} data-testid="countdown-reveal">
      {trace.sealVerified ? (
        <>
          <p style={{ fontSize: "1.4rem" }}>
            The card your procedure produced:{" "}
            <strong style={{ color: cardRed(selectionId) ? "#e87a7a" : "#eee" }}>{cardLabel(selectionId)}</strong>
          </p>
          <p>
            The seal, opened now, names: <strong>{cardLabel(trace.sealedTargetId)}</strong>. They match.
          </p>
          <p style={{ opacity: 0.75, fontSize: "0.85rem" }}>
            An illusion of prediction, honestly performed: no thought was read.{" "}
            {hosted
              ? "Your named number and the state of the act were sent to the model for its voice; nothing else left this page."
              : "Nothing left this page."}
          </p>
        </>
      ) : (
        <>
          <p style={{ fontSize: "1.4rem" }}>An honest miss.</p>
          <p>
            The procedure produced <strong>{cardLabel(trace.producedCardId)}</strong>; the seal names{" "}
            <strong>{cardLabel(trace.sealedTargetId)}</strong>. The seal is open anyway - the prediction was
            not changed to fit.
          </p>
        </>
      )}
      <button type="button" style={ghostButtonStyle} onClick={() => setShowTrace((v) => !v)} data-testid="countdown-trace-toggle">
        {showTrace ? "Hide how it works" : "How it works"}
      </button>
      {showTrace && (
        <div data-testid="countdown-method">
          <p style={{ opacity: 0.75, fontSize: "0.85rem", textAlign: "left" }}>
            What just happened, honestly: your number decided the deal; arithmetic decided the card.
            Every number from {MIN_NUMBER} to {MAX_NUMBER} lands on the same position - that is the
            whole method, and it is why the prediction could be sealed in advance. The commitment above
            proves the sealed card was not changed when the seal was opened; it is not an independent
            timestamp. No choice of yours was predicted.
          </p>
          <pre style={traceStyle} data-testid="countdown-trace">
            {JSON.stringify(trace, null, 2)}
          </pre>
        </div>
      )}
      <div>
        <button type="button" style={ghostButtonStyle} onClick={onExit} data-testid="countdown-exit">
          Leave the stage
        </button>
      </div>
    </section>
  );

  return (
    <main id="main" style={{ maxWidth: "44rem", margin: "0 auto", padding: "2rem 1rem" }} data-testid="countdown-stage">
      {header}
      {oracleLine}
      {sealPanel}
      {namePanel}
      {dealPanel}
      {openPanel}
    </main>
  );
}

const panelStyle: React.CSSProperties = {
  border: "1px solid #444",
  borderRadius: "0.75rem",
  padding: "1.25rem",
  marginBottom: "1rem",
  textAlign: "center"
};

const codeStyle: React.CSSProperties = {
  display: "block",
  wordBreak: "break-all",
  fontSize: "0.7rem",
  background: "#1a1a1a",
  padding: "0.5rem",
  borderRadius: "0.4rem",
  margin: "0.5rem 0"
};

const buttonStyle: React.CSSProperties = {
  background: "#e8c87a",
  color: "#111",
  border: "none",
  borderRadius: "0.5rem",
  padding: "0.6rem 1.4rem",
  fontSize: "1rem",
  cursor: "pointer",
  marginTop: "0.75rem"
};

const ghostButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "transparent",
  color: "#e8c87a",
  border: "1px solid #e8c87a"
};

const inputStyle: React.CSSProperties = {
  background: "#1a1a1a",
  border: "1px solid #555",
  borderRadius: "0.5rem",
  color: "#eee",
  padding: "0.6rem",
  width: "6rem",
  fontSize: "1rem",
  textAlign: "center"
};

const miniCardStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "2.2rem",
  height: "3rem",
  borderRadius: "0.3rem",
  background: "#222",
  fontSize: "0.9rem"
};

const traceStyle: React.CSSProperties = {
  textAlign: "left",
  fontSize: "0.7rem",
  background: "#1a1a1a",
  padding: "0.75rem",
  borderRadius: "0.5rem",
  overflowX: "auto",
  maxHeight: "16rem",
  overflowY: "auto"
};
