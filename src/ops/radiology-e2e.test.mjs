/**
 * One person, eleven steps, both languages: the acceptance test.
 *
 * A Radiology Technologist in Riyadh builds a CV from nothing and downloads it. Every other
 * suite checks a mechanism; this one checks that the mechanisms add up to a product. It is
 * the run that would have caught, in order, every structural failure this rebuild has fixed:
 * a section that loses its input on Continue, a suggestion that reaches the document
 * unapproved, one employer printed as three jobs, an Arabic duty on an English CV, a skills
 * step that is empty because the seeding lived in a view.
 *
 * That last one it DID catch, before this file existed — the probe written to find its
 * selectors walked straight from the target job to skills and found nothing there.
 *
 * The model is stubbed with realistic answers rather than called. Two reasons, and the
 * second is the important one: no provider key exists in the sandbox, and a test whose
 * assertions depend on what a model happens to say cannot assert anything precisely. What is
 * under test is the FLOW — that what the user approves is what gets printed.
 *
 *   node ops/radiology-e2e.test.mjs [baseUrl]
 */

import { chromium } from "playwright";

const BASE = process.argv[2] || "http://localhost:3141";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };

/* ─────────────────── the stubbed assistant ─────────────────── */

/**
 * Answers shaped exactly like the real route's, and deliberately CONTAINING A MARKER.
 *
 * `UNAPPROVED` appears in every suggestion the test never taps. If it shows up in the
 * rendered CV, something offered content straight into the document — the one failure this
 * product cannot have. Asserting on a marker beats asserting on absence of real text,
 * because real text can coincide with something the user typed.
 */
const UNAPPROVED = "ZZUNAPPROVEDZZ";

async function stubAi(page, lang = "en") {
  await page.route("**/api/suggest", async (route) => {
    const b = route.request().postDataJSON() ?? {};
    let out;
    if (b.mode === "items" && b.kind === "duties") {
      out = { items: [
        lang === "ar" ? "تشغيل أجهزة التصوير المقطعي وفق البروتوكولات المعتمدة" : "Operated CT scanners according to approved clinical protocols",
        lang === "ar" ? "التحقق من هوية المريض قبل كل إجراء" : "Verified patient identity before every procedure",
        `${UNAPPROVED} duty nobody tapped`,
      ] };
    } else if (b.mode === "items") {
      out = { items: [`${UNAPPROVED} extra nobody tapped`] };
    } else if (b.mode === "groups") {
      out = { groups: [{ label: "Modalities", items: [`${UNAPPROVED} group item`] }] };
    } else if (b.mode === "variants") {
      out = { variants: [
        { label: "concise", text: lang === "ar"
          ? "أخصائي أشعة بخبرة في التصوير المقطعي والرنين المغناطيسي في مستشفى تعليمي."
          : "Radiology Technologist experienced in CT and MRI at a teaching hospital." },
        { label: "professional", text: `${UNAPPROVED} variant not chosen` },
      ] };
    } else if (b.kind === "bullet_metric") {
      out = { question: "How many examinations per shift?", rewritten: "Performed __ examinations per shift" };
    } else {
      out = { text: "Keep the licence number off the CV unless the advert asks for it." };
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(out) });
  });
  // The review step scores the whole CV. Stubbed so the step renders without a model.
  await page.route("**/api/optimize", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      matchScore: 71, missingKeywords: ["PACS"], presentKeywords: ["CT", "MRI"],
      improvements: [], skillsGap: [], watermark: true,
    }) });
  });
}

/* ─────────────────── helpers ─────────────────── */

const cont = (p) => p.locator(".bd-step-foot button.btn-accent").click();

/** Type into the nth `.bd-input` of the form column, which is how every step is laid out. */
const fillNth = (p, n, v) => p.fill(`.bd-form input.bd-input >> nth=${n}`, v);

/**
 * Does the rendered CV contain this?
 *
 * Case-insensitive, because the templates upper-case some lines — a certification renders as
 * "SCFHS PROFESSIONAL REGISTRATION". The first run of this file reported that as a product
 * failure: the state was right, the preview was right, and the assertion was comparing case
 * against a stylesheet. Arabic passed the same check, which is what gave it away — Arabic has
 * no case.
 */
const has = (haystack, needle) => haystack.toLowerCase().includes(needle.toLowerCase());

