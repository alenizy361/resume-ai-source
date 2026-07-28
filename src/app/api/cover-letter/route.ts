import { NextRequest, NextResponse } from "next/server";
import { verifyPass, verifyEntPass, ACCESS_COOKIE, ENT_COOKIE } from "@/app/lib/access";
import { readSession, SESSION_COOKIE } from "@/app/lib/session";
import { hasActiveEntitlement } from "@/app/lib/entitlements";
import { allowShared, clientIp } from "@/app/lib/ratelimit";
import { logUsage, fromOpenAI, fromAnthropic } from "@/app/lib/usage";
import { canDisableThinking, claudeModelOr, thinksByDefault , NVIDIA_DEFAULT_MODEL } from "@/app/lib/aiModels";
import { LANGUAGE_RETRY, languageHonoured } from "@/app/lib/resumeLang";

export const maxDuration = 300;

const PROVIDER = (process.env.AI_PROVIDER || "nvidia").toLowerCase();

/**
 * ── the language rule, which this prompt did not have at all ──
 *
 * This route took `resume` and `jobDescription` and nothing else. It never named an output language,
 * and no caller sent one, so the letter's language was whatever the model inferred from the input —
 * and the input is frequently mixed: an Arabic CV against an English job advert, or the reverse,
 * which is the ordinary case in this market.
 *
 * An Arabic-CV user could therefore be handed an English cover letter, and vice versa. This is a PAID
 * feature. Nothing detected it, because there was no expectation to compare the output against.
 *
 * The language is now an explicit argument, stated first in the rules where the model is most likely
 * to honour it, and — because an instruction a model is free to misread is one it eventually
 * misreads — checked afterwards with `languageHonoured` and retried once. That detector already
 * exists for `/api/optimize`, which learned the same lesson from a live build that returned a fully
 * Arabic CV to an English request.
 */
const PROMPT = (resume: string, jobDescription: string, outLang: "ar" | "en") =>
  `Write a concise, compelling cover letter for the candidate below, tailored to the job description.

OUTPUT LANGUAGE: Write the entire cover letter in ${outLang === "ar" ? "ARABIC" : "ENGLISH"}. This is not negotiable and does not depend on the language of the resume or the job description below, either of which may be in the other language.

RESUME:
${resume}

JOB DESCRIPTION:
${jobDescription}

Rules:
- 3–4 short paragraphs, under 300 words
- Open with genuine enthusiasm for the specific role
- Highlight 2–3 concrete achievements from the resume that match the job's needs
- Mirror the job's KEYWORDS naturally — the terminology, not the language, which is fixed above
- Close with a confident call to action
- Never invent facts not supported by the resume
- Use a professional, human tone — no clichés like "I am writing to apply"

Return ONLY the cover letter text, no preamble, no JSON.`;

