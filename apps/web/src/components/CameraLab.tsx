import { useCallback, useEffect, useRef, useState } from "react";
import { DirectionLabel, PointSmoother, ScalarSmoother, StableLatch } from "./camera-lab-smoothing.js";

type Landmark = { x: number; y: number; z: number };
interface FaceLandmarkerLike {
  detectForVideo(video: HTMLVideoElement, timestamp: number): { faceLandmarks: Landmark[][] };
  close(): void;
}

type ModelState = "idle" | "loading" | "ready" | "unavailable";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";

async function createFaceLandmarker(): Promise<{
  landmarker: FaceLandmarkerLike;
  source: "local" | "cdn";
}> {
  const vision = await import("@mediapipe/tasks-vision");
  const attempts = [
    {
      source: "local" as const,
      wasm: "/mediapipe/wasm",
      model: "/mediapipe/face_landmarker.task"
    },
    { source: "cdn" as const, wasm: WASM_CDN, model: MODEL_URL }
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
      return { landmarker: landmarker as unknown as FaceLandmarkerLike, source: attempt.source };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

interface Diagnostics {
  face: boolean;
  brightness: number;
  eyeSignal: string;
  frames: number;
  fps: number;
}

const initialDiagnostics: Diagnostics = {
  face: false,
  brightness: 0,
  eyeSignal: "no signal",
  frames: 0,
  fps: 0
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

function average(points: Landmark[]): Landmark {
  const sum = points.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y, z: acc.z + point.z }),
    { x: 0, y: 0, z: 0 }
  );
  return { x: sum.x / points.length, y: sum.y / points.length, z: sum.z / points.length };
}

interface CameraLabProps {
  cameraOptIn: boolean;
  onBack: () => void;
  onReviewConsent: () => void;
}

