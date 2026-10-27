import type {
  ChannelBinding,
  EffectConfig,
  Evidence,
  Hypothesis,
  Probe
} from "@loki/effect-api";
import { argmax, logSumExp, normalize, normalizeProbabilities, topIndices } from "./distribution.js";

export interface BeliefConfig {
  epsilon: number;
  outlierWeight: number;
  temperature: number;
  recoverySurprise: number;
  /** Ablation only. The shipped app must keep this false. */
  hardMode?: boolean;
  /** Ablation only. */
  useOutlier?: boolean;
}

export function beliefConfigFromEffect(config: EffectConfig): BeliefConfig {
  return {
    epsilon: config.epsilon,
    outlierWeight: config.outlierWeight,
    temperature: config.temperature,
    recoverySurprise: config.recoverySurprise,
    hardMode: false,
    useOutlier: true
  };
}

export interface EvidenceRecord {
  evidence: Evidence;
  predictive: number;
  surprise: number;
  /** Posterior after this observation, for audit. */
  posterior: number[];
  dropped?: boolean;
  collapsed?: boolean;
}

export interface BeliefState {
  hypotheses: Hypothesis[];
  prior: number[];
  logPosterior: number[];
  observations: EvidenceRecord[];
  consecutiveSurprise: number;
  contradictionActive: boolean;
}

export interface UpdateResult {
  state: BeliefState;
  predictive: number;
  surprise: number;
  contradiction: boolean;
  dropped: boolean;
  collapsed: boolean;
}

function cloneState(state: BeliefState): BeliefState {
  return {
    ...state,
    logPosterior: [...state.logPosterior],
    observations: [...state.observations]
  };
}

export function createBelief(
  hypotheses: Hypothesis[],
  prior: Record<string, number>,
  _config: BeliefConfig
): BeliefState {
  if (hypotheses.length < 2) throw new Error("belief needs at least two hypotheses");
  if (new Set(hypotheses.map(h => h.id)).size !== hypotheses.length) {
    throw new Error("belief hypothesis ids must be unique");
  }
  const values = hypotheses.map((h) => prior[h.id]);
  if (values.some(p => !Number.isFinite(p) || p! < 0)) {
    throw new Error("prior must contain a finite non-negative mass for every hypothesis");
  }
  const sum = values.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) throw new Error("prior must have positive mass");
  const normalized = values.map((v) => v / sum);
  return {
    hypotheses: [...hypotheses],
    prior: normalized,
    logPosterior: normalized.map((p) => Math.log(p)),
    observations: [],
    consecutiveSurprise: 0,
    contradictionActive: false
  };
}

export function posterior(state: BeliefState): number[] {
  return normalize(state.logPosterior);
}

export function maxPosterior(state: BeliefState): number {
  return Math.max(...posterior(state));
}

export function bestHypothesis(state: BeliefState): { hypothesis: Hypothesis; probability: number; index: number } {
  const p = posterior(state);
  const index = argmax(p);
  return { hypothesis: state.hypotheses[index]!, probability: p[index]!, index };
}

export function topHypotheses(
  state: BeliefState,
  k = 3
): Array<{ hypothesis: Hypothesis; probability: number }> {
  const p = posterior(state);
  return topIndices(p, k).map((i) => ({ hypothesis: state.hypotheses[i]!, probability: p[i]! }));
}

export function beliefEntropy(state: BeliefState): number {
  const p = posterior(state);
  let h = 0;
  for (const x of p) if (x > 0) h -= x * Math.log2(x);
  return h;
}

function applyTemperature(logPosterior: number[], temperature: number): number[] {
  const t = Math.max(0.5, temperature);
  const tempered = logPosterior.map((x) => x / t);
  const lse = logSumExp(tempered);
  return tempered.map((x) => x - lse);
}

function predictiveProbability(prior: number[], likelihood: number[]): number {
  let pred = 0;
  for (let i = 0; i < prior.length; i++) pred += prior[i]! * likelihood[i]!;
  return Math.max(0, pred);
}

function finalize(
  state: BeliefState,
  likelihood: number[],
  evidence: Evidence,
  config: BeliefConfig,
  dropped: boolean,
  collapsed: boolean
): UpdateResult {
  const prior = posterior(state);
  const predictive = predictiveProbability(prior, likelihood);
  const surprise = predictive > 0 ? -Math.log(predictive) : 50;

  let nextLogs: number[];
  if (collapsed) {
    nextLogs = [...state.logPosterior];
  } else {
    nextLogs = prior.map((p, i) => {
      const l = likelihood[i]!;
      return Math.log(Math.max(p, 1e-300)) + (l > 0 ? Math.log(l) : -Infinity);
    });
    nextLogs = applyTemperature(nextLogs, config.temperature);
  }

  const nextP = normalize(nextLogs);
  const consecutive = surprise >= 2 ? state.consecutiveSurprise + 1 : 0;
  const contradiction = surprise >= config.recoverySurprise || consecutive >= 2;
  const record: EvidenceRecord = {
    evidence,
    predictive,
    surprise,
    posterior: nextP,
    dropped: dropped || undefined,
    collapsed: collapsed || undefined
  };
  const next: BeliefState = {
    ...cloneState(state),
    logPosterior: nextLogs,
    observations: [...state.observations, record],
    consecutiveSurprise: consecutive,
    contradictionActive: state.contradictionActive || contradiction
  };
  return {
    state: next,
    predictive,
    surprise,
    contradiction,
    dropped,
    collapsed
  };
}

