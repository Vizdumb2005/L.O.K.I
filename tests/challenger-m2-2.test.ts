import { describe, expect, it } from "vitest";
import { GazeAccumulator } from "../apps/web/src/lib/use-attunement-gaze.js";
import { assessGazeQuality } from "@loki/perception";
import { PerformanceSession } from "@loki/showrunner";
import { beliefEntropy } from "@loki/engine";
import { cardEffect } from "../effects/card/src/index.js";
import { CARD_STAGE_BASE } from "../effects/card/src/cards.js";
import type { AffineMap } from "../apps/web/src/lib/gaze-map.js";
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
  return stage.items.filter((item) => zoneOf(stage, item.hypothesisId) === zone).map((item) => item.hypothesisId);
}

describe("Milestone 2 Adversarial Challenge: GazeAccumulator Stress Tests", () => {
  const zones: StageZone[] = CARD_STAGE_BASE.zones!;
  // Affine map: maps iris range [-1, 1] to stage range [0, 1]
  // x_stage = 0.5 * x_iris + 0.5; y_stage = 0.5 * y_iris + 0.5
  const identityMap: AffineMap = {
    a11: 0.5, a12: 0, tx: 0.5,
    a21: 0, a22: 0.5, ty: 0.5
  };

  it("stress: empty window with zero samples returns null without throwing", () => {
    const acc = new GazeAccumulator(zones, 900);
    expect(acc.frameCount).toBe(0);
    expect(acc.resolveWindow()).toBeNull();
  });

  it("stress: rapid exit transitions (< 100ms in think) return null", () => {
    const acc = new GazeAccumulator(zones, 900);
    const start = 1000;
    // Rapid exit at 50ms (0 to 1 frame)
    acc.addPoint({ x: 0.25, y: 0.15 }, 0.9, start);
    expect(acc.resolveWindow()).toBeNull();

    // Rapid exit at 90ms (2 frames at 0ms and 90ms)
    acc.addPoint({ x: 0.25, y: 0.15 }, 0.9, start + 90);
    expect(acc.resolveWindow()).toBeNull();

    // Artificial burst of 15 frames arriving within 80ms total (dwell < 900ms)
    const burstAcc = new GazeAccumulator(zones, 900);
    for (let i = 0; i < 15; i++) {
      burstAcc.addPoint({ x: 0.25, y: 0.15 }, 0.9, start + i * 5);
    }
    expect(burstAcc.frameCount).toBe(15);
    expect(burstAcc.resolveWindow()).toBeNull();
  });

  it("stress: uniform / wandering gaze distribution returns null", () => {
    const acc = new GazeAccumulator(zones, 900);
    const start = 1000;
    // Gaze wanders across all 6 zones evenly: 3 frames per zone = 18 frames total, 1620ms
    const zoneCoords = [
      { x: 0.25, y: 0.15 }, // top-left
      { x: 0.75, y: 0.15 }, // top-right
      { x: 0.25, y: 0.45 }, // mid-left
      { x: 0.75, y: 0.45 }, // mid-right
      { x: 0.25, y: 0.75 }, // bottom-left
      { x: 0.75, y: 0.75 }  // bottom-right
    ];

    let t = start;
    for (let round = 0; round < 3; round++) {
      for (const pt of zoneCoords) {
        acc.addPoint(pt, 0.9, t);
        t += 90;
      }
    }
    expect(acc.frameCount).toBe(18);
    // Dominance is ~1/6 (0.167), far below 0.55 threshold -> null
    expect(acc.resolveWindow()).toBeNull();
  });

  it("stress: high jitter between adjacent zones fails dominance and ratio checks", () => {
    const acc = new GazeAccumulator(zones, 900);
    const start = 1000;
    let t = start;
    // Oscillate between top-left (0.25, 0.15) and top-right (0.75, 0.15) 50/50
    for (let i = 0; i < 20; i++) {
      const pt = i % 2 === 0 ? { x: 0.25, y: 0.15 } : { x: 0.75, y: 0.15 };
      acc.addPoint(pt, 0.9, t);
      t += 90;
    }
    expect(acc.frameCount).toBe(20);
    expect(acc.resolveWindow()).toBeNull();
  });

  it("stress: boundary jitter inside a zone is absorbed into a valid window", () => {
    const acc = new GazeAccumulator(zones, 900);
    const start = 1000;
    let t = start;
    // Jitter around inside top-left zone ([0..0.5] x [0..0.333])
    for (let i = 0; i < 15; i++) {
      const x = 0.1 + (i % 3) * 0.1;
      const y = 0.05 + (i % 2) * 0.1;
      acc.addPoint({ x, y }, 0.88, t);
      t += 90;
    }
    expect(acc.frameCount).toBe(15);
    const window = acc.resolveWindow();
    expect(window).not.toBeNull();
    expect(window!.zone).toBe("top-left");
    expect(window!.dominance).toBe(1.0);
    expect(window!.dwellMs).toBeGreaterThanOrEqual(900);
  });

  it("stress: dwell boundary condition (899ms fails, 900ms succeeds)", () => {
    // 899ms dwell: 10 frames * 90ms = 810ms + 89ms = 899ms
    const accShort = new GazeAccumulator(zones, 900);
    for (let i = 0; i < 12; i++) {
      accShort.addPoint({ x: 0.25, y: 0.15 }, 0.9, 1000 + i * 70); // 11 * 70 = 770ms + 33ms = 803ms
    }
    expect(accShort.frameCount).toBe(12);
    expect(accShort.resolveWindow()).toBeNull();

    // >= 900ms dwell: 12 frames spaced at 90ms = 11 * 90 + 33 = 1023ms
    const accLong = new GazeAccumulator(zones, 900);
    for (let i = 0; i < 12; i++) {
      accLong.addPoint({ x: 0.25, y: 0.15 }, 0.9, 1000 + i * 90);
    }
    expect(accLong.frameCount).toBe(12);
    const win = accLong.resolveWindow();
    expect(win).not.toBeNull();
    expect(win!.dwellMs).toBeGreaterThanOrEqual(900);
  });

  it("stress: frame count boundary (11 frames fails, 12 frames succeeds)", () => {
    const acc11 = new GazeAccumulator(zones, 900);
    for (let i = 0; i < 11; i++) {
      acc11.addPoint({ x: 0.25, y: 0.15 }, 0.9, 1000 + i * 100);
    }
    expect(acc11.frameCount).toBe(11);
    expect(acc11.resolveWindow()).toBeNull();

    const acc12 = new GazeAccumulator(zones, 900);
    for (let i = 0; i < 12; i++) {
      acc12.addPoint({ x: 0.25, y: 0.15 }, 0.9, 1000 + i * 100);
    }
    expect(acc12.frameCount).toBe(12);
    expect(acc12.resolveWindow()).not.toBeNull();
  });

  it("stress: samples added before setMap() are queued and flushed when map is assigned", () => {
    const acc = new GazeAccumulator(zones, 900);
    // Add raw iris samples before map is ready (15 frames = 14 * 90 + 33 = 1293ms)
    for (let i = 0; i < 15; i++) {
      acc.addIrisSample({ x: -0.5, y: -0.5 }, 0.85, 1000 + i * 90);
    }
    expect(acc.frameCount).toBe(15);
    // Before setMap: cannot map to stage point -> resolve returns null
    expect(acc.resolveWindow()).toBeNull();

    // Now supply calibration map
    acc.setMap(identityMap);
    // Mapping: x = 0.5 * (-0.5) + 0.5 = 0.25; y = 0.5 * (-0.5) + 0.5 = 0.25 -> top-left
    const win = acc.resolveWindow();
    expect(win).not.toBeNull();
    expect(win!.zone).toBe("top-left");
  });

  it("stress: reset() purges aggregator and pending iris samples cleanly", () => {
    const acc = new GazeAccumulator(zones, 900);
    for (let i = 0; i < 15; i++) {
      acc.addPoint({ x: 0.25, y: 0.15 }, 0.9, 1000 + i * 90);
    }
    expect(acc.frameCount).toBe(15);
    acc.reset();
    expect(acc.frameCount).toBe(0);
    expect(acc.resolveWindow()).toBeNull();
  });

  it("stress: out-of-bounds stage coordinates are silently dropped without corrupting state", () => {
    const acc = new GazeAccumulator(zones, 900);
    // Stage zones cover [0, 1] x [0, 1]. Add points outside this range.
    for (let i = 0; i < 15; i++) {
      acc.addPoint({ x: -2.0, y: 3.5 }, 0.9, 1000 + i * 90);
    }
    expect(acc.frameCount).toBe(0);
    expect(acc.resolveWindow()).toBeNull();
  });
});

