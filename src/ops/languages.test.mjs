/**
 * Five languages, and the one nothing was watching.
 *
 * The worst bug this product has shipped was one word doing two jobs: `lang`. A Saudi applicant read
 * the Arabic interface, so the CV was written in Arabic — duties, credential names, proficiency
 * words — while the job was in English. Nobody chose that; a variable name did.
 *
 * Splitting interface from document fixed the reported case and named two of five. This suite is
 * about the third: what the user is actually TYPING. Choosing an English CV and then writing the
 * duties in Arabic produces a document that looks perfect in the preview — it renders exactly what
 * was typed — and parses as noise to the filter it was written for. Nothing in the product could
 * see it, because everything downstream reads the same text.
 *
 * The tests below spend most of their attention on what must NOT be flagged. A rule that fires on
 * an Arabic employer name in an English CV, or on "CT" and "PACS" in an Arabic one, is a rule the
 * user learns to dismiss — and dismissing it costs more than the mismatch it was built to catch.
 *
 *   node --experimental-strip-types ops/languages.test.mjs
 */

import {
  detectScript, authoredText, languageSet, languageMismatch,
} from "../app/lib/languages.ts";
import { EMPTY_BUILDER, EMPTY_TARGET } from "../app/lib/builderDoc.ts";
import { reviewQuality } from "../app/lib/reviewChecks.ts";
import { localizeFinding } from "../app/lib/reviewMessages.ts";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };

const draft = (patch = {}) => ({
  ...EMPTY_BUILDER,
  target: { ...EMPTY_TARGET, title: "Radiology Technologist", country: "SA", language: "en" },
  ...patch,
});

const withText = (lang, bullets, skills = "") => draft({
  target: { ...EMPTY_TARGET, title: "Radiology Technologist", country: "SA", language: lang },
  profile: {
    ...EMPTY_BUILDER.profile,
    skills,
    roles: [{ id: "r1", title: "Radiographer", company: "Dallah", location: "", start: "2020", end: "", bullets }],
  },
});

/* ─────────────────────────── the script detector ─────────────────────────── */

ok("plain English is English", detectScript("Operated CT and MRI scanners on the day rota") === "en");
ok("plain Arabic is Arabic", detectScript("شغّلت أجهزة التصوير المقطعي في الوردية الصباحية") === "ar");
ok("a short string is not judged", detectScript("CT") === "empty");
ok("an empty string is not judged", detectScript("") === "empty");

/*
 * The three that the FIRST version of this detector got wrong, kept as fixtures.
 *
 * It counted characters, so an Arabic sentence about Latin-named machines came back "mixed" — and
 * so did an Arabic skills list of acronyms, and an English bullet naming an Arabic hospital. Every
 * one of those is how people in this market write, and flagging them would have taught users to
 * dismiss the warning that matters.
 */
ok("an Arabic sentence full of Latin machine names is Arabic",
  detectScript("شغّلت أجهزة CT و MRI و PACS و RIS و DICOM وأجريت فحوصات X-ray يومياً") === "ar");
ok("an Arabic skills list with Latin acronyms is Arabic",
  detectScript("التصوير المقطعي، الرنين المغناطيسي، PACS، RIS، DICOM، BLS") === "ar");
ok("an English CV naming an Arabic credential is English",
  detectScript("BSc Radiologic Science. Holder of تصنيف الهيئة السعودية للتخصصات الصحية and BLS.") === "en");
ok("one Arabic line among several English ones is not a bilingual CV",
  detectScript([
    "Operated CT and MRI scanners on the day and night rota",
    "Verified patient identity before every examination",
    "Maintained PACS records and escalated equipment faults",
    "بكالوريوس علوم الأشعة من جامعة الملك سعود",
  ].join("\n")) === "en");

/*
 * The two cases that must NOT be mixed. Both are correct writing, and both would be flagged by a
 * naive "does it contain the other script" rule — which is why the threshold is a share, not a
 * presence test.
 */
ok("an Arabic CV keeps its Latin equipment names",
  detectScript("شغّلت أجهزة التصوير المقطعي المحوسب (CT) ونظام أرشفة الصور (PACS) في مستشفى دلة") === "ar");
ok("an English CV keeps an Arabic employer name",
  detectScript("Operated CT and MRI scanners at مستشفى دلة on the night rota") === "en");

/*
 * And the case that IS mixed: whole LINES in each, which is what the real thing looks like.
 *
 * A user starts an English CV, gets tired, and finishes the last two roles in Arabic. Half the
 * document matches an English search and half does not, and the preview shows nothing wrong.
 *
 * The first version of this fixture was one line half in each language — which is not something
 * anybody writes, and which the segment-based detector correctly refuses to call mixed, because a
 * single sentence has a single dominant script no matter what is embedded in it.
 */
