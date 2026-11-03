import { describe, expect, it } from "vitest";
import { isGazeGateSatisfied, CALIBRATION_RMSE_MAX } from "./performance.js";
import { PerformanceSession } from "@loki/showrunner";
import { cardEffect } from "@loki/effect-card";

describe("apps/web/src/lib/performance: isGazeGateSatisfied", () => {
  it("rejects when either argument is null or undefined", () => {
    expect(isGazeGateSatisfied(null, null)).toBe(false);
    expect(isGazeGateSatisfied(undefined, undefined)).toBe(false);
    expect(isGazeGateSatisfied(null, undefined)).toBe(false);
    expect(isGazeGateSatisfied(undefined, null)).toBe(false);
    expect(isGazeGateSatisfied({ usable: true }, null)).toBe(false);
    expect(isGazeGateSatisfied(null, { calibrated: true, rmse: 0.05 })).toBe(false);
  });

  it("rejects asymmetric parameters", () => {
    expect(isGazeGateSatisfied({ usable: false }, undefined)).toBe(false);
    expect(isGazeGateSatisfied({ usable: true }, undefined)).toBe(false);
    expect(isGazeGateSatisfied(undefined, { calibrated: true, rmse: 0.05 })).toBe(false);
    expect(isGazeGateSatisfied(undefined, { calibrated: false })).toBe(false);
  });

  it("rejects unusable quality or uncalibrated calibration", () => {
    expect(isGazeGateSatisfied({ usable: false }, { calibrated: true, rmse: 0.05 })).toBe(false);
    expect(isGazeGateSatisfied({ usable: true }, { calibrated: false, rmse: 0.05 })).toBe(false);
    expect(isGazeGateSatisfied({ usable: false }, { calibrated: false, rmse: 0.05 })).toBe(false);
  });

  it("strictly enforces RMSE <= 0.15 bound", () => {
    // High RMSE
    expect(isGazeGateSatisfied({ usable: true }, { calibrated: true, rmse: 0.28 })).toBe(false);
    expect(isGazeGateSatisfied({ usable: true }, { calibrated: true, rmse: 0.151 })).toBe(false);

    // Exact boundary
    expect(isGazeGateSatisfied({ usable: true }, { calibrated: true, rmse: CALIBRATION_RMSE_MAX })).toBe(true);
    expect(isGazeGateSatisfied({ usable: true }, { calibrated: true, rmse: 0.15 })).toBe(true);

    // Well within threshold
    expect(isGazeGateSatisfied({ usable: true }, { calibrated: true, rmse: 0.06 })).toBe(true);
    expect(isGazeGateSatisfied({ usable: true }, { calibrated: true, rmse: 0.01 })).toBe(true);

    // Null or omitted RMSE (synthetic/fallback)
    expect(isGazeGateSatisfied({ usable: true }, { calibrated: true, rmse: null })).toBe(true);
    expect(isGazeGateSatisfied({ usable: true }, { calibrated: true })).toBe(true);

    // NaN RMSE safely rejected
    expect(isGazeGateSatisfied({ usable: true }, { calibrated: true, rmse: Number.NaN })).toBe(false);
  });
});

describe("apps/web/src/lib/performance: validateCamera gating integration", () => {
  function makeSession() {
    const session = new PerformanceSession(cardEffect, {
      seed: 42,
      cameraEnabled: true,
      cameraValidated: false,
      presenceEnabled: true
    });
    session.begin();
    return session;
  }

  function simulateValidateCamera(session: PerformanceSession, gq?: any, gc?: any): boolean {
    if (gq !== undefined || gc !== undefined) {
      if (!isGazeGateSatisfied(gq, gc)) {
        return false;
      }
    }
    return session.validateCamera();
  }

  it("allows zero-argument calls for backward compatibility", () => {
    const session = makeSession();
    expect(session.snapshot().camera.validated).toBe(false);
    const result = simulateValidateCamera(session);
    expect(result).toBe(true);
    expect(session.snapshot().camera.validated).toBe(true);
  });

  it("blocks null input without throwing TypeError", () => {
    const session = makeSession();
    expect(() => simulateValidateCamera(session, null, null)).not.toThrow();
    expect(simulateValidateCamera(session, null, null)).toBe(false);
    expect(session.snapshot().camera.validated).toBe(false);
  });

  it("blocks asymmetric single argument bypass", () => {
    const session = makeSession();
    expect(simulateValidateCamera(session, { usable: false }, undefined)).toBe(false);
    expect(session.snapshot().camera.validated).toBe(false);

    expect(simulateValidateCamera(session, undefined, { calibrated: true, rmse: 0.05 })).toBe(false);
    expect(session.snapshot().camera.validated).toBe(false);
  });

  it("blocks high RMSE calibrations", () => {
    const session = makeSession();
    expect(simulateValidateCamera(session, { usable: true }, { calibrated: true, rmse: 0.28 })).toBe(false);
    expect(session.snapshot().camera.validated).toBe(false);
  });

  it("validates camera on honest calibration meeting all criteria", () => {
    const session = makeSession();
    expect(simulateValidateCamera(session, { usable: true }, { calibrated: true, rmse: 0.08 })).toBe(true);
    expect(session.snapshot().camera.validated).toBe(true);
  });
});
