"use client";
import { useState } from "react";
import { docxPlan } from "@/app/lib/docxPlan";
import { hasArabic } from "@/app/lib/cvHeadings";

/**
 * Real .docx (Microsoft Word) export from the plain-text CV — a competitive
 * gap vs StylingCV/Enhancv, and heavily requested in the Gulf where employers
 * ask for an editable Word file. Unlike our jsPDF export, docx renders Arabic
 * correctly (RTL-aware), so this doubles as the Arabic-safe download path.
 * Client-side via the `docx` library (dynamic import → no SSR weight).
 */
export default function DocxExport({ text, label = "↓ Word (.docx)", filename = "resume.docx", watermark = false, lang = "en" }: { text: string; label?: string; filename?: string; watermark?: boolean; lang?: "en" | "ar" }) {
  const [busy, setBusy] = useState(false);

  async function exportDocx() {
    setBusy(true);
    try {
      const { Document, Packer, Paragraph, TextRun, AlignmentType, Footer } = await import("docx");
      const arabicDoc = hasArabic(text);

      /*
       * Every judgement about the document is made by `docxPlan` — what the name is, what a heading
       * is, which way each line runs. This maps it, and nothing more.
       *
       * It used to decide those things here, and could not be tested behind a click handler: the
       * heading test was `line === line.toUpperCase()`, which is true of ALL Arabic, so an Arabic CV
       * came out of Word with its city and half its skills set as bold section headings. That file
       * is the only download an Arabic CV gets.
       */
      const paragraphs = docxPlan(text).map((l) => {
        if (l.role === "blank") return new Paragraph({ text: "" });
        return new Paragraph({
          alignment: l.align === "right" ? AlignmentType.RIGHT : AlignmentType.LEFT,
          // Both, always together: `bidirectional` sets the paragraph's direction and `rightToLeft`
          // the run's. Setting only the first is what leaves a trailing "(CT)" or a phone number on
          // the wrong end of an Arabic line.
          bidirectional: l.rtl,
          ...(l.role === "heading" ? { spacing: { before: 200, after: 80 } } : {}),
          children: [new TextRun({ text: l.text, bold: l.bold, size: l.size, rightToLeft: l.rtl })],
        });
      });

      // Free downloads carry a subtle footer watermark; paying removes it.
      const footers = watermark
        ? {
            default: new Footer({
              children: [new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: lang === "ar" ? "أُنشئت مجاناً عبر cv.rabit.sa" : "Created free with cv.rabit.sa", size: 14, color: "9AA0A6" })],
              })],
            }),
          }
        : undefined;

      const doc = new Document({
        styles: { default: { document: { run: { font: arabicDoc ? "Arial" : "Calibri" } } } },
        sections: [{ properties: {}, children: paragraphs, ...(footers ? { footers } : {}) }],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("تعذّر إنشاء ملف Word — حاول مرة أخرى.\nCouldn't generate the Word file — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={exportDocx}
      disabled={busy}
      className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
      style={{ background: "rgba(139,92,246,0.12)", color: "var(--accent)", border: "1px solid rgba(139,92,246,0.3)" }}
    >
      {busy ? "…" : label}
    </button>
  );
}
