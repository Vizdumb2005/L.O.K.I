import { describe, expect, it } from "vitest";
import { cardEffect } from "../src/index.js";
import { PerformanceSession } from "@loki/showrunner";

describe("card session safety", () => {
  it("keeps the invitation explicit, stoppable, and the chosen card private", () => {
    const script = cardEffect.script();
    const invite = script.beats.find((beat) => beat.kind === "invite");
    const think = script.beats.find((beat) => beat.kind === "think");

    expect(invite?.line).toContain("performance of mentalism");
    expect(invite?.line).toContain("illusion, not mind reading");
    expect(invite?.line).toContain("No medical claims.");
    expect(invite?.line).toContain("You can stop whenever you like.");
    expect(think?.line).toContain("Do not say it, click it, or tell me.");
    expect(cardEffect.stage().instructions).toContain("Do not say it, click it, or tell me.");

    const session = new PerformanceSession(cardEffect, { seed: 29 });
    expect(session.snapshot().phase).toBe("invite");
    expect(session.snapshot().camera.active).toBe(false);
    session.consent();
    expect(session.snapshot().phase).toBe("think");
  });

  it("does not activate the camera or apply gaze evidence without validation", () => {
    expect(cardEffect.config.gazeEnabledByDefault).toBe(false);

    const session = new PerformanceSession(cardEffect, {
      seed: 31,
      cameraEnabled: true,
      cameraValidated: false
    });
    session.consent();
    session.chosen();

    expect(session.snapshot().camera).toMatchObject({
      enabled: true,
      validated: false,
      active: false,
      windowsUsed: 0
    });
    const before = session.internal().posterior;
    expect(session.addGaze({ zone: "top-left", reliability: 1, at: 1 })).toBe(false);
    expect(session.internal().posterior).toEqual(before);

    const log = session.exportLog();
    expect(log.camera.validated).toBe(false);
    expect(log.camera.windowsUsed).toBe(0);
    expect(log.observations.some((observation) => observation.channel === "gaze")).toBe(false);
  });

  it("uses direct reveal wording only at the configured confidence threshold", () => {
    const card = cardEffect.hypotheses()[0]!;
    const revealLine = cardEffect.script().revealLine;
    const threshold = cardEffect.config.commitThreshold;

    expect(revealLine(card, threshold)).toBe(`Your card was the ${card.label}.`);
    expect(revealLine(card, threshold - 0.001)).toBe(
      `The card that kept returning was the ${card.label}.`
    );
  });

  it("reports an honest miss without exposing a candidate when confidence stays low", () => {
    const effect = {
      ...cardEffect,
      config: {
        ...cardEffect.config,
        maxProbes: 1,
        commitThreshold: 0.999,
        recoveryBudget: 0
      }
    };
    const session = new PerformanceSession(effect, { seed: 37 });

    session.consent();
    session.chosen();
    const firstOption = session.snapshot().options?.[0];
    if (!firstOption) throw new Error("expected a card probe option");
    session.answer(firstOption.id);

    expect(session.phaseName).toBe("miss");
    expect(session.snapshot().line).toBe(cardEffect.script().missLine);
    expect(session.snapshot().reveal).toBeUndefined();
    expect(session.exportLog().finalPhase).toBe("miss");
    expect(session.exportLog().revealed).toBeUndefined();
  });
});
