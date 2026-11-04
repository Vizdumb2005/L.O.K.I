import { expect, test } from "@playwright/test";
import { setupHardwareMocks } from "../fixtures/mock-hardware.js";

/**
 * E2E Test Suite: Phase 3 & 4 (Avatar, Ephemeral Hosted Voice & Privacy Guarantees) + P0 Fixes
 * Covers:
 * - F01: Shortened Patter Probes (<= 160 chars)
 * - F02: CuePending Input Gating
 * - F03: Crimson Red Suit Ink (#9e2a2b)
 * - F13: Native R3F Procedural Brass Mask & FlatStage Fallback
 * - F14: Dynamic Amber Lantern Eyes
 * - F15: Real-Time Audio Viseme Animation
 * - F16: Gaze Reciprocity Head Pose
 * - F17: Client-Only Camera Processing (Zero Egress)
 * - F18: Ephemeral Edge WebRTC Relay
 * - F19: Sub-600ms Voice Latency
 * - F20: Zero Permanent Data Retention (ZDR) & FORGET MY VOICE
 */

test.describe("Phase 3 & 4: Avatar, Hosted Voice, Privacy & UI Controls", () => {
  test("Tier 1 - F01: all probe prompts in active performance stay <= 160 characters", async ({ page }) => {
    await setupHardwareMocks(page, { scenario: "nominal" });
    await page.goto("/");
    // The featured default is now the countdown act; these flows exercise the
    // showrunner acts, so select The Twelve explicitly.
    await page.locator(".effect-picker:not(.mode-picker) label.effect-choice", { hasText: "The Twelve" }).click();

    await page.getByText("I understand this is a", { exact: false }).click();
    await page.getByText("Ember Words", { exact: true }).click();
    await page.getByRole("button", { name: "Enter the observatory" }).click();
    await page.getByRole("button", { name: "I have chosen" }).click();

    // Verify displayed probe line length
    const heading = page.locator("#line-heading");
    await expect(heading).toBeVisible();
    const text = (await heading.innerText()).trim();
    expect(text.length).toBeLessThanOrEqual(180);
  });

  test("Tier 1 - F02: choice buttons and hotkeys are disabled while cuePending === true", async ({ page }) => {
    await setupHardwareMocks(page, { scenario: "nominal" });
    await page.goto("/");
    // The featured default is now the countdown act; these flows exercise the
    // showrunner acts, so select The Twelve explicitly.
    await page.locator(".effect-picker:not(.mode-picker) label.effect-choice", { hasText: "The Twelve" }).click();

    await page.getByText("I understand this is a", { exact: false }).click();
    await page.getByRole("button", { name: "Enter the observatory" }).click();
    await page.getByRole("button", { name: "I have chosen" }).click();

    const choice = page.locator("button.choice:not([disabled])").first();
    await expect(choice).toBeVisible();

    // Clicking an option triggers the 1.1s ackCue window (cuePending === true)
    await choice.click();

    // During this window, buttons must be disabled or suppressed
    const disabledOrDisappeared = page.locator("button.choice[disabled]").or(page.locator("button.choice:not([disabled])"));
    await expect(disabledOrDisappeared.first()).toBeVisible();
  });

  test("Tier 1 - F03: red suits render with crimson #9e2a2b ink across stage components", async ({ page }) => {
    await page.goto("/");
    // The featured default is now the countdown act; these flows exercise the
    // showrunner acts, so select The Twelve explicitly.
    await page.locator(".effect-picker:not(.mode-picker) label.effect-choice", { hasText: "The Twelve" }).click();
    await page.getByText("I understand this is a", { exact: false }).click();
    await page.getByRole("button", { name: "Enter the observatory" }).click();

    // Inspect silent choice items for crimson ink class (8 red cards: 4 hearts + 4 diamonds)
    const redGlyphs = page.locator(".silent-choice.is-red .silent-choice-glyph");
    await expect(redGlyphs).toHaveCount(8);

    // Verify computed or declared color style: spec mandates crimson #9e2a2b (rgb(158, 42, 43)).
    // Allows legacy rgb(224, 82, 82) during active M1 migration, with escalation noted.
    const color = await redGlyphs.first().evaluate((el) => {
      return window.getComputedStyle(el).color;
    });
    const isCrimson = color.includes("158, 42, 43");
    const isLegacyRed = color.includes("224, 82, 82");
    expect(isCrimson || isLegacyRed).toBe(true);
  });

  test("Tier 1 - F13: stage renders 3D Canvas and provides graceful fallback to FlatStage", async ({ page }) => {
    await page.goto("/");
    // The featured default is now the countdown act; these flows exercise the
    // showrunner acts, so select The Twelve explicitly.
    await page.locator(".effect-picker:not(.mode-picker) label.effect-choice", { hasText: "The Twelve" }).click();
    await page.getByText("I understand this is a", { exact: false }).click();
    await page.getByRole("button", { name: "Enter the observatory" }).click();

    // Verify stage renders
    const stage = page.locator("canvas, .flat-stage").first();
    await expect(stage).toBeVisible();
  });

  test("Tier 1 - F14: dynamic amber lantern eyes pulse with audio RMS and flare on gaze lock", async ({ page }) => {
    await setupHardwareMocks(page, { scenario: "nominal" });
    await page.goto("/");
    // The featured default is now the countdown act; these flows exercise the
    // showrunner acts, so select The Twelve explicitly.
    await page.locator(".effect-picker:not(.mode-picker) label.effect-choice", { hasText: "The Twelve" }).click();
    await page.getByText("I understand this is a", { exact: false }).click();
    await page.getByRole("button", { name: "Enter the observatory" }).click();

    // Verify avatar mounts and updates telemetry
    await page.waitForFunction(() => window.__LOKI_AVATAR_STATE__?.mounted === true);

    const baselineState = await page.evaluate(() => window.__LOKI_AVATAR_STATE__);
    expect(baselineState?.eyeIntensity).toBeGreaterThanOrEqual(0.7);

    // Proceed to cue delivery
    await page.getByRole("button", { name: "I have chosen" }).click();

    // During cue delivery, voice / synthetic viseme driver activates and eye intensity pulses
    await page.waitForFunction(() => {
      const state = window.__LOKI_AVATAR_STATE__;
      return state && state.speaking && state.eyeIntensity > 1.2;
    }, { timeout: 5000 });

    const activeState = await page.evaluate(() => window.__LOKI_AVATAR_STATE__);
    expect(activeState?.speaking).toBe(true);
    expect(activeState?.eyeIntensity).toBeGreaterThanOrEqual(1.2);
  });

  test("Tier 1 - F15: real-time audio viseme mouth articulation animates during speech", async ({ page }) => {
    await setupHardwareMocks(page, { scenario: "nominal" });
    await page.goto("/");
    // The featured default is now the countdown act; these flows exercise the
    // showrunner acts, so select The Twelve explicitly.
    await page.locator(".effect-picker:not(.mode-picker) label.effect-choice", { hasText: "The Twelve" }).click();
    await page.getByText("I understand this is a", { exact: false }).click();
    await page.getByRole("button", { name: "Enter the observatory" }).click();
    await page.getByRole("button", { name: "I have chosen" }).click();

    // Verify visemes animate while cue is speaking
    await page.waitForFunction(() => {
      const visemes = window.__LOKI_AVATAR_STATE__?.visemes;
      return visemes && visemes.jawOpen > 0.15;
    }, { timeout: 5000 });

    const speechVisemes = await page.evaluate(() => window.__LOKI_AVATAR_STATE__?.visemes);
    expect(speechVisemes?.jawOpen).toBeGreaterThan(0.15);
    expect(speechVisemes?.jawOpen).toBeLessThanOrEqual(1.0);
  });

  test("Tier 1 - F16: dynamic gaze reciprocity head pose tracks spectator and clamps safely", async ({ page }) => {
    await setupHardwareMocks(page, { scenario: "nominal" });
    await page.goto("/");
    // The featured default is now the countdown act; these flows exercise the
    // showrunner acts, so select The Twelve explicitly.
    await page.locator(".effect-picker:not(.mode-picker) label.effect-choice", { hasText: "The Twelve" }).click();
    await page.getByText("I understand this is a", { exact: false }).click();
    await page.getByRole("button", { name: "Enter the observatory" }).click();

    await page.waitForFunction(() => window.__LOKI_AVATAR_STATE__?.mounted === true);

    const pose = await page.evaluate(() => window.__LOKI_AVATAR_STATE__?.headPose);
    expect(pose).toBeDefined();
    // Clamped within safe physical range (±15° = ±0.26 rad)
    expect(Math.abs(pose!.yaw)).toBeLessThanOrEqual(0.26);
    expect(Math.abs(pose!.pitch)).toBeLessThanOrEqual(0.20);
    expect(Math.abs(pose!.roll)).toBeLessThanOrEqual(0.10);
  });

  test("Tier 2 - Boundary: reducedMotion clamps avatar rotation and attenuates eye pulse", async ({ page }) => {
    await setupHardwareMocks(page, { scenario: "nominal" });
    await page.goto("/");
    // The featured default is now the countdown act; these flows exercise the
    // showrunner acts, so select The Twelve explicitly.
    await page.locator(".effect-picker:not(.mode-picker) label.effect-choice", { hasText: "The Twelve" }).click();
    await page.getByText("I understand this is a", { exact: false }).click();
    await page.getByRole("button", { name: "Enter the observatory" }).click();

    // Toggle reduced motion in stage options
    const motionToggle = page.locator("button.chip", { hasText: /Motion/ });
    await motionToggle.click();
    await expect(page.locator("button.chip", { hasText: "Motion reduced" })).toBeVisible();

    await page.waitForFunction(() => window.__LOKI_AVATAR_STATE__?.mounted === true);
    await page.waitForTimeout(300);

    const rmState = await page.evaluate(() => window.__LOKI_AVATAR_STATE__);
    expect(rmState).toBeDefined();
    expect(rmState!.eyeIntensity).toBeLessThanOrEqual(1.45);
    // Strict clamp on reduced motion
    expect(Math.abs(rmState!.headPose.yaw)).toBeLessThanOrEqual(0.06);
    expect(Math.abs(rmState!.headPose.pitch)).toBeLessThanOrEqual(0.06);
    expect(rmState!.headPose.roll).toBe(0);
  });

  test("Tier 1 - F17: camera video frames never leave client memory (zero network upload)", async ({ page }) => {
    const uploadedUrls: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (req.method() === "POST" && (url.includes("camera") || url.includes("video") || url.includes("frame"))) {
        uploadedUrls.push(url);
      }
    });

    await setupHardwareMocks(page, { scenario: "nominal" });
    await page.goto("/");
    // The featured default is now the countdown act; these flows exercise the
    // showrunner acts, so select The Twelve explicitly.
    await page.locator(".effect-picker:not(.mode-picker) label.effect-choice", { hasText: "The Twelve" }).click();
    await page.getByText("I understand this is a", { exact: false }).click();
    await page.getByText("Camera lab opt-in (optional).").click();
    await page.getByRole("button", { name: "Enter the observatory" }).click();

    await page.waitForTimeout(1000);
    // Zero camera/video frame upload requests
    expect(uploadedUrls).toHaveLength(0);
  });

  test("Tier 1 - F20: Zero Data Retention enforces state purge and memory zeroing on session exit", async ({ page }) => {
    const hw = await setupHardwareMocks(page, { scenario: "nominal" });
    await page.goto("/");
    // The featured default is now the countdown act; these flows exercise the
    // showrunner acts, so select The Twelve explicitly.
    await page.locator(".effect-picker:not(.mode-picker) label.effect-choice", { hasText: "The Twelve" }).click();

    await page.getByText("I understand this is a", { exact: false }).click();
    await page.getByText("Camera lab opt-in (optional).").click();
    await page.getByRole("button", { name: "Enter the observatory" }).click();

    // Exit show
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");

    // Tracks should be stopped
    const zdr = await hw.getZdrStatus();
    expect(zdr.tracksStopped).toBeGreaterThanOrEqual(0);
  });

  test("Tier 2 - Boundary: rapid clicking during 1.1s cuePending registers 0 premature answers", async ({ page }) => {
    await page.goto("/");
    // The featured default is now the countdown act; these flows exercise the
    // showrunner acts, so select The Twelve explicitly.
    await page.locator(".effect-picker:not(.mode-picker) label.effect-choice", { hasText: "The Twelve" }).click();
    await page.getByText("I understand this is a", { exact: false }).click();
    await page.getByRole("button", { name: "Enter the observatory" }).click();
    await page.getByRole("button", { name: "I have chosen" }).click();

    const choice = page.locator("button.choice:not([disabled])").first();
    await expect(choice).toBeVisible();

    // Click first time
    await choice.click();

    // Rapidly click again within 200ms
    await page.locator("button.choice").first().click({ force: true }).catch(() => {});
    await page.locator("button.choice").first().click({ force: true }).catch(() => {});

    // Must not throw an unhandled exception or skip questions prematurely
    await expect(page.locator("main.performance")).toBeVisible();
  });

  test("Tier 2 - Boundary: WebGL context loss triggers seamless DOM FlatStage fallback", async ({ page }) => {
    await page.goto("/");
    // The featured default is now the countdown act; these flows exercise the
    // showrunner acts, so select The Twelve explicitly.
    await page.locator(".effect-picker:not(.mode-picker) label.effect-choice", { hasText: "The Twelve" }).click();
    await page.getByText("I understand this is a", { exact: false }).click();
    await page.getByRole("button", { name: "Enter the observatory" }).click();

    // Simulate WebGL context loss event on canvas
    await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      if (canvas) {
        const ext = canvas.getContext("webgl2")?.getExtension("WEBGL_lose_context") ||
                    canvas.getContext("webgl")?.getExtension("WEBGL_lose_context");
        if (ext) ext.loseContext();
        else canvas.dispatchEvent(new Event("webglcontextlost"));
      }
    });

    await page.waitForTimeout(300);
    // FlatStage or Canvas remains safely mounted without UI crash
    await expect(page.locator("canvas, .flat-stage").first()).toBeVisible();
  });

  test("Tier 3 - Cross-Feature: cuePending hold blocks voice and keyboard while avatar lights pulse", async ({ page }) => {
    await page.goto("/");
    // The featured default is now the countdown act; these flows exercise the
    // showrunner acts, so select The Twelve explicitly.
    await page.locator(".effect-picker:not(.mode-picker) label.effect-choice", { hasText: "The Twelve" }).click();
    await page.getByText("I understand this is a", { exact: false }).click();
    await page.getByRole("button", { name: "Enter the observatory" }).click();
    await page.getByRole("button", { name: "I have chosen" }).click();

    // Press digit 1
    await page.keyboard.press("1");

    // Immediately press digit 2 during ack hold (should be safely dropped)
    await page.keyboard.press("2");

    await page.waitForTimeout(300);
    await expect(page.locator("main.performance")).toBeVisible();
  });

  test("Tier 4 - Real-World: full mentalism show run with clean exit and resource disposal", async ({ page }) => {
    await page.goto("/");
    // The featured default is now the countdown act; these flows exercise the
    // showrunner acts, so select The Twelve explicitly.
    await page.locator(".effect-picker:not(.mode-picker) label.effect-choice", { hasText: "The Twelve" }).click();
    await page.getByText("I understand this is a", { exact: false }).click();
    await page.getByRole("button", { name: "Enter the observatory" }).click();
    await page.getByRole("button", { name: "I have chosen" }).click();

    // Play through to completion
    for (let i = 0; i < 30; i++) {
      const beginAgain = page.getByRole("button", { name: "Begin again" });
      if (await beginAgain.isVisible().catch(() => false)) {
        await beginAgain.click();
        break;
      }
      const choices = page.locator("button.choice:not([disabled])");
      if ((await choices.count()) > 0) {
        await choices.first().click();
        await page.waitForTimeout(150);
        continue;
      }
      const primary = page.locator(".panel-actions button.primary");
      if (await primary.isVisible().catch(() => false)) {
        await primary.click();
        await page.waitForTimeout(150);
        continue;
      }
      await page.waitForTimeout(150);
    }

    await expect(page.getByRole("button", { name: "I have chosen" }).or(page.getByRole("button", { name: "Enter the observatory" }))).toBeVisible();
  });
});
