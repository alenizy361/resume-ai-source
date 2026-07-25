import { NextRequest, NextResponse } from "next/server";
import { allowShared, clientIp } from "@/app/lib/ratelimit";
import { logUsage, fromAnthropic } from "@/app/lib/usage";
import {
  type AiTaskType, routeModel, qualityFloor, estimateCallCost, modelConfig,
  type EscalationReason,
} from "@/app/lib/aiModels";
import {
  CORE_RULES, TASK_SCHEMA, type PromptContext,
  blueprintMessage, experienceMessage, finalMessage, jdDeltaMessage,
} from "@/app/lib/aiPrompts";
import { packKey, jdDeltaKey, normalizeContext } from "@/app/lib/aiCache";
import { readPack, writePack, packCacheConfigured } from "@/app/lib/packCache";
import { extractJsonValue, hasMetric, scrubSuggestion } from "@/app/lib/suggestShapes";
import { credentialsFor } from "@/app/lib/countryRules";
import { scrubDeep } from "@/app/lib/interviewGuards";

/**
 * The three combined generations that replace one call per section.
 *
 * ── what this route is for ──
 *
 * `/api/suggest` asks one question per field: duties, then skills, then credentials, then
 * languages, then a summary. Measured on the live builder, a one-experience CV costs four paid
 * calls before the user has refined anything, and every one of them re-sends the same context
 * and re-derives the same occupation knowledge. Four calls to learn one occupation.
 *
 * This route asks three times for a whole CV:
 *
 *   role_blueprint       once per occupation+market. Feeds skills, credentials, keywords,
 *                        achievement questions and the review — every stage that used to ask.
 *   experience_package   once per experience. Responsibilities, tools, achievement questions
 *                        and improvements to the user's own lines, together.
 *   final_content        once, at the end. Three summaries, ordering, shortening, duplicates.
 *
 * Plus `jd_delta`, which is the mechanism that stops a pasted job advert from throwing the
 * blueprint away: the advert is analysed as a DIFFERENCE against the cached pack.
 *
 * `/api/suggest` is untouched and still serves the per-field refinements — Improve, Shorten, the
 * metric question. Those are explicit single-line actions and combining them would be wrong.
 *
 * ── what it deliberately does not do ──
 *
 * It does not score the CV, count keyword coverage, or check formatting. `/api/optimize` does all
 * of that on the free provider and does it well; asking Anthropic for a second opinion nobody
 * reads is the clearest waste in the whole design. The division is stated in `CORE_RULES` so the
 * model is told not to, and enforced here by there being no such field in any schema.
 */

export const maxDuration = 60;

/* ─────────────────────────── request shape ─────────────────────────── */

const TASKS: AiTaskType[] = ["role_blueprint", "experience_package", "final_content", "jd_delta"];

interface Body {
  task?: string;
  context?: Partial<PromptContext>;
  /** `experience_package` only. */
  experience?: {
    title?: string; department?: string; industry?: string;
    tools?: string[]; userBullets?: string[]; current?: boolean;
  };
  /** Baseline themes from the blueprint, so a package stays consistent with it. */
  themes?: string[];
  /** `final_content` only — the CONFIRMED resume text. Contact details stripped by the client. */
  facts?: string;
  sections?: string[];
  /** `jd_delta` only. */
  jobAd?: string;
  baseline?: string[];
  /** Skills the user already ticked, so the blueprint does not offer them again. */
  confirmedSkills?: string[];
}

/* ─────────────────────────── output cleaning ─────────────────────────── */

/**
 * Strip anything the doctrine forbids, at the boundary, before it can be rendered.
 *
 * The prompt says no figures. `ops/titles-bench.mjs` measured that instruction being obeyed
 * about 70% of the time on the free model — which means the prompt is necessary and not
 * sufficient. Every string that will become resume text passes through here, and a line carrying
 * a metric is dropped rather than trimmed: a duty with its number cut out often no longer parses
 * as a sentence, and half a sentence on a CV is worse than one fewer suggestion.
 *
 * Applied per field rather than blanket-recursively, because two fields legitimately contain
 * digits and blanket scrubbing would break both: `confidence` is a number, and an achievement
 * QUESTION about a year ("since which year have you covered CT?") is asking for a figure, not
 * asserting one. Those are handled by their own rules.
 */
