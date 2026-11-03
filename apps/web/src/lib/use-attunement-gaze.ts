import { useEffect, useRef, useState } from "react";
import { assessGazeQuality, zoneAtPoint, GazeWindowAggregator, type GazeWindow } from "@loki/perception";
import type { StageZone } from "@loki/effect-api";
import {
  attunementSchedule,
  calibrationVerdict,
  emberSampleAt,
  type CalibrationVerdict,
  type EmberSample
} from "./attunement-ritual.js";
import { applyAffineMap, type AffineMap, type Point } from "./gaze-map.js";
import { localMediaPipePaths } from "./mediapipe-paths.js";

/**
 * Blueprint v4 §2.2/§2.3 — the live attunement ritual.
 *
 * During the attune beat a soft ember drifts across four stage anchors while
 * the spectator follows it; the collected iris offsets fit one affine map.
 * When the residual and quality gates pass, the gaze channel opens and the
 * spectator is invited to hold their card in the light once more - the
 * fixation windows feed the session's gaze evidence. Nothing is uploaded;
 * frames are processed in this tab and discarded.
 */

type Landmark = { x: number; y: number; z: number };
interface FaceLandmarkerLike {
  detectForVideo(video: HTMLVideoElement, timestamp: number): { faceLandmarks: Landmark[][] };
  close(): void;
}

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const DETECT_INTERVAL_MS = 90;
/** Assumed stage width for converting normalized residual into RMSE pixels. */
const STAGE_WIDTH_PX = 800;

function average(points: Landmark[]): Landmark {
  const n = Math.max(1, points.length);
  return {
    x: points.reduce((s, p) => s + p.x, 0) / n,
    y: points.reduce((s, p) => s + p.y, 0) / n,
    z: points.reduce((s, p) => s + p.z, 0) / n
  };
}

/** Raw iris displacement from the eye corners (same signal as the lab). */
function irisOffset(landmarks: Landmark[]): { x: number; y: number } | null {
  const leftIris = average([468, 469, 470, 471, 472].map((i) => landmarks[i]).filter(Boolean) as Landmark[]);
  const rightIris = average([473, 474, 475, 476, 477].map((i) => landmarks[i]).filter(Boolean) as Landmark[]);
  const leftOuter = landmarks[33];
  const leftInner = landmarks[133];
  const rightInner = landmarks[362];
  const rightOuter = landmarks[263];
  if (!leftOuter || !leftInner || !rightInner || !rightOuter) return null;
  const leftWidth = Math.abs(leftOuter.x - leftInner.x) || 0.05;
  const rightWidth = Math.abs(rightOuter.x - rightInner.x) || 0.05;
  const leftCenter = { x: (leftOuter.x + leftInner.x) / 2, y: (leftOuter.y + leftInner.y) / 2 };
  const rightCenter = { x: (rightOuter.x + rightInner.x) / 2, y: (rightOuter.y + rightInner.y) / 2 };
  const x = ((leftIris.x - leftCenter.x) / leftWidth + (rightIris.x - rightCenter.x) / rightWidth) / 2;
  const y = ((leftIris.y - leftCenter.y) / leftWidth + (rightIris.y - rightCenter.y) / rightWidth) / 2;
  return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
}

async function createLandmarker(_video: HTMLVideoElement): Promise<FaceLandmarkerLike> {
  const vision = await import("@mediapipe/tasks-vision");
  const local = localMediaPipePaths(import.meta.env.BASE_URL ?? "/");
  const attempts = [
    { wasm: local.wasm, model: local.model },
    { wasm: WASM_CDN, model: MODEL_URL }
  ];
  let lastError: unknown = new Error("no MediaPipe assets available");
  for (const attempt of attempts) {
    try {
      const fileset = await vision.FilesetResolver.forVisionTasks(attempt.wasm);
      const landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: attempt.model, delegate: "CPU" },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false
      });
      return landmarker as unknown as FaceLandmarkerLike;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export type AttunementStatus = "idle" | "calibrating" | "tracking" | "validated" | "failed";

export interface AttunementState {
  status: AttunementStatus;
  /** Ember anchor index during calibration; null while tracking. */
  step: number | null;
  phase: "settle" | "dwell" | "track" | null;
  /** Current ember position in normalized stage coordinates. */
  anchor: Point | null;
  /** Gaze windows fed to the session so far. */
  windowsFed: number;
}

export interface GazeAccumulatorSample {
  iris: Point;
  reliability: number;
  at: number;
}

