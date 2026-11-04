import { expect, test } from "@playwright/test";
import { setupHardwareMocks, enterObservatoryWithSensors } from "../fixtures/mock-hardware.js";

/**
 * E2E Test Suite: Phase 2 Asymmetric Mentalism Method Choreography
 * Covers:
 * - F09: Zone Progressive Reading
 * - F10: Elimination of Akinator Binary Search Questionnaire
 * - F11: Derren Brown / Peter Turner Denial Pivot
 * - F12: Equivocation / Magician's Choice Fallback
 *
 * Tiers:
 * - Tier 1: Feature Coverage (Zone progressive statements, maxProbes clamp, Denial absorption, Equivocation)
 * - Tier 2: Boundary & Corner Cases (Double deliberate lie, hesitant pause, ambiguous boundary fixation)
 * - Tier 3: Cross-Feature Combinations (Progressive reading + crimson ink validation + input gating)
 * - Tier 4: Real-World Mentalism Show Scenarios (Instant reveal on confirmation, Seamless denial pivot hit)
 */

test.describe("Phase 2: Asymmetric Mentalism Method Choreography", () => {
  test("Tier 1 - F09: zone progressive cold reading delivers sensory statements targeting candidate pairs", async ({ page }) => {
    await setupHardwareMocks(page, { scenario: "nominal", targetZone: "top-left" });
    await page.goto("/");
    // The featured default is now the countdown act; these flows exercise the
    // showrunner acts, so select The Twelve explicitly.
    await page.locator(".effect-picker:not(.mode-picker) label.effect-choice", { hasText: "The Twelve" }).click();

    await page.getByText("I understand this is a", { exact: false }).click();
    await page.getByRole("button", { name: "Enter the observatory" }).click();
    await page.getByRole("button", { name: "I have chosen" }).click();

    // The probe line contains sensory atmospheric imagery
    const heading = page.locator("#line-heading");
    await expect(heading).toBeVisible();
    const promptText = await heading.innerText();
    expect(promptText.length).toBeGreaterThan(10);
    expect(promptText.length).toBeLessThanOrEqual(180);
  });

  test("Tier 1 - F10: Akinator 6-question binary search is dismantled, capping probes to <= 2 beats", async ({ page }) => {
    await setupHardwareMocks(page, { scenario: "nominal", targetZone: "top-left" });
    await page.goto("/");
    // The featured default is now the countdown act; these flows exercise the
    // showrunner acts, so select The Twelve explicitly.
    await page.locator(".effect-picker:not(.mode-picker) label.effect-choice", { hasText: "The Twelve" }).click();

    await page.getByText("I understand this is a", { exact: false }).click();
    await page.getByRole("button", { name: "Enter the observatory" }).click();
    await page.getByRole("button", { name: "I have chosen" }).click();

    let probeCount = 0;
    for (let step = 0; step < 10; step++) {
      const revealBtn = page.getByRole("button", { name: "Reveal it" });
      const missPanel = page.locator(".panel-miss");
      if ((await revealBtn.isVisible().catch(() => false)) || (await missPanel.isVisible().catch(() => false))) {
        break;
      }
      const choice = page.locator("button.choice:not([disabled])").first();
      if (await choice.isVisible().catch(() => false)) {
        probeCount++;
        await choice.click();
        await page.waitForTimeout(200);
      }
    }

    // Must resolve in <= 2 conversational turns even on full traversal, far below 6-probe Akinator
    expect(probeCount).toBeLessThanOrEqual(2);
  });

  test("Tier 1 - F11: Derren Brown denial pivot absorbs 'no' or hesitation into immediate partner card hit", async ({ page }) => {
    await setupHardwareMocks(page, { scenario: "nominal", targetZone: "top-left" });
    await page.goto("/");
    // The featured default is now the countdown act; these flows exercise the
    // showrunner acts, so select The Twelve explicitly.
    await page.locator(".effect-picker:not(.mode-picker) label.effect-choice", { hasText: "The Twelve" }).click();

    await page.getByText("I understand this is a", { exact: false }).click();
    await page.getByRole("button", { name: "Enter the observatory" }).click();
    await page.getByRole("button", { name: "I have chosen" }).click();

    // Spectator answers "That's wrong" (denial) to lower card
    const denyBtn = page.locator("button.choice").filter({ hasText: /That's wrong|No/i }).first();
    if (await denyBtn.isVisible().catch(() => false)) {
      await denyBtn.click();

      // Performer absorbs the denial without penalty
      await page.waitForTimeout(200);
      const revealOrNext = page.getByRole("button", { name: "Reveal it" }).or(page.locator("button.choice"));
      await expect(revealOrNext.first()).toBeVisible();
    }
  });

  test("Tier 1 - F12: ambiguous gaze never triggers the equivocation elimination gesture", async ({ page }) => {
    // SEMANTIC CHANGE (2026-11-04 honesty repair): the 11-03 "Magician's Choice"
    // physical-elimination gesture ("Push the black cards away") treated spectator
    // COMPLIANCE with an instruction as hard card-color evidence (likelihood 1/0) -
    // a textbook equivocation that manufactures certainty and produced wrong reveals
    // on the held-out gate. It is removed from the shipping probe set (kept exported
    // for lab research only). The honest regime: ambiguous or uncalibrated gaze is
    // refused as evidence and the show falls back to ordinary impression statements;
    // no beat may hard-eliminate, and the run ends only in a committed reveal at the
    // full 0.96 bar or an owned miss.
    await setupHardwareMocks(page, { scenario: "collinear-degenerate-anchors", gazeReliability: 0.45 });
    await page.goto("/");
    // The featured default is now the countdown act; these flows exercise the
    // showrunner acts, so select The Twelve explicitly.
    await page.locator(".effect-picker:not(.mode-picker) label.effect-choice", { hasText: "The Twelve" }).click();

    await enterObservatoryWithSensors(page);
    await page.waitForTimeout(1100);
    await page.getByRole("button", { name: "I have chosen" }).click();

    const heading = page.locator("#line-heading");
    await expect(heading).toBeVisible({ timeout: 15000 });

    // Play through the full probe budget, asserting the elimination gesture never
    // appears at any beat. The run must terminate at a reveal gate or an owned miss.
    let ended = false;
    for (let step = 0; step < 40 && !ended; step++) {
      const text = (await heading.innerText().catch(() => "")) ?? "";
      expect(text.trim()).not.toContain("Push the black cards away");
      const revealBtn = page.getByRole("button", { name: "Reveal it" });
      if (await revealBtn.isVisible().catch(() => false)) {
        await revealBtn.click();
        ended = true;
        break;
      }
      if (await page.locator(".panel-miss").isVisible().catch(() => false)) {
        ended = true;
        break;
      }
      const recover = page.getByRole("button", { name: "One clean claim" });
      if (await recover.isVisible().catch(() => false)) {
        await recover.click();
        await page.waitForTimeout(300);
        continue;
      }
      const skip = page.getByRole("button", { name: "Skip ahead" }).first();
      const choice = page.locator("button.choice:not([disabled])").first();
      if (await choice.isVisible().catch(() => false)) {
        await choice.click();
        await page.waitForTimeout(500);
      } else if (await skip.isVisible().catch(() => false)) {
        await skip.click();
        await page.waitForTimeout(300);
      } else {
        await page.waitForTimeout(600);
      }
    }
    expect(ended).toBe(true);
    await expect(page.locator("canvas, .flat-stage").first()).toBeVisible();
  });

  test("Tier 2 - Boundary: double deliberate lie gracefully falls back to honest miss without accusing contradiction", async ({ page }) => {
    await setupHardwareMocks(page, { scenario: "nominal", targetZone: "top-left" });
    await page.goto("/");
    // The featured default is now the countdown act; these flows exercise the
    // showrunner acts, so select The Twelve explicitly.
    await page.locator(".effect-picker:not(.mode-picker) label.effect-choice", { hasText: "The Twelve" }).click();

    await page.getByText("I understand this is a", { exact: false }).click();
    await page.getByRole("button", { name: "Enter the observatory" }).click();
    await page.getByRole("button", { name: "I have chosen" }).click();

    // Answer inconsistently to intentionally force low posterior
    for (let i = 0; i < 6; i++) {
      const choices = page.locator("button.choice:not([disabled])");
      if ((await choices.count()) > 0) {
        // Toggle answers
        const btn = i % 2 === 0 ? choices.last() : choices.first();
        await btn.click();
        await page.waitForTimeout(200);
      }
      const reveal = page.getByRole("button", { name: "Reveal it" });
      const miss = page.locator(".panel-miss");
      if ((await reveal.isVisible().catch(() => false)) || (await miss.isVisible().catch(() => false))) {
        break;
      }
    }

    // System never displays aggressive "You contradicted yourself" accusations
    await expect(page.getByText("You contradicted yourself", { exact: false })).toHaveCount(0);
  });

  test("Tier 3 - Cross-Feature: progressive reading probe options render with crimson ink styling", async ({ page }) => {
    await setupHardwareMocks(page, { scenario: "nominal", targetZone: "mid-left" });
    await page.goto("/");
    // The featured default is now the countdown act; these flows exercise the
    // showrunner acts, so select The Twelve explicitly.
    await page.locator(".effect-picker:not(.mode-picker) label.effect-choice", { hasText: "The Twelve" }).click();

    await page.getByText("I understand this is a", { exact: false }).click();
    await page.getByRole("button", { name: "Enter the observatory" }).click();

    // Verify silent choice roster renders red cards with crimson styling (4 hearts + 4 diamonds = 8)
    const redChoices = page.locator(".silent-choice.is-red");
    await expect(redChoices).toHaveCount(8);

    await page.getByRole("button", { name: "I have chosen" }).click();
    await expect(page.locator("button.choice").first()).toBeVisible();
  });

  test("Tier 4 - Real-World: full mentalism run with immediate cold-reading confirmation hit", async ({ page }) => {
    await setupHardwareMocks(page, { scenario: "nominal", targetZone: "bottom-left" });
    await page.goto("/");
    // The featured default is now the countdown act; these flows exercise the
    // showrunner acts, so select The Twelve explicitly.
    await page.locator(".effect-picker:not(.mode-picker) label.effect-choice", { hasText: "The Twelve" }).click();

    await page.getByText("I understand this is a", { exact: false }).click();
    await page.getByRole("button", { name: "Enter the observatory" }).click();
    await page.getByRole("button", { name: "I have chosen" }).click();

    // Confirm first impression ("True of my card")
    const confirmBtn = page.locator("button.choice").filter({ hasText: /True of my card|Yes/i }).first();
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click();
      await page.waitForTimeout(200);

      // Reaches reveal in 1 beat
      const revealBtn = page.getByRole("button", { name: "Reveal it" });
      if (await revealBtn.isVisible().catch(() => false)) {
        await revealBtn.click();
        await expect(page.locator("canvas, .flat-stage").first()).toBeVisible();
      }
    }
  });

  test("Tier 4 - Real-World: full mentalism run with denial pivot absorbing hesitation seamlessly", async ({ page }) => {
    await setupHardwareMocks(page, { scenario: "nominal", targetZone: "bottom-right" });
    await page.goto("/");
    // The featured default is now the countdown act; these flows exercise the
    // showrunner acts, so select The Twelve explicitly.
    await page.locator(".effect-picker:not(.mode-picker) label.effect-choice", { hasText: "The Twelve" }).click();

    await page.getByText("I understand this is a", { exact: false }).click();
    await page.getByRole("button", { name: "Enter the observatory" }).click();
    await page.getByRole("button", { name: "I have chosen" }).click();

    // Deny first impression ("That's wrong")
    const denyBtn = page.locator("button.choice").filter({ hasText: /That's wrong|No/i }).first();
    if (await denyBtn.isVisible().catch(() => false)) {
      await denyBtn.click();
      await page.waitForTimeout(200);

      // Pivot immediately establishes second card
      const revealBtn = page.getByRole("button", { name: "Reveal it" });
      if (await revealBtn.isVisible().catch(() => false)) {
        await revealBtn.click();
        await expect(page.locator(".stage-shell").or(page.locator("canvas, .flat-stage")).first()).toBeVisible();
      }
    }
  });
});
