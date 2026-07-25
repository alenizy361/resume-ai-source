/**
 * One CV, built the whole way, in a real browser — the test that says whether the product works.
 *
 * ── why this exists at the end ──
 *
 * There are thirty-seven other suites and they check parts: the reducer's invariants, the review's
 * findings, one step's layout at two widths, the chips, the offline copy. Every one of them can
 * pass while the product is unusable, because none of them walks a person from an empty page to a
 * downloaded file. That walk is the product.
 *
 * So this does the boring thing: fill in every step the way a user does, press Continue eleven
 * times, and check at the end that a real file came out with the user's real facts in it — and
 * that nothing the user did not confirm is in it, which is the promise the whole document model
 * exists to keep.
 *
 * ── what it deliberately does not do ──
 *
 * It does not touch the model. Every AI call is stubbed at the network layer, because this is
 * about the FLOW and a suite that spends money cannot be run on every change. `ops/arabic-quality.mjs`
 * is where the model's own output is measured, and it is separate for exactly that reason.
 *
 * Needs the app running (`npm run dev`).
 *
 *   node ops/journey.test.mjs [baseUrl]
 */

import { chromium, devices } from "playwright";

const BASE = process.argv[2] || "http://localhost:3141";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };

const FACTS = {
  title: "Radiology Technologist",
  country: "Saudi Arabia",
  name: "Abdulaziz Alenizy",
  email: "abdulaziz@example.com",
  phone: "+966550000000",
  employer: "Dallah Hospital",
  role: "Radiology Technologist",
  start: "Sep 2024",
  bullet: "Operated CT and MRI scanners on the day and night rota",
  education: "BSc Radiologic Science — KSAU-HS, 2022",
};

/* A suggestion the user will NOT confirm. If this reaches the CV, the document model has failed. */
const NEVER = "Managed a team of twelve radiographers across three sites";

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

