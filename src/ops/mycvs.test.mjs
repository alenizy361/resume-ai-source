/**
 * The five pages that asked you to paste a CV this product already had.
 *
 * ── what these assertions are actually protecting ──
 *
 * `listMyCvs` sits between two stores that predate it and one privacy rule that governs both. Three
 * things about it can silently regress, and each one is a bug a screenshot cannot show you:
 *
 *   1. THE LANGUAGE. `ResumeRecord.lang` is the language the BUILDER WAS READ IN; the CV's own
 *      language is `cvLang(state.target)`. Reading the wrong one puts English questions in front of
 *      an Arabic interview — the single most damaging class of bug this product has had, and it is
 *      invisible until an Arabic user complains.
 *
 *   2. THE VISIT RULE. An anonymous CV may be offered back inside the tab session and not after it.
 *      A picker that ignored `mayRestore` would put the last person's career on a shared laptop's
 *      screen, and it would look like a feature.
 *
 *   3. THE DE-DUPLICATION ORDER. Building a CV and saving it puts the same text in both stores. The
 *      builder's copy has to win, because it is the only one that also knows the target job — so the
 *      order of the two loops is load-bearing, which is exactly the kind of thing a later tidy-up
 *      reverses.
 *
 * Run in plain Node against fake storage, so a failure names the CAUSE rather than a blank textarea:
 *
 *   node --experimental-strip-types ops/mycvs.test.mjs
 */

class FakeStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  key(i) { return [...this.map.keys()][i] ?? null; }
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
}

/* Both stores: the visit rule lives in `sessionStorage`, and without it `mayRestore` answers "no"
   for every anonymous case and half of this file would pass by never being able to say yes. */
globalThis.window = { localStorage: new FakeStorage(), sessionStorage: new FakeStorage() };
const store = globalThis.window.localStorage;
const session = globalThis.window.sessionStorage;

const { listMyCvs, outLangFor } = await import("../app/lib/myCvs.ts");
const { dominantScript, hasArabic } = await import("../app/lib/cvHeadings.ts");
const { ownerKey, writeResume, newResumeId, endAnonymousVisit } = await import("../app/lib/resumeStore.ts");
const { saveResume } = await import("../app/lib/localdata.ts");
const { readFileSync } = await import("node:fs");

let pass = 0, fail = 0;
const ok = (n, c, d = "") => {
  if (c) { pass++; console.log(`✅ ${n}`); }
  else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); }
};

const A = ownerKey("ahmed@example.com");
const B = ownerKey("badr@example.com");
const ANON = ownerKey(null);

/**
 * A BuilderState whose assembled text is long enough to be worth offering.
 *
 * `language` is the CV's language and is deliberately settable independently of the `lang` passed to
 * `writeResume` — the whole point of assertion group C.
 */
const cv = ({ title = "Radiographer", language = "en", name = "Ahmed Ali", roles = 3 } = {}) => ({
  schemaVersion: 2,
  target: { title, level: "", language, industry: "", country: "", city: "", employer: "", jobAdUrl: "", jobAdText: "" },
  profile: {
    name,
    contact: "Riyadh · ahmed@example.com · +966500000000",
    role: title,
    summary: `A ${title} with eight years of hospital experience across CT and MRI.`,
    wovenLines: Array.from({ length: roles }, (_, i) => `- Performed ${40 + i * 10} scans per week to protocol.`),
    skills: "CT · MRI · PACS · Radiation safety",
    education: "BSc Radiologic Technology — King Saud University",
    certifications: "SCFHS registered",
    languages: "Arabic (native) · English (professional)",
    extras: [],
  },
  suggestions: [],
  personal: { fullName: name, professionalTitle: title, city: "", country: "", phone: "", email: "", linkedin: "", portfolio: "" },
  credentials: [],
  languages: [],
  template: "ats-pro",
  sectionsDone: [],
});

/** The one thing `withJobAd` changes, kept separate so the base helper stays readable. */
const withJobAd = (state, text) => ({ ...state, target: { ...state.target, jobAdText: text } });

const reset = () => { store.clear(); session.clear(); };

