/**
 * The step routes keep the user's work. Asserted, not assumed.
 *
 * This is the only test in the suite that can fail the way the restructure was most
 * likely to fail. Splitting one long page into eleven routes trades a guaranteed property
 * — the reducer is mounted, so state persists — for an arranged one: the provider must sit
 * in the LAYOUT, and every Continue must flush BEFORE it navigates. Both are invisible in
 * a diff and both are silent when wrong. The symptom is a user pressing Continue and
 * finding the field they just filled empty.
 *
 * So the checks here are deliberately about the two failure modes rather than about the
 * markup:
 *
 *   1. soft navigation  — type, Continue, come back: the value is still there
 *   2. cold load        — type, Continue, then RELOAD the next step and go back
 *
 * (2) is the one that catches a missing flush. (1) passes on a layout-mounted provider
 * even if nothing is ever written to storage, because the reducer never unmounted.
 *
 *   node ops/steps.test.mjs [baseUrl]
 *
 * Needs a running `next dev`. Pointing it at `next start` in this sandbox produces
 * spurious failures: the local production server serves HTML referencing a client chunk
 * the build never wrote, so nothing hydrates and every interaction times out.
 */

import { chromium } from "playwright";

const BASE = process.argv[2] || "http://localhost:3114";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => {
  if (c) { pass++; console.log(`✅ ${n}`); }
  else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); }
};

/** The job title field, which is the first thing any real user types. */
const TITLE = 'input.bd-input[placeholder="Radiology Technologist"]';

