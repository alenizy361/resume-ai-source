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
 *   · the provenance is on the screen — as a group line when every chip would say the same thing,
 *     which is the ordinary case and was twenty-five identical buttons before
 *   · the chips do not make the page scroll sideways (the exact bug class `devices.test.mjs` exists
 *     for, and the reason the controls moved inside the pill)
 *   · the pill is a thumb target and the control inside it has not vanished
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

  /*
   * The skills groups here are uniform — one role pack filled them — so the provenance is stated
   * once above the chips and no chip carries its own "why" button. That is the arrangement
   * `sharedWhy` decides; what this checks is that the sentence is actually on the screen, because a
   * group note that renders empty would be strictly worse than the buttons it replaced.
   */
  const note = await page.locator(".bd-why-note").first().innerText().catch(() => "");
  ok(`${prof.name}: the group says where its suggestions came from`, note.trim().length > 10, JSON.stringify(note));
  const auxPerChip = await groups.first().locator(".bd-chip-aux").count();
  ok(`${prof.name}: and a uniform group carries no per-chip "why"`, auxPerChip === 1, `${auxPerChip} controls`);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(`${prof.name}: the chips do not push the page sideways`, overflow <= 1, `${overflow}px`);

  /* The pill is the thumb target — 36px, the builder's floor. The aside inside it is the same
     24px this codebase already ships for removing a confirmed skill, deliberately: holding an
     inline control to 44px is what makes a row of chips unusable. */
  const tap = await page.evaluate(() => {
    const pill = [...document.querySelectorAll(".bd-chip-group > .bd-chip")];
    const aux = [...document.querySelectorAll(".bd-chip-aux")];
    const h = (els) => Math.min(...els.map((e) => Math.round(e.getBoundingClientRect().height)));
    return { pill: h(pill), aux: h(aux) };
  });
  ok(`${prof.name}: the chip itself is a thumb target`, tap.pill >= 36, `${tap.pill}px`);
  ok(`${prof.name}: and its inline control is not vanishing`, tap.aux >= 24, `${tap.aux}px`);

  await groups.first().locator(".bd-chip-aux").last().click();
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