export class GazeAccumulator {
  private readonly aggregator: GazeWindowAggregator;
  private readonly zones: StageZone[];
  private map: AffineMap | null = null;
  private pendingIrisSamples: GazeAccumulatorSample[] = [];

  constructor(zones: StageZone[], minDwellMs = 900) {
    this.zones = zones;
    this.aggregator = new GazeWindowAggregator(minDwellMs);
  }

  setMap(map: AffineMap | null): void {
    this.map = map;
    if (map && this.pendingIrisSamples.length > 0) {
      for (const sample of this.pendingIrisSamples) {
        this.addIrisSample(sample.iris, sample.reliability, sample.at);
      }
      this.pendingIrisSamples = [];
    }
  }

  addPoint(point: Point, reliability: number, at: number): void {
    const zone = zoneAtPoint(this.zones, point.x, point.y);
    if (zone) {
      this.aggregator.add({ zone, reliability, at });
    }
  }

  addIrisSample(iris: Point, reliability: number, at: number): void {
    if (this.map) {
      const point = applyAffineMap(this.map, iris);
      this.addPoint(point, reliability, at);
    } else {
      this.pendingIrisSamples.push({ iris, reliability, at });
    }
  }

  resolveWindow(): GazeWindow | null {
    return this.aggregator.finalize();
  }

  reset(): void {
    this.aggregator.reset();
    this.pendingIrisSamples = [];
  }

  get frameCount(): number {
    return this.aggregator.frameCount + this.pendingIrisSamples.length;
  }
}

export interface UseAttunementGazeOptions {
  /** True during think and attune beats when sensorMode is enabled. */
  active: boolean;
  phase?: string | null;
  video: HTMLVideoElement | null;
  zones: StageZone[];
  accumulator?: GazeAccumulator | null;
  onValidated: (
    quality?: { usable?: boolean },
    calibration?: { calibrated?: boolean; rmse?: number | null }
  ) => void;
  onGazeWindow: (window: GazeWindow) => void;
  onComplete?: () => void;
}

