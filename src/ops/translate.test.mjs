/**
 * Translation may change WORDS. It may never change FACTS.
 *
 * That is the whole feature, and every assertion here is a way it can quietly stop being true. A CV is
 * a document its owner has to defend in an interview: a wrong year, an employer that gained an English
 * name nobody uses, a "contributed to" that became "led" — each is a checkable falsehood the user
 * cannot see, because they asked for a translation and trusted it.
 *
 * The glossary half is tested for a different reason. An applicant tracking system matches strings, so
 * the same Arabic term rendered two ways in one document has demonstrated that skill zero times. A
 * table makes it one way, always, for free.
 *
 *   node --experimental-strip-types ops/translate.test.mjs
 */

import {
  buildTranslationSource, protectedNames, validateTranslation,
  sourceContentHash, sectionHashes, staleSections, translationFresh,
  translationKey, translationEscalation, TRANSLATION_PROMPT_VERSION, TRANSLATABLE_SECTIONS,
  applyVersionToProfile, versionDir,
} from "../app/lib/translate.ts";
import {
  GLOSSARY, GLOSSARY_SIZE, GLOSSARY_VERSION, lookup, render, applyGlossary, glossaryFor, entryById,
} from "../app/lib/glossary.ts";
import { EMPTY_BUILDER, EMPTY_TARGET } from "../app/lib/builderDoc.ts";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };

/* ─────────────────────── the glossary ─────────────────────── */

{
  ok("the glossary has real coverage", GLOSSARY_SIZE >= 40, String(GLOSSARY_SIZE));
  ok("every entry has a unique id", new Set(GLOSSARY.map((e) => e.id)).size === GLOSSARY_SIZE);
  ok("every entry has both languages", GLOSSARY.every((e) => e.ar.trim() && e.en.trim()));
  ok("every Arabic term is Arabic", GLOSSARY.every((e) => /[؀-ۿ]/.test(e.ar)));

  ok("Arabic → English", lookup("الأشعة المقطعية", "ar")?.en === "Computed Tomography");
  ok("English → Arabic", lookup("Computed Tomography", "en")?.ar === "الأشعة المقطعية");
  ok("an abbreviation resolves too", lookup("PACS", "en")?.id === "sys.pacs");
  ok("orthography is folded — hamza and ta-marbuta do not break a lookup",
    lookup("الاشعه المقطعيه", "ar")?.id === "imaging.ct");
  ok("an unknown term returns null rather than a guess", lookup("منسق شؤون الصقور", "ar") === null);

  /*
   * The abbreviation rule. Arabic professional writing keeps Latin abbreviations — a Saudi radiology CV
   * says "نظام أرشفة الصور والاتصالات (PACS)". Translating PACS into an Arabic acronym produces
   * something no recruiter and no ATS has seen.
   */
  const pacs = entryById("sys.pacs");
  ok("first use gives the full term plus the abbreviation",
    render(pacs, "ar", true) === "نظام أرشفة الصور والاتصالات (PACS)");
  ok("later uses give the abbreviation alone", render(pacs, "ar", false) === "PACS");
  ok("and the same in English", render(pacs, "en", true).endsWith("(PACS)"));

  /* An entry whose term IS its abbreviation must not render as "DICOM (DICOM)". */
  ok("a term that is already an abbreviation is not doubled",
    render(entryById("sys.dicom"), "en", true) === "DICOM");

  /*
   * Classification and registration are two separate SCFHS steps. Merging them is a factual claim about
   * the person's regulatory status, which is why they are separate entries and the note says so.
   */
  ok("SCFHS classification and registration are separate entries",
    entryById("cred.scfhs_classification") !== null && entryById("cred.scfhs_registration") !== null
    && entryById("cred.scfhs_classification").en !== entryById("cred.scfhs_registration").en);
  ok("and the reason is written down where someone would merge them",
    /never combine/i.test(entryById("cred.scfhs_classification").note ?? ""));

  /* The cost mechanism: terms the table knows never reach a model. */
  const { translated, unknown } = applyGlossary(
    ["الأشعة السينية", "الأشعة المقطعية", "وضعية المريض", "منسق شؤون الصقور"], "ar");
  ok("known terms are answered from the table", translated.length === 3, String(translated.length));
  ok("and only the misses would go to a model", unknown.length === 1 && unknown[0] === "منسق شؤون الصقور");
  ok("each answer carries its language-neutral id, so a confirmed skill stays one skill",
    translated.every((t) => t.id.includes(".")));

  /* Only relevant entries go in a prompt: sending all fifty is wasted tokens AND an invitation to use
     vocabulary the CV never mentioned. */
  const subset = glossaryFor("نفّذت فحوصات الأشعة المقطعية ومراجعة جودة الصور", "ar", ["health"]);
  ok("only terms present in the text are sent", subset.length > 0 && subset.length < GLOSSARY_SIZE / 3,
    String(subset.length));
  ok("and they are the right ones", subset.some((e) => e.id === "imaging.ct"));
  ok("a family filter excludes another profession's vocabulary",
    glossaryFor("تخطيط الدروس وإدارة الصف", "ar", ["education"]).every((e) => !e.families.includes("health") || e.families.includes("education")));
}

