/**
 * Screenshots of the builder on a phone, in both languages — the deliverable the measurements
 * could not replace.
 *
 * `ops/devices.test.mjs` measures the mobile contract (no sideways scroll, nothing under the sticky
 * header, tap targets) and passes. That is a proof of the things somebody thought to measure. It
 * says nothing about whether a step LOOKS finished, whether an Arabic line wraps somewhere ugly, or
 * whether the suggestion chips crowd each other at 390px — the questions the owner of the product
 * answers by looking.
 *
 * So this writes the pictures out. Not a test: it asserts nothing and fails nothing.
 *
 *   node ops/shots.mjs [outDir] [baseUrl]
 */

import { chromium, devices } from "playwright";
import { mkdir } from "node:fs/promises";

const OUT = process.argv[2] || "/tmp/sira-shots";
const BASE = process.argv[3] || "http://localhost:3141";

/* The steps worth looking at: where content is dense, where suggestions appear, and the two ends. */
const STEPS = ["target", "blueprint", "experience", "skills", "credentials", "review", "design"];

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

await mkdir(OUT, { recursive: true });

for (const L of [
  { code: "en", prefix: "", title: "Radiology Technologist", name: "Abdulaziz Alenizy" },
  { code: "ar", prefix: "/ar", title: "أخصائي أشعة", name: "عبدالعزيز العنزي" },
]) {
  const ctx = await browser.newContext(devices["iPhone 13"]);
  const page = await ctx.newPage();

  await page.goto(`${BASE}${L.prefix}/builder`, { waitUntil: "networkidle" });
  const enter = page.locator(`a[href^="${L.prefix}/builder/r"][href$="/target"]`).first();
  await enter.waitFor({ timeout: 25_000 });
  await enter.click();
  await page.waitForURL(/\/target$/);
  await page.waitForSelector(".bd-form input.bd-input");
  const id = new URL(page.url()).pathname.split("/").filter(Boolean).at(-2);

  /* A real title and a real name, so the pictures show a CV being built rather than empty states. */
  await page.fill(".bd-form input.bd-input >> nth=0", L.title);
  await page.waitForTimeout(900);
  await page.goto(`${BASE}${L.prefix}/builder/${id}/personal`, { waitUntil: "networkidle" });
  await page.waitForSelector(".bd-form input.bd-input");
  await page.fill(".bd-form input.bd-input >> nth=0", L.name);
  await page.waitForTimeout(900);

  /* Confirm a few skills so the later steps have content and the chips show both states. */
  await page.goto(`${BASE}${L.prefix}/builder/${id}/skills`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  const chips = page.locator(".bd-chip-group .bd-chip");
  for (let i = 0; i < Math.min(4, await chips.count()); i++) {
    await chips.first().click();
    await page.waitForTimeout(250);
  }

  for (const step of STEPS) {
    await page.goto(`${BASE}${L.prefix}/builder/${id}/${step}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    const file = `${OUT}/${L.code}-${step}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(file);
  }

  await ctx.close();
}

await browser.close();
