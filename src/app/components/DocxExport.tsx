"use client";
import { useState } from "react";
import { renderDocx } from "@/app/lib/renderDocx";

/**
 * The Word (.docx) download.
 *
 * A competitive gap against StylingCV/Enhancv and heavily requested in the Gulf, where employers ask
 * for an editable file. It is also the Arabic-safe path: `docx` shapes Arabic correctly and the text
 * PDF cannot, so for a large share of this product's users THIS file is the download — which is what
 * makes its watermark the whole of the free tier rather than a detail.
 *
 * ── the `watermark` prop is gone, deliberately ──
 *
 * It used to take one, and on `/optimize` the value was read back from `localStorage`: one edited
 * boolean produced an unmarked Word file with no server call. The bytes now come from
 * `POST /api/export`, which decides the mark from the request's own signed cookies and does not read
 * a `watermark` field. See `app/api/export/route.ts`.
 *
 * The local fallback (route unreachable) renders through the same `renderDocx` with `watermark: true`
 * unconditionally — a download that still works offline, and that cannot produce a clean file.
 */
export default function DocxExport({
  text, label = "↓ Word (.docx)", filename = "resume.docx", lang = "en",
}: {
  text: string;
  label?: string;
  filename?: string;
  lang?: "en" | "ar";
}) {
  const [busy, setBusy] = useState(false);

  const save = (bytes: BlobPart) => {
    const url = URL.createObjectURL(new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  async function exportDocx() {
    setBusy(true);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: "docx", text, lang, filename }),
      });
      /* A 4xx is the server's considered answer — surfaced, not worked around. Falling back would
         turn a rate-limit refusal into a silently watermarked file for a paying customer. See the
         longer note in `PdfExport`. */
      if (res.status >= 400 && res.status < 500) {
        const why = await res.json().catch(() => ({}));
        alert(String(why?.error || "تعذّر التنزيل — حاول بعد قليل.\nThat download was refused — please try again in a moment."));
        return;
      }
      if (!res.ok) throw new Error(`export ${res.status}`);
      save(await res.arrayBuffer());
    } catch (e) {
      console.error("Word export via the server failed, rendering locally:", e);
      try {
        save(await renderDocx(text, { watermark: true, lang }));
      } catch (e2) {
        console.error("Word export failed:", e2);
        alert("تعذّر إنشاء ملف Word — حاول مرة أخرى.\nCouldn't generate the Word file — please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={exportDocx}
      disabled={busy}
      className="rounded-lg px-4 py-2 text-sm font-semibold t-tap disabled:opacity-50"
      style={{ background: "rgba(139,92,246,0.12)", color: "var(--accent-deep)", border: "1px solid rgba(139,92,246,0.3)" }}
    >
      {busy ? "…" : label}
    </button>
  );
}