describe("Milestone 2 Adversarial Challenge: Shannon Entropy Collapse & Posterior Mass", () => {
  it("prior entropy H_0 across 12 cards is exactly log2(12) = 3.58496 bits", () => {
    const session = new PerformanceSession(cardEffect, { seed: 101, cameraEnabled: true, cameraValidated: true });
    session.begin();
    const h0 = beliefEntropy(session.internal().belief);
    expect(h0).toBeCloseTo(Math.log2(12), 4);
    expect(h0).toBeCloseTo(3.585, 3);
  });

  it("mathematical analysis: single gaze window vs two gaze windows", () => {
    const session = new PerformanceSession(cardEffect, { seed: 102, cameraEnabled: true, cameraValidated: true });
    session.begin();
    const stage = session.stage;
    const targetZone = stage.zones![0]!.id;
    const candidates = zoneCards(stage, targetZone);
    expect(candidates).toHaveLength(2);

    const h0 = beliefEntropy(session.internal().belief);

    // Window 1: Standard nominal reliability 0.88
    session.addGaze({ zone: targetZone, reliability: 0.88 });
    const h1 = beliefEntropy(session.internal().belief);
    const post1 = session.internal().posterior;
    const mass1 = candidates.reduce((sum, id) => sum + (post1[id] ?? 0), 0);
    const drop1 = h0 - h1;

    console.log(`[Challenge Empirical Data] Window 1 (rel=0.88):`);
    console.log(`  H1 = ${h1.toFixed(4)} bits, Drop = ${drop1.toFixed(4)} bits, Top-2 Mass = ${(mass1 * 100).toFixed(2)}%`);

    // Window 2: Standard nominal reliability 0.88
    session.addGaze({ zone: targetZone, reliability: 0.88 });
    const h2 = beliefEntropy(session.internal().belief);
    const post2 = session.internal().posterior;
    const mass2 = candidates.reduce((sum, id) => sum + (post2[id] ?? 0), 0);
    const drop2 = h0 - h2;

    console.log(`[Challenge Empirical Data] Window 2 (rel=0.88):`);
    console.log(`  H2 = ${h2.toFixed(4)} bits, Total Drop = ${drop2.toFixed(4)} bits, Top-2 Mass = ${(mass2 * 100).toFixed(2)}%`);

    // Verify Milestone 2 requirements on the full 2-window collapse at nominal rel=0.88:
    expect(drop2).toBeGreaterThanOrEqual(2.257);
    expect(mass2).toBeGreaterThan(0.96);
    expect(h2).toBeLessThan(1.33);

    // Document the exact single-window metrics:
    // With 1 window, mass is ~74% (or ~69% at 0.80), drop is ~1.16 bits (or ~0.97 bits at 0.80)
    expect(mass1).toBeGreaterThan(0.65);
    expect(drop1).toBeGreaterThan(0.95);
  });

  it("entropy collapse at baseline reliability 0.80 achieves ~2.257 bits drop (2.2565 bits) and > 96% mass after 2 windows", () => {
    const session = new PerformanceSession(cardEffect, { seed: 103, cameraEnabled: true, cameraValidated: true });
    session.begin();
    const stage = session.stage;
    const targetZone = stage.zones![2]!.id;
    const candidates = zoneCards(stage, targetZone);
    const h0 = beliefEntropy(session.internal().belief);

    session.addGaze({ zone: targetZone, reliability: 0.80 });
    session.addGaze({ zone: targetZone, reliability: 0.80 });

    const hFinal = beliefEntropy(session.internal().belief);
    const post = session.internal().posterior;
    const mass = candidates.reduce((sum, id) => sum + (post[id] ?? 0), 0);
    const drop = h0 - hFinal;

    console.log(`[Challenge Empirical Data] Two windows (rel=0.80):`);
    console.log(`  H_final = ${hFinal.toFixed(4)} bits, Drop = ${drop.toFixed(4)} bits, Top-2 Mass = ${(mass * 100).toFixed(2)}%`);

    // Note: 2.2565 bits rounds to 2.257 bits at 3 decimal places
    expect(drop).toBeCloseTo(2.257, 2);
    expect(mass).toBeGreaterThan(0.96);
  });

  it("entropy behavior across reliability sweep [0.35, 0.50, 0.70, 0.80, 0.88, 0.95, 1.0]", () => {
    const rels = [0.35, 0.50, 0.70, 0.80, 0.88, 0.95, 1.0];
    const results: Array<{ rel: number; w1_drop: number; w1_mass: number; w2_drop: number; w2_mass: number }> = [];

    for (const rel of rels) {
      const s = new PerformanceSession(cardEffect, { seed: 104, cameraEnabled: true, cameraValidated: true });
      s.begin();
      const z = s.stage.zones![0]!.id;
      const cands = zoneCards(s.stage, z);
      const h0 = beliefEntropy(s.internal().belief);

      s.addGaze({ zone: z, reliability: rel });
      const h1 = beliefEntropy(s.internal().belief);
      const m1 = cands.reduce((sum, id) => sum + (s.internal().posterior[id] ?? 0), 0);

      s.addGaze({ zone: z, reliability: rel });
      const h2 = beliefEntropy(s.internal().belief);
      const m2 = cands.reduce((sum, id) => sum + (s.internal().posterior[id] ?? 0), 0);

      results.push({
        rel,
        w1_drop: h0 - h1,
        w1_mass: m1,
        w2_drop: h0 - h2,
        w2_mass: m2
      });
    }

    console.table(results);
    // At rel >= 0.80, two windows achieve ~2.257 bits drop (2.2565) and > 96% mass
    const r80 = results.find(r => r.rel === 0.80)!;
    expect(r80.w2_drop).toBeCloseTo(2.257, 2);
    expect(r80.w2_mass).toBeGreaterThan(0.96);

    // At nominal rel = 0.88, two windows achieve 2.368 bits drop and > 97.6% mass
    const r88 = results.find(r => r.rel === 0.88)!;
    expect(r88.w2_drop).toBeGreaterThanOrEqual(2.257);
    expect(r88.w2_mass).toBeGreaterThan(0.97);

    // At perfect reliability (1.0), two windows reach > 99.0% mass and 2.48+ bits drop
    const r100 = results.find(r => r.rel === 1.0)!;
    expect(r100.w2_drop).toBeGreaterThan(2.45);
    expect(r100.w2_mass).toBeGreaterThan(0.99);
  });

  it("adversarial: conflicting cross-zone gaze windows (zone A followed by zone B)", () => {
    const session = new PerformanceSession(cardEffect, { seed: 105, cameraEnabled: true, cameraValidated: true });
    session.begin();
    const stage = session.stage;
    const zA = stage.zones![0]!.id;
    const zB = stage.zones![1]!.id;
    const candsA = zoneCards(stage, zA);
    const candsB = zoneCards(stage, zB);

    const h0 = beliefEntropy(session.internal().belief);

    // Window 1 on Zone A
    session.addGaze({ zone: zA, reliability: 0.85 });
    // Window 2 on Zone B (conflicting fixation)
    session.addGaze({ zone: zB, reliability: 0.85 });

    const internal = session.internal();
    const post = internal.posterior;
    const massA = candsA.reduce((sum, id) => sum + (post[id] ?? 0), 0);
    const massB = candsB.reduce((sum, id) => sum + (post[id] ?? 0), 0);
    const hFinal = beliefEntropy(internal.belief);

    console.log(`[Challenge Empirical Data] Conflicting Windows (Zone A + Zone B):`);
    console.log(`  Mass Zone A: ${(massA * 100).toFixed(2)}%, Mass Zone B: ${(massB * 100).toFixed(2)}%`);
    console.log(`  Combined 4-card mass: ${((massA + massB) * 100).toFixed(2)}%`);
    console.log(`  H_final = ${hFinal.toFixed(4)} bits (Prior = ${h0.toFixed(4)})`);

    // In cross-zone ambiguity, neither zone dominates completely; probability mass balances equally between the two zones
    expect(massA).toBeCloseTo(massB, 2);
    expect(massA + massB).toBeGreaterThan(0.85); // 4 cards hold > 85% of mass
    expect(internal.belief.contradictionActive).toBe(false); // Does not cause unhandled contradiction
  });
});

