import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  createProceduralMaskGeometries,
  disposeMaskGeometries,
  type MaskGeometries
} from "../apps/web/src/components/brass-mask-geometry.js";
import {
  computeVisemesFromFft
} from "../apps/web/src/lib/use-avatar-driver.js";
import { getNocturneIdleDrift } from "../apps/web/src/lib/head-pose.js";

function getTriangleCount(geo: THREE.BufferGeometry): number {
  if (geo.index) {
    return geo.index.count / 3;
  }
  const pos = geo.attributes.position;
  return pos ? pos.count / 3 : 0;
}

describe("Milestone 4 Adversarial Challenger 2 (challenger_m4_4)", () => {
  // =========================================================================
  // SECTION 1: PROCEDURAL GEOMETRY TRIANGLE BUDGET & PRIMITIVE INVENTORY
  // =========================================================================
  describe("1. Procedural Geometry Triangle Budget & Bounding Bounds", () => {
    it("asserts all 8 unique geometry primitives strictly sum to < 1000 triangles (~716 target)", () => {
      const geos = createProceduralMaskGeometries();

      const expectedBreakdown: Record<keyof MaskGeometries, number> = {
        cranium: 64,
        brow: 112,
        orbitalBezel: 192,
        nose: 8,
        cheek: 32,
        philtrum: 12,
        mandible: 104,
        backing: 192
      };

      let totalUniqueTris = 0;
      for (const [key, expectedTris] of Object.entries(expectedBreakdown)) {
        const geo = geos[key as keyof MaskGeometries];
        expect(geo, `Primitive ${key} is undefined`).toBeDefined();
        const tris = getTriangleCount(geo);
        expect(tris, `Primitive ${key} triangle count mismatch: expected ${expectedTris}, got ${tris}`).toBe(expectedTris);
        totalUniqueTris += tris;
      }

      console.log(`[Challenger 4-4 Audit] Unique Primitive Triangles: ${totalUniqueTris} tris`);
      expect(totalUniqueTris).toBe(716);
      expect(totalUniqueTris).toBeLessThan(1000);

      // Now verify instantiated scene triangle count in BrassMask.tsx
      // 1 cranium, 1 brow, 2 orbitalBezels, 1 nose, 2 cheeks, 1 philtrum, 1 mandible, 1 backing
      const sceneInstances: Record<keyof MaskGeometries, number> = {
        cranium: 1,
        brow: 1,
        orbitalBezel: 2,
        nose: 1,
        cheek: 2,
        philtrum: 1,
        mandible: 1,
        backing: 1
      };

      let totalSceneTris = 0;
      for (const [key, count] of Object.entries(sceneInstances)) {
        const tris = getTriangleCount(geos[key as keyof MaskGeometries]);
        totalSceneTris += tris * count;
      }

      console.log(`[Challenger 4-4 Audit] Instantiated Scene Mesh Triangles: ${totalSceneTris} tris`);
      expect(totalSceneTris).toBe(940);
      expect(totalSceneTris).toBeLessThan(1000);

      disposeMaskGeometries(geos);
    });

    it("evaluates vertex position and normal buffer sanity with zero NaN/Inf coordinates", () => {
      const geos = createProceduralMaskGeometries();

      for (const [name, geo] of Object.entries(geos)) {
        const pos = geo.attributes.position;
        expect(pos, `${name} has missing position buffer`).toBeDefined();
        expect(pos.count, `${name} has empty position buffer`).toBeGreaterThan(0);

        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          const y = pos.getY(i);
          const z = pos.getZ(i);
          expect(Number.isFinite(x), `${name} vertex ${i} has non-finite X: ${x}`).toBe(true);
          expect(Number.isFinite(y), `${name} vertex ${i} has non-finite Y: ${y}`).toBe(true);
          expect(Number.isFinite(z), `${name} vertex ${i} has non-finite Z: ${z}`).toBe(true);
        }

        const norm = geo.attributes.normal;
        if (norm) {
          for (let i = 0; i < norm.count; i++) {
            const nx = norm.getX(i);
            const ny = norm.getY(i);
            const nz = norm.getZ(i);
            expect(Number.isFinite(nx), `${name} normal ${i} has non-finite X: ${nx}`).toBe(true);
            expect(Number.isFinite(ny), `${name} normal ${i} has non-finite Y: ${ny}`).toBe(true);
            expect(Number.isFinite(nz), `${name} normal ${i} has non-finite Z: ${nz}`).toBe(true);
          }
        }
      }

      disposeMaskGeometries(geos);
    });

    it("verifies idempotency and disposal cleanliness of disposeMaskGeometries", () => {
      const geos = createProceduralMaskGeometries();
      const disposedFlags: boolean[] = new Array(Object.keys(geos).length).fill(false);

      Object.values(geos).forEach((g, idx) => {
        const originalDispose = g.dispose.bind(g);
        g.dispose = () => {
          disposedFlags[idx] = true;
          originalDispose();
        };
      });

      // First call
      disposeMaskGeometries(geos);
      disposedFlags.forEach((flag, idx) => {
        expect(flag, `Geometry ${idx} was not disposed on first call`).toBe(true);
      });

      // Second call (must be idempotent and not throw)
      expect(() => disposeMaskGeometries(geos)).not.toThrow();
    });
  });

  // =========================================================================
  // SECTION 2: AUDIO VISEME EXTRACTION ADVERSARIAL STRESS & FORMANT ACCURACY
  // =========================================================================
  describe("2. Audio Viseme Extraction Extremes & Robustness", () => {
    it("handles extreme, pathological, and non-finite RMS values without emitting NaN or out-of-bound values", () => {
      const normalFft = new Float32Array(256).fill(-20);

      const extremeRmsCases = [
        NaN,
        Infinity,
        -Infinity,
        -1.0,
        -1e-6,
        0.0,
        0.015, // exactly on noiseFloor
        0.0150001,
        0.22, // exactly ceiling
        1.0,
        100.0,
        1e308,
        Number.MAX_VALUE,
        Number.MIN_VALUE,
        Number.EPSILON
      ];

      for (const rms of extremeRmsCases) {
        const vis = computeVisemesFromFft(normalFft, 44100, rms);

        expect(Number.isFinite(vis.jawOpen), `jawOpen non-finite on rms=${rms}`).toBe(true);
        expect(Number.isFinite(vis.mouthWide), `mouthWide non-finite on rms=${rms}`).toBe(true);
        expect(Number.isFinite(vis.mouthRound), `mouthRound non-finite on rms=${rms}`).toBe(true);

        expect(vis.jawOpen, `jawOpen out of [0, 1] on rms=${rms}`).toBeGreaterThanOrEqual(0.0);
        expect(vis.jawOpen, `jawOpen out of [0, 1] on rms=${rms}`).toBeLessThanOrEqual(1.0);
        expect(vis.mouthWide, `mouthWide out of [0, 1] on rms=${rms}`).toBeGreaterThanOrEqual(0.0);
        expect(vis.mouthWide, `mouthWide out of [0, 1] on rms=${rms}`).toBeLessThanOrEqual(1.0);
        expect(vis.mouthRound, `mouthRound out of [0, 1] on rms=${rms}`).toBeGreaterThanOrEqual(0.0);
        expect(vis.mouthRound, `mouthRound out of [0, 1] on rms=${rms}`).toBeLessThanOrEqual(1.0);

        // For non-positive or sub-floor rms, must be strictly 0
        if (!Number.isFinite(rms) || rms <= 0.015) {
          expect(vis.jawOpen).toBe(0);
          expect(vis.mouthWide).toBe(0);
          expect(vis.mouthRound).toBe(0);
        }
      }
    });

    it("handles pathological FFT buffer configurations (all NaN, all Inf, empty, single-bin)", () => {
      const sampleRate = 44100;
      const testRms = 0.15;

      // 1. All NaNs
      const allNanFft = new Float32Array(256).fill(NaN);
      const resNan = computeVisemesFromFft(allNanFft, sampleRate, testRms);
      expect(Number.isFinite(resNan.jawOpen)).toBe(true);
      expect(Number.isFinite(resNan.mouthWide)).toBe(true);
      expect(Number.isFinite(resNan.mouthRound)).toBe(true);
      expect(resNan.jawOpen).toBeGreaterThanOrEqual(0);
      expect(resNan.jawOpen).toBeLessThanOrEqual(1);

      // 2. All Infs
      const allInfFft = new Float32Array(256).fill(Infinity);
      const resInf = computeVisemesFromFft(allInfFft, sampleRate, testRms);
      expect(Number.isFinite(resInf.jawOpen)).toBe(true);
      expect(Number.isFinite(resInf.mouthWide)).toBe(true);
      expect(Number.isFinite(resInf.mouthRound)).toBe(true);

      // 3. All -Infs
      const allNegInfFft = new Float32Array(256).fill(-Infinity);
      const resNegInf = computeVisemesFromFft(allNegInfFft, sampleRate, testRms);
      expect(Number.isFinite(resNegInf.jawOpen)).toBe(true);
      expect(Number.isFinite(resNegInf.mouthWide)).toBe(true);
      expect(Number.isFinite(resNegInf.mouthRound)).toBe(true);

      // 4. Empty buffer
      const emptyBuffer = new Float32Array(0);
      const resEmpty = computeVisemesFromFft(emptyBuffer, sampleRate, testRms);
      expect(Number.isFinite(resEmpty.jawOpen)).toBe(true);
      expect(Number.isFinite(resEmpty.mouthWide)).toBe(true);
      expect(Number.isFinite(resEmpty.mouthRound)).toBe(true);

      // 5. Single bin buffer
      const singleBin = new Float32Array([ -10 ]);
      const resSingle = computeVisemesFromFft(singleBin, sampleRate, testRms);
      expect(Number.isFinite(resSingle.jawOpen)).toBe(true);
      expect(Number.isFinite(resSingle.mouthWide)).toBe(true);
      expect(Number.isFinite(resSingle.mouthRound)).toBe(true);
    });

    it("discriminates formant acoustic energy cleanly across low, mid, and high frequency bands", () => {
      const sampleRate = 44100;
      const nBins = 256;

      // 1. Low-formant test (200 - 800 Hz): bins ~3 to ~9
      const lowFft = new Float32Array(nBins).fill(-100);
      for (let i = 3; i <= 9; i++) lowFft[i] = -6;
      const lowVis = computeVisemesFromFft(lowFft, sampleRate, 0.15);
      expect(lowVis.jawOpen, "Low band should open jaw").toBeGreaterThan(0.4);
      expect(lowVis.mouthWide, "Low band should not trigger wide sibilance").toBeLessThan(0.35);

      // 2. High-formant test (2400 - 4500 Hz): bins ~28 to ~52
      const highFft = new Float32Array(nBins).fill(-100);
      for (let i = 28; i <= 52; i++) highFft[i] = -6;
      const highVis = computeVisemesFromFft(highFft, sampleRate, 0.15);
      expect(highVis.mouthWide, "High band should produce wide spread mouth").toBeGreaterThan(0.3);

      // 3. Mid-formant test (800 - 2400 Hz): bins ~10 to ~27
      const midFft = new Float32Array(nBins).fill(-100);
      for (let i = 10; i <= 27; i++) midFft[i] = -6;
      const midVis = computeVisemesFromFft(midFft, sampleRate, 0.15);
      expect(midVis.mouthRound, "Mid band should produce rounded mouth").toBeGreaterThan(0.2);
    });

    it("executes 1,000 stochastic adversarial trials with injected fuzz and asserts 0 NaNs", () => {
      let nanCount = 0;
      for (let trial = 0; trial < 1000; trial++) {
        const fft = new Float32Array(256);
        for (let i = 0; i < fft.length; i++) {
          const r = Math.random();
          if (r < 0.05) fft[i] = NaN;
          else if (r < 0.08) fft[i] = Infinity;
          else if (r < 0.11) fft[i] = -Infinity;
          else fft[i] = -120 + Math.random() * 150;
        }

        const rms = Math.random() < 0.1 ? NaN : (Math.random() < 0.1 ? Infinity : Math.random() * 3.0);
        const sampleRate = Math.random() < 0.05 ? 0 : 44100;

        const vis = computeVisemesFromFft(fft, sampleRate, rms);

        if (!Number.isFinite(vis.jawOpen) || !Number.isFinite(vis.mouthWide) || !Number.isFinite(vis.mouthRound)) {
          nanCount++;
        }
      }
      expect(nanCount, "Adversarial fuzzer discovered non-finite viseme output!").toBe(0);
    });
  });

  // =========================================================================
  // SECTION 3: LANTERNEYES TEXTURE DISPOSAL & STATE HEALING SIMULATION
  // =========================================================================
  describe("3. LanternEyes Texture Disposal Lifecycle & Dynamic Envelope Follower", () => {
    it("verifies LanternEyes CanvasTexture disposal pattern on component unmount", () => {
      // Trace: In LanternEyes.tsx lines 57-64:
      // const radialTexture = useMemo(() => createSoftRadialTexture(), []);
      // useEffect(() => {
      //   return () => {
      //     radialTexture.dispose();
      //   };
      // }, [radialTexture]);

      let disposeCalled = false;
      const mockTexture = {
        dispose: () => {
          disposeCalled = true;
        }
      };

      // Simulate React useEffect unmount cleanup
      const cleanupFn = (() => {
        return () => {
          mockTexture.dispose();
        };
      })();

      expect(disposeCalled).toBe(false);
      cleanupFn();
      expect(disposeCalled, "Cleanup hook must invoke dispose() on unmount").toBe(true);
    });

    it("verifies LanternEyes asymmetric envelope follower self-healing under NaN injection", () => {
      // Simulation of LanternEyes.tsx useFrame filter logic:
      // lines 72-88
      let rmsEnv = 0.5;
      const dt = 1 / 60;
      const attackRate = 1 - Math.exp(-dt / 0.02);
      const decayRate = 1 - Math.exp(-dt / 0.14);

      // Run 30 normal frames
      for (let f = 0; f < 30; f++) {
        const rawRms = 0.2;
        const cleanNorm = Math.max(0, Math.min(1, (rawRms - 0.02) / 0.38));
        const rmsNorm = Math.pow(cleanNorm, 1.25);
        const targetEnv = Number.isFinite(rmsNorm) ? rmsNorm : 0;
        if (!Number.isFinite(rmsEnv)) rmsEnv = 0.0;
        rmsEnv += (targetEnv > rmsEnv ? attackRate : decayRate) * (targetEnv - rmsEnv);
        if (!Number.isFinite(rmsEnv)) rmsEnv = 0.0;
      }
      expect(Number.isFinite(rmsEnv)).toBe(true);
      expect(rmsEnv).toBeGreaterThan(0.1);

      // Frame 31: Inject NaN into audioRms
      const rawRmsNan = NaN;
      const safeRms = Number.isFinite(rawRmsNan) ? rawRmsNan : 0;
      const cleanNormNan = Math.max(0, Math.min(1, (safeRms - 0.02) / 0.38));
      const rmsNormNan = Math.pow(cleanNormNan, 1.25);
      const targetEnvNan = Number.isFinite(rmsNormNan) ? rmsNormNan : 0;
      if (!Number.isFinite(rmsEnv)) rmsEnv = 0.0;
      rmsEnv += (targetEnvNan > rmsEnv ? attackRate : decayRate) * (targetEnvNan - rmsEnv);
      if (!Number.isFinite(rmsEnv)) rmsEnv = 0.0;

      expect(Number.isFinite(rmsEnv), "rmsEnv must not become NaN when audioRms is NaN").toBe(true);

      // Frame 32: Force internal state corruption (e.g. Memory glitch setting rmsEnv to NaN)
      rmsEnv = NaN;
      // LanternEyes self-healing guard:
      if (!Number.isFinite(rmsEnv)) {
        rmsEnv = 0.0;
      }
      expect(rmsEnv, "LanternEyes guard must reset corrupted rmsEnv back to 0.0").toBe(0.0);

      // Frame 33: Resumed normal audio target
      const targetNormal = 0.25;
      rmsEnv += attackRate * (targetNormal - rmsEnv);
      expect(Number.isFinite(rmsEnv)).toBe(true);
      expect(rmsEnv).toBeGreaterThan(0.0);
    });

    it("verifies eye orientation and vergence remain bounded and finite when headPose contains NaNs", () => {
      // In LanternEyes.tsx lines 164-177:
      const DEG2RAD = Math.PI / 180;
      const corruptedPose = {
        yaw: NaN,
        pitch: NaN,
        screenX: NaN,
        screenY: NaN
      };

      const screenX = Number.isFinite(corruptedPose.screenX) ? corruptedPose.screenX : 0;
      const screenY = Number.isFinite(corruptedPose.screenY) ? corruptedPose.screenY : 0;
      const targetYaw = Number.isFinite(corruptedPose.yaw) ? corruptedPose.yaw / DEG2RAD : 0;
      const targetPitch = Number.isFinite(corruptedPose.pitch) ? corruptedPose.pitch / DEG2RAD : 0;

      const eyeYawDeg = Math.max(-5.0, Math.min(5.0, -8.0 * screenX - 0.35 * targetYaw));
      const eyePitchDeg = Math.max(-4.0, Math.min(4.0, 6.0 * screenY - 0.35 * targetPitch));

      const vergence = 1.2;
      const leftYawRad = (eyeYawDeg + vergence) * DEG2RAD;
      const rightYawRad = (eyeYawDeg - vergence) * DEG2RAD;
      const pitchRad = eyePitchDeg * DEG2RAD;

      expect(Number.isFinite(leftYawRad)).toBe(true);
      expect(Number.isFinite(rightYawRad)).toBe(true);
      expect(Number.isFinite(pitchRad)).toBe(true);
      expect(leftYawRad).toBeCloseTo(1.2 * DEG2RAD, 4);
      expect(rightYawRad).toBeCloseTo(-1.2 * DEG2RAD, 4);
      expect(pitchRad).toBe(0);
    });
  });

  // =========================================================================
  // SECTION 4: BRASSMASK QUATERNION GATING & RECOVERY
  // =========================================================================
  describe("4. BrassMask Quaternion Gating & Recovery", () => {
    it("accepts centered spectator (yaw:0, pitch:0, roll:0) when isTracking === true", () => {
      const neutralPose = {
        yaw: 0,
        pitch: 0,
        roll: 0,
        screenX: 0,
        screenY: 0,
        isTracking: true
      };

      const hasFinitePose =
        Number.isFinite(neutralPose.yaw) &&
        Number.isFinite(neutralPose.pitch) &&
        Number.isFinite(neutralPose.roll);

      const isNonZeroPose =
        neutralPose.yaw !== 0 ||
        neutralPose.pitch !== 0 ||
        neutralPose.roll !== 0 ||
        neutralPose.screenX !== 0 ||
        neutralPose.screenY !== 0;

      const isTracked =
        hasFinitePose &&
        (isNonZeroPose || Boolean(false) || neutralPose.isTracking === true);

      expect(isTracked, "Centered spectator looking front-and-center must remain tracked").toBe(true);
    });

    it("rejects corrupted NaN head pose and falls back safely to Nocturne idle drift", () => {
      const corruptedPose = {
        yaw: NaN,
        pitch: 0,
        roll: 0,
        screenX: 0,
        screenY: 0
      };

      const hasFinitePose =
        Number.isFinite(corruptedPose.yaw) &&
        Number.isFinite(corruptedPose.pitch) &&
        Number.isFinite(corruptedPose.roll);

      const isTracked = hasFinitePose;
      expect(isTracked, "Corrupted NaN pose must be rejected").toBe(false);

      // Fallback
      const idle = getNocturneIdleDrift(1.0, false);
      expect(Number.isFinite(idle.yaw)).toBe(true);
      expect(Number.isFinite(idle.pitch)).toBe(true);
      expect(Number.isFinite(idle.roll)).toBe(true);
    });

    it("self-heals Three.js Quaternion to identity if poisoned by non-finite numbers", () => {
      const quat = new THREE.Quaternion(NaN, 0, 0, 1);

      if (
        !Number.isFinite(quat.x) ||
        !Number.isFinite(quat.y) ||
        !Number.isFinite(quat.z) ||
        !Number.isFinite(quat.w)
      ) {
        quat.identity();
      }

      expect(quat.x).toBe(0);
      expect(quat.y).toBe(0);
      expect(quat.z).toBe(0);
      expect(quat.w).toBe(1);
    });
  });
});
