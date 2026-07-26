/**
 * What a call costs, and when prompt caching starts being worth it.
 *
 * ── why this file exists ──
 *
 * `/api/health/ai` reported `cacheablePrefix: false` and a note explaining that a prefix under the
 * provider's floor means the `cache_control` markers are accepted and silently ignored. All true —
 * and read as a fault to be fixed. It is not. Fixing it, at this product's traffic, costs 57% more
 * per call.
 *
 * The arithmetic that shows why was done once, in a scratch file, and would have been lost. So it
 * lives here, keyed to a REAL measured call, with the break-even as a function rather than a
 * paragraph. The next person to look at that health field gets a number and a verdict instead of a
 * true-but-misleading boolean.
 *
 * ── the measurement everything is anchored to ──
 *
 * From production, 2026-07-26 09:13:43 UTC, `/api/generate` op=final_content:
 *
 *   provider=anthropic model=claude-haiku-4-5 input=2325 output=543 ms=4106 usd=0.005040
 *   cacheRead=0 cacheWrite=0 cached=false
 *
 * `2325/1e6 × $1 + 543/1e6 × $5 = $0.005040` — exactly the figure the route logged, which is what
 * makes the prices below verified rather than remembered.
 *
 * ── the three things worth knowing ──
 *
 * 1. **Output is 54% of the cost.** So prompt caching, which only ever discounts input, cannot save
 *    more than 46% of a call even when it works perfectly.
 * 2. **Crossing Haiku's 4096-token floor means a LONGER prefix.** A cache write is billed at 1.25×,
 *    so until enough calls land inside a live five-minute window, padding the prefix to earn the
 *    discount costs more than not earning it.
 * 3. **A bigger model does not help HERE — but not for the reason it looks like.** Sonnet 5's floor
 *    is low enough that the current prefix caches immediately, so on INPUT alone Sonnet is slightly
 *    cheaper than uncached Haiku — 1.14x, measured. Its output at 3x the price reverses that above
 *    19 output tokens, and every live task generates far more. See `breakEvenOutputTokens` and
 *    `cheapestModelFor`, which recompute it from `MEASURED_PROMPT_TOKENS` instead of trusting this
 *    paragraph — an earlier version of it said 2.7x and 145 tokens, from estimated counts.
 *
 * No `next/*` imports — `ops/economics.test.mjs` loads this in plain Node.
 */

/** USD per million tokens. Verified against the logged call above, not copied from memory. */
export const PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  /* Sonnet 5 has introductory pricing of $2/$10 through 2026-08-31; the list price is used here
     because a decision made on a promotion expires with it. */
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-opus-5": { input: 5, output: 25 },
};

/**
 * The minimum cached prefix each model will actually cache. Below it the marker is accepted and
 * ignored — no error, no warning, full price.
 *
 * Not monotonic with model size, which is the trap: the SMALL model has the HIGH floor.
 */
export const CACHE_FLOORS: Record<string, number> = {
  "claude-haiku-4-5": 4096,
  "claude-sonnet-5": 1024,
  "claude-opus-5": 512,
};

/**
 * Anthropic's multipliers. A read is 0.1× at either TTL; the write is what differs.
 *
 * The 1-hour TTL is generally available, and it changes the arithmetic for a low-traffic product
 * more than anything else in this file. With a five-minute window, four calls an hour means four
 * writes and no reads — which is why padding the prefix looked like a 57% regression. With an hour,
 * the first call writes and the rest read. The write costs 2× instead of 1.25×, so it pays off after
 * two reads instead of one, and two reads inside an hour is an easy bar.
 *
 * Quoting a break-even without naming the window is how a cost decision gets made on the wrong half
 * of the data — which is what happened here first time round.
 */
export const CACHE_READ_MULTIPLIER = 0.1;
export const CACHE_WRITE_MULTIPLIER = 1.25;    // 5-minute TTL
export const CACHE_WRITE_MULTIPLIER_1H = 2.0;  // 1-hour TTL, generally available

/**
 * The Batch API is half price and stacks with caching. Asynchronous, so no form field can use it —
 * its value here is pre-generating the SHARED occupation packs, which are already cross-user and
 * already cached in Redis without a TTL.
 */
export const BATCH_DISCOUNT = 0.5;

export type CacheMode = "none" | "write" | "read";

export interface CallShape {
  model: string;
  /** The system blocks marked for caching. */
  prefixTokens: number;
  /** The per-request message, deliberately outside the cached prefix. */
  messageTokens: number;
  outputTokens: number;
}