/* ─────────── A. the builder's CV is offered at all ─────────── */

console.log("\n── a CV built here is offered back ──");
reset();
{
  const id = newResumeId(1000);
  writeResume(A, id, "en", cv({ title: "Radiographer" }));

  const list = listMyCvs(A);
  ok("the builder's CV is listed", list.length === 1, `got ${list.length}`);
  ok("it is marked as coming from the builder", list[0]?.origin === "builder");
  ok("its text is the assembled CV, not a placeholder", /Performed 40 scans/.test(list[0]?.text || ""));
  ok("the text carries the summary too", /eight years of hospital experience/.test(list[0]?.text || ""));
  ok("the title is the one the index recorded", Boolean(list[0]?.title));
}

/* ─────────── B. a header-only draft is NOT offered ─────────── */

console.log("\n── a draft with nothing in it is not offered ──");
reset();
{
  const bare = cv();
  bare.profile = { name: "Ahmed Ali", contact: "Riyadh", role: "", summary: "", wovenLines: [], skills: "", education: "", certifications: "", languages: "", extras: [] };
  writeResume(A, newResumeId(1000), "en", bare);

  ok("a name-and-city draft is withheld", listMyCvs(A).length === 0,
    "offering it would fill the textarea with three lines and look like the CV loaded");
}

/* ─────────── C. the CV's language, not the interface's ─────────── */

console.log("\n── the language comes from the DOCUMENT ──");
reset();
{
  /* The exact production case: an Arabic interface (`writeResume(..., "ar", ...)`) building an
     ENGLISH CV (`target.language === "en"`). */
  writeResume(A, newResumeId(1000), "ar", cv({ language: "en" }));
  const one = listMyCvs(A)[0];
  ok("an English CV built in the Arabic UI is offered as English", one?.lang === "en",
    `got ${one?.lang} — this is the bug that gave English CVs Arabic duties`);

  reset();
  /* And the mirror, so the assertion above cannot be satisfied by hardcoding "en". */
  writeResume(A, newResumeId(1000), "en", cv({ language: "ar", name: "أحمد علي" }));
  ok("an Arabic CV built in the English UI is offered as Arabic", listMyCvs(A)[0]?.lang === "ar");

  reset();
  writeResume(A, newResumeId(1000), "en", cv({ language: "both" }));
  ok('"both" resolves to English, as everywhere else', listMyCvs(A)[0]?.lang === "en");
}

/* ─────────── D. the target job travels with it ─────────── */

console.log("\n── the target job travels with the CV ──");
reset();
{
  const ad = "Senior Radiographer — King Faisal Specialist Hospital. CT and MRI. Five years' experience required.";
  writeResume(A, newResumeId(1000), "en", withJobAd(cv({ title: "Radiographer" }), ad));
  const one = listMyCvs(A)[0];
  ok("the job advert comes across", one?.jobAdText === ad,
    "this is what lets the interview page fill BOTH of its boxes");
  ok("so does the target title", one?.targetTitle === "Radiographer");

  reset();
  saveResume(A, { title: "Optimised CV", source: "optimized", text: cvText() });
  const saved = listMyCvs(A)[0];
  ok("a saved flat CV has no job advert to give", saved?.jobAdText === "" && saved?.targetTitle === "",
    "and it must say so rather than inventing one");
}

/* ─────────── E. two stores, one list, no duplicates ─────────── */

console.log("\n── the same CV is not offered twice ──");
reset();
{
  const state = withJobAd(cv({ title: "Radiographer" }), "A job advert.");
  writeResume(A, newResumeId(1000), "en", state);
  const builtText = listMyCvs(A)[0].text;

  /* Exactly what happens when a user builds a CV and saves it: the same text, in both stores. */
  saveResume(A, { title: "My CV", source: "built", text: builtText });

  const list = listMyCvs(A);
  ok("it appears once, not twice", list.length === 1, `got ${list.length}`);
  ok("and the copy kept is the builder's", list[0].origin === "builder",
    "the saved copy has no target job, so keeping it would silently lose the advert");
  ok("so the advert survives the de-duplication", list[0].jobAdText === "A job advert.");

  /* Whitespace-only differences are the same CV. An exported-and-reimported copy differs by
     line endings and nothing else. */
  reset();
  writeResume(A, newResumeId(1000), "en", state);
  const t = listMyCvs(A)[0].text;
  saveResume(A, { title: "Reimported", source: "optimized", text: t.replace(/\n/g, "\r\n") + "  " });
  ok("a copy differing only in whitespace is the same CV", listMyCvs(A).length === 1);
}

