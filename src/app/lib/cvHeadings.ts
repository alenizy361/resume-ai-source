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

/** Anything with Arabic letters in it. */
export function hasArabic(s: string): boolean {
  return /[؀-ۿݐ-ݿ]/.test(s);
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
