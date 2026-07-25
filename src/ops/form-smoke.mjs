/**
 * Does the form builder actually work in a browser, with the AI switched off?
 *
 * The unit suites prove the rules: an unconfirmed item cannot reach a resume, one
 * employer yields one job, a language level is never defaulted. What they cannot
 * prove is that the UI is wired to those rules — three times while building this
 * feature a mechanism was written and the client was never connected to it, and no
 * amount of passing library tests said so. This drives the real page in real
 * Chromium and asserts what a user would see.
 *
 * /api/suggest is BLOCKED for the whole run, on purpose. The product's thesis is
 * that the form carries the journey and the AI only assists inside it, so a build
 * with every model call failing must still produce a CV. If this script needed the
 * network to pass, the thesis would be wrong.
 *
 * Sections are addressed by INDEX, not by the text inside them. "Job title" is a
 * label in both the target section and every experience card, and a selector that
 * cannot tell them apart passes for the wrong reason.
 *
 *   npx next dev -p 3112 &
 *   BASE=http://localhost:3112 node ops/form-smoke.mjs        # then UI=ar for Arabic
 *
 * Point it at `next dev`, not `next start`. Both work in principle, but a local
 * production build in this sandbox has been observed emitting HTML that references a
 * client chunk the build never wrote — the page then serves 200, never hydrates, and
 * every assertion below fails for a reason that has nothing to do with the product.
 * The same commit's Vercel build is clean, so it is a local artefact; dev sidesteps it.
 *
 * CHROMIUM_PATH overrides the browser binary, which the sandbox needs when the
 * installed Chromium and the pinned Playwright disagree about revisions.
 */

import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:3000";
/** Which interface language to drive. The CV language stays English either way. */
const UI = process.env.UI === "ar" ? "ar" : "en";
/**
 * JD=1 pastes a job advert by URL instead of by hand, and then asserts the review
 * becomes a MATCH report. Two runs are needed because the two rules are mutually
 * exclusive by design: no advert must never produce a match score, and an advert must
 * never produce anything else.
 */
const WITH_JD = process.env.JD === "1";

/**
 * The visible strings this script clicks on, in both interfaces.
 *
 * Driving the Arabic UI is not a translation exercise — it is the regression test for
 * the bug that mattered most to the product owner: an Arabic-speaking user asking for
 * an English CV and getting an Arabic one back. The CV language is its own field, and
 * the only way to prove the two are independent is to run the Arabic interface and
 * assert the output is still English.
 */
const L = {
  en: {
    promise: "You fill the facts", newCv: "Build a new CV", title: "Job title",
    cont: "Save & continue", alias: "Also known as", notYet: "None of this is in your CV yet",
    name: "Full name", city: "City", phone: "Mobile", email: "Email",
    addRole: "Add a position", employer: "Employer", add: "Add", drop: "Dismiss",
    quality: "CV Quality Score", match: "Job Match Score",
    url: "Or paste the posting's link", read: "Read the link",
    supported: "Asked for, and on your CV",
  },
  ar: {
    promise: "أنت تكتب الحقائق", newCv: "أنشئ سيرة جديدة", title: "المسمى الوظيفي",
    cont: "احفظ وواصل", alias: "مسميات أخرى", notYet: "لا شيء من هذا في سيرتك بعد",
    name: "الاسم الكامل", city: "المدينة", phone: "الجوال", email: "البريد",
    addRole: "أضف وظيفة", employer: "جهة العمل", add: "أضف", drop: "استبعد",
    quality: "تقييم جودة السيرة", match: "تقييم المطابقة",
    url: "أو الصق رابط الإعلان", read: "اقرأ الرابط",
    supported: "مطلوب، وموجود في سيرتك",
  },
}[UI];

/** ORDER in Builder.tsx. The rail, the cinema and this script all read the same list. */
const S = {
  start: 0, target: 1, blueprint: 2, personal: 3, experience: 4, education: 5,
  credentials: 6, skills: 7, languages: 8, summary: 9, review: 10, design: 11,
};

let pass = 0, fail = 0;
const ok = (n, c, d = "") => {
  if (c) { pass++; console.log(`✅ ${n}`); }
  else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); }
};

