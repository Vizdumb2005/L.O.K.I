import { expect, test, type Page } from "@playwright/test";

// Deterministic answers for the Three of Diamonds. Used only for the documentation
// screenshot so the reveal shot is reproducible instead of depending on a miss.
const THREE_OF_DIAMONDS: Record<string, string> = {
  "Don't tell me the card. Just let the symbol come forward - is it hearts, diamonds, or spades?": "Diamonds",
  "And its rank - ace, two, three, or four?": "Three",
  "Some cards feel warm, some feel cool. Does yours feel like one of the warm ones?": "Yes",
  "Stay with the symbol a moment. Could it be a heart?": "No",
  "Could it be a diamond?": "Yes",
  "Could it be a spade?": "No",
  "Think of its weight now. Does it sit low - an ace or a two?": "No",
  "Does it sit high - a three or a four?": "Yes",
  "Is its number even - a two or a four?": "No",
  "Is it odd - the ace or the three?": "Yes",
  "Could it be the ace?": "No",
  "Could it be the two?": "No",
  "Could it be the three?": "Yes",
  "Could it be the four?": "No",
  "Is its face a number rather than a letter?": "Yes",
  "Does the symbol curve, rather than cut into angles?": "No",
  "Is it a high red card - a red three or four?": "Yes",
  "Is it a low black card - a black ace or two?": "No",
  "A heart, and above a two?": "No",
  "A diamond, below a three?": "No",
  "Could it be a red ace?": "No",
  "A high spade - the three or the four?": "No"
};

async function answerThreeOfDiamonds(page: Page): Promise<void> {
  for (let step = 0; step < 40; step++) {
    await page.waitForTimeout(140);
    const reveal = page.getByRole("button", { name: "Reveal it" });
    if (await reveal.isVisible().catch(() => false)) {
      await reveal.click();
      await page.waitForTimeout(900);
      return;
    }

    const clean = page.getByRole("button", { name: "One clean question" });
    if (await clean.isVisible().catch(() => false)) {
      await clean.click();
      continue;
    }

    const line = (await page.locator("#line-heading").innerText().catch(() => ""))
      .replace(/^One clean question\.\s*/, "")
      .trim();
    const answer = THREE_OF_DIAMONDS[line];
    if (answer) {
      await page.locator("button.choice").filter({ hasText: new RegExp(`^\\s*\\d+\\s*${answer}\\s*$`) }).click();
      continue;
    }

    const primary = page.locator(".panel-actions button.primary");
    if (await primary.isVisible().catch(() => false)) {
      await primary.click();
      continue;
    }
    // A timed performer cue (acknowledgement) is showing; wait for the prompt.
  }
  throw new Error("the deterministic screenshot run did not reach a reveal");
}

async function playToEnd(page: Page): Promise<void> {
  for (let step = 0; step < 24; step++) {
    if (await page.getByRole("button", { name: "Begin again" }).isVisible().catch(() => false)) {
      return;
    }

    const choices = page.locator("button.choice");
    if ((await choices.count()) > 0) {
      await choices.first().click();
      await page.waitForTimeout(80);
      continue;
    }

    // "I have chosen", "One clean question", "Reveal it", "Continue" — all share
    // the primary action slot; the label changes by beat.
    const primary = page.locator(".panel-actions button.primary");
    if (await primary.isVisible().catch(() => false)) {
      await primary.click();
      await page.waitForTimeout(120);
      continue;
    }

    break;
  }
}

test("consent gate explains the illusion and keeps the camera off", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "LOKI", exact: true })).toBeVisible();
  await expect(page.getByText("It is an illusion, not mind reading.")).toBeVisible();
  await expect(page.getByText("Camera lab opt-in (optional).")).toBeVisible();
  await expect(page.getByText("No account is required. Nothing is uploaded.")).toBeVisible();

  const enter = page.getByRole("button", { name: "Enter the observatory" });
  await expect(enter).toBeDisabled();

  await page.getByText("I understand this is a", { exact: false }).click();
  await expect(enter).toBeEnabled();

  await enter.click();
  await expect(page.getByRole("button", { name: "I have chosen" })).toBeVisible();
  await expect(page.getByText("An illusion, not mind reading.", { exact: true })).toBeVisible();
});

test("a full no-camera show reaches a reveal or an honest miss", async ({ page }) => {
  await page.goto("/");
  await page.getByText("I understand this is a", { exact: false }).click();
  await page.getByRole("button", { name: "Enter the observatory" }).click();

  await expect(page.locator("canvas, .flat-stage").first()).toBeVisible();
  await page.getByRole("button", { name: "I have chosen" }).click();
  await playToEnd(page);

  await expect(page.getByRole("button", { name: "Begin again" })).toBeVisible();
  await expect(page.getByText("There is no penalty for misleading me.", { exact: false })).toHaveCount(0);
});

test("the toy effect runs through the same shell", async ({ page }) => {
  await page.goto("/");
  await page.getByText("I understand this is a", { exact: false }).click();
  await page.getByText("Ember Words", { exact: true }).click();
  await page.getByRole("button", { name: "Enter the observatory" }).click();

  await expect(page.getByText("Ember Words", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "I have chosen" }).click();
  await expect(page.locator("button.choice").first()).toBeVisible();
  await expect(page.locator("canvas, .flat-stage").first()).toBeVisible();
});

