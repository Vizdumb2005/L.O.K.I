import { describe, expect, it } from "vitest";
import { affineRmse, applyAffineMap, fitAffineMap, type AffineSample } from "./gaze-map.js";

// Blueprint v4 §2.2: a lightweight affine calibration maps iris ratios to screen
// coordinates during the disguised attunement ritual, gated on RMSE <= 120px.

describe("affine gaze map (blueprint §2.2)", () => {
  it("recovers an exact affine transform from clean anchor samples", () => {
    const samples: AffineSample[] = [
      { source: { x: -0.5, y: -0.4 }, target: { x: 100, y: 80 } },
      { source: { x: 0.5, y: -0.4 }, target: { x: 900, y: 80 } },
      { source: { x: 0.5, y: 0.4 }, target: { x: 900, y: 600 } },
      { source: { x: -0.5, y: 0.4 }, target: { x: 100, y: 600 } },
      { source: { x: 0, y: 0 }, target: { x: 500, y: 340 } }
    ];
    const map = fitAffineMap(samples);
    expect(map).not.toBeNull();
    // Corners map back exactly.
    for (const s of samples) {
      const p = applyAffineMap(map!, s.source);
      expect(p.x).toBeCloseTo(s.target.x, 5);
      expect(p.y).toBeCloseTo(s.target.y, 5);
    }
    expect(affineRmse(map!, samples)).toBeLessThan(1e-6);
  });

  it("reports a small RMSE for noisy samples and a large one for a bad fit", () => {
    const clean: AffineSample[] = [
      { source: { x: -0.5, y: -0.4 }, target: { x: 100, y: 80 } },
      { source: { x: 0.5, y: -0.4 }, target: { x: 900, y: 80 } },
      { source: { x: 0.5, y: 0.4 }, target: { x: 900, y: 600 } },
      { source: { x: -0.5, y: 0.4 }, target: { x: 100, y: 600 } }
    ];
    const noisy = clean.map((s, i) => ({
      source: s.source,
      target: { x: s.target.x + (i % 2 === 0 ? 8 : -8), y: s.target.y }
    }));
    const map = fitAffineMap(noisy);
    expect(map).not.toBeNull();
    expect(affineRmse(map!, noisy)).toBeGreaterThan(0);
    // 8px jitters on half the samples average to a modest RMSE, far below the 120px gate.
    expect(affineRmse(map!, noisy)).toBeLessThan(20);

    // A bad fit: targets that no single affine can explain.
    const wild = clean.map((s, i) => ({
      source: s.source,
      target: { x: s.target.x + (i % 2 === 0 ? 200 : -200), y: s.target.y + i * 90 }
    }));
    const badMap = fitAffineMap(wild);
    expect(badMap).not.toBeNull();
    expect(affineRmse(badMap!, wild)).toBeGreaterThan(120);
  });

  it("refuses degenerate input", () => {
    expect(fitAffineMap([])).toBeNull();
    expect(
      fitAffineMap([{ source: { x: 0, y: 0 }, target: { x: 1, y: 1 } }])
    ).toBeNull();
    // Collinear sources cannot pin down a 2D affine map.
    expect(
      fitAffineMap([
        { source: { x: 0, y: 0 }, target: { x: 0, y: 0 } },
        { source: { x: 0.1, y: 0.1 }, target: { x: 10, y: 10 } },
        { source: { x: 0.2, y: 0.2 }, target: { x: 20, y: 20 } }
      ])
    ).toBeNull();
  });
});