/**
 * What one call costs, in USD.
 *
 * `mode: "none"` is what a below-floor prefix actually pays, whatever the markers say — which is
 * why this function takes the mode explicitly rather than inferring it from the floor. Inferring it
 * is how a cost model comes to disagree with the invoice.
 */
export function callCost(shape: CallShape, mode: CacheMode): number {
  const p = PRICES[shape.model];
  if (!p) throw new Error(`no price for ${shape.model}`);
  const cached = mode === "write" ? shape.prefixTokens * CACHE_WRITE_MULTIPLIER
    : mode === "read" ? shape.prefixTokens * CACHE_READ_MULTIPLIER
      : shape.prefixTokens;
  const input = (cached + shape.messageTokens) * p.input;
  return (input + shape.outputTokens * p.output) / 1e6;
}

/** True when the markers on this prefix will be honoured rather than silently dropped. */
export const prefixCaches = (shape: CallShape): boolean =>
  shape.prefixTokens >= (CACHE_FLOORS[shape.model] ?? 4096);

/**
 * The fraction of calls that must be cache READS before caching this shape beats not caching it.
 *
 * Returns a number in 0..1, or `0` when caching is free to adopt (the prefix already clears the
 * floor, so there is nothing to pay for the privilege) — and `1` when it can never win.
 *
 * This is the number that turns "caching is off" from a defect into a decision. A five-minute TTL
 * means the read fraction is a function of REQUEST RATE: at one call every few hours every call is
 * a write, and every write is billed at 1.25× a prefix you lengthened on purpose.
 */
export function breakEvenReadFraction(current: CallShape, proposed: CallShape): number {
  const base = callCost(current, prefixCaches(current) ? "read" : "none");
  const write = callCost(proposed, "write");
  const read = callCost(proposed, "read");
  if (write <= base) return 0;          // cheaper even on a pure miss
  if (read >= base) return 1;           // never wins
  return (write - base) / (write - read);
}

/**
 * Roughly how many calls per hour sustain a given read fraction, given a five-minute TTL.
 *
 * Deliberately crude — it assumes calls are evenly spaced, and real traffic is bursty in the
 * product's favour (one person filling a builder makes their calls minutes apart). It is here to
 * turn a fraction into something an operator can compare against a dashboard, not to be precise.
 */
export function callsPerHourFor(readFraction: number, ttlMinutes = 5): number {
  if (readFraction <= 0) return 0;
  if (readFraction >= 1) return Infinity;
  /* To get r reads out of n calls in a window, you need the window to stay warm: one call per TTL
     is the floor, and the fraction scales the rate above it. */
  const perWindow = 1 / (1 - readFraction);
  return Math.ceil((perWindow * 60) / ttlMinutes);
}

/**
 * The verdict, for the health endpoint to print instead of a bare boolean.
 *
 * Says what is true (the markers are ignored), what it costs (nothing extra — the prefix is short),
 * and what would have to change before acting (a traffic threshold).
 */
export function cacheVerdict(current: CallShape): {
  caches: boolean;
  floor: number;
  costPerCall: number;
  outputShare: number;
  paddedOption: { prefixTokens: number; breakEvenReads: number; callsPerHour: number; costOnMiss: number };
  verdict: string;
} {
  const floor = CACHE_FLOORS[current.model] ?? 4096;
  const caches = prefixCaches(current);
  const costPerCall = callCost(current, caches ? "read" : "none");
  const p = PRICES[current.model];
  const outputShare = (current.outputTokens * p.output)
    / (current.outputTokens * p.output + (current.prefixTokens + current.messageTokens) * p.input);

  /* The obvious "fix": pad the prefix just past the floor and keep everything else. */
  const padded: CallShape = { ...current, prefixTokens: floor + 4 };
  const breakEvenReads = breakEvenReadFraction(current, padded);

  return {
    caches,
    floor,
    costPerCall,
    outputShare,
    paddedOption: {
      prefixTokens: padded.prefixTokens,
      breakEvenReads,
      callsPerHour: callsPerHourFor(breakEvenReads),
      costOnMiss: callCost(padded, "write"),
    },
    verdict: caches
      ? "Prefix clears the floor — caching is active and free to keep."
      : `Prefix is ${current.prefixTokens} tokens against a ${floor} floor, so the markers are ignored `
        + `and every call pays full price. That is the CHEAPER position at low traffic: padding past `
        + `the floor costs ${(callCost(padded, "write") / costPerCall - 1) * 100 >= 0 ? "+" : ""}`
        + `${Math.round((callCost(padded, "write") / costPerCall - 1) * 100)}% on a miss and only wins once `
        + `${Math.round(breakEvenReads * 100)}% of calls land inside a live 5-minute window `
        + `(~${callsPerHourFor(breakEvenReads)}+ calls/hour). Revisit when traffic reaches that. `
        + `Note that output is ${Math.round(outputShare * 100)}% of the cost, so input caching caps `
        + `out at saving ${100 - Math.round(outputShare * 100)}%.`,
  };
}

