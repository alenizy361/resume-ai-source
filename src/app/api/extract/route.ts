import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

/**
 * Accepts a PDF, DOCX, or TXT upload and returns its plain text so the
 * optimizer textarea can be auto-filled. Most people have their resume as a
 * file, not as copy-paste-able text — this removes the biggest friction point.
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    const name = (file.name || "").toLowerCase();
    const buf = Buffer.from(await file.arrayBuffer());

    if (buf.length > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 5 MB)." }, { status: 400 });
    }

    if (!name.endsWith(".pdf") && !name.endsWith(".docx") && !name.endsWith(".txt") && !name.endsWith(".md")) {
      return NextResponse.json(
        { error: "Unsupported file type. Upload a PDF, DOCX, or TXT." },
        { status: 400 }
      );
    }

    let text = "";
    try {
      if (name.endsWith(".pdf")) {
        /*
         * ══════════════════════════════════════════════════════════════════════════════
         * `mergePages: false`, and the flag is the whole bug
         * ══════════════════════════════════════════════════════════════════════════════
         *
         * This said `mergePages: true`, and unpdf's merge branch is:
         *
         *     text: mergePages ? texts.join("\n").replace(/\s+/g, " ") : texts
         *
         * `\s` includes `\n`. So a merged extraction returns the ENTIRE PDF as ONE LINE.
         *
         * `parseCv` is line-based from top to bottom: it splits on `\n`, `headingFor`
         * rejects any line over 48 characters, `looksLikeRoleHeader` rejects any line
         * over 120. Hand it one 4,000-character line and it finds zero headings, zero
         * roles, zero skills — so `worthImporting` is false and the panel says the file
         * could not be read.
         *
         * Which means EVERY text PDF failed, in every language, 100% of the time.
         * Measured on a PDF generated with this repo's own jspdf:
         *
         *     mergePages: true   →  newlines 0,  roles 0, skills 0  →  rejected
         *     mergePages: false  →  newlines 10, roles 2, skills 4   →  accepted
         *
         * The un-merged path keeps line breaks (it honours each item's `hasEOL`), and
         * line 39's `Array.isArray(t)` branch was written for exactly this — it has been
         * dead code all along.
         *
         * ── why nothing caught it ──
         *
         * The other consumer of this route is `/optimize`, which pours the text into a
         * textarea where whitespace does not matter. `ops/importcv.test.mjs` tests
         * `parseCv` against hand-written multi-line fixtures and never calls this route.
         * And `ops/form-smoke.mjs` STUBS this endpoint with `lines.join("\n")` — the
         * end-to-end test mocked away the one thing that was broken.
         *
         * `ops/pdfextract.test.mjs` now builds a real PDF and runs it through the real
         * library, which is the test that did not exist.
         */
        const { extractText, getDocumentProxy } = await import("unpdf");
        const pdf = await getDocumentProxy(new Uint8Array(buf));
        const { text: t } = await extractText(pdf, { mergePages: false });
        text = Array.isArray(t) ? t.join("\n") : t;
      } else if (name.endsWith(".docx")) {
        const mammoth = (await import("mammoth")).default;
        const { value } = await mammoth.extractRawText({ buffer: buf });
        text = value;
      } else {
        // Arabic .txt files saved by Windows Notepad are often Windows-1256,
        // which decoded as UTF-8 turns into replacement chars / mojibake. If
        // the UTF-8 read looks broken, fall back to cp1256.
        text = buf.toString("utf-8");
        const bad = (text.match(/�/g) || []).length;
        if (bad > 0 && bad > text.length * 0.02) {
          try { text = new TextDecoder("windows-1256").decode(buf); } catch { /* keep utf-8 */ }
        }
      }
    } catch (parseErr) {
      // A corrupt or password-protected file that passes the extension check
      // but fails to parse is a client-input problem, not a server fault — 422,
      // not 500, so the UI can show a "paste the text instead" hint.
      console.error("Extract parse error:", parseErr);
      return NextResponse.json(
        { error: "Couldn't read that file — it may be corrupted or password-protected. Try pasting the text instead." },
        { status: 422 }
      );
    }

    // Collapse excessive whitespace the parsers sometimes emit.
    text = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();

    if (!text || text.length < 20) {
      return NextResponse.json(
        { error: "Couldn't read any text from that file. If it's a scanned image, paste the text manually." },
        { status: 422 }
      );
    }

    /*
     * The invariant the `mergePages` bug violated, asserted where it can be seen.
     *
     * A CV of any length has line breaks. A long document with none means the extractor
     * has flattened the page, and every line-based decision downstream is then working
     * on one enormous line — which fails silently and blames the user's file.
     *
     * Logged rather than thrown: the text is still worth returning (the optimizer's
     * textarea does not care about line breaks, and a partial import beats none). But it
     * must not be invisible, because invisible is how it survived until a user complained.
     */
    if (text.length > 200 && !text.includes("\n")) {
      console.error(
        `[extract] no line breaks in ${text.length} chars from ${name.slice(-5)} — `
        + "the extractor has flattened the document; parseCv will find nothing",
      );
    }

    // Keep within the optimizer's input budget.
    if (text.length > 8000) text = text.slice(0, 8000);

    return NextResponse.json({ text });
  } catch (err) {
    console.error("Extract error:", err);
    return NextResponse.json({ error: "Failed to read the file. Try pasting the text instead." }, { status: 500 });
  }
}
