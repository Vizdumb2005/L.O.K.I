import { expect, test, type Page } from "@playwright/test";

async function enterCard(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByText("I understand this is a", { exact: false }).click();
  await page.getByRole("button", { name: "Enter the observatory" }).click();
  await page.getByRole("button", { name: "I have chosen" }).click();
  await expect(page.locator("button.choice").first()).toBeVisible();
}

// Answer 1 until the show leaves the probe phase (build or miss).
async function answerUntilPayoff(page: Page): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const choice = page.locator("button.choice").first();
    if (!(await choice.isVisible().catch(() => false))) {
      const recover = page.getByRole("button", { name: "One clean claim" });
      if (await recover.isVisible().catch(() => false)) await recover.click();
      else return;
      continue;
    }
    await page.keyboard.press("1");
    await page.waitForTimeout(150);
  }
}

test("performer: a chosen answer is acknowledged with the person's own label, then the next prompt returns", async ({ page }) => {
  await enterCard(page);
  const first = (await page.locator("button.choice").first().innerText()).replace(/^\s*\d+\s*/, "").trim();
  await page.keyboard.press("1");
  await expect(page.locator("#line-heading")).toContainText(new RegExp(first, "i"));
  await expect(page.locator("#line-heading")).not.toContainText(first, { timeout: 4000 });
  await expect(page.locator("#line-heading")).toContainText(/\w/);
});

test("performer: the payoff plays as timed cues and Skip ahead stops at the reveal or miss line, never past it", async ({ page }) => {
  await enterCard(page);
  await answerUntilPayoff(page);
  const reveal = page.getByRole("button", { name: "Reveal it" });
  await expect(reveal.or(page.locator(".panel-miss"))).toBeVisible();
  if (await reveal.isVisible()) await reveal.click();
  // Either the staged reveal or the staged honest miss now plays.
  await expect(page.locator(".panel-reveal, .panel-miss")).toBeVisible();
  const heading = page.locator("#line-heading");
  const skip = page.getByRole("button", { name: "Skip ahead" }).first();
  await expect(heading).not.toHaveText("", { timeout: 3000 });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await expect(page.getByRole("button", { name: "Skip ahead" })).toHaveCount(0);
  await expect(page.locator(".panel-reveal, .panel-miss")).toBeVisible();
  // The card reveal waits for the person to turn the card over themselves.
  const turnOver = page.getByRole("button", { name: "Turn it over" });
  if (await turnOver.isVisible().catch(() => false)) await turnOver.click();
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
});

test("performer: with reduced motion the lines show without timers and earlier lines are kept readable", async ({ page }) => {
  await enterCard(page);
  await page.getByRole("button", { name: /Motion on|Motion reduced/ }).first().evaluate((el) => {
    if (el.getAttribute("aria-pressed") !== "true") (el as HTMLButtonElement).click();
  });
  await answerUntilPayoff(page);
  const reveal = page.getByRole("button", { name: "Reveal it" });
  await expect(reveal.or(page.locator(".panel-miss"))).toBeVisible();
  if (await reveal.isVisible()) await reveal.click();
  await expect(page.locator(".cue-trail")).toBeVisible();
  await expect(page.locator(".cue-trail li").first()).not.toHaveText("");
  await expect(page.getByRole("button", { name: "Skip ahead" })).toHaveCount(0);
});
