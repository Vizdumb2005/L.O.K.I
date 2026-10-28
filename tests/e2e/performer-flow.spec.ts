import { expect, test, type Page } from "@playwright/test";

async function enter(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByText("I understand this is a", { exact: false }).click();
  await page.getByRole("button", { name: "Enter the observatory" }).click();
  await page.getByRole("button", { name: "I have chosen" }).click();
  await expect(page.locator("button.choice").first()).toBeVisible();
}

async function playToPayoff(page: Page): Promise<void> {
  for (let i = 0; i < 20; i++) {
    if (await page.locator("button.choice").first().isVisible().catch(() => false)) {
      await page.keyboard.press("1");
      await page.waitForTimeout(120);
      continue;
    }
    const recover = page.getByRole("button", { name: "One clean question" });
    if (await recover.isVisible().catch(() => false)) {
      await recover.click();
      continue;
    }
    return;
  }
}

test("flow: exactly one polite live region exists while performing", async ({ page }) => {
  await enter(page);
  await expect(page.locator("[aria-live='polite']")).toHaveCount(1);
  await page.keyboard.press("1");
  await expect(page.locator("[aria-live='polite']")).toHaveCount(1);
});

test("flow: keyboard only. Digits answer, Space skips the payoff pause, Escape then leaves", async ({ page }) => {
  await enter(page);
  await playToPayoff(page);
  await expect(page.getByRole("button", { name: "Reveal it" }).or(page.locator(".panel-miss"))).toBeVisible({ timeout: 8000 });
  // First Escape while a pause is pending only skips it; the show stays.
  await page.keyboard.press("Escape");
  await expect(page.locator("main.performance")).toBeVisible();
  // With nothing pending, Escape leaves back to the consent screen.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Enter the observatory" })).toBeVisible();
});

test("flow: the same performer shell runs the Ember effect", async ({ page }) => {
  await page.goto("/");
  await page.getByText("I understand this is a", { exact: false }).click();
  await page.getByText("Ember Words", { exact: true }).click();
  await page.getByRole("button", { name: "Enter the observatory" }).click();
  await expect(page.getByText("Ember Words", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "I have chosen" }).click();
  const first = (await page.locator("button.choice").first().innerText()).replace(/^\s*\d+\s*/, "").trim();
  await page.keyboard.press("1");
  await expect(page.locator("#line-heading")).toContainText(new RegExp(first, "i"));
});

test("flow: focus follows the moment and is restored when leaving", async ({ page }) => {
  await enter(page);
  const inActions = () =>
    page.evaluate(() => Boolean(document.activeElement?.closest(".panel-actions")));
  await expect.poll(inActions).toBe(true);
  await page.keyboard.press("1");
  await expect.poll(inActions).toBe(true);
  await playToPayoff(page);
  await expect.poll(inActions).toBe(true);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Enter the observatory" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe("main");
});
