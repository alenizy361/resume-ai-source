/**
 * Transcribe a document with a vision model — the one call `/api/ocr` makes.
 *
 * ── why it is a library and not inline in the route ──
 *
 * The health endpoint has to be able to prove this works on a deployment that has the key, and the
 * only proof worth having is one that exercises THE SAME code the user's upload does. A probe with
 * its own copy of the request body tests the copy: it goes green while the route 400s on a parameter
 * the copy does not send. That already happened once today, to the structured-output probe, in the
 * opposite direction — it starved a schema the real route feeds properly and reported the schema
 * broken.
 *
 * So there is one function, and both callers go through it.
 */

import { modelConfig, estimateCallCost, acceptsTemperature, canDisableThinking, thinksByDefault } from "./aiModels.ts";
import { fromAnthropic } from "./usage.ts";

/**
 * Transcription, not writing — and on this product the distinction is the whole safety argument.
 *
 * A vision model asked to "read a CV" will produce a plausible CV. Here that would be a fabricated
 * work history attributed to a real, named person, arriving through the door labelled "read my file".
 * So every rule below is a refusal, and the output still lands on the review screen where each line
 * is a tick the user has to grant.
 */
export const TRANSCRIBE_PROMPT = `Transcribe the text in this document. It is someone's CV.

RULES
- Output ONLY the words that are actually visible. This is transcription, not writing.
- Never add a job, a date, an employer, a qualification, a skill or a number that is not there.
- If a word is unreadable, write nothing for it rather than guessing what it probably said.
- Keep the reading order and the line breaks. Keep headings on their own lines.
- Keep the original language. Do not translate. Arabic stays Arabic.
- No preamble, no commentary, no markdown. The text only.

If the document contains no readable text at all, output exactly: NO_TEXT_FOUND`;

/** What Anthropic accepts directly. HEIC is absent because it will not — the route says so by name. */
export const OCR_IMAGE_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".gif": "image/gif", ".webp": "image/webp",
};

export interface Transcription {
  ok: boolean;
  status: number;
  /** Empty when `ok` is false, or when the model found nothing readable. */
  text: string;
  /** True when the model reported the document carries no readable text at all. */
  empty: boolean;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
  ms: number;
  /** Provider text, truncated. Never the file and never the transcription. */
  error?: string;
}

export async function transcribe(
  buf: Buffer, mediaType: string, opts: { timeoutMs?: number } = {},
): Promise<Transcription> {
  const key = String(process.env.ANTHROPIC_API_KEY);
  const model = modelConfig().fastModel;
  const isPdf = mediaType === "application/pdf";
  const t0 = Date.now();

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 45_000);
  const base = { ok: false, text: "", empty: false, model, inputTokens: 0, outputTokens: 0, estimatedUsd: 0 };
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        /* A dense two-page CV transcribes to well under this. The cap is here so a pathological
           input cannot run away with the bill. */
        max_tokens: 4000,
        /* Zero where it is accepted: a transcription has one right answer, and sampling around it
           invents spellings of a stranger's employer. A reasoning model rejects any value but 1 —
           see `acceptsTemperature`, which exists because that shipped as a 400 once. */
        ...(acceptsTemperature(model) ? { temperature: 0 } : {}),
        ...(thinksByDefault(model) && canDisableThinking(model) ? { thinking: { type: "disabled" } } : {}),
        messages: [{
          role: "user",
          content: [
            { type: isPdf ? "document" : "image", source: { type: "base64", media_type: mediaType, data: buf.toString("base64") } },
            { type: "text", text: TRANSCRIBE_PROMPT },
          ],
        }],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ...base, status: res.status, ms: Date.now() - t0, error: body.slice(0, 200) };
    }

    const data = await res.json().catch(() => null);
    const raw = ((data as { content?: Array<{ text?: string }> } | null)?.content?.[0]?.text ?? "").trim();
    const u = fromAnthropic(data);
    const empty = !raw || raw === "NO_TEXT_FOUND";

    return {
      ok: true,
      status: res.status,
      text: empty ? "" : raw,
      empty,
      model,
      inputTokens: u.input,
      outputTokens: u.output,
      estimatedUsd: Number(estimateCallCost(model, u).toFixed(6)),
      ms: Date.now() - t0,
    };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ...base,
      status: aborted ? 504 : 502,
      ms: Date.now() - t0,
      error: aborted ? "timed out" : "request failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A tiny valid PDF carrying a known sentence, built in code.
 *
 * For the health probe, so it can exercise `transcribe()` on a real deployment without a checked-in
 * fixture. A PDF is the right shape for this: the format is plain text, Helvetica needs no embedded
 * font, and Anthropic rasterises the page — so what comes back proves the whole pipeline, from the
 * document content block to the transcription, on the same function the upload uses.
 *
 * Latin only, because Helvetica cannot set Arabic. So this proves the PIPELINE works and says nothing
 * about Arabic transcription QUALITY — that needs a real photograph, and the probe's own note says so
 * rather than letting a green tick imply more than it earned.
 */
export function sampleTextPdf(line: string): Buffer {
  const content = `BT /F1 24 Tf 60 700 Td (${line.replace(/[()\\]/g, "")}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });

  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}