test("camera denial is handled without breaking the show", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: () =>
          Promise.reject(new DOMException("Permission denied by test", "NotAllowedError"))
      }
    });
  });

  await page.goto("/");
  await page.getByText("I understand this is a", { exact: false }).click();
  await page.getByText("Camera lab opt-in (optional).").click();
  await page.getByRole("button", { name: "Enter the observatory" }).click();
  await page.getByRole("button", { name: /Camera lab/ }).click();

  await expect(page.getByText("CLOSED", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open camera lab" }).click();
  await expect(page.getByRole("alert")).toContainText("show works without it");
  await expect(page.getByText("Camera is off.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop camera" })).toHaveCount(0);
});

test("desktop and mobile screenshots are captured for inspection", async ({ page }) => {
  await page.goto("/");
  await page.screenshot({ path: "docs/screenshots/consent-desktop.png", fullPage: true });

  await page.getByText("I understand this is a", { exact: false }).click();
  await page.getByRole("button", { name: "Enter the observatory" }).click();
  await page.waitForTimeout(1400);
  await page.screenshot({ path: "docs/screenshots/stage-desktop.png" });
  await page.getByRole("button", { name: "I have chosen" }).click();
  await answerThreeOfDiamonds(page);
  await expect(page.getByText("The reveal", { exact: true })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/reveal-desktop.png" });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.screenshot({ path: "docs/screenshots/consent-mobile.png", fullPage: true });
  await page.getByText("I understand this is a", { exact: false }).click();
  await page.getByRole("button", { name: "Enter the observatory" }).click();
  await page.waitForTimeout(1400);
  await page.screenshot({ path: "docs/screenshots/stage-mobile.png" });
});

test("Ember spelling probes reveal Sun at desktop and mobile widths", async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByText("I understand this is a", { exact: false }).click();
    await page.getByText("Ember Words", { exact: true }).click();
    await page.getByRole("button", { name: "Enter the observatory" }).click();
    await page.getByRole("button", { name: "I have chosen" }).click();
    // Truthful answers for Sun. The policy may commit before the third question.
    const sun: Record<string, string> = {
      "Does the word end in the letter n?": "Yes",
      "Does the word contain the letter m?": "No",
      "Does the word have an odd number of letters?": "Yes",
      "Which letter does the word start with: S, M, C or F?": "S",
      "How many letters does the word have: 3, 4, 5 or 6?": "3"
    };
    const reveal = page.getByRole("button", { name: "Reveal it" });
    for (let i = 0; i < 3 && !(await reveal.isVisible().catch(() => false)); i++) {
      await expect(page.locator("button.choice").first()).toBeVisible();
      // displayLine updates in an effect: wait for a complete current probe caption.
      await expect.poll(async () => Object.keys(sun).includes((await page.locator("#line-heading").innerText()).trim())).toBe(true);
      const prompt = (await page.locator("#line-heading").innerText()).trim();
      await page.locator("button.choice").filter({ hasText: new RegExp(`^\\s*\\d+\\s*${sun[prompt]}\\s*$`) }).click();
      await expect(page.locator("#line-heading")).not.toHaveText(prompt);
    }
    await page.getByRole("button", { name: "Reveal it" }).click();
    await expect(page.locator("#line-heading")).toHaveText("Your word was Sun.");
    await expect(page.locator("canvas, .flat-stage").first()).toBeVisible();
  }
});

test("silent choice exposes readable generic labels without capturing a selection", async ({ page }) => {
  for (const effect of [{ name: "The Twelve", count: 12 }, { name: "Ember Words", count: 4 }]) {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/");
    await page.getByText("I understand this is a", { exact: false }).click();
    await page.getByText(effect.name, { exact: true }).click();
    await page.getByRole("button", { name: "Enter the observatory" }).click();
    const roster = page.getByRole("region", { name: "Choose privately" });
    await expect(roster).toBeVisible();
    await expect(roster.getByRole("listitem")).toHaveCount(effect.count);
    await expect(roster.getByRole("button")).toHaveCount(0);
    await expect(roster.getByRole("radio")).toHaveCount(0);
    const labels = await roster.getByRole("listitem").evaluateAll(items => items.map(item => ({
      text: item.textContent?.trim(),
      font: parseFloat(getComputedStyle(item).fontSize),
      fits: item.scrollWidth <= item.clientWidth,
      selectable: item.hasAttribute("tabindex") || item.hasAttribute("aria-selected")
    })));
    expect(labels.every(label => Boolean(label.text) && label.font >= 16 && label.fits && !label.selectable)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "I have chosen" }).click();
    await expect(roster).toHaveCount(0);
    await expect(page.locator("button.choice").first()).toBeVisible();
  }
});

test("keyboard-only: number keys answer while an answer button has focus", async ({ page }) => {
  await page.goto("/");
  await page.getByText("I understand this is a", { exact: false }).click();
  await page.getByRole("button", { name: "Enter the observatory" }).click();
  await page.getByRole("button", { name: "I have chosen" }).click();
  await expect(page.locator("button.choice").first()).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.locator("button.choice:focus")).toHaveCount(1);
  const before = (await page.locator("#line-heading").innerText()).trim();
  await page.keyboard.press("1");
  await expect(page.locator("#line-heading")).not.toHaveText(before);
});
