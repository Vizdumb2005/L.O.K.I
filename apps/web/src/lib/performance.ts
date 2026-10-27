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

export interface PerformanceState {
  view: SessionView | null;
  error: string | null;
  start: () => void;
  restart: () => void;
  advance: () => void;
  answer: (optionId: string) => void;
  end: () => void;
}

/**
 * One shell around the existing PerformanceSession. The UI does not reach into
 * posterior numbers; it only renders the session's public view, captions and stage.
 */
export function usePerformance(effect: Effect): PerformanceState {
  const sessionRef = useRef<PerformanceSession | null>(null);
  const [view, setView] = useState<SessionView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(() => {
    setError(null);
    try {
      const session = new PerformanceSession(effect, {
        seed: randomSeed(),
        policy: "greedy",
        cameraEnabled: false,
        cameraValidated: false,
        forceEnabled: false,
        now: () => performance.now()
      });
      session.begin();
      sessionRef.current = session;
      setView(session.snapshot());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The session could not begin.");
    }
  }, [effect]);

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

  const end = useCallback(() => {
    sessionRef.current = null;
    setView(null);
  }, []);

  return { view, error, start, restart: start, advance, answer, end };
}
