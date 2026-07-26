/**
 * The Word file, rendered from one implementation that runs on the server AND in the browser.
 *
 * The companion to `renderPdf`, and the more important of the two for this market: an Arabic CV gets
 * Word and the designed PDF, because a text PDF cannot shape Arabic — so for a large share of users
 * this file IS the download, and its watermark is the entire free tier.
 *
 * It moved out of `DocxExport`'s click handler for the same reason: the mark was a React prop, and on
 * `/optimize` that prop was read back from `localStorage`, where anyone could edit it.
 *
 * Every judgement about the document still belongs to `docxPlan` — what the name is, what a heading
 * is, which way each line runs. This maps the plan to `docx` objects and stamps the footer, and
 * nothing more. That separation is why the Arabic heading bug was findable: the old test for a
 * heading was `line === line.toUpperCase()`, which is true of ALL Arabic, so an Arabic CV came out of
 * Word with its city and half its skills set as bold section headings.
 */

import { docxPlan } from "./docxPlan.ts";
import { hasArabic } from "./cvHeadings.ts";

export interface DocxOptions {
  /** Stamp the free-tier footer. Decided by the server; the client fallback always passes `true`. */
  watermark: boolean;
  /** Interface language, for the footer wording. */
  lang?: "ar" | "en";
}

export async function renderDocx(text: string, opts: DocxOptions): Promise<Uint8Array<ArrayBuffer>> {
  const { Document, Packer, Paragraph, TextRun, AlignmentType, Footer } = await import("docx");
  const arabicDoc = hasArabic(text);

  const paragraphs = docxPlan(text).map((l) => {
    if (l.role === "blank") return new Paragraph({ text: "" });
    return new Paragraph({
      alignment: l.align === "right" ? AlignmentType.RIGHT : AlignmentType.LEFT,
      /* Both, always together: `bidirectional` sets the paragraph's direction and `rightToLeft` the
         run's. Setting only the first leaves a trailing "(CT)" or a phone number on the wrong end. */
      bidirectional: l.rtl,
      ...(l.role === "heading" ? { spacing: { before: 200, after: 80 } } : {}),
      children: [new TextRun({ text: l.text, bold: l.bold, size: l.size, rightToLeft: l.rtl })],
    });
  });

  const footers = opts.watermark
    ? {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({
              text: opts.lang === "ar" ? "أُنشئت مجاناً عبر cv.rabit.sa" : "Created free with cv.rabit.sa",
              size: 14, color: "9AA0A6",
              /* The footer follows the INTERFACE language, so an Arabic footer needs the RTL run
                 flag or Word lays the sentence out backwards under an otherwise correct CV. */
              rightToLeft: opts.lang === "ar",
            })],
          })],
        }),
      }
    : undefined;

  const doc = new Document({
    styles: { default: { document: { run: { font: arabicDoc ? "Arial" : "Calibri" } } } },
    sections: [{ properties: {}, children: paragraphs, ...(footers ? { footers } : {}) }],
  });

  /*
   * `toBuffer` rather than `toBlob`: `Blob` is a browser type and this runs on the server too.
   * The bytes are the same either way, and a caller that wants a Blob can wrap them.
   */
  const buf = await Packer.toBuffer(doc);
  /*
   * Copied into a freshly allocated buffer rather than returned as-is. `Packer.toBuffer` gives a Node
   * `Buffer`, whose backing store is typed `ArrayBufferLike` — which `Blob` will not accept, because
   * it could in principle be a `SharedArrayBuffer`. One copy of a CV-sized document is free, and it
   * lets both callers hand the bytes straight to a `Blob` or a response body.
   */
  const out = new Uint8Array(buf.byteLength);
  out.set(buf);
  return out;
}
