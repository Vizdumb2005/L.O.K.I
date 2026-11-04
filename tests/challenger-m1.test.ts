import { describe, expect, it } from "vitest";
import { exampleEffect } from "@loki/effect-example";
import { cardEffect } from "@loki/effect-card";
import { CARDS, CARD_PROBES, CARD_STAGE_BASE, zoneStatementsForStage } from "../effects/card/src/cards.js";
import { checkEffect, validateEffect } from "@loki/effect-api";
import { sanitizeLine, MAX_PATTER_LENGTH } from "../packages/showrunner/src/patter.js";
import { PerformanceSession } from "@loki/showrunner";
import { cardPalette } from "../apps/web/src/components/stage-layout.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const RECOVERY_PREFIX = "One clean claim. ";

describe("Milestone 1 Empirical Challenge: Probe Length Stress Test", () => {
  it("probes in exampleEffect never exceed 160 chars raw or 180 chars with recovery prefix", () => {
    const stage = exampleEffect.stage();
    const probes = exampleEffect.probes(stage);
    expect(probes.length).toBeGreaterThanOrEqual(5);

    for (const p of probes) {
      const prompt = p.prompt.trim();
      expect(prompt.length).toBeLessThanOrEqual(160);
      expect((RECOVERY_PREFIX + prompt).length).toBeLessThanOrEqual(MAX_PATTER_LENGTH);

      // Verify sanitizeLine never falls back to generic fallback
      expect(sanitizeLine(prompt, "FALLBACK")).toBe(prompt);
      expect(sanitizeLine(RECOVERY_PREFIX + prompt, "FALLBACK")).toBe(RECOVERY_PREFIX + prompt);
    }
  });

  it("static CARD_PROBES never exceed 160 chars raw or 180 chars with recovery prefix", () => {
    for (const p of CARD_PROBES) {
      const prompt = p.prompt.trim();
      expect(prompt.length).toBeLessThanOrEqual(160);
      expect((RECOVERY_PREFIX + prompt).length).toBeLessThanOrEqual(MAX_PATTER_LENGTH);
      expect(sanitizeLine(prompt, "FALLBACK")).toBe(prompt);
      expect(sanitizeLine(RECOVERY_PREFIX + prompt, "FALLBACK")).toBe(RECOVERY_PREFIX + prompt);
    }
  });

  it("all zone progressive statements across all 12 cards never exceed 160 chars raw or 180 chars with recovery prefix", () => {
    for (const card of CARDS) {
      const dummyStage = {
        ...CARD_STAGE_BASE,
        items: [
          { hypothesisId: card.id, label: card.label, glyph: card.glyph },
          ...CARD_STAGE_BASE.items.filter((i) => i.hypothesisId !== card.id)
        ]
      };
      const statements = zoneStatementsForStage(dummyStage);
      for (const st of statements) {
        const prompt = st.prompt.trim();
        expect(prompt.length).toBeLessThanOrEqual(160);
        expect((RECOVERY_PREFIX + prompt).length).toBeLessThanOrEqual(MAX_PATTER_LENGTH);
        expect(sanitizeLine(prompt, "FALLBACK")).toBe(prompt);
        expect(sanitizeLine(RECOVERY_PREFIX + prompt, "FALLBACK")).toBe(RECOVERY_PREFIX + prompt);
      }
    }
  });

  it("effects pass strict validateEffect checks", () => {
    expect(() => validateEffect(exampleEffect)).not.toThrow();
    expect(() => validateEffect(cardEffect)).not.toThrow();
  });

  it("adversarial oversized probe is caught by checkEffect", () => {
    const badProbe = {
      ...exampleEffect.probes(exampleEffect.stage())[0]!,
      id: "adversarial-too-long",
      prompt: "X".repeat(164)
    };
    const issues = checkEffect({
      ...exampleEffect,
      probes: () => [badProbe, ...exampleEffect.probes(exampleEffect.stage())]
    });
    expect(issues.some((i) => i.includes("prompt + recovery prefix exceeds MAX_PATTER_LENGTH"))).toBe(true);
  });
});

describe("Milestone 1 Empirical Challenge: cuePending Concurrency", () => {
  it("strictly suppresses rapid inputs while ackCue is pending across multi-seed runs", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const session = new PerformanceSession(cardEffect, { seed, forceEnabled: false });
      session.begin();
      session.chosen();
      expect(session.snapshot().phase).toBe("probe");

      const view1 = session.snapshot();
      const optionId = view1.options![0]!.id;
      session.answer(optionId);

      // Verify ackCue presence and hold duration
      const cues = session.snapshot().cues;
      expect(cues.length).toBe(2);
      expect(cues[0]?.kind).toBe("ack");
      expect(cues[0]?.holdMs).toBe(650);

      const answeredInitial = session.internal().answered;
      expect(answeredInitial).toBe(1);

      // Concurrency assault: 100 rapid calls to session.answer
      for (let i = 0; i < 100; i++) {
        session.answer("yes");
      }

      // Assert zero answers accepted
      expect(session.internal().answered).toBe(answeredInitial);

      // Release cue
      session.clearAck();

      // Now subsequent answer must be accepted if still in probe phase
      const view2 = session.snapshot();
      if (view2.phase === "probe" && view2.options && view2.options.length > 0) {
        session.answer(view2.options[0]!.id);
        expect(session.internal().answered).toBe(answeredInitial + 1);
      }
    }
  });
});

describe("Milestone 1 Empirical Challenge: Crimson Ink Palette", () => {
  it("maps Hearts and Diamonds to crimson #9e2a2b and Spades to obsidian #16231f across all 12 cards", () => {
    for (const card of CARDS) {
      const p = cardPalette(card.glyph, card.label);
      if (card.suit === "h" || card.suit === "d") {
        expect(p.glyph).toBe("#9e2a2b");
        expect(p.isRedSuit).toBe(true);
      } else if (card.suit === "s") {
        expect(p.glyph).toBe("#16231f");
        expect(p.isRedSuit).toBe(false);
      }
    }
  });

  it("maps all 52 standard playing cards correctly", () => {
    const suits = [
      { name: "Hearts", glyph: "♥", red: true },
      { name: "Diamonds", glyph: "♦", red: true },
      { name: "Spades", glyph: "♠", red: false },
      { name: "Clubs", glyph: "♣", red: false }
    ];
    const ranks = ["Ace", "2", "3", "4", "5", "6", "7", "8", "9", "10", "Jack", "Queen", "King"];

    for (const s of suits) {
      for (const r of ranks) {
        const p = cardPalette(`${r} of ${s.name}`, `${r} of ${s.name}`);
        if (s.red) {
          expect(p.glyph).toBe("#9e2a2b");
          expect(p.isRedSuit).toBe(true);
        } else {
          expect(p.glyph).toBe("#16231f");
          expect(p.isRedSuit).toBe(false);
        }
      }
    }
  });

  it("styles.css enforces crimson #9e2a2b for .is-red classes", () => {
    const css = readFileSync(resolve("apps/web/src/styles.css"), "utf-8");
    expect(css).toMatch(/\.silent-choice-glyph\.is-red\s*\{\s*color:\s*#9e2a2b;?\s*\}/);
    expect(css).toMatch(/\.flat-card\.is-red\s+\.flat-glyph\s*\{\s*color:\s*#9e2a2b;?\s*\}/);
    expect(css).toMatch(/\.flat-card\.is-red\s*\{\s*border-color:\s*rgba\(158,\s*42,\s*43,\s*0\.42\);?\s*\}/);
  });
});