/* ─────────── F. newest first, and capped ─────────── */

console.log("\n── ordering and the cap ──");
reset();
{
  writeResume(A, newResumeId(1000), "en", cv({ title: "Older" }), { now: 1_000_000 });
  writeResume(A, newResumeId(2000), "en", cv({ title: "Newer", name: "Ahmed B" }), { now: 9_000_000 });
  const list = listMyCvs(A);
  ok("the most recent CV is first", /Ahmed B/.test(list[0]?.text || ""), list.map((c) => c.title).join(", "));

  reset();
  for (let i = 0; i < 9; i++) {
    writeResume(A, newResumeId(1000 + i * 1000), "en", cv({ title: `Role ${i}`, name: `Person ${i}` }), { now: 1_000_000 + i });
  }
  ok("nine CVs are capped to six offers", listMyCvs(A).length === 6, `got ${listMyCvs(A).length}`);
  ok("and the six kept are the newest", /Person 8/.test(listMyCvs(A)[0].text));
}

/* ─────────── G. whose CVs, and the visit rule ─────────── */

console.log("\n── whose CVs these are ──");
reset();
{
  writeResume(A, newResumeId(1000), "en", cv({ title: "Ahmed's", name: "Ahmed Ali" }));
  saveResume(A, { title: "Ahmed's saved", source: "built", text: cvText("Ahmed Ali") });

  ok("another account is offered nothing", listMyCvs(B).length === 0,
    "the shared-laptop case, which is the reason every key carries an owner");
  ok("an unresolved session is offered nothing", listMyCvs("").length === 0,
    "`useOwner` answers \"\" until the server says who this is; a list before then is a guess");
}

console.log("\n── the visit rule governs BOTH stores ──");
reset();
{
  /* `writeResume` sets the session marker via `touchVisit`, so this is a live anonymous visit. */
  writeResume(ANON, newResumeId(1000), "en", cv({ title: "Anonymous work" }));
  saveResume(ANON, { title: "Anonymous saved", source: "built", text: cvText("Someone Else") });
  const during = listMyCvs(ANON);
  ok("inside the visit, anonymous work is offered", during.length === 2, `got ${during.length}`);

  /* A new tab: localStorage survives, sessionStorage does not. */
  session.clear();
  const after = listMyCvs(ANON);
  ok("in a new tab, nothing is offered", after.length === 0, `got ${after.length}`);
  ok("and that includes the SAVED store, not just the builder's",
    after.every((c) => c.origin !== "saved"),
    "gating one store and not the other makes the rule depend on which door the CV came through");

  /* And a signed-in account is never subject to it — that is the entire offer made for signing in. */
  reset();
  writeResume(A, newResumeId(1000), "en", cv());
  session.clear();
  ok("a signed-in account's CV survives a new tab", listMyCvs(A).length === 1);
}

console.log("\n── an expired anonymous visit leaves nothing behind ──");
reset();
{
  writeResume(ANON, newResumeId(1000), "en", cv());
  endAnonymousVisit();
  ok("after the visit is ended there is nothing to offer", listMyCvs(ANON).length === 0);
}

/* ─────────── H. which language the model answers in ─────────── */

