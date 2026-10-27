import { expect, test, type Page } from "@playwright/test";

// Controlled streams and models only. No physical camera or remote model requests.
async function lab(page: Page) {
  await page.route(/\/node_modules\/.*tasks-vision.*\.js/, route => route.fulfill({
    contentType: "application/javascript",
    body: `export const FilesetResolver = {forVisionTasks: async () => ({})};
      export const FaceLandmarker = {createFromOptions: () => new Promise(resolve => {
        window.fake.models.push(() => resolve({detectForVideo: () => ({faceLandmarks: []}),
          close: () => { window.fake.closed += 1; }}));
      })};`
  }));
  await page.addInitScript(() => {
    const state = {
      requests: 0, stops: 0, closed: 0, playPending: false,
      streams: [] as Array<() => void>, models: [] as Array<() => void>,
      plays: [] as Array<() => void>, tracks: [] as EventTarget[]
    };
    Object.assign(window, { fake: state });
    Object.defineProperty(navigator, "mediaDevices", { value: {
      getUserMedia: () => { state.requests++; return new Promise(resolve => {
        state.streams.push(() => {
          const track = new EventTarget();
          Object.assign(track, { stop: () => { state.stops++; } });
          state.tracks.push(track);
          resolve({ getTracks: () => [track] });
        });
      }); }
    }});
    Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
      configurable: true, get() { return null; }, set(_value) { /* controlled stream */ }
    });
    HTMLMediaElement.prototype.play = function () {
      return state.playPending ? new Promise(resolve => state.plays.push(resolve)) : Promise.resolve();
    };
  });
  await page.goto("/");
  await page.getByRole("checkbox").nth(0).check();
  await page.getByRole("checkbox").nth(1).check();
  await page.getByRole("button", { name: "Enter the observatory" }).click();
  await page.getByRole("button", { name: "Camera lab", exact: false }).first().click();
}
// Read the controlled fixture without putting test-only hooks in the application.
async function value(page: Page, field: string) {
  return page.evaluate(key => (window as unknown as {fake: Record<string, number>}).fake[key], field);
}
async function resolveNext(page: Page, field: "streams" | "models" | "plays") {
  await expect.poll(() => page.evaluate(key =>
    (window as unknown as {fake: Record<string, Array<() => void>>}).fake[key].length, field)).toBeGreaterThan(0);
  await page.evaluate(key => (window as unknown as {fake: Record<string, Array<() => void>>}).fake[key].shift()!(), field);
}

test("camera: duplicate opening is blocked and pending permission can be cancelled", async ({ page }) => {
  await lab(page);
  await page.getByRole("button", { name: "Open camera lab", exact: true }).click();
  await expect(page.getByRole("button", { name: "Opening camera" })).toBeDisabled();
  expect(await value(page, "requests")).toBe(1);
  await page.getByRole("button", { name: "Cancel opening" }).click();
  await resolveNext(page, "streams");
  await expect.poll(() => value(page, "stops")).toBe(1);
  await expect(page.getByText("Camera is off.", { exact: true })).toBeVisible();
});

test("camera: navigation releases a late permission stream", async ({ page }) => {
  await lab(page);
  await page.getByRole("button", { name: "Open camera lab", exact: true }).click();
  await page.getByRole("button", { name: "Back to the show" }).click();
  await resolveNext(page, "streams");
  await expect.poll(() => value(page, "stops")).toBe(1);
  expect(await value(page, "closed")).toBe(0);
});

test("camera: stopping during video.play prevents model startup", async ({ page }) => {
  await lab(page);
  await page.evaluate(() => { (window as unknown as {fake: {playPending: boolean}}).fake.playPending = true; });
  await page.getByRole("button", { name: "Open camera lab", exact: true }).click();
  await resolveNext(page, "streams");
  await page.getByRole("button", { name: "Stop camera" }).click();
  await resolveNext(page, "plays");
  await expect(page.getByText("Camera is off.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as {fake: {models: unknown[]}}).fake.models.length)).toBe(0);
});

test("camera: a stopped model load cannot revive the lab or disrupt a restart", async ({ page }) => {
  await lab(page);
  await page.getByRole("button", { name: "Open camera lab", exact: true }).click();
  await resolveNext(page, "streams");
  await expect.poll(() => page.evaluate(() => (window as unknown as {fake: {models: unknown[]}}).fake.models.length)).toBe(1);
  await page.getByRole("button", { name: "Stop camera" }).click();
  await page.getByRole("button", { name: "Open camera lab", exact: true }).click();
  await resolveNext(page, "streams");
  await resolveNext(page, "models"); // stale model must close, not install
  await expect.poll(() => value(page, "closed")).toBe(1);
  await resolveNext(page, "models");
  await expect(page.getByText(/Vision model ready/)).toBeVisible();
  expect(await value(page, "stops")).toBe(1);
  await page.getByRole("button", { name: "Stop camera" }).click();
  await expect.poll(() => value(page, "closed")).toBe(2);
  expect(await value(page, "stops")).toBe(2);
});

test("camera: externally ended track invalidates its pending model", async ({ page }) => {
  await lab(page);
  await page.getByRole("button", { name: "Open camera lab", exact: true }).click();
  await resolveNext(page, "streams");
  await page.evaluate(() => (window as unknown as {fake: {tracks: EventTarget[]}}).fake.tracks[0]!.dispatchEvent(new Event("ended")));
  await resolveNext(page, "models");
  await expect.poll(() => value(page, "closed")).toBe(1);
  await expect(page.getByText("Camera is off.", { exact: true })).toBeVisible();
});
