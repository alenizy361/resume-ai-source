/**
 * Does the picker actually appear, actually fill the form, and actually reach the model?
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHY A UNIT SUITE WAS NOT ENOUGH
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * `ops/mycvs.test.mjs` proves `listMyCvs` returns the right list from the right stores under the
 * right rule. That is necessary and it is not sufficient, and this session has already paid for the
 * difference twice: an entrance animation that was written and never ran, and an analytics beacon
 * that was rewritten and silently stopped firing. The standing rule since then is that an effect
 * which is written is not an effect that runs.
 *
 * What only a browser can answer here:
 *
 *   - the component reads storage AFTER `useOwner` resolves, in an effect. If the owner never
 *     settles, or the effect is skipped, the list is empty and the page looks exactly as it did
 *     before this work — a feature that shipped disabled, which is invisible in a diff.
 *   - clicking an offer has to reach the page's own `useState` setters, through a callback prop,
 *     and land in the textarea the form actually submits.
 *   - the CV then has to survive into the REQUEST BODY. Filling a field the request ignores would
 *     satisfy every visual check and change nothing about what the model sees, which is the entire
 *     point of the item.
 *   - and the visit rule has to hold across a real new tab, where `sessionStorage` is genuinely
 *     absent rather than mocked.
 *
 * ── what is seeded, and what that means ──
 *
 * The builder record is written into `localStorage` directly rather than by driving eleven form
 * steps. The unit suite already proves `writeResume` → `listMyCvs`; what is under test here is
 * everything downstream of the read. A seed whose shape had drifted from the real writer's would
 * make the picker render nothing — so the first assertion is that the offer IS visible, and this
 * file fails loudly rather than passing vacuously.
 *
 * `/api/tools` is intercepted, so nothing is spent and the assertion about the request body is
 * about what the page SENDS rather than about what a model happens to answer.
 *
 *   BASE=http://localhost:3312 node ops/mycvs.browser.mjs
 */

import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:3312";
let pass = 0, fail = 0;
const ok = (n, c, d = "") => {
  if (c) { pass++; console.log(`✅ ${n}`); }
  else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); }
};

const CV_TITLE = "Radiology Technologist";
const JOB_AD = "Senior Radiographer — King Faisal Specialist Hospital. CT and MRI. Five years required.";
const MARKER = "- Performed 40 scans per week to protocol.";

/** The CV text `assembleResume` produces for the seeded state, which is what must land in the box. */
const seed = ({ language = "en", jobAdText = JOB_AD } = {}) => ({
  language, jobAdText, title: CV_TITLE, marker: MARKER,
});

/**
 * Put one builder record and its index entry in place before any app script runs.
 *
 * `addInitScript` rather than `evaluate`, because the layout purges a lapsed anonymous keyspace on
 * load: seeding after the app has started would be seeding into a store something is about to clear.
 */
function seedScript({ language, jobAdText, title, marker }, { markVisit = true } = {}) {
  return `(() => {
    const now = Date.now();
    const state = {
      schemaVersion: 2,
      target: { title: ${JSON.stringify(title)}, level: "", language: ${JSON.stringify(language)},
                industry: "", country: "", city: "", employer: "", jobAdUrl: "",
                jobAdText: ${JSON.stringify(jobAdText)} },
      profile: {
        name: "Ahmed Ali",
        contact: "Riyadh \\u00b7 ahmed@example.com",
        role: ${JSON.stringify(title)},
        summary: "Radiographer with eight years of hospital experience across CT and MRI.",
        wovenLines: [${JSON.stringify(marker)}, "- Trained four junior technologists."],
        skills: "CT \\u00b7 MRI \\u00b7 PACS",
        education: "BSc Radiologic Technology",
        certifications: "SCFHS registered",
        languages: "Arabic (native) \\u00b7 English (professional)",
        extras: [],
      },
      suggestions: [],
      personal: { fullName: "Ahmed Ali", professionalTitle: ${JSON.stringify(title)}, city: "", country: "",
                  phone: "", email: "", linkedin: "", portfolio: "" },
      credentials: [], languages: [], template: "ats-pro", sectionsDone: [],
    };
    localStorage.setItem("ra_cv:anon:probe1", JSON.stringify({
      owner: "anon", resumeId: "probe1", recordVersion: 1, revision: 1,
      lang: "en", updatedAt: now, dirty: false, state,
    }));
    localStorage.setItem("ra_cv_index:anon", JSON.stringify([
      { resumeId: "probe1", title: ${JSON.stringify(title)}, lang: "en", updatedAt: now, revision: 1 },
    ]));
    localStorage.setItem("ra_visit:anon", String(now));
    ${markVisit ? 'sessionStorage.setItem("ra_visit_session", String(now));' : ""}
    window.__markerOnArrival = sessionStorage.getItem("ra_visit_session");
  })()`;
}

