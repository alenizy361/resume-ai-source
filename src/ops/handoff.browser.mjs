/**
 * The hand-off from /optimize to the builder, driven through the real pages.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS RATHER THAN ONLY THE UNIT SUITE
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * Every claim in this item came from a browser in the first place. `ops/handoff.test.mjs` proved the
 * old transport wrote the wrong key — but the three findings that decided the DESIGN were only
 * visible with the pages running:
 *
 *   - the "you already have work in the builder" confirm never fired, because it read a key nothing
 *     writes. A unit test of `builderDraftExists` would have passed: it correctly reported what was
 *     in the store it was asked about. The defect was that it was asked about the wrong store.
 *   - the start screen then offered the scan as the one CV in progress, with the user's own CV
 *     absent from the screen despite still being in storage.
 *   - `window.location.href` makes this a full page load, so the arriving state is whatever
 *     `BuilderProvider` reconstructs from disk — not anything the sending page kept in memory.
 *
 * None of those is checkable without a browser, and all three are exactly the kind of thing a
 * confident-looking refactor puts back.
 *
 *   BASE=http://localhost:3312 node ops/handoff.browser.mjs
 */

import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:3312";
let pass = 0, fail = 0;
const ok = (n, c, d = "") => {
  if (c) { pass++; console.log(`✅ ${n}`); }
  else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); }
};

const EXISTING = "Accountant";
const UPLOAD_ROLE = "Senior Radiographer";

const CV = [
  "Ahmed Ali", "Riyadh | ahmed@example.com", "", "PROFESSIONAL SUMMARY",
  "Radiology technologist with eight years across CT and MRI.", "", "WORK EXPERIENCE",
  `${UPLOAD_ROLE} — King Faisal Hospital | 2019 - 2024`,
  "- Performed 40 CT scans per week to protocol.", "", "SKILLS", "CT, MRI, PACS",
].join("\n");

const OPTIMIZE_REPLY = JSON.stringify({
  matchScore: 62, afterScore: 88, optimizedResume: "REWRITTEN — do not hand this over",
  matchSummary: "ok", missingKeywords: [], presentKeywords: [], skillsGap: [], improvements: [],
});

/**
 * A resume already in the builder, seeded before any app script runs.
 *
 * IDEMPOTENT, and that is not tidiness — `addInitScript` runs on every navigation in the context, so
 * the first version of this re-seeded `ra_cv_index:anon` on the builder page load and silently wiped
 * the index entry the hand-off had just written. Three assertions failed against a store the probe
 * itself had reset. Guarding on the record's presence is what makes the measurement about the
 * product rather than about the harness.
 */
const seedExisting = `(() => {
  const now = Date.now();
  if (localStorage.getItem("ra_cv:anon:mine1")) {
    sessionStorage.setItem("ra_visit_session", String(now));
    return;
  }
  const st = {
    schemaVersion: 3,
    target: { title: ${JSON.stringify(EXISTING)}, level: "", language: "en", industry: "", country: "",
              city: "", employer: "", jobAdUrl: "", jobAdText: "" },
    profile: { name: "Ahmed Ali", contact: "Riyadh", role: ${JSON.stringify(EXISTING)},
      summary: "Ten years in financial reporting.", wovenLines: ["- Closed the monthly books."],
      skills: "IFRS", education: "BSc Accounting", certifications: "", languages: "", extras: [],
      roles: [{ id: "r1", title: ${JSON.stringify(EXISTING)}, company: "Almarai", start: "2014", end: "2024",
                bullets: ["- Closed the monthly books."] }] },
    suggestions: [], entry: "new",
    personal: { fullName: "Ahmed Ali", professionalTitle: ${JSON.stringify(EXISTING)}, city: "", country: "",
                phone: "", email: "", linkedin: "", portfolio: "" },
    credentials: [], languages: [], template: "ats-pro",
    sectionsDone: ["target", "personal", "experience"],
  };
  localStorage.setItem("ra_cv:anon:mine1", JSON.stringify({
    owner: "anon", resumeId: "mine1", recordVersion: 1, revision: 4,
    lang: "en", updatedAt: now, dirty: false, state: st,
  }));
  localStorage.setItem("ra_cv_index:anon", JSON.stringify([
    { resumeId: "mine1", title: ${JSON.stringify(EXISTING)}, lang: "en", updatedAt: now, revision: 4 },
  ]));
  localStorage.setItem("ra_visit:anon", String(now));
  sessionStorage.setItem("ra_visit_session", String(now));
})()`;

