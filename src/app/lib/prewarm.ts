/**
 * Generate every shared occupation pack in advance, at half price, so no user is ever the first.
 *
 * ── what problem this solves ──
 *
 * `role_blueprint` is the pack of skills, credentials, keywords and achievement questions for one
 * occupation. It is IDENTICAL for everyone with the same (occupation, level, country, language) — no
 * personal facts go into it — which is why it is the one task cached across users in Redis.
 *
 * So the first person to build a CV for each occupation waits ~4 seconds and costs ~$0.0064, and
 * everyone after them gets it instantly for nothing. Pre-warming removes the unlucky first visitor.
 *
 * The Batch API is 50% off and asynchronous, which is exactly the right trade here: nobody is waiting.
 *
 * ── the property everything depends on ──
 *
 * A warmed entry is only useful if it lands on the SAME key `/api/generate` will look up. That route
 * computes `packKey({ ...normalizeContext(body.context), modelVersion: cfg.version })`, so this module
 * calls the same two functions on the same shape rather than reproducing the format. If these ever
 * drift, the pre-warm silently warms keys nobody reads and the bill is pure waste —
 * `ops/prewarm.test.mjs` asserts they agree.
 *
 * ── the combinatorial fact that changes the price ──
 *
 * The key includes `seniority` and `country`, so one occupation is NOT one pack. 111 catalogue entries
 * × four seniority levels is 444 packs for one country. Warming "every occupation" without saying
 * which level and which market is how a $0.36 estimate becomes a $1.42 invoice, so `plan()` prints the
 * matrix and the cost and nothing spends until a caller passes an explicit confirmation.
 *
 * `specialization` is free text and unbounded — it cannot be enumerated, and a request carrying one
 * gets a key of its own and pays for it. That is a real, stated limit of this: it warms the common
 * shape, not every shape.
 */

import { JOBS } from "./jobs.ts";
import { JOBS_AR } from "./jobs-ar.ts";
import { normalizeContext, packKey } from "./aiCache.ts";
import { blueprintMessage, CORE_RULES, TASK_SCHEMA, type PromptContext } from "./aiPrompts.ts";
import { MAX_OUTPUT, modelConfig, acceptsTemperature, canDisableThinking, thinksByDefault } from "./aiModels.ts";
import { schemaRequestFor } from "./aiSchemas.ts";
import { BATCH_DISCOUNT, PRICES } from "./aiEconomics.ts";

/** The four levels the form offers. `canonicalSeniority` folds each language onto these tokens. */
export const SENIORITIES = ["Entry", "Mid", "Senior", "Lead"] as const;

/**
 * The market to warm, and it is a judgement rather than a measurement.
 *
 * `popularPacks()` would answer this from real hit counts, and at present it answers nothing: the
 * product has had 178 pageviews total. So the default is the market the product is built for — the
 * domain is cv.rabit.sa, the country rules are Saudi, the sector pages are Saudi — and it is a
 * parameter so the answer can come from data once there is data.
 */
export const DEFAULT_COUNTRIES = ["Saudi Arabia"] as const;

export interface PackTarget {
  occupation: string;
  cvLang: "ar" | "en";
  seniority: string;
  country: string;
  /** The exact Redis key this will be written under. */
  key: string;
  /** Round-trips through the Batch API's `custom_id`. */
  customId: string;
}

/**
 * Every (occupation, language) the catalogue can produce, crossed with levels and countries.
 *
 * A slug present only in the Arabic catalogue is warmed only in Arabic, and vice versa. Warming an
 * occupation in a language its own catalogue does not carry would spend money on a pack no page can
 * lead a user to.
 */
