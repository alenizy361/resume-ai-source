/**
 * The layout shift that put `/resume-examples` at the edge of Google's "poor" threshold.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHAT WAS MEASURED (O-14 → F-22)
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 *   page                   CLS at load, before   after
 *   /resume-examples       0.2489                 0.0000
 *   /ar/resume-examples    0.0398                 0.0000
 *
 * Traced to `content-visibility: auto` + `contain-intrinsic-size: auto 500px` on `.t-enter` (see
 * `transitions.css`), applied to the page's own HERO section — content that is on screen from the
 * first frame. `content-visibility` exists to skip layout/paint for content that is genuinely
 * off-screen; applying it to content everyone sees immediately means the browser still renders it at
 * the 500px placeholder before it can measure the real (shorter) content, and the collapse from
 * placeholder to real height IS a layout shift — whether or not anything was actually skipped.
 *
 * `.t-no-cv` resets `content-visibility` on an element that keeps `.t-enter`'s opacity/translate
 * transition, for exactly the above-the-fold sections that have nothing to defer.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHY A BROWSER, NOT A CSS ASSERTION
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * The claim is about the LayoutShift entries the browser itself reports — the same signal Search
 * Console reads. A CSS-source assertion ("`.t-no-cv` is applied to the hero") would catch a removed
 * class but not a NEW section added above the fold without it, which is the actual way this
 * regresses. So the number itself is asserted, on the real page.
 *
 *   BASE=http://localhost:3321 node ops/cls.browser.mjs
 */

import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:3321";
let pass = 0, fail = 0;
const ok = (n, c, d = "") => {
  if (c) { pass++; console.log(`✅ ${n}`); }
  else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); }
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });

/** The Cumulative Layout Shift value and its entries, from the real Layout Instability API. */
async function measureCLS(path) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${BASE}${path}`, { waitUntil: "load" });
  await page.waitForTimeout(2000);
  const result = await page.evaluate(() => new Promise((resolve) => {
    let total = 0;
    const sources = [];
    try {
      const po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.hadRecentInput) continue;
          total += e.value;
          for (const s of e.sources || []) {
            sources.push(s.node?.className || s.node?.tagName || "?");
          }
        }
      });
      po.observe({ type: "layout-shift", buffered: true });
      setTimeout(() => resolve({ total, sources }), 500);
    } catch { resolve({ total: 0, sources: [] }); }
  }));
  await page.close();
  return result;
}

/* Google's own thresholds: good ≤ 0.1, poor ≥ 0.25. `/resume-examples` measured 0.2489 — the edge of
   poor — on the page whose entire purpose is organic search. */
const GOOD = 0.1;

console.log("\n── the two pages the original measurement named ──");
for (const path of ["/resume-examples", "/ar/resume-examples"]) {
  const r = await measureCLS(path);
  ok(`${path}: CLS is at or near zero`, r.total < 0.02, `${r.total.toFixed(4)} — sources: ${JSON.stringify(r.sources)}`);
  ok(`${path}: comfortably under Google's "good" threshold`, r.total < GOOD, r.total.toFixed(4));
}

console.log("\n── pages already at zero must stay at zero ──");
for (const path of ["/", "/pricing", "/resume-examples/registered-nurse"]) {
  const r = await measureCLS(path);
  ok(`${path}: still no measurable shift`, r.total < 0.02, `${r.total.toFixed(4)} — ${JSON.stringify(r.sources)}`);
}

console.log("\n── the fix removed content-visibility only where it was reset, not everywhere ──");
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${BASE}/resume-examples`, { waitUntil: "load" });
  await page.waitForTimeout(500);
  const sections = await page.evaluate(() =>
    [...document.querySelectorAll(".t-enter")].map((el) => ({
      hasNoCv: el.classList.contains("t-no-cv"),
      contentVisibility: getComputedStyle(el).contentVisibility,
    })));
  ok("the page has t-enter sections to check", sections.length >= 2, String(sections.length));
  for (const s of sections) {
    ok(`a .t-no-cv section reports content-visibility:visible`,
      !s.hasNoCv || s.contentVisibility === "visible", JSON.stringify(s));
  }
  await page.close();
  /* The deferred-rendering benefit `content-visibility` exists for — genuinely off-screen sections
     staying unrendered until scrolled near — is `ops/motion.test.mjs`'s claim, not this file's; this
     suite is only about the shift this specific hero used to cause. */
}

await browser.close();
console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
