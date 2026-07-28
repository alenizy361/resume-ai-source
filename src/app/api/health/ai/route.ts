import { NextRequest, NextResponse } from "next/server";
import { TASKS, TASK_NAMES } from "@/app/lib/aiTasks";
import { fromAnthropic } from "@/app/lib/usage";
import {
  modelConfig, MAX_OUTPUT, TASK_CLASS, estimateCallCost, canDisableThinking, thinksByDefault,
  acceptsTemperature, type AiTaskType, NVIDIA_DEFAULT_MODEL,
} from "@/app/lib/aiModels";
import { PROMPT_VERSION, RULES_VERSION } from "@/app/lib/aiCache";
import { CORE_RULES, TASK_SCHEMA, estimateTokens, cacheFloorFor } from "@/app/lib/aiPrompts";
import { CHARS_PER_TOKEN, MEASURED_FINAL_CONTENT, cacheVerdict } from "@/app/lib/aiEconomics";
import { countTokensReport } from "@/app/lib/aiTokenCount";
import { sampleTextPdf, transcribe } from "@/app/lib/ocr";
import { OUTPUT_SCHEMA, schemaRequestFor, structuredOutputsEnabled } from "@/app/lib/aiSchemas";
import { packCacheConfigured, redisPing } from "@/app/lib/packCache";
import { redisSource } from "@/app/lib/redisEnv";
import { ruleProvenance, staleRules } from "@/app/lib/countryRules";
import { budgets } from "@/app/lib/aiBudget";
import { priceMismatch } from "@/app/lib/plans";
import { supportEmailIsPersonal } from "@/app/lib/brand";

export const maxDuration = 60;
/** Never cached: the whole value of this endpoint is that it describes the process NOW. */
export const dynamic = "force-dynamic";

/**
 * Is the AI actually wired up, and is it wired up the way the code assumes?
 *
 * The question this answers is one the product could not previously answer at all. Every AI
 * failure looked the same from outside — a section saying "the assistant is unavailable" —
 * whether the cause was a missing API key, a wrong model name, an expired credential, a
 * regional outage, or a rate limiter silently running in-memory because Upstash was never
 * configured. Four very different problems, one sentence.
 *
 * Two modes, and the split is deliberate:
 *
 *   GET /api/health/ai              — CONFIGURATION only. Reads env presence, the task
 *                                     registry and the rate-limit backing. Makes no model
 *                                     call and costs nothing. Safe to poll.
 *   GET /api/health/ai?live=1       — additionally sends ONE minimal completion and reports
 *                                     whether it came back and how long it took.
 *
 * `live` is opt-in per request because it SPENDS MONEY. The owner's AI budget paid for the
 * last hundred-call test round, and a health check that quietly bills a token on every
 * uptime ping would be the same mistake automated.
 *
 * ── security ──
 *
 * This endpoint describes internals, so it is gated on `HEALTH_TOKEN` and answers 404 —
 * not 401 — to anything without it. A 401 confirms the endpoint exists, which is exactly
 * the fact worth withholding from someone probing for it.
 *
 * It reports whether a secret is PRESENT and never what it is. No key, no token, no
 * fragment of one, no length. `redact()` exists so that adding a field cannot accidentally
 * leak a value: it takes an env name and returns a boolean, and there is no code path here
 * that reads `process.env[x]` into the response.
 */