const dump = (page) => page.evaluate(() => ({
  ids: Object.keys(localStorage).filter((k) => k.startsWith("ra_cv:anon:")).map((k) => k.split(":")[2]).sort(),
  legacyLive: localStorage.getItem("ra_journey_en") !== null,
  legacyRetired: localStorage.getItem("ra_journey_en_legacy") !== null,
  mine1: (() => {
    try { return JSON.parse(localStorage.getItem("ra_cv:anon:mine1")).state.target.title; }
    catch { return "GONE"; }
  })(),
  langs: Object.keys(localStorage).filter((k) => k.startsWith("ra_cv:anon:")).map((k) => {
    try {
      const st = JSON.parse(localStorage.getItem(k)).state;
      return `${k.split(":")[2]}=${st.target.title}/${st.target.language}`;
    } catch { return `${k}=?`; }
  }).sort(),
}));

const text = (page) => page.evaluate(() => document.body.innerText);

/** Paste, walk the three steps, stub the stream, land on the result screen. */
async function toResult(page, { arabic = false, pickLang = null } = {}) {
  await page.route("**/api/optimize", (r) => r.fulfill({
    status: 200, headers: { "content-type": "application/x-ndjson" },
    body: `{"t":"think","d":"…"}\n{"t":"result","d":${OPTIMIZE_REPLY}}\n`,
  }));
  await page.goto(`${BASE}${arabic ? "/ar/optimize" : "/optimize"}`, { waitUntil: "load" });
  await page.waitForTimeout(1600);
  await page.locator("textarea").first().fill(CV);
  await page.waitForTimeout(400);
  const cont = arabic ? 'button:has-text("متابعة")' : 'button:has-text("Continue")';
  await page.locator(cont).first().click();
  await page.waitForTimeout(500);
  await page.locator(cont).first().click();
  await page.waitForTimeout(700);
  if (pickLang) { await page.locator(`button:text-is("${pickLang}")`).first().click(); await page.waitForTimeout(300); }
  await page.locator(arabic ? 'button:has-text("حلّل سيرتي")' : 'button:has-text("Analyze")').first().click();
  await page.waitForTimeout(2500);
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });

/* ── 1. the user already has a CV: adding must not hide it ──────────────────────────── */

console.log("\n── a user who already has builder work ──");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(seedExisting);
  const page = await ctx.newPage();
  let dialog = "none";
  page.on("dialog", (d) => { dialog = d.message(); d.accept(); });
  page.on("pageerror", (e) => console.log(`   PAGE ERROR: ${String(e).slice(0, 200)}`));

  await toResult(page);
  const before = await text(page);
  ok("the page names the CV already in progress", before.includes(EXISTING),
    "the dialog this replaces could not fire, and could not have named it if it had");
  ok("and says a hand-off opens a new CV", /opens a new CV/.test(before));

  await page.locator('button:has-text("Keep editing in the builder")').first().click();
  await page.waitForLoadState("load").catch(() => {});
  await page.waitForTimeout(6000);

  const after = await dump(page);
  ok("no browser dialog was used at all", dialog === "none",
    `got: ${String(dialog).slice(0, 60)} — the choice belongs on the page, where it can name the CV`);
  ok("the retired key was never written", !after.legacyLive && !after.legacyRetired,
    JSON.stringify(after));
  ok("a second record now exists", after.ids.length === 2, after.ids.join(","));
  ok("and the user's own CV is untouched", after.mine1 === EXISTING, after.mine1);

  ok("the URL names the resume", /\/builder\/[^/]+\/target/.test(page.url()), page.url());
  /* The target-job step renders the title in an INPUT, and an input's value is not part of
     `innerText` — the first version of this assertion could never have passed. */
  const titleField = await page.locator(".build-root input").first().inputValue().catch(() => "");
  ok("the builder opened the scan", titleField === UPLOAD_ROLE, `field held "${titleField}"`);

  /* And the start screen must be able to show BOTH, or the second CV is unreachable. */
  await page.goto(`${BASE}/builder`, { waitUntil: "load" });
  await page.waitForTimeout(4000);
  const start = await text(page);
  ok("the start screen lists the CV that was already there", start.includes(EXISTING),
    "every consumer of the index took [0] until this change — a second CV had no screen");
  /* Scoped to the cards. `/Radiograph/i` against the whole page matched this route's own SEO copy
     — "the skills offered to a radiographer in Riyadh" — so it passed while the list held one row. */
  const cardTitles = await page.locator(".card .font-bold").allInnerTexts().catch(() => []);
  ok("and the one just handed over", cardTitles.some((t) => t.includes(UPLOAD_ROLE)),
    cardTitles.join(" | "));
  ok("with a plural heading now that there are two", /Your CVs here/.test(start),
    start.slice(0, 200).replace(/\n+/g, " | "));
  ok("and two continue buttons", (await page.locator('button:has-text("Continue →")').count()) === 2,
    String(await page.locator('button:has-text("Continue →")').count()));
  await ctx.close();
}

