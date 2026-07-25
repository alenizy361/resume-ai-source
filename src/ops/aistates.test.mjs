/**
 * The AI states, forced one at a time in a real browser.
 *
 * `ops/aitasks.test.mjs` proves `runTask` returns the right state. This proves the state
 * reaches the screen, in the right words, in both languages — which is a separate claim and
 * the one the audit actually made: the states existed in three sections, were absent in two,
 * and no two sections worded a failure the same way.
 *
 * Every response is intercepted, so no real model call is made and nothing is spent. That
 * matters here beyond tidiness: the last live round of a hundred calls came out of the
 * owner's own AI budget, so a test suite that hits the provider is a test suite that cannot
 * be run often enough to be useful.
 *
 * The four cases, and why each is worth an assertion:
 *
 *   empty     — a 200 with nothing usable. Must NOT read as a failure, or users learn to
 *               ignore failures. This is the state no section had before.
 *   throttled — a 429. Must not read as "busy, try again", which is an invitation to click
 *               again and spend more credit being refused.
 *   error     — a 500. Must say the form still works without it.
 *   success   — chips that are offered and not added. Nothing may reach the CV untapped.
 *
 *   node ops/aistates.test.mjs [baseUrl]
 */

import { chromium } from "playwright";

const BASE = process.argv[2] || "http://localhost:3141";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };

/** Answer /api/suggest with whatever this case needs, and count the calls. */
async function intercept(page, reply) {
  const calls = [];
  await page.route("**/api/suggest", async (route) => {
    calls.push(route.request().postDataJSON?.() ?? null);
    await route.fulfill({
      status: reply.status ?? 200,
      contentType: "application/json",
      body: JSON.stringify(reply.body ?? {}),
    });
  });
  return calls;
}

/** Open a step with a job title already in place, so the AI controls are reachable. */
async function atStep(browser, step, lang = "en") {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const p = lang === "ar" ? "/ar" : "";
  await page.goto(`${BASE}${p}/builder`, { waitUntil: "networkidle" });
  const link = page.locator(`a[href^="${p}/builder/r"][href$="/target"]`).first();
  await link.waitFor({ timeout: 20000 });
  await link.click();
  await page.waitForURL(/\/target$/);
  await page.waitForSelector("input.bd-input");
  await page.fill("input.bd-input >> nth=0", lang === "ar" ? "أخصائي أشعة" : "Radiology Technologist");
  const id = new URL(page.url()).pathname.split("/").filter(Boolean).at(-2);
  // Continue flushes, so the title survives the navigation to the step under test.
  await page.locator(".bd-step-foot button.btn-accent").click();
  await page.waitForURL(/\/blueprint$/);
  await page.goto(`${BASE}${p}/builder/${id}/${step}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  return { page, ctx };
}

const STRIP = 'button:has-text("Suggest with AI")';
const STRIP_AR = 'button:has-text("اقترح بالذكاء")';

const run = async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });

  /* ── the two sections that had no AI at all now have it ── */

  for (const step of ["credentials", "languages"]) {
    const { page, ctx } = await atStep(browser, step);
    ok(`/${step} offers an AI suggestion at all`, await page.locator(STRIP).count() === 1);
    await ctx.close();
  }

  /* ── empty ── */

  {
    const { page, ctx } = await atStep(browser, "credentials");
    const calls = await intercept(page, { body: { items: [] } });
    await page.locator(STRIP).click();
    await page.waitForTimeout(900);
    const text = await page.locator(".bd-body").innerText();
    ok("an empty answer says there is nothing to add",
      text.includes("Nothing to add here"), text.slice(-120));
    ok("and it is not dressed as an error",
      !text.includes("unavailable") && !text.includes("busy"), text.slice(-120));
    ok("the empty answer cost exactly one call", calls.length === 1, String(calls.length));
    await ctx.close();
  }

  /* ── throttled ── */

  {
    const { page, ctx } = await atStep(browser, "credentials");
    const calls = await intercept(page, { status: 429, body: { error: "Slow down a little — try again in a minute." } });
    await page.locator(STRIP).click();
    await page.waitForTimeout(900);
    const text = await page.locator(".bd-body").innerText();
    ok("a 429 shows the route's own wording",
      text.includes("Slow down a little"), text.slice(-140));
    ok("a 429 is asked exactly once — no retry spends credit to be refused twice",
      calls.length === 1, String(calls.length));
    await ctx.close();
  }

  /* ── error ── */

  {
    const { page, ctx } = await atStep(browser, "languages");
    await intercept(page, { status: 500, body: {} });
    await page.locator(STRIP).click();
    await page.waitForTimeout(900);
    const text = await page.locator(".bd-body").innerText();
    ok("a server failure tells the user the form still works without it",
      /Keep typing|works without it/i.test(text), text.slice(-140));
    await ctx.close();
  }

  /* ── success, and nothing is added by arriving ── */

  {
    const { page, ctx } = await atStep(browser, "credentials");
    await intercept(page, { body: { items: ["SCFHS Professional Registration", "Basic Life Support (BLS)"] } });
    await page.locator(STRIP).click();
    await page.waitForTimeout(900);
    const body = await page.locator(".bd-body").innerText();
    ok("suggestions arrive as chips", body.includes("SCFHS Professional Registration"));

    /*
     * The invariant, checked where it counts: a suggestion that has not been tapped must not
     * be in the document. The preview renders `profile`, and an unconfirmed credential has
     * no path into it — this is the assertion that the path really is absent rather than
     * merely intended.
     */
    const preview = await page.locator(".bd-preview").innerText();
    ok("and an untapped suggestion is NOT on the CV",
      !preview.includes("Basic Life Support"), preview.slice(0, 120));
    await ctx.close();
  }

  /* ── the same states, in Arabic ── */

  {
    const { page, ctx } = await atStep(browser, "credentials", "ar");
    ok("the Arabic builder offers the same control", await page.locator(STRIP_AR).count() === 1);
    await intercept(page, { body: { items: [] } });
    await page.locator(STRIP_AR).click();
    await page.waitForTimeout(900);
    const text = await page.locator(".bd-body").innerText();
    ok("and says 'nothing to add' in Arabic",
      text.includes("لا شيء يُضاف هنا"), text.slice(-120));
    ok("the Arabic empty state carries no English",
      !/[A-Za-z]{4,}/.test(text.split("لا شيء يُضاف هنا")[1] ?? ""), text.slice(-120));
    await ctx.close();
  }

  /* ── cancellation ── */

  {
    const { page, ctx } = await atStep(browser, "credentials");
    // A request that never answers, so the button must offer a way out.
    await page.route("**/api/suggest", () => { /* deliberately never fulfilled */ });
    await page.locator(STRIP).click();
    await page.waitForTimeout(500);
    ok("while a suggestion is in flight the button offers Stop",
      await page.locator('button:has-text("Stop")').count() === 1);
    await page.locator('button:has-text("Stop")').click();
    await page.waitForTimeout(300);
    const text = await page.locator(".bd-body").innerText();
    ok("cancelling leaves no error message behind — the user chose it",
      !/unavailable|Keep typing/i.test(text), text.slice(-120));
    ok("and the control is offered again", await page.locator(STRIP).count() === 1);
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
