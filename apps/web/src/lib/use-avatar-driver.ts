import { useEffect, useRef, useState } from "react";
import type { VisemeState, HeadPose } from "../components/avatar-types.js";
import { extractHeadPose, type LandmarkPoint } from "./head-pose.js";

function clamp(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.max(min, Math.min(max, val));
}

/**
 * Computes phoneme viseme states from FFT frequency bins and acoustic RMS power.
 * Pure mathematical function for deterministic testing and real-time execution.
 */
export function computeVisemesFromFft(
  fftData: Float32Array | Uint8Array,
  sampleRate: number,
  rms: number
): VisemeState {
  const noiseFloor = 0.015;
  const ceiling = 0.22;

  if (!Number.isFinite(rms) || rms <= noiseFloor) {
    return { jawOpen: 0, mouthWide: 0, mouthRound: 0 };
  }

  const rmsNorm = clamp((rms - noiseFloor) / (ceiling - noiseFloor), 0, 1);
  const nBins = fftData.length;
  const binWidth = sampleRate / (nBins * 2);

  let eLow = 0;
  let eMid = 0;
  let eHigh = 0;
  let eTotal = 0;

  for (let i = 0; i < nBins; i++) {
    const freq = i * binWidth;
    let power = fftData[i] ?? 0;
    if (!Number.isFinite(power)) continue;
    if (power < 0) power = Math.pow(10, power / 20); // convert dB to linear if Float32Array in dB
    if (!Number.isFinite(power) || power < 0) continue;

    if (freq >= 80 && freq <= 8000) eTotal += power;
    if (freq >= 200 && freq <= 800) eLow += power;
    if (freq >= 800 && freq <= 2400) eMid += power;
    if (freq >= 2400 && freq <= 4500) eHigh += power;
  }

  const rhoLow = eLow / (eTotal + 1e-6);
  const rhoHigh = eHigh / (eTotal + 1e-6);
  const gammaRound = eMid / (eMid + eHigh + 1e-6);

  const rawJawOpen = rmsNorm * (0.65 + 0.35 * clamp(rhoLow * 1.5, 0, 1));
  const rawMouthWide = clamp((rhoHigh - 0.12) * 2.8, 0, 1) * Math.min(1, rmsNorm * 2.5);
  const rawMouthRound =
    clamp((gammaRound - 0.5) * 2.4, 0, 1) *
    (1.0 - 0.5 * rawMouthWide) *
    Math.min(1, rmsNorm * 2.5);

  const jawOpen = clamp(rawJawOpen, 0, 1);
  const mouthWide = clamp(rawMouthWide, 0, 1);
  const mouthRound = clamp(rawMouthRound, 0, 1);

  return {
    jawOpen: Number.isFinite(jawOpen) ? jawOpen : 0,
    mouthWide: Number.isFinite(mouthWide) ? mouthWide : 0,
    mouthRound: Number.isFinite(mouthRound) ? mouthRound : 0
  };
}

/**
 * Synthetic phonetic viseme generator for offline patter cues.
 * Generates natural 4.2 Hz syllabic speech oscillations synchronized with text delivery.
 */
export class SynthVisemeDriver {
  private active = false;
  private startTime = 0;

  start(startTime?: number): void {
    this.active = true;
    this.startTime = startTime ?? performance.now() / 1000;
  }

