import { expect, test } from "@playwright/test";

/**
 * The Puter.js route to Muse Spark Open. The default scripted build must make
 * zero third-party requests; the opt-in live voice must pin the Meta model,
 * keep the sealed target out of pre-reveal payloads, badge only model lines,
 * and fall back to the scripted voice on any failure.
 */

async function enterCountdown(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.locator(".effect-picker:not(.mode-picker) label.effect-choice", { hasText: "The Countdown" }).click();
  await page.locator('input[type="checkbox"]').first().check();
  await page.getByRole("button", { name: /Enter the observatory/i }).click();
  await expect(page.getByTestId("countdown-stage")).toBeVisible();
}

test("default scripted path makes zero requests to Puter", async ({ page }) => {
  const puterRequests: string[] = [];
  await page.route(/puter\.com/, (route) => {
    puterRequests.push(route.request().url());
    return route.fulfill({ body: "" });
  });
  await enterCountdown(page);
  await expect(page.getByTestId("voice-opt-in")).toBeVisible();
  await page.getByTestId("voice-opt-in-script").click();
  await page.getByTestId("begin-countdown").click();
  await page.getByTestId("countdown-number-input").fill("13");
  await page.getByTestId("countdown-deal").click();
  await expect(page.getByTestId("oracle-line")).toContainText("13");
  await expect(page.getByTestId("oracle-line")).toHaveAttribute("data-voice", "script");
  expect(puterRequests).toEqual([]);
});

test("live voice pins meta/muse-spark-open, badges model lines, and never leaks the seal", async ({ page }) => {
  await page.route(/js\.puter\.com/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.puter = { ai: { chat: async (messages, options) => {
        window.__puterCalls = window.__puterCalls || [];
        window.__puterCalls.push({ model: options.model, messages: JSON.stringify(messages) });
        return { message: { content: "Thirteen. Heard - the pile falls exactly as you said." } };
      } } };`
    })
  );
  await enterCountdown(page);
  await page.getByTestId("voice-opt-in-live").click();
  await page.getByTestId("begin-countdown").click();
  await page.getByTestId("countdown-number-input").fill("13");
  await page.getByTestId("countdown-deal").click();

  await expect(page.getByTestId("oracle-live-badge")).toBeVisible();
  await expect(page.getByTestId("oracle-line")).toHaveAttribute("data-voice", "model");

  const calls = await page.evaluate(() => (window as unknown as { __puterCalls: Array<{ model: string; messages: string }> }).__puterCalls);
  expect(calls.length).toBeGreaterThan(0);
  for (const call of calls) expect(call.model).toBe("meta/muse-spark-open");
  // Every pre-reveal call must carry the seal-safe nulls, never the sealed ids.
  for (const call of calls) {
    expect(call.messages).not.toContain('"sealedTargetId":"d-3"');
    expect(call.messages).not.toContain('"producedCardId":"d-3"');
  }
});

test("puter failure falls back to the scripted voice with no badge", async ({ page }) => {
  await page.route(/js\.puter\.com/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.puter = { ai: { chat: async () => { throw new Error("allowance exhausted"); } } };`
    })
  );
  await enterCountdown(page);
  await page.getByTestId("voice-opt-in-live").click();
  await expect(page.getByTestId("oracle-line")).toHaveAttribute("data-voice", "script");
  await expect(page.getByTestId("oracle-live-badge")).toHaveCount(0);
  await expect(page.getByTestId("oracle-live-unavailable")).toHaveText("Live writing unavailable. Using the written script.");
});
