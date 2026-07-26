/**
 * How much of each page an iPhone would have to blur.
 *
 * ── the crash this exists to catch, and why nothing else could ──
 *
 * `.card` carried `backdrop-filter: blur(14px)`. It is the most repeated element in the product — 50
 * on one catalogue page, across 357 catalogue pages — so that single declaration asked iOS Safari for
 * fifty backdrop snapshots and fifty blur passes on one screen. Measured: 51 blurred elements
 * totalling 1.42 megapixels at 390px wide. It was reported from a real iPhone as the browser closing
 * the tab on open, which is what exhausting GPU memory looks like to the person it happens to.
 *
 * Chromium is structurally incapable of seeing it. The build emits ONLY `-webkit-backdrop-filter`,
 * which Blink ignores and WebKit requires, so `getComputedStyle().backdropFilter` reports `"none"`
 * here on a page that blurs fifty elements there. Every runtime check that ran was on Chromium.
 *
 * So this does not ask the engine what it painted. It reads the SERVED stylesheets, extracts every
 * selector given a backdrop-filter under either spelling, and matches those selectors against the
 * live DOM. It measures what WebKit will do, using a browser that will not do it.
 *
 * ── why this is its own file ──
 *
 * It was first added to `ops/motion.browser.mjs`, and the extra navigations killed that suite's
 * browser partway through — sections after it then failed on a dead target, which reads as this
 * check breaking unrelated assertions. Its own process, its own browser, no shared state.
 *
 *   node ops/iosblur.browser.mjs          # BASE and CHROME_PATH from the environment
 */

import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:3311";
let pass = 0, fail = 0;
const ok = (n, c, d = "") => {
  if (c) { pass++; console.log(`\u2705 ${n}`); }
  else { fail++; console.log(`\u274c ${n}${d ? ` \u2014 ${d}` : ""}`); }
};

/*
 * The budget is a COUNT and an AREA, because either alone is gameable. Eight elements is generous
 * for the legitimate uses — a page's sticky header, a modal scrim, the one light surface — and far
 * below the fifty that a per-item blur produces. 0.6 megapixels is roughly two full-width bands on a
 * 390px screen.
 */
const BUDGET_ELEMENTS = 8;
const BUDGET_MPX = 0.6;

/* The heaviest pages. The UNIVERSAL guard is the source one in `ops/motion.test.mjs`, which forbids a
   backdrop-filter on any class that repeats per item and therefore covers every page by covering the
   stylesheet. This is the spot-check that the rule produces the intended count on real markup. */
const PAGES = ["/resume-examples", "/", "/resume-examples/registered-nurse", "/pricing", "/ar"];

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });

for (const path of PAGES) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${BASE}${path}`, { waitUntil: "load" });
  await page.waitForTimeout(400);

  const r = await page.evaluate(async () => {
    /* Fetched rather than read through `document.styleSheets`: a sheet that is cross-origin or not
       yet parsed exposes an empty `cssRules`, and this would then measure nothing and pass. */
    const hrefs = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href);
    let css = "";
    for (const h of hrefs) {
      try { css += await (await fetch(h)).text(); } catch { /* surfaced by the byte count below */ }
    }
    for (const el of document.querySelectorAll("style")) css += el.textContent || "";

    const sels = new Set();
    for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      if (/backdrop-filter\s*:\s*(?!none)/.test(m[2])) {
        for (const part of m[1].split(",")) {
          const t = part.trim();
          if (t && !t.startsWith("@") && !t.includes("%")) sels.add(t);
        }
      }
    }

    let total = 0, px = 0;
    const per = {};
    for (const sel of sels) {
      let els = [];
      try { els = [...document.querySelectorAll(sel)]; } catch { continue; }
      if (!els.length) continue;
      per[sel] = els.length;
      total += els.length;
      for (const el of els) { const q = el.getBoundingClientRect(); px += q.width * q.height; }
    }
    return { cssBytes: css.length, total, mpx: +(px / 1e6).toFixed(2), per };
  });

  /* A stylesheet that could not be read would report zero blurs and pass — the vacuous green this
     project has already shipped twice. */
  ok(`${path}: stylesheets were actually read`, r.cssBytes > 5000, `${r.cssBytes} bytes`);
  ok(`${path}: ${r.total} blurred elements, ${r.mpx} MPx \u2014 within the iOS budget`,
    r.total <= BUDGET_ELEMENTS && r.mpx <= BUDGET_MPX, JSON.stringify(r.per));
  await page.close();
}

await browser.close();
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} \u2014 ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