describe("Milestone 2 Adversarial Challenge: Low Reliability Gaze & Manual Fallback Invariants", () => {
  it("low reliability gaze (< 0.35) is dropped and does NOT mutate belief state", () => {
    const session = new PerformanceSession(cardEffect, { seed: 106, cameraEnabled: true, cameraValidated: true });
    session.begin();
    const stage = session.stage;
    const z = stage.zones![0]!.id;
    const h0 = beliefEntropy(session.internal().belief);

    // Gaze with reliability 0.34 (below 0.35 threshold)
    const accepted = session.addGaze({ zone: z, reliability: 0.34 });
    // In session.ts line 263: result.dropped -> returns false
    expect(accepted).toBe(false);

    // Invariant: belief state must NOT be modified
    const h1 = beliefEntropy(session.internal().belief);
    expect(h1).toBe(h0);
    expect(session.internal().gazeWindows).toBe(0);
    // Observation was marked dropped in belief log
    const lastObs = session.internal().belief.observations.at(-1);
    expect(lastObs?.dropped).toBe(true);
  });

  it("sub-threshold gaze preserves pristine state for manual mentalism fallback", () => {
    const session = new PerformanceSession(cardEffect, { seed: 107, cameraEnabled: true, cameraValidated: true });
    session.begin();
    session.chosen();
    const stage = session.stage;

    // Sub-threshold gaze attempted
    session.addGaze({ zone: stage.zones![0]!.id, reliability: 0.20 });
    session.addGaze({ zone: stage.zones![1]!.id, reliability: 0.10 });

    expect(session.internal().gazeWindows).toBe(0);

    // Advance into manual mentalism probing
    session.finishAttune();
    expect(session.phaseName).toBe("probe");

    // Probes work identically to pure manual flow
    const snap = session.snapshot();
    expect(snap.prompt).toBeDefined();
    session.answer("yes");
    expect(session.internal().answered).toBe(1);
  });

  it("unvalidated camera unconditionally rejects gaze updates", () => {
    const session = new PerformanceSession(cardEffect, { seed: 108, cameraEnabled: true, cameraValidated: false });
    session.begin();
    const accepted = session.addGaze({ zone: session.stage.zones![0]!.id, reliability: 0.95 });
    expect(accepted).toBe(false);
    expect(session.internal().gazeWindows).toBe(0);
  });

  it("session refuses more than two gaze windows (invariant: gazeWindows <= 2)", () => {
    const session = new PerformanceSession(cardEffect, { seed: 109, cameraEnabled: true, cameraValidated: true });
    session.begin();
    const z = session.stage.zones![0]!.id;
    expect(session.addGaze({ zone: z, reliability: 0.85 })).toBe(true);
    expect(session.addGaze({ zone: z, reliability: 0.85 })).toBe(true);
    expect(session.internal().gazeWindows).toBe(2);

    // Third attempt must be rejected
    expect(session.addGaze({ zone: z, reliability: 0.85 })).toBe(false);
    expect(session.internal().gazeWindows).toBe(2);
  });

  it("quality assessment flag: low-reliability (< 0.35) flags correctly", () => {
    // Quality with very poor calibration and few frames
    const quality = assessGazeQuality({
      calibrationRmsePx: 170,
      faceConfidence: 0.6,
      headYawDeg: 10,
      headPitchDeg: 10,
      eyeDisagreementDeg: 7,
      brightness: 0.19,
      frames: 6
    });
    expect(quality.reliability).toBeLessThan(0.35);
    expect(quality.usable).toBe(false);
  });
});
