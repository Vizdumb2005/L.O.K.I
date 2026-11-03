import { describe, expect, it } from "vitest";
import { cardEffect } from "../effects/card/src/index.js";
import { CARD_STAGE_BASE, CARDS } from "../effects/card/src/cards.js";
import { PerformanceSession } from "@loki/showrunner";
import { beliefEntropy } from "@loki/engine";
import {
  assessGazeQuality,
  GazeWindowAggregator,
  zoneAtPoint,
  type GazeQualityInput
} from "@loki/perception";
import {
  attunementSchedule,
  calibrationVerdict,
  emberSampleAt,
  EMBER_ANCHORS,
  CALIBRATION_RMSE_MAX,
  MIN_EMBER_SAMPLES,
  type EmberSample
} from "../apps/web/src/lib/attunement-ritual.js";
import {
  fitAffineMap,
  applyAffineMap,
  affineRmse,
  type AffineSample,
  type AffineMap,
  type Point
} from "../apps/web/src/lib/gaze-map.js";
import { GazeAccumulator } from "../apps/web/src/lib/use-attunement-gaze.js";
import type { StageSpec, StageZone } from "@loki/effect-api";

function zoneOf(stage: StageSpec, itemId: string): string | null {
  const index = stage.items.findIndex((item) => item.hypothesisId === itemId);
  if (index < 0) return null;
  const columns = stage.columns;
  const row = Math.floor(index / columns);
  const column = index % columns;
  const half = column < columns / 2 ? 0 : 1;
  return stage.zones?.[row * 2 + half]?.id ?? null;
}

function zoneCards(stage: StageSpec, zone: string): string[] {
  return stage.items
    .filter((item) => zoneOf(stage, item.hypothesisId) === zone)
    .map((item) => item.hypothesisId);
}

describe("Milestone 2 Challenge Vector 1: Camera Validation Logic & Gating Flaws", () => {
  it("investigates validateCamera gating logic behavior with asymmetric arguments", () => {
    // In apps/web/src/lib/performance.ts:124:
    // if (gazeQuality !== undefined && gazeCalibration !== undefined) {
    //   if (!gazeQuality.usable || !gazeCalibration.calibrated) return;
    // }
    // session.validateCamera();

    const session = new PerformanceSession(cardEffect, {
      seed: 42,
      cameraEnabled: true,
      cameraValidated: false,
      presenceEnabled: true
    });
    session.begin();
    expect(session.snapshot().camera.validated).toBe(false);

    // Flaw 1A: If gazeQuality is { usable: false } but gazeCalibration is undefined:
    // (gazeQuality !== undefined && gazeCalibration !== undefined) evaluates to FALSE!
    // The gate is completely bypassed!
    const gazeQualityBad = { usable: false };
    const gazeCalibrationUndefined = undefined;

    const bypassQualityCheck = (gq?: any, gc?: any) => {
      if (gq !== undefined && gc !== undefined) {
        if (!gq.usable || !gc.calibrated) return false;
      }
      return session.validateCamera();
    };

    const validated1 = bypassQualityCheck(gazeQualityBad, gazeCalibrationUndefined);
    // Empirically confirms that asymmetric single-argument bypasses the check!
    expect(validated1).toBe(true);
    expect(session.snapshot().camera.validated).toBe(true);
  });

  it("investigates validateCamera behavior with null inputs causing TypeError", () => {
    // In JavaScript, (null !== undefined) is TRUE.
    // If gazeQuality is null and gazeCalibration is null:
    // gazeQuality !== undefined && gazeCalibration !== undefined is TRUE.
    // Then !gazeQuality.usable throws TypeError: Cannot read properties of null (reading 'usable')!
    const testValidate = (gazeQuality?: any, gazeCalibration?: any) => {
      if (gazeQuality !== undefined && gazeCalibration !== undefined) {
        if (!gazeQuality.usable || !gazeCalibration.calibrated) {
          return false;
        }
      }
      return true;
    };

    expect(() => testValidate(null, null)).toThrow(TypeError);
    expect(() => testValidate(null, { calibrated: true })).toThrow(TypeError);
  });

  it("investigates validateCamera with calibrated=true but high RMSE > 0.15", () => {
    // In PerformanceGazeCalibration, rmse?: number | null is defined.
    // But validateCamera in performance.ts line 125 only checks:
    // if (!gazeQuality.usable || !gazeCalibration.calibrated) return;
    // It NEVER checks if rmse <= 0.15!
    const session = new PerformanceSession(cardEffect, {
      seed: 43,
      cameraEnabled: true,
      cameraValidated: false,
      presenceEnabled: true
    });
    session.begin();

    const highRmseCalibration = { calibrated: true, rmse: 0.28 }; // RMSE >> 0.15 limit!
    const goodQuality = { usable: true };

    const validateFn = (gq?: any, gc?: any) => {
      if (gq !== undefined && gc !== undefined) {
        if (!gq.usable || !gc.calibrated) return false;
      }
      return session.validateCamera();
    };

    const allowed = validateFn(goodQuality, highRmseCalibration);
    // Notice that without an explicit check for gc.rmse <= 0.15, high RMSE leaks through!
    expect(allowed).toBe(true);
  });
});