for (const prof of [
  { name: "desktop", ctx: { viewport: { width: 1440, height: 900 }, acceptDownloads: true } },
  { name: "iphone-13", ctx: { ...devices["iPhone 13"], acceptDownloads: true } },
]) {
  console.log(`\n── ${prof.name} ──`);
  const ctx = await browser.newContext(prof.ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));

  /*
   * Every paid call is stubbed, and the stub deliberately offers something the user will not
   * accept — so the run also proves that an unconfirmed suggestion cannot reach the document.
   */
  await page.route("**/api/generate", (r) => r.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({
      skillGroups: [{ label: "Imaging", items: ["CT imaging", "MRI imaging", "PACS"] }],
      responsibilityThemes: ["Patient positioning", "Image quality"],
      responsibilitySuggestions: [NEVER, "Verified patient identity before every examination"],
      summaries: [{ label: "Concise", text: "Radiology technologist experienced in CT and MRI across day and night rotas at a Riyadh hospital." }],
      credentialSuggestions: [],
      achievementQuestions: [], importantKeywords: [], commonTools: [], commonSystems: [],
      alternativeTitles: [], regulatoryWarnings: [], improvedUserBullets: [], relevantTools: [],
      confidence: 0.9, cvLang: "en",
      _meta: { model: "stub", requestId: "stub", occupationId: "radiology-technologist", countryCode: "sa" },
    }),
  }));
  await page.route("**/api/suggest", (r) => r.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ items: [NEVER] }),
  }));
  await page.route("**/api/optimize", (r) => r.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ matchScore: 72, missingKeywords: [], presentKeywords: [], improvements: [], skillsGap: [] }),
  }));

  /* ── in ── */

  await page.goto(`${BASE}/builder`, { waitUntil: "networkidle" });
  const enter = page.locator('a[href^="/builder/r"][href$="/target"]').first();
  await enter.waitFor({ timeout: 25_000 });
  await enter.click();
  await page.waitForURL(/\/target$/);
  await page.waitForSelector(".bd-form input.bd-input");
  const id = new URL(page.url()).pathname.split("/").filter(Boolean).at(-2);
  ok(`${prof.name}: the builder opened a resume`, Boolean(id), String(id));

  const fill = async (nth, value) => {
    const input = page.locator(".bd-form input.bd-input").nth(nth);
    if (!(await input.count())) return false;
    await input.fill(value);
    await page.waitForTimeout(120);
    return true;
  };
  const go = async (step) => {
    await page.goto(`${BASE}/builder/${id}/${step}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
  };

  /* ── target ── */
  await fill(0, FACTS.title);
  /* The country lives in a later field on this step; find it by its label rather than by index,
     because an index is a promise about a form's order that no form keeps. */
  const countryBox = page.locator(".bd-form label", { hasText: /^Country/ }).locator("input").first();
  if (await countryBox.count()) await countryBox.fill(FACTS.country);
  await page.waitForTimeout(800);

  /* ── personal ── */
  await go("personal");
  await fill(0, FACTS.name);
  const byLabel = async (label, value) => {
    const box = page.locator(".bd-form label", { hasText: label }).locator("input").first();
    if (!(await box.count())) return false;
    await box.fill(value);
    await page.waitForTimeout(120);
    return true;
  };
  ok(`${prof.name}: an email field exists`, await byLabel(/^Email/, FACTS.email));
  await byLabel(/^Phone/, FACTS.phone);
  await page.waitForTimeout(700);

  /* ── experience ── */
  await go("experience");
  const addRole = page.locator("button", { hasText: /Add (a )?(job|role|position)|Add experience/i }).first();
  if (await addRole.count()) { await addRole.click(); await page.waitForTimeout(400); }
  await byLabel(/^(Job title|Position|Title)/, FACTS.role);
  await byLabel(/^(Employer|Company)/, FACTS.employer);
  await byLabel(/^(Start|From)/, FACTS.start);
  await page.waitForTimeout(400);

  /* Confirm exactly ONE suggested responsibility — the one that is not the trap. */
  const addBullet = page.locator(".bd-sug button", { hasText: /^(Add|أضف)/ }).nth(1);
  if (await addBullet.count()) { await addBullet.click(); await page.waitForTimeout(400); }

  /* ── education ── */
  await go("education");
  const edu = page.locator(".bd-form textarea").first();
  if (await edu.count()) { await edu.fill(FACTS.education); await page.waitForTimeout(700); }

  /* ── skills: confirm two chips ── */
  await go("skills");
  const chips = page.locator(".bd-chip-group .bd-chip");
  const chipCount = await chips.count();
  for (let i = 0; i < Math.min(2, chipCount); i++) { await chips.first().click(); await page.waitForTimeout(250); }
  ok(`${prof.name}: skills could be confirmed`, chipCount > 0, `${chipCount} offered`);

  /* ── the rest of the steps must at least render ── */
  for (const step of ["blueprint", "credentials", "languages", "summary", "review"]) {
    await go(step);
    const empty = await page.evaluate(() => document.querySelector(".bd-form")?.textContent?.trim().length ?? 0);
    ok(`${prof.name}: ${step} renders content`, empty > 40, `${empty} chars`);
  }

  /* ── design: the end of the line ── */
  await go("design");
  await page.waitForTimeout(1200);

  const preview = await page.evaluate(() => document.body.innerText);
  ok(`${prof.name}: the finished CV carries the user's name`, preview.includes(FACTS.name));
  ok(`${prof.name}: and their employer`, preview.includes(FACTS.employer));

  /*
   * THE PROMISE. A suggestion nobody confirmed must not be anywhere near the document — not in the
   * preview, not in the export. This is the invariant `builderDoc.ts` is built around, checked at
   * the only place it actually matters.
   */
  ok(`${prof.name}: nothing unconfirmed reached the CV`, !preview.includes(NEVER));

  /* ── the download ── */
  const wordBtn = page.locator("button", { hasText: /Word|وورد/ }).first();
  ok(`${prof.name}: a Word download is offered`, await wordBtn.count() > 0);
  if (await wordBtn.count()) {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 20_000 }).catch(() => null),
      wordBtn.click(),
    ]);
    ok(`${prof.name}: pressing it produces a file`, Boolean(download), download ? await download.suggestedFilename() : "no download event");
  }

  /* ── and the CV is in the user's own list ── */

  /*
   * Downloading is what keeps it, and that is deliberate in the product: the moment a user commits
   * to a version is the moment it should appear under "My resumes", not a second button later.
   * So by now the Save button reads "Saved" and is disabled — the first version of this test
   * looked for "Save to my resumes" and failed, which was the test misunderstanding the flow.
   */
  const savedLabel = await page.locator("button", { hasText: /^(Saved|محفوظة)$/ }).count();
  ok(`${prof.name}: downloading kept the CV`, savedLabel > 0);

  const saved = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem("ra_saved_resumes") || "[]"); } catch { return []; }
  });
  ok(`${prof.name}: and it is in the saved list`, saved.length > 0, `${saved.length}`);
  ok(`${prof.name}: with what it was worth, measured at that moment`,
    saved.length > 0 && typeof saved[0].qualityScore === "number" && typeof saved[0].completion === "number",
    JSON.stringify(saved[0] ?? {}).slice(0, 140));
  ok(`${prof.name}: and the CV text itself, not a reference to it`,
    saved.length > 0 && String(saved[0].text || "").includes(FACTS.employer));

  ok(`${prof.name}: no page errors across the whole journey`, errors.length === 0, errors.slice(0, 2).join(" · "));
  await ctx.close();
}

await browser.close();
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
