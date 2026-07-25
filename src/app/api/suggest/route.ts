import { NextRequest, NextResponse } from "next/server";
import { allowShared, clientIp } from "@/app/lib/ratelimit";
import { logUsage, fromOpenAI } from "@/app/lib/usage";
import { DRAFTING_DOCTRINE, METRIC_QUESTION_DOCTRINE } from "@/app/lib/prompts";
import {
  cleanGroups, cleanItems, flattenGroups, hasMetric, parseGroups, parseItems,
  parseMetricAsk, parseVariants, scrubSuggestion,
} from "@/app/lib/suggestShapes";

export const maxDuration = 60;

/**
 * Per-field AI phrasing assistant for the CV builder. The user taps the orb
 * next to a field and the AI drafts that field's content in their place —
 * they then edit or delete it freely in the same input (interactive AI on
 * every line, not a black-box rewrite at the end).
 *
 * NO-FABRICATION: suggestions may only rephrase and structure what the user
 * already gave (role/company/target + their current draft). The policy on what
 * counts as invention is NOT written here — it is DRAFTING_DOCTRINE, inlined
 * below. This route used to carry its own version, which told the model to write
 * "[bracketed placeholders]" for missing metrics while the interview's drafter
 * forbade them and stripped them on the way out. One product cannot hold two
 * opinions about forgery, so there is now one text and this route imports it.
 *
 * Two response families:
 *  - no `mode` → `{ text }`, exactly as AiSuggest.tsx has always read it.
 *  - `mode` → structured, individually selectable output for the new builder.
 */

type Kind =
  | "duties" | "summary" | "skills" | "extras" | "education"
  | "bullet_improve" | "bullet_shorter" | "bullet_metric" | "ask";
type Mode = "items" | "groups" | "variants";

/** The kinds that existed before modes did — their error strings are load-bearing. */
const LEGACY_KINDS = ["duties", "summary", "skills", "extras", "education"] as const;
const KINDS: readonly Kind[] = [
  ...LEGACY_KINDS, "bullet_improve", "bullet_shorter", "bullet_metric", "ask",
];

/**
 * SHAPE ONLY — how many lines, in what format. What may be claimed is doctrine
 * and lives in prompts.ts; do not re-litigate invention here.
 */
const KIND_RULES: Record<Kind, string> = {
  duties:
    "Write 3-4 CV bullet lines for this work experience. Each starts with '- ' and a strong action verb.",
  summary:
    "Write a 3-line professional summary containing the target role title and the candidate's strongest angle from what is known.",
  skills:
    "Write 6-10 skills as a comma-separated list, inferred ONLY from the target role's standard toolkit and anything the candidate already wrote. Generic-but-real skills for the role are fine; niche tools they never mentioned are not.",
  extras:
    "Write 2-3 short lines naming what a certifications / languages / projects section for this target role usually contains, phrased as an invitation for the candidate to fill in — never as a credential they already hold.",
  education:
    "Write 1-2 education lines in standard CV format (degree — institution, year) using ONLY what the candidate wrote, reformatted. If they gave nothing, output the bare format with no invented degree, institution or year.",
  bullet_improve:
    "Rewrite the ONE bullet the candidate wrote so it reads stronger: better verb, clearer scope, professional register. Exactly the same facts — nothing added. Output the single line only.",
  bullet_shorter:
    "Shorten the ONE bullet the candidate wrote to one tight line. Every fact they stated must survive; cut only filler. Output the single line only.",
  bullet_metric: METRIC_QUESTION_DOCTRINE,
  ask:
    "Answer the candidate's question about this section of their CV: short, concrete, and usable as-is. If the honest answer is that only they can supply a fact, say so and ask for it.",
};

/** The JSON contract for each mode, appended to the prompt. */
const MODE_RULES: Record<Mode, string> = {
  items:
    `Return STRICT JSON ONLY: {"items":["…","…"]} — 6 to 10 items, each one complete standalone line the user can tick or delete on its own. No numbering, no leading dashes.`,
  groups:
    `Return STRICT JSON ONLY: {"groups":[{"label":"…","items":["…"]}]} — 2 to 4 groups. Labels must be categories a recruiter in this field recognises at a glance (for a radiology role: Imaging Modalities / Systems / Clinical & Safety), not "Group 1". 3 to 8 items per group.`,
  variants:
    `Return STRICT JSON ONLY: {"variants":[{"label":"concise","text":"…"},{"label":"professional","text":"…"},{"label":"achievement","text":"…"}]} — three genuinely different summaries of the same candidate: "concise" is two tight lines, "professional" is the formal three-line register, "achievement" leads with impact but may only use figures the candidate themselves wrote.`,
};

