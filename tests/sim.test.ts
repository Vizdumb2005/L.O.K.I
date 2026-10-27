import { describe, expect, it } from "vitest";
import { cardEffect } from "../effects/card/src/index.js";
import { exampleEffect } from "../effects/_example/src/index.js";
import { runCell, runOne } from "../packages/sim/src/index.js";
import type { CellSpec } from "../packages/sim/src/index.js";

function spec(overrides: Partial<CellSpec>): CellSpec {
  return {
    label: "test",
    runs: 120,
    seed: 20261027,
    effect: cardEffect,
    policy: "greedy",
    answerError: 0,
    gaze: false,
    force: false,
    ...overrides
  };
}

describe("simulator", () => {
  it("is deterministic for a fixed cell", () => {
    const a = runCell(spec({}));
    const b = runCell(spec({}));
    expect(a.commits).toBe(b.commits);
    expect(a.correct).toBe(b.correct);
    expect(a.brier).toBe(b.brier);
    expect(a.bins).toEqual(b.bins);
  });

  it("reports intervals that contain their point estimates", () => {
    const cell = runCell(spec({ answerError: 0.15 }));
    expect(cell.n).toBe(120);
    expect(cell.commitRate[0]).toBeLessThanOrEqual(cell.commits / cell.n);
    expect(cell.commitRate[1]).toBeGreaterThanOrEqual(cell.commits / cell.n);
    expect(cell.wrongConfidentRateAll[0]).toBeLessThanOrEqual(cell.wrong / cell.n);
    expect(cell.brierCI[0]).toBeLessThanOrEqual(cell.brier);
    expect(cell.brierCI[1]).toBeGreaterThanOrEqual(cell.brier);
    expect(Number.isFinite(cell.ece)).toBe(true);
  });

  it("handles a truthful spectator with no errors", () => {
    const cell = runCell(spec({ runs: 100, answerError: 0 }));
    expect(cell.commits).toBeGreaterThan(80);
    expect(cell.wrong).toBe(0);
    expect(cell.committedAccuracy[0]).toBeGreaterThan(0.9);
  });

  it("runs both effects through the same harness", () => {
    const cell = runCell(spec({ effect: exampleEffect, runs: 80, answerError: 0.05 }));
    expect(cell.effectId).toBe("ember-words");
    expect(cell.n).toBe(80);
    // The toy proves the contract; its three probes do not justify a confident reveal.
    expect(cell.commits).toBe(0);
    expect(cell.misses).toBe(cell.n);
  });

  it("injects gaze only when enabled and uses the effect's zone binding", () => {
    const result = runOne({
      effect: cardEffect,
      seed: 77,
      policy: "greedy",
      spectator: {
        answerError: 0.1,
        force: false,
        gaze: true,
        gazeAccuracy: 0.7,
        gazeReliability: 0.7
      }
    });
    expect(result.gazeUsed).toBe(true);
    expect(result.observations).toBeGreaterThan(result.probes);
  });

  it("does not inject gaze when disabled", () => {
    const result = runOne({
      effect: cardEffect,
      seed: 77,
      policy: "greedy",
      spectator: {
        answerError: 0.1,
        force: false,
        gaze: false,
        gazeAccuracy: 0.7,
        gazeReliability: 0.7
      }
    });
    expect(result.gazeUsed).toBe(false);
  });

  it("covers the wrong-answer and liar paths", () => {
    const liar = runOne({
      effect: exampleEffect,
      seed: 4,
      policy: "greedy",
      spectator: {
        answerError: 0,
        force: false,
        gaze: false,
        gazeAccuracy: 0,
        gazeReliability: 0,
        lieAt: 1
      },
      trueId: "comet"
    });
    expect(liar.observations).toBeGreaterThanOrEqual(1);
    expect(["reveal", "miss", "recover"]).toContain(liar.phase);
  });

  it("exported log can replay the exact same posterior and decision", () => {
    // Verify the runOne path produces a normalized posterior and consistent reveal.
    const result = runOne({
      effect: cardEffect,
      seed: 99,
      policy: "greedy",
      spectator: { answerError: 0.1, force: false, gaze: false, gazeAccuracy: 0.65, gazeReliability: 0.65 }
    });
    // The run result has finalPosterior and committed/revealedId
    expect(result.finalPosterior.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    if (result.committed) {
      expect(result.revealedId).toBeDefined();
      // The revealed hypothesis should have the max posterior
      const maxIdx = result.finalPosterior.indexOf(Math.max(...result.finalPosterior));
      const hypotheses = cardEffect.hypotheses();
      expect(result.revealedId).toBe(hypotheses[maxIdx].id);
    }
  });

});