const run = async () => {
  const browser = await chromium.launch({
    headless: true,
    // The sandbox's bundled build, same as ops/routes.test.mjs — Playwright's default
    // path points at a headless-shell revision that is not installed here.
    executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  /* ── the landing page ── */

  await page.goto(`${BASE}/builder`, { waitUntil: "networkidle" });
  ok("/builder answers with its own heading",
    (await page.locator("h1").first().innerText()).includes("Build your CV"));
  ok("/builder has exactly one h1", await page.locator("h1").count() === 1);
  ok("/builder lists all eleven steps", await page.locator("ol li a").count() >= 11);

  /* ── into the first step ── */

  await page.locator('a[href*="/builder/"][href$="/target"]').first().click();
  await page.waitForURL(/\/builder\/[^/]+\/target$/);
  const url = new URL(page.url());
  const resumeId = url.pathname.split("/")[2];
  ok("the first step is addressable under a resume id", /^r[a-z0-9]+$/.test(resumeId), resumeId);
  ok("the step heading is the step's own", (await page.locator("h1").innerText()).includes("job you are aiming for"));
  ok("the step navigation shows every step", await page.locator(".bd-nav a").count() === 11);
  ok("the current step is marked for a screen reader",
    await page.locator('.bd-nav a[aria-current="step"]').count() === 1);

  /* ── 1. soft navigation keeps state ── */

  await page.fill(TITLE, "Radiology Technologist");
  await page.locator(".bd-step-foot button.btn-accent").click();
  await page.waitForURL(/\/blueprint$/);
  ok("Continue advances to the next step", page.url().endsWith("/blueprint"));
  ok("the completed step is ticked in the navigation",
    (await page.locator('.bd-nav a[href$="/target"] .bd-tick').innerText()).includes("✓"));
  ok("the blueprint recognised the title typed on the previous step",
    (await page.locator(".bd-body").innerText()).includes("Radiology"));

  await page.locator(".bd-step-foot .bd-back").click();
  await page.waitForURL(/\/target$/);
  ok("going Back returns to the previous step", page.url().endsWith("/target"));
  ok("Back did not lose the typed value",
    await page.inputValue(TITLE) === "Radiology Technologist");

  /* ── the preview is fed by the shared state, from any step ── */

  await page.fill('input.bd-input >> nth=0', "Radiology Technologist");
  await page.locator('.bd-nav a[href$="/personal"]').click();
  await page.waitForURL(/\/personal$/);
  await page.fill('input.bd-input >> nth=0', "Aisha Al-Otaibi");
  await page.waitForTimeout(700);
  const preview = await page.locator(".bd-preview").innerText();
  ok("the preview beside the form shows what was just typed",
    preview.includes("Aisha Al-Otaibi"), preview.slice(0, 80));

  /* ── 2. cold load: the flush actually happened ── */

  await page.locator(".bd-step-foot button.btn-accent").click();
  await page.waitForURL(/\/experience$/);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  ok("a reloaded step still knows the resume id", page.url().includes(resumeId));

  await page.goto(`${BASE}/builder/${resumeId}/personal`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  ok("a COLD LOAD of an earlier step restores what Continue saved",
    await page.inputValue('input.bd-input >> nth=0') === "Aisha Al-Otaibi",
    await page.inputValue('input.bd-input >> nth=0'));

  await page.goto(`${BASE}/builder/${resumeId}/target`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  ok("and the step before that one too",
    await page.inputValue(TITLE) === "Radiology Technologist");

  /* ── the landing page offers the draft back ── */

  await page.goto(`${BASE}/builder`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const landing = await page.locator("main").innerText();
  ok("/builder offers to continue the saved draft",
    landing.includes("Continue where you left off"));
  ok("and names it by the job it is aimed at",
    landing.includes("Radiology Technologist"), landing.slice(0, 200));

  /* ── a wrong id in the URL is repaired, not 404ed ── */

  await page.goto(`${BASE}/builder/rNOTREAL/summary`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  ok("a stale resume id is rewritten to the real one",
    page.url().endsWith(`/builder/${resumeId}/summary`), page.url());

  /* ── an unknown step is a 404, not a blank page ── */

  const res = await page.goto(`${BASE}/builder/${resumeId}/qualifications`);
  ok("an unknown step 404s rather than rendering an empty form", res.status() === 404, String(res.status()));

  /* ── `export` is accepted as an alias for the download step ── */

  await page.goto(`${BASE}/builder/${resumeId}/export`, { waitUntil: "networkidle" });
  ok("/export renders the design & download step",
    (await page.locator("h1").innerText()).includes("Design"));

  /* ── Arabic, the same journey ── */

  const arCtx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const ar = await arCtx.newPage();
  const arErrors = [];
  ar.on("pageerror", (e) => arErrors.push(String(e)));
  await ar.goto(`${BASE}/ar/builder`, { waitUntil: "networkidle" });
  ok("/ar/builder renders its own Arabic heading",
    (await ar.locator("h1").first().innerText()).includes("ابنِ سيرتك"));
  ok("/ar/builder is right-to-left", await ar.locator(".build-root").getAttribute("dir") === "rtl");

  await ar.locator('a[href*="/ar/builder/"][href$="/target"]').first().click();
  await ar.waitForURL(/\/ar\/builder\/[^/]+\/target$/);
  const arId = new URL(ar.url()).pathname.split("/")[3];
  await ar.fill('input.bd-input >> nth=0', "أخصائي أشعة");
  await ar.locator(".bd-step-foot button.btn-accent").click();
  await ar.waitForURL(/\/blueprint$/);
  await ar.goto(`${BASE}/ar/builder/${arId}/target`, { waitUntil: "networkidle" });
  await ar.waitForTimeout(600);
  ok("the Arabic journey survives a cold load too",
    await ar.inputValue('input.bd-input >> nth=0') === "أخصائي أشعة");

  /*
   * The two languages must not share one draft.
   *
   * They are separate keys on purpose — an Arabic CV and an English CV are two documents,
   * and the store has always keyed on language. Worth asserting because the resume id is
   * new and a single id namespace across both would silently merge them.
   */
  ok("the Arabic draft is not the English one", arId !== resumeId, `${arId} vs ${resumeId}`);

  ok("no page errors in the English journey", errors.length === 0, errors.slice(0, 1).join(""));
  ok("no page errors in the Arabic journey", arErrors.length === 0, arErrors.slice(0, 1).join(""));

  await browser.close();
  console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
