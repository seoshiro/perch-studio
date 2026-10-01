import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
await mkdir("artifacts", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await page.goto("http://127.0.0.1:5418/");
await page.waitForSelector(".scene-canvas canvas");
await page.waitForTimeout(1000);
await page.screenshot({ path: "artifacts/desktop-first.png", fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
await page.screenshot({ path: "artifacts/mobile-first.png", fullPage: true });
await writeFile("artifacts/smoke.json", JSON.stringify({ errors }, null, 2));
console.log(JSON.stringify({ errors }));
await browser.close();
