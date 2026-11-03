import { useCallback, useEffect, useRef, useState } from "react";
import type { Effect } from "@loki/effect-api";
import { PerformanceSession, type SessionView } from "@loki/showrunner";

function randomSeed(): number {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0]!;
  }
  return Date.now() >>> 0;
}

export const CALIBRATION_RMSE_MAX = 0.15;

export interface PerformanceGazeValidation {
  usable?: boolean;
}

export interface PerformanceGazeCalibration {
  calibrated?: boolean;
  rmse?: number | null;
}

export interface UsePerformanceOptions {
  gazeQuality?: PerformanceGazeValidation | null;
  gazeCalibration?: PerformanceGazeCalibration | null;
  forceEnabled?: boolean;
}

/**
 * Blueprint §2.2 / R2: The honest gate predicate.
 * Evaluates whether gaze validation and calibration satisfy the honest residual bound.
 */
export function isGazeGateSatisfied(
  quality?: PerformanceGazeValidation | null,
  calibration?: PerformanceGazeCalibration | null
): boolean {
  return Boolean(
    quality?.usable &&
    calibration?.calibrated &&
    (calibration?.rmse == null || calibration.rmse <= CALIBRATION_RMSE_MAX)
  );
}

export interface PerformanceState {
  view: SessionView | null;
  error: string | null;
  start: () => void;
  restart: () => void;
  advance: () => void;
  answer: (optionId: string) => void;
  clearAck: () => void;
  /** Blueprint §2.2: opens the gaze gate after the attunement calibration passes. */
  validateCamera: (
    gazeQuality?: PerformanceGazeValidation | null,
    gazeCalibration?: PerformanceGazeCalibration | null
  ) => void;
  /** Blueprint §2.3: feeds one aggregated gaze window to the session. */
  addGaze: (window: { zone: string; reliability: number }) => void;
  end: () => void;
}

/**
 * One shell around the existing PerformanceSession. The UI does not reach into
 * posterior numbers; it only renders the session's public view, captions and stage.
 */
export function usePerformance(
  effect: Effect,
  presenceEnabled = false,
  options?: UsePerformanceOptions
): PerformanceState {
  const sessionRef = useRef<PerformanceSession | null>(null);
  const [view, setView] = useState<SessionView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(() => {
    setError(null);
    try {
      // Blueprint §2.2 / R2: live check replaces hardcoded false
      const cameraValidated = isGazeGateSatisfied(
        options?.gazeQuality,
        options?.gazeCalibration
      );
      const session = new PerformanceSession(effect, {
        seed: randomSeed(),
        policy: "greedy",
        cameraEnabled: presenceEnabled || cameraValidated,
        cameraValidated,
        presenceEnabled,
        forceEnabled: options?.forceEnabled ?? false,
        now: () => performance.now()
      });
      session.begin();
      sessionRef.current = session;
      setView(session.snapshot());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The session could not begin.");
    }
  }, [
    effect,
    presenceEnabled,
    options?.forceEnabled,
    options?.gazeQuality?.usable,
    options?.gazeCalibration?.calibrated,
    options?.gazeCalibration?.rmse
  ]);

  useEffect(() => {
    start();
    return () => {
      sessionRef.current = null;
    };
  }, [start]);

  const advance = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    try {
      session.advance();
      setView(session.snapshot());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That step is not available.");
    }
  }, []);

  const answer = useCallback((optionId: string) => {
    const session = sessionRef.current;
    if (!session) return;
    try {
      session.answer(optionId);
      setView(session.snapshot());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That answer was not accepted.");
    }
  }, []);

  const clearAck = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    session.clearAck();
    setView(session.snapshot());
  }, []);

  const validateCamera = useCallback(
    (
      gazeQuality?: PerformanceGazeValidation | null,
      gazeCalibration?: PerformanceGazeCalibration | null
    ) => {
      const session = sessionRef.current;
      if (!session) return;
      // Live validation check: if either quality or calibration is provided, gate on both
      if (gazeQuality !== undefined || gazeCalibration !== undefined) {
        if (!isGazeGateSatisfied(gazeQuality, gazeCalibration)) {
          return;
        }
      }
      session.validateCamera();
      setView(session.snapshot());
    },
    []
  );

  const addGaze = useCallback((window: { zone: string; reliability: number }) => {
    const session = sessionRef.current;
    if (!session) return;
    session.addGaze(window);
    setView(session.snapshot());
  }, []);

  const end = useCallback(() => {
    sessionRef.current?.teardown();
    sessionRef.current = null;
    setView(null);
  }, []);

  return { view, error, start, restart: start, advance, answer, clearAck, validateCamera, addGaze, end };
}