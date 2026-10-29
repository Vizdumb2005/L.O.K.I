import { useCallback, useEffect, useRef, useState } from "react";
import {
  aggregateTrial,
  evaluate,
  splitFitHeldOut,
  type CalibrationMetrics,
  type CalibrationSample,
  type TrialMeasurement
} from "./gaze-calibration.js";

export const CALIBRATION_ZONES = [
  "top-left",
  "top-right",
  "mid-left",
  "mid-right",
  "bottom-left",
  "bottom-right"
] as const;

export type CalibrationZoneId = (typeof CALIBRATION_ZONES)[number];

const TRIALS_PER_ZONE = 3;
const SETTLE_MS = 600;
const DWELL_MS = 1400;
const PAUSE_MS = 800;
const MIN_SAMPLES = 5;

export type CalibrationPhase = "settle" | "dwell" | "pause";

export interface CalibrationRunState {
  status: "idle" | "running" | "done" | "aborted";
  trialIndex: number;
  trialCount: number;
  targetZone: CalibrationZoneId | null;
  phase: CalibrationPhase | null;
  metrics: CalibrationMetrics | null;
}

const INITIAL: CalibrationRunState = {
  status: "idle",
  trialIndex: 0,
  trialCount: 0,
  targetZone: null,
  phase: null,
  metrics: null
};

function shuffledZones(): CalibrationZoneId[] {
  const all = CALIBRATION_ZONES.flatMap((z) => Array.from({ length: TRIALS_PER_ZONE }, () => z));
  let a = (Date.now() ^ 0x9e3779b9) >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [all[i], all[j]] = [all[j]!, all[i]!];
  }
  return all;
}

/**
 * Drives the zone-measurement protocol. The detection loop pushes raw iris
 * offsets through `collect`; the runner aggregates each dwell into ONE trial
 * measurement (frames are correlated; trials are the independent unit).
 * Results stay in memory on this device and open nothing.
 */
export function useGazeCalibration() {
  const [state, setState] = useState<CalibrationRunState>(INITIAL);
  const dwellRef = useRef<{ zoneId: CalibrationZoneId; samples: CalibrationSample[]; lumaSum: number; lumaN: number } | null>(null);
  const abortRef = useRef(0);
  const measurementsRef = useRef<TrialMeasurement[]>([]);

  const collect = useCallback((x: number, y: number, luma: number | null, at: number) => {
    const dwell = dwellRef.current;
    if (!dwell) return;
    dwell.samples.push({ x, y, at });
    if (luma !== null) {
      dwell.lumaSum += luma;
      dwell.lumaN += 1;
    }
  }, []);

  const stop = useCallback(() => {
    abortRef.current += 1;
    dwellRef.current = null;
    setState((s) => (s.status === "running" ? { ...INITIAL } : s));
  }, []);

  useEffect(() => () => { abortRef.current += 1; dwellRef.current = null; }, []);

  const start = useCallback(async () => {
    const runId = ++abortRef.current;
    const alive = () => abortRef.current === runId;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const sequence = shuffledZones();
    measurementsRef.current = [];
    setState({ status: "running", trialIndex: 0, trialCount: sequence.length, targetZone: null, phase: "pause", metrics: null });

    for (let i = 0; i < sequence.length; i++) {
      if (!alive()) return;
      const zoneId = sequence[i]!;
      // Center pause: separates trials so neighbouring dwells stay independent.
      setState({ status: "running", trialIndex: i, trialCount: sequence.length, targetZone: null, phase: "pause", metrics: null });
      await wait(PAUSE_MS);
      if (!alive()) return;
      // Settle: target shown, samples not yet collected (saccade + lag).
      setState({ status: "running", trialIndex: i, trialCount: sequence.length, targetZone: zoneId, phase: "settle", metrics: null });
      await wait(SETTLE_MS);
      if (!alive()) return;
      // Dwell: collect.
      dwellRef.current = { zoneId, samples: [], lumaSum: 0, lumaN: 0 };
      setState({ status: "running", trialIndex: i, trialCount: sequence.length, targetZone: zoneId, phase: "dwell", metrics: null });
      await wait(DWELL_MS);
      const dwell = dwellRef.current;
      dwellRef.current = null;
      if (!alive()) return;
      measurementsRef.current.push(
        aggregateTrial(zoneId, dwell?.samples ?? [], MIN_SAMPLES, dwell && dwell.lumaN > 0 ? dwell.lumaSum / dwell.lumaN : null)
      );
    }

    const { fit, heldOut } = splitFitHeldOut(measurementsRef.current);
    const metrics = evaluate(fit, heldOut, [...CALIBRATION_ZONES]);
    setState({ status: "done", trialIndex: sequence.length, trialCount: sequence.length, targetZone: null, phase: null, metrics });
  }, []);

  return { state, start, stop, collect };
}
