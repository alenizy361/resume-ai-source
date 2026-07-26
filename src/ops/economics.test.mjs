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
  breakEvenOutputTokens, breakEvenReadFraction, cacheVerdict, callCost, callsPerHourFor,
  cheapestModelFor, estimateTokens, prefixCaches,
} from "../app/lib/aiEconomics.ts";
import { packKey } from "../app/lib/aiCache.ts";
import { CORE_RULES, TASK_SCHEMA } from "../app/lib/aiPrompts.ts";
import { DRAFTING_DOCTRINE } from "../app/lib/prompts.ts";
import { MAX_OUTPUT } from "../app/lib/aiModels.ts";

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

/* ─────────────────── 7. the cache key hashes meaning, not spelling ─────────────────── */

console.log("\n── the cache key collapses synonyms and nothing else ──");

/*
 * This is a cost test, not a correctness one, which is why it lives here.
 *
 * `country` reaches the key as free text and `seniority` arrives in whichever language the
 * interface is in. Before normalisation, six spellings of Saudi Arabia produced FOUR cache entries
 * and the same level in two languages produced two — and every extra entry is a full-price
 * generation of content the cache already held.
 */
{
  const base = {
    occupation: "radiology-technologist", specialization: "",
    seniority: "Mid", cvLang: "en", modelVersion: "v1",
  };

  const sameCountry = ["Saudi Arabia", "السعودية", "KSA", "saudi arabia", "Saudi Arabia ", "المملكة العربية السعودية"]
    .map((country) => packKey({ ...base, country }));
  ok("six spellings of one country share one key", new Set(sameCountry).size === 1,
    `${new Set(sameCountry).size} keys`);

  const sameLevel = ["Mid", "متوسط"].map((seniority) => packKey({ ...base, country: "sa", seniority }));
  ok("the same level in Arabic and English shares one key", new Set(sameLevel).size === 1);

  /* And the collapse must stop exactly there. A key that merges two DIFFERENT markets would serve
     Egypt's credentials to someone applying in Jordan, which is worse than paying twice. */
  const different = ["Saudi Arabia", "UAE", "Egypt", "Qatar"].map((country) => packKey({ ...base, country }));
  ok("four different countries keep four keys", new Set(different).size === 4,
    `${new Set(different).size} keys`);

  const levels = ["Entry", "Mid", "Senior", "Lead"].map((seniority) => packKey({ ...base, country: "sa", seniority }));
  ok("four different levels keep four keys", new Set(levels).size === 4, `${new Set(levels).size} keys`);

  const arLevels = ["مبتدئ", "متوسط", "أول/خبير", "قيادي"].map((seniority) => packKey({ ...base, country: "sa", seniority }));
  ok("the Arabic level names map onto the English ones in order",
    JSON.stringify(levels) === JSON.stringify(arLevels));

  /* An unplaceable country must not be collapsed with every other unplaceable one. */
  const unknown = ["Nowhereland", "Elbonia"].map((country) => packKey({ ...base, country }));
  ok("two unknown countries keep two keys", new Set(unknown).size === 2);

  /* The occupation still separates packs — the thing the cache is actually keyed on. */
  ok("a different occupation is a different key",
    packKey({ ...base, country: "sa" }) !== packKey({ ...base, country: "sa", occupation: "accountant" }));
}

/* ─────────────── 8. the small model is the cheap one — checked, not assumed ─────────────── */

console.log("\n── is haiku actually cheapest, per live task? ──");

/*
 * The trap this section exists to catch.
 *
 * Haiku's cache floor is 4096 and Sonnet's is 1024, and this product's prefix sits BETWEEN them.
 * So the real comparison is not "small model vs big model" — it is uncached Haiku against Sonnet
 * at a tenth of its input price, and on input alone Sonnet is 2.7× cheaper. Only Sonnet's 3×
 * output price reverses it, and only above a threshold.
 *
 * That threshold is computed here from the LIVE prompt text and the LIVE output table, so adding
 * a short-output task to `/api/generate` fails this suite instead of quietly overpaying.
 */

/* `/api/generate` accepts exactly these four — the other four names in MAX_OUTPUT are routed
   nowhere, so pricing them would be pricing a call that never happens. */
const LIVE_TASKS = ["role_blueprint", "experience_package", "final_content", "jd_delta"];

const CORE_TOKENS = estimateTokens(CORE_RULES);
ok("the token estimator reproduces the logged prefix size", CORE_TOKENS === 1898,
  `estimated ${CORE_TOKENS}, logged 1898`);