function cleanLines(v: unknown, cap: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of v) {
    if (typeof item !== "string") continue;
    const text = scrubSuggestion(item);
    if (!text || hasMetric(text)) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= cap) break;
  }
  return out;
}

/** A question may ASK for a figure; it may never contain one. Same rule, opposite direction. */
function cleanQuestions(v: unknown, cap: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((q): q is string => typeof q === "string")
    .map((q) => q.trim())
    .filter((q) => q.length > 4 && !/[0-9٠-٩۰-۹]/.test(q))
    .slice(0, cap);
}

function cleanGroups(v: unknown, groupCap: number, itemCap: number): Array<{ label: string; items: string[] }> {
  if (!Array.isArray(v)) return [];
  const out: Array<{ label: string; items: string[] }> = [];
  let budget = itemCap;
  for (const g of v) {
    if (out.length >= groupCap || budget <= 0) break;
    const label = typeof (g as { label?: unknown })?.label === "string" ? (g as { label: string }).label.trim() : "";
    const items = cleanLines((g as { items?: unknown })?.items, budget);
    if (items.length) { out.push({ label, items }); budget -= items.length; }
  }
  return out;
}

/**
 * An improvement must contain the facts of its original and nothing more.
 *
 * The check that matters is the metric one, and it is asymmetric on purpose: if the ORIGINAL had
 * a number the user put there, the improvement may keep it — those are the user's own figures and
 * preserving them is the point. If the original had none and the improvement has one, the model
 * invented it, and the improvement is discarded while the original survives untouched.
 *
 * This is the one place a model could put words in the user's mouth and have them attributed to
 * the user, which makes it the most dangerous field in any of these schemas.
 */
function cleanImprovements(v: unknown, originals: string[]): Array<{ original: string; improved: string }> {
  if (!Array.isArray(v)) return [];
  const known = new Map(originals.map((o) => [o.trim().toLowerCase(), o]));
  const out: Array<{ original: string; improved: string }> = [];
  for (const pair of v) {
    const original = typeof (pair as { original?: unknown })?.original === "string" ? (pair as { original: string }).original.trim() : "";
    const improved = typeof (pair as { improved?: unknown })?.improved === "string" ? (pair as { improved: string }).improved.trim() : "";
    if (!original || !improved) continue;
    // An "original" the user never wrote is a fabrication, not an improvement.
    if (!known.has(original.toLowerCase())) continue;
    if (hasMetric(improved) && !hasMetric(original)) continue;
    out.push({ original: known.get(original.toLowerCase())!, improved });
    if (out.length >= originals.length) break;
  }
  return out;
}

/* ─────────────────────────── per-task validation ─────────────────────────── */

/**
 * Turn a model response into the task's shape, or null if there is nothing usable.
 *
 * Null is what triggers the one safe retry, and then the escalation. It means "the shape is
 * wrong", not "the content is thin" — a blueprint with four skills is a quality problem for
 * `qualityFloor` to judge, while a blueprint that is a JSON array instead of an object is a
 * schema problem and retrying it unchanged is reasonable exactly once.
 */