/** Present or absent. Never the value, never part of it, never its length. */
function redact(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

export async function GET(req: NextRequest) {
  const expected = process.env.HEALTH_TOKEN;
  const given = req.headers.get("x-health-token") || req.nextUrl.searchParams.get("token");

  /*
   * No token configured means the endpoint does not exist, on purpose.
   *
   * A deployment that forgets to set HEALTH_TOKEN must not end up with an open diagnostics
   * endpoint — failing closed here is the difference between "this is off" and "this is off
   * to everyone who has not guessed".
   */
  if (!expected || given !== expected) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const provider = (process.env.AI_PROVIDER || "nvidia").toLowerCase();
  /*
   * The builder's suggestions can run on a different provider from everything else — a fast
   * cheap model behind a form field, a stronger one for whole-document work. Reporting only the
   * global would make this endpoint lie about the call most users actually make.
   */
  const suggestProvider = (process.env.AI_PROVIDER_SUGGEST || process.env.AI_PROVIDER || "nvidia").toLowerCase();
  /*
   * The same resolution the routes do, not a paraphrase of it.
   *
   * `/api/interview` defaults Anthropic to claude-opus-5 (a reasoning turn) and `/api/suggest`
   * to claude-haiku-4-5 (a form field the user is watching). Reporting one number would be
   * wrong for the other, so both are reported.
   */
  const shared = process.env.AI_MODEL || "";
  const model = provider === "anthropic"
    ? (process.env.ANTHROPIC_MODEL || (/^claude/i.test(shared) ? shared : "claude-opus-5"))
    : (process.env.NVIDIA_MODEL || (/^claude/i.test(shared) ? "" : shared) || NVIDIA_DEFAULT_MODEL);
  const suggestModel = suggestProvider === "anthropic"
    ? (process.env.ANTHROPIC_MODEL_SUGGEST || "claude-haiku-4-5")
    : (process.env.NVIDIA_MODEL || (/^claude/i.test(shared) ? "" : shared) || NVIDIA_DEFAULT_MODEL);

  const keyPresent = provider === "anthropic" ? redact("ANTHROPIC_API_KEY") : redact("NVIDIA_API_KEY");
  /* The failure this catches: AI_PROVIDER_SUGGEST set to anthropic with no Anthropic key, which
     is a 503 on every suggestion and nothing else. */
  const suggestKeyPresent = suggestProvider === "anthropic" ? redact("ANTHROPIC_API_KEY") : redact("NVIDIA_API_KEY");
  const upstash = packCacheConfigured();

  /*
   * A real PING, not a presence check.
   *
   * Free — no model tokens, one Redis command — and it is the only thing that distinguishes a
   * working store from a wrong URL, a revoked token or a database that was deleted from the
   * console. All three of those read as "configured" to anything that inspects `process.env`, and
   * all three behave exactly like "absent" at runtime.
   *
   * Unlike the model probe below, this is NOT gated behind `?live=1`, because the reason that gate
   * exists is cost and this has none.
   */
  const redis = await redisPing();

  const report: Record<string, unknown> = {
    ok: keyPresent && suggestKeyPresent,
    provider,
    model,
    /** What the builder's suggestions actually run on — the call most users meet. */
    suggestProvider,
    suggestModel,
    suggestKeyPresent,
    /** The one that turns "the assistant is unavailable" into a five-second diagnosis. */
    apiKeyPresent: keyPresent,

    /*
     * The cost machinery, reported because every part of it fails SILENTLY.
     *
     * A prompt prefix under the cache floor is accepted by the API and simply not cached. An unset
     * Upstash means the shared pack cache misses forever. An unverified country rule still gets
     * shown. None of those produce an error anywhere, so the only way to know is to ask.
     */
    cost: {
      models: modelConfig(),
      taskClasses: TASK_CLASS,
      maxOutput: MAX_OUTPUT,
      budgets: budgets(),
      promptVersion: PROMPT_VERSION,
      rulesVersion: RULES_VERSION,
      /*
       * The measurement Part 13 insists on. `cachedPrefixTokens` under `cacheFloorTokens` means
       * the `cache_control` markers are decoration — the request is longer and nothing is cached.
       * Estimated here; the authoritative numbers come from each response's usage block and are
       * reported per call in /api/generate's `_meta`.
       */
      /*
       * Measured against the floor for the model THIS deployment uses, not against a constant.
       *
       * The constant was 1024 and the suggestion model's floor is 4096, so this reported
       * `cacheablePrefix: true` while every call paid full price. The `?live=1` probe is what
       * caught it — `cacheWriteTokens: 0` on a request whose markers were accepted.
       */
      /*
       * ONE task named, because two numbers both labelled "the prefix" is how this field started
       * confusing people: this said 2329 (role_blueprint) while `cacheDecision` said 2261
       * (final_content), side by side, neither saying which task it meant. Both were true. Together
       * they read like a contradiction.
       */
      cachedPrefixTask: "role_blueprint",
      cachedPrefixTokens: estimateTokens(CORE_RULES) + estimateTokens(TASK_SCHEMA.role_blueprint ?? ""),
      /* Every task's prefix, since they differ by up to 168 tokens and the floor question is
         per task, not per product. */
      prefixTokensByTask: Object.fromEntries(
        Object.entries(TASK_SCHEMA).map(([k, v]) => [k, estimateTokens(CORE_RULES) + estimateTokens(v ?? "")]),
      ),
      prefixTokensEstimated: true,
      /* The constant moved from 3.594 to 4.067 when count_tokens showed the first calibration was
         13% high; this sentence quoted the old one and would have sent the next reader to the wrong
         arithmetic. Read from the export so it cannot drift again. */
      prefixTokensNote:
        `Estimated at ${CHARS_PER_TOKEN} chars/token, recalibrated against count_tokens. Add `
        + "?tokens=1 for exact per-model counts — that endpoint returns a count and no completion, "
        + "so it bills nothing.",
      cacheFloorTokens: cacheFloorFor(suggestModel),
      cacheablePrefix:
        estimateTokens(CORE_RULES) + estimateTokens(TASK_SCHEMA.role_blueprint ?? "")
        >= cacheFloorFor(suggestModel),
      cacheFloorNote:
        "Model-dependent and not monotonic: 512 on Opus 5, 4096 on Haiku 4.5. Below it the "
        + "cache_control marker is accepted and silently ignored.",
      /*
       * The VERDICT, not just the boolean.
       *
       * `cacheablePrefix: false` is true and was being read as a fault to fix — and fixing it, at
       * this traffic, costs 57% more per call: crossing Haiku's 4096 floor means a LONGER prefix,
       * a write is billed at 1.25x, and at four calls an hour every call is a write. The arithmetic
       * that shows this lives in `lib/aiEconomics.ts`, anchored to a real logged call and asserted
       * in `ops/economics.test.mjs`, so the recommendation is recomputed when prices or the prefix
       * change rather than remembered from a conversation.
       *
       * It flips on its own: raise the traffic past the stated threshold, or move the task to a
       * tier with a lower floor, and the same function says caching is active.
       */
      cacheDecision: cacheVerdict(MEASURED_FINAL_CONTENT),
      schemaTokens: Object.fromEntries(
        Object.entries(TASK_SCHEMA).map(([k, v]) => [k, estimateTokens(v ?? "")]),
      ),
      /**
       * Absent means the between-users pack cache misses every time. Not an error; a cost.
       *
       * `redisSource` names WHICH spelling was found, because there are two in circulation
       * (`UPSTASH_REDIS_REST_*` from Upstash's integration, `KV_REST_API_*` from a store created
       * through Vercel's Storage tab) and `"half"` is the case worth seeing: one of the pair set
       * and not the other, which behaves like absent and reads like configured.
       */
      sharedPackCache: !upstash ? "absent" : redis.ok ? "live" : "configured but unreachable",
      redisCredentials: redisSource(),
    },

    /*
     * Where the credential data comes from, and how much of it nobody has checked.
     *
     * Reported rather than assumed because `encoded` rules are shipped deliberately — the
     * confirmation step makes them safe — and the honest position is that the count is visible
     * instead of implied.
     */
    countryRules: {
      ...ruleProvenance(),
      overdue: staleRules(new Date().toISOString().slice(0, 10)),
    },

    /*
     * `allowShared` falls back to an in-memory counter when Upstash is unset, which works
     * and is nearly useless: each serverless instance keeps its own count, so the real
     * limit is the configured number times however many instances are warm. Worth stating
     * plainly rather than discovering during an incident.
     */
    rateLimit: {
      /* `configured-but-unreachable` is its own state and the most misleading one to omit: the
         operator sees a database in their dashboard and the app is counting in memory. */
      backing: !upstash ? "in-memory" : redis.ok ? "redis" : "in-memory (redis unreachable)",
      shared: upstash && redis.ok,
      redis: redis.ok ? { ok: true, ms: redis.ms } : { ok: false, error: redis.error },
      note: upstash
        ? "Counts are shared across instances."
        : "Counts are per-instance — the effective limit is higher than configured.",
    },

    /** The registry the client dispatches through, so a mismatch is visible from here. */
    tasks: {
      count: TASK_NAMES.length,
      byBucket: TASK_NAMES.reduce<Record<string, number>>((acc, n) => {
        acc[TASKS[n].bucket] = (acc[TASKS[n].bucket] ?? 0) + 1;
        return acc;
      }, {}),
      names: TASK_NAMES,
    },

    /*
     * Two configuration faults that are invisible in the UI until they cost someone money
     * or send mail nobody reads. Both already have functions that answer them; this is the
     * one place that asks.
     */
    pricing: {
      mismatchedPlans: priceMismatch(),
      ok: priceMismatch().length === 0,
    },
    support: {
      isPersonalMailbox: supportEmailIsPersonal(),
      ok: !supportEmailIsPersonal(),
    },

    /*
     * Email needs TWO things and an integration can only supply one.
     *
     * `RESEND_API_KEY` arrives with the Vercel integration; `EMAIL_FROM` is a verified sender on
     * the operator's own domain and no integration can know it. With the key and no sender,
     * `sendEmail` returns false without throwing — so magic-link sign-in, payment receipts and
     * "email my results" are all dead, quietly, and the dashboard shows Resend connected.
     *
     * Reported as `ok` only when both halves are present, for exactly the reason the AI `ok` needed
     * both keys: a half-configured service that reports healthy is worse than one that reports
     * nothing.
     */
    email: {
      keyPresent: redact("RESEND_API_KEY"),
      senderPresent: redact("EMAIL_FROM"),
      ok: redact("RESEND_API_KEY") && redact("EMAIL_FROM"),
      note: redact("RESEND_API_KEY") && !redact("EMAIL_FROM")
        ? "RESEND_API_KEY is set and EMAIL_FROM is not — every email is refused before it is sent."
        : undefined,
    },

    live: null as unknown,
    /** The suggestion provider's own probe. Null unless `?live=1`. */
    liveSuggest: null as unknown,
    /** Exact per-model token counts. Null unless `?tokens=1`. Bills nothing. */
    tokens: null as unknown,
    /** Whether the API accepts our JSON Schemas. Null unless `?live=1`. */
    liveSchema: null as unknown,
    /** Whether a scanned/photographed CV can actually be read. Null unless `?live=1`. */
    liveOcr: null as unknown,
  };

  /*
   * ── the free measurement ──
   *
   * Every cache decision in `docs/cost.md` turns on whether the prefix clears a model's floor, and
   * every number behind it was ESTIMATED at 3.594 characters per token. Good enough against a floor
   * 1.8x away, and still an estimate — and token counts are model-specific, so one estimate cannot
   * answer the question for three models.
   *
   * `POST /v1/messages/count_tokens` answers it exactly and returns a count with NO completion:
   * no output tokens, no input tokens, nothing on the invoice. So unlike `?live=1`, this needs no
   * spending warning — it needs the opposite, a note saying it is free, because the reflex around
   * anything that touches a model API is to assume it costs.
   *
   * Separate from `?live=1` on purpose. That flag means "spend money"; conflating a free probe with
   * it would make the free one unusable by anyone reading the warning.
   */
  if (req.nextUrl.searchParams.get("tokens") === "1") {
    report.tokens = await countTokensReport();
  }

  if (req.nextUrl.searchParams.get("live") !== "1") {
    report.live = { ran: false, note: "Add ?live=1 to send one real completion. That spends model credit." };
    return NextResponse.json(report);
  }

  /*
   * ── probe what CAN be probed, rather than nothing ──
   *
   * This used to return 503 the moment EITHER key was missing, having probed neither. Which means
   * the live diagnostic was unavailable in precisely the situation it exists for: one provider
   * configured, one not. Found on a preview deployment, where `ANTHROPIC_API_KEY` is present and
   * `NVIDIA_API_KEY` is scoped to production — so `?live=1` refused to test the Anthropic half that
   * was sitting there working.
   *
   * `ok` still requires both, and the status is still 503 when a key is missing. What changes is that
   * the half that CAN answer does, and the half that cannot says so by name.
   */
  if (!keyPresent && !suggestKeyPresent) {
    report.live = { ran: false, ok: false, note: "No API key for either provider — nothing to call." };
    return NextResponse.json(report, { status: 503 });
  }

  /*
   * The smallest honest probe: ask for one word, cap the output, and report latency.
   *
   * Not "is the service up" in the abstract — whether THIS key, against THIS model name,
   * returns a completion. A wrong model id and an expired key both fail here, and the
   * provider's own error text is passed through because it distinguishes them.
   *
   * BOTH brains are probed when they differ, and that is the whole point of the split. The
   * configuration half of this report already describes two providers; a live half that
   * probed only the global one would return `ok: true` for a deployment whose suggestions —
   * the call most users actually make — fail on every tap. So the endpoint asks each
   * provider its own question, against its own model name, and `ok` requires both.
   */
  const t0 = Date.now();
  try {
    const out = keyPresent
      ? { ran: true, ...await probe(provider, model), ms: Date.now() - t0 }
      : { ran: false, ok: false, note: `No key for the ${provider} provider on this deployment.` };
    report.live = out;

    /* Same provider AND same model id means one probe already answered for both. */
    const shares = suggestProvider === provider && suggestModel === model;
    const t1 = Date.now();
    const sug = !suggestKeyPresent
      ? { ran: false, ok: false, note: `No key for the ${suggestProvider} provider on this deployment.` }
      : shares && keyPresent
        ? { ...out, sharedWithGlobal: true }
        : { ran: true, ...await probe(suggestProvider, suggestModel), ms: Date.now() - t1 };
    report.liveSuggest = sug;

    /*
     * ── the escalation tier, probed on purpose ──
     *
     * Nothing here normally touches `cfg.reasoningModel`. Escalation needs a low-confidence
     * classification, or a schema failure, or an explicit tailoring request — so a request shape
     * that is wrong for that model can sit broken indefinitely while every dashboard reads green.
     * That is not hypothetical: `/api/translate` escalated to Sonnet 5 with `temperature: 0`, which
     * that model rejects, so EVERY escalated translation was an HTTP 400 and the retry meant to
     * rescue a bad translation had never once run.
     *
     * One small call proves the shape is accepted. It sends the real cached prefix with
     * `max_tokens: 4` — roughly $0.007 on Sonnet 5, once, only when `?live=1` is passed, which
     * already announces that it spends credit.
     *
     * Skipped when the reasoning model IS the fast model, because then the probe above already
     * answered for it and a second identical call would be paying twice to learn nothing.
     */
    const cfg = modelConfig();
    if (suggestProvider === "anthropic" && suggestKeyPresent && cfg.reasoningModel !== suggestModel) {
      const t2 = Date.now();
      const esc = await probeAnthropic(cfg.reasoningModel);
      report.liveEscalation = {
        ran: true, model: cfg.reasoningModel, ...esc, ms: Date.now() - t2,
        why: "The escalation tier is rarely exercised, so a request shape that is wrong for it "
          + "fails silently. A 400 here means escalated generations are broken.",
      };
    } else {
      report.liveEscalation = {
        ran: false,
        note: !suggestKeyPresent
          ? "No Anthropic key on this deployment — nothing to probe."
          : cfg.reasoningModel === suggestModel
            ? "The reasoning model is the fast model — the probe above already covered it."
            : "The suggestion provider is not Anthropic; there is no Claude escalation tier to probe.",
      };
    }

    /*
     * ── does the API accept our JSON Schemas? ──
     *
     * `lib/aiSchemas.ts` is written, tested and switched OFF, because the one thing a local test
     * cannot establish is whether the provider accepts these schemas and whether a constrained model
     * still honours the LIMITS prose. Leaving that unanswered is how a flag stays off forever and the
     * 4x schema-invalid retry path stays reachable.
     *
     * So one real call per schema, with `output_config` attached. A 400 on any of them means that
     * schema is malformed and the switch must stay off; all four accepted, each returning exactly its
     * own keys, is what makes turning it on defensible.
     *
     * ALL FOUR, not just the cheapest. The first version of this probed `jd_delta` alone and reported
     * "safe to turn on" — a verdict about four schemas drawn from evidence about one. They are built
     * from the same three helpers, which is an argument and not a measurement: the four differ in
     * nesting, and `role_blueprint` is the only one carrying a `number` field and an array-of-objects
     * whose own property is an array.
     *
     * Roughly $0.012 for the set, only under `?live=1`, which already announces that it spends credit.
     */
    if (suggestProvider === "anthropic" && suggestKeyPresent) {
      const t3 = Date.now();
      report.liveSchema = { ...(await probeSchemas(suggestModel)), ms: Date.now() - t3 };
    } else {
      report.liveSchema = { ran: false, note: "No Anthropic key on this deployment — nothing to probe." };
    }

    /*
     * ── can a scanned CV actually be read? ──
     *
     * `/api/ocr` is the only route a user reaches by choosing to send their FILE to a model, and it is
     * reachable solely from a failure state — someone whose upload came back unreadable. That is the
     * least-trodden path in the product and the one most likely to rot unnoticed.
     *
     * So the probe builds a small PDF in code, carrying a sentence it knows, and pushes it through the
     * SAME `transcribe()` the upload uses. What it proves is the pipeline: document block accepted,
     * page rasterised, words returned. What it does NOT prove is Arabic quality — Helvetica cannot set
     * Arabic, so the sample is Latin, and the note below says so rather than letting a green tick
     * imply more than it earned.
     */
    if (suggestKeyPresent) {
      const t4 = Date.now();
      const phrase = "Radiology Technologist King Fahad Hospital Riyadh";
      const r = await transcribe(sampleTextPdf(phrase), "application/pdf", { timeoutMs: 25_000 });
      /* Word-level rather than exact-string: a transcription may legitimately differ in spacing or
         line breaks, and demanding a byte match would fail on a correct read. */
      const words = phrase.split(" ");
      const got = r.text.toLowerCase();
      const found = words.filter((w) => got.includes(w.toLowerCase()));
      report.liveOcr = {
        ran: true, model: r.model, status: r.status, ok: r.ok,
        wordsExpected: words.length, wordsFound: found.length,
        missed: words.filter((w) => !got.includes(w.toLowerCase())),
        inputTokens: r.inputTokens, outputTokens: r.outputTokens,
        estimatedUsd: r.estimatedUsd, ms: Date.now() - t4,
        ...(r.error ? { error: r.error } : {}),
        verdict: !r.ok
          ? "The provider refused the document. Scanned and photographed CVs cannot be read — /api/ocr is down."
          : found.length === words.length
            ? "A code-generated PDF was transcribed word for word. The document pipeline works. This says "
              + "nothing about ARABIC transcription quality: the sample is Latin because the embedded font "
              + "cannot set Arabic. Judge that from a real photograph."
            : `Only ${found.length} of ${words.length} words came back. The pipeline runs but the read is unreliable.`,
      };
    } else {
      report.liveOcr = { ran: false, note: "No Anthropic key on this deployment — nothing to probe." };
    }

    report.ok = keyPresent && suggestKeyPresent && out.ok === true && sug.ok === true;
    return NextResponse.json(report, { status: report.ok ? 200 : 502 });
  } catch (e) {
    report.live = {
      ran: true, ok: false, ms: Date.now() - t0,
      error: e instanceof Error ? e.message.slice(0, 200) : "probe failed",
    };
    report.ok = false;
    return NextResponse.json(report, { status: 502 });
  }
}

/** Route a probe to the provider that will actually serve the call being described. */
function probe(which: string, model: string): Promise<ProbeResult> {
  return which === "anthropic" ? probeAnthropic(model) : probeNvidia(model);
}

/** One token out, ten-second ceiling. A probe that can hang is not a health check. */
/** What a probe reports. The cache fields are Anthropic-only and absent elsewhere. */
interface ProbeResult {
  ok: boolean;
  status?: number;
  error?: string;
  promptCached?: boolean;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  uncachedInputTokens?: number;
  estimatedUsd?: number;
}

async function probeNvidia(model: string): Promise<ProbeResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with the single word: ok" }],
        max_tokens: 4,
        temperature: 0,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: body.slice(0, 200) };
    }
    const data = await res.json().catch(() => null);
    const text = data?.choices?.[0]?.message?.content;
    return { ok: typeof text === "string" && text.length > 0, status: res.status };
  } finally { clearTimeout(timer); }
}

