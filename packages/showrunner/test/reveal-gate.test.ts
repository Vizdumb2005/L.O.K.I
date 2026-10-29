import { describe, expect, it } from "vitest";
import { cardEffect } from "@loki/effect-card";
import { exampleEffect } from "@loki/effect-example";
import { PerformanceSession } from "../src/session.js";

function driveToPayoff(effect: typeof cardEffect) {
  const session = new PerformanceSession(effect, { seed: 7 });
  session.begin(); // invite -> think
  session.chosen(); // think -> probe
  for (let i = 0; i < 24; i++) {
    const phase = session.phaseName;
    if (phase === "probe") {
      session.answer(session.snapshot().options![0]!.id);
      continue;
    }
    if (phase === "build") {
      session.advance();
      break;
    }
    if (phase === "reveal" || phase === "miss") break;
    session.advance();
  }
  return session;
}

describe("user-performed reveal gate", () => {
  it("exposes the gate during the card reveal and nowhere else", () => {
    const session = driveToPayoff(cardEffect);
    const view = session.snapshot();
    if (view.phase === "miss") return; // honest-miss runs carry no gate
    expect(view.phase).toBe("reveal");
    expect(view.revealGate).toBeDefined();
    expect(view.revealGate!.action.length).toBeGreaterThan(0);
    expect(view.revealGate!.invite.length).toBeGreaterThan(0);
    // The reveal itself is still present; only the lighting is gated (client-side).
    expect(view.reveal).toBeDefined();
  });

  it("is absent for an effect whose script does not ask for it", () => {
    const session = driveToPayoff(exampleEffect as unknown as typeof cardEffect);
    expect(session.snapshot().revealGate).toBeUndefined();
  });
});