function shapeFor(task: AiTaskType, raw: unknown, body: Body): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const cvLang = body.context?.cvLang === "ar" ? "ar" : "en";

  if (task === "role_blueprint") {
    const groups = cleanGroups(o.skillGroups, 4, 15);
    const themes = cleanLines(o.responsibilityThemes, 8);
    if (!groups.length && !themes.length) return null;

    /*
     * Credential ids are filtered against `countryRules.ts` rather than trusted. The prompt lists
     * the allowed ids and asks for those only; this is what happens when it does not comply, and
     * "SCFHS" invented for a market where it does not apply is precisely the failure the rules
     * file exists to prevent. A model cannot add a credential by returning an unknown id.
     */
    const allowed = new Set(credentialsFor(body.context?.occupation ?? "", body.context?.country ?? "").map((r) => r.id));
    const creds = Array.isArray(o.credentialSuggestions)
      ? (o.credentialSuggestions as unknown[])
        .map((c) => ({
          id: String((c as { id?: unknown })?.id ?? ""),
          why: String((c as { why?: unknown })?.why ?? "").trim().slice(0, 120),
        }))
        .filter((c) => allowed.has(c.id))
        .slice(0, 6)
      : [];

    const confidence = Number(o.confidence);
    return {
      normalizedOccupation: String(o.normalizedOccupation ?? "").trim().slice(0, 120),
      alternativeTitles: cleanLines(o.alternativeTitles, 3),
      skillGroups: groups,
      commonTools: cleanLines(o.commonTools, 8),
      commonSystems: cleanLines(o.commonSystems, 6),
      responsibilityThemes: themes,
      credentialSuggestions: creds,
      achievementQuestions: cleanQuestions(o.achievementQuestions, 6),
      importantKeywords: cleanLines(o.importantKeywords, 12),
      regulatoryWarnings: cleanLines(o.regulatoryWarnings, 2),
      /* An absent or unparseable confidence is treated as LOW, so the ambiguous case escalates
         rather than sailing through on a missing field. */
      confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
      cvLang,
    };
  }

  if (task === "experience_package") {
    const duties = cleanLines(o.responsibilitySuggestions, 6);
    const originals = (body.experience?.userBullets ?? []).filter((b) => typeof b === "string" && b.trim());
    if (!duties.length && !originals.length) return null;
    return {
      responsibilitySuggestions: duties,
      relevantTools: cleanLines(o.relevantTools, 6),
      achievementQuestions: cleanQuestions(o.achievementQuestions, 5),
      improvedUserBullets: cleanImprovements(o.improvedUserBullets, originals),
      missingEvidenceQuestions: cleanQuestions(o.missingEvidenceQuestions, 3),
      warnings: cleanLines(o.warnings, 2),
      cvLang,
    };
  }

  if (task === "final_content") {
    const summaries = Array.isArray(o.summaries)
      ? (o.summaries as unknown[])
        .map((s) => ({
          label: String((s as { label?: unknown })?.label ?? "").trim().slice(0, 40),
          text: scrubSuggestion(String((s as { text?: unknown })?.text ?? "")),
        }))
        /*
         * A summary keeps its figures. Unlike a duty, a summary is a restatement of a document
         * the user already approved, so a number in it came from their own confirmed content —
         * and stripping "seven years of experience" from a summary because it contains a digit
         * would delete the most useful sentence on the CV.
         */
        .filter((s) => s.text.length > 30)
        .slice(0, 3)
      : [];
    if (!summaries.length) return null;
    return {
      summaries,
      sectionOrder: cleanLines(o.sectionOrder, 12),
      priorityKeywords: cleanLines(o.priorityKeywords, 10),
      shortenSuggestions: Array.isArray(o.shortenSuggestions)
        ? (o.shortenSuggestions as unknown[]).slice(0, 5).map((s) => ({
          original: String((s as { original?: unknown })?.original ?? "").trim(),
          shorter: String((s as { shorter?: unknown })?.shorter ?? "").trim(),
        })).filter((s) => s.original && s.shorter)
        : [],
      duplicateWarnings: cleanLines(o.duplicateWarnings, 3),
      languageFixes: Array.isArray(o.languageFixes)
        ? (o.languageFixes as unknown[]).slice(0, 5).map((s) => ({
          original: String((s as { original?: unknown })?.original ?? "").trim(),
          fixed: String((s as { fixed?: unknown })?.fixed ?? "").trim(),
        })).filter((s) => s.original && s.fixed)
        : [],
      cvLang,
    };
  }

  // jd_delta
  const reqs = cleanLines(o.requirements, 8);
  const prefs = cleanLines(o.preferred, 6);
  if (!reqs.length && !prefs.length) return null;
  return {
    requirements: reqs,
    preferred: prefs,
    vocabulary: cleanLines(o.vocabulary, 8),
    extraKeywords: cleanLines(o.extraKeywords, 10),
    conflicts: cleanLines(o.conflicts, 2),
    cvLang,
  };
}