/**
 * The Anthropic probe sends THE REAL CACHED PREFIX, not a toy prompt.
 *
 * It used to ask "reply with the single word: ok" with no system block at all, and that made it
 * blind to the one thing it most needed to see. Prompt caching fails SILENTLY: `cache_control` on
 * a prefix under the provider's minimum is accepted and quietly ignored, and so is a prefix that
 * stopped being byte-identical because someone interpolated a user value into it. Neither produces
 * an error. A probe whose prompt has a different SHAPE from production cannot detect either, so it
 * would report a healthy model on a deployment paying full price for every request.
 *
 * So the probe carries the same two cached blocks `/api/generate` sends — `CORE_RULES` and one task
 * schema — and reports the cache token counts the provider returns. That is the difference between
 * "caching is configured" and "caching happened", and only the second one is evidence.
 *
 * ── the cost, stated plainly ──
 *
 * This makes the probe ~2300 input tokens instead of ~20. On the fast tier that is roughly
 * $0.003 for the first call (which WRITES the cache at a 1.25x premium) and about $0.0003 for
 * every call after it inside the five-minute window. `?live=1` is already opt-in and already
 * documented as spending money; this is a fraction of a cent buying the only measurement that
 * can confirm the caching design works at all.
 */
async function probeAnthropic(model: string): Promise<ProbeResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": String(process.env.ANTHROPIC_API_KEY),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4,
        /*
         * The same reasoning directive `/api/generate` sends, and the reason this line is here is a
         * bug that hid for months in a sibling route.
         *
         * `/api/translate` sent `temperature: 0` unconditionally while escalating to Sonnet 5, which
         * rejects any temperature but 1 — so every escalated translation was an HTTP 400 and nobody
         * knew, because escalation is rare and the route logged it and moved on. A probe that sends a
         * DIFFERENT request shape from production cannot catch that class of fault; a probe that
         * sends the same shape catches it on the first run.
         *
         * `thinking: {type: "disabled"}` is a parameter this product only started sending recently
         * and only on the escalation tier, which is exactly the shape that goes unexercised until it
         * matters. So the probe sends it too.
         */
        ...(thinksByDefault(model) && canDisableThinking(model)
          ? { thinking: { type: "disabled" } } : {}),
        /* Byte-identical to what /api/generate sends. If these two ever diverge the probe stops
           measuring production, which is the failure this whole function exists to avoid. */
        system: [
          { type: "text", text: CORE_RULES, cache_control: { type: "ephemeral" } },
          { type: "text", text: TASK_SCHEMA.role_blueprint ?? "", cache_control: { type: "ephemeral" } },
        ],
        messages: [{ role: "user", content: "Reply with the single word: ok" }],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: body.slice(0, 200) };
    }
    const data = await res.json().catch(() => null);
    const text = data?.content?.[0]?.text;
    const u = fromAnthropic(data);
    return {
      ok: typeof text === "string" && text.length > 0,
      status: res.status,
      /*
       * `promptCached` is the verdict, and it is `cacheRead > 0` — not `cacheWrite > 0`.
       *
       * A write means the prefix was ACCEPTED for caching; a read means it was actually SERVED from
       * cache, which is the only thing that saves money. The first call of a window writes and does
       * not read, so a single probe reporting `false` here is not yet a failure — call it twice.
       * Both numbers are returned so the difference is visible rather than inferred.
       */
      promptCached: u.cacheRead > 0,
      cacheReadTokens: u.cacheRead,
      cacheWriteTokens: u.cacheWrite,
      uncachedInputTokens: u.input,
      estimatedUsd: Number(estimateCallCost(model, u).toFixed(6)),
    };
  } finally { clearTimeout(timer); }
}