/**
 * The call this whole file is calibrated against. Exported so the health endpoint reports the
 * verdict for the shape production actually sends, and so the test can assert the price model
 * reproduces the logged figure to the cent.
 */
export const MEASURED_FINAL_CONTENT: CallShape = {
  model: "claude-haiku-4-5",
  /* MEASURED by count_tokens, not inferred. This was 2261, computed from an estimated 1898-token
     CORE_RULES; the real figure is 2032. */
  prefixTokens: 2032,
  /*
   * And this is the correction that mattered: logged input 2325 − measured prefix 2032 = 293, where
   * the old split assumed 64.
   *
   * The message is the part that CANNOT be cached — it is different on every request. Assuming it
   * was 64 tokens made the cacheable share of the input look like 97%, when it is 87%. Since the
   * entire argument for a caching-capable model rests on how much of the input a cache can discount,
   * a 4.6x error in the uncacheable remainder is not a rounding detail — see the note on
   * `breakEvenOutputTokens`.
   */
  messageTokens: 293,
  outputTokens: 543,
};

/** The per-request message, in Haiku tokens. Derived: logged input 2325 − measured prefix 2032. */
export const MEASURED_MESSAGE_TOKENS = 293;

/**
 * What production logged for that call, to the microdollar.
 *
 * Unchanged by the correction above, and that is the check that makes the new split trustworthy:
 * (2032 + 293) × $1/M + 543 × $5/M = $0.005040, the same figure the old (2261 + 64) split produced,
 * because only the SPLIT was wrong and the total was always the invoice's.
 */
export const MEASURED_FINAL_CONTENT_USD = 0.005040;

/* ─────────────────────────── sizing a prompt without calling anything ─────────────────────────── */

/**
 * Characters per token, recalibrated against `count_tokens` — and the first figure was wrong.
 *
 * ── the correction, because it changed a recommendation ──
 *
 * This constant was 3.594, derived by dividing `CORE_RULES`'s 6822 characters by an 1898-token
 * prefix that had itself been INFERRED from a logged call. Two numbers, one of them a guess, and
 * dividing them produced something that looked like a measurement.
 *
 * `count_tokens` says `CORE_RULES` is **1677** tokens on Haiku 4.5, not 1898 — the estimate was 13%
 * high. 6822/1677 = 4.067. And the ratio is model-specific: the same text is **2285** tokens on
 * Sonnet 5 and Opus 5 (2.985 chars/token), so no single constant can serve all three.
 *
 * So this is now labelled for what it is — a Haiku-family approximation for text this file has not
 * measured — and every decision below reads `MEASURED_PROMPT_TOKENS` instead. `npm run ai:tokens`
 * or `GET /api/health/ai?tokens=1` refreshes that table for nothing.
 */
export const CHARS_PER_TOKEN = 4.067;

/** Rough token count for unmeasured text, Haiku-family only. Never used to price a call. */
export const estimateTokens = (text: string): number => Math.round(text.length / CHARS_PER_TOKEN);

/**
 * Prompt tokens per model per task, MEASURED via `count_tokens` on the deployment, 2026-07-26.
 *
 * Each figure is the whole request as `/api/generate` assembles it — `CORE_RULES` plus the task
 * schema plus a one-character message — so it is what the API counted, not a derived prefix
 * presented as exact.
 *
 * Two things here that no estimate would have produced:
 *
 * 1. **Sonnet 5 and Opus 5 return identical counts.** Same tokenizer. Their floors differ (1024 vs
 *    512) and their prices differ; their token counts do not.
 * 2. **The ratio between the tokenizers is 1.363 on this product's own text** (2285/1677), not the
 *    ~1.30 the migration guide quotes — that figure compares Sonnet 5 against Sonnet 4.6, which is a
 *    different pair. Measuring beat borrowing.
 *
 * Refresh with `npm run ai:tokens` (needs a key) or `GET /api/health/ai?tokens=1` (uses the
 * deployment's). Both bill nothing.
 */