/* ─────────────────────── building the source ─────────────────────── */

const CV = {
  ...EMPTY_BUILDER,
  target: { ...EMPTY_TARGET, title: "أخصائي أشعة", country: "SA", language: "ar" },
  personal: { ...EMPTY_BUILDER.personal, fullName: "عبدالعزيز العنزي", email: "a@b.co", country: "SA" },
  profile: {
    ...EMPTY_BUILDER.profile,
    summary: "أخصائي أشعة تشخيصية بخبرة في التصوير المقطعي والعام.",
    skills: "الأشعة السينية, الأشعة المقطعية, وضعية المريض",
    education: "بكالوريوس علوم الأشعة — جامعة الملك سعود، 2018",
    languages: "العربية, الإنجليزية",
    roles: [{
      id: "r1", title: "أخصائي أشعة", company: "مستشفى الملك فهد", location: "الرياض",
      start: "2019", end: "",
      bullets: [
        "نفّذت فحوصات الأشعة المقطعية والعامة وفق البروتوكولات المعتمدة في مستشفى الملك فهد.",
        "راجعت جودة الصور قبل إرسالها إلى نظام أرشفة الصور والاتصالات.",
      ],
    }],
  },
  credentials: [
    { id: "c1", kind: "registration", title: "التسجيل المهني لدى الهيئة السعودية للتخصصات الصحية", issuer: "الهيئة السعودية للتخصصات الصحية", issueDate: "2019", expiryDate: "2026", status: "confirmed", source: "user" },
    { id: "c2", kind: "certification", title: "شهادة لم تُؤكَّد", issuer: "جهة", issueDate: "", expiryDate: "", status: "suggested", source: "ai" },
  ],
};

{
  const src = buildTranslationSource(CV, "en", ["health"]);
  ok("the source language comes from the CV, not the interface", src.sourceLanguage === "ar");
  ok("every item has an id and a section",
    src.items.every((i) => i.id && TRANSLATABLE_SECTIONS.includes(i.section)));
  ok("the summary, the bullets, the skills and the education are all included",
    ["profile.summary", "r1.b0", "profile.skills", "profile.education"].every((id) => src.items.some((i) => i.id === id)));

  /*
   * The exclusions are the point of this function.
   *
   * A REJECTED suggestion is a decision the user made; translating it resurrects it in the other
   * language. An UNCONFIRMED one is not a fact yet. Neither belongs in a document claiming to be the
   * same CV in another language.
   */
  ok("an unconfirmed credential is NOT sent for translation",
    !src.items.some((i) => i.text.includes("لم تُؤكَّد")));
  ok("the confirmed one is", src.items.some((i) => i.id === "cred.c1"));

  /* The employer is a protected name, not a translatable item — stronger than catching it afterwards. */
  ok("the employer is never offered for rewriting",
    !src.items.some((i) => i.text === "مستشفى الملك فهد"));
  ok("but it IS on the protected list", src.protectedNames.includes("مستشفى الملك فهد"));
  ok("so is the person's own name", src.protectedNames.includes("عبدالعزيز العنزي"));
  ok("and the credential issuer", src.protectedNames.includes("الهيئة السعودية للتخصصات الصحية"));

  /* Places are deliberately NOT protected: "الرياض" is Riyadh, always, and freezing it would leave
     Arabic place names in an English CV, which reads as an unfinished translation. */
  ok("the city is not frozen — it has a standard English form", !src.protectedNames.includes("الرياض"));

  ok("nothing empty is sent", src.items.every((i) => i.text.trim().length > 0));
  ok("protectedNames is computable on its own", protectedNames(CV).length >= 3);
}

/* ─────────────────────── validation: the facts must survive ─────────────────────── */

const src = buildTranslationSource(CV, "en", ["health"]);

