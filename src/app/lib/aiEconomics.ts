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
 * 3. **A bigger model does not help.** Sonnet 5's floor is low enough that the current prefix would
 *    cache immediately — and its output is 3× the price, which swamps the saving.
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
  prefixTokens: 2261,   // CORE_RULES 1898 + final_content schema 363
  messageTokens: 64,    // logged input 2325 − prefix
  outputTokens: 543,
};

/** What production logged for that call, to the microdollar. */
export const MEASURED_FINAL_CONTENT_USD = 0.005040;
