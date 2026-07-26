/**
 * Every public page, in a browser, in both languages.
 *
 * ── the gap this fills ──
 *
 * The builder has four browser suites. Everything else — the landing pages, the uploader, the
 * account screen, login, pricing — had none, and those are the pages a visitor meets BEFORE the
 * builder. They also share the pieces most likely to break quietly: `useLang` decides the whole
 * direction of the page, `ScoreOrb` draws the number on the result screen, and both were rewritten
 * to read browser state through a subscription instead of copying it into React state after mount.
 *
 * That rewrite is exactly the kind that a type-checker cannot catch and a unit test does not see:
 * it either renders the same thing the server sent, or it produces a hydration mismatch that shows
 * up as a console error and a flicker. So this checks the two things that would actually be wrong:
 * the page renders real content, and the console stays clean.
 *
 * Needs the app running (`npm run dev`).
 *
 *   node ops/pages.test.mjs [baseUrl]
 */

import { chromium, devices } from "playwright";

const BASE = process.argv[2] || "http://localhost:3141";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };

/** path, expected direction, a string that proves the right page rendered. */
const PAGES = [
  ["/", "ltr", /CV|resume/i],
  ["/ar", "rtl", /سيرة|سيرتك/],
  ["/optimize", "ltr", /resume|upload|scan/i],
  ["/ar/optimize", "rtl", /سيرة|ارفع|فحص/],
  ["/pricing", "ltr", /SAR|price|plan/i],
  ["/ar/pricing", "rtl", /ريال|الباقة|السعر/],
  ["/account", "ltr", /account|resume|sign/i],
  ["/ar/account", "rtl", /حساب|سير|دخول/],
  ["/login", "ltr", /email|sign in|link/i],
  ["/builder", "ltr", /CV|build|start/i],
  ["/ar/builder", "rtl", /سيرة|ابدأ/],
  /*
   * The category layer. Four of these six routes did not exist before it, and the two Arabic hubs
   * existed as sixty-one leaf pages each with no index above them — indexable, in the sitemap, and
   * unreachable from anywhere on the site.
   */
  ["/resume-examples/category", "ltr", /sector|industry/i],
  ["/ar/resume-examples/category", "rtl", /القطاع|قطاعات/],
  ["/resume-examples/category/technology", "ltr", /Technology|keyword/i],
  ["/ar/resume-examples/category/healthcare", "rtl", /الصحي|التصنيف|الاعتمادات/],
  ["/ar/resume-skills", "rtl", /مهارات|كلمات/],
  ["/ar/cover-letter-examples", "rtl", /خطاب|تعريف/],
];

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

