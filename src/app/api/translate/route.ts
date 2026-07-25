import { NextRequest, NextResponse } from "next/server";
import { allowShared, clientIp } from "@/app/lib/ratelimit";
import { logUsage, fromAnthropic } from "@/app/lib/usage";
import { modelConfig, estimateCallCost } from "@/app/lib/aiModels";
import { extractJsonValue } from "@/app/lib/suggestShapes";
import {
  type TranslationSource, type SourceItem,
  validateTranslation, translationEscalation, sourceContentHash, sectionHashes,
  TRANSLATION_PROMPT_VERSION,
} from "@/app/lib/translate";
import { GLOSSARY_VERSION, applyGlossary, glossaryFor, render } from "@/app/lib/glossary";

/**
 * The optional English version, in one request.
 *
 * ── why one request and not one per field ──
 *
 * A CV has maybe forty translatable items. Forty requests would be forty times the overhead for a
 * task whose whole difficulty is CONSISTENCY: the same Arabic term has to become the same English term
 * in the summary, in a bullet and in the skills list, and a model that cannot see the other thirty-nine
 * lines has no way to be consistent with them. So the cost argument and the quality argument point the
 * same way here, which is rare enough to be worth saying.
 *
 * ── the glossary goes first ──
 *
 * Standard professional vocabulary is answered from `glossary.ts` before the model is asked anything:
 * free, instant, and identical every time. What reaches the model is the SENTENCES, plus the glossary
 * entries that appear in them so its vocabulary matches the table's. On a radiology CV that resolves
 * most of the skills section before a request is made.
 *
 * ── and it is never automatic ──
 *
 * This route is only reachable from an explicit "Create English version" action. Nothing here fires on
 * a refresh, a template change, a preview, or an export. The Arabic version is never overwritten: the
 * result is a separate localized version keyed to the same confirmed facts.
 */

export const maxDuration = 60;

interface Body {
  source?: TranslationSource;
  /** Only these sections. Empty or absent means all of them — see `staleSections`. */
  sections?: string[];
  /** The user asked for the stronger model explicitly. */
  advanced?: boolean;
}

/* ─────────────────────────── the prompt ─────────────────────────── */

/**
 * The stable half. Byte-identical on every translation request, so it caches when the model's floor
 * allows — and harmless when it does not, which on the fast tier is the current measured reality.
 */
const TRANSLATION_RULES = `You produce the English version of a resume whose facts were confirmed by
its owner in Arabic. You are a professional bilingual CV writer, not a translation engine.

════════ 1. THE INVARIANT ════════

You may change WORDS. You may never change FACTS.

Forbidden without exception:
- Adding a responsibility, skill, credential, employer, institution or achievement.
- Removing one.
- Changing any number: a date, a year, a duration, a count, a percentage, a credential number.
- Promoting scope. "شاركت في" is "contributed to", never "led". "ساعدت" is "assisted with",
  never "managed".
- Inventing an English legal name for an organisation.

If a line cannot be rendered in English without adding something, render it plainly and shortly
rather than fluently and falsely.

════════ 2. PROFESSIONAL, NOT LITERAL ════════

Translate the MEANING into the English a recruiter expects, not the words in order.

  Arabic:  نفّذت فحوصات الأشعة المقطعية والعامة وفق البروتوكولات المعتمدة، مع مراجعة جودة الصور
           قبل إرسالها إلى نظام (PACS).
  Good:    Performed general X-ray and CT examinations in accordance with approved protocols,
           reviewing image quality before submission to PACS.
  Bad:     Executed general radiation examinations according to the approved protocols with
           reviewing of image quality before sending to PACS system.

The bad version is recognisably machine output: "executed", "radiation examinations", the article
before "approved protocols", "PACS system". Each is a word-level choice that is defensible alone and
wrong together.

Use the same register an English CV uses: past-tense action verb, no first person, no full stop
required, one responsibility per line, twenty to thirty words.

════════ 3. THE GLOSSARY IS AUTHORITATIVE ════════

Each request carries the standard bilingual terms that appear in this CV. Use those exact English
forms. Do not paraphrase them, do not pluralise them differently, do not expand an abbreviation the
table keeps short. Consistency across the document is the point: an applicant tracking system matches
strings, so the same skill named two ways has been demonstrated zero times.

════════ 4. PROTECTED NAMES ════════

Each request lists strings that must appear in your output UNCHANGED — employers, institutions, the
person's own name, credential numbers. Copy them character for character. If an organisation has a
well-known English name you are confident about, you may add it in brackets after the original AND
list the item in needsConfirmation. If you are not confident, leave the original alone.

Never transliterate a person's name and present it as their legal name.

════════ 5. OUTPUT ════════

Return STRICT JSON ONLY:

{
  "items": { "<the exact id given>": "<the English text>" },
  "needsConfirmation": ["a term or name the user should check"],
  "warnings": ["one clause, only for a real problem"]
}

Every id you were given must appear exactly once. Do not add ids. Do not omit ids. Do not return
prose before or after the JSON.`;

