"use client";
import { useState } from "react";
import { pdfRefusesArabic, renderPdf } from "@/app/lib/renderPdf";

/**
 * The ATS-parseable PDF download.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE `watermark` PROP IS GONE, AND THAT IS THE POINT
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * This component used to take `watermark: boolean` and stamp accordingly. On `/optimize` the value
 * came from `watermarkFromResponse(result)` and `result` is rehydrated from `localStorage` — so one
 * edited boolean produced a clean file with no server call. The free tier applied itself.
 *
 * The bytes now come from `POST /api/export`, which decides the mark from the request's own signed
 * cookies and refuses to read a `watermark` field at all. A caller cannot ask for a clean file, and
 * this component has no way to express the request even by accident, because the prop no longer
 * exists.
 *
 * ── the fallback, and why it is safe ──
 *
 * If the route is unreachable — offline, or a blip — the file is still produced, locally, through the
 * SAME renderer, with `watermark: true` unconditionally. A paying customer offline gets a marked file,
 * which is the documented fail-closed rule and a support email at worst; the alternative is a download
 * button that stops working on a train. What the fallback can never do is produce a clean file.
 */
export default function PdfExport({
  text, label = "↓ Download PDF", lang = "en",
}: {
  text: string;
  label?: string;
  lang?: "en" | "ar";
}) {
  const [busy, setBusy] = useState(false);

  const save = (bytes: BlobPart, name: string) => {
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  async function exportPdf() {
    /*
     * Refused before the round trip. jsPDF's built-in fonts cannot shape Arabic, so the file would be
     * mojibake — and telling the user that instantly beats telling them after a request.
     */
    if (pdfRefusesArabic(text)) {
      alert(
        "⚠ النص يحتوي كلمات عربية والـPDF النصي يدعم الإنجليزية فقط — استخدم تنزيل Word أو الـPDF المصمّم.\n\n" +
        "This text contains Arabic, which the text PDF cannot render. Use the Word download or the designed PDF."
      );
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: "pdf", text, lang }),
      });
      if (!res.ok) throw new Error(`export ${res.status}`);
      save(await res.arrayBuffer(), "resume.pdf");
    } catch (e) {
      console.error("PDF export via the server failed, rendering locally:", e);
      try {
        /* Watermarked unconditionally. This path cannot know whether the visitor has paid, and
           guessing in the generous direction is the one outcome that costs money. */
        save(await renderPdf(text, { watermark: true, lang }), "resume.pdf");
      } catch (e2) {
        console.error("PDF export failed:", e2);
        alert("Couldn't generate the PDF — please try the .txt download instead.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button onClick={exportPdf} disabled={busy} className="rounded-lg px-4 py-2 text-sm font-semibold t-tap disabled:opacity-60"
      style={{ background: "var(--accent)", color: "#ffffff" }}>
      {busy ? "…" : label}
    </button>
  );
}