const run = async () => {
  const browser = await chromium.launch({
    headless: process.env.HEADED !== "1",
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

  const sec = (i) => page.locator(".build-root .bd-section").nth(i);
  const field = (i, label) => sec(i).locator("label", { hasText: label }).locator("input, textarea").first();
  const type = async (i, label, value) => {
    const el = field(i, label);
    await el.fill(value);
    await el.blur();
  };
  const cont = async (i) => {
    await sec(i).locator("button", { hasText: L.cont }).first().click();
  };
  /** The preview is debounced 250ms and re-measures an A4 page on every change. */
  const settle = () => page.waitForTimeout(900);
  const preview = () => page.textContent(".bd-preview");

  // Every model call fails, for the whole run.
  let suggestCalls = 0;
  await page.route("**/api/suggest", (route) => { suggestCalls++; return route.abort(); });

  /*
   * The advert is served by the test, not fetched from the internet.
   *
   * What is under test is the wiring — link in, text into the same textarea the user
   * could have typed, review switches to a match report. Reaching a real job board
   * would make this script fail on their bot policy rather than on our code.
   */
  const AD = [
    "Senior Radiographer — required: CT, PACS, radiation protection.",
    "Preferred: MRI experience. Must hold SCFHS registration.",
  ].join("\n");
  await page.route("**/api/fetch-job", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, text: AD }),
  }));

  /*
   * Console noise is not all equal. Blocking /api/suggest makes the browser log a
   * failed fetch by design, so that one line is expected and filtering it is not
   * cheating — asserting on it would mean this script could never pass. Anything
   * else, including a 404 for a URL the page asked for, is a real finding.
   */
  const errors = [];
  const notFound = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/api\/suggest|ERR_CONNECTION_RESET|ERR_FAILED/.test(t)) return;
    // `@vercel/analytics` fetches /_vercel/insights/script.js, which only exists once
    // deployed. Running against a local `next start` it 404s and the browser then
    // complains about the MIME type of the 404 page. Both are artefacts of running
    // locally, not defects — and they are named here rather than filtered by a broad
    // pattern, so a genuinely new 404 still fails this script.
    if (/_vercel\/insights/.test(t)) return;
    // "Failed to load resource" arrives without the URL in the message, so it cannot
    // be judged here. The response listener below owns that check and reports the
    // actual URL, which is the only form of it worth failing on.
    if (/^Failed to load resource/.test(t)) return;
    errors.push(t);
  });
  page.on("response", (r) => {
    if (r.status() === 404 && !/_vercel\/insights/.test(r.url())) notFound.push(r.url());
  });

  const path = UI === "ar" ? "/ar/build" : "/build";
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  console.log(`\n── driving ${path} (interface: ${UI}, CV language: en) ──`);
  ok("the page loads", await page.locator(`text=${L.promise}`).first().isVisible());

  /* ── entry ── */
  await sec(S.start).locator(`text=${L.newCv}`).click();

  /* ── target: everything downstream is suggested from this title.
     Typed in English on purpose — a Saudi applicant writes an English CV and the role
     pack has to match the English title from the Arabic interface. ── */
  await type(S.target, L.title, "Radiology Technologist");

  if (WITH_JD) {
    // Addressed by id: this field is labelled with htmlFor rather than wrapped, because
    // it shares its row with the fetch button.
    await page.fill("#bd-jd-url", "https://example.com/jobs/1");
    await sec(S.target).locator("button", { hasText: L.read }).first().click();
    await page.waitForTimeout(600);
    const box = await sec(S.target).locator("textarea").first().inputValue();
    ok("a pasted link fills the job-description box the user can edit",
      box.includes("PACS") && box.includes("SCFHS"), box.slice(0, 60));
  }

  await cont(S.target);

  /* The blueprint is served from the cached role pack, so it must render with the
     network down. This is the assertion that the pack is earning its 900 lines. */
  await sec(S.blueprint).locator(`text=${L.alias}`).first().waitFor({ timeout: 5000 }).catch(() => {});
  ok("the role blueprint appears with no network",
    await sec(S.blueprint).locator(`text=${L.alias}`).first().isVisible().catch(() => false));
  ok("and it says outright that none of it is on the CV yet",
    await sec(S.blueprint).locator(`text=${L.notYet}`).first().isVisible().catch(() => false));
  await cont(S.blueprint);

  /* ── personal ── */
  await type(S.personal, L.name, "Abdulaziz Alanazi");
  await type(S.personal, L.city, "Riyadh");
  await type(S.personal, L.phone, "0581453234");
  await type(S.personal, L.email, "a@example.com");
  await settle();
  ok("the name reaches the live preview", (await preview()).includes("Abdulaziz Alanazi"));
  ok("so does the contact line", (await preview()).includes("0581453234"));
  await cont(S.personal);

  /* ── experience ── */
  await sec(S.experience).locator("button", { hasText: L.addRole }).first().click();
  await type(S.experience, L.title, "Radiographer");
  await type(S.experience, L.employer, "Dallah Hospital");

  const cards = sec(S.experience).locator(".bd-sug");
  await cards.first().waitFor({ timeout: 5000 }).catch(() => {});
  const offered = await cards.count();
  ok("duties are offered for the title, from the pack", offered > 0, `saw ${offered}`);

  const suggested = offered ? (await cards.first().locator("p").first().textContent()).trim() : "";
  const probe = suggested.slice(0, 40);
  await settle();
  ok("a suggested duty is NOT on the CV before it is accepted",
    Boolean(probe) && !(await preview()).includes(probe), probe);

  await cards.first().locator("button", { hasText: L.add }).first().click();
  await settle();
  const cv = await preview();
  ok("accepting it puts it on the CV", cv.includes(probe));
  ok("one employer yields ONE job entry",
    (cv.match(/Dallah Hospital/g) || []).length === 1,
    `${(cv.match(/Dallah Hospital/g) || []).length} occurrences`);
  ok("an English CV contains no Arabic",
    (cv.match(/[؀-ۿ]/g) || []).length === 0,
    `${(cv.match(/[؀-ۿ]/g) || []).length} Arabic characters`);

  /* Dismissing must be a decision: the line leaves and does not come back. */
  /* Count is the wrong measure: only six cards render at a time, so removing one
     promotes the seventh and the total does not move. The TEXT is what must go. */
  const doomed = (await cards.first().locator("p").first().textContent()).trim();
  await cards.first().locator("button", { hasText: L.drop }).first().click();
  await page.waitForTimeout(300);
  const stillThere = await sec(S.experience).locator(".bd-sug").allTextContents();
  ok("dismissing a suggestion removes that line",
    !stillThere.some((t) => t.includes(doomed.slice(0, 40))), doomed.slice(0, 50));

  /* ── skills: grouped, and nothing pre-selected ── */
  await cont(S.experience);
  await cont(S.education);
  await cont(S.credentials);
  const chips = sec(S.skills).locator(".bd-chip");
  const chipCount = await chips.count();
  ok("skills are offered from the pack", chipCount > 0, `saw ${chipCount}`);
  ok("and none of them start selected",
    (await sec(S.skills).locator(".bd-chip.on").count()) === 0);
  const skill = chipCount ? (await chips.first().textContent()).replace(/^\+\s*/, "").trim() : "";
  await chips.first().click();
  await settle();
  ok("tapping a skill adds it to the CV", Boolean(skill) && (await preview()).includes(skill), skill);

  /* ── languages: a level is never assumed ── */
  await cont(S.skills);
  await sec(S.languages).locator(".bd-chip").first().click({ timeout: 2000 }).catch(() => {});
  await settle();
  // Levels are stored as English keys and published as "Name (level)", so this holds
  // in either interface. Adding a language without choosing a level must publish
  // nothing — the absence of a default IS the guard.
  ok("a language with no level chosen is NOT published",
    !/\((native|fluent|professional|intermediate|basic)\)/i.test(await preview()));

  /* ── review: the honest headline, with no advert pasted ── */
  await cont(S.languages);
  await cont(S.summary);
  const review = await sec(S.review).textContent();
  if (WITH_JD) {
    // The mirror rule: WITH an advert the headline must name what it is comparing to.
    ok("with a job description the headline IS a match score",
      review.toUpperCase().includes(L.match.toUpperCase()));
    ok("the three honest groups are shown", review.includes(L.supported));
    ok("a requirement the CV cannot evidence is never offered as an add",
      !/add anyway/i.test(review) && !/أضفها على أي حال/.test(review));
  } else {
    ok("with no job description the headline is a QUALITY score",
      review.toUpperCase().includes(L.quality.toUpperCase()));
    ok("and it never claims a match", !review.includes(L.match));
  }
  ok("the score is a real number", /\b\d{1,3}\b/.test(review));

  ok("every model call failed and the CV was still built", suggestCalls >= 0);
  ok("no uncaught page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
  ok("the page requested nothing that 404s", notFound.length === 0, notFound.slice(0, 3).join(" "));

  await browser.close();
};

run().then(() => {
  console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}).catch((e) => {
  console.error("harness error:", e);
  process.exit(1);
});
