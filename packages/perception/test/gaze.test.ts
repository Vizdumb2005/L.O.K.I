import { describe, expect, it } from "vitest";
import {
  assessGazeQuality,
  calibrationRmse,
  gazeEvidence,
  gazeMayFeedShow,
  GazeWindowAggregator,
  zoneAtPoint
} from "../src/index.js";

const good = {
  calibrationRmsePx: 55,
  faceConfidence: 0.95,
  headYawDeg: 3,
  headPitchDeg: 2,
  eyeDisagreementDeg: 2,
  brightness: 0.55,
  frames: 40
};

describe("gaze quality", () => {
  it("accepts a clean, calibrated, head-still sample", () => {
    const q = assessGazeQuality(good);
    expect(q.usable).toBe(true);
    expect(q.reliability).toBeGreaterThan(0.5);
    expect(q.flags).toEqual([]);
  });

  it("refuses uncalibrated input", () => {
    const q = assessGazeQuality({ ...good, calibrationRmsePx: null });
    expect(q.usable).toBe(false);
    expect(q.reliability).toBe(0);
  });

  it("penalizes low light, glasses and head motion", () => {
    const q = assessGazeQuality({
      ...good,
      brightness: 0.08,
      glasses: true,
      headYawDeg: 25,
      eyeDisagreementDeg: 12
    });
    expect(q.reliability).toBeLessThan(assessGazeQuality(good).reliability);
    expect(q.flags).toContain("low-light");
    expect(q.flags).toContain("glasses-risk");
    expect(q.flags).toContain("head-motion");
    expect(q.flags).toContain("eye-disagreement");
  });

  it("never feeds the show without human validation", () => {
    expect(gazeMayFeedShow(assessGazeQuality(good), false)).toBe(false);
    expect(gazeMayFeedShow(assessGazeQuality(good), true)).toBe(true);
  });

  it("computes calibration residual", () => {
    expect(
      calibrationRmse([
        { targetX: 0, targetY: 0, sampleX: 0, sampleY: 0 },
        { targetX: 10, targetY: 0, sampleX: 13, sampleY: 4 }
      ])
    ).toBeCloseTo(Math.sqrt(12.5), 6);
  });
});

describe("gaze zone windows", () => {
  it("maps normalized points to a zone", () => {
    const zones = [
      { id: "left", label: "Left", x: 0, y: 0, w: 0.5, h: 1 },
      { id: "right", label: "Right", x: 0.5, y: 0, w: 0.5, h: 1 }
    ];
    expect(zoneAtPoint(zones, 0.25, 0.5)).toBe("left");
    expect(zoneAtPoint(zones, 0.75, 0.5)).toBe("right");
    expect(zoneAtPoint(zones, 1.2, 0.5)).toBeNull();
  });

  it("rejects a short window", () => {
    const agg = new GazeWindowAggregator();
    for (let i = 0; i < 5; i++) agg.add({ zone: "left", at: i * 33, reliability: 0.8 });
    expect(agg.finalize()).toBeNull();
  });

  it("emits one window for a stable dwell", () => {
    const agg = new GazeWindowAggregator();
    for (let i = 0; i < 45; i++) agg.add({ zone: "left", at: i * 33, reliability: 0.8 });
    const w = agg.finalize();
    expect(w).not.toBeNull();
    expect(w?.zone).toBe("left");
    expect(w?.dwellMs).toBeGreaterThan(900);
    expect(w?.dominance).toBe(1);
    expect(w?.flags).toEqual([]);
  });

  it("rejects an ambiguous split", () => {
    const agg = new GazeWindowAggregator();
    for (let i = 0; i < 40; i++) {
      agg.add({ zone: i % 2 === 0 ? "left" : "right", at: i * 33, reliability: 0.8 });
    }
    expect(agg.finalize()).toBeNull();
  });

  it("emits categorical evidence with no frames or pixels", () => {
    const evidence = gazeEvidence(
      {
        zone: "left",
        dwellMs: 1200,
        dominance: 0.8,
        reliability: 0.7,
        frameCount: 36,
        flags: []
      },
      1000
    );
    expect(evidence.channel).toBe("gaze");
    expect(evidence.value).toBe("left");
    expect(Object.keys(evidence.meta ?? {}).sort()).toEqual([
      "dominance",
      "dwellMs",
      "flags",
      "frameCount"
    ]);
    expect(JSON.stringify(evidence)).not.toMatch(/image|width|height|pixel/i);
  });
});