/**
 * A faithful translation, written out per id rather than generated by a heuristic.
 *
 * The first version of this fixture guessed which English line to emit from substrings of the Arabic,
 * and quietly never produced "SCFHS" for the credential — so the suite reported a library bug that was
 * a fixture bug wearing its clothes. A fixture that has to be reasoned about is not a fixture.
 *
 * Every line here is what a good translation actually looks like: English prose, digits identical, the
 * employer preserved in Arabic because no verified English name was supplied, and the SCFHS
 * organisation rendered in its glossary form because one was.
 */
const good = {
  "target.title": "Radiology Technologist",
  "r1.title": "Radiology Technologist",
  "profile.summary": "Diagnostic radiographer experienced in general and CT imaging.",
  "r1.b0": "Performed general X-ray and CT examinations to approved protocols at مستشفى الملك فهد",
  "r1.b1": "Reviewed image quality before submission to PACS",
  "profile.education": "BSc Radiologic Sciences — King Saud University, 2018",
  "profile.skills": "General X-ray, Computed Tomography (CT), Patient Positioning",
  "profile.languages": "Arabic, English",
  "cred.c1": "SCFHS Professional Registration",
};

/* The fixture must cover the source exactly, or every assertion below is testing the wrong thing. */
ok("the fixture translates every source item and invents none",
  src.items.every((i) => typeof good[i.id] === "string")
  && Object.keys(good).length === src.items.length,
  `${Object.keys(good).length} vs ${src.items.length}`);

{
  const v = validateTranslation(src, { items: good });
  ok("a faithful translation validates", v.ok === true, JSON.stringify(v.problems).slice(0, 160));
}

{
  /* THE most damaging failure: a moved date. A wrong year on a CV is a falsehood the applicant has to
     defend, and they cannot see it happen. Arabic-Indic and Western digits compare equal. */
  const bad = { ...good, "profile.education": "BSc Radiologic Sciences — King Saud University, 2019" };
  const v = validateTranslation(src, { items: bad });
  ok("a changed year is rejected", !v.ok && v.problems.some((p) => p.code === "digit-changed"));

  const arabicDigits = { ...good, "profile.education": "BSc Radiologic Sciences — King Saud University, ٢٠١٨" };
  ok("Arabic-Indic digits count as the same number",
    validateTranslation(src, { items: arabicDigits }).ok === true);
}

{
  const missing = { ...good };
  delete missing["r1.b1"];
  const v = validateTranslation(src, { items: missing });
  ok("a dropped line is rejected — the English CV must not be shorter",
    !v.ok && v.problems.some((p) => p.code === "missing-item" && p.itemId === "r1.b1"));

  const extra = { ...good, "r1.b9": "Led a team of radiographers across three sites" };
  ok("an invented line is rejected — an id nobody sent came back",
    !validateTranslation(src, { items: extra }).ok
    && validateTranslation(src, { items: extra }).problems.some((p) => p.code === "extra-item"));

  ok("an empty translation is rejected",
    !validateTranslation(src, { items: { ...good, "profile.summary": "   " } }).ok);
}

{
  const lost = {
    ...good,
    "r1.b0": "Performed general X-ray and CT examinations to approved protocols at King Fahad Hospital",
  };
  const v = validateTranslation(src, { items: lost });
  ok("an employer given an unverified English name is flagged",
    !v.ok && v.problems.some((p) => p.code === "protected-name-lost"));

  /* A protected name that appears in NO translatable item cannot be "lost" — the person's own name
     lives in `personal`, not in a bullet, so demanding it in the output would fail every CV. */
  ok("a protected name absent from the source is not demanded in the output",
    !validateTranslation(src, { items: good }).problems.some((p) => p.detail === "عبدالعزيز العنزي"));
}

{
  /* A passthrough dressed as work: the source text returned unchanged. */
  const passthrough = { ...good, "profile.summary": "أخصائي أشعة تشخيصية بخبرة في التصوير المقطعي والعام." };
  ok("returning the Arabic unchanged is rejected as untranslated",
    !validateTranslation(src, { items: passthrough }).ok
    && validateTranslation(src, { items: passthrough }).problems.some((p) => p.code === "untranslated"));

  /*
   * But a preserved Arabic employer inside an English sentence is CORRECT, and a naive "contains
   * Arabic" check would reject it. That is why the check is a majority test.
   */
  ok("an English line containing a preserved Arabic name is accepted",
    validateTranslation(src, { items: good }).ok === true);
}

/* ─────────────────────── caching and staleness ─────────────────────── */

