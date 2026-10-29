import { chromium } from "playwright";
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

await page.getByRole("heading", { name: /Enroll your voice/i }).waitFor({ timeout: 60000 });
await page.screenshot({ path: "/tmp/v2-enroll.png" });
await page.getByRole("button", { name: /Enroll my voice/i }).click();
log("recording enrollment (4s fake audio)");
await page.getByText(/Say the word|Choose privately/i).first().waitFor({ timeout: 40000 });
log("enrollment accepted, show live");

const continueBtn = page.getByRole("button", { name: /Continue|I have chosen|One clean/i });
for (let i = 0; i < 10; i++) {
  if (await page.getByText(/Listening for your answer/i).isVisible().catch(() => false)) break;
  if (await continueBtn.first().isVisible().catch(() => false)) { await continueBtn.first().click(); log("advanced", i); }
  await page.waitForTimeout(2200);
}
await page.getByText(/Listening for your answer/i).waitFor({ timeout: 20000 });
log("listening window visible on a CLAIM probe");
await page.screenshot({ path: "/tmp/v2-listening.png" });

await page.getByText(/tap your answer instead/i).waitFor({ timeout: 45000 });
log("uncertain -> labelled manual fallback");
await page.locator("button.choice").first().click();
log("manual tap answer accepted");

// Forget my voice must END the sensor performance (mandatory-both semantics)
await page.getByRole("button", { name: /Forget my voice/i }).click();
await page.getByText(/voice enrollment was withdrawn/i).waitFor({ timeout: 10000 });
log("forget -> sensor performance ENDED, landed on consent with notice");
await page.screenshot({ path: "/tmp/v2-forgotten.png" });
await ctx.close();
log("DONE");
