import type { CountdownTrace } from "@loki/effect-countdown";

/**
 * The Oracle's voice: conduction for The Countdown.
 *
 * The engine is the entire method. The conductor only SPEAKS - it receives
 * the actual trace state and produces the words for each beat. Two voices:
 *   - "script": deterministic lines. Always available. Never presented as live.
 *   - "model": Muse Spark Open via a budget-guarded proxy. Any failure falls
 *     back to script for that beat and records the fallback honestly.
 * The trace of every line records which voice produced it.
 */

export type Voice = "model" | "script";

export type Beat = "seal" | "invite-number" | "deal" | "count" | "reveal" | "miss";

export interface ConductionLine {
  beat: Beat;
  text: string;
  voice: Voice;
}

export interface Conductor {
  conduct(beat: Beat, trace: CountdownTrace, cardLabel: string | null): Promise<ConductionLine>;
}

const DIGITS = (n: number) => String(n).split("").join(" + ");

/** Deterministic conduction. This is the honest fallback - always available. */
export function scriptedLine(beat: Beat, trace: CountdownTrace, cardLabel: string | null): string {
  const n = trace.namedNumber;
  switch (beat) {
    case "seal":
      return "One card is already sealed. Before you choose anything, its fingerprint is on the table.";
    case "invite-number":
      return "Name a number. Ten through nineteen - whichever you want. It will be used exactly as you say it.";
    case "deal":
      return n === null
        ? "The deal waits on your number."
        : `${n}. Heard. ${n} cards, dealt into a pile - watch them fall.`;
    case "count":
      return n === null
        ? "Count with me."
        : `Now count ${trace.countedSteps} from the top of the pile - ${DIGITS(n)} is ${trace.countedSteps}. One card at a time. The last one is yours.`;
    case "reveal":
      return `Open the seal. Read what was written before you spoke: ${cardLabel ?? "the sealed card"}.`;
    case "miss":
      return "The seal is open, and it does not match. You watched an honest miss - the prediction was not touched to fit.";
  }
}

export class ScriptedConductor implements Conductor {
  async conduct(beat: Beat, trace: CountdownTrace, cardLabel: string | null): Promise<ConductionLine> {
    return { beat, text: scriptedLine(beat, trace, cardLabel), voice: "script" };
  }
}

export interface ModelConductorOptions {
  /** Budget-guarded proxy endpoint. Absent endpoint => scripted voice always. */
  endpoint: string | null;
  fetchImpl?: typeof fetch;
  fallback?: Conductor;
}

/**
 * Muse-backed conduction. The prompt carries ONLY the public trace state -
 * the model learns nothing the spectator cannot see, and it is instructed to
 * never claim mind-reading. Failure never blocks the show: it falls back to
 * the scripted line and reports voice "script".
 */
export class ModelConductor implements Conductor {
  constructor(private readonly opts: ModelConductorOptions) {}

  async conduct(beat: Beat, trace: CountdownTrace, cardLabel: string | null): Promise<ConductionLine> {
    const fallback = this.opts.fallback ?? new ScriptedConductor();
    if (!this.opts.endpoint) return fallback.conduct(beat, trace, cardLabel);
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    try {
      const res = await fetchImpl(this.opts.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          beat,
          cardLabel,
          trace: {
            namedNumber: trace.namedNumber,
            countedSteps: trace.countedSteps,
            producedCardId: trace.producedCardId,
            sealedTargetId: trace.sealedTargetId,
            sealVerified: trace.sealVerified,
            phase: trace.phase
          }
        })
      });
      if (!res.ok) return fallback.conduct(beat, trace, cardLabel);
      const data = (await res.json()) as { text?: unknown };
      if (typeof data.text !== "string" || data.text.trim() === "") {
        return fallback.conduct(beat, trace, cardLabel);
      }
      return { beat, text: data.text, voice: "model" };
    } catch {
      return fallback.conduct(beat, trace, cardLabel);
    }
  }
}
