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

/** How a probe is performed. Absent means "question" for backward compatibility. */
export type Discourse = "statement" | "question";

/** A statement beat is a Probe performed as a statement. */
export type StatementBeat = Probe & { discourse: "statement" };

export interface Probe {
  id: string;
  /** Natural-language question shown to the spectator. */
  prompt: string;
  /** Presentation discourse. Statements form the spine; questions are tie-breakers only. */
  discourse?: Discourse;
  options: ProbeOption[];
  /** 0..1 social/reveal cost. Higher means more likely to feel like an interrogation. */
  cost: number;
  /**
   * Blueprint v4 §3: marks this probe as the crafted follow-up for one observed
   * channel value (e.g. the gaze zone "top-left"). After such evidence the
   * session offers the hinted probe before any symmetric question, so the show
   * reads as a progressive statement instead of an interrogation.
   */
  channelHint?: { channel: string; value: string };
  /** Optional Derren Brown / Peter Turner denial pivot line for candidate absorption. */
  denialPivot?: string;
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

/** A prediction committed before any spectator answer. Commitment is hex SHA-256 of `${hypothesisId}:${nonce}`. */
export interface SealedPrediction {
  hypothesisId: HypothesisId;
  nonce: string;
  commitment: string;
  committedAt: number;
}

/** Declared force intent. Salience 0..1 only biases ordering/prior; never guarantees choice. */
export interface ForceSpec {
  targetId: HypothesisId;
  salience: number;
}

export type RevealMode = "inferred" | "sealed" | "user-performed";

export interface ShowScript {
  beats: Beat[];
  /** Build lines may contain {n} for the number of probes answered. */
  buildLines: string[];
  /** Reveal style. "sealed" requires a SealedPrediction verified at reveal. */
  revealMode?: RevealMode;
  /** Performed time beats by duration bucket: [brief <8s, settled 8-25s, long >25s]. Never rendered as a number. */
  timeBeatLines?: string[];
  revealLine(item: Hypothesis, confidence: number): string;
  recoverLine: string;
  missLine: string;
  /**
   * Optional user-performed reveal: when present, the reveal lands dark behind this
   * invitation line and only lights when the person performs `revealAction` themselves.
   * Omit both to keep the reveal resting on its own line.
   */
  revealInvite?: string;
  revealAction?: string;
}

export interface EffectConfig {
  maxProbes: number;
  /** Maximum probes when gaze evidence is present (clamped to 1-2 beats). */
  maxProbesGazed?: number;
  /** Commit only when max posterior is at least this. */
  commitThreshold: number;
  /**
   * Blueprint v4 §3: commit threshold used when two validated gaze windows have
   * already isolated the pair. Lets a single progressive statement commit the
   * read instead of forcing a redundant second question.
   */
  commitThresholdGazed?: number;
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
  /**
   * Statement selection within a run. "spine" (default) walks the authored
   * statements in effect order - effects whose authored order is deliberate
   * salience order (Ember Words) depend on it for honest two-beat commits.
   * "greedy" picks the highest information-gain statement each beat; the card
   * effect's pool order is not salience-optimized, so fixed walking stalls the
   * posterior below the commit bar. Selection order never changes evidence
   * semantics or the commit bar.
   */
  statementPolicy?: "spine" | "greedy";
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
  /**
   * Probes for the show. The stage is passed because zone-crafted statements depend
   * on the per-session item layout; the effect must not assume a particular
   * permutation. Stage-independent effects may ignore it.
   */
  probes(stage?: StageSpec): Probe[];
  /**
   * Non-answer evidence bindings. The stage is passed because a zone map depends on the
   * per-session item layout; the effect must not assume a particular permutation.
   */
  channels(stage: StageSpec): ChannelBinding[];
  script(): ShowScript;
  stage(): StageSpec;
  validate(): void;
  /** Optional declared force. Return null for a purely inferred show. */
  forceSpec?(ctx: { forceEnabled: boolean }): ForceSpec | null;
}

export interface PriorContext {
  forceEnabled: boolean;
}

export function uniformPrior(hypotheses: Hypothesis[]): Record<HypothesisId, number> {
  const p = 1 / hypotheses.length;
  return Object.fromEntries(hypotheses.map((h) => [h.id, p]));
}