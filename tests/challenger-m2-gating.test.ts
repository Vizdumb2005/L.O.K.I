import { describe, expect, it } from "vitest";
import {
  isGazeGateSatisfied,
  CALIBRATION_RMSE_MAX,
  type PerformanceGazeValidation,
  type PerformanceGazeCalibration
} from "../apps/web/src/lib/performance.js";
import { PerformanceSession } from "@loki/showrunner";
import { cardEffect } from "../effects/card/src/index.js";
import { beliefEntropy } from "@loki/engine";

describe("Challenger 1 M2-IT2: isGazeGateSatisfied and validateCamera Stress Suite", () => {
  describe("Vector 1: Null, Undefined & Malformed Type Safety", () => {
    it("safely handles null and undefined combinations without throwing TypeError", () => {
      expect(() => isGazeGateSatisfied(null, null)).not.toThrow();
      expect(isGazeGateSatisfied(null, null)).toBe(false);

      expect(() => isGazeGateSatisfied(undefined, undefined)).not.toThrow();
      expect(isGazeGateSatisfied(undefined, undefined)).toBe(false);

      expect(() => isGazeGateSatisfied(null, undefined)).not.toThrow();
      expect(isGazeGateSatisfied(null, undefined)).toBe(false);

      expect(() => isGazeGateSatisfied(undefined, null)).not.toThrow();
      expect(isGazeGateSatisfied(undefined, null)).toBe(false);

      expect(() => (isGazeGateSatisfied as any)()).not.toThrow();
      expect((isGazeGateSatisfied as any)()).toBe(false);
    });

    it("safely rejects non-object or malformed structures", () => {
      expect(isGazeGateSatisfied(0 as any, 0 as any)).toBe(false);
      expect(isGazeGateSatisfied(false as any, false as any)).toBe(false);
      expect(isGazeGateSatisfied("" as any, "" as any)).toBe(false);
      expect(isGazeGateSatisfied([] as any, [] as any)).toBe(false);
      expect(isGazeGateSatisfied({} as any, {} as any)).toBe(false);
      expect(isGazeGateSatisfied({ usable: undefined }, { calibrated: undefined })).toBe(false);
      expect(isGazeGateSatisfied({ usable: null as any }, { calibrated: null as any })).toBe(false);
      expect(isGazeGateSatisfied({ usable: false }, { calibrated: false })).toBe(false);
    });
  });

  describe("Vector 2: Asymmetric and Incomplete Arguments", () => {
    it("strictly rejects valid quality when calibration is missing, null, or uncalibrated", () => {
      const validQuality: PerformanceGazeValidation = { usable: true };

      expect(isGazeGateSatisfied(validQuality, null)).toBe(false);
      expect(isGazeGateSatisfied(validQuality, undefined)).toBe(false);
      expect(isGazeGateSatisfied(validQuality, {})).toBe(false);
      expect(isGazeGateSatisfied(validQuality, { rmse: 0.05 })).toBe(false);
      expect(isGazeGateSatisfied(validQuality, { calibrated: false, rmse: 0.05 })).toBe(false);
    });

    it("strictly rejects valid calibration when quality is missing, null, or unusable", () => {
      const validCalibration: PerformanceGazeCalibration = { calibrated: true, rmse: 0.05 };

      expect(isGazeGateSatisfied(null, validCalibration)).toBe(false);
      expect(isGazeGateSatisfied(undefined, validCalibration)).toBe(false);
      expect(isGazeGateSatisfied({}, validCalibration)).toBe(false);
      expect(isGazeGateSatisfied({ usable: false }, validCalibration)).toBe(false);
    });

    it("strictly rejects when usable=false or calibrated=false", () => {
      expect(isGazeGateSatisfied({ usable: false }, { calibrated: false, rmse: 0.05 })).toBe(false);
      expect(isGazeGateSatisfied({ usable: false }, { calibrated: true, rmse: 0.05 })).toBe(false);
      expect(isGazeGateSatisfied({ usable: true }, { calibrated: false, rmse: 0.05 })).toBe(false);
    });
  });

  describe("Vector 3: Mathematical RMSE Boundary & Numerical Edge Cases", () => {
    const validQuality: PerformanceGazeValidation = { usable: true };

    it("strictly accepts boundary values where rmse <= 0.15", () => {
      expect(isGazeGateSatisfied(validQuality, { calibrated: true, rmse: 0.15 })).toBe(true);
      expect(isGazeGateSatisfied(validQuality, { calibrated: true, rmse: CALIBRATION_RMSE_MAX })).toBe(true);
      expect(isGazeGateSatisfied(validQuality, { calibrated: true, rmse: 0.15 - 1e-15 })).toBe(true);
      expect(isGazeGateSatisfied(validQuality, { calibrated: true, rmse: 0.149999 })).toBe(true);
      expect(isGazeGateSatisfied(validQuality, { calibrated: true, rmse: 0.10 })).toBe(true);
      expect(isGazeGateSatisfied(validQuality, { calibrated: true, rmse: 0.05 })).toBe(true);
      expect(isGazeGateSatisfied(validQuality, { calibrated: true, rmse: 0.0001 })).toBe(true);
      expect(isGazeGateSatisfied(validQuality, { calibrated: true, rmse: 0 })).toBe(true);
    });

    it("strictly rejects values above 0.15 limit", () => {
      expect(isGazeGateSatisfied(validQuality, { calibrated: true, rmse: 0.15 + 1e-15 })).toBe(false);
      expect(isGazeGateSatisfied(validQuality, { calibrated: true, rmse: 0.150000000000001 })).toBe(false);
      expect(isGazeGateSatisfied(validQuality, { calibrated: true, rmse: 0.150001 })).toBe(false);
      expect(isGazeGateSatisfied(validQuality, { calibrated: true, rmse: 0.151 })).toBe(false);
      expect(isGazeGateSatisfied(validQuality, { calibrated: true, rmse: 0.16 })).toBe(false);
      expect(isGazeGateSatisfied(validQuality, { calibrated: true, rmse: 0.20 })).toBe(false);
      expect(isGazeGateSatisfied(validQuality, { calibrated: true, rmse: 0.28 })).toBe(false);
      expect(isGazeGateSatisfied(validQuality, { calibrated: true, rmse: 0.50 })).toBe(false);
      expect(isGazeGateSatisfied(validQuality, { calibrated: true, rmse: 1.0 })).toBe(false);
      expect(isGazeGateSatisfied(validQuality, { calibrated: true, rmse: 1000.0 })).toBe(false);
    });

    it("strictly rejects NaN and Positive Infinity", () => {
      expect(isGazeGateSatisfied(validQuality, { calibrated: true, rmse: Number.NaN })).toBe(false);
      expect(isGazeGateSatisfied(validQuality, { calibrated: true, rmse: Number.POSITIVE_INFINITY })).toBe(false);
    });

    it("accepts null and omitted RMSE for fallback / synthetic calibration", () => {
      expect(isGazeGateSatisfied(validQuality, { calibrated: true, rmse: null })).toBe(true);
      expect(isGazeGateSatisfied(validQuality, { calibrated: true, rmse: undefined })).toBe(true);
      expect(isGazeGateSatisfied(validQuality, { calibrated: true })).toBe(true);
    });
  });

  describe("Vector 4: Property-Based Randomized Fuzzing Harness (1000 iterations)", () => {
    function oracle(q: any, c: any): boolean {
      if (!q || !q.usable) return false;
      if (!c || !c.calibrated) return false;
      if (c.rmse === null || c.rmse === undefined) return true;
      if (typeof c.rmse !== "number" || Number.isNaN(c.rmse)) return false;
      return c.rmse <= 0.15;
    }

    it("matches independent oracle across 1,000 randomized permutations", () => {
      const booleans = [true, false, undefined, null];
      const rmses = [
        0, 0.01, 0.05, 0.10, 0.149999, 0.15, 0.150001, 0.16, 0.28, 0.99,
        -0.05, NaN, Infinity, -Infinity, null, undefined
      ];

      for (let i = 0; i < 1000; i++) {
        const usableVal = booleans[Math.floor(Math.random() * booleans.length)];
        const calibratedVal = booleans[Math.floor(Math.random() * booleans.length)];
        const rmseVal = rmses[Math.floor(Math.random() * rmses.length)];

        const q = Math.random() < 0.1 ? null : Math.random() < 0.1 ? undefined : { usable: usableVal };
        const c = Math.random() < 0.1 ? null : Math.random() < 0.1 ? undefined : { calibrated: calibratedVal, rmse: rmseVal };

        const actual = isGazeGateSatisfied(q as any, c as any);
        const expected = oracle(q, c);

        expect(actual).toBe(expected);
      }
    });
  });

  describe("Vector 5: validateCamera Hook Logic & Session Invariant Integration", () => {
    function makeSession() {
      const session = new PerformanceSession(cardEffect, {
        seed: 888,
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

    it("strictly blocks null input from opening camera gate", () => {
      const s = makeSession();
      expect(simulateValidateCamera(s, null, null)).toBe(false);
      expect(s.snapshot().camera.validated).toBe(false);
    });

    it("strictly blocks asymmetric single argument bypass", () => {
      const s1 = makeSession();
      expect(simulateValidateCamera(s1, { usable: false }, undefined)).toBe(false);
      expect(s1.snapshot().camera.validated).toBe(false);

      const s2 = makeSession();
      expect(simulateValidateCamera(s2, undefined, { calibrated: true, rmse: 0.05 })).toBe(false);
      expect(s2.snapshot().camera.validated).toBe(false);
    });

    it("strictly blocks high RMSE calibration (> 0.15)", () => {
      const s = makeSession();
      expect(simulateValidateCamera(s, { usable: true }, { calibrated: true, rmse: 0.28 })).toBe(false);
      expect(s.snapshot().camera.validated).toBe(false);

      expect(simulateValidateCamera(s, { usable: true }, { calibrated: true, rmse: 0.150001 })).toBe(false);
      expect(s.snapshot().camera.validated).toBe(false);
    });

    it("successfully validates camera when all honest criteria are met", () => {
      const s = makeSession();
      expect(simulateValidateCamera(s, { usable: true }, { calibrated: true, rmse: 0.08 })).toBe(true);
      expect(s.snapshot().camera.validated).toBe(true);

      // Verify gaze window is accepted now that camera is validated
      s.chosen();
      const h0 = beliefEntropy(s.internal().belief);
      const zone = s.stage.zones![0]!.id;
      const accepted = s.addGaze({ zone, reliability: 0.88 });
      expect(accepted).toBe(true);

      const h1 = beliefEntropy(s.internal().belief);
      expect(h0 - h1).toBeGreaterThan(1.10);
    });

    it("strictly refuses gaze window when camera validation failed", () => {
      const s = makeSession();
      simulateValidateCamera(s, { usable: true }, { calibrated: false, rmse: 0.05 });
      expect(s.snapshot().camera.validated).toBe(false);

      s.chosen();
      const h0 = beliefEntropy(s.internal().belief);
      const zone = s.stage.zones![0]!.id;
      const accepted = s.addGaze({ zone, reliability: 0.88 });
      expect(accepted).toBe(false);

      const h1 = beliefEntropy(s.internal().belief);
      expect(h1).toBe(h0); // Unmutated
    });
  });
});
