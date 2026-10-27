import { expect, test, type Page } from "@playwright/test";

type Scenario = "permission-denied" | "play-rejected" | "model-assets-fail";

type FakeState = {
  scenario: Scenario;
  requests: number;
  stops: number;
  closes: number;
  playCalls: number;
  streams: Array<() => void>;
  wasmPaths: string[];
  modelPaths: string[];
};

async function openCameraLab(page: Page, scenario: Scenario): Promise<void> {
  await page.route(/\/node_modules\/.*tasks-vision.*\.js/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
        export const FilesetResolver = {
          forVisionTasks: async (path) => {
            window.fake.wasmPaths.push(path);
            return { path };
          }
        };
        export const FaceLandmarker = {
          createFromOptions: async (_fileset, options) => {
            window.fake.modelPaths.push(options.baseOptions.modelAssetPath);
            if (window.fake.scenario === "model-assets-fail") {
              throw new Error("Controlled model asset failure");
            }
            return {
              detectForVideo: () => ({ faceLandmarks: [] }),
              close: () => { window.fake.closes += 1; }
            };
          }
        };
      `
    })
  );

  await page.addInitScript((selectedScenario: Scenario) => {
    const state: FakeState = {
      scenario: selectedScenario,
      requests: 0,
      stops: 0,
      closes: 0,
      playCalls: 0,
      streams: [],
      wasmPaths: [],
      modelPaths: []
    };
    Object.assign(window, { fake: state });

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: () => {
          state.requests += 1;
          if (selectedScenario === "permission-denied" && state.requests === 1) {
            return Promise.reject(new DOMException("Permission denied by test", "NotAllowedError"));
          }
          return new Promise((resolve) => {
            state.streams.push(() => {
              const track = new EventTarget();
              Object.assign(track, { stop: () => { state.stops += 1; } });
              resolve({ getTracks: () => [track] });
            });
          });
        }
      }
    });

    Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
      configurable: true,
      get() { return null; },
      set(_value) { /* controlled stream */ }
    });

    HTMLMediaElement.prototype.play = function () {
      state.playCalls += 1;
      if (selectedScenario === "play-rejected") {
        return Promise.reject(new DOMException("Playback was rejected by test", "NotAllowedError"));
      }
      return Promise.resolve();
    };
  }, scenario);

  await page.goto("/");
  await page.getByRole("checkbox").nth(0).check();
  await page.getByRole("checkbox").nth(1).check();
  await page.getByRole("button", { name: "Enter the observatory" }).click();
  await page.getByRole("button", { name: "Camera lab", exact: false }).first().click();
}

async function stateValue<T>(page: Page, field: keyof FakeState): Promise<T> {
  return page.evaluate(
    (key) => (window as unknown as { fake: Record<string, unknown> }).fake[key] as T,
    field
  );
}

async function arrayLength(page: Page, field: "streams" | "wasmPaths" | "modelPaths"): Promise<number> {
  return page.evaluate(
    (key) => (window as unknown as { fake: Record<string, unknown[]> }).fake[key].length,
    field
  );
}

async function resolveNextStream(page: Page): Promise<void> {
  await expect.poll(() => arrayLength(page, "streams")).toBeGreaterThan(0);
  await page.evaluate(() => {
    (window as unknown as { fake: FakeState }).fake.streams.shift()!();
  });
}

test("camera: permission denial can be retried successfully", async ({ page }) => {
  await openCameraLab(page, "permission-denied");

  await page.getByRole("button", { name: "Open camera lab", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Permission denied by test");
  await expect(page.getByText("Camera is off.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open camera lab", exact: true })).toBeEnabled();
  expect(await stateValue<number>(page, "requests")).toBe(1);

  await page.getByRole("button", { name: "Open camera lab", exact: true }).click();
  await resolveNextStream(page);
  await expect(page.getByText(/Vision model ready \(local assets\)/)).toBeVisible();
  await expect(page.getByText("CAMERA ON · LOCAL ONLY")).toBeVisible();
  expect(await stateValue<number>(page, "requests")).toBe(2);

  await page.getByRole("button", { name: "Stop camera" }).click();
  expect(await stateValue<number>(page, "stops")).toBe(1);
  expect(await stateValue<number>(page, "closes")).toBe(1);
});

test("camera: rejected video.play releases the stream and skips model startup", async ({ page }) => {
  await openCameraLab(page, "play-rejected");

  await page.getByRole("button", { name: "Open camera lab", exact: true }).click();
  await resolveNextStream(page);
  await expect(page.getByRole("alert")).toContainText("Playback was rejected by test");
  await expect(page.getByText("Camera is off.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop camera" })).toHaveCount(0);
  expect(await stateValue<number>(page, "playCalls")).toBe(1);
  expect(await stateValue<number>(page, "stops")).toBe(1);
  expect(await arrayLength(page, "modelPaths")).toBe(0);
});

test("camera: preview remains available when both local and CDN model assets fail", async ({ page }) => {
  await openCameraLab(page, "model-assets-fail");

  await page.getByRole("button", { name: "Open camera lab", exact: true }).click();
  await resolveNextStream(page);
  await expect(page.getByText("Vision model or CDN unavailable. The preview still works; no gaze estimate is made.")).toBeVisible();
  await expect(page.getByText("CAMERA ON · LOCAL ONLY")).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop camera" })).toBeVisible();
  await expect(page.getByText("Camera is off.", { exact: true })).toHaveCount(0);

  expect(await stateValue<string[]>(page, "wasmPaths")).toEqual([
    "/mediapipe/wasm",
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
  ]);
  expect(await stateValue<string[]>(page, "modelPaths")).toEqual([
    "/mediapipe/face_landmarker.task",
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
  ]);
  expect(await stateValue<number>(page, "requests")).toBe(1);

  await page.getByRole("button", { name: "Stop camera" }).click();
  expect(await stateValue<number>(page, "stops")).toBe(1);
});
