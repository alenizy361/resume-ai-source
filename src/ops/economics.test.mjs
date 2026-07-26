/**
 * The cost model, locked to a real invoice.
 *
 * A cost model that nobody checks drifts the moment a price changes, and it drifts SILENTLY — the
 * numbers keep looking plausible. So the first assertion here is not about caching at all: it is
 * that the model reproduces, to the microdollar, a figure production actually logged. Everything
 * else in the file is only worth reading if that passes.
 *
 *   node --experimental-strip-types ops/economics.test.mjs
 */

import {
  CACHE_FLOORS, MEASURED_FINAL_CONTENT, MEASURED_FINAL_CONTENT_USD, PRICES,
  breakEvenReadFraction, cacheVerdict, callCost, callsPerHourFor, prefixCaches,
} from "../app/lib/aiEconomics.ts";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => {
  if (c) { pass++; console.log(`✅ ${n}`); }
  else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); }
};

/* ─────────────────── 1. the model matches the invoice ─────────────────── */

console.log("\n── the price model reproduces a logged call ──");

const got = callCost(MEASURED_FINAL_CONTENT, "none");
ok("final_content costs what production logged",
  Math.abs(got - MEASURED_FINAL_CONTENT_USD) < 1e-9,
  `computed $${got.toFixed(6)} vs logged $${MEASURED_FINAL_CONTENT_USD.toFixed(6)}`);

/*
 * "none", not "read", and that is the point of the whole exercise: the request carried
 * `cache_control` markers and the log said `cacheRead=0 cacheWrite=0 cached=false`. The markers
 * were accepted and ignored, so the call was billed as if they were absent.
 */
ok("the measured prefix is BELOW its model's floor",
  !prefixCaches(MEASURED_FINAL_CONTENT),
  `${MEASURED_FINAL_CONTENT.prefixTokens} vs floor ${CACHE_FLOORS[MEASURED_FINAL_CONTENT.model]}`);

/* ─────────────────── 2. the floors are not monotonic ─────────────────── */

console.log("\n── the trap: the small model has the high floor ──");

ok("haiku's floor is higher than sonnet's", CACHE_FLOORS["claude-haiku-4-5"] > CACHE_FLOORS["claude-sonnet-5"]);
ok("sonnet's floor is higher than opus's", CACHE_FLOORS["claude-sonnet-5"] > CACHE_FLOORS["claude-opus-5"]);
ok("the current prefix WOULD cache on sonnet",
  MEASURED_FINAL_CONTENT.prefixTokens >= CACHE_FLOORS["claude-sonnet-5"]);

/* ─────────────────── 3. every alternative is more expensive ─────────────────── */

console.log("\n── the alternatives, priced ──");

const base = callCost(MEASURED_FINAL_CONTENT, "none");

/* Padding past haiku's floor: cheaper per read, dearer per write, and a write is what low traffic
   produces. */
const padded = { ...MEASURED_FINAL_CONTENT, prefixTokens: CACHE_FLOORS["claude-haiku-4-5"] + 4 };
ok("padding the prefix is DEARER on a cache miss", callCost(padded, "write") > base,
  `$${callCost(padded, "write").toFixed(6)} vs $${base.toFixed(6)}`);
ok("padding the prefix is cheaper only on a cache read", callCost(padded, "read") < base,
  `$${callCost(padded, "read").toFixed(6)}`);

const need = breakEvenReadFraction(MEASURED_FINAL_CONTENT, padded);
ok("padding needs a majority of calls to be cache reads", need > 0.5 && need < 1, `${(need * 100).toFixed(1)}%`);
console.log(`   (break-even at ${(need * 100).toFixed(1)}% reads ≈ ${callsPerHourFor(need)}+ calls/hour)`);

/* Moving up a tier: caching works immediately and the bill goes up anyway, because output
   dominates and output is what a bigger model charges more for. */
for (const model of ["claude-sonnet-5", "claude-opus-5"]) {
  const shape = { ...MEASURED_FINAL_CONTENT, model };
  ok(`${model} caches immediately`, prefixCaches(shape));
  ok(`${model} is dearer even on a cache read`, callCost(shape, "read") > base,
    `$${callCost(shape, "read").toFixed(6)} vs $${base.toFixed(6)}`);
}

/* ─────────────────── 4. output is the majority of the bill ─────────────────── */

console.log("\n── where the money actually goes ──");

{
  const p = PRICES[MEASURED_FINAL_CONTENT.model];
  const inUsd = (MEASURED_FINAL_CONTENT.prefixTokens + MEASURED_FINAL_CONTENT.messageTokens) * p.input / 1e6;
  const outUsd = MEASURED_FINAL_CONTENT.outputTokens * p.output / 1e6;
  ok("output costs more than input", outUsd > inUsd, `out $${outUsd.toFixed(6)} vs in $${inUsd.toFixed(6)}`);
  /*
   * The ceiling on the entire caching debate. Input caching discounts input only, so a perfect
   * cache cannot save more than the input share — and the input share is the minority.
   */
  const ceiling = inUsd / (inUsd + outUsd);
  ok("perfect caching could save less than half the call", ceiling < 0.5, `${(ceiling * 100).toFixed(0)}%`);
  console.log(`   (input ${(ceiling * 100).toFixed(0)}% · output ${(100 - ceiling * 100).toFixed(0)}%)`);
}

/* ─────────────────── 5. the verdict is a sentence, not a boolean ─────────────────── */

console.log("\n── the verdict the health endpoint prints ──");

const v = cacheVerdict(MEASURED_FINAL_CONTENT);
ok("the verdict knows caching is off", v.caches === false);
ok("the verdict states the cost per call", Math.abs(v.costPerCall - MEASURED_FINAL_CONTENT_USD) < 1e-9);
ok("the verdict names a traffic threshold", v.paddedOption.callsPerHour > 0 && Number.isFinite(v.paddedOption.callsPerHour));
/*
 * The sentence must say that the current position is the cheap one. A health field that reports a
 * true fact in a way that invites a 57% regression is worse than reporting nothing.
 */
ok("the verdict says the current position is cheaper", /CHEAPER/.test(v.verdict));
ok("the verdict quantifies the regression", /%/.test(v.verdict));
console.log(`\n   ${v.verdict}\n`);

/* And when the prefix DOES clear the floor, the verdict flips without anyone editing prose. */
{
  const good = cacheVerdict({ ...MEASURED_FINAL_CONTENT, model: "claude-sonnet-5" });
  ok("a clearing prefix reports caching as active", good.caches === true && /active/.test(good.verdict));
}

/* ─────────────────── 6. edge cases the formula must not fumble ─────────────────── */

console.log("\n── edges ──");

ok("a shape that is cheaper on a miss needs no reads",
  breakEvenReadFraction(MEASURED_FINAL_CONTENT, MEASURED_FINAL_CONTENT) === 0
  || breakEvenReadFraction(MEASURED_FINAL_CONTENT, { ...MEASURED_FINAL_CONTENT, outputTokens: 10 }) === 0);
ok("a hopeless proposal returns 1",
  breakEvenReadFraction(MEASURED_FINAL_CONTENT, { ...MEASURED_FINAL_CONTENT, model: "claude-opus-5" }) === 1);
ok("callsPerHourFor(0) is 0", callsPerHourFor(0) === 0);
ok("callsPerHourFor(1) is Infinity", callsPerHourFor(1) === Infinity);
ok("an unpriced model throws rather than guessing", (() => {
  try { callCost({ ...MEASURED_FINAL_CONTENT, model: "claude-imaginary-9" }, "none"); return false; }
  catch { return true; }
})());

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