/**
 * Does this shaped output deserve the strong model?
 *
 * Two gates, and the second is the one the brief names explicitly: a blueprint whose own stated
 * confidence is below the threshold is the ambiguous-occupation case, and one extra request is
 * cheaper than a resume built on a misread job title.
 */
const CONFIDENCE_FLOOR = 0.55;

function escalationFor(task: AiTaskType, shaped: Record<string, unknown>): EscalationReason | null {
  const cvLang = shaped.cvLang === "ar" ? "ar" : "en";

  if (task === "role_blueprint") {
    if ((shaped.confidence as number) < CONFIDENCE_FLOOR) return "low-confidence";
    const groups = shaped.skillGroups as Array<{ items: string[] }>;
    const flat = groups.flatMap((g) => g.items);
    return qualityFloor(flat, { min: 8, cvLang });
  }
  if (task === "experience_package") {
    return qualityFloor(shaped.responsibilitySuggestions as string[], { min: 4, cvLang });
  }
  if (task === "final_content") {
    const texts = (shaped.summaries as Array<{ text: string }>).map((s) => s.text);
    return qualityFloor(texts, { min: 2, cvLang });
  }
  if (task === "jd_delta") {
    const conflicts = shaped.conflicts as string[];
    /* An advert describing two roles is the named escalation, not a thin answer. */
    if (conflicts.length) return "conflicting-jd";
  }
  return null;
}

/* ─────────────────────────── the provider call ─────────────────────────── */

/**
 * One Anthropic call, with the prompt split for caching.
 *
 * Two `cache_control` breakpoints, and the split is the whole design:
 *
 *   block 1  CORE_RULES     ~1900 tokens, identical for EVERY task and every user. The widest
 *                           possible sharing, which is where a cache earns its keep.
 *   block 2  TASK_SCHEMA    ~400 tokens, identical for every call of this task.
 *   message  the context    a few hundred tokens, different every time, deliberately outside
 *                           the cached prefix.
 *
 * The `ephemeral` type is the five-minute cache, which is the right lifetime here: a user filling
 * in a builder makes their two or three calls within minutes of each other, so the blueprint's
 * write is read back by the experience package and again by the final pass.
 */
async function callAnthropic(
  task: AiTaskType,
  model: string,
  message: string,
  maxTokens: number,
  timeoutMs: number,
  key: string,
): Promise<{ ok: true; text: string; usage: unknown } | { ok: false; status: number; error: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
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
        temperature: 0.3,
        system: [
          { type: "text", text: CORE_RULES, cache_control: { type: "ephemeral" } },
          { type: "text", text: TASK_SCHEMA[task] ?? "", cache_control: { type: "ephemeral" } },
        ],
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
  } finally {
    clearTimeout(timer);
  }
}

/* ─────────────────────────── the handler ─────────────────────────── */

