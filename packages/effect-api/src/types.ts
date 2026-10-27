/**
 * LOKI effect contract.
 *
 * This package is deliberately domain-neutral. It knows about hypotheses, probes,
 * evidence, beats and claims. It does not know about cards, suits, words or gaze zones.
 */

export type HypothesisId = string;

export interface Hypothesis {
  id: HypothesisId;
  label: string;
  /** Optional effect-owned display glyph, e.g. a card rank or a word sigil. */
  glyph?: string;
}

export interface ProbeOption {
  id: string;
  label: string;
}

export interface Probe {
  id: string;
  /** Natural-language question shown to the spectator. */
  prompt: string;
  options: ProbeOption[];
  /** 0..1 social/reveal cost. Higher means more likely to feel like an interrogation. */
  cost: number;
  /** P(optionId | itemId), row-stochastic over options. */
  likelihood(itemId: HypothesisId, optionId: string): number;
}

export type EvidenceMeta = Record<string, string | number | boolean | undefined>;

export interface Evidence {
  channel: string;
  value: string;
  probeId?: string;
  /** 0..1, supplied by the perception adapter. */
  reliability: number;
  /** Milliseconds since session start. */
  at: number;
  /** Categorical audit fields only. Never image/audio data or embeddings. */
  meta?: EvidenceMeta;
}

export interface ChannelBinding {
  channel: string;
  label: string;
  /** Cap on this channel's influence, 0..1. */
  weight: number;
  minReliability: number;
  /** Finite observation alphabet, used by the simulator and validation. */
  values: string[];
  /** P(observation | hypothesis), row-stochastic over values. */
  likelihood(itemId: HypothesisId, observation: Evidence): number;
}

export interface StageItem {
  hypothesisId: HypothesisId;
  label: string;
  glyph?: string;
}

export interface StageZone {
  id: string;
  label: string;
  /** Normalized 0..1 coordinates, origin top-left. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StageSpec {
  /** The one generic renderer in this build. */
  renderer: "grid";
  columns: number;
  title: string;
  instructions: string;
  items: StageItem[];
  zones?: StageZone[];
}

export type BeatKind =
  | "invite"
  | "think"
  | "attune"
  | "build"
  | "reveal"
  | "afterglow";

export type BeatWhen = "always" | "camera-on" | "camera-off";

export interface Beat {
  id: string;
  kind: BeatKind;
  line: string;
  when?: BeatWhen;
}

export interface ShowScript {
  beats: Beat[];
  /** Build lines may contain {n} for the number of probes answered. */
  buildLines: string[];
  revealLine(item: Hypothesis, confidence: number): string;
  recoverLine: string;
  missLine: string;
}

export interface EffectConfig {
  maxProbes: number;
  /** Commit only when max posterior is at least this. */
  commitThreshold: number;
  /** Extra probes allowed after a contradiction. */
  recoveryBudget: number;
  /** -ln(predictive probability) threshold that triggers RECOVER. */
  recoverySurprise: number;
  /** Answer-error floor, >= 0.05 in shipping configs. */
  epsilon: number;
  /** Uniform outlier mixture weight. */
  outlierWeight: number;
  /** Calibration temperature applied after each update. */
  temperature: number;
  /** Penalty multiplier for probe cost in the greedy policy. */
  costWeight: number;
  /** The show must not enable this until a validation gate passes. */
  gazeEnabledByDefault: boolean;
}

export interface Effect {
  id: string;
  name: string;
  tagline: string;
  config: EffectConfig;
  hypotheses(): Hypothesis[];
  prior(ctx: { forceEnabled: boolean }): Record<HypothesisId, number>;
  probes(): Probe[];
  /**
   * Non-answer evidence bindings. The stage is passed because a zone map depends on the
   * per-session item layout; the effect must not assume a particular permutation.
   */
  channels(stage: StageSpec): ChannelBinding[];
  script(): ShowScript;
  stage(): StageSpec;
  validate(): void;
}

export interface PriorContext {
  forceEnabled: boolean;
}

export function uniformPrior(hypotheses: Hypothesis[]): Record<HypothesisId, number> {
  const p = 1 / hypotheses.length;
  return Object.fromEntries(hypotheses.map((h) => [h.id, p]));
}