async function callNvidia(resume: string, jobDescription: string, outLang: "ar" | "en", extra = ""): Promise<string> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("NVIDIA_API_KEY is not set");
  const model = process.env.AI_MODEL || NVIDIA_DEFAULT_MODEL;
  const t0 = Date.now();

  const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.6,
      top_p: 0.9,
      max_tokens: 900,
      messages: [
        { role: "system", content: "You are an expert career writer who produces tailored, human-sounding cover letters." },
        { role: "user", content: PROMPT(resume, jobDescription, outLang) + extra },
      ],
    }),
  });
  if (!res.ok) throw new Error(`NVIDIA API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  logUsage({ route: "cover-letter", op: "write", provider: "nvidia", model, ...fromOpenAI(data), ms: Date.now() - t0 });
  return data?.choices?.[0]?.message?.content ?? "";
}

async function callAnthropic(resume: string, jobDescription: string, outLang: "ar" | "en", extra = ""): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  /* `AI_MODEL` is shared with the NVIDIA branch above, where an NVIDIA id is the correct value —
     so it is validated as a Claude id here rather than forwarded into a 404. See `claudeModelOr`. */
  const model = claudeModelOr(process.env.AI_MODEL, "claude-sonnet-5");
  const t0 = Date.now();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 900,
      messages: [{ role: "user", content: PROMPT(resume, jobDescription, outLang) + extra }],
      /*
       * Reasoning off. `max_tokens` caps thinking plus response text together, and 900 tokens is a
       * cover letter with nothing to spare — a thinking model would spend part of it reasoning,
       * bill that at $15/M, and truncate the letter mid-sentence. This output is prose the user
       * reads, so a truncation here is not a retryable schema failure; it is a broken deliverable
       * on a paid feature.
       */
      ...(thinksByDefault(model) && canDisableThinking(model)
        ? { thinking: { type: "disabled" } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  logUsage({ route: "cover-letter", op: "write", provider: "anthropic", model, ...fromAnthropic(data), ms: Date.now() - t0 });
  return data?.content?.[0]?.text ?? "";
}

export async function POST(req: NextRequest) {
  try {
    // Paid feature, but a single pass can hammer it with no length cap — throttle.
    if (!(await allowShared(`cover:${clientIp(req)}`, 10, 10 * 60 * 1000))) {
      return NextResponse.json({ error: "Too many requests. Please wait a minute." }, { status: 429 });
    }

    let body;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    let resume = typeof body.resume === "string" ? body.resume : "";
    let jobDescription = typeof body.jobDescription === "string" ? body.jobDescription : "";
    /*
     * The CV's language, from the caller. Defaults to English only because that is what every caller
     * used to get by accident — and every caller now sends it explicitly, so the default is a
     * backstop rather than a policy.
     */
    /*
     * `"both"` is a valid choice for the RESUME on `/optimize` — some employers want a bilingual CV —
     * and it is not a sensible one for a cover letter, which is a piece of prose addressed to a
     * person. So it resolves to English, matching the convention `LANGUAGE_RETRY` already encodes
     * ("ENGLISH FOLLOWED BY ARABIC"): English is the first of the pair.
     *
     * Decided here rather than left to fall through a `=== "ar"` test, because the two produce the
     * same output and only one of them is a choice somebody made.
     */
    const outLang: "ar" | "en" = body.outLang === "ar" ? "ar" : "en";
    if (!resume || !jobDescription) {
      return NextResponse.json({ error: "Resume and job description are required." }, { status: 400 });
    }
    if (resume.trim().length < 50 || jobDescription.trim().length < 30) {
      return NextResponse.json({ error: "Please provide a fuller resume and job description." }, { status: 400 });
    }
    // Cap inputs before the model call (matches the tools route caps).
    resume = resume.slice(0, 8000);
    jobDescription = jobDescription.slice(0, 4000);

    // Cover letters are a paid feature — gate them like the rewritten resume.
    const now = Date.now();
    const email = readSession(req.cookies.get(SESSION_COOKIE)?.value, now);
    const entCookie = verifyEntPass(req.cookies.get(ENT_COOKIE)?.value, now);
    const accountUnlimited = email ? ((await hasActiveEntitlement(email, now)) || entCookie?.email === email.toLowerCase().trim()) : false;
    const hasPass = accountUnlimited || !!verifyPass(req.cookies.get(ACCESS_COOKIE)?.value, now);
    if (!hasPass) {
      return NextResponse.json(
        { error: "Cover letters are a paid feature. Unlock access to generate one.", paywall: true },
        { status: 402 }
      );
    }

    let coverLetter =
      PROVIDER === "anthropic"
        ? await callAnthropic(resume, jobDescription, outLang)
        : await callNvidia(resume, jobDescription, outLang);

    /*
     * One retry, naming the exact mistake. `LANGUAGE_RETRY` is the same text `/api/optimize` uses, so
     * the two routes cannot drift on what a language failure sounds like to the model.
     *
     * One and not more: a model that ignores an explicit instruction twice is not going to honour a
     * third, and this route already has a 300-second budget. The second attempt's output is used
     * whatever it is — a letter in the wrong language is worse than no letter only if the user cannot
     * tell, and they can.
     */
    if (!languageHonoured(coverLetter, outLang)) {
      console.warn("[cover-letter] wrong language on the first attempt — retrying", { outLang });
      coverLetter = PROVIDER === "anthropic"
        ? await callAnthropic(resume, jobDescription, outLang, LANGUAGE_RETRY(outLang))
        : await callNvidia(resume, jobDescription, outLang, LANGUAGE_RETRY(outLang));
    }

    if (!coverLetter.trim()) throw new Error("Empty response");
    return NextResponse.json({ coverLetter: coverLetter.trim() });
  } catch (err) {
    console.error("Cover letter error:", err);
    return NextResponse.json({ error: "Failed to generate cover letter. Please try again." }, { status: 500 });
  }
}