export const MEASURED_PROMPT_TOKENS: Record<string, Record<string, number>> = {
  "claude-haiku-4-5": {
    coreRules: 1677, role_blueprint: 2121, experience_package: 2021, final_content: 2032, jd_delta: 1915,
  },
  "claude-sonnet-5": {
    coreRules: 2285, role_blueprint: 2878, experience_package: 2755, final_content: 2779, jd_delta: 2637,
  },
  "claude-opus-5": {
    coreRules: 2285, role_blueprint: 2878, experience_package: 2755, final_content: 2779, jd_delta: 2637,
  },
};

/** Measured tokenizer ratio against the Haiku baseline. 1.0 for Haiku itself, by definition. */
export const tokenizerRatio = (model: string): number => {
  const base = MEASURED_PROMPT_TOKENS["claude-haiku-4-5"].coreRules;
  const mine = MEASURED_PROMPT_TOKENS[model]?.coreRules;
  return mine ? mine / base : 1;
};

/**
 * The measured shape of one task on one model, ready for `callCost`.
 *
 * The message is scaled by the measured tokenizer ratio rather than measured directly, because the
 * message is different on every request — there is no fixed text to count. Labelled as derived in
 * the docs for that reason.
 */
export function measuredShape(task: string, model: string, outputTokens: number): CallShape {
  const prefixTokens = MEASURED_PROMPT_TOKENS[model]?.[task];
  if (!prefixTokens) throw new Error(`no measurement for ${task} on ${model}`);
  return {
    model,
    prefixTokens,
    messageTokens: Math.round(MEASURED_MESSAGE_TOKENS * tokenizerRatio(model)),
    outputTokens,
  };
}

/* ─────────────────────────── is the cheap model actually the cheap one? ─────────────────────────── */

/**
 * The non-obvious question this answers.
 *
 * Haiku is a third of Sonnet's input price and a third of its output price, so "use the small
 * model" looks like it needs no thought. But Haiku's cache floor is 4096 tokens and Sonnet's is
 * 1024, and this product's prefix sits between the two. So the comparison is not Haiku-cached vs
 * Sonnet-cached; it is Haiku at full price vs Sonnet at a tenth of its input price.
 *
 * ── and this is where estimating cost me a wrong answer ──
 *
 * On estimated numbers that comparison said Sonnet was **2.7× cheaper on input**, with a break-even
 * at 145 output tokens. Measured, it is barely cheaper at all:
 *
 *   haiku,  prefix 2032 uncached    (2032 + 293) × $1 = $0.002325   ← equals the invoice exactly
 *   sonnet, prefix 2779 cache read   (278 + 399) × $3 = $0.002031
 *
 * 1.14×, not 2.7×, and the break-even collapses from 145 output tokens to **19**. Three compounding
 * errors, all in the same direction:
 *
 *   · the real cacheable prefix is smaller (2032, not 2261) — less to discount
 *   · the real UNCACHEABLE message is 293 tokens, not 64 — and no cache touches it
 *   · Sonnet's tokenizer inflates every count by a measured 1.363× — input and output alike
 *
 * The lesson is not "Sonnet is worse than I thought". It is that a cache argument is arithmetic on
 * the cacheable SHARE of the input, so guessing the uncacheable remainder guesses the answer. The
 * cheap fix was available the whole time: `count_tokens` bills nothing.
 *
 * Opus 5 turns out to have no crossover at all — cached, it is dearer on input than uncached Haiku.
 */

/**
 * The output-token count at which `alt` (cached) stops being cheaper than `current` (whatever
 * mode its own floor allows). Below the returned number, `alt` costs less.
 *
 * Returns 0 when `alt` is never cheaper — at equal or higher output price there is no crossover,
 * because `alt` cannot claw back an input saving it never made.
 */
export function breakEvenOutputTokens(current: CallShape, altModel: string): number {
  const cur = PRICES[current.model];
  const alt = PRICES[altModel];
  if (!cur || !alt) throw new Error(`no price for ${current.model} / ${altModel}`);

  /*
   * The unit is a token of `current`'s tokenizer — a HAIKU-equivalent token — and getting that wrong
   * is the same mistake this file was just corrected for, one level down.
   *
   * A first version compared the two models at the same nominal `outputTokens`, which quietly assumes
   * the same answer costs the same number of tokens on both. It does not: Sonnet 5's tokenizer
   * produces a measured 1.363x as many tokens for this product's text, on output as much as on input.
   * So the same three summaries are ~1.363x the billed output, at $15/M instead of $5/M, and the
   * honest penalty is $15 x 1.363 - $5 = $15.44 per million haiku-equivalent tokens rather than $10.
   *
   * Ignoring it put the break-even at 84 tokens instead of 19 — a factor of four, in the direction
   * that flatters the bigger model.
   */
  const ratio = tokenizerRatio(altModel) / tokenizerRatio(current.model);
  const altZero: CallShape = {
    model: altModel,
    prefixTokens: Math.round(current.prefixTokens * ratio),
    messageTokens: Math.round(current.messageTokens * ratio),
    outputTokens: 0,
  };

  const curInput = callCost({ ...current, outputTokens: 0 }, prefixCaches(current) ? "read" : "none");
  const altInput = callCost(altZero, prefixCaches(altZero) ? "read" : "none");

  const inputSaving = curInput - altInput;
  const outputPenalty = (alt.output * ratio - cur.output) / 1e6;
  if (inputSaving <= 0) return 0;                 // no input saving to spend
  if (outputPenalty <= 0) return Infinity;        // cheaper on both axes, always wins
  return inputSaving / outputPenalty;
}

