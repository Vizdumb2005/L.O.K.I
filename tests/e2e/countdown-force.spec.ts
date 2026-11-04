import { expect, test } from "@playwright/test";

/**
 * The Countdown Force: the sealed prediction must match the card the
 * spectator's own procedure produces, for the number actually named, with the
 * seal opened either way and the method disclosed at the end. No evidence
 * engine is involved; the test buys no pass from any bluff path.
 */

async function enterCountdown(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.locator(".effect-picker:not(.mode-picker) label.effect-choice", { hasText: "The Countdown" }).click();
  await page.locator('input[type="checkbox"]').first().check();
  await page.getByRole("button", { name: /Enter the observatory/i }).click();
  await expect(page.getByTestId("countdown-stage")).toBeVisible();
}

test.describe("countdown force", () => {
  for (const named of [10, 13, 19]) {
    test(`sealed card matches the produced card for named number ${named}`, async ({ page }) => {
      await enterCountdown(page);

      // The Oracle conducts from the start; scripted voice carries no live badge.
      await expect(page.getByTestId("oracle-line")).toBeVisible();
      await expect(page.getByTestId("oracle-line")).toHaveAttribute("data-voice", "script");
      await expect(page.getByTestId("oracle-live-badge")).toHaveCount(0);

      // The commitment exists before any spectator input.
      const commitment = await page.getByTestId("seal-commitment").innerText();
      expect(commitment).toMatch(/^[0-9a-f]{64}$/);

      await page.getByTestId("begin-countdown").click();
      await page.getByTestId("countdown-number-input").fill(String(named));
      await page.getByTestId("countdown-deal").click();

      // digitSum steps, one spectator click per counted card.
      const steps = String(named).split("").reduce((s, d) => s + Number(d), 0);
      for (let i = 0; i < steps; i += 1) {
        await page.getByTestId("countdown-count").click();
      }

      // Conduction tracks the real state: the count line names the digit-sum.
      await expect(page.getByTestId("oracle-line")).toContainText(String(steps));

      await page.getByTestId("countdown-open-seal").click();
      const reveal = page.getByTestId("countdown-reveal");
      await expect(reveal).toBeVisible();
      await expect(reveal).toContainText("They match");

      // The produced card and the sealed card are named identically.
      const text = await reveal.innerText();
      const produced = /procedure produced:\s*(.+)\n/.exec(text)?.[1]?.trim();
      const sealed = /opened now, names:\s*(.+?)\./.exec(text)?.[1]?.trim();
      expect(produced).toBeTruthy();
      expect(produced).toBe(sealed);

      // The reveal carries a truthful capability notice without exposing the method.
      await expect(reveal).toContainText("An illusion of prediction");
      await expect(reveal).toContainText("no thought was read");

      // Method disclosure and the full trace sit behind an optional toggle.
      await page.getByTestId("countdown-trace-toggle").click();
      await expect(page.getByTestId("countdown-method")).toContainText("arithmetic decided the card");
      await expect(page.getByTestId("countdown-method")).toContainText("No choice of yours was predicted");
      const trace = await page.getByTestId("countdown-trace").innerText();
      expect(trace).toContain(`"namedNumber": ${named}`);
      expect(trace).toContain(`"sealVerified": true`);
    });
  }

  test("out-of-range numbers are rejected, not reinterpreted", async ({ page }) => {
    await enterCountdown(page);
    await page.getByTestId("begin-countdown").click();
    await page.getByTestId("countdown-number-input").fill("23");
    await page.getByTestId("countdown-deal").click();
    await expect(page.getByTestId("countdown-input-error")).toBeVisible();
    // No deal happened: the pile never renders.
    await expect(page.getByTestId("countdown-pile")).toHaveCount(0);
  });
});