describe("Milestone 2 Challenge Vector 2: Disguised Ember Calibration Edge Cases", () => {
  const goodQuality = assessGazeQuality({
    calibrationRmsePx: 50,
    faceConfidence: 0.9,
    headYawDeg: 2,
    headPitchDeg: 1,
    eyeDisagreementDeg: 1,
    brightness: 0.5,
    frames: 40
  });

  it("strictly rejects insufficient samples (< 4 anchors: 0, 1, 2, 3)", () => {
    const s0: EmberSample[] = [];
    const s1: EmberSample[] = [{ source: { x: -0.2, y: -0.2 }, target: EMBER_ANCHORS[0]! }];
    const s2: EmberSample[] = [
      { source: { x: -0.2, y: -0.2 }, target: EMBER_ANCHORS[0]! },
      { source: { x: 0.2, y: -0.2 }, target: EMBER_ANCHORS[1]! }
    ];
    const s3: EmberSample[] = [
      { source: { x: -0.2, y: -0.2 }, target: EMBER_ANCHORS[0]! },
      { source: { x: 0.2, y: -0.2 }, target: EMBER_ANCHORS[1]! },
      { source: { x: 0.2, y: 0.2 }, target: EMBER_ANCHORS[2]! }
    ];

    expect(calibrationVerdict(s0, goodQuality).calibrated).toBe(false);
    expect(calibrationVerdict(s0, goodQuality).map).toBeNull();
    expect(calibrationVerdict(s1, goodQuality).calibrated).toBe(false);
    expect(calibrationVerdict(s2, goodQuality).calibrated).toBe(false);
    expect(calibrationVerdict(s3, goodQuality).calibrated).toBe(false);
  });

  it("strictly returns null from fitAffineMap on degenerate horizontal collinear points", () => {
    // All source points share the exact same y-coordinate (y = 0)
    const horizontalCollinear: EmberSample[] = [
      { source: { x: -0.4, y: 0 }, target: EMBER_ANCHORS[0]! },
      { source: { x: -0.1, y: 0 }, target: EMBER_ANCHORS[1]! },
      { source: { x: 0.2, y: 0 }, target: EMBER_ANCHORS[2]! },
      { source: { x: 0.5, y: 0 }, target: EMBER_ANCHORS[3]! }
    ];
    const map = fitAffineMap(horizontalCollinear);
    expect(map).toBeNull();

    const verdict = calibrationVerdict(horizontalCollinear, goodQuality);
    expect(verdict.calibrated).toBe(false);
    expect(verdict.map).toBeNull();
    expect(verdict.rmse).toBeNull();
  });

  it("strictly returns null from fitAffineMap on degenerate vertical collinear points", () => {
    // All source points share the exact same x-coordinate (x = 0)
    const verticalCollinear: EmberSample[] = [
      { source: { x: 0, y: -0.4 }, target: EMBER_ANCHORS[0]! },
      { source: { x: 0, y: -0.1 }, target: EMBER_ANCHORS[1]! },
      { source: { x: 0, y: 0.2 }, target: EMBER_ANCHORS[2]! },
      { source: { x: 0, y: 0.5 }, target: EMBER_ANCHORS[3]! }
    ];
    const map = fitAffineMap(verticalCollinear);
    expect(map).toBeNull();

    const verdict = calibrationVerdict(verticalCollinear, goodQuality);
    expect(verdict.calibrated).toBe(false);
  });

  it("strictly returns null from fitAffineMap on degenerate diagonal collinear points (y = m*x + c)", () => {
    // All source points lie on the line y = 1.5 * x - 0.1
    const diagonalCollinear: EmberSample[] = [
      { source: { x: -0.3, y: 1.5 * -0.3 - 0.1 }, target: EMBER_ANCHORS[0]! },
      { source: { x: -0.1, y: 1.5 * -0.1 - 0.1 }, target: EMBER_ANCHORS[1]! },
      { source: { x: 0.2, y: 1.5 * 0.2 - 0.1 }, target: EMBER_ANCHORS[2]! },
      { source: { x: 0.4, y: 1.5 * 0.4 - 0.1 }, target: EMBER_ANCHORS[3]! }
    ];
    const map = fitAffineMap(diagonalCollinear);
    expect(map).toBeNull();

    const verdict = calibrationVerdict(diagonalCollinear, goodQuality);
    expect(verdict.calibrated).toBe(false);
  });

  it("strictly returns null from fitAffineMap on completely stationary iris (all points identical)", () => {
    const stationary: EmberSample[] = [
      { source: { x: 0.05, y: -0.02 }, target: EMBER_ANCHORS[0]! },
      { source: { x: 0.05, y: -0.02 }, target: EMBER_ANCHORS[1]! },
      { source: { x: 0.05, y: -0.02 }, target: EMBER_ANCHORS[2]! },
      { source: { x: 0.05, y: -0.02 }, target: EMBER_ANCHORS[3]! }
    ];
    const map = fitAffineMap(stationary);
    expect(map).toBeNull();

    const verdict = calibrationVerdict(stationary, goodQuality);
    expect(verdict.calibrated).toBe(false);
  });

  it("strictly enforces CALIBRATION_RMSE_MAX = 0.15 threshold boundary", () => {
    // Construct samples with controlled noise around ground truth affine map
    // Target = [0.8*x + 0.5, 0.8*y + 0.5]
    const baseSources: Point[] = [
      { x: -0.25, y: -0.25 },
      { x: 0.25, y: -0.25 },
      { x: 0.25, y: 0.25 },
      { x: -0.25, y: 0.25 }
    ];

    // Case A: Near zero noise -> RMSE < 0.05 -> calibrated
    const cleanSamples: EmberSample[] = baseSources.map((s) => ({
      source: s,
      target: { x: 0.8 * s.x + 0.5, y: 0.8 * s.y + 0.5 }
    }));
    const cleanVerdict = calibrationVerdict(cleanSamples, goodQuality);
    expect(cleanVerdict.calibrated).toBe(true);
    expect(cleanVerdict.rmse).toBeLessThan(0.01);

    // Case B: Residual exactly above 0.15 threshold
    // Perturb targets heavily so affine map fit error exceeds 0.15
    const noisySamples: EmberSample[] = [
      { source: baseSources[0]!, target: { x: 0.1, y: 0.9 } },
      { source: baseSources[1]!, target: { x: 0.9, y: 0.1 } },
      { source: baseSources[2]!, target: { x: 0.1, y: 0.1 } },
      { source: baseSources[3]!, target: { x: 0.9, y: 0.9 } }
    ];
    const noisyVerdict = calibrationVerdict(noisySamples, goodQuality);
    expect(noisyVerdict.rmse).toBeGreaterThan(0.15);
    expect(noisyVerdict.calibrated).toBe(false);
  });

  it("emberSampleAt correctly extracts median offset and returns null for empty samples", () => {
    const anchor = { x: 0.25, y: 0.25 };
    expect(emberSampleAt(anchor, [])).toBeNull();

    // Median of odd length list
    const oddDwell = [
      { x: 0.1, y: 0.2 },
      { x: 0.5, y: 0.9 }, // outlier
      { x: 0.12, y: 0.22 }
    ];
    const sOdd = emberSampleAt(anchor, oddDwell);
    expect(sOdd).not.toBeNull();
    expect(sOdd!.source.x).toBe(0.12);
    expect(sOdd!.source.y).toBe(0.22);
    expect(sOdd!.target).toEqual(anchor);

    // Median of even length list
    const evenDwell = [
      { x: 0.1, y: 0.2 },
      { x: 0.2, y: 0.4 },
      { x: 0.3, y: 0.6 },
      { x: 0.4, y: 0.8 }
    ];
    const sEven = emberSampleAt(anchor, evenDwell);
    expect(sEven).not.toBeNull();
    expect(sEven!.source.x).toBe(0.25);
    expect(sEven!.source.y).toBe(0.5);
  });
});

