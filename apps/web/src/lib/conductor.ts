import type { CountdownTrace } from "@loki/effect-countdown";
import { findBannedClaim } from "@loki/effect-api";
import { puterChat, PUTER_MODEL, type PuterChatImpl } from "./puter-chat.js";

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
  conduct(beat: Beat, trace: CountdownTrace, cardLabel: string | null, signal?: AbortSignal): Promise<ConductionLine>;
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

  async conduct(beat: Beat, trace: CountdownTrace, cardLabel: string | null, signal?: AbortSignal): Promise<ConductionLine> {
    const fallback = this.opts.fallback ?? new ScriptedConductor();
    if (!this.opts.endpoint) return fallback.conduct(beat, trace, cardLabel);
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    try {
      const res = await fetchImpl(this.opts.endpoint, {
        method: "POST",
        signal: signal ?? null,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          beat,
          cardLabel,
          trace: {
            namedNumber: trace.namedNumber,
            countedSteps: trace.countedSteps,
            // The sealed target and the produced card leave the page only once
            // the seal is open: before that the model must not hold the answer.
            producedCardId: beat === "reveal" || beat === "miss" ? trace.producedCardId : null,
            sealedTargetId: beat === "reveal" || beat === "miss" ? trace.sealedTargetId : null,
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


export interface PuterConductorOptions {
  chatImpl?: PuterChatImpl;
  timeoutMs?: number;
  fallback?: Conductor;
}

const MAX_CONDUCT_LINE = 320;

/**
 * Muse-backed conduction through Puter.js instead of the operator proxy.
 * Same honesty contract as ModelConductor: only public trace state is sent,
 * the sealed target and produced card leave the page only once the seal is
 * open, the model is instructed never to claim mind-reading, and every
 * failure or filtered line falls back to the scripted voice.
 */
export class PuterConductor implements Conductor {
  constructor(private readonly opts: PuterConductorOptions = {}) {}

  async conduct(beat: Beat, trace: CountdownTrace, cardLabel: string | null): Promise<ConductionLine> {
    const fallback = this.opts.fallback ?? new ScriptedConductor();
    const scripted = await fallback.conduct(beat, trace, cardLabel);
    const state = {
      beat,
      cardLabel,
      trace: {
        namedNumber: trace.namedNumber,
        countedSteps: trace.countedSteps,
        producedCardId: beat === "reveal" || beat === "miss" ? trace.producedCardId : null,
        sealedTargetId: beat === "reveal" || beat === "miss" ? trace.sealedTargetId : null,
        sealVerified: trace.sealVerified,
        phase: trace.phase
      }
    };
    const result = await puterChat(
      [
        {
          role: "system",
          content:
            "You are the Oracle in LOKI, a consent-based mentalism performance. Write the performer's " +
            "line for the current beat from the public state of the act. Rules: one or two sentences, " +
            "under 300 characters, plain text, no URLs, no braces. Never claim mind reading, lie " +
            "detection, emotion reading, certainty, or a guaranteed result; the act is an illusion " +
            "and the number is honored exactly as named. Keep every number and card name in the state " +
            "exactly as given."
        },
        { role: "user", content: `Scripted line for reference: "${scripted.text}". Public state: ${JSON.stringify(state)}` }
      ],
      { model: PUTER_MODEL, temperature: 0.8, timeoutMs: this.opts.timeoutMs, chatImpl: this.opts.chatImpl }
    );
    if ("error" in result) return scripted;
    const text = result.text.replace(/\s+/g, " ").trim();
    if (!text || text.length > MAX_CONDUCT_LINE) return scripted;
    if (/https?:\/\//i.test(text) || /[{}]/.test(text)) return scripted;
    if (findBannedClaim(text)) return scripted;
    return { beat, text, voice: "model" };
  }
}
