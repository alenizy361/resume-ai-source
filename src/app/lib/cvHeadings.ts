/**
 * What counts as a section heading in a plain-text CV — one answer, for every reader of that text.
 *
 * ── why this is a library now ──
 *
 * Three things parse the same string. `ResumeTemplate` lays it out as a designed page, `DocxExport`
 * turns it into Word paragraphs, and the ATS review reads it back. Each had its own idea of a
 * heading, and the Word one was a casing test:
 *
 *     line === line.toUpperCase()
 *
 * which is a fact about LATIN text. Arabic has no case, so every Arabic line equals its own
 * uppercase — and any Arabic line under forty characters was exported to Word as a bold section
 * heading. "الرياض، المملكة العربية السعودية" became a heading. So did every short skill line. The
 * Arabic Word file is the ONLY download an Arabic CV gets, which is what makes that the worst place
 * in the product for a Latin-shaped assumption.
 *
 * ── the lists are not the contract; `assembleResume` is ──
 *
 * `ops/export.test.mjs` builds a filled profile in each language, runs `assembleResume`, and asserts
 * that every heading it emitted is recognised here. That is what catches the real drift: two Arabic
 * headings this product has been writing for months — "الشهادات والتدريب" and "إضافات" — were absent
 * from the hand-maintained list and rendered as body text.
 */

/** Latin headings, matched case-insensitively. */
export const HEADINGS_EN = [
  "PROFESSIONAL SUMMARY", "SUMMARY", "PROFILE", "OBJECTIVE",
  "SKILLS", "CORE SKILLS", "TECHNICAL SKILLS",
  "EXPERIENCE", "WORK EXPERIENCE", "PROFESSIONAL EXPERIENCE", "EMPLOYMENT HISTORY",
  "EDUCATION", "CERTIFICATIONS", "CERTIFICATES", "CERTIFICATIONS & TRAINING",
  "LANGUAGES", "PROJECTS", "ADDITIONAL",
  "PERSONAL DETAILS", "PERSONAL INFORMATION", "ACHIEVEMENTS", "AWARDS", "REFERENCES",
];

/**
 * Arabic section headings (Modern Standard Arabic), so an RTL or bilingual CV parses into the same
 * sections as an English one.
 *
 * Every heading `assembleResume` can write is in here; the rest are the common variants a user's
 * uploaded CV arrives with.
 */
export const HEADINGS_AR = [
  "الملخص المهني", "الملخص", "نبذة", "الهدف الوظيفي",
  "المهارات", "المهارات الأساسية", "المهارات التقنية",
  "الخبرة", "الخبرة العملية", "الخبرات", "التاريخ الوظيفي",
  "التعليم", "المؤهلات", "الشهادات", "الشهادات والتدريب", "اللغات", "المشاريع",
  "إضافات", "معلومات إضافية",
  "البيانات الشخصية", "المعلومات الشخصية", "الإنجازات", "الجوائز", "المراجع",
];

/**
 * The Arabic character range, written ONCE.
 *
 * Five blocks: U+0600–06FF (Arabic), U+0750–077F (Supplement), U+08A0–08FF (Extended-A), and the two
 * presentation-form blocks U+FB50–FDFF / U+FE70–FEFF. The last two matter more than their names
 * suggest: `importCv.ts` documents that some PDF producers emit Arabic as pre-shaped presentation-form
 * glyphs rather than the standard block, and normalizes them away on import with NFKC. Detection here
 * runs on text this codebase does NOT control the origin of — pasted into `/optimize`, typed into the
 * builder, copied from somewhere that never went through that normalization — so a presentation-form
 * CV reached `hasArabic` as an apparently-Latin string. The failure mode was the exact one this file's
 * header warns about: jsPDF rendering it as mojibake with no refusal, because `pdfRefusesArabic`
 * (`renderPdf.ts`) answered false.
 *
 * One constant for both functions below, so a presence test and a majority test cannot disagree about
 * the same character — that disagreement is itself a bug class, on a mixed-script CV, which in this
 * market is most of them.
 */