describe("Milestone 2 Challenge Vector 3: assessGazeQuality Environmental Stress", () => {
  const baseInput: GazeQualityInput = {
    calibrationRmsePx: 45,
    faceConfidence: 0.95,
    headYawDeg: 0,
    headPitchDeg: 0,
    eyeDisagreementDeg: 1,
    brightness: 0.5,
    frames: 30
  };

  it("handles low ambient light (< 0.18) with proper flag and 50% light factor penalty", () => {
    const lowLight = assessGazeQuality({ ...baseInput, brightness: 0.12 });
    expect(lowLight.flags).toContain("low-light");

    const nominal = assessGazeQuality(baseInput);
    // Light factor is 0.5 for brightness < 0.18
    expect(lowLight.reliability).toBeCloseTo(nominal.reliability * 0.5, 2);
  });

  it("handles overexposed light (> 0.92) with proper flag and penalty", () => {
    const overexposed = assessGazeQuality({ ...baseInput, brightness: 0.96 });
    expect(overexposed.flags).toContain("overexposed");
    const nominal = assessGazeQuality(baseInput);
    expect(overexposed.reliability).toBeCloseTo(nominal.reliability * 0.85, 2);
  });

  it("penalizes rapid head movements (yaw/pitch > 12 degrees)", () => {
    const moderateYaw = assessGazeQuality({ ...baseInput, headYawDeg: 15 });
    expect(moderateYaw.flags).toContain("head-motion");
    expect(moderateYaw.reliability).toBeLessThan(assessGazeQuality(baseInput).reliability);

    // Extreme head turn 40 degrees
    const extremeYaw = assessGazeQuality({ ...baseInput, headYawDeg: 40 });
    expect(extremeYaw.flags).toContain("head-motion");
    // Head factor caps penalty at 0.55 max deduction
    expect(extremeYaw.reliability).toBeLessThan(moderateYaw.reliability);
  });

  it("rejects unusable quality when frames < 12 or faceConfidence < 0.55", () => {
    const fewFrames = assessGazeQuality({ ...baseInput, frames: 11 });
    expect(fewFrames.usable).toBe(false);

    const lowConfidence = assessGazeQuality({ ...baseInput, faceConfidence: 0.50 });
    expect(lowConfidence.flags).toContain("low-face-confidence");
    expect(lowConfidence.usable).toBe(false);
  });

  it("strictly marks quality unusable when calibration residual is null (no calibration)", () => {
    const noCalib = assessGazeQuality({ ...baseInput, calibrationRmsePx: null });
    expect(noCalib.usable).toBe(false);
    expect(noCalib.reliability).toBe(0);
    expect(noCalib.flags).toContain("no-calibration");
  });

  it("compound stress: low light + head turn + low confidence drops reliability below 0.35 threshold", () => {
    const compound = assessGazeQuality({
      ...baseInput,
      brightness: 0.10, // 0.5x
      headYawDeg: 25,   // ~0.53x
      faceConfidence: 0.60, // 0.74x
      eyeDisagreementDeg: 6 // 0.92x
    });
    expect(compound.usable).toBe(false);
    expect(compound.reliability).toBeLessThan(0.35);
  });
});