function userMessage(src: TranslationSource, items: SourceItem[], glossary: string): string {
  return [
    `SOURCE LANGUAGE: ${src.sourceLanguage === "ar" ? "Arabic" : "English"}`,
    `TARGET LANGUAGE: ${src.targetLanguage === "ar" ? "Arabic" : "English"}`,
    "",
    glossary ? `GLOSSARY — use these exact target forms:\n${glossary}` : "GLOSSARY: none of the standard terms appear in this CV.",
    "",
    src.protectedNames.length
      ? `PRESERVE UNCHANGED:\n${src.protectedNames.map((n) => `  ${n}`).join("\n")}`
      : "PRESERVE UNCHANGED: nothing listed.",
    "",
    "ITEMS — translate each, keyed by its id:",
    ...items.map((i) => `  [${i.id}] (${i.section}) ${i.text}`),
    "",
    "Return the JSON object described in the schema.",
  ].filter(Boolean).join("\n");
}

/* ─────────────────────────── the call ─────────────────────────── */

async function callAnthropic(
  model: string, message: string, maxTokens: number, key: string,
): Promise<{ ok: true; text: string; usage: unknown } | { ok: false; status: number; error: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
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
        max_tokens: maxTokens,
        /*
         * Zero temperature, unlike the suggestion routes.
         *
         * A suggestion benefits from variety — three summary options should differ. A translation of a
         * confirmed fact has one right answer, and sampling around it is how the same term comes back
         * two ways in one document.
         */
        temperature: 0,
        system: [{ type: "text", text: TRANSLATION_RULES, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: message }],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: body.slice(0, 200) };
    }
    const data = await res.json().catch(() => null);
    const text = (data as { content?: Array<{ text?: string }> } | null)?.content?.[0]?.text ?? "";
    return { ok: true, text, usage: data };
  } finally { clearTimeout(timer); }
}

/* ─────────────────────────── the handler ─────────────────────────── */