/** The canned answer, so no model is called and no key is needed. */
const TOOLS_REPLY = JSON.stringify({
  questions: [{ q: "Walk me through a difficult scan.", why: "Tests judgement.", answer: "In 2022 I…" }],
  redFlags: [],
  headline: "Radiology Technologist | CT & MRI",
  about: "Eight years…",
  skills: ["CT", "MRI"],
  tips: ["Add your licence number."],
});

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });

/** Every `/api/tools` body this page sent, so the assertion is about the request and not the reply. */
async function captureTools(page) {
  const sent = [];
  await page.route("**/api/tools", async (route) => {
    try { sent.push(JSON.parse(route.request().postData() || "{}")); } catch { sent.push({}); }
    await route.fulfill({ status: 200, contentType: "application/json", body: TOOLS_REPLY });
  });
  return sent;
}

const text = (page) => page.evaluate(() => document.body.innerText);

/* ── 1. a first-time visitor sees the page exactly as it was ─────────────────────────── */

console.log("\n── nothing stored: the page is unchanged ──");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/interview`, { waitUntil: "load" });
  await page.waitForTimeout(1600);
  const body = await text(page);
  ok("no offer is shown to someone with no CV here", !/Use a CV you already made here/.test(body),
    "an empty box above the one field they need would be dead furniture — most of this page's traffic is from search");
  ok("and the paste field is still there", (await page.locator("textarea").count()) >= 2);
  await ctx.close();
}

/* ── 2. the CV is offered, fills BOTH boxes, and reaches the request ─────────────────── */

console.log("\n── /interview: the CV this browser holds ──");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(seedScript(seed()));
  const page = await ctx.newPage();
  const sent = await captureTools(page);
  await page.goto(`${BASE}/interview`, { waitUntil: "load" });
  await page.waitForTimeout(1800);

  const body = await text(page);
  ok("the offer appears", /Use a CV you already made here/.test(body));
  ok("and names the CV", body.includes(CV_TITLE), body.slice(0, 300));

  await page.locator(`button:has-text("${CV_TITLE}")`).first().click();
  await page.waitForTimeout(400);

  const resume = await page.locator("textarea").first().inputValue();
  const jd = await page.locator("textarea").nth(1).inputValue();
  ok("the resume box is filled with the assembled CV", resume.includes(MARKER), resume.slice(0, 120));
  ok("the summary came across too", /eight years of hospital experience/.test(resume));
  ok("the job advert filled the second box", jd === JOB_AD, jd.slice(0, 80));

  ok("the list is replaced by a statement of what was filled", /Filled from/.test(await text(page)));
  ok("with a way back to the other CVs", (await page.locator('button:has-text("Use a different CV")').count()) === 1);

  await page.locator('button[type="submit"]').last().click();
  await page.waitForTimeout(1200);
  ok("the request was sent", sent.length === 1, `${sent.length} requests`);
  ok("and it carried the CV, not an empty string", String(sent[0]?.inputA || "").includes(MARKER),
    "filling a field the request ignores would pass every visual check and change nothing");
  ok("and the job advert", String(sent[0]?.inputB || "") === JOB_AD);
  await ctx.close();
}

/* ── 3. the language follows the DOCUMENT ────────────────────────────────────────────── */

console.log("\n── an Arabic CV asks for Arabic questions ──");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  /* An Arabic CV, in the ENGLISH interface — the combination a hardcoded `lang: "en"` got wrong and
     an interface-derived language would get wrong too. */
  await ctx.addInitScript(seedScript(seed({ language: "ar" })));
  const page = await ctx.newPage();
  const sent = await captureTools(page);
  await page.goto(`${BASE}/interview`, { waitUntil: "load" });
  await page.waitForTimeout(1800);

  await page.locator(`button:has-text("${CV_TITLE}")`).first().click();
  await page.waitForTimeout(300);
  await page.locator('button[type="submit"]').last().click();
  await page.waitForTimeout(1200);

  ok("the request asks for Arabic", sent[0]?.lang === "ar",
    `got ${JSON.stringify(sent[0]?.lang)} — the CV declared Arabic while the interface was English`);
  await ctx.close();
}

/* ── 4. the visit rule, in a real new tab ───────────────────────────────────────────── */

console.log("\n── a new tab is a new visit ──");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  /* The record is on disk; the tab-session marker is not. Exactly a browser reopened. */
  await ctx.addInitScript(seedScript(seed(), { markVisit: false }));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/interview`, { waitUntil: "load" });
  await page.waitForTimeout(1800);

  ok("the tab arrived with no session marker",
    (await page.evaluate(() => window.__markerOnArrival)) === null);
  ok("so the previous person's CV is not offered", !/Use a CV you already made here/.test(await text(page)),
    "on a shared laptop this would look like a feature");
  await ctx.close();
}

/* ── 5. /linkedin fills the profile and the target role ─────────────────────────────── */

