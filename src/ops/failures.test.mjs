/**
 * The two pages nobody plans to see: the 404 and the crash.
 *
 * ── why these are worth a suite ──
 *
 * They are the screens a person meets on the worst visit they will have, and until now half of
 * them did not exist: there was one English `error.tsx` and one English `not-found.tsx`, no Arabic
 * versions, no `global-error`, and no boundary inside the builder. So an Arabic user who mistyped
 * a URL got an English page, and a crash eight steps into a CV replaced the whole builder with a
 * page whose most prominent button was "Back home".
 *
 * What every one of these screens has to do is the same thing, and it is not decoration: say where
 * the user's work is. The draft lives in `localStorage`, so it genuinely survives a crash — but
 * "nothing was lost" from a page that just broke is a promise with no evidence behind it. Naming
 * the device, and offering a button that goes back to the CV rather than to the marketing page, is
 * what turns it into something checkable.
 *
 * Needs the app running (`npm run dev`).
 *
 *   node ops/failures.test.mjs [baseUrl]
 */

import { chromium } from "playwright";

const BASE = process.argv[2] || "http://localhost:3141";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

/* ─────────────────────────── the 404 ─────────────────────────── */

for (const [path, lang, must] of [
  ["/no-such-page-here", "en", /Lost in space|not found/i],
  ["/ar/no-such-page-here", "ar", /الصفحة غير موجودة/],
]) {
  const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  const body = await page.evaluate(() => document.body.innerText);

  ok(`${lang}: an unknown URL answers 404`, res?.status() === 404, String(res?.status()));
  ok(`${lang}: with the product's own page, not the framework's`, must.test(body), body.slice(0, 80));

  if (lang === "ar") {
    /* The whole point: an Arabic visitor is not handed an English apology. */
    ok("the Arabic 404 is in Arabic", /[؀-ۿ]/.test(body) && !/Lost in space/.test(body));
    ok("and it says where the work is", /محفوظة على جهازك/.test(body), body.slice(0, 120));
    ok("and offers the builder, not just the home page", await page.locator('a[href="/ar/builder"]').count() > 0);
    const dir = await page.evaluate(() => document.querySelector("main")?.getAttribute("dir"));
    ok("and reads right to left", dir === "rtl", String(dir));
  }
}

/* ─────────────────────── the crash, inside a step ─────────────────────── */

/*
 * Forced by breaking what the step reads, rather than by injecting an exception: a stored draft
 * whose shape is wrong is a real way this fails — a schema that moved, a half-written record — and
 * it exercises the same boundary a genuine bug would.
 */
await page.goto(`${BASE}/pricing`, { waitUntil: "networkidle" });
await page.evaluate(() => {
  window.localStorage.setItem("ra_journey_en", JSON.stringify({
    resumeId: "rBROKEN",
    profile: { name: "A", roles: "this should be an array" },
    builder: {
      schemaVersion: 3,
      /* `roles` as a string is the kind of thing a bad migration leaves behind, and every renderer
         downstream calls `.map` on it. */
      profile: { name: "A", contact: "", role: "", summary: "", skills: "", education: "", certifications: "", languages: "", extras: [], roles: "not-an-array", wovenLines: [] },
      suggestions: [], entry: "new",
      target: { title: "Radiology Technologist", level: "", language: "en", industry: "", country: "SA", city: "", employer: "", jobAdUrl: "", jobAdText: "" },
      personal: { fullName: "A", professionalTitle: "", city: "", country: "", phone: "", email: "a@b.co", linkedin: "", portfolio: "" },
      credentials: [], languages: [], template: "ats-pro", sectionsDone: [], updatedAt: 1,
    },
  }));
});

const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(String(e).slice(0, 120)));

await page.goto(`${BASE}/builder/rBROKEN/experience`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const after = await page.evaluate(() => document.body.innerText);

/*
 * Either the step renders anyway — which is the better outcome and what a tolerant renderer should
 * do — or the boundary catches it. What must NOT happen is a blank page or the framework's own
 * error screen, which is what happened before the boundary existed.
 */
const caught = /could not be shown|Try this step again/i.test(after);
const rendered = after.trim().length > 200 && !/Application error/i.test(after);
ok("a malformed draft does not produce a blank or framework error page", caught || rendered,
  `${after.trim().length} chars: ${after.slice(0, 90)}`);
if (caught) {
  ok("the step boundary says where the work is", /saved on this device/i.test(after));
  ok("and offers the CV rather than the home page", await page.locator('a[href="/builder"]').count() > 0);
} else {
  console.log("   (the step rendered through it — the boundary was not needed for this input)");
}

/* And the app-level boundary is still the English one for English routes. */
ok("no unexpected page errors leaked to the console",
  consoleErrors.filter((e) => !/hydrat|minified react/i.test(e)).length === 0,
  consoleErrors.slice(0, 2).join(" · "));

await browser.close();
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
