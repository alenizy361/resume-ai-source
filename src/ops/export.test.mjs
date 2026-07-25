/**
 * The Arabic download, which is the only download an Arabic CV gets.
 *
 * The plain PDF cannot shape Arabic and the designed PDF is a raster image no ATS can read, so an
 * Arabic user's CV reaches an employer as one Word file. Everything that file decides — what is a
 * heading, which way a line runs — was decided inside a click handler in a `.tsx`, where no test
 * could reach it. Two things were wrong there, and both are asserted below:
 *
 *   1. "Is this a heading" was `line === line.toUpperCase()`. That is a fact about LATIN text.
 *      Arabic has no case, so every Arabic line equalled its own uppercase and any short one became
 *      a bold section heading — the city under the name, most skill lines, a one-line summary.
 *
 *   2. Arabic paragraphs set `bidirectional` but their runs never set `rightToLeft`. Word was told
 *      the paragraph runs right-to-left and the text inside it does not, which is the mix that puts
 *      a trailing "(CT)" or a phone number on the wrong end of the line. This product's own glossary
 *      writes "التصوير المقطعي المحوسب (CT)", so mixed script is the normal case here.
 *
 * And the assertion that outlasts both: every heading `assembleResume` actually writes must be
 * recognised. That is what caught "الشهادات والتدريب" and "إضافات" — two headings this product has
 * been emitting for months that the hand-maintained list did not contain, so they rendered as body
 * text in the designed page and, in Word, as whatever the casing rule felt like.
 *
 *   node --experimental-strip-types ops/export.test.mjs
 */

import { assembleResume } from "../app/lib/mergeProfile.ts";
import { isHeading, hasArabic, HEADINGS_AR } from "../app/lib/cvHeadings.ts";
import { docxPlan } from "../app/lib/docxPlan.ts";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };

/** A full profile in one language, with the mixed-script vocabulary this market actually uses. */
const profile = (ar) => ({
  name: ar ? "عبدالعزيز العنزي" : "Abdulaziz Alenizy",
  contact: "abdulaziz@example.com · +966 55 000 0000",
  role: ar ? "أخصائي أشعة" : "Radiology Technologist",
  summary: ar
    ? "أخصائي أشعة بخبرة في التصوير المقطعي المحوسب (CT) والرنين المغناطيسي (MRI)."
    : "Radiology technologist experienced in CT and MRI.",
  wovenLines: ar
    ? ["مستشفى الملك فهد — أخصائي أشعة (2020 – الآن)", "- تشغيل أجهزة التصوير المقطعي المحوسب (CT) يومياً"]
    : ["King Fahd Hospital — Radiology Technologist (2020 – present)", "- Operated CT scanners daily"],
  skills: ar ? "التصوير المقطعي المحوسب (CT)، نظام أرشفة الصور (PACS)" : "CT, MRI, PACS",
  education: ar ? "بكالوريوس علوم الأشعة — جامعة الملك سعود" : "BSc Radiologic Science — King Saud University",
  certifications: ar ? "تصنيف الهيئة السعودية للتخصصات الصحية" : "SCFHS classification",
  languages: ar ? "العربية (اللغة الأم)، الإنجليزية (متقدم)" : "Arabic (native), English (advanced)",
  extras: [ar ? "رخصة قيادة سارية" : "Valid driving licence"],
});

/* ── every heading the assembler writes is a heading to every reader ── */

for (const ar of [false, true]) {
  const text = assembleResume(profile(ar), ar);
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  /*
   * The headings, identified independently of `isHeading` so this is not circular: `assembleResume`
   * puts a blank line before each one and nothing else, so a line preceded by a blank — after the
   * header block — is a heading by construction.
   */
  const raw = text.split("\n");
  const emitted = raw
    .map((l, i) => ({ l: l.trim(), prevBlank: i > 0 && !raw[i - 1].trim() }))
    .filter((x) => x.l && x.prevBlank)
    .map((x) => x.l);

  ok(`${ar ? "ar" : "en"}: the assembler emits its section headings`, emitted.length >= 6, `${emitted.length}`);
  const unknown = emitted.filter((h) => !isHeading(h));
  ok(`${ar ? "ar" : "en"}: every emitted heading is recognised`, unknown.length === 0, unknown.join(" · "));

  /* And nothing else is. A body line promoted to a heading is the Arabic bug in its other form. */
  const bodyClaimingHeading = lines.filter((l) => !emitted.includes(l) && isHeading(l));
  ok(`${ar ? "ar" : "en"}: no content line is mistaken for a heading`,
    bodyClaimingHeading.length === 0, bodyClaimingHeading.join(" · "));
}

/* ── the Arabic Word plan ── */

{
  const text = assembleResume(profile(true), true);
  const plan = docxPlan(text);
  const body = plan.filter((l) => l.role === "body");
  const heads = plan.filter((l) => l.role === "heading");

  ok("the name is the first line and only the first line",
    plan.filter((l) => l.role === "name").length === 1 && plan.find((l) => l.text)?.role === "name");

  ok("the Arabic document has headings", heads.length >= 6, `${heads.length}`);
  ok("and far more body than heading", body.length > heads.length, `${body.length} body / ${heads.length} heads`);

  /*
   * THE REGRESSION. Under the old casing rule these three were headings: they are short, Arabic,
   * bulletless. Named individually because "the count is right" would pass with the wrong lines.
   */
  const asBody = (needle) => {
    const hit = plan.find((l) => l.text.includes(needle));
    return hit ? hit.role === "body" : false;
  };
  ok("a short Arabic skills line is body text", asBody("نظام أرشفة الصور"));
  ok("an Arabic language line is body text", asBody("العربية (اللغة الأم)"));
  ok("an Arabic education line is body text", asBody("بكالوريوس"));

  /* Direction, on both levels, for every Arabic line. */
  const arabicLines = plan.filter((l) => l.text && hasArabic(l.text));
  ok("every Arabic line runs right-to-left", arabicLines.every((l) => l.rtl && l.align === "right"));
  ok("and there is at least one", arabicLines.length > 5, `${arabicLines.length}`);

  /* Mixed script: an Arabic line carrying a Latin term is still an Arabic line. Getting this
     wrong is what puts "(CT)" at the wrong end of the sentence. */
  const mixed = plan.find((l) => l.text.includes("(CT)"));
  ok("a line mixing Arabic and a Latin term exists in the fixture", Boolean(mixed));
  ok("and it is treated as right-to-left", Boolean(mixed?.rtl));
  ok("with the Latin term left intact", mixed?.text.includes("(CT)"));
}

/* ── the English Word plan is unaffected ── */

{
  const plan = docxPlan(assembleResume(profile(false), false));
  const heads = plan.filter((l) => l.role === "heading").map((l) => l.text);
  ok("English headings are still detected", heads.includes("SKILLS") && heads.includes("WORK EXPERIENCE"), heads.join(" · "));
  ok("English lines run left-to-right", plan.filter((l) => l.text).every((l) => !l.rtl && l.align === "left"));
  ok("and a mixed English line with an Arabic name would flip to RTL",
    docxPlan("Ali · علي").every((l) => l.rtl));
}

/* ── blank lines survive, so the Word file keeps the plain file's spacing ── */
{
  const plan = docxPlan("A\n\nB");
  ok("a blank line stays a blank line", plan.length === 3 && plan[1].role === "blank");
}

/* ── the Arabic heading list has no duplicates and no stray whitespace ── */
{
  ok("no duplicate Arabic headings", new Set(HEADINGS_AR).size === HEADINGS_AR.length);
  ok("and none carry stray spaces", HEADINGS_AR.every((h) => h === h.trim()));
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
