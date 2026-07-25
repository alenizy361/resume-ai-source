/**
 * Every public route, checked for the things a page can be broken in silently.
 *
 * This exists because of a bug that every other test passed through. `.ambient-field`
 * is `position: fixed; z-index: 1; pointer-events: none`, and CSS paints a positioned
 * element above ALL non-positioned content in the same stacking context — so every page
 * whose root was static rendered as an empty cosmos with only the sticky header showing.
 * Clicks passed straight through the field, so the DOM was reachable, `isVisible()`
 * returned true, and the twenty-one-assertion builder smoke test went green against a
 * page a human could not see.
 *
 * The lesson generalises: reachable is not visible. So this file asserts the LAYER
 * CONTRACT (ambient 1 · content 10 · orb 30) for the real heading of every route, plus
 * the cheap route-level facts nothing else covers — status, a heading, a title, one h1,
 * no console errors, no horizontal overflow.
 *
 *   npx next dev -p 3113 &
 *   BASE=http://localhost:3113 node ops/routes.test.mjs
 *
 * Run it against a production build too before shipping a routing change: dev and
 * `next start` do not always agree about CSS order.
 */

import { appendFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:3113";
/*
 * Results are appended to a file as they happen, not just printed.
 *
 * Node buffers stdout when it is a pipe, so the first run of this suite was killed by a
 * harness timeout and lost every line it had already produced — twenty routes of work
 * reported as nothing. A per-assertion append survives a kill, and gives progress while
 * a long run is still going.
 */
const LOG = process.env.LOG || "";

/**
 * Public routes, with what each one must contain.
 *
 * Kept as data rather than crawled, because a crawl only finds what is linked and the
 * bug that motivated this file lived on pages that were linked from nowhere.
 */
const ROUTES = [
  { path: "/", must: "You fill the facts" },
  { path: "/ar", must: "أنت تكتب الحقائق" },
  { path: "/build", must: "You fill the facts" },
  { path: "/ar/build", must: "أنت تكتب الحقائق" },
  { path: "/journey", must: "resume" },
  { path: "/ar/journey", must: "سيرتك" },
  { path: "/optimize", must: "resume" },
  { path: "/ar/optimize", must: "سيرة" },
  { path: "/pricing", must: "35" },
  { path: "/ar/pricing", must: "٣٥|35" },
  { path: "/templates", must: "template" },
  { path: "/account", must: "" },
  { path: "/interview", must: "interview" },
  { path: "/linkedin", must: "LinkedIn" },
  { path: "/terms", must: "" },
  { path: "/privacy", must: "" },
  { path: "/ats-resume-checker", must: "ATS" },
  { path: "/free-resume-checker", must: "resume" },
  { path: "/jobscan-alternative", must: "" },
  { path: "/resume-examples", must: "" },
  { path: "/resume-templates", must: "" },
  { path: "/cover-letter-examples", must: "" },
  { path: "/resume-skills", must: "" },
  { path: "/ar/resume-examples", must: "" },
  /*
   * The dynamic SEO pages, sampled.
   *
   * The index pages were covered from the start and the DETAIL pages were not — which is
   * where the occupation copy, the salary range and its qualifier actually render. Three
   * of them changed in this pass and the suite would not have noticed. One slug per
   * template is enough: they share a component, so a break is a break for all 55.
   */
  { path: "/resume-examples/software-engineer", must: "Indicative range only" },
  { path: "/ar/resume-examples/software-engineer", must: "نطاق استرشادي فقط" },
  { path: "/resume-skills/software-engineer", must: "Indicative range only" },
  { path: "/cover-letter-examples/software-engineer", must: "" },
  { path: "/resume-templates/ats-pro", must: "" },
  // The retired Arabic chat builder must still answer, as a redirect.
  { path: "/ar/builder", must: "", redirectsTo: "/ar/build" },
];

let pass = 0, fail = 0;
const emit = (line) => {
  console.log(line);
  if (LOG) { try { appendFileSync(LOG, line + "\n"); } catch { /* logging must not fail a test */ } }
};
const ok = (n, c, d = "") => {
  if (c) { pass++; emit(`✅ ${n}`); }
  else { fail++; emit(`❌ ${n}${d ? ` — ${d}` : ""}`); }
};

/**
 * The floor of the heading's stacking chain.
 *
 * Walks from the page's main heading to <body>, taking the largest z-index of any
 * positioned ancestor. That number is what decides whether the ambient field paints
 * over the page, so it is the number worth asserting.
 */
const CONTENT_Z = (page) => page.evaluate(() => {
  const el = document.querySelector("main h1, main h2, h1, h2");
  if (!el) return { z: null, why: "no heading" };
  let n = el.parentElement, z = 0, chain = [];
  while (n && n !== document.body) {
    const cs = getComputedStyle(n);
    if (cs.position !== "static") {
      const v = cs.zIndex === "auto" ? 0 : Number(cs.zIndex);
      chain.push(`${n.tagName.toLowerCase()}:${cs.position}:${cs.zIndex}`);
      if (v > z) z = v;
    }
    n = n.parentElement;
  }
  const amb = document.querySelector(".ambient-field");
  return { z, ambient: amb ? Number(getComputedStyle(amb).zIndex) : null, chain };
});

const run = async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });

  for (const r of ROUTES) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      const t = m.text();
      // Local-only noise: the analytics script only exists once deployed, and a 404
      // page's MIME type complaint follows from it.
      if (/_vercel\/insights|^Failed to load resource/.test(t)) return;
      errors.push(t);
    });

    let res;
    try {
      res = await page.goto(BASE + r.path, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(700);
    } catch (e) {
      ok(`${r.path} loads`, false, String(e).slice(0, 90));
      await page.close();
      continue;
    }

    const url = page.url().replace(BASE, "");
    if (r.redirectsTo) {
      ok(`${r.path} → ${r.redirectsTo}`, url === r.redirectsTo, `landed on ${url}`);
      await page.close();
      continue;
    }

    ok(`${r.path} answers 200`, res.status() === 200, `got ${res.status()}`);

    const body = await page.textContent("body").catch(() => "");
    if (r.must) {
      ok(`${r.path} renders its own content`, new RegExp(r.must, "i").test(body || ""), r.must);
    }

    const title = await page.title();
    ok(`${r.path} has a title`, title.trim().length > 5, title);

    const h1s = await page.locator("h1").count();
    ok(`${r.path} has exactly one h1`, h1s === 1, `${h1s} found`);

    /* The contract. This is the assertion the invisible-page bug would have failed. */
    const { z, ambient, why, chain } = await CONTENT_Z(page);
    if (why) {
      ok(`${r.path} has a heading to check`, false, why);
    } else {
      ok(`${r.path} content paints above the ambient field`,
        ambient === null || z > ambient,
        `content z=${z} vs ambient z=${ambient} · chain ${JSON.stringify(chain)}`);
    }

    /* A page must not scroll sideways — the most common mobile-layout defect. */
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`${r.path} does not scroll horizontally`, overflow <= 1, `${overflow}px wider than the viewport`);

    ok(`${r.path} logs no page errors`, errors.length === 0, errors.slice(0, 1).join(""));

    await page.close();
  }

  await browser.close();
};

run().then(() => {
  emit(`${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}).catch((e) => {
  console.error("harness error:", e);
  process.exit(1);
});