describe("Milestone 2 Challenge Vector 4: GazeAccumulator Edge Cases", () => {
  const zones: StageZone[] = CARD_STAGE_BASE.zones!;
  // AffineMap mapping iris offset [-0.5, 0.5] to stage [0, 1]
  const validMap: AffineMap = {
    a11: 1.0,
    a12: 0.0,
    a21: 0.0,
    a22: 1.0,
    tx: 0.5,
    ty: 0.5
  };

  it("queues raw iris samples added before setMap and reprojects accurately when map arrives", () => {
    const acc = new GazeAccumulator(zones, 900);
    const start = 1000;

    // Add 15 raw iris samples fixated at (-0.25, -0.25)
    for (let i = 0; i < 15; i++) {
      acc.addIrisSample({ x: -0.25, y: -0.25 }, 0.88, start + i * 90);
    }
    expect(acc.frameCount).toBe(15);
    // Before setMap: no stage coordinates mapped -> finalize returns null
    expect(acc.resolveWindow()).toBeNull();

    // Supply calibration map:
    // With validMap: x = 1.0 * (-0.25) + 0.5 = 0.25; y = 1.0 * (-0.25) + 0.5 = 0.25 -> top-left
    acc.setMap(validMap);

    const window = acc.resolveWindow();
    expect(window).not.toBeNull();
    expect(window!.zone).toBe("top-left");
    expect(window!.dominance).toBe(1.0);
    expect(window!.dwellMs).toBeGreaterThanOrEqual(900);
    expect(window!.reliability).toBeGreaterThanOrEqual(0.8);
  });

  it("strictly suppresses windows with insufficient dwell (< 900ms)", () => {
    const acc = new GazeAccumulator(zones, 900);
    const start = 1000;
    // 12 frames spaced at 40ms = 11 * 40 + 33 = 473ms (< 900ms)
    for (let i = 0; i < 12; i++) {
      acc.addPoint({ x: 0.25, y: 0.25 }, 0.9, start + i * 40);
    }
    expect(acc.frameCount).toBe(12);
    expect(acc.resolveWindow()).toBeNull();
  });

  it("strictly suppresses windows with low dominance (< 0.55)", () => {
    const acc = new GazeAccumulator(zones, 900);
    const start = 1000;
    // Split fixations 50/50 between top-left and top-right over 20 frames spaced at 90ms
    for (let i = 0; i < 20; i++) {
      const pt = i % 2 === 0 ? { x: 0.25, y: 0.25 } : { x: 0.75, y: 0.25 };
      acc.addPoint(pt, 0.9, start + i * 90);
    }
    expect(acc.frameCount).toBe(20);
    expect(acc.resolveWindow()).toBeNull();
  });

  it("strictly drops out-of-bounds stage points without throwing or adding frames", () => {
    const acc = new GazeAccumulator(zones, 900);
    acc.addPoint({ x: -10, y: -20 }, 0.9, 1000);
    acc.addPoint({ x: 50, y: 80 }, 0.9, 1090);
    expect(acc.frameCount).toBe(0);
    expect(acc.resolveWindow()).toBeNull();
  });

  it("reset clears both aggregator frames and pending iris samples", () => {
    const acc = new GazeAccumulator(zones, 900);
    acc.addIrisSample({ x: 0.1, y: 0.1 }, 0.9, 1000);
    acc.addPoint({ x: 0.25, y: 0.25 }, 0.9, 1090);
    expect(acc.frameCount).toBe(2);

    acc.reset();
    expect(acc.frameCount).toBe(0);
    expect(acc.resolveWindow()).toBeNull();
  });
});

