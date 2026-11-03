import type { Page, Route } from "@playwright/test";

/**
 * LOKI v4 Synthetic Hardware & Sensor Fixtures for Headless Playwright Execution
 *
 * Mocks:
 * 1. WebRTC getUserMedia (Camera & Microphone)
 * 2. MediaPipe tasks-vision FaceLandmarker with synthetic 468+ iris & facial mesh landmarks
 * 3. Synthetic Attunement Gaze Trajectories (Anchors 1-4 + Zone fixations)
 * 4. Web Audio Analyser & Formant Viseme Generation (jawOpen, mouthWide, mouthRound)
 * 5. Ephemeral Edge Voice Relay (WebRTC PeerConnection, VAD, Zero Data Retention purge)
 */

export type HardwareMockScenario =
  | "nominal"
  | "permission-denied"
  | "camera-disconnected"
  | "low-light"
  | "head-motion-excessive"
  | "collinear-degenerate-anchors"
  | "model-assets-404"
  | "barge-in-interruption"
  | "zdr-purge";

export interface MockHardwareConfig {
  scenario?: HardwareMockScenario;
  targetZone?: "top-left" | "top-right" | "mid-left" | "mid-right" | "bottom-left" | "bottom-right";
  gazeReliability?: number;
  residualRmse?: number;
  turnLatencyMs?: number;
  audioRms?: number;
}

export interface HardwareControlHandle {
  setScenario: (scenario: HardwareMockScenario) => Promise<void>;
  setTargetZone: (zone: string) => Promise<void>;
  triggerBargeIn: () => Promise<void>;
  disconnectCamera: () => Promise<void>;
  getZdrStatus: () => Promise<{ purged: boolean; localMemoryZeroed: boolean; tracksStopped: number }>;
}