export function useAttunementGaze(options: UseAttunementGazeOptions): {
  state: AttunementState;
  accumulator: GazeAccumulator | null;
  landmarks?: Landmark[] | null;
} {
  const { active, video, zones } = options;
  const [state, setState] = useState<AttunementState>({
    status: "idle",
    step: null,
    phase: null,
    anchor: null,
    windowsFed: 0
  });
  const windowsFedRef = useRef(0);
  const landmarksRef = useRef<Landmark[] | null>(null);
  const internalAccumulatorRef = useRef<GazeAccumulator | null>(null);
  if (!internalAccumulatorRef.current && zones.length > 0) {
    internalAccumulatorRef.current = new GazeAccumulator(zones, 900);
  }
  const accumulatorRef = useRef<GazeAccumulator | null>(options.accumulator ?? internalAccumulatorRef.current);
  accumulatorRef.current = options.accumulator ?? internalAccumulatorRef.current;

  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!active || !video) return;
    let live = true;
    let landmarker: FaceLandmarkerLike | null = null;
    let timer = 0;
    let lastDetect = 0;
    let lastVideoTime = -1;
    let attuneStarted = false;
    const schedule = attunementSchedule();
    let verdict: CalibrationVerdict | null = null;
    const samples: EmberSample[] = [];
    let dwellSamples: Array<{ x: number; y: number }> = [];
    const aggregator = new GazeWindowAggregator(900);
    let tracking = false;

    const setEmber = (patch: Partial<AttunementState>) =>
      live && setState((s) => ({ ...s, ...patch }));

    const frameQuality = (facePresent: boolean, frames: number) =>
      assessGazeQuality({
        calibrationRmsePx: verdict?.rmse != null ? verdict.rmse * STAGE_WIDTH_PX : null,
        faceConfidence: facePresent ? 0.85 : 0,
        headYawDeg: 0,
        headPitchDeg: 0,
        eyeDisagreementDeg: 2,
        brightness: 0.5,
        frames
      });

    const checkStartAttune = () => {
      if (!live || !landmarker || attuneStarted) return;
      if (optionsRef.current.phase === "attune") {
        attuneStarted = true;
        setEmber({ status: "calibrating", step: 0, phase: "settle", anchor: schedule[0]!.anchor });
        void runStep(0);
      }
    };

    const detect = () => {
      if (!live || !landmarker) return;
      checkStartAttune();
      const now = performance.now();
      if (video.readyState < 2 || video.videoWidth === 0) {
        timer = window.setTimeout(detect, 250);
        return;
      }
      if (now - lastDetect >= DETECT_INTERVAL_MS && (video.currentTime !== lastVideoTime || lastVideoTime === -1)) {
        lastDetect = now;
        lastVideoTime = video.currentTime;
        try {
          const result = landmarker.detectForVideo(video, now);
          const landmarks = result.faceLandmarks[0];
          landmarksRef.current = (landmarks as Landmark[] | undefined) ?? null;
          const facePresent = !!(landmarks && landmarks.length > 400);
          const iris = facePresent && landmarks ? irisOffset(landmarks) : null;

          const currentPhase = optionsRef.current.phase;
          if (currentPhase === "think") {
            // Buffer uncalibrated raw iris samples during think
            if (iris && accumulatorRef.current) {
              const quality = frameQuality(facePresent, accumulatorRef.current.frameCount + 1);
              if (quality.usable) {
                accumulatorRef.current.addIrisSample(iris, quality.reliability, now);
              }
            }
          } else if (currentPhase === "attune") {
            if (!tracking) {
              // Calibration dwell collection.
              if (iris && dwellSamples.length < 60) dwellSamples.push(iris);
            } else if (iris && verdict?.map && verdict.calibrated) {
              // Refixation tracking: iris -> stage point -> zone -> window.
              const point = applyAffineMap(verdict.map, iris);
              const zone = zoneAtPoint(zones, point.x, point.y);
              if (zone) {
                const quality = frameQuality(facePresent, aggregator.frameCount + 1);
                if (quality.usable) {
                  aggregator.add({ zone, at: now, reliability: quality.reliability });
                }
              }
              // Emit any completed window; the session caps at two.
              if (aggregator.frameCount >= 30 || (aggregator.frameCount > 12 && now - lastWindowCheck > 1400)) {
                const window = aggregator.finalize();
                if (window && windowsFedRef.current < 2) {
                  windowsFedRef.current += 1;
                  optionsRef.current.onGazeWindow(window);
                  setEmber({ windowsFed: windowsFedRef.current });
                  aggregator.reset();
                }
              }
              lastWindowCheck = now;
            }
          }
        } catch {
          // Detection hiccup: keep the ritual going, drop this frame.
        }
      }
      timer = window.setTimeout(detect, 40);
    };
    let lastWindowCheck = 0;

    const runStep = async (index: number) => {
      if (!live) return;
      if (index >= schedule.length) {
        // Calibration complete: fit, gate, and either open the channel or fail honestly.
        const quality = frameQuality(true, 40);
        verdict = calibrationVerdict(samples, quality);
        if (quality.usable && verdict.calibrated && verdict.rmse !== null && verdict.rmse <= 0.15) {
          optionsRef.current.onValidated(quality, verdict);
          if (accumulatorRef.current && verdict.map) {
            accumulatorRef.current.setMap(verdict.map);
            const thinkWindow = accumulatorRef.current.resolveWindow();
            if (thinkWindow && thinkWindow.reliability >= 0.35 && windowsFedRef.current < 2) {
              windowsFedRef.current += 1;
              optionsRef.current.onGazeWindow(thinkWindow);
              setEmber({ windowsFed: windowsFedRef.current });
            }
          }
          tracking = true;
          aggregator.reset();
          setEmber({ status: "tracking", step: null, phase: "track", anchor: null });
          optionsRef.current.onComplete?.();
        } else {
          setEmber({ status: "failed", step: null, phase: null, anchor: null });
          optionsRef.current.onComplete?.();
        }
        return;
      }
      const step = schedule[index]!;
      setEmber({ status: "calibrating", step: index, phase: "settle", anchor: step.anchor });
      await new Promise((r) => setTimeout(r, step.settleMs));
      if (!live) return;
      dwellSamples = [];
      setEmber({ status: "calibrating", step: index, phase: "dwell", anchor: step.anchor });
      await new Promise((r) => setTimeout(r, step.dwellMs));
      if (!live) return;
      const sample = emberSampleAt(step.anchor, dwellSamples);
      if (sample) samples.push(sample);
      await runStep(index + 1);
    };

    createLandmarker(video)
      .then((lm) => {
        if (!live) {
          lm.close();
          return;
        }
        landmarker = lm;
        detect();
        checkStartAttune();
      })
      .catch(() => {
        if (live) setEmber({ status: "failed", step: null, phase: null, anchor: null });
      });

    return () => {
      live = false;
      window.clearTimeout(timer);
      landmarker?.close();
    };
  }, [active, video, zones]);

  return { state, accumulator: accumulatorRef.current, landmarks: landmarksRef.current };
}