/*
 * Each segment is one Unicode block, generated from its numeric boundaries and byte-compared against
 * this literal before it was pasted in — a hand-typed run of presentation-form glyphs is exactly the
 * kind of text a diff and a font both render ambiguously. `ops/cvheadings.test.mjs` re-derives the
 * same string from the codepoints on every run, so a future edit that mistypes a boundary fails loudly
 * instead of silently narrowing the range the way the first draft of this line did (it dropped
 * FC00–FD3F from Presentation Forms-A by transcribing visually instead of by codepoint).
 */
const ARABIC_RANGE =
  "؀-ۿ" +  // U+0600–06FF  Arabic
  "ݐ-ݿ" +  // U+0750–077F  Arabic Supplement
  "ࢠ-ࣿ" +  // U+08A0–08FF  Arabic Extended-A
  "ﭐ-﷿" +  // U+FB50–FDFF  Arabic Presentation Forms-A
  "ﹰ-﻿";   // U+FE70–FEFF  Arabic Presentation Forms-B

/*
 * PUNCTUATION IS NOT A SCRIPT.
 *
 * These live inside the U+0600–06FF block but are marks, not letters — Unicode itself classes the
 * comma, semicolon and question mark as shared punctuation rather than Arabic script. A string
 * whose only "Arabic" is one of them is not an Arabic string.
 *
 * That distinction was worth real money. The builder joined confirmed skills with `، ` regardless
 * of CV language, so an all-English CV came out as "General X-ray، Computed Tomography" — and
 * `hasArabic` said yes, and `pdfRefusesArabic` said yes, and the design step REMOVED the plain
 * ATS PDF download and printed "an Arabic CV downloads as Word" over a CV with no Arabic in it.
 * Two skills was the whole trigger; one skill needs no separator, so the defect appeared at the
 * third click and looked like nothing to do with skills.
 *
 * The join is fixed at the source (`builderDoc.confirmItem`, `builderState.removeSkill`), but every
 * CV already stored in a browser still carries the Arabic comma. Fixing the detector is what makes
 * those whole again without a migration.
 */
const ARABIC_MARKS = /[،؛؟٪-٭۔]/g;

/** Anything with Arabic letters in it. */
export function hasArabic(s: string): boolean {
  return new RegExp(`[${ARABIC_RANGE}]`).test(s.replace(ARABIC_MARKS, ""));
}

/**
 * Which script this text is mostly written in.
 *
 * `hasArabic` answers "is there any", which is the right question for "does jsPDF have to be
 * avoided" and the WRONG one for "what language is this document". A Saudi applicant's English CV
 * routinely carries an Arabic name, an Arabic employer or an Arabic city, and a presence test calls
 * that document Arabic — then a model is asked for Arabic interview questions about an English CV.
 *
 * Counting letters rather than looking for one is the whole difference. Ties and empty text answer
 * `en`, matching the product's own default everywhere else.
 */
export function dominantScript(s: string): "ar" | "en" {
  const arabic = (s.match(new RegExp(`[${ARABIC_RANGE}]`, "g")) || []).length;
  const latin = (s.match(/[A-Za-z]/g) || []).length;
  return arabic > latin ? "ar" : "en";
}

export function isHeading(line: string): boolean {
  // Bilingual headings look like "EXPERIENCE · الخبرة" — test each side.
  const parts = line.split(/[·|/–—-]/).map((p) => p.trim()).filter(Boolean);
  const candidates = parts.length > 1 ? [line.trim(), ...parts] : [line.trim()];
  for (const c of candidates) {
    const t = c.replace(/:$/, "").trim();
    if (t.length > 42) continue;
    if (HEADINGS_EN.includes(t.toUpperCase())) return true;
    if (HEADINGS_AR.includes(t)) return true;
    /*
     * A short ALL-CAPS Latin line with no bullet or email is a heading.
     *
     * Guarded to Latin deliberately. The same shape written for "text with no lowercase" would
     * match every Arabic line in the document, which is the bug this file was extracted to fix.
     */
    if (/^[A-Z][A-Z &/]{2,38}$/.test(t) && !t.includes("@")) return true;
  }
  return false;
}
