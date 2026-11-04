import { expect, test, type Page } from "@playwright/test";
import { setupHardwareMocks, enterObservatoryWithSensors } from "../fixtures/mock-hardware.js";

/**
 * Consent scope across act handoffs: crossing into the sensorless Countdown
 * releases live capture; crossing from the Countdown into a showrunner act
 * never auto-starts the camera or mic; between sensor-mode showrunner acts
 * the mode is retained until the person leaves or resets.
 */

async function walkToAfterglow(page: Page): Promise<void> {
  for (let i = 0; i < 60; i++) {
    if (await page.getByRole("button", { name: "Begin again" }).isVisible().catch(() => false)) return;
    const choice = page.locator("button.choice:not([disabled])").first();
    if (await choice.isVisible().catch(() => false)) {
      await page.keyboard.press("1");
      await page.waitForTimeout(200);
      continue;
    }
    let clicked = false;
    const labels: Array<string> = ["One clean claim", "Reveal it", "Turn it over", "Skip ahead", "Continue"];
    for (const label of labels) {
      const button = page.getByRole("button", { name: label });
      if (await button.isVisible().catch(() => false)) {
        await button.click();
        await page.waitForTimeout(200);
        clicked = true;
        break;
      }
    }
    if (!clicked) await page.waitForTimeout(300);
  }
  throw new Error("afterglow not reached");
}

test("handoff consent: Countdown to The Twelve never requests camera or mic", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __gumCalls: number }).__gumCalls = 0;
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: () => {
          (window as unknown as { __gumCalls: number }).__gumCalls += 1;
          return Promise.reject(new Error("getUserMedia must not be called sensorless"));
        }
      }
    });
  });
  await page.goto("/");
  await page.locator(".effect-picker:not(.mode-picker) label.effect-choice", { hasText: "The Countdown" }).click();
  await page.locator('input[type="checkbox"]').first().check();
  await page.getByRole("button", { name: /Enter the observatory/i }).click();
  await page.getByTestId("begin-countdown").click();
  await page.getByTestId("countdown-number-input").fill("10");
  await page.getByTestId("countdown-deal").click();
  await page.getByTestId("countdown-count").click();
  await page.getByTestId("countdown-open-seal").click();
  await expect(page.getByTestId("countdown-reveal")).toBeVisible();
  await page.getByTestId("countdown-continue").click();
  // The Twelve runs click-only: no capture was requested anywhere on the way.
  await expect(page.getByRole("button", { name: "I have chosen" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __gumCalls: number }).__gumCalls)).toBe(0);
});

test("handoff consent: sensor-mode Ember Words releases capture when continuing to the Countdown", async ({ page }) => {
  const hardware = await setupHardwareMocks(page, { scenario: "nominal", targetZone: "top-left" });
  await page.goto("/");
  await enterObservatoryWithSensors(page, "Ember Words");
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "I have chosen" }).click();
  await walkToAfterglow(page);
  await page.getByRole("button", { name: "Continue to Act III: The Countdown" }).click();
  await expect(page.getByTestId("countdown-stage")).toBeVisible();
  // The live capture was released at the boundary; the Countdown consumes nothing.
  await expect.poll(async () => (await hardware.getZdrStatus()).tracksStopped).toBeGreaterThan(0);
});

test("handoff consent: sensor mode is retained Twelve to Ember, and Reset releases it", async ({ page }) => {
  const hardware = await setupHardwareMocks(page, { scenario: "nominal", targetZone: "top-left" });
  await page.goto("/");
  await enterObservatoryWithSensors(page, "The Twelve");
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "I have chosen" }).click();
  await walkToAfterglow(page);
  await page.getByRole("button", { name: "Continue to Act II: Ember Words" }).click();
  // Ember opens inside the same sensor-enabled performance: capture still live.
  await expect(page.getByRole("button", { name: "I have chosen" })).toBeVisible();
  expect((await hardware.getZdrStatus()).tracksStopped).toBe(0);
  // Reset leaves the show and releases the capture.
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByRole("button", { name: /Enter/i }).first()).toBeVisible();
  await expect.poll(async () => (await hardware.getZdrStatus()).tracksStopped).toBeGreaterThan(0);
});