export function targets(opts: {
  seniorities?: readonly string[];
  countries?: readonly string[];
} = {}): PackTarget[] {
  const levels = opts.seniorities ?? SENIORITIES;
  const countries = opts.countries ?? DEFAULT_COUNTRIES;
  const cfg = modelConfig();

  const pairs: Array<{ occupation: string; cvLang: "ar" | "en" }> = [
    ...JOBS.map((j) => ({ occupation: j.slug, cvLang: "en" as const })),
    ...JOBS_AR.map((j) => ({ occupation: j.slug, cvLang: "ar" as const })),
  ];

  const out: PackTarget[] = [];
  for (const p of pairs) {
    for (const seniority of levels) {
      for (const country of countries) {
        const ctx = normalizeContext({ ...p, seniority, country, specialization: "" });
        out.push({
          occupation: p.occupation,
          cvLang: p.cvLang,
          seniority,
          country,
          /* The same call `/api/generate` makes. Not a reimplementation of the format. */
          key: packKey({ ...ctx, modelVersion: cfg.version }),
          /* Anthropic allows [a-zA-Z0-9_-] in custom_id; a slug can carry neither a colon nor a
             space, so the separator is a double underscore and the level is lowercased. */
          customId: `${p.occupation}__${p.cvLang}__${seniority.toLowerCase()}__${idx(countries, country)}`
            .replace(/[^a-zA-Z0-9_-]/g, "-"),
        });
      }
    }
  }
  return out;
}

const idx = (list: readonly string[], v: string) => String(list.indexOf(v));

/** The request body for one pack, matching what `/api/generate` sends for `role_blueprint`. */
export function batchRequest(t: PackTarget): Record<string, unknown> {
  const model = modelConfig().fastModel;
  const promptCtx: PromptContext = {
    occupation: t.occupation,
    specialization: "",
    seniority: t.seniority,
    country: t.country,
    cvLang: t.cvLang,
  };
  return {
    custom_id: t.customId,
    params: {
      model,
      max_tokens: MAX_OUTPUT.role_blueprint,
      ...(acceptsTemperature(model) ? { temperature: 0.3 } : {}),
      ...(thinksByDefault(model) && canDisableThinking(model) ? { thinking: { type: "disabled" } } : {}),
      ...schemaRequestFor("role_blueprint"),
      system: [
        { type: "text", text: CORE_RULES, cache_control: { type: "ephemeral" } },
        { type: "text", text: TASK_SCHEMA.role_blueprint ?? "", cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: blueprintMessage(promptCtx) }],
    },
  };
}

export interface Plan {
  packs: number;
  occupations: number;
  seniorities: number;
  countries: number;
  /** Distinct keys. Lower than `packs` would mean the matrix collapses — a bug worth seeing. */
  distinctKeys: number;
  estimatedUsdStandard: number;
  estimatedUsdBatch: number;
  note: string;
}

/**
 * What this would cost, before anything is spent.
 *
 * Priced from the MEASURED `role_blueprint` shape — prefix 2121 tokens on Haiku from `count_tokens`,
 * and an 800-token output, which is above the 352–386 the health probe's thin prompt produced and
 * below the 1400 cap. Deliberately the pessimistic end: a plan that under-quotes its own bill is
 * worse than one that over-quotes it.
 */
export function plan(opts: { seniorities?: readonly string[]; countries?: readonly string[] } = {}): Plan {
  const list = targets(opts);
  const model = modelConfig().fastModel;
  const p = PRICES[model] ?? PRICES["claude-haiku-4-5"];

  const inputTokens = 2121 + 300;
  const outputTokens = 800;
  const perCall = (inputTokens * p.input + outputTokens * p.output) / 1e6;

  const levels = (opts.seniorities ?? SENIORITIES).length;
  const countries = (opts.countries ?? DEFAULT_COUNTRIES).length;

  return {
    packs: list.length,
    occupations: JOBS.length + JOBS_AR.length,
    seniorities: levels,
    countries,
    distinctKeys: new Set(list.map((t) => t.key)).size,
    estimatedUsdStandard: Number((perCall * list.length).toFixed(4)),
    estimatedUsdBatch: Number((perCall * list.length * BATCH_DISCOUNT).toFixed(4)),
    note: "Priced at 2421 input + 800 output tokens per pack, the pessimistic end of the measured "
      + "range. Batch is half price and asynchronous. `specialization` is free text and cannot be "
      + "enumerated, so a request carrying one still pays for its own key.",
  };
}
