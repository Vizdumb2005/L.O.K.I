import type { AttunementState } from "../lib/use-attunement-gaze.js";

/**
 * Blueprint v4 §2.2 — the disguised calibration visual.
 *
 * A soft golden ember drifts across the stage anchors during the attune beat.
 * It never looks like a test screen: it is the ritual itself. During the
 * refixation beat the ember rests and the spectator holds their card in the
 * light once more.
 */
export function AttunementOverlay({ state }: { state: AttunementState }) {
  if (state.status === "idle" || state.status === "failed") return null;
  if (!state.anchor && state.status !== "tracking") return null;

  const anchor = state.anchor ?? { x: 0.5, y: 0.35 };
  return (
    <div className="attunement-overlay" aria-hidden="true">
      {state.status === "calibrating" && (
        <>
          <div
            className="attunement-ember"
            style={{ left: `${anchor.x * 100}%`, top: `${anchor.y * 100}%` }}
          />
          <p className="attunement-note">Let your eyes follow the ember as it gathers the light.</p>
        </>
      )}
      {state.status === "tracking" && (
        <p className="attunement-note">
          Hold your card in the light once more - keep it in view.
        </p>
      )}
    </div>
  );
}