const BUSY_EN = "The assistant is busy — try again.";

export async function POST(req: NextRequest) {
  try {
    /*
     * Two windows, mirroring /api/interview: a burst cap so a loop cannot fire a
     * dozen calls in four seconds, plus the standing budget. 30 per 10 minutes was
     * sized for a page with three fields; the builder has around forty and offers
     * a suggestion per section, so a legitimate session was hitting the wall.
     *
     * Note: /api/interview also refuses cross-origin POSTs (its crossOrigin
     * guard). This route has none, so another site's page can drive it — these
     * two windows are the only thing standing between that and our token bill.
     */
    const ip = clientIp(req);
    if (!(await allowShared(`suggest:burst:${ip}`, 6, 20 * 1000)) ||
        !(await allowShared(`suggest:${ip}`, 60, 10 * 60 * 1000))) {
      return NextResponse.json({ error: "Slow down a little — try again in a minute." }, { status: 429 });
    }

    let body;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }
    const kind: Kind = KINDS.includes(body?.kind) ? body.kind : "duties";
    const mode: Mode | null = ["items", "groups", "variants"].includes(body?.mode) ? body.mode : null;
    const lang = body?.lang === "ar" ? "ar" : "en";
    const targetRole = String(body?.targetRole || "").slice(0, 120);
    const role = String(body?.role || "").slice(0, 100);
    const company = String(body?.company || "").slice(0, 100);
    const current = String(body?.current || "").slice(0, 1200);
    /** kind:"ask" only — the user's own question about this section. */
    const question = String(body?.question || "").slice(0, 300);
    /*
     * The live job posting, fetched from the internet by /api/fetch-job.
     *
     * This is what makes a suggestion current rather than remembered. The model
     * here has no search tool of its own — on NVIDIA there is none to give it —
     * so the internet arrives as the actual text of the actual advert the user is
     * applying to, which is better grounding than a search would be anyway: it is
     * THE posting, not a page about the role.
     */
    const jobAd = String(body?.jobAd || "").slice(0, 3000);

    // A legacy request is one AiSuggest.tsx could have sent. Its error strings and
    // response shape are frozen: that component reads `data.text` and surfaces
    // `data.error` verbatim, and it is not being touched in this change.
    const legacy = !mode && (LEGACY_KINDS as readonly string[]).includes(kind);
    const busy = legacy || lang !== "ar" ? BUSY_EN : "المساعد مشغول — جرب ثانية.";

    if (!targetRole && !role && !current && !question) {
      return NextResponse.json({ error: lang === "ar" ? "اكتب المسمى الوظيفي أولاً عشان أقدر أقترح." : "Fill in the role first so I have something to work from." }, { status: 400 });
    }

    const key = process.env.NVIDIA_API_KEY;
    if (!key) return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
    const model = process.env.AI_MODEL || "meta/llama-4-maverick-17b-128e-instruct";
    const t0 = Date.now();

    // Structured kinds must come back parseable; the free-text ones must not be
    // wrapped in JSON at all, or AiSuggest would print braces into the input.
    const json = mode !== null || kind === "bullet_metric";
    const shapeRule = mode ? MODE_RULES[mode]
      : kind === "bullet_metric" ? `Return STRICT JSON ONLY: {"question":"…","rewritten":"…"}.`
      : "Output ONLY the field content itself — no intro, no explanation, no markdown bold, no quotes.";

    const prompt = `You are a CV writing assistant embedded in a form field. ${KIND_RULES[kind]}

${DRAFTING_DOCTRINE}

LANGUAGE: write the output in ${lang === "ar" ? "professional Modern Standard Arabic" : "professional English"}.

KNOWN FACTS (use ONLY these — never invent employers, dates, numbers, degrees, or achievements):
- Target role: ${targetRole || "not given"}
- This job's title: ${role || "not given"}
- Company: ${company || "not given"}
- What the candidate already wrote in this field: ${current || "nothing yet"}
${question ? `- THEIR QUESTION, which is what you must answer: ${question}` : ""}

${jobAd ? `THE LIVE JOB POSTING they are applying to — fetched today, so this is the
vocabulary the employer's ATS is actually scanning for. Mirror its wording where it
genuinely applies to this candidate, and never claim anything from it they have not
told you they have:
${jobAd}` : ""}

${shapeRule}`;

    /*
     * JSON mode on the first attempt, dropped on the retry.
     *
     * Same discipline as /api/interview's callLLM: response_format removes the
     * "model wrapped its JSON in prose" failure at the source, but the deployment
     * is not guaranteed to accept the parameter, so support is discovered rather
     * than assumed. Free-text requests take exactly one attempt, as before — the
     * legacy path's timing and error behaviour must not change.
     */
    let raw = "";
    for (let attempt = 0; attempt < (json ? 2 : 1) && !raw; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30000);
      let res: Response;
      try {
        res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          signal: ctrl.signal,
          body: JSON.stringify({
            model,
            temperature: 0.6,
            top_p: 0.9,
            max_tokens: json ? 700 : 400,
            messages: [{ role: "user", content: prompt }],
            ...(json && attempt === 0 ? { response_format: { type: "json_object" } } : {}),
          }),
        });
      } catch (e) {
        if (!json) throw e;   // legacy: an abort or network failure is the outer catch's 502, as before
        console.error(`suggest upstream error (attempt ${attempt + 1}):`, e instanceof Error ? e.message : e);
        continue;
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) {
        if (!json) return NextResponse.json({ error: busy }, { status: 502 });
        console.error(`suggest upstream ${res.status} (attempt ${attempt + 1})`);
        continue;
      }
      const data = await res.json();
      logUsage({ route: "suggest", op: mode ? `${kind}:${mode}` : kind, provider: "nvidia", model, ...fromOpenAI(data), ms: Date.now() - t0 });
      raw = String(data?.choices?.[0]?.message?.content || "").replace(/\*\*/g, "").trim();
    }
    if (!raw) return NextResponse.json({ error: busy }, { status: 502 });

    /*
     * Server-side enforcement, not instruction.
     *
     * The prompt asks for honesty; this decides it. Every string that leaves here
     * has had placeholders stripped, and for duty/skill output any line carrying a
     * figure is dropped — the model cannot know the user's volumes, headcounts or
     * percentages, so a number in a suggested duty is invented by definition. Real
     * figures reach the CV through the user's own typing, or through bullet_metric
     * asking them for it.
     */
    const forbidMetrics = kind === "duties" || kind === "skills" || mode === "items" || mode === "groups";

    if (mode === "items") {
      const items = cleanItems(parseItems(raw), { cap: 10, forbidMetrics });
      if (!items.length) return NextResponse.json({ error: busy }, { status: 502 });
      return NextResponse.json({ items });
    }

    if (mode === "groups") {
      const groups = cleanGroups(parseGroups(raw), { cap: 4, itemCap: 8, forbidMetrics });
      if (!groups.length) return NextResponse.json({ error: busy }, { status: 502 });
      // The flat list too: some callers want a plain checklist and should not have
      // to re-flatten a shape the server already holds.
      return NextResponse.json({ groups, items: flattenGroups(groups) });
    }

    if (mode === "variants") {
      // Summaries are the one place a figure may be legitimate — it can only have
      // come from what the candidate already wrote in this field. So the digit rule
      // here is conditional on their own draft, the way stripPlaceholders is.
      const sourceHasMetric = hasMetric(current);
      const variants = (parseVariants(raw) ?? []).filter((v) => sourceHasMetric || !hasMetric(v.text));
      if (!variants.length) return NextResponse.json({ error: busy }, { status: 502 });
      // `text` mirrors variants[0] so a caller written against `{text}` still works.
      return NextResponse.json({ text: variants[0].text, variants });
    }

    if (kind === "bullet_metric") {
      const asked = parseMetricAsk(raw, lang);
      if (!asked) return NextResponse.json({ error: busy }, { status: 502 });
      return NextResponse.json(asked);
    }

    // Free text. Scrubbed line by line so the "- " bullet marker survives: the
    // clients read its presence to tell a duty line from a header (Journey.tsx,
    // ResumeTemplate), so it is protocol, not decoration.
    const text = raw
      .split("\n")
      .map((l) => {
        const t = l.trim();
        const body = scrubSuggestion(t);
        return body && /^[-•*]/.test(t) ? `- ${body}` : body;
      })
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (!text) return NextResponse.json({ error: busy }, { status: 502 });

    return NextResponse.json({ text });
  } catch {
    return NextResponse.json({ error: BUSY_EN }, { status: 502 });
  }
}
