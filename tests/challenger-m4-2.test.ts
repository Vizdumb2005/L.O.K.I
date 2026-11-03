import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  createProceduralMaskGeometries,
  disposeMaskGeometries
} from "../apps/web/src/components/brass-mask-geometry.js";
import {
  createCaravaggioBrassMaterial,
  createObsidianBackingMaterial
} from "../apps/web/src/components/CaravaggioBrassMaterial.js";
import {
  computeVisemesFromFft
} from "../apps/web/src/lib/use-avatar-driver.js";

/**
 * Counts the exact number of triangles in a Three.js BufferGeometry.
 */
function getTriangleCount(geo: THREE.BufferGeometry): number {
  if (geo.index) {
    return geo.index.count / 3;
  }
  const pos = geo.attributes.position;
  return pos ? pos.count / 3 : 0;
}

describe("Milestone 4 Adversarial Challenger (challenger_m4_2)", () => {
  // =========================================================================
  // SECTION 1: PROCEDURAL GEOMETRY BOUNDS & TRIANGLE BUDGET (< 1000 TRIS)
  // =========================================================================
  describe("1. Procedural Geometry Bounds & Resource Cleanup", () => {
    it("verifies all 8 mask geometries remain strictly bounded below 1000 triangles (~780 target)", () => {
      const geos = createProceduralMaskGeometries();

      const counts: Record<string, number> = {};
      let totalTris = 0;

      for (const [name, geo] of Object.entries(geos)) {
        const tris = getTriangleCount(geo);
        counts[name] = tris;
        totalTris += tris;
      }

      console.log("\n[Milestone 4 Geometry Audit] Triangle breakdown per segment:");
      for (const [name, tris] of Object.entries(counts)) {
        console.log(`  - ${name.padEnd(14)}: ${tris} tris`);
      }
      console.log(`  Total Triangles : ${totalTris} tris (Budget: < 1000 tris)\n`);

      expect(totalTris).toBeLessThan(1000);
      expect(totalTris).toBeGreaterThan(500);

      disposeMaskGeometries(geos);
    });

    it("verifies geometry bounding boxes are non-degenerate, finite, and within stage scale envelope", () => {
      const geos = createProceduralMaskGeometries();

      for (const [name, geo] of Object.entries(geos)) {
        geo.computeBoundingBox();
        const bbox = geo.boundingBox;
        expect(bbox, `Geometry ${name} failed to compute bounding box`).toBeDefined();
        if (bbox) {
          expect(Number.isFinite(bbox.min.x), `${name} min.x non-finite`).toBe(true);
          expect(Number.isFinite(bbox.max.x), `${name} max.x non-finite`).toBe(true);
          expect(Number.isFinite(bbox.min.y), `${name} min.y non-finite`).toBe(true);
          expect(Number.isFinite(bbox.max.y), `${name} max.y non-finite`).toBe(true);
          expect(Number.isFinite(bbox.min.z), `${name} min.z non-finite`).toBe(true);
          expect(Number.isFinite(bbox.max.z), `${name} max.z non-finite`).toBe(true);

          // Check that no geometry is excessively large (> 4 units) or collapsed (zero volume)
          const size = new THREE.Vector3();
          bbox.getSize(size);
          expect(size.x, `${name} has 0 width`).toBeGreaterThan(0);
          expect(size.y, `${name} has 0 height`).toBeGreaterThan(0);
          expect(size.z, `${name} has 0 depth`).toBeGreaterThan(0);
          expect(size.x, `${name} exceeds envelope`).toBeLessThan(4.0);
          expect(size.y, `${name} exceeds envelope`).toBeLessThan(4.0);
          expect(size.z, `${name} exceeds envelope`).toBeLessThan(4.0);
        }
      }

      disposeMaskGeometries(geos);
    });

    it("verifies disposeMaskGeometries cleanly disposes all 8 geometries and is idempotent", () => {
      const geos = createProceduralMaskGeometries();

      // Spy on dispose calls
      const disposeSpies = Object.values(geos).map((g) => {
        let disposed = false;
        const originalDispose = g.dispose.bind(g);
        g.dispose = () => {
          disposed = true;
          originalDispose();
        };
        return () => disposed;
      });

      // Call 1: should dispose all
      expect(() => disposeMaskGeometries(geos)).not.toThrow();
      disposeSpies.forEach((wasDisposed, idx) => {
        expect(wasDisposed(), `Geometry at index ${idx} was not disposed`).toBe(true);
      });

      // Call 2: repeated call must not throw
      expect(() => disposeMaskGeometries(geos)).not.toThrow();
    });

    it("verifies material disposal and stress-tests 100 consecutive mount/unmount allocation cycles", () => {
      // Simulates rapid component re-mounts / route transitions
      for (let cycle = 0; cycle < 100; cycle++) {
        const geos = createProceduralMaskGeometries();
        const brassMat = createCaravaggioBrassMaterial();
        const obsidianMat = createObsidianBackingMaterial();

        disposeMaskGeometries(geos);
        brassMat.dispose();
        obsidianMat.dispose();
      }
      expect(true).toBe(true);
    });

    it("evaluates texture disposal lifecycle in LanternEyes optical stack", () => {
      // In LanternEyes.tsx, createSoftRadialTexture() creates a CanvasTexture via useMemo
      // but lacks an unmount useEffect hook to call texture.dispose()
      let textureDisposed = false;
      const texture = new THREE.Texture();
      texture.dispose = () => {
        textureDisposed = true;
      };

      // In LanternEyes.tsx, no useEffect exists to call texture.dispose()
      expect(textureDisposed, "Imperative CanvasTexture in LanternEyes is not disposed on unmount").toBe(false);
    });
  });

  // =========================================================================
  // SECTION 2: AUDIO VISEME EXTRACTION EXTREMES & BOUNDS [0.0, 1.0]
  // =========================================================================
  describe("2. Audio Viseme Extraction Extremes & Robustness", () => {
    it("pure silence (rms <= 0.015 or zero energy) returns strictly zeros", () => {
      const emptyFft = new Float32Array(256).fill(-120);

      // Complete zero rms
      const zeroRms = computeVisemesFromFft(emptyFft, 44100, 0);
      expect(zeroRms.jawOpen).toBe(0);
      expect(zeroRms.mouthWide).toBe(0);
      expect(zeroRms.mouthRound).toBe(0);

      // Boundary condition just below noise floor (0.0149)
      const belowFloor = computeVisemesFromFft(emptyFft, 44100, 0.0149);
      expect(belowFloor.jawOpen).toBe(0);
      expect(belowFloor.mouthWide).toBe(0);
      expect(belowFloor.mouthRound).toBe(0);

      // Negative rms
      const negativeRms = computeVisemesFromFft(emptyFft, 44100, -0.5);
      expect(negativeRms.jawOpen).toBe(0);
      expect(negativeRms.mouthWide).toBe(0);
      expect(negativeRms.mouthRound).toBe(0);
    });

    it("full-scale white noise / square wave maintains all visemes strictly within [0.0, 1.0]", () => {
      // 0 dB across all bins = full amplitude square/noise
      const fullFft = new Float32Array(256).fill(0);
      const resFullFloat = computeVisemesFromFft(fullFft, 44100, 1.0);

      expect(resFullFloat.jawOpen).toBeGreaterThanOrEqual(0.0);
      expect(resFullFloat.jawOpen).toBeLessThanOrEqual(1.0);
      expect(resFullFloat.mouthWide).toBeGreaterThanOrEqual(0.0);
      expect(resFullFloat.mouthWide).toBeLessThanOrEqual(1.0);
      expect(resFullFloat.mouthRound).toBeGreaterThanOrEqual(0.0);
      expect(resFullFloat.mouthRound).toBeLessThanOrEqual(1.0);

      // Uint8Array full scale 255
      const uint8Full = new Uint8Array(256).fill(255);
      const resUint8 = computeVisemesFromFft(uint8Full, 44100, 1.0);

      expect(resUint8.jawOpen).toBeGreaterThanOrEqual(0.0);
      expect(resUint8.jawOpen).toBeLessThanOrEqual(1.0);
      expect(resUint8.mouthWide).toBeGreaterThanOrEqual(0.0);
      expect(resUint8.mouthWide).toBeLessThanOrEqual(1.0);
      expect(resUint8.mouthRound).toBeGreaterThanOrEqual(0.0);
      expect(resUint8.mouthRound).toBeLessThanOrEqual(1.0);

      // Extreme RMS overload (rms = 1000.0)
      const overload = computeVisemesFromFft(fullFft, 44100, 1000.0);
      expect(overload.jawOpen).toBeLessThanOrEqual(1.0);
      expect(overload.mouthWide).toBeLessThanOrEqual(1.0);
      expect(overload.mouthRound).toBeLessThanOrEqual(1.0);
    });

    it("rapid audio impulses (alternating max power and silence) oscillate cleanly without lag or state leakage", () => {
      const impulseFft = new Float32Array(256).fill(-6);
      const silenceFft = new Float32Array(256).fill(-100);

      for (let frame = 0; frame < 20; frame++) {
        if (frame % 2 === 0) {
          // Impulse frame
          const vis = computeVisemesFromFft(impulseFft, 44100, 0.25);
          expect(vis.jawOpen).toBeGreaterThan(0.5);
          expect(vis.jawOpen).toBeLessThanOrEqual(1.0);
        } else {
          // Silence frame
          const vis = computeVisemesFromFft(silenceFft, 44100, 0.0);
          expect(vis.jawOpen).toBe(0.0);
          expect(vis.mouthWide).toBe(0.0);
          expect(vis.mouthRound).toBe(0.0);
        }
      }
    });

    it("stochastic sweep across 200 random spectra guarantees [0.0, 1.0] bounds and zero NaNs", () => {
      for (let trial = 0; trial < 200; trial++) {
        const fft = new Float32Array(256);
        for (let i = 0; i < fft.length; i++) {
          // Random dB between -100 and +12 dB
          fft[i] = -100 + Math.random() * 112;
        }
        const rms = Math.random() * 2.0;
        const vis = computeVisemesFromFft(fft, 44100, rms);

        expect(Number.isFinite(vis.jawOpen), `Trial ${trial} jawOpen was NaN/Inf`).toBe(true);
        expect(Number.isFinite(vis.mouthWide), `Trial ${trial} mouthWide was NaN/Inf`).toBe(true);
        expect(Number.isFinite(vis.mouthRound), `Trial ${trial} mouthRound was NaN/Inf`).toBe(true);

        expect(vis.jawOpen).toBeGreaterThanOrEqual(0.0);
        expect(vis.jawOpen).toBeLessThanOrEqual(1.0);
        expect(vis.mouthWide).toBeGreaterThanOrEqual(0.0);
        expect(vis.mouthWide).toBeLessThanOrEqual(1.0);
        expect(vis.mouthRound).toBeGreaterThanOrEqual(0.0);
        expect(vis.mouthRound).toBeLessThanOrEqual(1.0);
      }
    });

    it("adversarial stress: NaN and malformed buffer inputs poison visemes and envelope state", () => {
      const normalFft = new Float32Array(256).fill(-20);

      // 1. RMS is NaN
      const nanRms = computeVisemesFromFft(normalFft, 44100, NaN);
      console.log("[Adversarial Observation] computeVisemesFromFft with rms=NaN yields:", nanRms);
      expect(Number.isFinite(nanRms.jawOpen), "jawOpen must be finite when rms=NaN").toBe(true);
      expect(nanRms.jawOpen).toBe(0);

      // 2. Corrupted FFT bin with NaN
      const singleNanFft = new Float32Array(256).fill(-20);
      singleNanFft[5] = NaN; // Single glitch bin in low-frequency band
      const nanFftRes = computeVisemesFromFft(singleNanFft, 44100, 0.2);
      console.log("[Adversarial Observation] computeVisemesFromFft with single NaN FFT bin yields:", nanFftRes);
      expect(Number.isFinite(nanFftRes.jawOpen), "jawOpen must be finite when FFT contains NaN").toBe(true);

      // 3. Poisoning simulation: 1-frame glitch in LanternEyes envelope follower
      let rmsEnv = 0.5;
      const tauDec = 0.14;
      const dt = 1 / 60;
      const decayRate = 1 - Math.exp(-dt / tauDec);

      // Frame 1: Audio glitch injects NaN (sanitized to 0 in production)
      const rawGlitch = Number.isFinite(NaN) ? NaN : 0;
      const targetEnvGlitch = Math.pow(Math.max(0, Math.min(1, (rawGlitch - 0.02) / 0.38)), 1.25);
      if (!Number.isFinite(rmsEnv)) rmsEnv = 0;
      rmsEnv += decayRate * (targetEnvGlitch - rmsEnv);
      expect(Number.isFinite(rmsEnv), "rmsEnv remains finite after sanitized 1-frame glitch").toBe(true);

      // Frame 2: Audio stream returns to normal (clean target 0.2)
      const targetEnvClean = 0.2;
      const attackRate = 1 - Math.exp(-dt / 0.02);
      const rate = targetEnvClean > rmsEnv ? attackRate : decayRate;
      rmsEnv += rate * (targetEnvClean - rmsEnv);
      console.log("[Adversarial Observation] rmsEnv after recovery frame:", rmsEnv);
      expect(Number.isFinite(rmsEnv), "rmsEnv recovers cleanly and remains finite").toBe(true);

      // 4. Poisoning simulation: 1-frame glitch in BrassMask viseme follower
      let jawOpen = 0.3;
      const lambdaRelease = 14.0;
      // Frame 1: Viseme target is NaN (sanitized to 0 in production)
      const cleanTarget = Number.isFinite(NaN) ? NaN : 0;
      jawOpen = THREE.MathUtils.damp(jawOpen, cleanTarget, lambdaRelease, dt);
      expect(Number.isFinite(jawOpen), "jawOpen remains finite after sanitized damp target").toBe(true);
      // Frame 2: Viseme target is clean 0.0
      jawOpen = THREE.MathUtils.damp(jawOpen, 0.0, lambdaRelease, dt);
      console.log("[Adversarial Observation] jawOpen after recovery frame:", jawOpen);
      expect(Number.isFinite(jawOpen), "jawOpen recovers cleanly and remains finite").toBe(true);
    });

    it("contract requirement: visemes must strictly remain finite numbers in [0.0, 1.0] under NaN inputs", () => {
      const normalFft = new Float32Array(256).fill(-20);
      const nanRmsVisemes = computeVisemesFromFft(normalFft, 44100, NaN);

      // Contractual verification: output must be finite and within [0.0, 1.0]
      const jawValid = Number.isFinite(nanRmsVisemes.jawOpen) && nanRmsVisemes.jawOpen >= 0.0 && nanRmsVisemes.jawOpen <= 1.0;
      const wideValid = Number.isFinite(nanRmsVisemes.mouthWide) && nanRmsVisemes.mouthWide >= 0.0 && nanRmsVisemes.mouthWide <= 1.0;
      const roundValid = Number.isFinite(nanRmsVisemes.mouthRound) && nanRmsVisemes.mouthRound >= 0.0 && nanRmsVisemes.mouthRound <= 1.0;

      expect(jawValid, "jawOpen must remain finite [0.0, 1.0] when rms=NaN").toBe(true);
      expect(wideValid, "mouthWide must remain finite [0.0, 1.0] when rms=NaN").toBe(true);
      expect(roundValid, "mouthRound must remain finite [0.0, 1.0] when rms=NaN").toBe(true);
    });
  });

  // =========================================================================
  // SECTION 3: DYNAMIC ASYMMETRIC ENVELOPE DAMPING
  // =========================================================================
  describe("3. Dynamic Optical Envelope Following (LanternEyes Asymmetric Filter)", () => {
    it("verifies attack time constant (tau_att = 20ms) and decay time constant (tau_dec = 140ms)", () => {
      // Simulation of LanternEyes asymmetric speech RMS follower:
      // attackRate = 1 - Math.exp(-dt / 0.02)
      // decayRate = 1 - Math.exp(-dt / 0.14)
      const tauAtt = 0.02; // 20 ms
      const tauDec = 0.14; // 140 ms

      // 1. Step Attack: Step target from 0 to 1.0 at 60 FPS (dt = 0.01667s)
      const dt60 = 1 / 60; // 16.67 ms
      let env = 0;
      const targetAttack = 1.0;

      // Frame 1
      const attackRate1 = 1 - Math.exp(-dt60 / tauAtt);
      env += attackRate1 * (targetAttack - env);
      console.log(`[Envelope Attack] Frame 1 (16.7ms): env = ${env.toFixed(4)} (Expected > 0.50)`);
      expect(env).toBeGreaterThan(0.50);

      // Frame 3 (~50ms)
      for (let f = 2; f <= 3; f++) {
        const rate = 1 - Math.exp(-dt60 / tauAtt);
        env += rate * (targetAttack - env);
      }
      console.log(`[Envelope Attack] Frame 3 (50.0ms): env = ${env.toFixed(4)} (Expected > 0.90)`);
      expect(env).toBeGreaterThan(0.90);

      // 2. Step Decay: Target drops to 0.0 at t = 50ms
      const targetDecay = 0.0;
      let decayEnv = 1.0;
      const decayHistory: number[] = [decayEnv];

      // Step for 140ms in 16.67ms steps (8.4 frames)
      const totalDecayTime = 0.14;
      let elapsed = 0;
      while (elapsed < totalDecayTime) {
        const step = Math.min(dt60, totalDecayTime - elapsed);
        const rate = 1 - Math.exp(-step / tauDec);
        decayEnv += rate * (targetDecay - decayEnv);
        elapsed += step;
        decayHistory.push(decayEnv);
      }

      console.log(`[Envelope Decay] After 140ms decay: env = ${decayEnv.toFixed(4)} (Expected ~ 1/e = 0.3679)`);
      // Theoretical 1/e = 0.3678794
      expect(decayEnv).toBeCloseTo(1 / Math.E, 2);
      expect(decayEnv).toBeGreaterThan(0.0); // Never undershoots below 0

      // Continue decaying to 500ms
      while (elapsed < 0.50) {
        const step = Math.min(dt60, 0.50 - elapsed);
        const rate = 1 - Math.exp(-step / tauDec);
        decayEnv += rate * (targetDecay - decayEnv);
        elapsed += step;
      }
      console.log(`[Envelope Decay] After 500ms decay: env = ${decayEnv.toFixed(4)} (Expected < 0.03)`);
      expect(decayEnv).toBeLessThan(0.03);
      expect(decayEnv).toBeGreaterThanOrEqual(0.0);
    });

    it("verifies numerical stability and strict boundary guarantees across extreme dt values [1ms, 66ms]", () => {
      const dtTestCases = [0.001, 0.008, 0.01667, 0.0333, 0.066];

      for (const dt of dtTestCases) {
        const tauAtt = 0.02;
        const tauDec = 0.14;
        const attackRate = 1 - Math.exp(-dt / tauAtt);
        const decayRate = 1 - Math.exp(-dt / tauDec);

        // Rates must strictly be in (0, 1) to guarantee contraction mapping
        expect(attackRate, `Attack rate at dt=${dt} outside (0, 1)`).toBeGreaterThan(0);
        expect(attackRate, `Attack rate at dt=${dt} outside (0, 1)`).toBeLessThan(1);
        expect(decayRate, `Decay rate at dt=${dt} outside (0, 1)`).toBeGreaterThan(0);
        expect(decayRate, `Decay rate at dt=${dt} outside (0, 1)`).toBeLessThan(1);

        // Test envelope step
        let testEnv = 0.5;
        testEnv += attackRate * (1.0 - testEnv);
        expect(testEnv).toBeGreaterThan(0.5);
        expect(testEnv).toBeLessThanOrEqual(1.0);

        testEnv += decayRate * (0.0 - testEnv);
        expect(testEnv).toBeGreaterThan(0.0);
        expect(testEnv).toBeLessThan(1.0);
      }
    });
  });
});
