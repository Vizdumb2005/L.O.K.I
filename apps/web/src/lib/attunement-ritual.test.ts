import { describe, expect, it } from "vitest";
import { assessGazeQuality } from "@loki/perception";
import {
  attunementSchedule,
  calibrationVerdict,
  EMBER_ANCHORS,
  type EmberSample
} from "./attunement-ritual.js";

// Blueprint v4 §2.2: the disguised calibration woven into the attune beat.
// Four theatrical ember anchors, a settle + dwell at each, then the RMSE gate.

describe("attunement ritual (blueprint §2.2)", () => {
  it("schedules four ember anchors with settle and dwell phases", () => {
    const steps = attunementSchedule();
    expect(steps).toHaveLength(4);
    expect(EMBER_ANCHORS).toEqual([
      { x: 0.25, y: 0.25 },
      { x: 0.75, y: 0.25 },
      { x: 0.75, y: 0.75 },
      { x: 0.25, y: 0.75 }
    ]);
    for (const step of steps) {
      expect(step.settleMs).toBeGreaterThanOrEqual(400);
      expect(step.dwellMs).toBeGreaterThanOrEqual(600);
    }
    expect(new Set(steps.map((s) => s.anchor.x + "," + s.anchor.y)).size).toBe(4);
  });

  it("calibrationVerdict passes a clean affine signal and gates a noisy one", () => {
    // Clean: targets derived by construction from one known affine map, so the
    // least-squares fit recovers it exactly and the residual is ~0.
    const sources = [
      { x: -0.5, y: -0.35 },
      { x: 0.45, y: -0.4 },
      { x: 0.5, y: 0.3 },
      { x: -0.55, y: 0.35 }
    ];
    const project = (s: { x: number; y: number }) => ({
      x: 0.9 * s.x + 0.2 * s.y + 0.5,
      y: 0.15 * s.x + 0.8 * s.y + 0.5
    });
    const clean: EmberSample[] = sources.map((source) => ({ source, target: project(source) }));

    const good = assessGazeQuality({
      calibrationRmsePx: 60,
      faceConfidence: 0.9,
      headYawDeg: 2,
      headPitchDeg: 1,
      eyeDisagreementDeg: 1,
      brightness: 0.5,
      frames: 40
    });
    const verdict = calibrationVerdict(clean, good);
    expect(verdict.calibrated).toBe(true);
    expect(verdict.rmse).not.toBeNull();
    expect(verdict.rmse!).toBeLessThan(0.05);
    expect(verdict.map).not.toBeNull();

    // Noisy: targets scattered far beyond any affine fit - the gate stays closed.
    const noisy: EmberSample[] = clean.map((s, i) => ({
      source: s.source,
      target: { x: i % 2 === 0 ? 0.95 : 0.05, y: i % 3 === 0 ? 0.85 : 0.15 }
    }));
    const bad = calibrationVerdict(noisy, good);
    expect(bad.calibrated).toBe(false);
    expect(bad.rmse!).toBeGreaterThan(0.15);
  });

  it("calibrationVerdict refuses a poor-quality signal even with a good fit", () => {
    const clean: EmberSample[] = EMBER_ANCHORS.map((anchor, i) => ({
      source: { x: -0.5 + i * 0.33, y: i % 2 === 0 ? -0.3 : 0.3 },
      target: anchor
    }));
    const poor = assessGazeQuality({
      calibrationRmsePx: 250,
      faceConfidence: 0.4,
      headYawDeg: 20,
      headPitchDeg: 15,
      eyeDisagreementDeg: 12,
      brightness: 0.1,
      frames: 3
    });
    expect(poor.usable).toBe(false);
    const verdict = calibrationVerdict(clean, poor);
    expect(verdict.calibrated).toBe(false);
  });

  it("too few samples never calibrates", () => {
    const good = assessGazeQuality({
      calibrationRmsePx: 60,
      faceConfidence: 0.9,
      headYawDeg: 2,
      headPitchDeg: 1,
      eyeDisagreementDeg: 1,
      brightness: 0.5,
      frames: 40
    });
    expect(calibrationVerdict([], good).calibrated).toBe(false);
    expect(
      calibrationVerdict([{ source: { x: 0, y: 0 }, target: EMBER_ANCHORS[0]! }], good).calibrated
    ).toBe(false);
  });
});