export interface ModelOption {
  model: string;
  /** What this model would ACTUALLY be billed at, given its own floor and this prefix. */
  mode: CacheMode;
  usd: number;
  /** True when this row used counts measured on this model rather than the baseline's. */
  measured: boolean;
}

/**
 * Token counts measured on one specific model, keyed by model id.
 *
 * ── why a comparison needs this, and why no multiplier is offered instead ──
 *
 * **Token counts are model-specific.** Sonnet 5 uses a newer tokenizer that produces roughly 30%
 * more tokens for the same text than Sonnet 4.6, and Anthropic's own migration guidance is explicit
 * about the remedy: *"Do not apply a blanket multiplier"* — re-run `count_tokens` against the model
 * you are actually going to send to. So this file will not invent one; it accepts measurements or
 * it says it has none.
 *
 * `ops/tokens.mjs` produces them, and `POST /v1/messages/count_tokens` is FREE — no completion, no
 * output tokens, nothing billed. Exactness here costs nothing but a round trip.
 *
 * **When no measurement is supplied, the baseline's counts are reused and the answer is flagged
 * `measured: false`.** The direction of that error is worth knowing rather than merely
 * acknowledging: a bigger tokenizer inflates the candidate's input (cached at 0.1×, so small) and
 * its output (billed in full, at the higher rate), so reusing Haiku's smaller counts makes the
 * bigger model look BETTER than it is. Every "haiku wins" below is therefore a lower bound — the
 * unmeasured unknown pushes in the direction that strengthens it.
 */
export type MeasuredTokens = Record<string, { prefixTokens: number; messageTokens: number; outputTokens?: number }>;

/**
 * Price one call shape on every candidate model and return them cheapest first.
 *
 * The mode per candidate is derived from that model's own floor, which is the whole point: a
 * comparison that assumes caching works everywhere, or nowhere, gets this backwards.
 *
 * **Stated assumption:** a caching candidate is priced as a cache READ — a warm prefix. The
 * prompt cache is per-organisation, so any steady traffic keeps the shared prefix warm for
 * everyone; at this product's four calls an hour with a five-minute TTL it would mostly be a
 * WRITE, which is 12.5× the read. `worstCase: true` prices caching candidates as writes instead,
 * so the pessimistic answer is one argument away rather than a separate derivation.
 */
export function cheapestModelFor(
  shape: CallShape,
  candidates: string[] = Object.keys(PRICES),
  opts: { worstCase?: boolean; measured?: MeasuredTokens } = {},
): { winner: ModelOption; ranking: ModelOption[] } {
  const ranking = candidates.map((model): ModelOption => {
    const s = shapeOn(shape, model, opts.measured);
    const mode: CacheMode = prefixCaches(s) ? (opts.worstCase ? "write" : "read") : "none";
    return { model, mode, usd: callCost(s, mode), measured: Boolean(opts.measured?.[model]) };
  }).sort((a, b) => a.usd - b.usd);

  if (!ranking.length) throw new Error("no candidate models");
  return { winner: ranking[0], ranking };
}

/** The shape as `model` would count it: measured if we have it, the baseline's counts if not. */
function shapeOn(shape: CallShape, model: string, measured?: MeasuredTokens): CallShape {
  const m = measured?.[model];
  if (!m) return { ...shape, model };
  return {
    model,
    prefixTokens: m.prefixTokens,
    messageTokens: m.messageTokens,
    /* Output is not measurable ahead of the call, so the baseline's figure stands unless a real
       one is supplied. A tokenizer that inflates input inflates output too, which is the larger
       effect at these prices — noted rather than modelled, because modelling it would be the
       blanket multiplier this file refuses to invent. */
    outputTokens: m.outputTokens ?? shape.outputTokens,
  };
}