console.log("\n── the language the model answers in ──");
{
  const arabicCv = { key: "k", origin: "builder", title: "t", updatedAt: 0, lang: "ar", text: "سيرة ذاتية كاملة", targetTitle: "", jobAdText: "" };
  const englishCv = { ...arabicCv, lang: "en", text: "A full English CV" };

  ok("a picked CV's own declaration wins", outLangFor(arabicCv, arabicCv.text, false) === "ar",
    "the user chose this in the builder — a declared answer beats any guess");
  ok("even against the interface", outLangFor(englishCv, englishCv.text, true) === "en");

  ok("the declaration stops counting once the text is replaced",
    outLangFor(arabicCv, "A completely different English CV pasted over it", false) === "en",
    "otherwise the language follows a CV that is no longer in the box");

  ok("with no pick, the typed text decides", outLangFor(null, "سيرة ذاتية مليئة بالنص العربي", false) === "ar");
  ok("an empty box falls back to the interface", outLangFor(null, "   ", true) === "ar");
  ok("and to English in the English interface", outLangFor(null, "", false) === "en");

  /* The case that makes majority-counting worth having. */
  const englishCvArabicName = "أحمد علي\nRiyadh, Saudi Arabia\nSenior Radiographer with eight years of experience in CT and MRI imaging across two tertiary hospitals.";
  ok("one Arabic name does not make an English CV Arabic",
    outLangFor(null, englishCvArabicName, false) === "en",
    "in this market that is the common case, not the edge one");
  ok("and `hasArabic` would have got it wrong", hasArabic(englishCvArabicName) === true,
    "which is why the fallback counts letters instead of looking for one");
}

console.log("\n── dominantScript ──");
{
  ok("mostly Arabic is Arabic", dominantScript("سيرة ذاتية للمهندس أحمد") === "ar");
  ok("mostly English is English", dominantScript("Senior Radiographer, Riyadh") === "en");
  ok("empty text is English, matching every other default", dominantScript("") === "en");
  ok("digits and punctuation alone are English", dominantScript("+966 50 000 0000 · 2019–2024") === "en");
  ok("a tie goes to English", dominantScript("abc أبج") === "en");
}

/* ─────────── I. the five pages actually use it ─────────── */

console.log("\n── the five pages that asked twice ──");
{
  const PAGES = [
    ["app/(en)/interview/page.tsx", true],
    ["app/(en)/interview-live/page.tsx", false],
    ["app/(en)/linkedin/page.tsx", true],
    // /optimize and /ar/optimize share one component since F-25 (OptimizeTool.tsx) instead of
    // one page.tsx each — checked once here rather than at both now-thin wrapper paths.
    ["app/components/tools/OptimizeTool.tsx", false],
  ];
  for (const [path, callsTools] of PAGES) {
    const src = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    ok(`${path} offers the CVs this browser holds`,
      /import MyCvPicker/.test(src) && /<MyCvPicker/.test(src),
      "an import with no element rendered is the shape of a feature that shipped disabled");
    if (callsTools) {
      /*
       * The hardcoded language, which is the half of this item a picker alone would not have fixed.
       * `/ar/interview` and `/ar/linkedin` both redirect to these pages with `?lang=ar`, so every
       * Arabic user of them was handed English output with no field to say otherwise.
       */
      ok(`${path} no longer hardcodes lang: "en"`, !/lang:\s*"en"/.test(src));
      ok(`${path} derives the output language instead`, /outLangFor\(/.test(src));
    }
  }

  /*
   * `/interview-live` is deliberately NOT in the language half. Its interview is SPOKEN: the
   * question is read by `/api/tts` and the answer captured by SpeechRecognition, both keyed on the
   * interface language (`srLang`). Switching only the text would leave the voice and the transcriber
   * in the other language, which is worse than the inconsistency it fixed. Recorded here so the
   * omission is a decision rather than an oversight.
   */
  const live = readFileSync(new URL("../app/(en)/interview-live/page.tsx", import.meta.url), "utf8");
  ok("interview-live still ties its spoken language to the interface", /uiLang: ar \? "ar" : "en"/.test(live));
}

/** A flat CV long enough to pass `worthOffering`, for the saved-store half of the tests. */
function cvText(name = "Ahmed Ali") {
  return [
    name,
    "Riyadh · ahmed@example.com",
    "PROFESSIONAL SUMMARY",
    "Radiographer with eight years of hospital experience across CT and MRI.",
    "WORK EXPERIENCE",
    "- Performed 40 scans per week to protocol.",
    "SKILLS",
    "CT · MRI · PACS",
  ].join("\n");
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
