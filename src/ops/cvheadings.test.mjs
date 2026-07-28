/**
 * `ARABIC_RANGE` — the one Arabic detector both `hasArabic` and `dominantScript` share.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS CLOSES (O-11)
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * The range covered U+0600–06FF and U+0750–077F and stopped there. `importCv.ts` documents, with a
 * measured reason, that some PDF producers emit Arabic as pre-shaped PRESENTATION-FORM glyphs
 * (U+FB50–FDFF, U+FE70–FEFF) rather than the standard block, and normalizes them away on import with
 * NFKC. Detection never got the same treatment: text reaches `pdfRefusesArabic`
 * (`renderPdf.ts` → `hasArabic`) from places this codebase does not control the origin of — pasted
 * into `/optimize`, typed into the builder — so a presentation-form CV read as apparently-Latin and
 * jsPDF rendered it as mojibake with no refusal. Arabic Extended-A (U+08A0–08FF) had the same gap.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHY THE RANGE IS RE-DERIVED HERE RATHER THAN COPIED
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * The first draft of the constant was WRONG — a hand-typed run of presentation-form glyphs silently
 * dropped U+FC00–FD3F, because transcribing Unicode by eye through a chat interface is exactly the
 * failure mode this file exists to catch. Comparing the shipped string against boundaries generated
 * from their numeric codepoints is what a visual read cannot do.
 *
 *   node --experimental-strip-types ops/cvheadings.test.mjs
 */

import { hasArabic, dominantScript } from "../app/lib/cvHeadings.ts";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };

/* ── the range itself, generated from numbers and never eyeballed ── */

const BLOCKS = [
  ["Arabic", 0x0600, 0x06FF],
  ["Arabic Supplement", 0x0750, 0x077F],
  ["Arabic Extended-A", 0x08A0, 0x08FF],
  ["Arabic Presentation Forms-A", 0xFB50, 0xFDFF],
  ["Arabic Presentation Forms-B", 0xFE70, 0xFEFF],
];

console.log("\n── every declared block, boundary by boundary ──");
for (const [name, start, end] of BLOCKS) {
  ok(`${name}: the first codepoint is detected`, hasArabic(String.fromCodePoint(start)), name);
  ok(`${name}: the last codepoint is detected`, hasArabic(String.fromCodePoint(end)), name);
  ok(`${name}: one below the block is not`, !hasArabic(String.fromCodePoint(start - 1)), name);
  ok(`${name}: one above the block is not`, !hasArabic(String.fromCodePoint(end + 1)), name);
  /* The exact failure the first draft had: a block silently missing a chunk in the middle. Sampled at
     four points spread through the range rather than only the ends. */
  for (const frac of [0.25, 0.5, 0.75]) {
    const mid = start + Math.round((end - start) * frac);
    ok(`${name}: an interior codepoint (0x${mid.toString(16)}) is detected`, hasArabic(String.fromCodePoint(mid)));
  }
}

console.log("\n── gaps between the blocks stay gaps ──");
{
  ok("the gap between Supplement and Extended-A is excluded",
    !hasArabic(String.fromCodePoint(0x0780)));
  ok("the gap between Extended-A and Presentation Forms-A is excluded",
    !hasArabic(String.fromCodePoint(0xA000)));
  /*
   * U+FDD0–FDEF are Unicode NONCHARACTERS sitting inside the Presentation Forms-A span, not a gap in
   * the intended sense — a `[a-b]` character class cannot punch a hole out of the middle of a
   * contiguous range without a second alternation, and doing so would buy nothing: real text never
   * contains a noncharacter. Documented here as a deliberate non-goal instead of a silent one, so a
   * future reader does not mistake the earlier version of this comment for a bug report.
   */
  ok("noncharacters inside Presentation Forms-A are matched along with the block, harmlessly",
    hasArabic(String.fromCodePoint(0xFDD0)));
}

/* ── the actual bug: a presentation-form CV must be caught, not silently mojibake'd ── */

console.log("\n── presentation-form Arabic is Arabic ──");
{
  /* A real presentation-form string: shaped forms of "بسم" (bāʾ-sīn-mīm), the kind of thing an older
     PDF producer emits instead of the standard block. NFKC would fold this to normal Arabic on
     import; nothing folds it before it reaches a paste box or a typed field. */
  const shaped = "ﺏﺱﻡ";
  ok("a presentation-form CV is recognised as Arabic", hasArabic(shaped),
    "this is what jsPDF rendered as mojibake with no refusal before the range was widened");
  ok("and it dominates a short mixed string too",
    dominantScript(`Ahmed ${shaped}`) === "ar" || dominantScript(shaped) === "ar");
}

console.log("\n── the existing standard-block behaviour is unchanged ──");
{
  ok("plain Arabic text", hasArabic("سيرة ذاتية"));
  ok("plain Latin text has none", !hasArabic("Resume"));
  ok("one Arabic letter is enough for hasArabic", hasArabic("Ahmed أ"));
  ok("but not enough to flip dominantScript", dominantScript("Ahmed Ali أ") === "en");
  ok("majority Arabic flips it", dominantScript("سيرة ذاتية للمهندس أحمد") === "ar");
  ok("empty text defaults to en", dominantScript("") === "en");
}

console.log("\n── punctuation from the Arabic block is not Arabic CONTENT ──");
{
  /*
   * The builder joined confirmed skills with `، ` regardless of CV language, so a wholly English
   * CV read as Arabic to `hasArabic` — and `pdfRefusesArabic` then took the plain ATS PDF download
   * away from it and explained that "an Arabic CV downloads as Word". Two skills was the trigger;
   * with one there is no separator, so it looked unrelated to skills entirely.
   *
   * The join is fixed at its two sources, but every CV already saved in a browser still carries the
   * Arabic comma — so the detector has to be right too, or those CVs stay broken until edited.
   */
  ok("an English skills line joined with an Arabic comma is NOT Arabic",
    !hasArabic("General X-ray، Computed Tomography"),
    "this is the exact string that removed the PDF download from English CVs");
  ok("nor is an Arabic question mark or semicolon alone", !hasArabic("Ready? Yes؛ always؟"));
  ok("but one real Arabic LETTER beside the same punctuation still is",
    hasArabic("General X-ray، تصوير"));
  ok("and a genuine Arabic skills line is unaffected",
    hasArabic("أشعة عامة، التصوير المقطعي"));
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