export async function POST(req: NextRequest) {
  let body: Body;
  try { body = await req.json(); } catch { return bad("Malformed request."); }

  const src = body.source;
  if (!src || !Array.isArray(src.items) || !src.items.length) return bad("Nothing confirmed to translate yet.");
  if (src.sourceLanguage === src.targetLanguage) return bad("The source and target languages are the same.");

  /* Only the sections asked for — this is what makes "change one bullet" cheap. */
  const wanted = new Set(body.sections ?? []);
  const items = wanted.size ? src.items.filter((i) => wanted.has(i.section)) : src.items;
  if (!items.length) return bad("No matching sections to translate.");

  const ip = clientIp(req);
  /* Tighter than the suggestion bucket: a translation is once per CV, not once per field. */
  if (!await allowShared(`tr:${ip}`, 8, 600_000)) {
    return NextResponse.json(
      { error: src.sourceLanguage === "ar" ? "طلبات كثيرة — جرّب بعد قليل." : "Too many requests — try again shortly." },
      { status: 429 },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    console.error("[translate] ANTHROPIC_API_KEY is empty — refused. Env vars are snapshotted at build time.");
    return NextResponse.json({ error: "Translation is temporarily unavailable.", fallback: "keep-source" }, { status: 503 });
  }

  /*
   * ── the glossary pass, before anything is paid for ──
   *
   * Skills and credentials arrive as comma-joined strings in this schema, so each is split, looked up,
   * and only the misses go to the model. A radiology CV usually has every skill in the table.
   */
  const preResolved: Record<string, string> = {};
  const remaining: SourceItem[] = [];
  for (const item of items) {
    if (item.section === "skills" || item.section === "credentials" || item.section === "languages") {
      const parts = item.text.split(/[,،]/).map((p) => p.trim()).filter(Boolean);
      const { translated, unknown } = applyGlossary(parts, src.sourceLanguage);
      if (parts.length && !unknown.length) {
        /* Fully answered by the table — no model call for this item at all. */
        preResolved[item.id] = translated.map((t) => t.target).join(", ");
        continue;
      }
      /* Partially known: the model gets the whole item, with the known terms fixed in the glossary
         block below, because splitting one list across two sources produces two orderings. */
    }
    remaining.push(item);
  }

  const cfg = modelConfig();
  const contentHash = sourceContentHash(src);

  if (!remaining.length) {
    /* The whole request was answerable from the table. This is the best possible outcome and it is
       reported as a real result, not as an empty one. */
    logUsage({
      route: "translate", op: "glossary-only", provider: "cache", model: "glossary",
      input: 0, output: 0, ms: 0,
    });
    return NextResponse.json({
      items: preResolved,
      needsConfirmation: [],
      warnings: [],
      _meta: {
        model: "glossary", glossaryOnly: true, attempts: 0, estimatedUsd: 0,
        contentHash, sectionHashes: sectionHashes(src),
        promptVersion: TRANSLATION_PROMPT_VERSION, glossaryVersion: GLOSSARY_VERSION,
      },
    });
  }

  const glossaryText = glossaryFor(remaining.map((i) => i.text).join(" "), src.sourceLanguage, src.families)
    .map((e) => `  ${src.sourceLanguage === "ar" ? e.ar : e.en} → ${render(e, src.targetLanguage)}`)
    .join("\n");

  const message = userMessage(src, remaining, glossaryText);
  /* Output is roughly the size of the input plus JSON overhead; English is denser than Arabic, so a
     1.6x factor with a floor covers a short CV without capping a long one. */
  const maxTokens = Math.min(4000, Math.max(800, Math.ceil(remaining.reduce((n, i) => n + i.text.length, 0) / 2)));

  const t0 = Date.now();
  let escalation = translationEscalation(src, { userRequested: body.advanced });
  let attempts = 0;
  let lastError = "";
  let lastStatus = 502;

  for (let step = 0; step < 2; step++) {
    const model = escalation ? cfg.reasoningModel : cfg.fastModel;
    attempts++;
    const out = await callAnthropic(model, message, maxTokens, apiKey);

    if (!out.ok) {
      lastError = out.error; lastStatus = out.status;
      logUsage({
        route: "translate", op: `http-${out.status}`, provider: "anthropic", model,
        input: 0, output: 0, ms: Date.now() - t0, note: `attempt ${attempts}`,
      });
      break;
    }

    const usage = fromAnthropic(out.usage);
    const usd = estimateCallCost(model, usage);
    logUsage({
      route: "translate",
      op: escalation ? `translate:escalated:${escalation}` : "translate",
      provider: "anthropic", model, ...usage, ms: Date.now() - t0,
      note: `attempt=${attempts} items=${remaining.length} usd=${usd.toFixed(6)} cached=${usage.cacheRead > 0}`,
    });

    const parsed = extractJsonValue(out.text) as { items?: Record<string, string>; needsConfirmation?: unknown; warnings?: unknown } | null;
    const returned = (parsed && typeof parsed === "object" && parsed.items && typeof parsed.items === "object")
      ? parsed.items as Record<string, string>
      : null;

    if (!returned) {
      if (step === 0) { escalation = "validation-failed"; continue; }
      break;
    }

    /*
     * Validated against the ITEMS THAT WERE SENT, not against the whole CV.
     *
     * A partial retranslation legitimately returns two bullets and nothing else; validating it against
     * forty items would report thirty-eight as missing and reject a correct result.
     */
    const subset: TranslationSource = { ...src, items: remaining };
    const check = validateTranslation(subset, { items: returned });

    if (!check.ok) {
      /*
       * One escalation, then accept-with-warnings rather than fail.
       *
       * A translation that changed a digit must not be stored silently — but refusing outright leaves
       * the user with nothing after paying twice. So the problems travel back with the result, the
       * review screen shows them, and the user decides. `ok: false` is what the client keys on.
       */
      console.error(`[translate] validation failed (${check.problems.map((p) => p.code).join(",")}) on attempt ${attempts}`);
      if (step === 0) { escalation = "validation-failed"; continue; }
      return NextResponse.json({
        items: { ...preResolved, ...returned },
        needsConfirmation: strings(parsed?.needsConfirmation),
        warnings: strings(parsed?.warnings),
        ok: false,
        problems: check.problems,
        _meta: meta(model, attempts, escalation, usd, usage, contentHash, src),
      }, { status: 200 });
    }

    return NextResponse.json({
      items: { ...preResolved, ...returned },
      needsConfirmation: strings(parsed?.needsConfirmation),
      warnings: strings(parsed?.warnings),
      ok: true,
      problems: [],
      _meta: meta(model, attempts, escalation, usd, usage, contentHash, src),
    });
  }

  return NextResponse.json(
    {
      error: src.sourceLanguage === "ar"
        ? "لم نتمكن من إنشاء النسخة الإنجليزية. النسخة العربية كما هي، ويمكنك المحاولة مرة أخرى."
        : "We could not produce the translated version. The original is unchanged — you can try again.",
      fallback: "keep-source",
      ...(lastError ? { detail: lastError.slice(0, 120) } : {}),
    },
    { status: lastStatus >= 400 && lastStatus < 500 ? lastStatus : 502 },
  );
}

function meta(
  model: string, attempts: number, escalation: string | null, usd: number,
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number },
  contentHash: string, src: TranslationSource,
) {
  return {
    model, attempts, escalated: escalation !== null, reason: escalation,
    inputTokens: usage.input, outputTokens: usage.output,
    cacheReadTokens: usage.cacheRead, cacheWriteTokens: usage.cacheWrite,
    promptCached: usage.cacheRead > 0,
    estimatedUsd: Number(usd.toFixed(6)),
    contentHash, sectionHashes: sectionHashes(src),
    promptVersion: TRANSLATION_PROMPT_VERSION, glossaryVersion: GLOSSARY_VERSION,
  };
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean).slice(0, 10) : [];
}

function bad(msg: string) { return NextResponse.json({ error: msg }, { status: 400 }); }
