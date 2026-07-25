/**
 * The Word document, decided here and merely assembled in `DocxExport`.
 *
 * ── why the decisions left the component ──
 *
 * The Word file is not a nice-to-have in this product: for an Arabic CV it is the ONLY download,
 * because the plain PDF path cannot shape Arabic and the designed PDF is a raster image no ATS can
 * read. Every judgement it makes — what is a heading, which way a line runs — therefore decides what
 * an Arabic user actually sends to an employer, and none of it was testable while it lived inside a
 * `.tsx` file behind a click handler.
 *
 * Two bugs were sitting in there:
 *
 *   · every short Arabic line became a bold heading, because "is this a heading" was a casing test
 *     and Arabic has no case (see `cvHeadings.ts`)
 *   · Arabic paragraphs set `bidirectional` but their runs never set `rightToLeft`, so Word was told
 *     the paragraph runs right-to-left and the text inside it does not. That is exactly the mix that
 *     puts a trailing "(CT)" or a phone number on the wrong end of an Arabic line — the product's
 *     own glossary writes "التصوير المقطعي المحوسب (CT)", so this is the normal case here, not an
 *     exotic one.
 *
 * This returns a plain description. `ops/export.test.mjs` asserts the description; `DocxExport` maps
 * it to `docx` objects and does nothing else.
 */

import { hasArabic, isHeading } from "./cvHeadings.ts";

export interface DocxLine {
  text: string;
  /** "name" is the first non-empty line; the rest is what `isHeading` says. */
  role: "name" | "heading" | "body" | "blank";
  bold: boolean;
  /** Half-points, the unit `docx` uses. 32 = 16pt. */
  size: number;
  align: "left" | "right";
  /** Paragraph direction (`w:bidi`) and run direction (`w:rtl`) — both, or neither. */
  rtl: boolean;
}

/**
 * One entry per input line, blanks included, so the caller can map straight through and the spacing
 * of the plain-text CV survives into Word.
 */
export function docxPlan(text: string): DocxLine[] {
  const lines = text.replace(/\r/g, "").split("\n");
  let nameUsed = false;

  return lines.map((raw) => {
    const line = raw.trimEnd();
    if (!line.trim()) return { text: "", role: "blank" as const, bold: false, size: 22, align: "left" as const, rtl: false };

    /*
     * Direction is decided per LINE from its own content, not from the document's language.
     *
     * A bilingual CV is the ordinary case in this market — an Arabic summary above an English
     * credential list — and forcing one direction on the whole file is how the English lines end up
     * reversed. A line with any Arabic in it runs right-to-left; the neutral characters around a
     * Latin term then resolve on the Arabic side, which is where "(CT)" belongs.
     */
    const rtl = hasArabic(line);
    const align = rtl ? ("right" as const) : ("left" as const);

    if (!nameUsed) {
      nameUsed = true;
      return { text: line.trim(), role: "name" as const, bold: true, size: 32, align, rtl };
    }
    if (isHeading(line)) {
      return { text: line.trim().replace(/:$/, ""), role: "heading" as const, bold: true, size: 24, align, rtl };
    }
    return { text: line, role: "body" as const, bold: false, size: 22, align, rtl };
  });
}