/* ── 2. replacing is available, explicit, and does not add ──────────────────────────── */

console.log("\n── replacing the CV in progress, on purpose ──");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(seedExisting);
  const page = await ctx.newPage();
  await toResult(page);

  const replace = page.locator(`button:has-text("replace")`);
  ok("the replace control names the CV it would replace",
    (await replace.count()) === 1 && (await replace.first().innerText()).includes(EXISTING),
    await replace.allInnerTexts().then((a) => a.join("|")).catch(() => "none"));

  await replace.first().click();
  await page.waitForLoadState("load").catch(() => {});
  await page.waitForTimeout(6000);
  const after = await dump(page);
  ok("no second CV was created", after.ids.length === 1, after.ids.join(","));
  ok("and the named record now holds the scan", after.mine1 !== EXISTING, after.mine1);
  await ctx.close();
}

/* ── 3. a first-time visitor: no choice to make, so none is shown ───────────────────── */

console.log("\n── nothing in progress ──");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await toResult(page);
  ok("no replace prompt when there is nothing to replace",
    !/opens a new CV/.test(await text(page)));
  await page.locator('button:has-text("Keep editing in the builder")').first().click();
  await page.waitForLoadState("load").catch(() => {});
  await page.waitForTimeout(6000);
  const after = await dump(page);
  ok("one record, no legacy key", after.ids.length === 1 && !after.legacyLive && !after.legacyRetired,
    JSON.stringify(after));
  await ctx.close();
}

/* ── 4. the document's language survives the hand-off ───────────────────────────────── */

console.log("\n── the language chosen on step 3 reaches the builder ──");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  /* An ENGLISH page, and the user picks Arabic for the document — the combination the old bridge
     dropped, because `stateFromText` defaults `target.language` to English. */
  await toResult(page, { pickLang: "العربية" });
  await page.locator('button:has-text("Keep editing in the builder")').first().click();
  await page.waitForLoadState("load").catch(() => {});
  await page.waitForTimeout(6000);
  const after = await dump(page);
  ok("the builder's document is Arabic", after.langs.some((l) => l.endsWith("/ar")),
    after.langs.join(" ; "));
  await ctx.close();
}

/* ── 5. the Arabic door does the same thing ─────────────────────────────────────────── */

console.log("\n── /ar/optimize ──");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(seedExisting);
  const page = await ctx.newPage();
  await toResult(page, { arabic: true });
  const body = await text(page);
  ok("the Arabic page names the CV in progress", body.includes(EXISTING), body.slice(0, 200).replace(/\n+/g, " | "));
  ok("and offers replacing it in Arabic", /استبدل/.test(body));

  await page.locator('button:has-text("واصل التعديل في البناء")').first().click();
  await page.waitForLoadState("load").catch(() => {});
  await page.waitForTimeout(6000);
  const after = await dump(page);
  ok("it lands inside the resume", /\/ar\/builder\/[^/]+\/target/.test(page.url()), page.url());
  ok("adds rather than replaces", after.ids.length === 2, after.ids.join(","));
  ok("and never touches the retired key",
    !after.legacyLive && !after.legacyRetired && !(await page.evaluate(() => localStorage.getItem("ra_journey_ar") !== null)));
  await ctx.close();
}

await browser.close();
console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
