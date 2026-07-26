/**
 * Exact token counts for this product's cached prefixes, per model — and it bills nothing.
 *
 * ── why this exists as a library and not inside the health route ──
 *
 * It began in `/api/health/ai`, and `ops/health.test.mjs` rejected it. That file forbids reading a
 * secret's VALUE anywhere in the route: the only permitted shapes are `redact("NAME")`, sending it
 * upstream in a header, and the `HEALTH_TOKEN` gate itself. Everything else is a mention on a path
 * that could reach the response body, and it fails whether or not it happens to be safe today.
 *
 * The probe was safe — the key went into a header and never into the response — and the guard was
 * still right to refuse it. A rule that only holds while everyone remembers why is not a rule. So
 * the provider call lives here, beside the other provider code, reads the key itself, and the route
 * gets a function it can call without ever touching a secret.
 *
 * ── why the measurement is worth a round trip ──
 *
 * Every caching decision in `docs/cost.md` rests on one comparison — prefix against the model's
 * floor — and every prefix behind it was ESTIMATED. That estimate was 13% high on Haiku
 * and it produced a wrong recommendation — see the correction in `aiEconomics.ts`.
 *
 * And it cannot be one figure. Token counts are model-specific: Sonnet 5's tokenizer produces
 * roughly 30% more tokens for the same text than Sonnet 4.6's, and Anthropic's guidance is to re-run
 * `count_tokens` per model rather than apply a multiplier. Since Haiku's floor is 4096 and Sonnet's
 * is 1024, "does this prefix cache?" genuinely has a different answer per model.
 *
 * ── it bills nothing ──
 *
 * `POST /v1/messages/count_tokens` returns a count and no completion: no output tokens, no input
 * tokens, no invoice line. That is why the health route exposes it under its own `?tokens=1` flag
 * rather than folding it into `?live=1` — one spends the owner's credit and one cannot, and a free
 * probe hidden behind a spending warning is a probe nobody runs.
 */

import { CORE_RULES, TASK_SCHEMA, estimateTokens, cacheFloorFor } from "./aiPrompts.ts";
import type { AiTaskType } from "./aiModels.ts";
import { DRAFTING_DOCTRINE } from "./prompts.ts";

/** The three tiers worth comparing. Their floors differ, which is the whole point. */
export const COUNTED_MODELS = ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"] as const;

interface Counted { tokens: number }
interface Failed { error: string }

async function countOnce(
  key: string, model: string, system: Array<{ type: "text"; text: string }>,
): Promise<Counted | Failed> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages/count_tokens", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": String(process.env.ANTHROPIC_API_KEY),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model, system, messages: [{ role: "user", content: "x" }] }),
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const data = await res.json() as { input_tokens?: number };
    return { tokens: data.input_tokens ?? 0 };
  } catch (e) {
    return { error: e instanceof Error ? e.message.slice(0, 80) : "request failed" };
  } finally {
    clearTimeout(timer);
  }
}

export interface TokenCountReport {
  ran: boolean;
  billed?: string;
  failures?: number;
  note: string;
  models?: Record<string, unknown>;
}

/**
 * Measure `CORE_RULES` and every task prefix on every counted model.
 *
 * Sequential, not parallel. Fifteen small requests behind an operator's manual page load do not need
 * concurrency, and a burst against a rate limit would turn a diagnostic into a 429 that reads like a
 * fault — which is the class of confusion this endpoint exists to end, not to add to.
 *
 * Reports the prompt total the API actually returned alongside the estimate for the same text, so a
 * drift between them is visible rather than something to work out. The `estimated` figure is
 * deliberately NOT subtracted out or reconciled: presenting a derived number as a measurement is how
 * a cost model comes to disagree with the invoice.
 */
export async function countTokensReport(): Promise<TokenCountReport> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    return { ran: false, note: "No Anthropic key on this deployment — nothing to measure." };
  }

  const tasks = (Object.keys(TASK_SCHEMA) as AiTaskType[])
    .filter((t) => (TASK_SCHEMA[t] ?? "").length > 0);

  const models: Record<string, unknown> = {};
  let failures = 0;

  for (const model of COUNTED_MODELS) {
    const floor = cacheFloorFor(model);

    /* `CORE_RULES` alone: the first cache breakpoint, shared by every task and every user, and the
       one whose verdict decides the caching question for the whole product. */
    const core = await countOnce(key, model, [{ type: "text", text: CORE_RULES }]);
    if ("error" in core) failures++;

    const byTask: Record<string, unknown> = {};
    for (const task of tasks) {
      const r = await countOnce(key, model, [
        { type: "text", text: CORE_RULES },
        { type: "text", text: TASK_SCHEMA[task] ?? "" },
      ]);
      if ("error" in r) { failures++; byTask[task] = r; continue; }
      byTask[task] = {
        promptTokens: r.tokens,
        clearsFloor: r.tokens >= floor,
        estimated: estimateTokens(CORE_RULES) + estimateTokens(TASK_SCHEMA[task] ?? ""),
      };
    }

    /*
     * `/api/suggest`'s only stable text, and it is measured because the estimate put it within 2% of
     * a floor.
     *
     * That route carries no `cache_control` at all, and `docs/cost.md` claims this is correct rather
     * than an oversight — the doctrine plus a one-line shape rule is below every model's floor,
     * Opus's 512 included. Estimated at ~368 Haiku tokens that looked settled, until the measured
     * 1.363x tokenizer ratio put the Opus figure at ~502 against a 512 floor. A claim resting on ten
     * tokens is a claim to measure, not to assert.
     */
    const doctrine = await countOnce(key, model, [{ type: "text", text: DRAFTING_DOCTRINE }]);
    if ("error" in doctrine) failures++;

    models[model] = {
      floor,
      coreRules: "tokens" in core ? core.tokens : core,
      coreRulesEstimated: estimateTokens(CORE_RULES),
      coreRulesClearsFloor: "tokens" in core ? core.tokens >= floor : null,
      byTask,
      suggestStableText: "tokens" in doctrine
        ? {
          promptTokens: doctrine.tokens,
          clearsFloor: doctrine.tokens >= floor,
          note: doctrine.tokens >= floor
            ? "ABOVE the floor — a cache_control marker here would be honoured. /api/suggest sends none."
            : "Below the floor — a marker there would be accepted and silently ignored, as documented.",
        }
        : doctrine,
    };
  }

  return {
    ran: true,
    billed: "$0.00 — count_tokens returns a count, not a completion.",
    failures,
    note: failures
      ? `${failures} count_tokens request(s) failed; treat these figures as incomplete.`
      : "Exact, per model. These supersede every estimated token figure elsewhere in this report.",
    models,
  };
}
