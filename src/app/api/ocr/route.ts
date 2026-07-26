import { NextRequest, NextResponse } from "next/server";
import { allowShared, clientIp } from "@/app/lib/ratelimit";
import { logUsage } from "@/app/lib/usage";
import { OCR_IMAGE_TYPES, transcribe } from "@/app/lib/ocr";

export const maxDuration = 60;

/**
 * Read a CV that `/api/extract` could not: a scan, or a photo taken with a phone.
 *
 * ── why this is a separate route ──
 *
 * `/api/extract` pulls the text layer out of a PDF or DOCX. It never shows the file to a model, and
 * the upload card SAYS SO: "no AI provider sees the file, and it is not saved". That sentence is a
 * promise, and it is the reason people upload a CV containing their national ID at all.
 *
 * This route breaks that promise — it sends the file itself to Anthropic — so it cannot live behind
 * the same button. It is a second, explicitly chosen door with its own sentence telling the user
 * exactly what changes. Folding OCR into `/api/extract` would have been fewer files and a lie.
 *
 * ── why it exists at all ──
 *
 * Without it the honest failure message was the whole feature: "we could not read enough from that
 * file — paste the words in below". Better wording for a dead end is still a dead end, and in this
 * market a photographed CV is not the edge case. A phone camera is how most people have a copy of
 * anything.
 *
 * ── transcription, not writing ──
 *
 * The prompt asks for the words that are visibly there and nothing else. A vision model asked to
 * "read a CV" will happily produce a plausible CV, which on this product would be a fabricated work
 * history attributed to a real person. So the instruction is transcription, the temperature is zero
 * where it is accepted, and the output still lands on the same review screen the upload path uses —
 * where every line is a tick the user has to grant.
 */

export async function POST(req: NextRequest) {
  /*
   * Tighter than the text extractor's limit on purpose: this one costs money per call, and a
   * scanned CV is a thing a person uploads once or twice, not fifteen times in ten minutes.
   */
  if (!(await allowShared(`ocr:${clientIp(req)}`, 6, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many requests. Please wait a few minutes." }, { status: 429 });
  }

  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    console.error("[ocr] ANTHROPIC_API_KEY is empty — cannot read a scanned file.");
    return NextResponse.json({ error: "Reading images is unavailable right now." }, { status: 503 });
  }

  let file: File;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (!f || typeof f === "string") return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    file = f;
  } catch {
    return NextResponse.json({ error: "Malformed upload." }, { status: 400 });
  }

  const name = (file.name || "").toLowerCase();
  const ext = name.slice(name.lastIndexOf("."));
  const buf = Buffer.from(await file.arrayBuffer());

  /* 4 MB, under Anthropic's own ceiling and small enough that a phone photo goes through on a
     Saudi mobile connection without timing out the function. */
  if (buf.length > 4 * 1024 * 1024) {
    return NextResponse.json({ error: "That file is too large to read as an image (max 4 MB)." }, { status: 400 });
  }

  const isPdf = ext === ".pdf";
  const imageType = OCR_IMAGE_TYPES[ext];
  if (!isPdf && !imageType) {
    /*
     * HEIC lands here, and it is worth naming rather than lumping in with "unsupported": iPhones
     * shoot HEIC by default and Anthropic does not read it. Safari usually converts on upload, so
     * the user who reaches this message needs to be told what to do, not that they did wrong.
     */
    return NextResponse.json({
      error: ext === ".heic" || ext === ".heif"
        ? "iPhone HEIC photos cannot be read directly. Take a screenshot of the photo, or export it as JPEG, and upload that."
        : "Upload a PDF, or a photo as JPEG, PNG or WEBP.",
    }, { status: 400 });
  }

  const r = await transcribe(buf, isPdf ? "application/pdf" : imageType);

  /*
   * Token counts and cost only. The transcription is the user's CV — logging it would put a
   * stranger's employment history and phone number into a log aggregator forever.
   */
  logUsage({
    route: "ocr", op: r.ok ? (isPdf ? "pdf" : "image") : `http-${r.status}`,
    provider: "anthropic", model: r.model,
    input: r.inputTokens, output: r.outputTokens, ms: r.ms,
    /* `UsageLine` carries no cost field — the ledger prices lines from tokens rather than trusting a
       figure each route computes for itself. The estimate rides in `note` so it is readable in a log
       line without inventing a second source of truth for the bill. */
    note: `usd~${r.estimatedUsd.toFixed(6)}`,
  });

  if (!r.ok) {
    console.error(`[ocr] provider ${r.status}: ${r.error ?? ""}`);
    return NextResponse.json(
      { error: r.status === 504
        ? "That took too long to read. Try a smaller or clearer image."
        : "We could not read that file." },
      { status: r.status === 504 ? 504 : 502 },
    );
  }

  if (r.empty) {
    return NextResponse.json({
      error: "There is no readable text in that file. If it is a photo, try again with better light "
        + "and the page filling the frame.",
    }, { status: 422 });
  }

  return NextResponse.json({ text: r.text });
}