ok("a document written half in each language is mixed",
  detectScript([
    "Operated CT and MRI scanners on the day and night rota",
    "Verified patient identity before every examination",
    "شغّلت أجهزة الرنين المغناطيسي وأجريت فحوصات الطوارئ",
    "تحققت من هوية المريض قبل كل فحص ووثّقت النتائج",
  ].join("\n")) === "mixed");

/* ──────────────────────── what counts as authored text ──────────────────────── */

{
  const s = draft({
    profile: {
      ...EMPTY_BUILDER.profile,
      name: "عبدالعزيز العنزي",
      contact: "alanziabdulaziz4@example.com · +966 55 000 0000 · الرياض",
      summary: "Radiology technologist experienced in CT and MRI across day and night rotas",
      roles: [],
    },
  });
  const text = authoredText(s);

  /*
   * THE EXCLUSION. A name is written in whatever script the name is in, and an Arabic name on an
   * English CV is the single most correct thing on the page. Counting it would make every Saudi
   * applicant's English CV report a language mismatch.
   */
  ok("the name is not authored text", !text.includes("عبدالعزيز"));
  ok("nor is the contact line", !text.includes("الرياض"));
  ok("but the summary is", text.includes("Radiology technologist"));

  ok("so an English CV with an Arabic name is not mismatched",
    languageMismatch(languageSet(s)) === null);
}

/* ───────────────────────────── the five fields ───────────────────────────── */

{
  const s = withText("en", ["Operated CT and MRI scanners on the day and night rota"]);
  const set = languageSet(s, "ar");

  ok("the interface can be Arabic while the document is English",
    set.interface === "ar" && set.authoring === "en");
  ok("the view follows the document when no version is selected", set.view === "en");
  ok("the input is measured, not declared", set.input === "en");
  ok("the export follows the view", set.export === "en");

  /* A selected version changes the view and the export, and NOTHING about the facts. */
  const viewing = languageSet({ ...s, activeVersion: "ar" }, "ar");
  ok("selecting a version moves the view", viewing.view === "ar" && viewing.export === "ar");
  ok("and leaves the authoring language alone", viewing.authoring === "en");

  /* "both" is the one setting that produces two documents. */
  const both = languageSet({ ...s, target: { ...s.target, language: "both" } });
  ok('"both" is an export setting, not a view one', both.export === "both");
  ok("and authoring still resolves to one language", both.authoring === "en");
}

/* ───────────────────────────── the mismatch ───────────────────────────── */

{
  const arabicInEnglish = withText("en", [
    "شغّلت أجهزة التصوير المقطعي المحوسب في الوردية الصباحية والمسائية",
    "تحققت من هوية المريض قبل كل فحص ووثّقت النتائج في النظام",
  ]);
  const m = languageMismatch(languageSet(arabicInEnglish));
  ok("Arabic written into an English CV is caught", m?.code === "input-not-authoring");
  ok("and the message can name both sides", m?.found === "ar" && m?.expected === "en");

  const englishInArabic = withText("ar", [
    "Operated CT and MRI scanners on the day and night rota",
    "Verified patient identity before every examination and documented outcomes",
  ]);
  ok("and the reverse is caught too",
    languageMismatch(languageSet(englishInArabic))?.code === "input-not-authoring");

  ok("a matching document is not flagged",
    languageMismatch(languageSet(withText("en", ["Operated CT and MRI scanners daily on the rota"]))) === null);

  ok("an empty document is not flagged",
    languageMismatch(languageSet(draft())) === null);
}

/* ────────────────── it reaches the user, in their language ────────────────── */

{
  const s = withText("en", [
    "شغّلت أجهزة التصوير المقطعي المحوسب في الوردية الصباحية والمسائية",
    "تحققت من هوية المريض قبل كل فحص ووثّقت النتائج في النظام",
  ], "التصوير المقطعي، الرنين المغناطيسي");

  const report = reviewQuality(s, "2026-07-25");
  const finding = report.findings.find((f) => f.id.startsWith("language-mismatch"));

  ok("the review reports it", Boolean(finding));
  /* A document written entirely in the other language is fatal — an employer searching in the
   chosen language finds nothing at all. */
ok("as an error, not a suggestion", finding?.severity === "critical");
  ok("and points at the step that owns the choice", finding?.section === "target");

  /* Arabic, and actually Arabic — the failure this repo has shipped is an English string reaching
     an Arabic screen through a fallback nobody looked at. */
  const ar = localizeFinding(finding ?? { id: "", title: "", detail: "" }, "ar");
  ok("the Arabic version exists", /[؀-ۿ]/.test(ar.title));
  ok("and does not fall back to English", !/[A-Za-z]{4,}/.test(ar.title));

  /* And the same document, written in the language it says it is in, has no such finding. */
  const clean = reviewQuality(withText("en", ["Operated CT and MRI scanners on the day and night rota"]), "2026-07-25");
  ok("a consistent CV is not told it is inconsistent",
    !clean.findings.some((f) => f.id.startsWith("language-mismatch")));
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
