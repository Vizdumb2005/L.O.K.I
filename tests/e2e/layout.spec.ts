import { expect, test } from "@playwright/test";

// MAJ-07: the landing CTA and the "I have chosen" control must sit fully inside the
// initial viewport at the audited sizes, and every interactive control must offer a
// >= 44px touch target. Measured, not assumed.

const VIEWPORTS = [
  { name: "desktop 1482x910", width: 1482, height: 910 },
  { name: "mobile 390x844", width: 390, height: 844 }
];

async function controlHeights(page: import("@playwright/test").Page): Promise<number[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("button:not([disabled])"))
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => (el as HTMLElement).getBoundingClientRect().height)
  );
}

for (const viewport of VIEWPORTS) {
  test.describe(`MAJ-07 layout at ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("landing CTA is fully inside the initial viewport", async ({ page }) => {
      await page.goto("/");
      const cta = page.getByRole("button", { name: /Enter the observatory/i });
      await expect(cta).toBeVisible();
      const box = await cta.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
      const heights = await page.evaluate(() => [document.documentElement.scrollHeight, window.innerHeight]);
      expect(heights[0]).toBeLessThanOrEqual(heights[1]);
    });

    test("'I have chosen' is fully inside the initial viewport in the think beat", async ({ page }) => {
      await page.goto("/");
      // The think beat belongs to the showrunner acts; pick one explicitly now
      // that the featured default is the countdown act.
      await page.locator("label.effect-choice", { hasText: "The Twelve" }).click();
      // Click demo: a single consent checkbox, then enter.
      const demo = page.getByRole("radio", { name: /click demo|no sensors/i });
      if (await demo.isVisible().catch(() => false)) await demo.check();
      const understood = page.getByRole("checkbox").first();
      if (await understood.isVisible().catch(() => false)) await understood.check();
      await page.getByRole("button", { name: /Enter the observatory/i }).click();
      const chosen = page.getByRole("button", { name: /I have chosen/i });
      await expect(chosen).toBeVisible();
      const box = await chosen.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
      const heights = await page.evaluate(() => [document.documentElement.scrollHeight, window.innerHeight]);
      expect(heights[0]).toBeLessThanOrEqual(heights[1]);
    });

    test("every visible interactive control is at least 44px tall", async ({ page }) => {
      await page.goto("/");
      // Same reasoning: the think-beat controls live in the showrunner acts.
      await page.locator("label.effect-choice", { hasText: "The Twelve" }).click();
      const understood = page.getByRole("checkbox").first();
      if (await understood.isVisible().catch(() => false)) await understood.check();
      await page.getByRole("button", { name: /Enter the observatory/i }).click();
      const chosen = page.getByRole("button", { name: /I have chosen/i });
      await expect(chosen).toBeVisible();
      const heights = await controlHeights(page);
      expect(heights.length).toBeGreaterThan(0);
      for (const h of heights) {
        expect(h).toBeGreaterThanOrEqual(44);
      }
    });
  });
}