for (const task of LIVE_TASKS) {
  const schema = TASK_SCHEMA[task];
  ok(`${task} has a task schema to cache`, typeof schema === "string" && schema.length > 0);

  const shape = {
    model: "claude-haiku-4-5",
    prefixTokens: CORE_TOKENS + estimateTokens(schema ?? ""),
    messageTokens: MEASURED_FINAL_CONTENT.messageTokens,
    outputTokens: MAX_OUTPUT[task],
  };

  /* Input-only, which is where the surprise lives and where a naive comparison stops. */
  const inHaiku = callCost({ ...shape, outputTokens: 0 }, "none");
  const inSonnet = callCost({ ...shape, model: "claude-sonnet-5", outputTokens: 0 }, "read");
  ok(`${task}: sonnet's CACHED input beats haiku's uncached input`, inSonnet < inHaiku,
    `$${inSonnet.toFixed(6)} vs $${inHaiku.toFixed(6)}`);

  /* And output puts it back. This is the assertion that makes "stay on haiku" a result. */
  const be = breakEvenOutputTokens(shape, "claude-sonnet-5");
  ok(`${task}: its ${MAX_OUTPUT[task]}-token output cap is above the ${Math.round(be)}-token break-even`,
    MAX_OUTPUT[task] > be, `cap ${MAX_OUTPUT[task]} vs break-even ${be.toFixed(0)}`);

  const { winner } = cheapestModelFor(shape, ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"]);
  ok(`${task}: cheapest model is haiku`, winner.model === "claude-haiku-4-5",
    `${winner.model} at $${winner.usd.toFixed(6)}`);
  /* Priced at what it is actually billed — no caching, whatever the markers say. */
  ok(`${task}: and it is priced as uncached`, winner.mode === "none");
}

/*
 * The measured call, not the cap: real output was 543 against a 900 ceiling, so the margin is
 * checked at the number production produced rather than the number it is allowed.
 */
{
  const be = breakEvenOutputTokens(MEASURED_FINAL_CONTENT, "claude-sonnet-5");
  ok("the MEASURED output is comfortably above the break-even too",
    MEASURED_FINAL_CONTENT.outputTokens > be * 2,
    `${MEASURED_FINAL_CONTENT.outputTokens} vs ${be.toFixed(0)} (${(MEASURED_FINAL_CONTENT.outputTokens / be).toFixed(1)}×)`);
  console.log(`   (break-even ${be.toFixed(0)} output tokens vs sonnet, `
    + `${breakEvenOutputTokens(MEASURED_FINAL_CONTENT, "claude-opus-5").toFixed(0)} vs opus)`);
}

/* The pessimistic reading must not flip the answer either: at four calls an hour on a 5-minute
   TTL a caching candidate mostly WRITES, which is 12.5× a read. */
{
  const shape = { ...MEASURED_FINAL_CONTENT, outputTokens: MAX_OUTPUT.final_content };
  const { winner } = cheapestModelFor(shape, Object.keys(PRICES), { worstCase: true });
  ok("haiku still wins when caching candidates are priced as cache WRITES",
    winner.model === "claude-haiku-4-5");
}

/*
 * The two edges, and each says something about the product rather than about the formula.
 *
 * Once a prefix clears EVERY floor, both models cache and the small one is cheaper on both axes —
 * there is no threshold left to think about, so the answer must be Infinity and not a number that
 * reads like one. That is the shape this product would have if the prefix were ever padded past
 * 4096: the model question would stop being interesting.
 */
ok("above every floor, the small model wins outright — no break-even",
  breakEvenOutputTokens(
    { ...MEASURED_FINAL_CONTENT, model: "claude-sonnet-5", prefixTokens: 4100 },
    "claude-haiku-4-5",
  ) === Infinity);

/* And the reverse of today's finding: from Haiku there is no input saving to spend, because Haiku
   is the one model whose floor this prefix misses. */
ok("a model with no input saving to spend returns 0",
  breakEvenOutputTokens(MEASURED_FINAL_CONTENT, "claude-haiku-4-5") === 0);

/* ─────────────── 9. /api/suggest cannot cache anything, on any model ─────────────── */

console.log("\n── the other AI route: nothing to cache there ──");

/*
 * `/api/suggest` carries no `cache_control` at all, which looks like an oversight next to
 * `/api/generate`'s two breakpoints. It is not one. Its only stable text is the drafting doctrine
 * plus a one-line shape rule — measured below — and that is under EVERY model's floor, Opus's 512
 * included. Adding markers there would be accepted and silently ignored.
 */
{
  const stable = estimateTokens(DRAFTING_DOCTRINE) + 61;  // + preamble, kind rule and language line
  const lowest = Math.min(...Object.values(CACHE_FLOORS));
  ok("suggest's stable prefix is below the LOWEST floor of any model", stable < lowest,
    `${stable} tokens vs floor ${lowest}`);
  console.log(`   (${stable} stable tokens — markers there would be accepted and ignored)`);
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
