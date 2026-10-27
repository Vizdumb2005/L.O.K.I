import type { Evidence } from "@loki/effect-api";

export interface AnswerInput {
  probeId: string;
  optionId: string;
  at: number;
  reliability?: number;
  input?: "button" | "keyboard" | "voice" | "typed";
}

/** The answer adapter only labels the channel; the probe supplies the likelihood. */
export function answerEvidence(input: AnswerInput): Evidence {
  return {
    channel: "answer",
    value: input.optionId,
    probeId: input.probeId,
    reliability: Math.min(1, Math.max(0, input.reliability ?? 1)),
    at: input.at,
    meta: { input: input.input ?? "button" }
  };
}

export function normalizeOptionId(input: string, allowed: string[]): string | null {
  const normalized = input.trim().toLowerCase();
  return allowed.find((id) => id.toLowerCase() === normalized) ?? null;
}