console.log("\n── /linkedin ──");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(seedScript(seed()));
  const page = await ctx.newPage();
  const sent = await captureTools(page);
  await page.goto(`${BASE}/linkedin`, { waitUntil: "load" });
  await page.waitForTimeout(1800);

  ok("the offer appears here too", /Use a CV you already made here/.test(await text(page)));
  await page.locator(`button:has-text("${CV_TITLE}")`).first().click();
  await page.waitForTimeout(400);

  ok("the profile box is filled", (await page.locator("textarea").first().inputValue()).includes(MARKER));
  ok("and the target role came from the CV's target job",
    (await page.locator('input[type="text"], input:not([type])').first().inputValue()) === CV_TITLE);

  await page.locator('button[type="submit"]').last().click();
  await page.waitForTimeout(1200);
  ok("the request carried the CV", String(sent[0]?.inputA || "").includes(MARKER));
  await ctx.close();
}

/* ── 6. /optimize fills the resume and pre-selects the CV's language ────────────────── */

console.log("\n── /optimize ──");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(seedScript(seed({ language: "ar" })));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/optimize`, { waitUntil: "load" });
  await page.waitForTimeout(1800);

  ok("the offer appears above upload and paste", /Use a CV you already made here/.test(await text(page)));
  await page.locator(`button:has-text("${CV_TITLE}")`).first().click();
  await page.waitForTimeout(400);
  ok("the resume box is filled", (await page.locator("textarea").first().inputValue()).includes(MARKER));

  /* Step 2 already holds the advert, so Continue twice reaches the language step. */
  await page.locator('button:has-text("Continue")').first().click();
  await page.waitForTimeout(500);
  ok("the job advert reached step 2", (await page.locator("textarea").first().inputValue()) === JOB_AD);
  await page.locator('button:has-text("Continue")').first().click();
  await page.waitForTimeout(600);

  /*
   * The selected chip is the one with the filled accent background. Asserted on the STYLE rather
   * than on a class, because that is what the page actually sets.
   */
  const selected = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const hit = btns.find((b) => /^(English|العربية|Both)$/.test(b.textContent.trim())
      && /rgb\(139, 92, 246\)|var\(--accent\)/.test(b.style.background || ""));
    return hit ? hit.textContent.trim() : "";
  });
  ok("the language step pre-selects the CV's own language", selected === "العربية",
    `selected "${selected}" — the picked CV declared Arabic`);
  await ctx.close();
}

/* ── 7. /ar/optimize — the Arabic door, where the default runs the other way ────────── */

console.log("\n── /ar/optimize ──");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  /* An ENGLISH CV on the Arabic page, whose `outLang` starts at "ar". This is the direction the
     English page cannot test: here taking the language from the interface would be wrong. */
  await ctx.addInitScript(seedScript(seed({ language: "en" })));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/ar/optimize`, { waitUntil: "load" });
  await page.waitForTimeout(1800);

  ok("the Arabic page offers the CV too", /استخدم سيرة أنشأتها هنا/.test(await text(page)));
  await page.locator(`button:has-text("${CV_TITLE}")`).first().click();
  await page.waitForTimeout(400);
  ok("the resume box is filled", (await page.locator("textarea").first().inputValue()).includes(MARKER));
  ok("the confirmation is in Arabic", /تم التعبئة من/.test(await text(page)));

  await page.locator('button:has-text("متابعة")').first().click();
  await page.waitForTimeout(500);
  await page.locator('button:has-text("متابعة")').first().click();
  await page.waitForTimeout(600);
  const selected = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    /* This page labels the choice in Arabic — العربية / الإنجليزية / الاثنتان — not in the
       languages themselves the way the English page does. */
    const hit = btns.find((b) => /^(العربية|الإنجليزية|الاثنتان)$/.test(b.textContent.trim())
      && /rgb\(139, 92, 246\)|var\(--accent\)/.test(b.style.background || ""));
    return hit ? hit.textContent.trim() : "";
  });
  ok("an English CV picked on the Arabic page selects English", selected === "الإنجليزية",
    `selected "${selected}" — the page's own default was Arabic, and the document outranks it`);
  await ctx.close();
}

/* ── 8. /interview-live — the worst page to retype a CV on ──────────────────────────── */

console.log("\n── /interview-live ──");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(seedScript(seed()));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/interview-live`, { waitUntil: "load" });
  await page.waitForTimeout(1800);

  ok("the offer appears on the setup screen", /Use a CV you already made here/.test(await text(page)));
  await page.locator(`button:has-text("${CV_TITLE}")`).first().click();
  await page.waitForTimeout(400);

  ok("the experience box is filled", (await page.locator("textarea").first().inputValue()).includes(MARKER),
    "this page refused to start until it held a real career, and typing one out in front of a camera was the only way");
  ok("and the target role came across",
    (await page.locator("input:not([type=file])").first().inputValue()) === CV_TITLE);
  await ctx.close();
}

await browser.close();
console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
