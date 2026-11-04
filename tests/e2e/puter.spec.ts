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

test("a timed-out live attempt latches the scripted voice: later beats make no more calls", async ({ page }) => {
  test.setTimeout(45000);
  await page.route(/js\.puter\.com/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.__puterCalls = 0; window.puter = { ai: { chat: async () => { window.__puterCalls++; await new Promise(r => setTimeout(r, 30000)); return { message: { content: "late line" } }; } } };`
    })
  );
  await enterCountdown(page);
  await page.getByTestId("voice-opt-in-live").click();
  // The seal beat's call hangs past the 15s timeout: error -> latch -> visible notice.
  await expect(page.getByTestId("oracle-live-unavailable")).toBeVisible({ timeout: 25000 });
  await expect(page.getByTestId("oracle-line")).toHaveAttribute("data-voice", "script");
  // StrictMode double-invokes the seal-beat effect in dev: two attempts may be
  // in flight before the latch lands. The latch promise is what comes next:
  // once the failure notice is up, later beats must place no new calls
  // (no repeated popups, no repeated spend).
  const baseline = await page.evaluate(() => (window as unknown as { __puterCalls: number }).__puterCalls);
  await page.getByRole("button", { name: "Begin" }).click();
  await page.waitForTimeout(1500);
  const calls = await page.evaluate(() => (window as unknown as { __puterCalls: number }).__puterCalls);
  expect(calls).toBe(baseline);
  // The late answer, when it finally resolves, must not overwrite the scripted line.
  await page.waitForTimeout(16000);
  await expect(page.getByTestId("oracle-line")).toHaveAttribute("data-voice", "script");
  await expect(page.getByTestId("oracle-live-badge")).toHaveCount(0);
});
