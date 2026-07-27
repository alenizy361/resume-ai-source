/**
 * Does the fix a launch-readiness audit asked for actually work, in the real bundled app?
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHY A UNIT SUITE WAS NOT ENOUGH
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * `ops/translate.test.mjs` proves `buildTranslationSource` detects the CV's real script instead of
 * trusting `target.language`. That is necessary and not sufficient, because two more things had to be
 * true for a user to ever see the fix, and neither is checkable from `app/lib/`:
 *
 *   - `EnglishVersion.tsx`'s "Create English version" button has to actually RENDER when
 *     `target.language` is "en" but the confirmed content is still Arabic — the exact scenario the
 *     audit reproduced live. A unit test of `buildTranslationSource` alone cannot see a component.
 *   - The reducer in `app/components/build/builderState.ts` had NO case for the `"version"` or
 *     `"viewVersion"` actions before this fix — dispatching them silently fell through to
 *     `default: return s`. That file imports its siblings via the `@/app/lib/*` alias, which only
 *     Next.js's bundler resolves, so it cannot be unit-tested with a plain `node` run at all. The only
 *     way to prove a dispatched translation is actually STORED, actually SURVIVES the `cv === "en"`
 *     key collision (`docLang` vs `cv`), and actually reaches the version switcher is to drive the
 *     real reducer inside a real browser.
 *
 * `/api/translate` is intercepted with a canned, faithful translation (the same fixture
 * `ops/translate.test.mjs` uses), so nothing is spent and no Anthropic key is needed — this is a test
 * of the CLIENT-SIDE wiring, not of translation quality.
 *
 *   BASE=http://localhost:3000 node ops/translate.browser.mjs
 */

import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:3000";
let pass = 0, fail = 0;
const ok = (n, c, d = "") => {
  if (c) { pass++; console.log(`✅ ${n}`); }
  else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); }
};

const RESUME_ID = "probe_tr1";

/*
 * The scenario the audit reproduced: `target.language` is "en" (the user switched it, expecting the
 * document to follow) while every confirmed field is still Arabic-script, exactly as they typed it.
 */
function seedScript() {
  const state = {
    schemaVersion: 5,
    target: {
      title: "أخصائي أشعة", level: "", language: "en", industry: "",
      country: "SA", city: "", employer: "", jobAdUrl: "", jobAdText: "",
    },
    profile: {
      role: "أخصائي أشعة", name: "عبدالعزيز العنزي", contact: "الرياض · a@b.co",
      summary: "أخصائي أشعة تشخيصية بخبرة في التصوير المقطعي والعام.",
      education: "بكالوريوس علوم الأشعة — جامعة الملك سعود، 2018",
      skills: "الأشعة السينية, الأشعة المقطعية, وضعية المريض",
      extras: [], wovenLines: [], jobAd: "",
      certifications: "", languages: "العربية, الإنجليزية",
      roles: [{
        id: "r1", title: "أخصائي أشعة", company: "مستشفى الملك فهد", location: "الرياض",
        start: "2019", end: "",
        bullets: [
          "نفّذت فحوصات الأشعة المقطعية والعامة وفق البروتوكولات المعتمدة في مستشفى الملك فهد.",
          "راجعت جودة الصور قبل إرسالها إلى نظام أرشفة الصور والاتصالات.",
        ],
      }],
      yearsOfExperience: null, industry: "", graduationYear: "", draftedFor: "",
    },
    suggestions: [],
    entry: "form",
    personal: {
      fullName: "عبدالعزيز العنزي", professionalTitle: "أخصائي أشعة", city: "الرياض", country: "SA",
      phone: "", email: "a@b.co", linkedin: "", portfolio: "",
    },
    credentials: [{
      id: "c1", kind: "registration", title: "التسجيل المهني لدى الهيئة السعودية للتخصصات الصحية",
      issuer: "الهيئة السعودية للتخصصات الصحية", issueDate: "2019", expiryDate: "2026",
      status: "confirmed", source: "user",
    }],
    languages: [], template: "ats-pro", sectionsDone: [], updatedAt: Date.now(),
  };
  return `(() => {
    const now = Date.now();
    localStorage.setItem(${JSON.stringify(`ra_cv:anon:${RESUME_ID}`)}, JSON.stringify({
      owner: "anon", resumeId: ${JSON.stringify(RESUME_ID)}, recordVersion: 1, revision: 1,
      lang: "en", updatedAt: now, dirty: false, state: ${JSON.stringify(state)},
    }));
    localStorage.setItem("ra_cv_index:anon", JSON.stringify([
      { resumeId: ${JSON.stringify(RESUME_ID)}, title: "أخصائي أشعة", lang: "en", updatedAt: now, revision: 1 },
    ]));
    /* mayRestore("anon") requires this session flag, or the provider treats the visit as lapsed,
       discards the seeded draft, and mints an unrelated fresh id — see resumeStore.ts's own doc
       comment on SESSION_VISIT. */
    localStorage.setItem("ra_visit:anon", String(now));
    sessionStorage.setItem("ra_visit_session", String(now));
  })()`;
}

