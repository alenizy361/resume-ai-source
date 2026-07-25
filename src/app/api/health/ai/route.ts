import { NextRequest, NextResponse } from "next/server";
import { TASKS, TASK_NAMES } from "@/app/lib/aiTasks";
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
    : (process.env.NVIDIA_MODEL || (/^claude/i.test(shared) ? "" : shared) || "meta/llama-4-maverick-17b-128e-instruct");
  const suggestModel = suggestProvider === "anthropic"
    ? (process.env.ANTHROPIC_MODEL_SUGGEST || "claude-haiku-4-5")
    : (process.env.NVIDIA_MODEL || (/^claude/i.test(shared) ? "" : shared) || "meta/llama-4-maverick-17b-128e-instruct");

  const keyPresent = provider === "anthropic" ? redact("ANTHROPIC_API_KEY") : redact("NVIDIA_API_KEY");
  /* The failure this catches: AI_PROVIDER_SUGGEST set to anthropic with no Anthropic key, which
     is a 503 on every suggestion and nothing else. */
  const suggestKeyPresent = suggestProvider === "anthropic" ? redact("ANTHROPIC_API_KEY") : redact("NVIDIA_API_KEY");
  const upstash = redact("UPSTASH_REDIS_REST_URL") && redact("UPSTASH_REDIS_REST_TOKEN");

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
     * `allowShared` falls back to an in-memory counter when Upstash is unset, which works
     * and is nearly useless: each serverless instance keeps its own count, so the real
     * limit is the configured number times however many instances are warm. Worth stating
     * plainly rather than discovering during an incident.
     */
    rateLimit: {
      backing: upstash ? "upstash" : "in-memory",
      shared: upstash,
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

    live: null as unknown,
    /** The suggestion provider's own probe. Null unless `?live=1`. */
    liveSuggest: null as unknown,
  };

  if (req.nextUrl.searchParams.get("live") !== "1") {
    report.live = { ran: false, note: "Add ?live=1 to send one real completion. That spends model credit." };
    return NextResponse.json(report);
  }

  if (!keyPresent || !suggestKeyPresent) {
    report.live = {
      ran: false, ok: false,
      note: keyPresent
        ? "No API key for the suggestion provider — nothing to call."
        : "No API key configured — nothing to call.",
    };
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
    const out = await probe(provider, model);
    report.live = { ran: true, ...out, ms: Date.now() - t0 };

    /* Same provider AND same model id means one probe already answered for both. */
    const shares = suggestProvider === provider && suggestModel === model;
    const t1 = Date.now();
    const sug = shares ? out : await probe(suggestProvider, suggestModel);
    report.liveSuggest = shares
      ? { ran: true, ...sug, sharedWithGlobal: true }
      : { ran: true, ...sug, ms: Date.now() - t1 };

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
function probe(which: string, model: string) {
  return which === "anthropic" ? probeAnthropic(model) : probeNvidia(model);
}

/** One token out, ten-second ceiling. A probe that can hang is not a health check. */
async function probeNvidia(model: string): Promise<{ ok: boolean; status?: number; error?: string }> {
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

async function probeAnthropic(model: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
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
        messages: [{ role: "user", content: "Reply with the single word: ok" }],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: body.slice(0, 200) };
    }
    const data = await res.json().catch(() => null);
    const text = data?.content?.[0]?.text;
    return { ok: typeof text === "string" && text.length > 0, status: res.status };
  } finally { clearTimeout(timer); }
}
