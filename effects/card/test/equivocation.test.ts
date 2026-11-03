import { describe, expect, it } from "vitest";
import { PerformanceSession } from "@loki/showrunner";
import { cardEffect } from "../src/index.js";

describe("F12: Equivocation Fallback (Magician's Choice Physical Elimination Gesture)", () => {
  it("triggers equivocation physical elimination gesture when gaze reliability is low (< 0.50)", () => {
    const session = new PerformanceSession(cardEffect, {
      seed: 42,
      cameraEnabled: true,
      cameraValidated: true,
      presenceEnabled: true
    });
    session.begin();
    session.chosen();

    // Feed ambiguous low-reliability gaze window (0.45 < 0.50)
    expect(session.addGaze({ zone: "top-left", reliability: 0.45 })).toBe(true);
    session.finishAttune();

    expect(session.phaseName).toBe("probe");
    const view = session.snapshot();
    // Beat 1 must be the physical elimination gesture
    expect(view.probeId).toBe("card-equivocation-gesture");
    expect(view.prompt).toContain("Push the black cards away");
    expect(view.prompt?.length).toBeLessThanOrEqual(160);
    expect(view.options?.length).toBe(2);
    expect(view.options?.map((o) => o.id)).toEqual(["cast-black", "keep-crimson"]);
  });

  it("triggers equivocation gesture when camera calibration fails (0 gaze windows validated)", () => {
    const session = new PerformanceSession(cardEffect, {
      seed: 43,
      cameraEnabled: true,
      cameraValidated: false, // Calibration failed
      presenceEnabled: true
    });
    session.begin();
    session.chosen();
    session.finishAttune();

    expect(session.phaseName).toBe("probe");
    const view = session.snapshot();
    expect(view.probeId).toBe("card-equivocation-gesture");
    expect(view.prompt).toContain("Push the black cards away from you");
  });

  it("reduces candidate pool from 4 cards to 2 candidate cards in Beat 1", () => {
    const session = new PerformanceSession(cardEffect, {
      seed: 44,
      cameraEnabled: true,
      cameraValidated: true,
      presenceEnabled: true
    });
    session.begin();
    session.chosen();
    session.addGaze({ zone: "top-left", reliability: 0.45 });
    session.finishAttune();

    expect(session.snapshot().probeId).toBe("card-equivocation-gesture");

    // Answer the equivocation physical elimination gesture
    session.answer("cast-black");
    session.clearAck();

    // Posterior mass must now be concentrated on the remaining 2 red cards
    const internal = session.internal();
    expect(internal.confidence).toBeGreaterThan(0.25);
    expect(session.phaseName).toBe("probe");
    // Next probe must be the progressive reading probe targeting the remaining pair
    expect(session.snapshot().probeId).toMatch(/^zone-statement-/);
  });

  it("reaches the reveal within at most 2 conversational beats under equivocation", () => {
    const session = new PerformanceSession(cardEffect, {
      seed: 45,
      cameraEnabled: true,
      cameraValidated: true,
      presenceEnabled: true
    });
    session.begin();
    session.chosen();
    session.addGaze({ zone: "top-left", reliability: 0.45 });
    session.finishAttune();

    expect(session.phaseName).toBe("probe");
    expect(session.effectiveMaxProbes).toBe(2);
    expect(session.snapshot()).not.toHaveProperty("progress");
    expect(session.snapshot()).not.toHaveProperty("resonance");

    // Beat 1: Equivocation gesture eliminates black cards
    expect(session.snapshot().probeId).toBe("card-equivocation-gesture");
    session.answer("cast-black");
    session.clearAck();

    // Beat 2: Progressive impression confirm
    expect(session.phaseName).toBe("probe");
    session.answer("yes");
    session.clearAck();

    expect(["build", "reveal"]).toContain(session.phaseName);
    expect(session.internal().answered).toBeLessThanOrEqual(2);
  });

  it("collapses candidate pool from 4 to 2, then 2 to 1 with final commit", () => {
    const session = new PerformanceSession(cardEffect, {
      seed: 46,
      cameraEnabled: true,
      cameraValidated: true,
      presenceEnabled: true
    });
    session.begin();
    session.chosen();
    session.addGaze({ zone: "top-left", reliability: 0.45 });
    session.finishAttune();

    // Beat 1: Equivocation eliminates black cards (4 -> 2)
    session.answer("cast-black");
    session.clearAck();
    expect(session.phaseName).toBe("probe");

    // Beat 2: Progressive cold reading commits to single card (2 -> 1)
    session.answer("yes");
    session.clearAck();
    expect(session.phaseName).toBe("build");
    expect(session.internal().answered).toBe(2);
    expect(session.internal().confidence).toBeGreaterThanOrEqual(0.85);
  });
});