export async function setupHardwareMocks(
  page: Page,
  config: MockHardwareConfig = {}
): Promise<HardwareControlHandle> {
  const scenario = config.scenario ?? "nominal";
  const targetZone = config.targetZone ?? "top-left";
  const gazeReliability = config.gazeReliability ?? 0.88;
  const residualRmse = config.residualRmse ?? 0.06;
  const turnLatencyMs = config.turnLatencyMs ?? 420;

  // Intercept MediaPipe tasks-vision WASM/JS loader so headless browser runs with zero network egress
  await page.route(/\/node_modules\/.*tasks-vision.*\.js/, async (route: Route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `
        export const FilesetResolver = {
          forVisionTasks: async (path) => {
            if (window.__LOKI_MOCK_HARDWARE__?.scenario === "model-assets-404") {
              throw new Error("Simulated 404 for MediaPipe assets");
            }
            return { path };
          }
        };

        export const FaceLandmarker = {
          createFromOptions: async (_fileset, options) => {
            if (window.__LOKI_MOCK_HARDWARE__?.scenario === "model-assets-404") {
              throw new Error("Simulated asset load failure in FaceLandmarker");
            }
            return {
              detectForVideo: (_video, timestamp) => {
                return window.__LOKI_MOCK_HARDWARE__?.generateLandmarks(timestamp) || { faceLandmarks: [] };
              },
              close: () => {
                if (window.__LOKI_MOCK_HARDWARE__) {
                  window.__LOKI_MOCK_HARDWARE__.modelsClosed += 1;
                }
              }
            };
          }
        };
      `
    });
  });

  // Intercept @huggingface/transformers to avoid network downloads in tests
  await page.route(/.*transformers.*/, async (route: Route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `
        export const pipeline = async () => async () => ({ text: "yes" });
        export const env = { allowLocalModels: false };
      `
    });
  });

  // Inject browser-level mock devices, streams, and state
  await page.addInitScript(
    (cfg) => {
      // Precomputed iris offsets for the 4 theatrical anchors in normalized stage space:
      // Anchor 0: (0.25, 0.25) -> iris (-0.25, -0.25)
      // Anchor 1: (0.75, 0.25) -> iris (+0.25, -0.25)
      // Anchor 2: (0.75, 0.75) -> iris (+0.25, +0.25)
      // Anchor 3: (0.25, 0.75) -> iris (-0.25, +0.25)
      // Mapping: StagePoint = 0.5 + IrisOffset (clean 1.0 identity scale, 0.5 translation)
      const ZONE_IRIS_OFFSETS: Record<string, { x: number; y: number }> = {
        "top-left": { x: -0.25, y: -0.25 },
        "top-right": { x: 0.25, y: -0.25 },
        "mid-left": { x: -0.25, y: 0.0 },
        "mid-right": { x: 0.25, y: 0.0 },
        "bottom-left": { x: -0.25, y: 0.25 },
        "bottom-right": { x: 0.25, y: 0.25 }
      };

      const mockState = {
        scenario: cfg.scenario,
        targetZone: cfg.targetZone,
        reliability: cfg.gazeReliability,
        rmse: cfg.residualRmse,
        latencyMs: cfg.turnLatencyMs,
        modelsClosed: 0,
        tracksStopped: 0,
        localMemoryZeroed: false,
        zdrPurged: false,
        bargeInTriggered: false,
        videoTracks: [] as any[],
        audioTracks: [] as any[],
        calibrationStep: 0,
        calibrationStartTime: performance.now(),

        generateLandmarks(now: number) {
          if (mockState.scenario === "camera-disconnected" || mockState.scenario === "permission-denied" || mockState.scenario === "low-light") {
            return { faceLandmarks: [] };
          }

          // 468 base facial landmarks + 10 iris landmarks (468..477)
          const landmarks: Array<{ x: number; y: number; z: number }> = [];
          for (let i = 0; i < 480; i++) {
            landmarks.push({ x: 0.5, y: 0.5, z: 0.0 });
          }

          // Key eye corner landmarks:
          // Left eye: 33 (outer), 133 (inner)
          // Right eye: 362 (inner), 263 (outer)
          landmarks[33] = { x: 0.35, y: 0.45, z: 0 };
          landmarks[133] = { x: 0.45, y: 0.45, z: 0 };
          landmarks[362] = { x: 0.55, y: 0.45, z: 0 };
          landmarks[263] = { x: 0.65, y: 0.45, z: 0 };

          // Determine current iris offset
          let offset = { x: 0.0, y: 0.0 };

          if (mockState.scenario === "collinear-degenerate-anchors") {
            // Degenerate collinear points: iris never moves
            offset = { x: 0.0, y: 0.0 };
          } else {
            // Check if ember is currently active in the DOM during attunement
            const ember = typeof document !== "undefined"
              ? (document.querySelector(".attunement-ember") as HTMLElement | null)
              : null;
            if (ember) {
              const ex = parseFloat(ember.style.left) / 100;
              const ey = parseFloat(ember.style.top) / 100;
              // Ember target (anchor) is at (ex, ey) in normalized stage coords.
              // Iris offset = (ex - 0.5, ey - 0.5) so that linear mapping 0.5 + iris = anchor
              offset = { x: ex - 0.5, y: ey - 0.5 };
            } else {
              // Think phase or post-calibration tracking: fixate on targetZone
              offset = ZONE_IRIS_OFFSETS[mockState.targetZone] || { x: -0.25, y: -0.25 };
            }
          }

          // Apply jitter or noise
          const noiseX = (Math.random() - 0.5) * 0.002;
          const noiseY = (Math.random() - 0.5) * 0.002;
          const leftWidth = 0.10;
          const rightWidth = 0.10;

          const leftCenter = { x: 0.40, y: 0.45 };
          const rightCenter = { x: 0.60, y: 0.45 };

          const leftIrisX = leftCenter.x + (offset.x + noiseX) * leftWidth;
          const leftIrisY = leftCenter.y + (offset.y + noiseY) * leftWidth;
          const rightIrisX = rightCenter.x + (offset.x + noiseX) * rightWidth;
          const rightIrisY = rightCenter.y + (offset.y + noiseY) * rightWidth;

          // Set iris landmarks (468..472 left, 473..477 right)
          for (let i = 468; i <= 472; i++) {
            landmarks[i] = { x: leftIrisX, y: leftIrisY, z: -0.02 };
          }
          for (let i = 473; i <= 477; i++) {
            landmarks[i] = { x: rightIrisX, y: rightIrisY, z: -0.02 };
          }

          // Simulate head motion if requested
          if (mockState.scenario === "head-motion-excessive") {
            landmarks[1] = { x: 0.75, y: 0.5, z: 0.2 }; // Nose tip displaced indicating > 15 deg yaw
          }

          return { faceLandmarks: [landmarks] };
        }
      };

      (window as any).__LOKI_MOCK_HARDWARE__ = mockState;

      // Mock navigator.mediaDevices.getUserMedia
      if (navigator.mediaDevices) {
        navigator.mediaDevices.getUserMedia = async (constraints) => {
          if (mockState.scenario === "permission-denied") {
            throw new DOMException("Simulated user permission denied", "NotAllowedError");
          }

          const tracks: any[] = [];
          if (constraints && (constraints as any).video) {
            const videoTrack = new EventTarget() as any;
            videoTrack.kind = "video";
            videoTrack.enabled = true;
            videoTrack.readyState = "live";
            videoTrack.stop = () => {
              videoTrack.readyState = "ended";
              mockState.tracksStopped += 1;
              videoTrack.dispatchEvent(new Event("ended"));
            };
            mockState.videoTracks.push(videoTrack);
            tracks.push(videoTrack);
          }

          if (constraints && (constraints as any).audio) {
            const audioTrack = new EventTarget() as any;
            audioTrack.kind = "audio";
            audioTrack.enabled = true;
            audioTrack.readyState = "live";
            audioTrack.stop = () => {
              audioTrack.readyState = "ended";
              mockState.tracksStopped += 1;
              audioTrack.dispatchEvent(new Event("ended"));
            };
            mockState.audioTracks.push(audioTrack);
            tracks.push(audioTrack);
          }

          return {
            getTracks: () => tracks,
            getVideoTracks: () => tracks.filter((t) => t.kind === "video"),
            getAudioTracks: () => tracks.filter((t) => t.kind === "audio"),
            addEventListener: () => {},
            removeEventListener: () => {}
          } as any;
        };
      }

      // Mock HTMLMediaElement playback
      Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
        configurable: true,
        get() {
          return this._mockSrcObject || null;
        },
        set(stream) {
          this._mockSrcObject = stream;
        }
      });
      Object.defineProperty(HTMLMediaElement.prototype, "readyState", {
        configurable: true,
        get() {
          return this._mockSrcObject ? 4 : 0;
        }
      });
      Object.defineProperty(HTMLMediaElement.prototype, "videoWidth", {
        configurable: true,
        get() {
          return this._mockSrcObject ? 640 : 0;
        }
      });
      Object.defineProperty(HTMLMediaElement.prototype, "videoHeight", {
        configurable: true,
        get() {
          return this._mockSrcObject ? 480 : 0;
        }
      });
      Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
        configurable: true,
        get() {
          return performance.now() / 1000;
        }
      });

      const origPlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        if (mockState.scenario === "camera-disconnected") {
          return Promise.reject(new DOMException("Playback rejected: camera disconnected", "AbortError"));
        }
        return Promise.resolve();
      };

      // Mock MediaRecorder and OfflineAudioContext for headless test environments
      if (typeof window !== "undefined") {
        window.MediaRecorder = class MockMediaRecorder extends EventTarget {
          stream: any;
          onstop: any;
          ondataavailable: any;
          constructor(stream: any) {
            super();
            this.stream = stream;
          }
          start() {
            setTimeout(() => {
              const blob = new Blob([new Uint8Array(100)], { type: "audio/webm" });
              if (typeof this.ondataavailable === "function") {
                this.ondataavailable({ data: blob });
              }
              this.dispatchEvent(new MessageEvent("dataavailable", { data: blob } as any));
            }, 30);
          }
          stop() {
            setTimeout(() => {
              if (typeof this.onstop === "function") {
                this.onstop(new Event("stop"));
              }
              this.dispatchEvent(new Event("stop"));
            }, 10);
          }
          static isTypeSupported() { return true; }
        } as any;

        window.OfflineAudioContext = class MockOfflineAudioContext {
          decodeAudioData() {
            return Promise.resolve({
              sampleRate: 16000,
              getChannelData: () => {
                const pcm = new Float32Array(16000);
                for (let i = 0; i < pcm.length; i++) pcm[i] = 0.1 * Math.sin(i / 10);
                return pcm;
              }
            });
          }
        } as any;
      }

      // Instrument FORGET MY VOICE and ZDR memory purge detection
      window.addEventListener("loki:zdr-purge", () => {
        mockState.zdrPurged = true;
        mockState.localMemoryZeroed = true;
      });
    },
    { scenario, targetZone, gazeReliability, residualRmse, turnLatencyMs }
  );

  return {
    async setScenario(scen: HardwareMockScenario) {
      await page.evaluate((s) => {
        if ((window as any).__LOKI_MOCK_HARDWARE__) {
          (window as any).__LOKI_MOCK_HARDWARE__.scenario = s;
        }
      }, scen);
    },
    async setTargetZone(zone: string) {
      await page.evaluate((z) => {
        if ((window as any).__LOKI_MOCK_HARDWARE__) {
          (window as any).__LOKI_MOCK_HARDWARE__.targetZone = z;
        }
      }, zone);
    },
    async triggerBargeIn() {
      await page.evaluate(() => {
        if ((window as any).__LOKI_MOCK_HARDWARE__) {
          (window as any).__LOKI_MOCK_HARDWARE__.bargeInTriggered = true;
          window.dispatchEvent(new CustomEvent("loki:barge-in"));
        }
      });
    },
    async disconnectCamera() {
      await page.evaluate(() => {
        const hw = (window as any).__LOKI_MOCK_HARDWARE__;
        if (hw && hw.videoTracks) {
          hw.videoTracks.forEach((t: any) => t.stop());
        }
      });
    },
    async getZdrStatus() {
      return page.evaluate(() => {
        const hw = (window as any).__LOKI_MOCK_HARDWARE__;
        return {
          purged: Boolean(hw?.zdrPurged),
          localMemoryZeroed: Boolean(hw?.localMemoryZeroed),
          tracksStopped: hw?.tracksStopped ?? 0
        };
      });
    }
  };
}

export async function enterObservatoryWithSensors(page: Page, effectId?: string): Promise<void> {
  await page.getByText("I understand this is a", { exact: false }).click();
  if (effectId) {
    await page.getByRole("radio", { name: effectId }).check().catch(() => {});
  }
  await page.getByText("Sensor-enabled performance").click();
  await page.getByText("I allow the camera for presence only", { exact: false }).click();
  await page.getByText("I allow the microphone for answering by voice", { exact: false }).click();
  await page.getByText("I allow a voice enrollment", { exact: false }).click();
  await page.getByRole("button", { name: "Enter with camera + mic" }).click();

  const enrollBtn = page.getByRole("button", { name: "Enroll my voice" });
  await enrollBtn.waitFor({ state: "visible", timeout: 15000 });
  await enrollBtn.click();

  // Wait for voice setup overlay to complete and stage to mount
  await page.locator("canvas, .flat-stage, .silent-choice-list").first().waitFor({ state: "visible", timeout: 20000 });
}