{
  const key = translationKey({ sourceLanguage: "ar", targetLanguage: "en", contentHash: sourceContentHash(src), modelVersion: "m1" });
  ok("the key carries the prompt and glossary versions",
    key.includes(TRANSLATION_PROMPT_VERSION) && key.includes(GLOSSARY_VERSION));
  ok("a different model is a different translation",
    key !== translationKey({ sourceLanguage: "ar", targetLanguage: "en", contentHash: sourceContentHash(src), modelVersion: "m2" }));
  ok("the same content gives the same key",
    key === translationKey({ sourceLanguage: "ar", targetLanguage: "en", contentHash: sourceContentHash(src), modelVersion: "m1" }));

  const stored = {
    sourceLanguage: "ar", targetLanguage: "en",
    contentHash: sourceContentHash(src), sectionHashes: sectionHashes(src),
    promptVersion: TRANSLATION_PROMPT_VERSION, glossaryVersion: GLOSSARY_VERSION,
    model: "claude-haiku-4-5", items: good, needsConfirmation: [], warnings: [], createdAt: 1,
  };

  ok("an unchanged CV reuses its translation", translationFresh(stored, src) === true);
  ok("nothing stored is never fresh", translationFresh(null, src) === false);
  ok("a prompt-version bump retires it",
    translationFresh({ ...stored, promptVersion: "t0" }, src) === false);
  ok("a glossary-version bump retires it too — the terms would differ",
    translationFresh({ ...stored, glossaryVersion: "g0" }, src) === false);

  /*
   * The partial-update rule, which is the whole reason sections are hashed separately: changing one
   * bullet must not retranslate a CV.
   */
  const edited = buildTranslationSource({
    ...CV,
    profile: {
      ...CV.profile,
      roles: [{ ...CV.profile.roles[0], bullets: [CV.profile.roles[0].bullets[0], "راجعت جودة الصور وأبلغت عن أعطال الأجهزة."] }],
    },
  }, "en", ["health"]);

  const stale = staleSections(stored, edited);
  ok("editing one bullet marks only the experience section stale",
    stale.length === 1 && stale[0] === "experience", stale.join(","));
  ok("the summary translation survives untouched", !stale.includes("summary"));
  ok("and the skills translation survives untouched", !stale.includes("skills"));
  ok("so the stored version is no longer fresh, but only partly", translationFresh(stored, edited) === false);

  /*
   * A template or a colour cannot touch a translation — and the reason is structural, not a check.
   *
   * `TranslationSource` has five fields and none of them can hold a template, a colour, an export
   * setting or a phone number. `buildTranslationSource` is the narrowing, so by the time either hash
   * runs there is nothing irrelevant left to hash. That is a stronger guarantee than a comparison,
   * which is why an attempt to break it by hashing the whole source object changes nothing.
   *
   * Both hashes are asserted anyway, because they are read by different callers — `staleSections` uses
   * `sectionHashes` and the cache key uses `sourceContentHash` — and a future field added to the type
   * would silently affect one of them first.
   */
  const restyled = buildTranslationSource({ ...CV, template: "azure" }, "en", ["health"]);
  ok("changing the template marks nothing stale", staleSections(stored, restyled).length === 0);
  ok("and does not move the cache key either",
    sourceContentHash(restyled) === sourceContentHash(src));

  const recontacted = buildTranslationSource({
    ...CV, personal: { ...CV.personal, phone: "0500000000" },
  }, "en", ["health"]);
  ok("changing the phone number marks nothing stale", staleSections(stored, recontacted).length === 0);
  ok("and does not move the cache key either",
    sourceContentHash(recontacted) === sourceContentHash(src));

  /* But changing a CONFIRMED FACT must move it, or a stale translation would be served forever. */
  const edited2 = buildTranslationSource({
    ...CV, profile: { ...CV.profile, summary: "أخصائي أشعة بخبرة في الرنين المغناطيسي." },
  }, "en", ["health"]);
  ok("changing a confirmed line DOES move the cache key",
    sourceContentHash(edited2) !== sourceContentHash(src));

  /* A section that disappears is a change too — its translated items must not linger. */
  const noSummary = buildTranslationSource({ ...CV, profile: { ...CV.profile, summary: "" } }, "en", ["health"]);
  ok("removing a section marks it stale", staleSections(stored, noSummary).includes("summary"));
}

/* ─────────────────────── model routing ─────────────────────── */