for (const prof of [
  { name: "desktop", ctx: { viewport: { width: 1440, height: 900 } } },
  { name: "iphone-13", ctx: devices["iPhone 13"] },
]) {
  console.log(`\n── ${prof.name} ──`);
  const ctx = await browser.newContext(prof.ctx);
  const page = await ctx.newPage();

  const problems = [];
  page.on("pageerror", (e) => problems.push(`error: ${String(e).slice(0, 120)}`));
  /*
   * A hydration mismatch is a console error, not a thrown one — which is why it survives in
   * products for months. Catching it here is the whole reason this suite exists.
   */
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    if (/hydrat|did not match|Text content does not match/i.test(text)) problems.push(`hydration: ${text.slice(0, 160)}`);
  });

  for (const [path, dir, must] of PAGES) {
    problems.length = 0;
    const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" }).catch(() => null);
    await page.waitForTimeout(400);

    const m = await page.evaluate(() => ({
      text: document.body.innerText.replace(/\s+/g, " ").trim(),
      dir: getComputedStyle(document.body).direction,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      h1: document.querySelectorAll("h1").length,
    }));

    ok(`${prof.name} ${path}: answers 200`, res?.status() === 200, String(res?.status()));
    /*
     * Eighty characters, not a hundred and twenty. The first version used the larger number and
     * failed `/login`, which renders "Your resume awaits", one sentence, an email field and a
     * button — 103 characters, and correct. A login page is legitimately spare; the threshold is
     * there to catch a BLANK page, and it should be set where a blank page is.
     */
    ok(`${prof.name} ${path}: renders real content`, m.text.length > 80, `${m.text.length} chars`);
    ok(`${prof.name} ${path}: has something to interact with`,
      (await page.locator("a, button, input").count()) > 0);
    ok(`${prof.name} ${path}: is the right page`, must.test(m.text), m.text.slice(0, 70));
    ok(`${prof.name} ${path}: reads ${dir}`, m.dir === dir, m.dir);
    ok(`${prof.name} ${path}: does not scroll sideways`, m.overflow <= 1, `${m.overflow}px`);
    ok(`${prof.name} ${path}: no errors or hydration mismatches`, problems.length === 0, problems.slice(0, 2).join(" · "));
  }

  /* ── the retired long-page builder ── */

  /*
   * `/build` and `/ar/build` were a second builder, reachable from the mobile menu and from every
   * template page, with their own reducer and none of the step routes' prerequisite banner, rail,
   * lifecycle label or offline handling. Retired to one product; the addresses stay as redirects
   * because they were linked from pages people have open.
   */
  for (const [from, to] of [["/build", "/builder"], ["/ar/build", "/ar/builder"]]) {
    const res = await page.goto(`${BASE}${from}`, { waitUntil: "domcontentloaded" });
    ok(`${prof.name} ${from}: redirects to ${to}`, new URL(page.url()).pathname === to, page.url());
    ok(`${prof.name} ${from}: and lands on a working builder`, res?.status() === 200, String(res?.status()));
  }

  /*
   * And the template a user picked in the gallery is the one the builder starts with. That link
   * has carried `?template=` since the gallery was written and nothing ever read it.
   */
  /* ── the funnel's entry stamp ── */

  /*
   * `FunnelBeacon` sits in the root layout and records the page the session started on. The rule
   * that matters is that it writes ONCE: if a second content page overwrote it, every funnel would
   * appear to start wherever the visitor happened to stop browsing, and the whole point of the
   * instrumentation — knowing which page earned a customer — would be quietly inverted.
   *
   * It also lives inside a try/catch, because analytics must never break a page. That is the right
   * call and it is exactly why this needs a browser assertion: a failure in there is invisible.
   */
  /*
   * A FRESH CONTEXT, not `sessionStorage.clear()` on the page already open.
   *
   * The first version cleared storage and navigated, and it passed on desktop and failed on the
   * phone — because clearing does not stop the beacon on the page you are standing on from writing
   * afterwards. It fired late on the slower profile, stamped `/ar/builder`, and the next page
   * correctly declined to overwrite it. The assertion was measuring the race, not the rule.
   *
   * A funnel entry is per-tab by design, so a new context IS a new session. That is both the fix and
   * the more faithful test.
   */
  const funnelCtx = await browser.newContext(prof.ctx);
  const funnelPage = await funnelCtx.newPage();

  await funnelPage.goto(`${BASE}/resume-examples/registered-nurse`, { waitUntil: "networkidle" });
  await funnelPage.waitForTimeout(600);
  const readEntry = (p) => p.evaluate(() => {
    try { return JSON.parse(window.sessionStorage.getItem("ra_funnel_entry") || "null"); } catch { return null; }
  });
  const stamped = await readEntry(funnelPage);
  ok(`${prof.name}: the landing page is stamped`, stamped?.family === "profession", JSON.stringify(stamped));
  ok(`${prof.name}: the stamp records the slug from the URL`, stamped?.slug === "registered-nurse", stamped?.slug);
  ok(`${prof.name}: the stamp holds exactly the five declared fields`,
    stamped && Object.keys(stamped).length === 5, Object.keys(stamped || {}).join(","));
  ok(`${prof.name}: the stamp carries no query string`,
    typeof stamped?.path === "string" && !stamped.path.includes("?"), stamped?.path);

  await funnelPage.goto(`${BASE}/optimize`, { waitUntil: "networkidle" });
  await funnelPage.waitForTimeout(600);
  const after = await readEntry(funnelPage);
  ok(`${prof.name}: a later page does not overwrite the entry`,
    after?.family === "profession" && after?.slug === "registered-nurse", JSON.stringify(after));

  await funnelCtx.close();

  await page.evaluate(() => window.localStorage.clear());
  await page.goto(`${BASE}/builder?template=azure`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  /*
   * Read the RESUME RECORD, not `ra_journey_en`.
   *
   * That key was the old one-slot-per-language draft, and it is exactly what `resumeStore` retired:
   * a resume now lives at `ra_cv:{owner}:{resumeId}` with the owner and id IN THE KEY, which is the
   * whole point — one slot per language is what let two resumes overwrite each other.
   *
   * So the record is found by its prefix rather than named, because the id is minted at runtime and
   * the owner depends on whether anyone is signed in. Asserting on a key the product stopped writing
   * is a test that reports a working feature as broken, which is worse than no test: verified by
   * loading `/builder?template=azure` and dumping storage — the template is there, under the new key,
   * within the same 900ms this test already waits.
   */
  const chosen = await page.evaluate(() => {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith("ra_cv:")) continue;
        const rec = JSON.parse(localStorage.getItem(k) || "{}");
        if (rec?.state?.template) return rec.state.template;
      }
      return "";
    } catch { return ""; }
  });
  ok(`${prof.name}: a template chosen in the gallery reaches the builder`, chosen === "azure", chosen);

  await ctx.close();
}

await browser.close();
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
