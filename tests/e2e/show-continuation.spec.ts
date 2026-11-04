import { expect, test, type Page } from "@playwright/test";

/**
 * Show continuity: each act's afterglow hands off to the next act without
 * leaving the show. Twelve to Ember, Ember to the Countdown, the Countdown
 * back to The Twelve.
 */

async function walkToAfterglow(page: Page): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (await page.getByRole("button", { name: "Begin again" }).isVisible().catch(() => false)) return;
    const choice = page.locator("button.choice:not([disabled])").first();
    if (await choice.isVisible().catch(() => false)) {
      await page.keyboard.press("1");
      await page.waitForTimeout(150);
      continue;
    }
    let clicked = false;
    const labels: Array<string> = ["One clean claim", "Reveal it", "Name it", "Skip ahead", "Continue"];
    for (const label of labels) {
      const button = page.getByRole("button", { name: label });
      if (await button.isVisible().catch(() => false)) {
        await button.click();
        await page.waitForTimeout(150);
        clicked = true;
        break;
      }
    }
    if (!clicked) await page.waitForTimeout(250);
  }
  throw new Error("afterglow not reached");
}

async function enterShowrunnerAct(page: Page, actName: string): Promise<void> {
  await page.goto("/");
  await page.locator(".effect-picker:not(.mode-picker) label.effect-choice", { hasText: actName }).click();
  await page.getByText("I understand this is a", { exact: false }).click();
  await page.getByRole("button", { name: "Enter the observatory" }).click();
  await page.getByRole("button", { name: "I have chosen" }).click();
  await expect(page.locator("button.choice").first()).toBeVisible();
}

test("continuation: The Twelve afterglow continues to Act II: Ember Words", async ({ page }) => {
  await enterShowrunnerAct(page, "The Twelve");
  await walkToAfterglow(page);
  await page.getByRole("button", { name: "Continue to Act II: Ember Words" }).click();
  await expect(page.getByText("Ember Words", { exact: true }).first()).toBeVisible();
  // The new act is live at its first private choice.
  await expect(page.getByRole("button", { name: "I have chosen" })).toBeVisible();
});

test("continuation: Ember Words afterglow continues to Act III: The Countdown", async ({ page }) => {
  await enterShowrunnerAct(page, "Ember Words");
  await walkToAfterglow(page);
  await page.getByRole("button", { name: "Continue to Act III: The Countdown" }).click();
  await expect(page.getByTestId("countdown-stage")).toBeVisible();
});

test("continuation: the Countdown reveal continues to Act I: The Twelve", async ({ page }) => {
  await page.goto("/");
  await page.locator(".effect-picker:not(.mode-picker) label.effect-choice", { hasText: "The Countdown" }).click();
  await page.locator('input[type="checkbox"]').first().check();
  await page.getByRole("button", { name: /Enter the observatory/i }).click();
  await expect(page.getByTestId("countdown-stage")).toBeVisible();
  await page.getByTestId("begin-countdown").click();
  await page.getByTestId("countdown-number-input").fill("10");
  await page.getByTestId("countdown-deal").click();
  await page.getByTestId("countdown-count").click();
  await page.getByTestId("countdown-open-seal").click();
  await expect(page.getByTestId("countdown-reveal")).toBeVisible();
  await page.getByTestId("countdown-continue").click();
  // The Twelve opens at its private choice, inside the same visit.
  await expect(page.getByText("Choose privately")).toBeVisible();
  await expect(page.getByRole("button", { name: "I have chosen" })).toBeVisible();
});
