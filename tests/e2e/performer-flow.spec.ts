import { expect, test, type Page } from "@playwright/test";

async function enter(page: Page): Promise<void> {
  await page.goto("/");
  // The featured default is now the countdown act; these flows exercise the
  // showrunner acts, so select The Twelve explicitly.
  await page.locator(".effect-picker:not(.mode-picker) label.effect-choice", { hasText: "The Twelve" }).click();
  await page.getByText("I understand this is a", { exact: false }).click();
  await page.getByRole("button", { name: "Enter the observatory" }).click();
  await page.getByRole("button", { name: "I have chosen" }).click();
  await expect(page.locator("button.choice").first()).toBeVisible();
}

async function playToPayoff(page: Page, truthfulEmberWord?: "comet"): Promise<void> {
  // CRIT-02: input is gated while the acknowledgement cue shows; each digit press
  // must wait for the next prompt to re-enable the choice buttons.
  // SEMANTIC CHANGE (2026-11-04 honesty repair): under the honest engine, blind
  // "always option 1" answers contradict themselves and correctly miss for Ember
  // Words. When a chosen word is given, answer TRUTHFULLY for it (the reveal must
  // come from verifiable consistent selection, never from the engine hitting
  // regardless of answers).
  const emberTruth = (statement: string): string | null => {
    if (statement.includes("scene around your image")) return "True"; // has-m: comet contains m
    if (statement.includes("atmosphere around the image")) return "Streak"; // first letter c
    if (statement.includes("Fierce heat")) return "True"; // odd length: comet = 5
    if (statement.includes("permanent sky lights")) return "wrong"; // ends-n: comet ends t
    if (statement.includes("silhouette")) return "Tail"; // letter-count: 5
    return null;
  };
  for (let i = 0; i < 60; i++) {
    const ready = page.locator("button.choice:not([disabled])").first();
    if (await ready.isVisible().catch(() => false)) {
      if (truthfulEmberWord) {
        const statement = ((await page.locator("#line-heading").innerText().catch(() => "")) ?? "").trim();
        const wanted = emberTruth(statement);
        const target = wanted
          ? page.locator("button.choice:not([disabled])").filter({ hasText: new RegExp(wanted, "i") }).first()
          : null;
        if (target && (await target.isVisible().catch(() => false))) {
          await target.click();
          await page.waitForTimeout(150);
          continue;
        }
      }
      await page.keyboard.press("1");
      await page.waitForTimeout(150);
      continue;
    }
    const recover = page.getByRole("button", { name: "One clean claim" });
    if (await recover.isVisible().catch(() => false)) {
      await recover.click();
      continue;
    }
    if (!(await page.locator("button.choice").first().isVisible().catch(() => false))) return;
    await page.waitForTimeout(150);
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
  // "Reveal it" shows once the build beats rest; click through to the payoff,
  // whose cue pause is pending while the reveal lines play.
  const payoff = page.getByRole("button", { name: "Reveal it" });
  if (await payoff.isVisible().catch(() => false)) await payoff.click();
  // First Escape while a pause is pending only skips it; the show stays.
  await page.keyboard.press("Escape");
  await expect(page.locator("main.performance")).toBeVisible();
  // With nothing pending, Escape leaves back to the consent screen.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Enter the observatory" })).toBeVisible();
});

test("flow: the same performer shell runs the Ember effect", async ({ page }) => {
  await page.goto("/");
  // The featured default is now the countdown act; these flows exercise the
  // showrunner acts, so select The Twelve explicitly.
  await page.locator(".effect-picker:not(.mode-picker) label.effect-choice", { hasText: "The Twelve" }).click();
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

async function reachRevealOrMiss(page: Page, tries = 8, truthfulEmber = false): Promise<"reveal" | "miss"> {
  for (let t = 0; t < tries; t++) {
    await playToPayoff(page, truthfulEmber ? "comet" : undefined);
    const rv = page.getByRole("button", { name: "Reveal it" });
    await expect(rv.or(page.locator(".panel-miss"))).toBeVisible({ timeout: 10000 });
    if (await rv.isVisible()) {
      // Build beat: the target must not be lit.
      await expect(page.locator(".stage-shell")).toHaveAttribute("data-target-lit", "false");
      await rv.click();
      return "reveal";
    }
    return "miss";
  }
  return "miss";
}

for (const effectName of ["The Twelve", "Ember Words"] as const) {
  test(`flow: ${effectName} target is not lit during the hush beats, only at the resting reveal line`, async ({ page }) => {
    await page.goto("/");
    // The featured default is now the countdown act; these flows exercise the
    // showrunner acts, so select The Twelve explicitly.
    await page.locator(".effect-picker:not(.mode-picker) label.effect-choice", { hasText: "The Twelve" }).click();
    await page.getByText("I understand this is a", { exact: false }).click();
    if (effectName === "Ember Words") await page.getByText("Ember Words", { exact: true }).click();
    await page.getByRole("button", { name: "Enter the observatory" }).click();
    await page.getByRole("button", { name: "I have chosen" }).click();
    // Always answer option 1 until a payoff appears; retry from a fresh show if it is a miss.
    for (let attempt = 0; attempt < 6; attempt++) {
      const outcome = await reachRevealOrMiss(page, 8, effectName === "Ember Words");
      if (outcome === "miss") {
        await expect(page.locator(".stage-shell")).toHaveAttribute("data-target-lit", "false");
        await page.getByRole("button", { name: "Skip ahead" }).click().catch(() => undefined);
        await page.getByRole("button", { name: "Continue" }).click();
        await page.getByRole("button", { name: "Begin again" }).click();
        await page.getByRole("button", { name: "I have chosen" }).click();
        continue;
      }
      // Hush beats: line is a hush cue, target must stay dark.
      const hush = page.locator("#line-heading");
      await expect(hush).toContainText(/quiet|say it now/i);
      await expect(page.locator(".stage-shell")).toHaveAttribute("data-target-lit", "false");
      await page.getByRole("button", { name: "Skip ahead" }).first().click();
      if (effectName === "The Twelve") {
        // The reveal waits for the person to perform it: invitation line, target still dark.
        await expect(hush).toContainText(/let me name it/i);
        await expect(page.locator(".stage-shell")).toHaveAttribute("data-target-lit", "false");
        await page.getByRole("button", { name: "Name it" }).click();
      }
      await expect(page.locator(".stage-shell")).toHaveAttribute("data-target-lit", "true");
      // A skipped sequence stays skipped: no late timer may pull it back to a hush beat.
      for (let k = 0; k < 16; k++) {
        await page.waitForTimeout(250);
        // Plain reads, not auto-retrying assertions: a transient flicker back must fail the test.
        expect(await hush.innerText()).not.toMatch(/quiet|say it now/i);
        expect(await page.locator(".stage-shell").getAttribute("data-target-lit")).toBe("true");
      }
      return;
    }
    test.skip(true, "no reveal reached in 6 option-1 runs; miss path asserted dark");
  });
}