/* ─────────────────────────── the schema probe ─────────────────────────── */

/**
 * Send ONE real generation with `output_config` attached, and report whether it survived.
 *
 * The question this answers cannot be answered locally: `ops/schemas.test.mjs` proves the schemas sit
 * inside Anthropic's documented subset and name the same keys as the prompts, and none of that tells
 * you the provider will accept them. Until something does, `ANTHROPIC_STRUCTURED_OUTPUTS` is a switch
 * nobody can justify flipping, and the schema-invalid retry — a failed Haiku call plus a Sonnet
 * retry, about four times a clean generation — stays reachable.
 *
 * `jd_delta` on purpose: the smallest of the four schemas and the smallest output cap, so this is the
 * cheapest question that still gets a real answer.
 *
 * Reports three separate facts rather than one boolean, because they fail for different reasons and
 * want different fixes: whether the request was ACCEPTED (a 400 means a malformed schema), whether
 * the body PARSED as JSON, and whether the parsed object carries exactly the schema's keys. A 200
 * whose body is prose would pass a naive check and mean the constraint did nothing.
 */
async function probeSchema(model: string, task: AiTaskType): Promise<Record<string, unknown>> {
  const cfg = schemaRequestFor(task);
  if (!Object.keys(cfg).length) return { ran: false, note: `No schema defined for ${task}.` };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": String(process.env.ANTHROPIC_API_KEY),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        /*
         * The task's REAL cap, not a flat 300 — and this is the correction that matters.
         *
         * A flat 300 made this probe lie. `role_blueprint` has eleven keys and a nested
         * array-of-objects, so the model began emitting the full structure, hit the cap, and returned
         * truncated — therefore invalid — JSON with status 200. The probe reported "accepted, but the
         * body did not come back as this schema's keys", which reads exactly like a broken schema and
         * was actually a starved one. Testing an envelope with less room than production gives it is
         * not testing production.
         */
        max_tokens: MAX_OUTPUT[task],
        ...(acceptsTemperature(model) ? { temperature: 0.3 } : {}),
        ...(thinksByDefault(model) && canDisableThinking(model) ? { thinking: { type: "disabled" } } : {}),
        ...cfg,
        system: [
          { type: "text", text: CORE_RULES, cache_control: { type: "ephemeral" } },
          { type: "text", text: TASK_SCHEMA[task] ?? "", cache_control: { type: "ephemeral" } },
        ],
        /*
         * One short prompt for every task, and deliberately not a per-task fixture.
         *
         * What is under test is the ENVELOPE — does the provider accept this schema, and does the body
         * come back as its keys. A realistic per-task input would test the model's judgement too, at
         * four times the reading, and that is `ops/ai-stages.mjs`'s job. Here a thin prompt is a
         * feature: if the shape holds with almost nothing to say, it holds.
         */
        messages: [{
          role: "user",
          content: "OCCUPATION: radiology technologist\nCOUNTRY: sa\nCV LANGUAGE: en\n"
            + "BASELINE: performs CT and general radiography.\n"
            + "ADVERT: Radiology technologist. Requires SCFHS registration and 2 years of CT. "
            + "Preferred: MRI experience.\n"
            + "Answer in the schema. Keep every list to one short entry.",
        }],
      }),
    });

    const bodyText = await res.text().catch(() => "");
    if (!res.ok) {
      return {
        ran: true, accepted: false, status: res.status, error: bodyText.slice(0, 300),
        verdict: "The API REFUSED the schema. Keep ANTHROPIC_STRUCTURED_OUTPUTS off and fix the "
          + "schema before turning it on.",
      };
    }

    const data = JSON.parse(bodyText) as {
      content?: Array<{ text?: string }>; stop_reason?: string;
    };
    const text = data?.content?.[0]?.text ?? "";
    let parsed: Record<string, unknown> | null = null;
    try { parsed = JSON.parse(text) as Record<string, unknown>; } catch { parsed = null; }

    const want = Object.keys(OUTPUT_SCHEMA[task]?.properties ?? {});
    const got = parsed ? Object.keys(parsed) : [];
    const missing = want.filter((k) => !got.includes(k));
    const extra = got.filter((k) => !want.includes(k));
    const u = fromAnthropic(data);

    return {
      ran: true,
      accepted: true,
      status: res.status,
      task,
      parsedAsJson: parsed !== null,
      keysMatch: parsed !== null && missing.length === 0 && extra.length === 0,
      missing, extra,
      /*
       * Reported because without it three different failures look identical from outside: a schema
       * the provider refused, a model that ignored the constraint, and a response that simply ran out
       * of room. The first needs a schema fix, the third needs a bigger `max_tokens`, and treating one
       * as the other is how a working feature gets abandoned.
       */
      stopReason: data?.stop_reason ?? null,
      truncated: data?.stop_reason === "max_tokens",
      outputTokens: u.output,
      maxTokens: MAX_OUTPUT[task],
      estimatedUsd: Number(estimateCallCost(model, u).toFixed(6)),
      verdict: parsed !== null && missing.length === 0 && extra.length === 0
        ? "Accepted, and the body came back as exactly this schema's keys."
        : data?.stop_reason === "max_tokens"
          ? "Accepted, but the answer was cut off at max_tokens, so the JSON is incomplete. That is a "
            + "budget problem, not a schema problem — raise the cap for this task before judging it."
          : "Accepted, but the body did not come back as this schema's keys.",
    };
  } catch (e) {
    return { ran: true, accepted: false, error: e instanceof Error ? e.message.slice(0, 120) : "probe failed" };
  } finally { clearTimeout(timer); }
}

