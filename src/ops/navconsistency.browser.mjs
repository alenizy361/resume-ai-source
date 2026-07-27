/**
 * The one thing the IA-redesign plan asked for and never got written: a browser pass that
 * actually compares header markup and CTA labels ACROSS pages, not just within one.
 *
 * ── the gap this fills ──
 *
 * `ops/pages.test.mjs` loads pages one at a time and checks each renders, reads the right
 * direction, and throws no console errors — real coverage, but it never puts two pages side by
 * side. The whole point of `PageShell` was "one header, one CTA label, one place it's defined"
 * across pages that used to hand-roll their own — and nothing was asserting that claim stayed
 * true as more pages migrated onto it. This does.
 *
 * ── what "consistent" means here, concretely ──
 *
 *   SHELL    — every sampled page renders `header.ps-header > .ps-header-in > .ps-brand`, and the
 *              brand link points at the right home for its language.
 *   CTA      — a page whose CTA should be the shared "check your resume" action shows EXACTLY the
 *              `NAV_CTA` label and href for its language (values below are copied from
 *              `app/lib/brand.ts` — this is a plain `.mjs`, so they can't be imported; if that
 *              constant changes, update PAGES' expectations here too, or this test silently checks
 *              stale strings against the shell instead of a moving target).
 *   NO-CTA   — a page that deliberately has no header CTA (the destination itself, `/optimize`)
 *              renders no `.ps-cta` element at all, rather than an empty or broken one.
 *   OTHER    — a page with a deliberately different CTA (`/resume-templates`, whose job is "use
 *              this template", not "check your resume") still renders a well-formed CTA, just not
 *              checked against `NAV_CTA`.
 *
 * Needs the app running (`npm run dev`).
 *
 *   node ops/navconsistency.browser.mjs [baseUrl]
 */

import { chromium } from "playwright";

const BASE = process.argv[2] || "http://localhost:3141";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };

const NAV_CTA = {
  en: { href: "/optimize", label: "Scan my resume →" },
  ar: { href: "/ar/optimize", label: "افحص سيرتي مجاناً ←" },
};

/** path, lang, cta mode: "nav" | "none" | "other" — see the header comment. */
const PAGES = [
  // SEO catalogue — the pages the plan migrated first, lowest risk.
  ["/resume-examples", "en", "nav"],
  ["/ar/resume-examples", "ar", "nav"],
  ["/resume-examples/category/technology", "en", "nav"],
  ["/ar/resume-examples/category/healthcare", "ar", "nav"],
  ["/resume-skills", "en", "nav"],
  ["/ar/resume-skills", "ar", "nav"],
  ["/cover-letter-examples", "en", "nav"],
  ["/ar/cover-letter-examples", "ar", "nav"],
  ["/templates", "en", "nav"],
  ["/ar/templates", "ar", "nav"],
  ["/resume-templates", "en", "other"],
  ["/ats-resume-checker", "en", "nav"],
  ["/free-resume-checker", "en", "nav"],
  ["/jobscan-alternative", "en", "nav"],
  // Product surface.
  ["/pricing", "en", "nav"],
  ["/ar/pricing", "ar", "nav"],
  ["/interview", "en", "nav"],
  ["/interview?lang=ar", "ar", "nav"],
  ["/linkedin", "en", "nav"],
  ["/linkedin?lang=ar", "ar", "nav"],
  ["/interview-live", "en", "nav"],
  ["/account", "en", "nav"],
  ["/ar/account", "ar", "nav"],
  // The destination itself — the one page with no header CTA, by design.
  ["/optimize", "en", "none"],
  ["/ar/optimize", "ar", "none"],
];

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

/*
 * Block Next.js's own link-prefetching.
 *
 * `HubLinks` sits on most of these pages and renders a dozen-odd `<Link>`s; the App Router
 * prefetches whatever's in the initial viewport by default, so every navigation quietly kicks off
 * a burst of background RSC fetches for OTHER routes. Measured in the dev server's own log: over
 * 60 unrequested `GET /ar/linkedin` hits during one run of this suite, none of them ours. Against
 * `next dev`'s single compile queue that background traffic contends with the navigation this
 * suite actually asked for, and was the reason `/linkedin` and `/interview?lang=ar` intermittently
 * "failed to load" despite being fine — the real request was queued behind prefetch noise this
 * suite doesn't care about. Aborting anything carrying Next's prefetch header removes the
 * contention at its source instead of papering over it with a longer timeout.
 */
await ctx.route("**/*", (route) => {
  const h = route.request().headers();
  if (h["next-router-prefetch"] || h["purpose"] === "prefetch") return route.abort();
  return route.continue();
});