export function answerLikelihoods(
  state: BeliefState,
  probe: Probe,
  optionId: string,
  config: BeliefConfig
): number[] {
  const K = Math.max(2, probe.options.length);
  return state.hypotheses.map((h) => {
    const raw = Math.min(1, Math.max(0, probe.likelihood(h.id, optionId)));
    if (config.hardMode) return raw;
    const smoothed = raw * (1 - config.epsilon) + (1 - raw) * (config.epsilon / (K - 1));
    const mixed = config.useOutlier === false
      ? smoothed
      : (1 - config.outlierWeight) * smoothed + config.outlierWeight / K;
    return mixed;
  });
}

export function applyAnswer(
  state: BeliefState,
  probe: Probe,
  optionId: string,
  config: BeliefConfig,
  at: number,
  reliability = 1
): UpdateResult {
  if (!probe.options.some((o) => o.id === optionId)) {
    throw new Error(`unknown option ${optionId} for probe ${probe.id}`);
  }
  if (!Number.isFinite(reliability) || !Number.isFinite(at)) {
    throw new Error("answer reliability and timestamp must be finite");
  }
  const raw = answerLikelihoods(state, probe, optionId, config);
  const K = probe.options.length;
  const rel = Math.min(1, Math.max(0, reliability));
  const likelihood = raw.map((p) => rel * p + (1 - rel) / K);
  const evidence: Evidence = {
    channel: "answer",
    value: optionId,
    probeId: probe.id,
    reliability: rel,
    at
  };
  const sum = likelihood.reduce((a, b) => a + b, 0);
  const collapsed = config.hardMode === true && !(sum > 0);
  return finalize(state, likelihood, evidence, config, false, collapsed);
}

export function applyChannelEvidence(
  state: BeliefState,
  binding: ChannelBinding,
  evidence: Evidence,
  config: BeliefConfig
): UpdateResult {
  if (evidence.channel !== binding.channel || !binding.values.includes(evidence.value)) {
    throw new Error("channel evidence does not match its binding alphabet");
  }
  if (!Number.isFinite(evidence.reliability) || !Number.isFinite(evidence.at)) {
    throw new Error("channel reliability and timestamp must be finite");
  }
  if (evidence.reliability < binding.minReliability) {
    const record: EvidenceRecord = {
      evidence,
      predictive: 1,
      surprise: 0,
      posterior: posterior(state),
      dropped: true
    };
    return {
      state: { ...cloneState(state), observations: [...state.observations, record] },
      predictive: 1,
      surprise: 0,
      contradiction: false,
      dropped: true,
      collapsed: false
    };
  }
  const V = Math.max(2, binding.values.length);
  const rel = Math.min(1, Math.max(0, evidence.reliability));
  const base = state.hypotheses.map((h) => {
    const raw = Math.min(1, Math.max(0, binding.likelihood(h.id, evidence)));
    if (config.hardMode) return raw;
    const withReliability = rel * raw + (1 - rel) / V;
    return config.useOutlier === false
      ? withReliability
      : (1 - config.outlierWeight) * withReliability + config.outlierWeight / V;
  });
  const w = Math.min(1, Math.max(0, binding.weight));
  const likelihood = base.map((p) => w * p + (1 - w) / V);
  const sum = likelihood.reduce((a, b) => a + b, 0);
  const collapsed = config.hardMode === true && !(sum > 0);
  return finalize(state, likelihood, evidence, config, false, collapsed);
}

export function resolveContradiction(state: BeliefState): BeliefState {
  return { ...cloneState(state), contradictionActive: false, consecutiveSurprise: 0 };
}

export interface ReplayInput {
  hypotheses: Hypothesis[];
  prior: Record<string, number>;
  config: BeliefConfig;
  probes: Probe[];
  channels: ChannelBinding[];
  observations: EvidenceRecord[];
}

/**
 * Recompute a belief state from the categorical evidence log. No frame data exists to
 * replay; answers, zones and reliability are all the log contains.
 */
export function replay(input: ReplayInput): BeliefState {
  let state = createBelief(input.hypotheses, input.prior, input.config);
  for (const record of input.observations) {
    const { evidence } = record;
    if (evidence.channel === "answer") {
      const probe = input.probes.find((p) => p.id === evidence.probeId);
      if (!probe) throw new Error(`replay: unknown probe ${evidence.probeId}`);
      state = applyAnswer(state, probe, evidence.value, input.config, evidence.at, evidence.reliability).state;
    } else {
      const binding = input.channels.find((c) => c.channel === evidence.channel);
      if (!binding) throw new Error(`replay: unknown channel ${evidence.channel}`);
      state = applyChannelEvidence(state, binding, evidence, input.config).state;
    }
  }
  return state;
}

export function posteriorMap(state: BeliefState): Record<string, number> {
  const p = posterior(state);
  return Object.fromEntries(state.hypotheses.map((h, i) => [h.id, p[i]!]));
}

export function normalizeLogs(logs: number[]): number[] {
  return normalize(logs);
}

export function uniformDistribution(n: number): number[] {
  return normalizeProbabilities(Array.from({ length: n }, () => 1));
}
