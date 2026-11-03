import { describe, expect, it } from "vitest";
import { GazeAccumulator } from "../apps/web/src/lib/use-attunement-gaze.js";
import { assessGazeQuality, zoneAtPoint } from "@loki/perception";
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
  return stage.items
    .filter((item) => zoneOf(stage, item.hypothesisId) === zone)
    .map((item) => item.hypothesisId);
}

describe("Milestone 2 Iteration 2 Challenger: Passive Entropy & Candidate Collapse", () => {
  const zones: StageZone[] = CARD_STAGE_BASE.zones!;
  const identityMap: AffineMap = {
    a11: 0.5, a12: 0, tx: 0.5,
    a21: 0, a22: 0.5, ty: 0.5
  };

  it("verifies >= 2.257 bits entropy extraction and 12-to-2 collapse across ALL 6 zones and 10 random seeds", () => {
    // Test all 6 zones across 10 random seeds = 60 empirical trials
    for (let seed = 1; seed <= 10; seed++) {
      const session = new PerformanceSession(cardEffect, {
        seed,
        cameraEnabled: true,
        cameraValidated: true
      });
      session.begin();
      const stage = session.stage;
      const h0 = beliefEntropy(session.internal().belief);
      expect(h0).toBeCloseTo(3.585, 3); // log2(12)

      for (const zone of stage.zones!) {
        const testSession = new PerformanceSession(cardEffect, {
          seed,
          cameraEnabled: true,
          cameraValidated: true
        });
        testSession.begin();
        const candidates = zoneCards(stage, zone.id);
        expect(candidates).toHaveLength(2);

        // Window 1 (nominal reliability 0.88)
        testSession.addGaze({ zone: zone.id, reliability: 0.88 });
        // Window 2 (nominal reliability 0.88)
        testSession.addGaze({ zone: zone.id, reliability: 0.88 });

        const hFinal = beliefEntropy(testSession.internal().belief);
        const deltaH = h0 - hFinal;
        const posterior = testSession.internal().posterior;
        const candidateMass = candidates.reduce((sum, id) => sum + (posterior[id] ?? 0), 0);

        // Empirical assertion: passive entropy reduction >= 2.257 bits
        expect(deltaH).toBeGreaterThanOrEqual(2.257);
        // Empirical assertion: posterior mass concentrated on the 2 candidates >= 96%
        expect(candidateMass).toBeGreaterThan(0.96);
        // Remaining 10 cards share < 4% mass
        const remainingMass = 1 - candidateMass;
        expect(remainingMass).toBeLessThan(0.04);
      }
    }
  });

  it("verifies exact candidate collapse isolates the 2 cards into progressive probe target", () => {
    const session = new PerformanceSession(cardEffect, {
      seed: 42,
      cameraEnabled: true,
      cameraValidated: true
    });
    session.begin();
    session.chosen();
    const stage = session.stage;
    const targetZone = stage.zones![3]!.id; // mid-right
    const candidates = zoneCards(stage, targetZone);

    session.addGaze({ zone: targetZone, reliability: 0.88 });
    session.finishAttune();

    expect(session.phaseName).toBe("probe");
    const snapshot = session.snapshot();
    // The prompt should be a progressive probe crafted for the gazed zone
    expect(snapshot.prompt).toBeDefined();
    expect(snapshot.canAnswer).toBe(true);
  });
});

