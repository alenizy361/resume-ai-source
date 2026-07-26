/**
 * The download, generated on the server — so the watermark is not the client's decision.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE GAP THIS CLOSES
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * Every file this product hands out was built in the browser from a `watermark` prop. On `/optimize`
 * that prop came from `watermarkFromResponse(result)`, and `result` is persisted to `localStorage` and
 * rehydrated on load — so editing one boolean in devtools produced a clean, unmarked PDF and Word
 * file with no server call whatsoever. The paywall was advisory: the free tier applied itself.
 *
 * An earlier fix (F-4) closed the case where the DESIGNED PDF shipped unmarked by accident. It did
 * not make the paywall enforceable, and said so.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHAT MAKES THIS ENFORCEMENT RATHER THAN A BETTER SUGGESTION
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * 1. **The request cannot ask for a clean file.** There is no `watermark` field in the body, and if
 *    one is sent it is ignored — `paidRequest(req)` is the only input to that decision, read from
 *    signed cookies and the entitlement store. A client that wants an unmarked file has to actually
 *    hold access.
 *
 * 2. **The bytes come from here.** Patching the page cannot remove a mark that was stamped before the
 *    response left the server.
 *
 * 3. **It fails closed.** Any doubt — no cookies, an unreadable session, a store that throws — is
 *    "not paid", so the file is marked. An unpaid visitor handed a clean CV is revenue that never
 *    arrives, and an outage must not be able to choose that outcome.
 *
 * ── the text still comes from the client, and that is fine ──
 *
 * The CV text is the user's own content and they already hold it; sending it here proves nothing and
 * grants nothing. What was never safe to accept from the client is the ENTITLEMENT, and that is the
 * one thing this route refuses to take.
 *
 * Nothing is stored. The bytes are rendered, returned, and dropped — the same handling `/api/extract`
 * and `/api/optimize` already give the text they receive, and no change to the storage promise.
 *
 * ── what remains client-side, stated rather than glossed ──
 *
 * The DESIGNED PDF — the one that looks like a template rather than a text document — is rasterised
 * by html2canvas from a live DOM node, so it cannot be produced without a browser. It stays in
 * `ResumeTemplate`, and its mark comes from `useEntitlement()` + `shouldShowWatermark()`, which is
 * already a server-backed answer (`/api/auth/me`) rather than a rehydrated localStorage boolean.
 *
 * This route deliberately does NOT expose a GET that reports the verdict, even though it easily
 * could. That would be a second way to ask a question `useEntitlement` already answers from the same
 * cookies and the same store — the duplication `lib/entitlement.ts` exists to prevent, and the shape
 * of every dead endpoint this codebase already carries.
 *
 * So the designed PDF's mark remains patchable by someone determined. The ATS-parseable PDF and the
 * Word file — which are what an employer actually receives, and the only download an Arabic CV gets —
 * are not.
 */

import { NextRequest, NextResponse } from "next/server";
import { paidRequest } from "@/app/lib/paidRequest";
import { renderPdf, pdfRefusesArabic } from "@/app/lib/renderPdf";
import { renderDocx } from "@/app/lib/renderDocx";

export const maxDuration = 30;

/** Long enough for a very long CV, short enough that this is not an upload endpoint. */
const MAX_TEXT = 60_000;

export async function POST(req: NextRequest) {
  let body: { format?: unknown; text?: unknown; lang?: unknown; filename?: unknown };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const format = body.format === "docx" ? "docx" : body.format === "pdf" ? "pdf" : "";
  if (!format) return NextResponse.json({ error: "format must be pdf or docx" }, { status: 400 });

  const text = typeof body.text === "string" ? body.text : "";
  if (text.trim().length < 20) {
    return NextResponse.json({ error: "nothing to export" }, { status: 400 });
  }
  if (text.length > MAX_TEXT) {
    return NextResponse.json({ error: "too long" }, { status: 413 });
  }

  const lang: "ar" | "en" = body.lang === "ar" ? "ar" : "en";

  /* Refused here as well as in the button, because a caller that skipped the button would otherwise
     get mojibake and no explanation. See `renderPdf`. */
  if (format === "pdf" && pdfRefusesArabic(text)) {
    return NextResponse.json({ error: "arabic-pdf-unsupported" }, { status: 422 });
  }

  /*
   * ══════════════════════════════════════════════════════════════════════════════════
   * THE ONE LINE THE WHOLE ROUTE EXISTS FOR
   * ══════════════════════════════════════════════════════════════════════════════════
   * The mark is decided from the request's own credentials. `body.watermark` is not read, does not
   * exist in the type above, and cannot be introduced without editing this file.
   */
  const paid = await paidRequest(req);
  const watermark = !paid.paid;

  try {
    const bytes = format === "pdf"
      ? await renderPdf(text, { watermark, lang })
      : await renderDocx(text, { watermark, lang });

    const fallbackName = format === "pdf" ? "resume.pdf" : "resume.docx";
    /* The filename is cosmetic, so it is sanitised rather than validated: a header is the wrong place
       to be creative with user input, and a rejected download over a filename would be absurd. */
    const asked = typeof body.filename === "string" ? body.filename : "";
    const filename = /^[A-Za-z0-9._-]{1,60}$/.test(asked) ? asked : fallbackName;

    /* Counts only. Never the text, never the filename the user chose — the same rule the usage log
       follows everywhere else in this product. */
    console.log("[export]", { format, watermark, chars: text.length, signedIn: paid.signedIn });

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": format === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "no-store",
        /* So the client can tell the user what it got, and so a test can assert the verdict without
           parsing a PDF. Reporting it is safe; ACCEPTING it would not be. */
        "X-Watermark": watermark ? "1" : "0",
      },
    });
  } catch (e) {
    console.error("[export] render failed", { format, e: String(e).slice(0, 300) });
    return NextResponse.json({ error: "render failed" }, { status: 500 });
  }
}
