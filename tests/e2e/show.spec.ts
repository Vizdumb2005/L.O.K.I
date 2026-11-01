import { expect, test, type Page } from "@playwright/test";

// Deterministic answers for the Three of Diamonds. Used only for the documentation
// screenshot so the reveal shot is reproducible instead of depending on a miss.
const THREE_OF_DIAMONDS: Record<string, string> = {
  "Project the card onto a dark screen in your mind. The ink coming off the face is warm crimson — red, not black.": "True of my card",
  "Stay with the center symbol — it swells at the top into two rounded lobes that meet in a soft heart.": "That's wrong",
  "Look at the symbol on that screen — it cuts into four straight, sharp-angled edges like a tilted diamond.": "True of my card",
  "The ink is cold and dark, rising to a single upward spearhead with a narrow stem — a spade.": "That's wrong",
  "Notice how open the face feels — mostly blank card stock, holding only one or two pips, an Ace or a Two.": "That's wrong",
  "The face feels fuller and more weighted — three or four pips filling the frame.": "True of my card",
  "Look at the very center of the face — the middle is open while the pips balance in even pairs, a Two or a Four.": "That's wrong",
  "Look at the dead center of the card face — a pip is pinned right in the middle, an odd rank, Ace or Three.": "True of my card",
  "All the surrounding space drops away, leaving one solitary emblem floating alone in the center — the Ace.": "That's wrong",
  "Two emblems face each other across an open middle — one high and one low, the Two.": "That's wrong",
  "Three emblems line up in a single vertical spine right down the center of the card — the Three.": "True of my card",
  "Four emblems anchor the four corners of the face, framing the middle like a square — the Four.": "That's wrong",
  "Glance at the corner index in your mind — it shows a number with multiple pips on the face, not the letter A.": "True of my card",
  "Trace the outer edge of the symbol — it rounds into a curve rather than cutting into four straight diamond angles.": "That's wrong",
  "Warm crimson ink on a fuller face — three or four red pips holding the frame.": "True of my card",
  "Cool black ink on a sparse, open face — only one or two dark spades.": "That's wrong",
  "Rounded crimson hearts filling the frame — three or four of them on the face.": "That's wrong",
  "Balanced pairs of crimson hearts — either two mirroring each other or four in the corners.": "That's wrong",
  "Sharp-angled red diamonds on a sparse face — just one or two on the card.": "That's wrong",
  "A single, solitary crimson emblem suspended in the center of an open white card — a red Ace.": "That's wrong",
  "Dark upward points crowding the frame — three or four black spades on the face.": "That's wrong"
};

async function answerThreeOfDiamonds(page: Page): Promise<void> {
  for (let step = 0; step < 40; step++) {
    await page.waitForTimeout(140);
    const reveal = page.getByRole("button", { name: "Reveal it" });
    if (await reveal.isVisible().catch(() => false)) {
      await reveal.click();
      const skip = page.getByRole("button", { name: "Skip ahead" }).first();
      if (await skip.isVisible().catch(() => false)) await skip.click();
      const turnOver = page.getByRole("button", { name: "Turn it over" });
      if (await turnOver.isVisible().catch(() => false)) await turnOver.click();
      await page.waitForTimeout(900);
      return;
    }

    const clean = page.getByRole("button", { name: "One clean claim" });
    if (await clean.isVisible().catch(() => false)) {
      await clean.click();
      continue;
    }

    const line = (await page.locator("#line-heading").innerText().catch(() => ""))
      .replace(/^One clean claim\.\s*/, "")
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

    // "I have chosen", "One clean claim", "Reveal it", "Continue" — all share
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

test("a full no-camera show reaches a reveal or an honest miss and offers Act II", async ({ page }) => {
  await page.goto("/");
  await page.getByText("I understand this is a", { exact: false }).click();
  await page.getByRole("button", { name: "Enter the observatory" }).click();

  await expect(page.locator("canvas, .flat-stage").first()).toBeVisible();
  await page.getByRole("button", { name: "I have chosen" }).click();
  await playToEnd(page);

  await expect(page.getByRole("button", { name: "Begin again" })).toBeVisible();
  const actTwo = page.getByRole("button", { name: "Continue to Act II: Ember Words" });
  await expect(actTwo).toBeVisible();
  await expect(page.getByText("There is no penalty for misleading me.", { exact: false })).toHaveCount(0);

  await actTwo.click();
  await expect(page.getByText("Ember Words", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "I have chosen" })).toBeVisible();
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

test("Ember sensory probes reveal Sun at desktop and mobile widths", async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByText("I understand this is a", { exact: false }).click();
    await page.getByText("Ember Words", { exact: true }).click();
    await page.getByRole("button", { name: "Enter the observatory" }).click();
    await page.getByRole("button", { name: "I have chosen" }).click();
    // Truthful answers for Sun. The policy may commit before the third impression.
    const sun: Record<string, string> = {
      "Hold the image of your word on that mental screen. It is one of the two permanent lights of the sky — the Sun or the Moon, ruling day or night — not a passing comet or an earthly bloom.": "Yes",
      "The scene around your image is dark — you are looking up into the night sky at the Moon or a streaking Comet, not standing in warm daylight.": "No",
      "There is fierce heat and active fire coming off the image — blazing solar light or a burning streak across space, the Sun or the Comet — rather than the quiet coolness of Moon or Flower.": "Yes",
      "Let the atmosphere around the image fill the screen — what pulls at your senses first: blazing daylight, silver night, a streaking tail, or living petals.": "Daylight",
      "Trace the outline of the image in your mind's eye — its silhouette is a golden disc, a pale crescent, a bright tail, or an opening bloom.": "Disc"
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
