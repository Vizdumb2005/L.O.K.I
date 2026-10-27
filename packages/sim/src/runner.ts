import type { Effect } from "@loki/effect-api";
import {
  expectedCalibrationError,
  meanCI,
  multiclassBrier,
  reliabilityBins,
  wilsonInterval,
  type BeliefConfig,
  type PolicyId,
  type ReliabilityBin
} from "@loki/engine";
import { PerformanceSession } from "@loki/showrunner";
import { mulberry32, clamp01 } from "./rng.js";
import {
  chooseAnswer,
  sampleGaze,
  sampleTruth,
  type SpectatorConfig
} from "./spectator.js";

export interface RunOptions {
  effect: Effect;
  seed: number;
  policy: PolicyId;
  spectator: SpectatorConfig;
  beliefOverrides?: Partial<BeliefConfig>;
}

export interface RunResult {
  trueId: string;
  phase: string;
  committed: boolean;
  revealedId?: string;
  correct: boolean;
  wrongConfident: boolean;
  confidence: number;
  probes: number;
  recoveries: number;
  brier: number;
  gazeUsed: boolean;
  observations: number;
  finalPosterior: number[];
}

export function runOne(options: RunOptions & { trueId?: string }): RunResult {
  const { effect, seed, policy, spectator } = options;
  const random = mulberry32(seed ^ 0x9e3779b9);
  const trueId = options.trueId ?? sampleTruth(effect, spectator, seed);
  let clock = 0;
  const session = new PerformanceSession(effect, {
    seed,
    policy,
    cameraEnabled: spectator.gaze,
    cameraValidated: spectator.gaze,
    forceEnabled: spectator.force,
    now: () => (clock += 100),
    beliefOverrides: options.beliefOverrides
  });
  session.begin();
  session.chosen();
  if (session.phaseName === "attune") {
    const gaze = sampleGaze(effect, session.stage, trueId, spectator, random);
    if (gaze) session.addGaze({ zone: gaze.zone, reliability: gaze.reliability });
    session.finishAttune();
  }

  let probeOrdinal = 0;
  for (let step = 0; step < 20; step++) {
    const phase = session.phaseName;
    if (phase === "recover") {
      session.advance();
      continue;
    }
    if (phase === "probe") {
      const view = session.snapshot();
      const probe = effect.probes().find((p) => p.id === view.probeId);
      if (!probe) throw new Error(`sim: session asked unknown probe ${view.probeId}`);
      probeOrdinal += 1;
      const option = chooseAnswer(probe, trueId, spectator, probeOrdinal, random);
      session.answer(option);
      if (session.phaseName === "build") {
        session.advance();
        break;
      }
      continue;
    }
    break;
  }

  const internal = session.internal();
  const hypotheses = effect.hypotheses();
  const truthIndex = hypotheses.findIndex((h) => h.id === trueId);
  const p = hypotheses.map((h) => internal.posterior[h.id] ?? 0);
  const committed = internal.phase === "reveal";
  const revealedId = internal.revealedId;
  const correct = committed && revealedId === trueId;
  const log = session.exportLog();
  return {
    trueId,
    phase: internal.phase,
    committed,
    revealedId,
    correct,
    wrongConfident: committed && !correct,
    confidence: internal.confidence,
    probes: internal.answered,
    recoveries: internal.recoveries,
    brier: multiclassBrier(p, truthIndex),
    gazeUsed: internal.gazeWindows > 0,
    observations: log.observations.length,
    finalPosterior: p
  };
}

export interface CellSpec {
  label: string;
  runs: number;
  seed: number;
  effect: Effect;
  policy: PolicyId;
  answerError: number;
  gaze: boolean;
  force: boolean;
  gazeAccuracy?: number;
  gazeReliability?: number;
  hardMode?: boolean;
  useOutlier?: boolean;
  itemBias?: { itemId: string; multiplier: number };
}

export interface CellMetrics {
  label: string;
  effectId: string;
  effectName: string;
  policy: PolicyId;
  answerError: number;
  gaze: boolean;
  force: boolean;
  hardMode: boolean;
  useOutlier: boolean;
  n: number;
  seed: number;
  commits: number;
  misses: number;
  correct: number;
  wrong: number;
  commitRate: [number, number];
  committedAccuracy: [number, number];
  matchRateAll: [number, number];
  wrongConfidentRateAll: [number, number];
  wrongConfidentRateCommits: [number, number];
  missRate: [number, number];
  meanProbes: number;
  meanProbesCI: [number, number];
  meanRecoveries: number;
  meanConfidence: number;
  brier: number;
  brierCI: [number, number];
  ece: number;
  bins: ReliabilityBin[];
}

export function runCell(spec: CellSpec): CellMetrics {
  spec.effect.validate();
  const spectator: SpectatorConfig = {
    answerError: clamp01(spec.answerError),
    force: spec.force,
    gaze: spec.gaze,
    gazeAccuracy: spec.gazeAccuracy ?? 0.65,
    gazeReliability: spec.gazeReliability ?? 0.65,
    itemBias: spec.itemBias
  };
  const results: RunResult[] = [];
  for (let i = 0; i < spec.runs; i++) {
    // Same per-run seed across policies/conditions keeps comparisons paired.
    results.push(
      runOne({
        effect: spec.effect,
        seed: spec.seed + i * 7919,
        policy: spec.policy,
        spectator,
        beliefOverrides: {
          hardMode: spec.hardMode ?? false,
          useOutlier: spec.useOutlier ?? true
        }
      })
    );
  }
  const n = results.length;
  const commits = results.filter((r) => r.committed).length;
  const correct = results.filter((r) => r.correct).length;
  const wrong = results.filter((r) => r.wrongConfident).length;
  const misses = n - commits;
  const probabilityRows = results.map((r) => {
    const effectHypotheses = spec.effect.hypotheses();
    const truthIndex = effectHypotheses.findIndex((h) => h.id === r.trueId);
    return {
      probabilities: r.finalPosterior,
      truthIndex
    };
  });
  const bins = reliabilityBins(probabilityRows, 10);
  const ece = expectedCalibrationError(probabilityRows, 10);
  const brierValues = results.map((r) => r.brier);
  const probeValues = results.map((r) => r.probes);
  const brier = brierValues.reduce((a, b) => a + b, 0) / Math.max(1, n);
  const meanProbes = probeValues.reduce((a, b) => a + b, 0) / Math.max(1, n);
  const meanConfidence = results.reduce((a, r) => a + r.confidence, 0) / Math.max(1, n);
  const meanRecoveries = results.reduce((a, r) => a + r.recoveries, 0) / Math.max(1, n);
  return {
    label: spec.label,
    effectId: spec.effect.id,
    effectName: spec.effect.name,
    policy: spec.policy,
    answerError: spec.answerError,
    gaze: spec.gaze,
    force: spec.force,
    hardMode: spec.hardMode ?? false,
    useOutlier: spec.useOutlier ?? true,
    n,
    seed: spec.seed,
    commits,
    misses,
    correct,
    wrong,
    commitRate: wilsonInterval(commits, n),
    committedAccuracy: wilsonInterval(correct, commits),
    matchRateAll: wilsonInterval(correct, n),
    wrongConfidentRateAll: wilsonInterval(wrong, n),
    wrongConfidentRateCommits: wilsonInterval(wrong, commits),
    missRate: wilsonInterval(misses, n),
    meanProbes,
    meanProbesCI: meanCI(probeValues),
    meanRecoveries,
    meanConfidence,
    brier,
    brierCI: meanCI(brierValues),
    ece,
    bins
  };
}