  stop(): void {
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  sample(timeSec?: number): { rms: number; visemes: VisemeState } {
    if (!this.active) {
      return { rms: 0, visemes: { jawOpen: 0, mouthWide: 0, mouthRound: 0 } };
    }

    const elapsed =
      timeSec != null
        ? timeSec >= this.startTime
          ? timeSec - this.startTime
          : Math.max(0, timeSec)
        : Math.max(0, performance.now() / 1000 - this.startTime);
    const syllablePhase = elapsed * 4.2 * Math.PI * 2;
    const vowelCycle = Math.max(0, Math.sin(syllablePhase));

    const rms = 0.22 + 0.18 * vowelCycle;
    const jawOpen = 0.25 + 0.55 * vowelCycle;
    const mouthWide = 0.15 + 0.40 * Math.max(0, Math.sin(syllablePhase + 1.2));
    const mouthRound = 0.10 + 0.35 * Math.max(0, Math.cos(syllablePhase + 2.1));

    return {
      rms,
      visemes: { jawOpen, mouthWide, mouthRound }
    };
  }
}

export interface AvatarDriverOptions {
  /** True when a patter cue is actively delivering or pending acknowledgement */
  cuePending?: boolean;
  /** Spoken patter text line */
  line?: string;
  /** Audio media stream if active microphone is connected */
  audioStream?: MediaStream | null;
  /** Facial landmarks from MediaPipe */
  landmarks?: LandmarkPoint[] | null;
  /** True when spectator gaze locks */
  gazeLocked?: boolean;
  /** Reduced motion accessibility preference */
  reducedMotion?: boolean;
}

export interface AvatarDriverState {
  audioRms: number;
  visemes: VisemeState;
  headPose: HeadPose;
  gazeLocked: boolean;
  speaking: boolean;
}

/**
 * Hook connecting Web Audio AnalyserNode (when audio present) + MediaPipe head pose
 * + SynthVisemeDriver (during patter cues) to provide live avatar driver properties.
 */
export function useAvatarDriver(options: AvatarDriverOptions): AvatarDriverState {
  const [driverState, setDriverState] = useState<AvatarDriverState>({
    audioRms: 0,
    visemes: { jawOpen: 0, mouthWide: 0, mouthRound: 0 },
    headPose: { yaw: 0, pitch: 0, roll: 0, screenX: 0, screenY: 0 },
    gazeLocked: false,
    speaking: false
  });

  const synthRef = useRef<SynthVisemeDriver>(new SynthVisemeDriver());
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lineSpeakingRef = useRef(false);

  // Synchronize synthetic viseme driver with cue delivery and spoken lines
  useEffect(() => {
    if (options.cuePending) {
      synthRef.current.start();
    } else if (!lineSpeakingRef.current) {
      synthRef.current.stop();
    }
  }, [options.cuePending]);

  const lastLineRef = useRef("");
  useEffect(() => {
    const line = options.line?.trim() ?? "";
    if (line && line !== lastLineRef.current && !options.reducedMotion) {
      lastLineRef.current = line;
      lineSpeakingRef.current = true;
      synthRef.current.start();
      const durationMs = Math.max(1500, Math.min(5000, line.length * 55));
      const timer = window.setTimeout(() => {
        lineSpeakingRef.current = false;
        if (!options.cuePending) {
          synthRef.current.stop();
        }
      }, durationMs);
      return () => window.clearTimeout(timer);
    }
  }, [options.line, options.reducedMotion, options.cuePending]);

  // Connect Web Audio stream if present
  useEffect(() => {
    if (!options.audioStream) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(options.audioStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      audioContextRef.current = ctx;
      analyserRef.current = analyser;
    } catch {
      // Audio context restricted or unavailable; will fallback to synthetic driver
    }

    return () => {
      audioContextRef.current?.close().catch(() => {});
      analyserRef.current = null;
      audioContextRef.current = null;
    };
  }, [options.audioStream]);

  // Frame tick loop
  useEffect(() => {
    let animId = 0;
    const fftBuffer = new Float32Array(256);

    const tick = () => {
      const reduced = Boolean(options.reducedMotion);
      const pose = extractHeadPose(options.landmarks, reduced);

      let rms = 0;
      let visemes: VisemeState = { jawOpen: 0, mouthWide: 0, mouthRound: 0 };
      let speaking = false;

      if (analyserRef.current && audioContextRef.current) {
        analyserRef.current.getFloatFrequencyData(fftBuffer);
        // Estimate RMS from frequency data
        let sum = 0;
        let validBins = 0;
        for (let i = 0; i < fftBuffer.length; i++) {
          const val = fftBuffer[i];
          if (val != null && Number.isFinite(val)) {
            const linear = Math.pow(10, val / 20);
            if (Number.isFinite(linear)) {
              sum += linear * linear;
              validBins++;
            }
          }
        }
        rms = validBins > 0 ? Math.sqrt(sum / validBins) : 0;
        if (!Number.isFinite(rms)) rms = 0;
        if (rms > 0.02) {
          visemes = computeVisemesFromFft(fftBuffer, audioContextRef.current.sampleRate, rms);
          speaking = true;
        }
      }

      // If no live microphone input, check synthetic patter driver
      if (!speaking && synthRef.current.isActive()) {
        const synth = synthRef.current.sample();
        rms = synth.rms;
        visemes = synth.visemes;
        speaking = true;
      }

      setDriverState({
        audioRms: rms,
        visemes,
        headPose: pose,
        gazeLocked: Boolean(options.gazeLocked),
        speaking
      });

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [options.landmarks, options.gazeLocked, options.reducedMotion]);

  return driverState;
}
