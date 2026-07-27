/**
 * Does the funnel entry actually get stamped, and does the landing event actually fire?
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS SUITE EXISTS
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * The standing rule from earlier in this session: an effect that is written is not an effect that
 * runs. It applies with extra force here, because this exact feature failed exactly this way once
 * already — the earlier attempt at O-15 reported "nothing written to `ra_funnel_entry`, no event, on
 * any page," and the postmortem says plainly it was never diagnosed. `ops/funnel.test.mjs` proves the
 * CLASSIFIER is correct; it says nothing about whether the classifier ever gets called in a browser,
 * which is exactly the kind of gap that produced the original silent failure.
 *
 * So this drives real Chromium against the real built pages and reads real `window.va`/`window.vaq`
 * and real `sessionStorage` — the same objects `@vercel/analytics`'s own script would read.
 *
 *   BASE=http://localhost:3391 node ops/funnelbootstrap.browser.mjs
 */

import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:3391";
let pass = 0, fail = 0;
const ok = (n, c, d = "") => {
  if (c) { pass++; console.log(`✅ ${n}`); }
  else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); }
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });

/* ── 1. a static catalogue page: entry stamped, landing event queued, no React needed ─────────── */

console.log("\n── /resume-examples/registered-nurse, arriving from Google ──");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: {} });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`   PAGE ERROR: ${String(e).slice(0, 200)}`));
  /* A referrer header alone does not set document.referrer for a direct navigation; set it via
     an intermediate page carrying a real link, which is what document.referrer actually reflects. */
  await page.setExtraHTTPHeaders({});
  await page.goto(`${BASE}/resume-examples/registered-nurse`, {
    waitUntil: "load", referer: "https://www.google.com/search?q=resume",
  });
  await page.waitForTimeout(600);

  const state = await page.evaluate(() => ({
    va: typeof window.va,
    vaq: window.vaq,
    entry: (() => { try { return JSON.parse(sessionStorage.getItem("ra_funnel_entry")); } catch { return null; } })(),
  }));

  ok("window.va exists (the queueing stub installed)", state.va === "function", state.va);
  ok("the entry was stamped in sessionStorage", Boolean(state.entry), JSON.stringify(state.entry));
  ok("with the right page family", state.entry?.family === "profession", JSON.stringify(state.entry));
  ok("and the right slug", state.entry?.slug === "registered-nurse", JSON.stringify(state.entry));
  ok("and English", state.entry?.lang === "en", JSON.stringify(state.entry));
  ok("the referrer classified as search", state.entry?.from === "search", JSON.stringify(state.entry));

  ok("the landing event was queued for the real analytics script to send",
    Array.isArray(state.vaq) && state.vaq.length === 1, JSON.stringify(state.vaq));
  const call = state.vaq?.[0];
  ok("as an 'event' call", call?.[0] === "event", JSON.stringify(call));
  ok("named funnel_landing", call?.[1]?.name === "funnel_landing", JSON.stringify(call));
  ok("carrying the classified fields and nothing else",
    JSON.stringify(Object.keys(call?.[1]?.data || {}).sort()) === JSON.stringify(["family", "from", "lang", "slug"]),
    JSON.stringify(call?.[1]?.data));

  await ctx.close();
}

/* ── 2. no React client runtime is needed for the entry alone ─────────────────────────────────── */

console.log("\n── the entry stamp works with JavaScript's React runtime never loading ──");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  /* Block every chunk whose name suggests React/Next's client runtime, so the entry-stamp assertion
     is genuinely about the inline script, not about React having hydrated fast enough to race it. */
  let reactChunkRequested = false;
  await page.route("**/_next/static/chunks/**", (route) => {
    reactChunkRequested = true;
    route.abort();
  });
  await page.goto(`${BASE}/resume-examples`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(800);
  const entry = await page.evaluate(() => {
    try { return JSON.parse(sessionStorage.getItem("ra_funnel_entry")); } catch { return null; }
  });
  ok("the entry is still stamped with every JS chunk blocked", Boolean(entry), JSON.stringify(entry));
  ok("this page really does request chunks normally (the block was real)", reactChunkRequested);
  await ctx.close();
}

/* ── 3. a second page in the same tab does not re-stamp the entry ─────────────────────────────── */

console.log("\n── the entry is the FIRST page, not the last one visited ──");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/resume-examples`, { waitUntil: "load", referer: "https://www.google.com/" });
  await page.waitForTimeout(500);
  const first = await page.evaluate(() => sessionStorage.getItem("ra_funnel_entry"));

  await page.goto(`${BASE}/pricing`, { waitUntil: "load" });
  await page.waitForTimeout(500);
  const second = await page.evaluate(() => sessionStorage.getItem("ra_funnel_entry"));

  ok("the entry is unchanged after visiting a second page", first === second,
    `${first} → ${second}`);
  /* `goto()` to a second URL is a HARD navigation — `window` (and `window.vaq` with it) resets, so
     the first page's queued call is gone regardless of correctness. What proves the beacon did NOT
     re-fire on this page is that `window.vaq` is empty here: sessionStorage already held the entry
     when this page's script ran, so `if (!sessionStorage.getItem(k))` was false and nothing was
     pushed. A length of 1 would mean this page wrongly stamped and queued a second landing. */
  const vaqLen = await page.evaluate(() => (window.vaq || []).length);
  ok("and this page did not queue a second landing event", vaqLen === 0, String(vaqLen));
  await ctx.close();
}

/* ── 4. the tool pages: root entry + React step beacon, together, correctly ───────────────────── */

console.log("\n── /optimize: the entry script AND the React step beacon coexist ──");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/optimize`, { waitUntil: "load", referer: "https://www.google.com/" });
  await page.waitForTimeout(1200);

  const state = await page.evaluate(() => ({
    entry: (() => { try { return JSON.parse(sessionStorage.getItem("ra_funnel_entry")); } catch { return null; } })(),
    vaq: window.vaq,
  }));
  ok("the entry is stamped once (family: tool)", state.entry?.family === "tool", JSON.stringify(state.entry));
  const names = (state.vaq || []).map((c) => c[1]?.name);
  ok("landing fired exactly once", names.filter((n) => n === "funnel_landing").length === 1, JSON.stringify(names));
  ok("and the React beacon's own step fired too, from the same entry",
    names.includes("funnel_tool_opened"), JSON.stringify(names));
  await ctx.close();
}

/* ── 5. the real analytics script is referenced, not the React component ──────────────────────── */

console.log("\n── the page no longer ships the React Analytics component ──");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/resume-examples`, { waitUntil: "load" });
  const hasInsightsScript = await page.evaluate(() =>
    Boolean(document.querySelector('script[src*="/_vercel/insights/script.js"]')));
  ok("the plain analytics script tag is present", hasInsightsScript);
  await ctx.close();
}

await browser.close();
console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