{
  ok("an ordinary CV stays on the fast model", translationEscalation(src) === null);
  ok("the user asking for advanced tailoring escalates",
    translationEscalation(src, { userRequested: true }) === "user-requested");
  ok("a failed validation escalates once",
    translationEscalation(src, { validationFailed: true }) === "validation-failed");
  ok("three occupation families escalate — the register has to switch mid-document",
    translationEscalation({ ...src, families: ["health", "education", "it"] }) === "mixed-specialties");

  const long = { ...src, items: [{ id: "x", section: "experience", text: "ن".repeat(7000) }] };
  ok("a very long CV escalates", translationEscalation(long) === "senior-achievements");

  /*
   * There is no reason for "the user pressed the button again", same discipline as the suggestion
   * router. Impatience is not difficulty, and routing on it turns a ceiling into a floor.
   */
  ok("validation failure takes precedence over a user request",
    translationEscalation(src, { userRequested: true, validationFailed: true }) === "validation-failed");
}

/* ─────────────────────── rendering a version ─────────────────────── */

{
  const rendered = applyVersionToProfile(CV.profile, { items: good });

  ok("the summary renders in English", rendered.summary === good["profile.summary"]);
  ok("the bullets render in English", rendered.roles[0].bullets[1] === good["r1.b1"]);
  ok("the role title renders in English", rendered.roles[0].title === good["r1.title"]);
  ok("the skills render in English", rendered.skills === good["profile.skills"]);

  /*
   * THE ASSERTION. Facts that were never translatable must survive a render untouched — the employer,
   * the dates, the location. They are absent from the item map by construction, so this holds because
   * there is nowhere for a translation to put them, not because a rule remembers to skip them.
   */
  ok("the employer is unchanged", rendered.roles[0].company === "مستشفى الملك فهد");

  /*
   * The stronger version of that assertion, added after injecting the defect and watching the suite
   * pass it: a map that CONTAINS a key for the employer must still not move the employer.
   *
   * The first check only proved the renderer does not invent a company key. It did not prove the
   * renderer ignores one that arrives — and a model that returns `r1.company` is exactly the case
   * where a CV silently changes where someone worked. The renderer reads a fixed set of fields; keys
   * outside it are inert, and that is now asserted rather than assumed.
   */
  const hostile = applyVersionToProfile(CV.profile, {
    items: {
      ...good,
      "r1.company": "King Fahad Medical City",
      "r1.start": "2015",
      "r1.end": "2020",
      "r1.location": "Jeddah",
    },
  });
  ok("an employer key in the translation is ignored",
    hostile.roles[0].company === "مستشفى الملك فهد");
  ok("a start-date key in the translation is ignored", hostile.roles[0].start === "2019");
  ok("an end-date key is ignored — the role stays current", hostile.roles[0].end === "");
  ok("a location key is ignored", hostile.roles[0].location === "الرياض");
  ok("the start date is unchanged", rendered.roles[0].start === "2019");
  ok("the end date is unchanged — still the current role", rendered.roles[0].end === "");
  ok("the location is unchanged", rendered.roles[0].location === "الرياض");
  ok("the number of jobs is unchanged", rendered.roles.length === CV.profile.roles.length);
  ok("the number of bullets is unchanged",
    rendered.roles[0].bullets.length === CV.profile.roles[0].bullets.length);

  /* And the Arabic document is not mutated by rendering a view of it. */
  ok("rendering does not touch the source profile",
    CV.profile.summary === "أخصائي أشعة تشخيصية بخبرة في التصوير المقطعي والعام."
    && CV.profile.roles[0].bullets[0].startsWith("نفّذت"));

  /*
   * A missing translation falls back to the SOURCE line, never to an empty one. A blank line silently
   * deletes a job someone did; an Arabic line inside an English CV is visible and fixable.
   */
  const partial = applyVersionToProfile(CV.profile, { items: { "profile.summary": good["profile.summary"] } });
  ok("an untranslated bullet keeps its Arabic rather than vanishing",
    partial.roles[0].bullets[0] === CV.profile.roles[0].bullets[0]);
  ok("and the translated summary still applies", partial.summary === good["profile.summary"]);
  ok("an empty translation is treated as missing",
    applyVersionToProfile(CV.profile, { items: { "profile.summary": "   " } }).summary === CV.profile.summary);

  ok("no version at all renders the document itself",
    applyVersionToProfile(CV.profile, null) === CV.profile);

  ok("the English version reads left to right", versionDir("en") === "ltr");
  ok("and the Arabic one right to left", versionDir("ar") === "rtl");
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
