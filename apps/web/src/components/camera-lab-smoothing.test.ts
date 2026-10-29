import { describe, expect, it } from "vitest";
import { DirectionLabel, PointSmoother, ScalarSmoother, StableLatch } from "./camera-lab-smoothing.js";

describe("PointSmoother", () => {
  it("passes the first sample through unchanged", () => {
    const smoother = new PointSmoother();
    expect(smoother.update({ x: 10, y: 20 }, 0)).toEqual({ x: 10, y: 20 });
  });

  it("moves toward a new position gradually instead of jumping", () => {
    const smoother = new PointSmoother(120);
    smoother.update({ x: 0, y: 0 }, 0);
    const after = smoother.update({ x: 100, y: 100 }, 80);
    expect(after).not.toBeNull();
    expect(after!.x).toBeGreaterThan(0);
    expect(after!.x).toBeLessThan(80);
  });

  it("holds the last value through a short dropout", () => {
    const smoother = new PointSmoother(120, 500);
    smoother.update({ x: 42, y: 24 }, 0);
    expect(smoother.update(null, 300)).toEqual({ x: 42, y: 24 });
    expect(smoother.update(null, 499)).toEqual({ x: 42, y: 24 });
  });

  it("reports the signal as gone only after the hold window", () => {
    const smoother = new PointSmoother(120, 500);
    smoother.update({ x: 42, y: 24 }, 0);
    expect(smoother.update(null, 600)).toBeNull();
  });

  it("re-acquires without a visible jump after a dropout inside the hold", () => {
    const smoother = new PointSmoother(120, 500);
    smoother.update({ x: 0, y: 0 }, 0);
    smoother.update(null, 200);
    const reacquired = smoother.update({ x: 10, y: 0 }, 300);
    expect(reacquired).not.toBeNull();
    expect(reacquired!.x).toBeLessThan(10);
  });
});

describe("StableLatch", () => {
  it("never turns on when the raw signal alternates every frame", () => {
    const latch = new StableLatch(2, 12);
    const seen: boolean[] = [];
    for (let i = 0; i < 40; i++) seen.push(latch.update(i % 2 === 0));
    expect(seen.every((v) => v === false)).toBe(true);
  });

  it("turns on after consecutive detections and rides out brief dropouts", () => {
    const latch = new StableLatch(2, 12);
    expect(latch.update(true)).toBe(false);
    expect(latch.update(true)).toBe(true);
    for (let i = 0; i < 5; i++) expect(latch.update(false)).toBe(true);
    expect(latch.current).toBe(true);
  });

  it("turns off only after a sustained loss", () => {
    const latch = new StableLatch(2, 12);
    latch.update(true);
    latch.update(true);
    for (let i = 0; i < 11; i++) expect(latch.update(false)).toBe(true);
    expect(latch.update(false)).toBe(false);
  });

  it("flips at most once across a flicker burst followed by stability", () => {
    const latch = new StableLatch(2, 12);
    const states: boolean[] = [];
    const burst = [true, false, true, false, true, false, false, true];
    for (const sample of [...burst, ...Array(30).fill(true)]) states.push(latch.update(sample));
    const flips = states.slice(1).filter((v, i) => v !== states[i]).length;
    expect(flips).toBeLessThanOrEqual(1);
    expect(latch.current).toBe(true);
  });
});

describe("DirectionLabel", () => {
  it("ignores jitter around the centre", () => {
    const label = new DirectionLabel(0.06);
    const first = label.update({ x: 0.02, y: -0.01 });
    expect(label.update({ x: -0.03, y: 0.02 })).toBe(first);
    expect(label.update({ x: 0.04, y: -0.05 })).toBe(first);
  });

  it("changes once when the signal genuinely crosses", () => {
    const label = new DirectionLabel(0.06);
    expect(label.update({ x: 0.4, y: -0.3 })).toBe("right / up");
    expect(label.update({ x: 0.1, y: -0.3 })).toBe("right / up");
    expect(label.update({ x: -0.2, y: -0.3 })).toBe("left / up");
    expect(label.update({ x: -0.4, y: -0.3 })).toBe("left / up");
  });
});

describe("ScalarSmoother", () => {
  it("dampens a step change", () => {
    const smoother = new ScalarSmoother(250);
    expect(smoother.update(0.2, 0, 0)).toBe(0.2);
    const after = smoother.update(0.9, 100, 0);
    expect(after).toBeGreaterThan(0.2);
    expect(after).toBeLessThan(0.6);
  });
});
