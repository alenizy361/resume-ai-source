/**
 * What the builder does when the connection goes away.
 *
 * The draft never needed one — every write is `localStorage` — but nothing in the product said so.
 * A user in a lift or on a train saw "Saved" beside a dead connection, and a tap on Suggest
 * answered "the assistant is unavailable", which blames the product for the user's signal and
 * invites another tap that will also fail.
 *
 * Three things have to hold, and only a real browser can show them:
 *
 *   · typing while offline still reaches the draft, and survives a reload
 *   · the header says which of the two promises is affected — the work is safe, the suggestions
 *     are not
 *   · asking for a suggestion offline produces the sentence about the CONNECTION, and does not
 *     spend a request finding out
 *
 * The last one is why this drives the browser rather than the hook: `navigator.onLine` is a
 * platform value, and a unit test asserting a mocked one proves only that the mock was set.
 *
 * Needs the app running (`npm run dev`), like `ops/devices.test.mjs` and `ops/chips.test.mjs`.
 *
 *   node ops/offline.test.mjs [baseUrl]
 */

import { chromium, devices } from "playwright";

const BASE = process.argv[2] || "http://localhost:3141";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const ctx = await browser.newContext(devices["iPhone 13"]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));

/* Every request that leaves the page while "offline", so a doomed call is visible rather than
   inferred. */
const sent = [];
await page.route("**/api/**", (r) => { sent.push(r.request().url()); return r.continue(); });

await page.goto(`${BASE}/builder`, { waitUntil: "networkidle" });
const enter = page.locator('a[href^="/builder/r"][href$="/target"]').first();
await enter.waitFor({ timeout: 25_000 });
await enter.click();
await page.waitForURL(/\/target$/);
await page.waitForSelector(".bd-form input.bd-input");
const id = new URL(page.url()).pathname.split("/").filter(Boolean).at(-2);

/* ── the connection goes away ── */

await ctx.setOffline(true);
await page.evaluate(() => window.dispatchEvent(new Event("offline")));
await page.waitForTimeout(300);

const label = (await page.locator(".bd-save").first().innerText().catch(() => "")).trim();
ok("the header says the connection is gone", /Offline|بلا اتصال/.test(label), JSON.stringify(label));
ok("and says the work is safe rather than only that it failed",
  /device|جهازك/.test(label), JSON.stringify(label));

/* ── typing offline still reaches the draft ── */

const TYPED = "Radiology Technologist";
await page.fill(".bd-form input.bd-input >> nth=0", TYPED);
await page.waitForTimeout(1200); // past the 450ms autosave debounce

const stored = await page.evaluate(() => JSON.stringify(window.localStorage).length);
ok("something was written to this device while offline", stored > 100, `${stored} bytes`);

/* ── a suggestion asked for offline ── */

/*
 * The connection comes back only to LOAD the step, then goes away again.
 *
 * Not a convenience: a dev server serves each route over the network, so navigating while offline
 * fails at the page, before any of the behaviour under test runs — the test would be measuring the
 * harness. A user reaching a step and then losing signal is also the realistic sequence.
 */
await ctx.setOffline(false);
await page.evaluate(() => window.dispatchEvent(new Event("online")));
await page.goto(`${BASE}/builder/${id}/skills`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await ctx.setOffline(true);
await page.evaluate(() => window.dispatchEvent(new Event("offline")));
await page.waitForTimeout(300);
sent.length = 0;

const ask = page.locator("button", { hasText: /Suggest|اقترح|Show suggestions|اعرض/ }).first();
if (await ask.count()) {
  await ask.click().catch(() => {});
  await page.waitForTimeout(800);
  const body = await page.evaluate(() => document.body.innerText);
  ok("the answer is about the connection, not about the assistant",
    /offline|اتصال/i.test(body) && !/assistant is unavailable/i.test(body));
  ok("and no request was sent to find that out",
    sent.filter((u) => /\/api\/(generate|suggest)/.test(u)).length === 0,
    sent.join(" · "));
} else {
  ok("a suggest control was reachable offline", false, "no button found");
}

/* ── the connection comes back, and so does the work ── */

await ctx.setOffline(false);
await page.evaluate(() => window.dispatchEvent(new Event("online")));
await page.goto(`${BASE}/builder/${id}/target`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);

const value = await page.inputValue(".bd-form input.bd-input >> nth=0").catch(() => "");
ok("what was typed offline is still there after reconnecting", value === TYPED, JSON.stringify(value));

const back = (await page.locator(".bd-save").first().innerText().catch(() => "")).trim();
ok("and the header stops claiming to be offline", !/Offline|بلا اتصال/.test(back), JSON.stringify(back));

ok("no page errors", errors.length === 0, errors.join(" · "));

/* ── a draft that cannot be read is HELD, not overwritten ── */

/*
 * The other way a user loses work, and until now the silent one: a truncated draft — an iOS tab
 * killed mid-write — parsed as nothing, looked like a new visitor, and was overwritten by the
 * autosave 450ms after arrival. `ops/lifecycle.test.mjs` proves the store keeps the bytes; this
 * proves the running builder does not write over them.
 */
/*
 * Damaged from a page that has no builder mounted.
 *
 * Injecting it into a live builder tab proves nothing: leaving that page fires `pagehide`, the
 * provider flushes its perfectly valid in-memory state, and the truncation is overwritten by the
 * harness's own doing before the next load ever reads it. A real truncation — a tab killed
 * mid-write — has no live provider behind it, which is what this reproduces.
 */
await page.goto(`${BASE}/pricing`, { waitUntil: "networkidle" });
await page.evaluate(() => {
  window.localStorage.setItem("ra_journey_en", '{"resumeId":"rTRUNC","profile":{"role":"Radiog');
});
await page.goto(`${BASE}/builder/rTRUNC/target`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await page.fill(".bd-form input.bd-input >> nth=0", "Something new");
await page.waitForTimeout(1500); // well past the 450ms autosave

const after = await page.evaluate(() => ({
  live: window.localStorage.getItem("ra_journey_en"),
  kept: window.localStorage.getItem("ra_journey_en_damaged"),
  label: (document.querySelector(".bd-save") || {}).textContent || "",
}));

ok("the unreadable draft was copied aside", (after.kept || "").includes("Radiog"), JSON.stringify(after.kept));
ok("and nothing wrote over the live key", (after.live || "").includes("Radiog"), JSON.stringify(after.live || "").slice(0, 120));
ok("the header says the draft could not be read",
  /could not be read|تعذّرت قراءة/.test(after.label), JSON.stringify(after.label));

await browser.close();
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