export async function POST(req: NextRequest) {
  let raw: Body;
  try { raw = await req.json(); } catch { return bad("Malformed request."); }

  /*
   * Strip identifiers BEFORE anything reads the request — including the cache key.
   *
   * This guard used to live inside `/api/interview`, which was the only route that had it. That
   * route is deleted and the builder never had it, so until now a national ID or an IBAN typed
   * into a form field travelled to Anthropic inside `facts` and could come back inside a summary
   * headed for a PDF. Scrubbing at the boundary, in the foundation, is the fix the route-bound
   * version was always missing: `scrubDeep` walks every string in the body, so a field added later
   * is covered without anyone remembering to cover it.
   *
   * The hits are logged as NAMES ("national-id", "iban") and never as values — knowing that a
   * scrub fired is operationally useful; recording what it caught would recreate the leak in the
   * log.
   */
  const piiHits: string[] = [];
  const body: Body = scrubDeep(raw, piiHits);
  if (piiHits.length) console.error(`[generate] scrubbed ${[...new Set(piiHits)].join(",")} from the request`);

  const task = TASKS.find((t) => t === body.task);
  if (!task) return bad("Unknown task.");

  const ctx = normalizeContext(body.context ?? {});
  if (!ctx.occupation) return bad("Add the job title first.");

  const promptCtx: PromptContext = {
    occupation: body.context?.occupation?.trim() ?? "",
    specialization: body.context?.specialization?.trim(),
    seniority: body.context?.seniority?.trim(),
    country: body.context?.country?.trim() ?? "",
    cvLang: ctx.cvLang,
    industry: body.context?.industry?.trim(),
  };

  /*
   * Rate limited on its own bucket, at a lower count than /api/suggest.
   *
   * These calls are bigger and rarer by design: three per CV against a dozen refinements. A
   * caller exceeding 20 in ten minutes is not filling in a resume, and the ceiling is deliberately
   * tighter than the refinement bucket's so a loop here is caught sooner.
   */
  const ip = clientIp(req);
  if (!await allowShared(`gen:${ip}`, 20, 600_000)) {
    return NextResponse.json(
      { error: ctx.cvLang === "ar" ? "طلبات كثيرة في وقت قصير — جرّب بعد قليل." : "Too many requests — try again shortly." },
      { status: 429 },
    );
  }

  const cfg = modelConfig();
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    /*
     * No key is not an error here, it is a MISS.
     *
     * Part 20's fallback order puts the local role packs above manual entry, and this route's
     * caller already knows how to use them — `rolePacks.ts` answers the same questions instantly
     * and for free. Returning 503 with a body that says so lets the client fall through without
     * having to guess whether the failure is permanent.
     */
    console.error(
      `[generate] ANTHROPIC_API_KEY is empty — task=${task} refused. `
      + `The client should fall back to local role packs. Env vars are snapshotted at build time.`,
    );
    return NextResponse.json({ error: "Suggestions are temporarily unavailable.", fallback: "local" }, { status: 503 });
  }

  /* ── the shared pack cache, for the two tasks that are about an occupation ── */

  const shareable = task === "role_blueprint";
  const cacheKey = shareable
    ? packKey({ ...ctx, modelVersion: cfg.version })
    : task === "jd_delta"
      ? jdDeltaKey(packKey({ ...ctx, modelVersion: cfg.version }), body.jobAd ?? "")
      : "";

  if (cacheKey) {
    const hit = await readPack<Record<string, unknown>>(cacheKey);
    if (hit) {
      logUsage({
        route: "generate", op: `${task}:cache-hit`, provider: "cache", model: hit.model,
        input: 0, output: 0, ms: 0,
      });
      return NextResponse.json({ ...hit.result, _cache: { hit: true, ageMs: Date.now() - hit.createdAt } });
    }
  }

  /* ── the message: compact, task-specific, nothing extra ── */

  const message =
    task === "role_blueprint" ? blueprintMessage(promptCtx, { confirmedSkills: body.confirmedSkills?.slice(0, 30) })
    : task === "experience_package" ? experienceMessage(promptCtx, {
      title: body.experience?.title?.trim() ?? promptCtx.occupation,
      department: body.experience?.department?.trim(),
      industry: body.experience?.industry?.trim(),
      tools: body.experience?.tools?.slice(0, 12),
      userBullets: body.experience?.userBullets?.slice(0, 10),
      current: body.experience?.current,
    }, body.themes?.slice(0, 8) ?? [])
    : task === "final_content" ? finalMessage(promptCtx, (body.facts ?? "").slice(0, 6000), {
      sections: body.sections?.slice(0, 12), jobAd: body.jobAd?.slice(0, 3000),
    })
    : jdDeltaMessage(promptCtx, (body.jobAd ?? "").slice(0, 3000), body.baseline?.slice(0, 12) ?? []);

  if (task === "final_content" && !(body.facts ?? "").trim()) return bad("There is nothing confirmed to summarise yet.");
  if (task === "jd_delta" && !(body.jobAd ?? "").trim()) return bad("Paste the job advert first.");

  /*
   * ── the attempt ladder ──
   *
   * At most three provider calls, and each step needs a named reason:
   *
   *   1  fast model
   *   2  fast model again, ONLY if the shape was unusable. One safe retry, per Part 8 — a model
   *      that returned prose instead of JSON often returns JSON when asked again, and this costs
   *      the cheap model twice rather than the expensive model once.
   *   3  reasoning model, with an escalation reason that is logged.
   *
   * Note what cannot happen: a 5xx does not retry. That is the provider saying it failed, and on
   * a metered model an immediate repeat pays twice for the same refusal — the same rule
   * `lib/aiTasks.ts` applies on the client, for the same reason.
   */
  const t0 = Date.now();
  let escalation: EscalationReason | null = null;
  let attempts = 0;
  let lastError = "";
  let lastStatus = 502;

  for (let step = 0; step < 3; step++) {
    const route = routeModel(task, { escalate: escalation, config: cfg });
    attempts++;
    const out = await callAnthropic(task, route.model, message, route.maxOutput, route.timeoutMs, apiKey);

    if (!out.ok) {
      lastError = out.error; lastStatus = out.status;
      logUsage({
        route: "generate", op: `${task}:http-${out.status}`, provider: "anthropic", model: route.model,
        input: 0, output: 0, ms: Date.now() - t0, note: `attempt ${attempts}`,
      });
      break;
    }

    const usage = fromAnthropic(out.usage);
    const usd = estimateCallCost(route.model, usage);
    logUsage({
      route: "generate",
      op: `${task}${route.escalated ? `:escalated:${route.reason}` : ""}`,
      provider: "anthropic", model: route.model,
      ...usage, ms: Date.now() - t0,
      note: `attempt=${attempts} usd=${usd.toFixed(6)} cached=${usage.cacheRead > 0}`,
    });

    /*
     * The response is scrubbed too, not only the request.
     *
     * Belt and braces on purpose. The input scrub is the one that matters — an identifier should
     * never reach the provider at all — but a model that was shown a document containing one can
     * repeat it, and this is the last point before the text becomes a suggestion the user taps into
     * a PDF. Scrubbing before `shapeFor` means the shaped result, the cached pack and the response
     * all carry the same clean text.
     */
    const outHits: string[] = [];
    const cleanText = scrubDeep(out.text, outHits);
    if (outHits.length) console.error(`[generate] scrubbed ${[...new Set(outHits)].join(",")} from the response`);

    const shaped = shapeFor(task, extractJsonValue(cleanText), body);

    if (!shaped) {
      /* Schema failure. One safe retry on the cheap model, then escalate — never loop. */
      if (step === 0) continue;
      if (step === 1 && !escalation) { escalation = "schema-invalid-retry"; continue; }
      break;
    }

    const needsBetter = escalationFor(task, shaped);
    if (needsBetter && !escalation && step < 2) {
      console.error(`[generate] escalating ${task}: ${needsBetter} (model ${route.model})`);
      escalation = needsBetter;
      continue;
    }

    if (cacheKey) {
      const stored = await writePack(cacheKey, {
        result: shaped, model: route.model, createdAt: Date.now(),
        usageCount: 0, qualityStatus: "generated",
      });
      if (!stored && packCacheConfigured()) console.error(`[generate] pack not cached: ${cacheKey}`);
    }

    return NextResponse.json({
      ...shaped,
      _meta: {
        model: route.model,
        escalated: route.escalated,
        reason: route.reason,
        attempts,
        cachedPrefix: usage.cacheRead > 0,
        cacheWriteTokens: usage.cacheWrite,
        cacheReadTokens: usage.cacheRead,
        inputTokens: usage.input,
        outputTokens: usage.output,
        estimatedUsd: Number(usd.toFixed(6)),
        ms: Date.now() - t0,
        sharedCache: packCacheConfigured() ? "configured" : "absent",
      },
    });
  }

  return NextResponse.json(
    {
      error: ctx.cvLang === "ar"
        ? "الاقتراحات غير متاحة الآن. أكمل يدوياً أو جرّب مرة أخرى."
        : "Suggestions are temporarily unavailable. You can continue manually or try again.",
      fallback: "local",
      ...(lastError ? { detail: lastError.slice(0, 120) } : {}),
    },
    { status: lastStatus >= 400 && lastStatus < 500 ? lastStatus : 502 },
  );
}

function bad(msg: string) { return NextResponse.json({ error: msg }, { status: 400 }); }