/*
 * Warm the dev server before asserting anything.
 *
 * `next dev` compiles each route on its FIRST request, not at boot — a cold hit can take well
 * past a normal navigation timeout, while the same route's second hit is instant. Measured: a
 * first pass over these routes against a freshly-started dev server timed out on more than a
 * third of them; a second pass against the now-warm server passed every one. Without this, the
 * suite's real failure rate has nothing to do with the claim it exists to check — it is a false
 * alarm from dev-server JIT compilation, the exact kind of noise this session's other browser
 * suites were built to rule out before trusting a result. `ops/pages.test.mjs` and friends get
 * away without this because they're usually run against a server that's already been hit a few
 * times manually; this suite has to be correct standalone.
 */
for (const [path] of PAGES) {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => null);
}

for (const [path, lang, ctaMode] of PAGES) {
  /*
   * Clear storage before every navigation, deliberately mid-loop and not once up front.
   *
   * `/interview` and `/linkedin` use `useLang()`, which reads `?lang=` and FALLS BACK TO A
   * STORED PREFERENCE (`localStorage.ra_lang`) when the param is absent — correct, sticky
   * behaviour for a real visitor, and exactly what turned this suite's own warm-up pass into a
   * false positive: warming `/linkedin?lang=ar` wrote the stored preference, so the later,
   * unrelated visit to plain `/linkedin` (meant to prove the EN default) inherited "ar" instead
   * and every assertion below correctly reported an Arabic page — the test was wrong, not the
   * product. One shared tab visiting dozens of URLs is not a real visitor's session, so its
   * memory is cleared before each check gets to rely on a fresh one.
   */
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* not this origin yet */ } }).catch(() => {});
  /*
   * `domcontentloaded`, not `networkidle`. `PageShell` has no `"use client"` directive — the
   * header, brand link and CTA are in the server's first response, not inserted by client JS —
   * so waiting for the network to go quiet buys nothing here and cost real reliability: `/interview`
   * and `/linkedin` keep background network activity going (AI polling) once `?lang=ar` is set,
   * which meant `networkidle` never resolved and the page read as a load failure it never was.
   */
  const res = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => null);
  /*
   * `/interview` and `/linkedin` are client components: `useLang()` is a `useSyncExternalStore`
   * hook that renders the SSR-safe default (English, matching what a server with no client state
   * could possibly send) on the FIRST paint, then corrects to the query param's language via an
   * effect once hydration finishes — the exact pattern documented in `useLang.ts` to avoid a
   * hydration mismatch. So `domcontentloaded` genuinely can catch the page mid-correction: the
   * brand link and CTA are still showing English for one JS tick on an `?lang=ar` URL. Poll for
   * the brand link to settle rather than trusting a fixed delay to always outrun hydration.
   */
  const wantHome = lang === "ar" ? "/ar" : "/";
  await page.waitForFunction(
    (want) => document.querySelector("header.ps-header .ps-brand")?.getAttribute("href") === want,
    wantHome,
    { timeout: 4000 },
  ).catch(() => {});
  await page.waitForTimeout(150);

  if (!res || res.status() >= 400) {
    ok(`${path}: loads`, false, `status ${res?.status()}`);
    continue;
  }

  const shell = await page.evaluate(() => {
    const header = document.querySelector("header.ps-header");
    const brand = header?.querySelector(".ps-brand");
    const cta = header?.querySelector("a.ps-cta");
    return {
      hasHeader: Boolean(header),
      hasHeaderIn: Boolean(header?.querySelector(".ps-header-in")),
      brandHref: brand?.getAttribute("href") ?? null,
      ctaHref: cta?.getAttribute("href") ?? null,
      ctaText: cta?.textContent?.trim() ?? null,
    };
  });

  ok(`${path}: renders the shared shell`, shell.hasHeader && shell.hasHeaderIn);
  ok(`${path}: brand links home in the right language (${wantHome})`, shell.brandHref === wantHome, String(shell.brandHref));

  if (ctaMode === "nav") {
    const want = NAV_CTA[lang];
    ok(`${path}: CTA href matches the shared NAV_CTA`, shell.ctaHref === want.href, String(shell.ctaHref));
    ok(`${path}: CTA label matches the shared NAV_CTA`, shell.ctaText === want.label, String(shell.ctaText));
  } else if (ctaMode === "none") {
    ok(`${path}: has no header CTA, by design`, shell.ctaHref === null && shell.ctaText === null);
  } else {
    ok(`${path}: has its own deliberate CTA, well-formed`, Boolean(shell.ctaHref) && Boolean(shell.ctaText));
  }
}

/*
 * The label check above is what would have caught `SectorPage.tsx` shipping a different string
 * ("Scan my resume free →") in the exact slot `NAV_CTA` exists to unify — reproduced here as an
 * explicit regression case rather than trusting the sampled sector page alone to catch it forever.
 */
{
  const enSector = await page.goto(`${BASE}/resume-examples/category/technology`, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => null);
  await page.waitForTimeout(250);
  const text = await page.evaluate(() => document.querySelector("header.ps-header a.ps-cta")?.textContent?.trim());
  ok("sector page CTA is not its own hardcoded string", text === NAV_CTA.en.label, String(text));
  void enSector;
}

await browser.close();
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