/**
 * Every schema, each in its own call, with one verdict over the set.
 *
 * Sequential rather than parallel: four requests behind an operator's page load do not need
 * concurrency, and a burst against a rate limit would turn a diagnostic into a 429 that reads like a
 * malformed schema — the exact confusion this probe exists to remove.
 *
 * `allAccepted` requires every task to have been accepted AND to have returned its own keys. One
 * failure is enough to keep the switch off, because a task whose schema 400s does not fall back to
 * prose: it fails the generation outright, which is worse than the retry the switch would remove.
 */
async function probeSchemas(model: string): Promise<Record<string, unknown>> {
  const tasks: AiTaskType[] = ["role_blueprint", "experience_package", "final_content", "jd_delta"];
  const byTask: Record<string, unknown> = {};
  let allAccepted = true;
  let truncated = false;
  let usd = 0;

  for (const task of tasks) {
    const r = await probeSchema(model, task);
    byTask[task] = r;
    if (!(r.accepted === true && r.keysMatch === true)) allAccepted = false;
    if (r.truncated === true) truncated = true;
    if (typeof r.estimatedUsd === "number") usd += r.estimatedUsd;
  }

  return {
    ran: true,
    model,
    allAccepted,
    estimatedUsd: Number(usd.toFixed(6)),
    byTask,
    truncated,
    /* Says what IS, not what to do: structured outputs went on by default once this probe first came
       back clean, so "safe to set ANTHROPIC_STRUCTURED_OUTPUTS=1" was advice to do something already
       done — the kind of stale instruction that makes a reader doubt the rest of the report. */
    enabledNow: structuredOutputsEnabled(),
    verdict: allAccepted
      ? "All four schemas were accepted and each returned exactly its own keys"
        + (structuredOutputsEnabled()
          ? " — and output_config is ON, so the schema-invalid retry (about four times a clean call) is "
            + "not reachable. ANTHROPIC_STRUCTURED_OUTPUTS=0 turns it off without a deploy."
          : " — but ANTHROPIC_STRUCTURED_OUTPUTS is set to off, so nothing is enforcing them. Remove "
            + "that override to get the saving.")
        + " Counts are still NOT enforced by the schema, only the shape, so the prose LIMITS and the "
        + "route's own validator both stay."
      : truncated
        ? "A schema ran out of output budget rather than being refused — see `truncated` per task. "
          + "That is a max_tokens problem, not a schema problem. Raise the cap and re-run before "
          + "concluding anything about the schema."
        : "At least one schema was refused or did not come back as its keys. Keep "
          + "ANTHROPIC_STRUCTURED_OUTPUTS off and fix that schema first — a refused schema fails the "
          + "generation outright rather than falling back to prose.",
  };
}
