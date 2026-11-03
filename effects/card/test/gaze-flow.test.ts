import { describe, expect, it } from "vitest";
import { PerformanceSession } from "@loki/showrunner";
import { beliefEntropy } from "@loki/engine";
import { cardEffect } from "../src/index.js";
import type { StageSpec } from "@loki/effect-api";

/**
 * Blueprint v4 §2.1: gaze is the primary silent entropy channel.
 * One validated gaze window on a 6-zone stage must collapse the 12-card pool to
 * the 2 cards inside the observed zone - about 2.585 of the 3.585 total bits,
 * 72% of all the information the show needs, before a single spoken beat.
 */
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

describe("gaze as the primary silent channel (blueprint §2.1)", () => {
  it("two validated gaze windows collapse the pool to the zone's 2 cards (primary channel)", () => {
    const session = new PerformanceSession(cardEffect, {
      seed: 11,
      cameraEnabled: true,
      cameraValidated: true
    });
    session.begin();
    session.chosen();
    expect(session.phaseName).toBe("attune");
    expect(session.cameraOn).toBe(true);

    const stage = session.stage;
    // Pick the zone that holds a known card and feed validated gaze windows for it.
    const target = stage.items[3]!;
    const zone = zoneOf(stage, target.hypothesisId);
    expect(zone).not.toBeNull();
    expect(zoneCards(stage, zone!)).toHaveLength(2);

    const entropyBefore = beliefEntropy(session.internal().belief);
    expect(entropyBefore).toBeCloseTo(Math.log2(12), 2);

    // A single window is an honest soft prior shift...
    expect(session.addGaze({ zone: zone!, reliability: 0.8 })).toBe(true);
    let internal = session.internal();
    let mass = zoneCards(stage, zone!).reduce((sum, id) => sum + (internal.posterior[id] ?? 0), 0);
    expect(mass).toBeGreaterThan(0.6);

    // ...and the session's second window confirms the fixation, collapsing the pool
    // to the zone's 2 cards before a single spoken beat (blueprint section 2.1).
    expect(session.addGaze({ zone: zone!, reliability: 0.8 })).toBe(true);
    internal = session.internal();
    mass = zoneCards(stage, zone!).reduce((sum, id) => sum + (internal.posterior[id] ?? 0), 0);
    expect(mass).toBeGreaterThan(0.93);

    const entropyAfter = beliefEntropy(internal.belief);
    expect(entropyAfter).toBeLessThan(1.5);
    const bitsExtracted = entropyBefore - entropyAfter;
    expect(bitsExtracted).toBeGreaterThan(2.0);
  });

  it("gaze windows are capped at two per show and stay honest about reliability", () => {
    const session = new PerformanceSession(cardEffect, {
      seed: 12,
      cameraEnabled: true,
      cameraValidated: true
    });
    session.begin();
    session.chosen();
    const zone = session.stage.zones![0]!.id;
    expect(session.addGaze({ zone, reliability: 0.8 })).toBe(true);
    expect(session.addGaze({ zone: session.stage.zones![1]!.id, reliability: 0.8 })).toBe(true);
    // Third window is refused: the show never over-reads the camera.
    expect(session.addGaze({ zone, reliability: 0.8 })).toBe(false);
    expect(session.internal().gazeWindows).toBe(2);
  });

  it("an unvalidated camera never feeds the belief engine (MAJ-02 invariant)", () => {
    const session = new PerformanceSession(cardEffect, {
      seed: 13,
      cameraEnabled: true,
      cameraValidated: false
    });
    session.begin();
    session.chosen();
    expect(session.addGaze({ zone: session.stage.zones![0]!.id, reliability: 0.9 })).toBe(false);
    expect(session.internal().gazeWindows).toBe(0);
  });
});

describe("validateCamera: the attunement calibration gate (blueprint §2.2)", () => {
  it("refuses gaze before validateCamera() and accepts after it", () => {
    // Sensor-mode wiring: presenceEnabled opens the attune beat; the gaze gate
    // itself stays closed until the ember calibration calls validateCamera().
    const session = new PerformanceSession(cardEffect, {
      seed: 21,
      cameraEnabled: true,
      cameraValidated: false,
      presenceEnabled: true
    });
    session.begin();
    session.chosen();
    expect(session.phaseName).toBe("attune");
    expect(session.cameraOn).toBe(true);
    // The attunement calibration has not passed yet: gaze is refused.
    const zone = session.stage.zones![0]!.id;
    expect(session.addGaze({ zone, reliability: 0.9 })).toBe(false);

    // The disguised calibration passed (RMSE within the gate): the gate opens.
    expect(session.validateCamera()).toBe(true);
    expect(session.addGaze({ zone, reliability: 0.8 })).toBe(true);
    expect(session.internal().gazeWindows).toBe(1);
  });

  it("validateCamera() is a no-op without a camera and cannot re-close the gate", () => {
    const noCamera = new PerformanceSession(cardEffect, { seed: 22 });
    expect(noCamera.validateCamera()).toBe(false);

    const session = new PerformanceSession(cardEffect, {
      seed: 23,
      cameraEnabled: true,
      cameraValidated: false,
      presenceEnabled: true
    });
    session.begin();
    session.chosen();
    expect(session.validateCamera()).toBe(true);
    // Idempotent: already validated.
    expect(session.validateCamera()).toBe(true);
    expect(session.snapshot().camera.validated).toBe(true);
  });
});