describe("Milestone 2 Challenge Vector 5: Mathematical Shannon Entropy Collapse & Honest Gating", () => {
  it("prior entropy H_0 of 12 mental cards is exactly log2(12) = 3.585 bits", () => {
    const session = new PerformanceSession(cardEffect, {
      seed: 99,
      cameraEnabled: true,
      cameraValidated: true
    });
    session.begin();
    const h0 = beliefEntropy(session.internal().belief);
    expect(h0).toBeCloseTo(Math.log2(12), 4);
    expect(h0).toBeCloseTo(3.585, 3);
  });

  it("empirically verifies two validated gaze windows collapse pool to 2 cards with > 96% mass and >= 2.25 bits drop", () => {
    const session = new PerformanceSession(cardEffect, {
      seed: 100,
      cameraEnabled: true,
      cameraValidated: true
    });
    session.begin();
    session.chosen();
    expect(session.phaseName).toBe("attune");

    const stage = session.stage;
    const targetZone = stage.zones![1]!.id;
    const targetCards = zoneCards(stage, targetZone);
    expect(targetCards).toHaveLength(2);

    const h0 = beliefEntropy(session.internal().belief);

    // First gaze window (nominal reliability 0.88)
    const fed1 = session.addGaze({ zone: targetZone, reliability: 0.88 });
    expect(fed1).toBe(true);

    const post1 = session.internal().posterior;
    const mass1 = targetCards.reduce((sum, id) => sum + (post1[id] ?? 0), 0);
    const h1 = beliefEntropy(session.internal().belief);
    expect(mass1).toBeGreaterThan(0.70); // > 70% probability mass
    expect(h0 - h1).toBeGreaterThan(1.10); // > 1.1 bits passive extraction

    // Second gaze window (nominal reliability 0.88)
    const fed2 = session.addGaze({ zone: targetZone, reliability: 0.88 });
    expect(fed2).toBe(true);

    const post2 = session.internal().posterior;
    const mass2 = targetCards.reduce((sum, id) => sum + (post2[id] ?? 0), 0);
    const h2 = beliefEntropy(session.internal().belief);
    const totalDrop = h0 - h2;

    expect(mass2).toBeGreaterThan(0.96); // > 96% concentrated on the 2 cards
    expect(totalDrop).toBeGreaterThanOrEqual(2.25); // >= 2.25 bits drop
    expect(h2).toBeLessThan(1.33); // Posterior entropy < 1.33 bits

    // Third gaze window MUST be refused (max 2 windows invariant)
    const fed3 = session.addGaze({ zone: targetZone, reliability: 0.88 });
    expect(fed3).toBe(false);
    expect(session.internal().gazeWindows).toBe(2);
  });

  it("strictly prevents unvalidated camera from modifying belief state", () => {
    const session = new PerformanceSession(cardEffect, {
      seed: 101,
      cameraEnabled: true,
      cameraValidated: false,
      presenceEnabled: true
    });
    session.begin();
    session.chosen();

    const h0 = beliefEntropy(session.internal().belief);
    const z = session.stage.zones![0]!.id;

    // Submit gaze without camera validation
    const added = session.addGaze({ zone: z, reliability: 0.95 });
    expect(added).toBe(false);
    expect(session.internal().gazeWindows).toBe(0);

    const h1 = beliefEntropy(session.internal().belief);
    expect(h1).toBe(h0); // Zero change in belief state
  });

  it("sub-threshold gaze (< 0.35 reliability) is dropped without mutating belief state", () => {
    const session = new PerformanceSession(cardEffect, {
      seed: 102,
      cameraEnabled: true,
      cameraValidated: true
    });
    session.begin();
    session.chosen();

    const h0 = beliefEntropy(session.internal().belief);
    const z = session.stage.zones![0]!.id;

    // Reliability 0.30 is below channel threshold (0.35)
    const added = session.addGaze({ zone: z, reliability: 0.30 });
    expect(added).toBe(false);
    expect(session.internal().gazeWindows).toBe(0);

    const h1 = beliefEntropy(session.internal().belief);
    expect(h1).toBe(h0);
  });

  it("refuses gaze evidence when camera is inactive outside think/attune phases", () => {
    const session = new PerformanceSession(cardEffect, {
      seed: 103,
      cameraEnabled: true,
      cameraValidated: true
    });
    session.begin();
    session.chosen();
    session.finishAttune();
    expect(session.phaseName).toBe("probe");
    expect(session.cameraOn).toBe(false);

    // Gaze added during probe when camera is inactive must be rejected
    const z = session.stage.zones![0]!.id;
    const added = session.addGaze({ zone: z, reliability: 0.85 });
    expect(added).toBe(false);
    expect(session.internal().gazeWindows).toBe(0);
  });
});
