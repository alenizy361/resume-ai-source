/**
 * The ATS-parseable PDF, rendered from one implementation that runs on the server AND in the browser.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS MOVED OUT OF THE BUTTON
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * This layout used to live inside `PdfExport`'s click handler, which meant the watermark was decided
 * by a React prop. On `/optimize` that prop came from `watermarkFromResponse(result)`, and `result`
 * is rehydrated from `localStorage` — so editing one boolean in devtools produced a clean, unmarked
 * PDF with no server call at all. That is the freemium model being opt-out.
 *
 * jsPDF runs perfectly well in Node — measured, including `getTextWidth` and rotated text, which are
 * the two things this layout depends on — so the render can happen on the server, where the watermark
 * is decided by the server's own entitlement check and the client has no say in it.
 *
 * The function is shared rather than duplicated because the client still needs it: when the export
 * route is unreachable, `PdfExport` renders locally and passes `watermark: true`. One renderer, two
 * invocation sites, and only one of them is ever allowed to decide the mark.
 *
 * ── Arabic ──
 *
 * jsPDF's built-in fonts cannot shape Arabic; the output is mojibake. That is a property of the
 * renderer, so the refusal belongs here rather than in a caller who might forget — `pdfRefusesArabic`
 * is exported so the button can say so before a round trip.
 */

import { hasArabic } from "./cvHeadings.ts";

/** True when this text cannot be rendered as a text PDF. See the note on Arabic above. */
export const pdfRefusesArabic = (text: string): boolean => hasArabic(text);

export interface PdfOptions {
  /** Stamp the free-tier mark. Decided by the server; the client fallback always passes `true`. */
  watermark: boolean;
  /** Interface language, for the footer wording only. The glyphs stay Latin — see below. */
  lang?: "ar" | "en";
}

/**
 * Lay the CV out and return the PDF bytes.
 *
 * Returns bytes rather than saving, so the caller decides whether they become a download, a
 * response body, or a test assertion. That is also what makes the layout testable at all: it was
 * previously unreachable behind a click handler and a `doc.save()`.
 */
export async function renderPdf(text: string, opts: PdfOptions): Promise<Uint8Array<ArrayBuffer>> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const M = 16;            // side margin, mm
  const W = 210 - M * 2;   // usable width
  const BOTTOM = 281;      // page-break threshold
  let y = 18;

  const pageBreak = (needed: number) => {
    if (y + needed > BOTTOM) { doc.addPage(); y = 18; }
  };

  /*
   * `splitTextToSize` only wraps on spaces, so one very long token — the email or URL in a contact
   * line — runs off the page. Wrap word by word and hard-break any token wider than the column.
   * Assumes the caller has already set the font and size, because measurement depends on both.
   */
  const wrapBreaking = (s: string, maxW: number): string[] => {
    const out: string[] = [];
    let cur = "";
    for (const word of s.split(/\s+/).filter(Boolean)) {
      const cand = cur ? `${cur} ${word}` : word;
      if (doc.getTextWidth(cand) <= maxW) { cur = cand; continue; }
      if (cur) { out.push(cur); cur = ""; }
      if (doc.getTextWidth(word) <= maxW) { cur = word; continue; }
      let chunk = "";
      for (const ch of word) {
        if (chunk && doc.getTextWidth(chunk + ch) > maxW) { out.push(chunk); chunk = ch; }
        else chunk += ch;
      }
      cur = chunk;
    }
    if (cur) out.push(cur);
    return out.length ? out : [""];
  };

  const lines = text.split("\n");
  let first = true;
  let second = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { y += 2.2; continue; }

    const isHeading =
      /^[A-Z][A-Z &/]{2,40}$/.test(line) ||
      /^(PROFESSIONAL SUMMARY|SKILLS|EXPERIENCE|EDUCATION|CERTIFICATIONS|PROJECTS|LANGUAGES)\b/i.test(line);

    if (first) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(19);
      const wrapped = doc.splitTextToSize(line, W);
      pageBreak(wrapped.length * 8);
      doc.text(wrapped, M, y);
      y += wrapped.length * 8 + 1;
      first = false;
      second = true;
      continue;
    }
    if (second && !isHeading) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(90);
      const wrapped = wrapBreaking(line, W);
      pageBreak(wrapped.length * 4.5);
      doc.text(wrapped, M, y);
      y += wrapped.length * 4.5 + 1.5;
      doc.setTextColor(20);
      second = false;
      continue;
    }
    second = false;

    if (isHeading) {
      y += 3;
      pageBreak(9);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11.5);
      doc.setTextColor(20);
      doc.text(line.toUpperCase(), M, y);
      y += 1.6;
      doc.setDrawColor(30);
      doc.setLineWidth(0.35);
      doc.line(M, y, 210 - M, y);
      y += 4.6;
      continue;
    }

    const isBullet = /^[-•*]/.test(line);
    const content = isBullet ? line.replace(/^[-•*]\s*/, "") : line;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.2);
    doc.setTextColor(25);
    const indent = isBullet ? 5 : 0;
    const wrapped = doc.splitTextToSize(content, W - indent);
    pageBreak(wrapped.length * 4.8);
    if (isBullet) doc.text("•", M + 1, y);
    doc.text(wrapped, M + indent, y);
    y += wrapped.length * 4.8 + 0.8;
  }

  if (opts.watermark) {
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(150);
      /* helvetica cannot render Arabic glyphs, so the footer stays Latin whatever the interface
         language — the mark is the domain either way, and boxes would be worse than English. */
      doc.text(opts.lang === "ar" ? "cv.rabit.sa - free version" : "Created free with cv.rabit.sa",
        105, 290, { align: "center" });
      doc.setTextColor(232);
      doc.setFontSize(46);
      try {
        doc.text("cv.rabit.sa", 105, 160, { align: "center", angle: 32 } as Parameters<typeof doc.text>[3]);
      } catch { /* angle unsupported in some builds — the footer alone is still a mark */ }
      doc.setTextColor(20);
    }
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