export function CameraLab({ cameraOptIn, onBack, onReviewConsent }: CameraLabProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarkerLike | null>(null);
  const rafRef = useRef(0);
  const lastDetectRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);
  const frameCounterRef = useRef({ count: 0, since: performance.now() });
  const aliveRef = useRef(true);
  const generationRef = useRef(0);
  const startingRef = useRef(false);

  const [cameraOn, setCameraOn] = useState(false);
  const [starting, setStarting] = useState(false);
  const [modelState, setModelState] = useState<ModelState>("idle");
  const [modelSource, setModelSource] = useState<"local" | "cdn" | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostics>(initialDiagnostics);
  const [error, setError] = useState<string | null>(null);
  const [glasses, setGlasses] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const stabilizersRef = useRef({
    marker: new PointSmoother(120, 500),
    brightness: new ScalarSmoother(250),
    face: new StableLatch(2, 12),
    direction: new DirectionLabel(0.06),
    lastTextUpdate: 0,
    lastBrightnessAt: 0
  });

  const stop = useCallback(() => {
    generationRef.current += 1;
    startingRef.current = false;
    setStarting(false);
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    landmarkerRef.current?.close();
    landmarkerRef.current = null;
    setCameraOn(false);
    setDiagnostics(initialDiagnostics);
    setModelState("idle");
    setModelSource(null);
    const stabilizers = stabilizersRef.current;
    stabilizers.marker.reset();
    stabilizers.brightness.reset();
    stabilizers.face.reset();
    stabilizers.direction.reset();
    stabilizers.lastTextUpdate = 0;
    stabilizers.lastBrightnessAt = 0;
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      generationRef.current += 1;
      startingRef.current = false;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      landmarkerRef.current?.close();
    };
  }, []);

  const start = useCallback(async () => {
    if (!cameraOptIn || startingRef.current || streamRef.current) return;
    const generation = ++generationRef.current;
    const current = () => aliveRef.current && generationRef.current === generation;
    startingRef.current = true;
    setStarting(true);
    setError(null);
    setModelState("loading");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser does not expose a camera API.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      // If the component unmounted while getUserMedia was pending, release the stream.
      if (!current()) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      setCameraOn(true);
      // If a track ends externally (e.g. camera unplugged), stop the lab cleanly.
      stream.getTracks().forEach((track) => {
        track.addEventListener("ended", () => { if (current()) stop(); });
      });
      const video = videoRef.current;
      if (!video) throw new Error("The preview element is missing.");
      video.srcObject = stream;
      await video.play();
      // Stop, navigation and a newer attempt all invalidate this continuation.
      if (!current()) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      try {
        const loaded = await createFaceLandmarker();
        if (!current()) {
          loaded.landmarker.close();
          return;
        }
        landmarkerRef.current = loaded.landmarker;
        setModelSource(loaded.source);
        setModelState("ready");
      } catch {
        if (current()) setModelState("unavailable");
      }

      if (!current()) return;
      startingRef.current = false;
      setStarting(false);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const draw = () => {
        if (!current()) return;
        const currentVideo = videoRef.current;
        if (!currentVideo || currentVideo.readyState < 2) {
          rafRef.current = requestAnimationFrame(draw);
          return;
        }
        const width = canvas.width;
        const height = canvas.height;
        ctx.save();
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(currentVideo, 0, 0, width, height);
        ctx.restore();

        const now = performance.now();
        const counter = frameCounterRef.current;
        counter.count += 1;
        const fps = counter.count / Math.max(0.5, (now - counter.since) / 1000);
        if (now - counter.since > 1000) {
          frameCounterRef.current = { count: 0, since: now };
        }

        if (
          landmarkerRef.current &&
          currentVideo.currentTime !== lastVideoTimeRef.current &&
          now - lastDetectRef.current > 70
        ) {
          lastVideoTimeRef.current = currentVideo.currentTime;
          lastDetectRef.current = now;
          const stabilizers = stabilizersRef.current;
          const result = landmarkerRef.current.detectForVideo(currentVideo, now);
          const landmarks = result.faceLandmarks[0];
          const faceRaw = !!(landmarks && landmarks.length > 400);
          // Stable display state: brief detection dropouts never flip the UI.
          const faceStable = stabilizers.face.update(faceRaw);
          let eyeText = faceStable ? "no iris" : "no face";
          let luma: number | null = null;
          if (faceRaw && landmarks) {
            drawLandmarks(ctx, landmarks, width, height);
            const iris = irisOffset(landmarks);
            const marker = stabilizers.marker.update(
              iris ? { x: clamp01(0.5 + iris.x * 1.1) * width, y: clamp01(0.5 + iris.y * 1.9) * height } : null,
              now
            );
            if (iris) eyeText = stabilizers.direction.update(iris);
            if (marker) {
              ctx.strokeStyle = "rgba(216, 184, 119, 0.95)";
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.arc(marker.x, marker.y, 15, 0, Math.PI * 2);
              ctx.stroke();
              ctx.beginPath();
              ctx.moveTo(marker.x - 23, marker.y);
              ctx.lineTo(marker.x + 23, marker.y);
              ctx.moveTo(marker.x, marker.y - 23);
              ctx.lineTo(marker.x, marker.y + 23);
              ctx.stroke();
              ctx.fillStyle = "rgba(7, 17, 15, 0.75)";
              ctx.fillRect(12, height - 34, 236, 22);
              ctx.fillStyle = "#d8b877";
              ctx.font = "11px 'Courier New', monospace";
              ctx.fillText("RAW IRIS SIGNAL · UNCALIBRATED", 20, height - 19);
            }
            luma = stabilizers.brightness.update(
              brightnessOf(ctx, width, height),
              now,
              stabilizers.lastBrightnessAt
            );
            stabilizers.lastBrightnessAt = now;
          } else {
            stabilizers.marker.update(null, now);
          }
          // The overlay appears only for a sustained loss, not single-frame misses.
          if (!faceStable) {
            ctx.fillStyle = "rgba(7, 17, 15, 0.72)";
            ctx.fillRect(width / 2 - 120, 16, 240, 34);
            ctx.fillStyle = "#e8dfcc";
            ctx.font = "13px 'Courier New', monospace";
            ctx.textAlign = "center";
            ctx.fillText("NO FACE IN FRAME", width / 2, 38);
            ctx.textAlign = "left";
          }
          // Text readouts are throttled: steady values, not a per-frame ticker.
          if (now - stabilizers.lastTextUpdate >= 500) {
            stabilizers.lastTextUpdate = now;
            setDiagnostics((previous) => ({
              ...previous,
              face: faceStable,
              brightness: luma ?? previous.brightness,
              eyeSignal: eyeText,
              frames: previous.frames + 1,
              fps: Math.round(fps)
            }));
          }
        }

        rafRef.current = requestAnimationFrame(draw);
      };
      rafRef.current = requestAnimationFrame(draw);
    } catch (cause) {
      if (!current()) return;
      stop();
      setError(
        cause instanceof Error
          ? `${cause.message} The camera is optional; the show works without it.`
          : "The camera could not be opened. The show works without it."
      );
    }
  }, [cameraOptIn, stop]);

  return (
    <main className="lab" id="main">
      <section className="lab-head">
        <div>
          <p className="eyebrow">Experimental · never used by the show</p>
          <h1>Camera lab</h1>
        </div>
        <div className="top-actions">
          <button type="button" className="chip" onClick={onBack}>
            Back to the show
          </button>
        </div>
      </section>

      <section className="lab-intro">
        <p>
          This room exists to measure whether a browser camera could ever support gaze
          evidence. It is not part of the performance. The show gate is <strong>closed</strong>:
          no camera signal is sent to the belief engine, and no calibration has been
          validated with people.
        </p>
        <p className="fine-print">
          Frames are processed in this tab only. Nothing is recorded, uploaded, or saved.
          The indicator stays visible while the camera is open. Stopping or leaving releases
          the stream immediately.
        </p>
      </section>

      {!cameraOptIn ? (
        <section className="lab-blocked">
          <p className="eyebrow">Consent gate</p>
          <h2>Camera access was not opted in.</h2>
          <p>
            The show never opens the camera. The lab is optional and requires explicit
            consent on the opening screen.
          </p>
          <button type="button" className="primary" onClick={onReviewConsent}>
            Review consent
          </button>
        </section>
      ) : (
        <div className="lab-grid">
          <section className="camera-frame" aria-label="Local camera preview">
            <video ref={videoRef} playsInline muted className="camera-video" />
            <canvas ref={canvasRef} width={640} height={480} className="camera-canvas" />
            {!cameraOn && (
              <div className="camera-placeholder">
                <span className="lens" aria-hidden="true" />
                <p>Camera is off.</p>
                <p className="tiny">Nothing is captured until you choose to open it.</p>
                <button type="button" className="primary" disabled={starting} onClick={() => void start()}>
                  {starting ? "Opening camera…" : "Open camera lab"}
                </button>
                {starting && <button type="button" className="chip" onClick={stop}>Cancel opening</button>}
              </div>
            )}
            {cameraOn && (
              <>
                <div className="camera-live">
                  <span className="live-dot" /> CAMERA ON · LOCAL ONLY
                </div>
                <button type="button" className="camera-stop" onClick={stop}>
                  Stop camera
                </button>
              </>
            )}
          </section>

          <aside className="lab-side" aria-label="Camera diagnostics">
            <button
              type="button"
              className="chip"
              aria-expanded={showDiagnostics}
              onClick={() => setShowDiagnostics((open) => !open)}
            >
              {showDiagnostics ? "Hide developer diagnostics" : "Show developer diagnostics"}
            </button>
            {showDiagnostics && (
            <div className={`status-card ${cameraOn ? "is-live" : ""}`}>
              <p className="eyebrow">Signal</p>
              <dl>
                <div>
                  <dt>Camera</dt>
                  <dd>{cameraOn ? "open" : "closed"}</dd>
                </div>
                <div>
                  <dt>Face</dt>
                  <dd>{diagnostics.face ? "detected" : "—"}</dd>
                </div>
                <div>
                  <dt>Light</dt>
                  <dd>{cameraOn ? `${Math.round(diagnostics.brightness * 100)}% luma` : "—"}</dd>
                </div>
                <div>
                  <dt>Raw iris</dt>
                  <dd>{cameraOn ? diagnostics.eyeSignal : "—"}</dd>
                </div>
                <div>
                  <dt>Frames</dt>
                  <dd>{cameraOn ? `${diagnostics.frames} · ${diagnostics.fps} fps` : "0"}</dd>
                </div>
              </dl>
            </div>
            )}

            <div className="gate-card">
              <p className="eyebrow">Show gate</p>
              <p className="gate-state">CLOSED</p>
              <p>
                No calibration baseline, no human validation, and no item-level accuracy
                claim. MediaPipe iris landmarks are not a gaze ground truth. The show uses
                answers only.
              </p>
              <label className="check check-compact">
                <input
                  type="checkbox"
                  checked={glasses}
                  onChange={(event) => setGlasses(event.target.checked)}
                />
                <span>I am wearing glasses (a known confidence risk).</span>
              </label>
              <p className="tiny">
                {modelState === "loading" && "Loading the local vision model…"}
                {modelState === "ready" &&
                  (glasses
                    ? `Vision model ready (${modelSource === "local" ? "local assets" : "CDN fallback"}). Glasses flagged; reliability would be reduced.`
                    : `Vision model ready (${modelSource === "local" ? "local assets" : "CDN fallback"}). Diagnostics only; gate still closed.`)}
                {modelState === "unavailable" &&
                  "Vision model or CDN unavailable. The preview still works; no gaze estimate is made."}
                {modelState === "idle" && "Vision model loads only when the camera opens."}
              </p>
            </div>

            {error && <p className="error" role="alert">{error}</p>}
          </aside>
        </div>
      )}

      <footer className="lab-footer">
        <a href="https://www.mediapipe.dev/" target="_blank" rel="noreferrer">
          MediaPipe Face Landmarker
        </a>
        <span>·</span>
        <span>Model assets are fetched from a public CDN only when the lab opens.</span>
        <span>·</span>
        <span>No image leaves this tab.</span>
      </footer>
    </main>
  );
}

