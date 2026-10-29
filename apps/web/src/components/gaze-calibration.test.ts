import { describe, expect, it } from "vitest";
import {
  aggregateTrial,
  evaluate,
  fitCentroids,
  fixedZoneOf,
  predictZone,
  splitFitHeldOut,
  type TrialMeasurement
} from "./gaze-calibration.js";

const ZONES = ["top-left", "top-right", "mid-left", "mid-right", "bottom-left", "bottom-right"];

function trialAt(zoneId: string, x: number, y: number, n = 8): TrialMeasurement {
  const samples = Array.from({ length: n }, (_, i) => ({ x: x + i * 0.001, y: y - i * 0.001, at: i * 50 }));
  return aggregateTrial(zoneId, samples, 5, 0.5);
}

describe("aggregateTrial", () => {
  it("abstains when too few valid samples arrived", () => {
    const m = aggregateTrial("top-left", [{ x: 0.1, y: 0.1, at: 0 }], 5);
    expect(m.abstained).toBe(true);
    expect(m.x).toBeNull();
  });

  it("takes the median offset as the trial value", () => {
    const m = aggregateTrial(
      "top-left",
      [
        { x: 0.1, y: 0.2, at: 0 },
        { x: 0.9, y: 0.2, at: 50 }, // outlier frame must not dominate
        { x: 0.12, y: 0.22, at: 100 },
        { x: 0.11, y: 0.19, at: 150 },
        { x: 0.1, y: 0.21, at: 200 }
      ],
      5
    );
    expect(m.abstained).toBe(false);
    expect(m.x).toBeCloseTo(0.11, 5);
    expect(m.y).toBeCloseTo(0.2, 5);
  });
});

describe("fit, predict, evaluate", () => {
  // Two clean clusters: left zones around x=-0.4, right around x=+0.4.
  const fit = [
    trialAt("top-left", -0.4, -0.4), trialAt("top-left", -0.42, -0.38),
    trialAt("top-right", 0.4, -0.4), trialAt("top-right", 0.38, -0.42),
    trialAt("mid-left", -0.4, 0), trialAt("mid-left", -0.41, 0.02),
    trialAt("mid-right", 0.4, 0), trialAt("mid-right", 0.42, -0.01),
    trialAt("bottom-left", -0.4, 0.4), trialAt("bottom-left", -0.39, 0.41),
    trialAt("bottom-right", 0.4, 0.4), trialAt("bottom-right", 0.41, 0.39)
  ];
  const heldOut = [
    trialAt("top-left", -0.41, -0.39), trialAt("top-right", 0.39, -0.41),
    trialAt("mid-left", -0.4, 0.01), trialAt("mid-right", 0.41, 0),
    trialAt("bottom-left", -0.38, 0.42), trialAt("bottom-right", 0.42, 0.38)
  ];

  it("scores cleanly separable clusters at 100% on held-out trials", () => {
    const metrics = evaluate(fit, heldOut, ZONES);
    expect(metrics.fittedAccuracy).toBe(1);
    expect(metrics.chance).toBeCloseTo(1 / 6, 5);
    expect(metrics.abstained).toBe(0);
    expect(metrics.confusion["top-left"]?.["top-left"]).toBe(1);
  });

  it("reports abstentions and never scores them", () => {
    const scarce = aggregateTrial("mid-left", [{ x: 0, y: 0, at: 0 }], 5);
    const metrics = evaluate(fit, [...heldOut, scarce], ZONES);
    expect(metrics.abstained).toBe(1);
    expect(metrics.fittedAccuracy).toBe(1); // still 6/6 scored
  });

  it("returns null accuracy when every held-out trial abstained", () => {
    const scarce = aggregateTrial("mid-left", [], 5);
    const metrics = evaluate(fit, [scarce], ZONES);
    expect(metrics.fittedAccuracy).toBeNull();
    expect(metrics.fixedAccuracy).toBeNull();
  });

  it("fitted centroids beat the fixed grid when the device's offset space is shifted", () => {
    // Device bias: everything shifted right by 0.5, so the fixed grid misreads left as right.
    const shift = (m: TrialMeasurement): TrialMeasurement => ({ ...m, x: m.x === null ? null : m.x + 0.5 });
    const metrics = evaluate(fit.map(shift), heldOut.map(shift), ZONES);
    expect(metrics.fittedAccuracy).toBe(1);
    expect(metrics.fixedAccuracy).toBeLessThan(1);
  });
});

describe("splitFitHeldOut", () => {
  it("keeps earlier trials for fitting and later ones for scoring, per zone", () => {
    const all = ZONES.flatMap((z) => [trialAt(z, 0, 0), trialAt(z, 0.01, 0), trialAt(z, 0.02, 0), trialAt(z, 0.03, 0)]);
    const { fit, heldOut } = splitFitHeldOut(all);
    expect(fit).toHaveLength(12);
    expect(heldOut).toHaveLength(12);
    for (const z of ZONES) {
      expect(fit.filter((m) => m.zoneId === z)).toHaveLength(2);
      expect(heldOut.filter((m) => m.zoneId === z)).toHaveLength(2);
    }
  });
});

describe("fixedZoneOf", () => {
  it("maps offset space onto the six stage zones", () => {
    expect(fixedZoneOf(-0.5, -0.5)).toBe("top-left");
    expect(fixedZoneOf(0.5, -0.5)).toBe("top-right");
    expect(fixedZoneOf(-0.5, 0)).toBe("mid-left");
    expect(fixedZoneOf(0.5, 0.5)).toBe("bottom-right");
  });
});

describe("predictZone", () => {
  it("returns null with no fitted centroids", () => {
    expect(predictZone([], 0, 0)).toBeNull();
  });
});
