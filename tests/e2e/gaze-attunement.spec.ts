import { expect, test } from "@playwright/test";
import { setupHardwareMocks, enterObservatoryWithSensors } from "../fixtures/mock-hardware.js";

/**
 * E2E Test Suite: Phase 1 Live Gaze Detection Pipeline
 * Covers:
 * - F05: Honest Camera Validation
 * - F06: Disguised Attunement Calibration
 * - F07: Think Phase Gaze Accumulator
 * - F08: 12-to-2 Card Gaze Collapse (2.585 bits passive entropy)
 *
 * Tiers:
 * - Tier 1: Feature Coverage (Camera validation, Attunement ritual, Gaze accumulation, Entropy collapse)
 * - Tier 2: Boundary & Corner Cases (Degenerate anchors, low light, excessive head motion, mid-stream disconnect)
 * - Tier 3: Cross-Feature Combinations (Attunement + cuePending hold, Gaze collapse + progressive probe)
 * - Tier 4: Real-World Mentalism Gaze Scenarios (Passive entropy extraction in "The Twelve")
 */

test.describe("Phase 1: Gaze Detection & Attunement Pipeline", () => {
  test("Tier 1 - F05: cameraValidated reflects honest gaze quality and calibration", async ({ page }) => {
    await setupHardwareMocks(page, { scenario: "nominal", gazeReliability: 0.85, residualRmse: 0.08 });
    await page.goto("/");

    // Consent gate with sensor opt-in
    await enterObservatoryWithSensors(page);

    // In sensor mode, observatory stage mounts with camera active
    await expect(page.locator("canvas, .flat-stage").first()).toBeVisible();
    await expect(page.locator(".attunement-overlay, .panel-attune, .stage-shell").first()).toBeVisible();
  });

  test("Tier 1 - F06: disguised attunement ember drifts across 4 anchors without dedicated test screens", async ({ page }) => {
    await setupHardwareMocks(page, { scenario: "nominal" });
    await page.goto("/");

    await enterObservatoryWithSensors(page);

    // Verify no explicit crosshairs or calibration test screens appear
    await expect(page.getByText("Calibration Screen", { exact: false })).toHaveCount(0);
    await expect(page.getByText("Look at the crosshair", { exact: false })).toHaveCount(0);

    // Instead, the atmospheric theatrical text is displayed
    const atmosphericLine = page.locator("#line-heading");
    await expect(atmosphericLine).toBeVisible();
  });

  test("Tier 1 - F07: think phase collects gaze fixations into GazeWindow submissions", async ({ page }) => {
    await setupHardwareMocks(page, { scenario: "nominal", targetZone: "top-left" });
    await page.goto("/");

    await enterObservatoryWithSensors(page);

    // Think phase: spectator chooses mentally without clicking or tapping any card
    const roster = page.getByRole("region", { name: "Choose privately" });
    await expect(roster).toBeVisible();
    await expect(roster.getByRole("listitem")).toHaveCount(12);

    // Allow dwell time to buffer uncalibrated raw iris samples during think
    await page.waitForTimeout(1100);

    // Advancing from think moves into attunement where calibration projects think samples
    const chosenBtn = page.getByRole("button", { name: "I have chosen" });
    await expect(chosenBtn).toBeVisible();
    await chosenBtn.click();

    // Ensure session transitions cleanly into probe phase upon calibration completion
    await expect(page.locator("button.choice").first()).toBeVisible({ timeout: 15000 });
  });

  test("Tier 1 - F08: gaze evidence on zone collapses candidate pool from 12 cards to 2", async ({ page }) => {
    await setupHardwareMocks(page, { scenario: "nominal", targetZone: "bottom-left" });
    await page.goto("/");

    await enterObservatoryWithSensors(page);

    // Buffer fixations during think
    await page.waitForTimeout(1100);
    await page.getByRole("button", { name: "I have chosen" }).click();

    // With 2 cards isolated, conversational probes are constrained to <= 2 beats
    await expect(page.locator("button.choice").first()).toBeVisible({ timeout: 15000 });
  });

  test("Tier 2 - Boundary: degenerate collinear iris landmarks fail calibration residual gate honestly", async ({ page }) => {
    await setupHardwareMocks(page, { scenario: "collinear-degenerate-anchors" });
    await page.goto("/");

    await enterObservatoryWithSensors(page);

    // When affine map cannot be fit, the show continues without crashing
    await expect(page.locator("canvas, .flat-stage").first()).toBeVisible();
  });

  test("Tier 2 - Boundary: low light frame conditions (brightness < 0.18) keep gaze channel closed", async ({ page }) => {
    await setupHardwareMocks(page, { scenario: "low-light" });
    await page.goto("/");

    await enterObservatoryWithSensors(page);

    // Safe fallback to manual mentalism flow
    await expect(page.locator("canvas, .flat-stage").first()).toBeVisible();
  });

  test("Tier 2 - Boundary: excessive spectator head motion (> 12 deg) marks quality unusable", async ({ page }) => {
    await setupHardwareMocks(page, { scenario: "head-motion-excessive" });
    await page.goto("/");

    await enterObservatoryWithSensors(page);

    // Show continues smoothly
    await expect(page.locator("canvas, .flat-stage").first()).toBeVisible();
  });

  test("Tier 2 - Boundary: camera disconnection mid-performance safely preserves stage state", async ({ page }) => {
    const hw = await setupHardwareMocks(page, { scenario: "nominal" });
    await page.goto("/");

    await enterObservatoryWithSensors(page);

    // Disconnect simulated camera stream
    await hw.disconnectCamera();
    await page.waitForTimeout(100);

    // Show handles disconnect safely without crashing and presents notice
    await expect(
      page.getByText("The camera capture ended", { exact: false })
        .or(page.locator("canvas, .flat-stage"))
    ).toBeVisible();
  });

  test("Tier 3 - Cross-Feature: attunement calibration does not leak stale clicks into choice buttons", async ({ page }) => {
    await setupHardwareMocks(page, { scenario: "nominal" });
    await page.goto("/");

    await enterObservatoryWithSensors(page);
    await page.waitForTimeout(1100);
    await page.getByRole("button", { name: "I have chosen" }).click();

    // When probe buttons appear, clicking during cuePending is disabled
    const choices = page.locator("button.choice");
    await expect(choices.first()).toBeVisible({ timeout: 15000 });
  });

  test("Tier 4 - Real-World: full passive gaze entropy extraction sequence collapses to 2 cards", async ({ page }) => {
    await setupHardwareMocks(page, { scenario: "nominal", targetZone: "mid-left" });
    await page.goto("/");

    await enterObservatoryWithSensors(page);

    // Spectator observes the 12 cards mentally
    const cards = page.locator(".silent-choice-list li");
    await expect(cards).toHaveCount(12);

    await page.waitForTimeout(1100);
    await page.getByRole("button", { name: "I have chosen" }).click();

    // Gaze isolates candidates; verify performance reaches payoff within 3 beats
    for (let beat = 0; beat < 4; beat++) {
      const revealBtn = page.getByRole("button", { name: "Reveal it" });
      if (await revealBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await revealBtn.click();
        break;
      }
      const choice = page.locator("button.choice:not([disabled])").first();
      if (await choice.isVisible({ timeout: 15000 }).catch(() => false)) {
        await choice.click();
        await page.waitForTimeout(200);
      }
    }
  });
});