/* A faithful translation of the seeded Arabic — same shape `ops/translate.test.mjs`'s own fixture
   validates, so a real successful `/api/translate` response looks exactly like this. */
const GOOD_TRANSLATION = {
  ok: true,
  problems: [],
  needsConfirmation: [],
  warnings: [],
  items: {
    "target.title": "Radiology Technologist",
    "r1.title": "Radiology Technologist",
    "profile.summary": "Diagnostic radiographer experienced in general and CT imaging.",
    "r1.b0": "Performed general X-ray and CT examinations to approved protocols at مستشفى الملك فهد",
    "r1.b1": "Reviewed image quality before submission to PACS",
    "profile.education": "BSc Radiologic Sciences — King Saud University, 2018",
    "profile.skills": "General X-ray, Computed Tomography (CT), Patient Positioning",
    "profile.languages": "Arabic, English",
    "cred.c1": "SCFHS Professional Registration",
  },
  _meta: { model: "test", attempts: 1, escalated: false, reason: null },
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });

console.log("\n── Arabic content, target.language already \"en\" ──");
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await ctx.addInitScript(seedScript());
  const page = await ctx.newPage();

  let translateCalled = false;
  await page.route("**/api/translate", async (route) => {
    translateCalled = true;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(GOOD_TRANSLATION) });
  });

  await page.goto(`${BASE}/builder/${RESUME_ID}/review`, { waitUntil: "load" });
  await page.waitForTimeout(1200);

  ok("the reducer hydrated the seeded Arabic content",
    (await page.locator("text=أخصائي أشعة").count()) > 0);

  const makeBtn = page.locator('button:has-text("Create English version")');
  ok("\"Create English version\" is offered even though target.language is already \"en\" — the exact " +
    "scenario the audit found broken (the button used to be gated on target.language === \"ar\")",
    (await makeBtn.count()) === 1);

  ok("the version switcher is NOT shown yet — no version exists to switch to",
    (await page.locator('[aria-label="CV version"]').count()) === 0);

  await makeBtn.click();
  await page.waitForTimeout(1500);

  ok("the translate request actually fired", translateCalled);

  const body = await page.evaluate(() => document.body.innerText);
  ok("the stored translation renders in the review widget — proves the reducer's \"version\" case " +
    "actually wrote it to state (it used to be a silent no-op)",
    body.includes("Diagnostic radiographer experienced in general and CT imaging."));

  const switcher = page.locator('[aria-label="CV version"]');
  ok("the version switcher now appears with two distinct options — proves the \"en\"/\"en\" key " +
    "collision between the declared target.language and the stored translation was resolved",
    (await switcher.count()) === 1 && (await switcher.locator("button").count()) === 2);

  ok("the ORIGINAL is labelled with the dot marker, keyed by the CONTENT's real script (Arabic), " +
    "not by target.language",
    (await switcher.locator("button", { hasText: "العربية" }).locator("span").count()) >= 1);

  /*
   * A CLIENT-SIDE transition (opening the step sheet and clicking its own link to Design), not
   * `page.goto()`. `BuilderProvider` is mounted by the layout and survives a soft navigation by
   * design (see its own file header) — a hard reload would also re-run this context's
   * `addInitScript`, which reseeds the ORIGINAL untranslated record over whatever the app had just
   * autosaved, and would be testing the seed script, not the app.
   */
  await page.locator('button:has-text("All steps")').first().click();
  await page.locator('a[href*="/design"]').first().click();
  await page.waitForURL(/\/design(\?|$)/);
  await page.waitForTimeout(1200);
  const designBody = await page.evaluate(() => document.body.innerText);
  ok("the Design step's preview already shows the English translation BY DEFAULT — target.language " +
    "said \"en\" from the start, so once a translation exists there is no reason to make the user " +
    "flip a switch to see the document in the language they asked for",
    designBody.includes("Diagnostic radiographer experienced in general and CT imaging."));
  ok("and the employer name survived untouched, in Arabic, exactly as `applyVersionToProfile` guarantees",
    designBody.includes("مستشفى الملك فهد"));

  await ctx.close();
}

await browser.close();
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
