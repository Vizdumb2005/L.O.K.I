import { chromium } from "playwright";

const stage = process.argv[2];
const BASE = "http://127.0.0.1:4173/L.O.K.I/";
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const ctx = await chromium.launchPersistentContext("/tmp/pw-voice-profile", {
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  viewport: { width: 1280, height: 800 }
});
const page = await ctx.newPage();
page.on("pageerror", (e) => log("pageerror:", String(e).slice(0, 200)));

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.getByText("Sensor-enabled performance", { exact: true }).click();
for (const cb of await page.locator(".check input[type=checkbox]").all()) await cb.check();
await page.getByRole("button", { name: /Enter with camera \+ mic/i }).click();
log("entered sensor mode");

if (stage === "a") {
  await page.getByRole("heading", { name: /Loading the on-device voice models/i }).waitFor({ timeout: 20000 });
  log("saw model-loading card");
  await page.getByRole("heading", { name: /Enroll your voice/i }).waitFor({ timeout: 95000 });
  log("models loaded, enrollment card visible");
  await page.screenshot({ path: "/tmp/voice-enroll.png" });
  await ctx.close();
  log("DONE-A");
  process.exit(0);
}

// stage b: models cached by stage a
await page.getByRole("heading", { name: /Enroll your voice/i }).waitFor({ timeout: 60000 });
await page.getByRole("button", { name: /Enroll my voice/i }).click();
log("recording enrollment (4s fake audio)");
await page.getByText(/Say the word|Choose privately/i).first().waitFor({ timeout: 40000 });
log("enrollment accepted, show content live");

const continueBtn = page.getByRole("button", { name: /Continue|I have chosen|One clean question/i });
for (let i = 0; i < 10; i++) {
  if (await page.getByText(/Listening for your answer/i).isVisible().catch(() => false)) break;
  if (await continueBtn.first().isVisible().catch(() => false)) { await continueBtn.first().click(); log("advanced", i); }
  await page.waitForTimeout(2200);
}
await page.getByText(/Listening for your answer/i).waitFor({ timeout: 20000 });
log("probe listening window visible");
await page.screenshot({ path: "/tmp/voice-listening.png" });

await page.getByText(/tap your answer instead/i).waitFor({ timeout: 45000 });
log("uncertain -> manual fallback shown (abstention-first)");
await page.screenshot({ path: "/tmp/voice-manual-fallback.png" });

await page.locator("button.choice").first().click();
log("manual tap answer accepted");

await page.getByRole("button", { name: /Forget my voice/i }).click();
await page.getByText(/Voice answers are off/i).waitFor({ timeout: 10000 });
log("forget-my-voice: disposed + mic released + manual labelled");
await page.screenshot({ path: "/tmp/voice-forgotten.png" });
await ctx.close();
log("DONE-B");