async function journey(browser, lang) {
  const ar = lang === "ar";
  const pre = ar ? "/ar" : "";
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 140)));
  await stubAi(page, lang);

  const L = ar
    ? { title: "أخصائي أشعة", name: "عائشة العتيبي", city: "الرياض", country: "السعودية",
        role: "أخصائي أشعة", company: "مدينة الملك فهد الطبية",
        edu: "بكالوريوس علوم الأشعة — جامعة الملك سعود، ٢٠٢٠",
        cont: "احفظ وواصل", hold: "أحمل هذه الشهادة فعلاً", use: "استخدم هذه",
        write: "اكتب ثلاث نسخ", scfhs: "التسجيل المهني", langChip: "+ English" }
    : { title: "Radiology Technologist", name: "Aisha Al-Otaibi", city: "Riyadh", country: "Saudi Arabia",
        role: "Radiology Technologist", company: "King Fahad Medical City",
        edu: "BSc Radiological Sciences — King Saud University, 2020",
        cont: "Save & continue", hold: "I hold this credential", use: "Use this one",
        write: "Write three versions", scfhs: "SCFHS Professional Registration", langChip: "+ English" };

  /* ── 1. target ── */
  await page.goto(`${BASE}${pre}/builder`, { waitUntil: "networkidle" });
  const link = page.locator(`a[href^="${pre}/builder/r"][href$="/target"]`).first();
  await link.waitFor({ timeout: 25_000 });
  await link.click();
  await page.waitForURL(/\/target$/);
  await page.waitForSelector(".bd-form input.bd-input");
  const id = new URL(page.url()).pathname.split("/").filter(Boolean).at(-2);

  await fillNth(page, 0, L.title);
  // The CV's language, chosen explicitly — this is the field that used to be conflated with
  // the interface and put Arabic duties on English resumes.
  await page.selectOption(".bd-form select.bd-input >> nth=1", ar ? "ar" : "en");
  await cont(page);

  /* ── 2. blueprint: does it know the profession? ── */
  await page.waitForURL(/\/blueprint$/);
  const bp = await page.locator(".bd-body").innerText();
  ok(`${lang}: the blueprint recognises the profession`, bp.includes(L.title), bp.slice(0, 90));
  ok(`${lang}: and states that none of it is on the CV yet`,
    ar ? bp.includes("لا شيء من هذا في سيرتك بعد") : bp.includes("None of this is in your CV yet"));
  await cont(page);

  /* ── 3. personal ── */
  await page.waitForURL(/\/personal$/);
  await fillNth(page, 0, L.name);
  await fillNth(page, 2, L.city);
  await fillNth(page, 3, L.country);
  await fillNth(page, 4, "0500000000");
  await fillNth(page, 5, "aisha@example.com");
  await cont(page);

  /* ── 4. experience: one employer, one job ── */
  await page.waitForURL(/\/experience$/);
  await page.locator(".bd-form button", { hasText: ar ? "أضف وظيفة" : "Add a position" }).first().click();
  await page.waitForTimeout(400);
  await fillNth(page, 0, L.role);
  await fillNth(page, 1, L.company);
  /*
   * Blur, deliberately.
   *
   * The pack duties are offered on the title and employer fields losing focus, not on every
   * keystroke — which is right (nobody wants six suggestions while typing "Rad") and easy to
   * miss from a test, because `fill` sets the value without ever leaving the field. The first
   * run of this file found zero suggestions for exactly that reason.
   */
  await page.locator(".bd-form input.bd-input >> nth=1").blur();
  await page.waitForTimeout(1000);

  const offered = page.locator(".bd-form .bd-sug");
  ok(`${lang}: duties are offered once the job has a title and an employer`,
    await offered.count() > 0, `${await offered.count()}`);

  /*
   * Approve exactly two, and leave the marked one alone. Everything after this depends on
   * that asymmetry: two lines must reach the CV and one must not.
   */
  const addLabel = ar ? "أضف" : "Add";
  /*
   * Record the exact text of each line as it is approved.
   *
   * The first version asserted against duty text typed into this file, which passed in English
   * by coincidence — it happened to match the cached pack — and failed in Arabic, where the
   * pack words the same duty differently. A test that hardcodes what the product should say is
   * testing the test. What matters is narrower and stronger: the lines the user tapped, and
   * only those, end up on the CV.
   */
  const approved = [];
  for (let i = 0; i < 2; i++) {
    const card = page.locator(".bd-form .bd-sug").first();
    approved.push((await card.innerText()).split("\n").map((x) => x.trim())
      .find((x) => x.length > 25) ?? "");
    await card.locator("button", { hasText: addLabel }).first().click();
    await page.waitForTimeout(350);
  }
  await cont(page);

  /* ── 5. education ── */
  await page.waitForURL(/\/education$/);
  await page.fill(".bd-form textarea", L.edu);
  await cont(page);

  /* ── 6. credentials: suggested is not held ── */
  await page.waitForURL(/\/credentials$/);
  await page.locator(".bd-form .bd-chip", { hasText: L.scfhs }).first().click();
  await page.waitForTimeout(500);
  let preview = await page.locator(".bd-preview").innerText();
  ok(`${lang}: adding a credential does not put it on the CV until it is confirmed`,
    !has(preview, L.scfhs), preview.slice(0, 100));
  await page.locator(`.bd-form input[type="checkbox"]`).first().check();
  await page.waitForTimeout(700);
  preview = await page.locator(".bd-preview").innerText();
  ok(`${lang}: ticking "I hold this" publishes it`, has(preview, L.scfhs), preview.slice(-160));
  await cont(page);

  /* ── 7. skills: seeded from the pack, nothing preselected ── */
  await page.waitForURL(/\/skills$/);
  await page.waitForTimeout(600);
  const chips = page.locator(".bd-form .bd-chip:not(.on)");
  ok(`${lang}: the skills step is populated without having to visit the blueprint`,
    await chips.count() > 5, `${await chips.count()} chips`);
  const firstSkill = (await chips.first().innerText()).replace(/^\+\s*/, "").trim();
  await chips.first().click();
  await page.waitForTimeout(600);
  ok(`${lang}: a tapped skill reaches the CV`,
    has(await page.locator(".bd-preview").innerText(), firstSkill), firstSkill);
  await cont(page);

  /* ── 8. languages: a level is required ── */
  await page.waitForURL(/\/languages$/);
  await page.locator(".bd-form .bd-chip", { hasText: "English" }).first().click();
  await page.waitForTimeout(600);
  ok(`${lang}: a language with no level is NOT published`,
    !(await page.locator(".bd-preview").innerText()).includes("English"),
    (await page.locator(".bd-preview").innerText()).slice(0, 100));
  await page.selectOption(".bd-form select.bd-input >> nth=0", "fluent");
  await page.waitForTimeout(700);
  const withLevel = await page.locator(".bd-preview").innerText();
  ok(`${lang}: choosing the level publishes it, worded in the CV's language`,
    withLevel.includes(ar ? "طليق" : "Fluent"), withLevel.slice(0, 160));
  await cont(page);

  /* ── 9. summary ── */
  await page.waitForURL(/\/summary$/);
  await page.waitForTimeout(500);
  await page.locator(".bd-form button", { hasText: L.write }).first().click();
  await page.waitForTimeout(1200);
  await page.locator(".bd-form button", { hasText: L.use }).first().click();
  await page.waitForTimeout(800);
  ok(`${lang}: the chosen summary is on the CV`,
    (await page.locator(".bd-preview").innerText()).includes(ar ? "أخصائي أشعة بخبرة" : "experienced in CT and MRI"));
  await cont(page);

  /* ── 10. review ── */
  await page.waitForURL(/\/review$/);
  await page.waitForTimeout(700);
  const review = await page.locator(".bd-body").innerText();
  ok(`${lang}: the review reports something concrete`, review.length > 80, review.slice(0, 80));
  await cont(page);

  /* ── 11. design & download ── */
  await page.waitForURL(/\/design$/);
  await page.waitForTimeout(800);
  const design = await page.locator(".bd-body").innerText();
  ok(`${lang}: the download step offers PDF and Word`,
    design.includes("PDF") && /Word|docx/i.test(design));
  ok(`${lang}: and a template choice`, await page.locator(".bd-form .bd-chip").count() >= 3);

  /* ─────────── the invariants, on the finished document ─────────── */

  const cv = await page.locator(".bd-preview").innerText();

  ok(`${lang}: NOTHING unapproved reached the CV`, !cv.includes(UNAPPROVED),
    cv.split("\n").find((l) => l.includes(UNAPPROVED)) ?? "");
  ok(`${lang}: the person's name is on it`, has(cv, L.name));
  ok(`${lang}: their employer is on it`, has(cv, L.company));

  /*
   * One employer, one job entry. The chat used to print a single hospital three times, once
   * per role held there, and it is the failure a reader notices first.
   */
  const employerMentions = cv.toLowerCase().split(L.company.toLowerCase()).length - 1;
  ok(`${lang}: one employer yields ONE job entry`, employerMentions === 1, `${employerMentions} mentions`);

  const missing = approved.filter((line) => line && !has(cv, line));
  ok(`${lang}: every duty the user approved — and no other — is on the CV`,
    approved.length === 2 && missing.length === 0,
    missing[0] ?? `captured ${approved.length}`);

  if (!ar) {
    /*
     * The most damaging bug this product had: an Arabic-interface user building an English CV
     * and getting Arabic content on it. The interface here IS English, so this run cannot
     * catch it — the Arabic run below is the one that matters. Asserted in both anyway,
     * because a regression could come from either direction.
     */
    ok("en: an English CV contains no Arabic", !/[؀-ۿ]/.test(cv),
      (cv.match(/[؀-ۿ][^\n]*/) ?? [""])[0]);
  } else {
    ok("ar: an Arabic CV is written in Arabic", /[؀-ۿ]/.test(cv));
    ok("ar: and its language level is an Arabic word, not an English key",
      cv.includes("طليق") && !/fluent/i.test(cv), (cv.match(/[Ff]luent/) ?? [""])[0]);
  }

  /* ── a cold load of the finished CV keeps all of it ── */
  await page.goto(`${BASE}${pre}/builder/${id}/design`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const afterReload = await page.locator(".bd-preview").innerText();
  ok(`${lang}: a cold reload of the last step restores the whole CV`,
    has(afterReload, L.name) && has(afterReload, L.company) && has(afterReload, L.scfhs),
    afterReload.slice(0, 120));
  ok(`${lang}: and still nothing unapproved`, !afterReload.includes(UNAPPROVED));

  ok(`${lang}: no page errors in the whole journey`, errors.length === 0, errors[0] ?? "");

  await ctx.close();
}

const run = async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });
  for (const lang of ["en", "ar"]) {
    console.log(`\n── the ${lang === "ar" ? "Arabic" : "English"} journey ──`);
    await journey(browser, lang);
  }
  await browser.close();
  console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
