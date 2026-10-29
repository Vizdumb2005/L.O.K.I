/**
 * Face presence for the sensor-enabled performance's attune beat.
 *
 * Bounded purpose: "is a face here?" - nothing else. No identity, no gaze,
 * no expression, no card inference. Frames are processed in this tab and
 * discarded immediately; only a boolean survives each check.
 */

type Landmark = { x: number; y: number; z: number };
interface FaceLandmarkerLike {
  detectForVideo(video: HTMLVideoElement, timestamp: number): { faceLandmarks: Landmark[][] };
  close(): void;
}

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";

export interface PresenceDetector {
  /** Run one check; resolves true if a face is visible right now. */
  check(): Promise<boolean>;
  close(): void;
}

export async function createPresenceDetector(video: HTMLVideoElement): Promise<PresenceDetector> {
  const vision = await import("@mediapipe/tasks-vision");
  const attempts = [
    { wasm: "/mediapipe/wasm", model: "/mediapipe/face_landmarker.task" },
    { wasm: WASM_CDN, model: MODEL_URL }
  ];
  let lastError: unknown = new Error("no MediaPipe assets available");
  for (const attempt of attempts) {
    try {
      const fileset = await vision.FilesetResolver.forVisionTasks(attempt.wasm);
      const landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: attempt.model, delegate: "CPU" },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false
      });
      const lm = landmarker as unknown as FaceLandmarkerLike;
      return {
        check: async () => {
          // One frame in, one boolean out. The frame itself is never stored.
          const result = lm.detectForVideo(video, performance.now());
          return Array.isArray(result.faceLandmarks) && result.faceLandmarks.length > 0;
        },
        close: () => lm.close()
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