function drawLandmarks(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  width: number,
  height: number
): void {
  const indices = [
    33, 133, 159, 145, 362, 263, 386, 374, 468, 469, 470, 471, 472, 473, 474, 475, 476, 477
  ];
  ctx.fillStyle = "rgba(123, 190, 172, 0.85)";
  for (const index of indices) {
    const point = landmarks[index];
    if (!point) continue;
    const x = (1 - point.x) * width;
    const y = point.y * height;
    ctx.beginPath();
    ctx.arc(x, y, index >= 468 ? 2.4 : 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Rough, uncalibrated iris displacement from the eye corners. Display only. */
function irisOffset(landmarks: Landmark[]): { x: number; y: number } | null {
  const leftIris = average([468, 469, 470, 471, 472].map((i) => landmarks[i]).filter(Boolean) as Landmark[]);
  const rightIris = average([473, 474, 475, 476, 477].map((i) => landmarks[i]).filter(Boolean) as Landmark[]);
  const leftOuter = landmarks[33];
  const leftInner = landmarks[133];
  const rightInner = landmarks[362];
  const rightOuter = landmarks[263];
  if (!leftOuter || !leftInner || !rightInner || !rightOuter) return null;
  const leftWidth = Math.abs(leftOuter.x - leftInner.x) || 0.05;
  const rightWidth = Math.abs(rightOuter.x - rightInner.x) || 0.05;
  const leftCenter = { x: (leftOuter.x + leftInner.x) / 2, y: (leftOuter.y + leftInner.y) / 2 };
  const rightCenter = { x: (rightOuter.x + rightInner.x) / 2, y: (rightOuter.y + rightInner.y) / 2 };
  const x = ((leftIris.x - leftCenter.x) / leftWidth + (rightIris.x - rightCenter.x) / rightWidth) / 2;
  const y = ((leftIris.y - leftCenter.y) / leftWidth + (rightIris.y - rightCenter.y) / rightWidth) / 2;
  return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
}

function brightnessOf(ctx: CanvasRenderingContext2D, width: number, height: number): number {
  try {
    const data = ctx.getImageData(0, 0, width, height).data;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 64) {
      sum += (data[i]! * 0.2126 + data[i + 1]! * 0.7152 + data[i + 2]! * 0.0722) / 255;
      count += 1;
    }
    return clamp01(sum / Math.max(1, count));
  } catch {
    return 0;
  }
}