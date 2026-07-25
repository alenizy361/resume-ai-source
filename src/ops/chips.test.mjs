/**
 * A suggestion chip, driven the way a person drives it.
 *
 * `ops/provenance.test.mjs` proves the data layer: a sentence exists for every source, and a
 * dismissal written into the suggestion bag suppresses the same suggestion later. Neither of those
 * says the CHIP works. The gap between them is where this product's last three UI bugs lived — a
 * component written and never mounted, a class name that existed in JSX and not in CSS, an
 * explanation that opened and pushed the page sideways on a phone.
 *
 * So this is the browser half, on the two sizes that matter:
 *
 *   · the chips render at all — the check that would have caught a component nobody wired up
 *   · "why this?" answers with a real sentence, in place, rather than a `title` a phone never shows
 *   · opening it does not make the page scroll sideways (the failure mode of a wide note in a
 *     flex row, and the exact bug class `devices.test.mjs` exists for)
 *   · both small controls are as tall as the chip beside them — a thumb target, not a decoration
 *   · rejecting removes the chip AND the rejection survives a reload, which is the whole
 *     difference between a decision and a dismissal
 *
 * The reload assertion is the one that earns its runtime. The blueprint answer is cached and the
 * credential offers are recomputed from the role pack on every mount, so a rejection held in local
 * state looks perfect until you refresh — and then the product is visibly not listening.
 *
 * Needs the app running (`npm run dev`), like `ops/devices.test.mjs`, and is not part of
 * `npm run test` for that reason.
 *
 *   node ops/chips.test.mjs [baseUrl]
 */

import { chromium, devices } from "playwright";

const BASE = process.argv[2] || "http://localhost:3141";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

for (const prof of [
  { name: "desktop", ctx: { viewport: { width: 1440, height: 900 } } },
  /* Chromium with the iPhone 13 descriptor — real viewport, DPR and touch; not WebKit. The
     limitation is spelled out at the top of `devices.test.mjs`. */
  { name: "iphone-13", ctx: devices["iPhone 13"] },
]) {
  const ctx = await browser.newContext(prof.ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));

  await page.goto(`${BASE}/builder`, { waitUntil: "networkidle" });
  const enter = page.locator('a[href^="/builder/r"][href$="/target"]').first();
  await enter.waitFor({ timeout: 25_000 });
  await enter.click();
  await page.waitForURL(/\/target$/);
  await page.waitForSelector(".bd-form input.bd-input");
  const id = new URL(page.url()).pathname.split("/").filter(Boolean).at(-2);

  /* A title `rolePacks.ts` knows, so the skills step is seeded offline — no model call, and the
     measurements do not depend on how long one took. */
  await page.fill(".bd-form input.bd-input >> nth=0", "Radiology Technologist");
  await page.waitForTimeout(1000);

  await page.goto(`${BASE}/builder/${id}/skills`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  const groups = page.locator(".bd-chip-group");
  const before = await groups.count();
  ok(`${prof.name}: skills renders suggestion chips`, before > 0, `${before}`);

  const firstText = (await groups.first().locator(".bd-chip").innerText()).trim();

  await groups.first().locator(".bd-chip-aux").first().click();
  await page.waitForTimeout(200);
  const why = await page.locator(".bd-chip-why").first().innerText().catch(() => "");
  ok(`${prof.name}: "why" answers with a sentence`, why.trim().length > 10, JSON.stringify(why));

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(`${prof.name}: the open explanation does not push the page sideways`, overflow <= 1, `${overflow}px`);

  const tap = await page.evaluate(() => {
    const els = [...document.querySelectorAll(".bd-chip-aux")];
    return Math.min(...els.map((e) => Math.round(e.getBoundingClientRect().height)));
  });
  ok(`${prof.name}: the small controls are at least 36px tall`, tap >= 36, `${tap}px`);

  await groups.first().locator(".bd-chip-aux").nth(1).click();
  await page.waitForTimeout(400);
  const after = await groups.count();
  ok(`${prof.name}: rejecting removes that chip`, after === before - 1, `${before} → ${after}`);

  await page.waitForTimeout(1200); // let the autosave land before pulling the page out
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const texts = await page.locator(".bd-chip-group .bd-chip").allInnerTexts();
  ok(`${prof.name}: and it is still gone after a reload`,
    !texts.some((t) => t.trim() === firstText), `looking for ${JSON.stringify(firstText)}`);

  ok(`${prof.name}: no page errors`, errors.length === 0, errors.join(" · "));
  await ctx.close();
}

await browser.close();
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