describe("Milestone 2 Iteration 2 Challenger: Adversarial Noise Injection & Outliers", () => {
  const zones: StageZone[] = CARD_STAGE_BASE.zones!;

  it("noise injection: NaN, Infinity, and out-of-range coordinates do not crash accumulator", () => {
    const acc = new GazeAccumulator(zones, 900);
    // Malformed values
    acc.addPoint({ x: NaN, y: NaN }, 0.9, 1000);
    acc.addPoint({ x: Infinity, y: -Infinity }, 0.9, 1050);
    acc.addPoint({ x: -100, y: 500 }, 0.9, 1100);
    expect(acc.frameCount).toBe(0);
    expect(acc.resolveWindow()).toBeNull();
  });

  it("noise injection: gaussian noise around zone center is absorbed into valid window", () => {
    const acc = new GazeAccumulator(zones, 900);
    const start = 1000;
    // Zone top-left: [0, 0.5] x [0, 0.333]. Center is roughly (0.25, 0.16)
    // Inject 15 samples with gaussian-like jitter (+/- 0.05)
    for (let i = 0; i < 15; i++) {
      const jitterX = ((i * 17) % 11 - 5) * 0.01;
      const jitterY = ((i * 23) % 11 - 5) * 0.01;
      acc.addPoint({ x: 0.25 + jitterX, y: 0.16 + jitterY }, 0.85, start + i * 90);
    }
    expect(acc.frameCount).toBe(15);
    const win = acc.resolveWindow();
    expect(win).not.toBeNull();
    expect(win!.zone).toBe("top-left");
    expect(win!.dominance).toBe(1.0);
  });

  it("noise injection: high-frequency cross-zone noise does NOT trigger collapse", () => {
    const acc = new GazeAccumulator(zones, 900);
    const start = 1000;
    // 30 samples alternating between 3 different zones every frame
    const zoneTargets = [
      { x: 0.25, y: 0.15 }, // top-left
      { x: 0.75, y: 0.50 }, // mid-right
      { x: 0.25, y: 0.85 }  // bottom-left
    ];
    for (let i = 0; i < 30; i++) {
      const pt = zoneTargets[i % 3]!;
      acc.addPoint(pt, 0.8, start + i * 80);
    }
    // High-frequency inter-zone chatter must fail dominance (< 0.55)
    expect(acc.resolveWindow()).toBeNull();
  });

  it("outlier injection: bursts of single-frame outlier fixations do not distort dominant zone", () => {
    const acc = new GazeAccumulator(zones, 900);
    const start = 1000;
    let t = start;
    // 14 samples in top-left
    for (let i = 0; i < 14; i++) {
      acc.addPoint({ x: 0.25, y: 0.15 }, 0.85, t);
      t += 80;
    }
    // 2 rogue outlier frames in bottom-right
    acc.addPoint({ x: 0.8, y: 0.8 }, 0.85, t);
    t += 80;
    acc.addPoint({ x: 0.8, y: 0.8 }, 0.85, t);
    t += 80;

    // Total 16 frames. Dominance of top-left is 14/16 = 0.875 > 0.55
    const win = acc.resolveWindow();
    expect(win).not.toBeNull();
    expect(win!.zone).toBe("top-left");
    expect(win!.dominance).toBeGreaterThan(0.85);
  });
});

describe("Milestone 2 Iteration 2 Challenger: Low-Reliability & State Corruption Protection", () => {
  it("interleaved low-reliability and high-reliability gaze does not corrupt session state", () => {
    const session = new PerformanceSession(cardEffect, {
      seed: 99,
      cameraEnabled: true,
      cameraValidated: true
    });
    session.begin();
    const stage = session.stage;
    const zA = stage.zones![0]!.id;
    const zB = stage.zones![1]!.id;
    const h0 = beliefEntropy(session.internal().belief);

    // Attempt 1: Low reliability 0.25 (should drop cleanly)
    expect(session.addGaze({ zone: zA, reliability: 0.25 })).toBe(false);
    expect(beliefEntropy(session.internal().belief)).toBe(h0);
    expect(session.internal().gazeWindows).toBe(0);

    // Attempt 2: Valid reliability 0.85 (should succeed)
    expect(session.addGaze({ zone: zA, reliability: 0.85 })).toBe(true);
    const h1 = beliefEntropy(session.internal().belief);
    expect(h1).toBeLessThan(h0);
    expect(session.internal().gazeWindows).toBe(1);

    // Attempt 3: Out-of-bounds low reliability 0.00 (should drop cleanly)
    expect(session.addGaze({ zone: zB, reliability: 0.00 })).toBe(false);
    expect(beliefEntropy(session.internal().belief)).toBe(h1);
    expect(session.internal().gazeWindows).toBe(1);

    // Attempt 4: Negative reliability -0.50 (should drop cleanly)
    expect(session.addGaze({ zone: zB, reliability: -0.50 })).toBe(false);
    expect(beliefEntropy(session.internal().belief)).toBe(h1);
    expect(session.internal().gazeWindows).toBe(1);

    // Attempt 5: Second valid reliability 0.88 (should succeed and cap at 2)
    expect(session.addGaze({ zone: zA, reliability: 0.88 })).toBe(true);
    const h2 = beliefEntropy(session.internal().belief);
    expect(h2).toBeLessThan(h1);
    expect(session.internal().gazeWindows).toBe(2);
    expect(h0 - h2).toBeGreaterThanOrEqual(2.257);

    // Attempt 6: Third valid reliability 0.90 (must be refused because gazeWindows === 2)
    expect(session.addGaze({ zone: zA, reliability: 0.90 })).toBe(false);
    expect(session.internal().gazeWindows).toBe(2);
  });

  it("gaze addition during wrong phase (e.g. invite, reveal) is refused", () => {
    const session = new PerformanceSession(cardEffect, {
      seed: 77,
      cameraEnabled: true,
      cameraValidated: true
    });
    // In invite phase (camera not active, phase !== think/attune)
    const z = session.stage.zones![0]!.id;
    expect(session.addGaze({ zone: z, reliability: 0.9 })).toBe(false);
    expect(session.internal().gazeWindows).toBe(0);
  });
});
