import { chromium } from "playwright";
const ctx = await chromium.launchPersistentContext("/tmp/pw-320", {
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  viewport: { width: 320, height: 640 }
});
const page = await ctx.newPage();
await page.goto("http://127.0.0.1:4173/L.O.K.I/", { waitUntil: "domcontentloaded" });
await page.getByText("Sensor-enabled performance", { exact: true }).click();
await page.screenshot({ path: "/tmp/consent-320-voice.png", fullPage: true });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log("horizontal overflow px:", overflow);
await ctx.close();
