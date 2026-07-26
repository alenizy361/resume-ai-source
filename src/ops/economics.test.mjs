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
  CACHE_FLOORS, MEASURED_FINAL_CONTENT, MEASURED_FINAL_CONTENT_USD, MEASURED_MESSAGE_TOKENS,
  MEASURED_PROMPT_TOKENS, PRICES,
  breakEvenOutputTokens, breakEvenReadFraction, cacheVerdict, callCost, callsPerHourFor,
  cheapestModelFor, estimateTokens, measuredShape, prefixCaches, tokenizerRatio,
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

/*
 * MEASURED, not estimated, and the difference changed the answer.
 *
 * The estimator used to be checked against an 1898-token CORE_RULES that had itself been inferred.
 * count_tokens says 1677 on Haiku. So this section reads `MEASURED_PROMPT_TOKENS` — refreshed for
 * free by `npm run ai:tokens` — and the estimator is held only to being in the right neighbourhood
 * of the thing it is now calibrated against.
 */
const CORE_TOKENS = MEASURED_PROMPT_TOKENS["claude-haiku-4-5"].coreRules;
ok("CORE_RULES is measured, not estimated", CORE_TOKENS === 1677);
ok("and the estimator is calibrated to within 3% of it",
  Math.abs(estimateTokens(CORE_RULES) - CORE_TOKENS) / CORE_TOKENS < 0.03,
  `estimate ${estimateTokens(CORE_RULES)} vs measured ${CORE_TOKENS}`);

for (const task of LIVE_TASKS) {
  const schema = TASK_SCHEMA[task];
  ok(`${task} has a task schema to cache`, typeof schema === "string" && schema.length > 0);

  const shape = measuredShape(task, "claude-haiku-4-5", MAX_OUTPUT[task]);

  /* Input-only, which is where the surprise lives and where a naive comparison stops. */
  const inHaiku = callCost({ ...shape, outputTokens: 0 }, "none");
  const inSonnet = callCost({ ...shape, model: "claude-sonnet-5", outputTokens: 0 }, "read");
  ok(`${task}: sonnet's CACHED input beats haiku's uncached input`, inSonnet < inHaiku,
    `$${inSonnet.toFixed(6)} vs $${inHaiku.toFixed(6)}`);

  /* And output puts it back. This is the assertion that makes "stay on haiku" a result. */
  const be = breakEvenOutputTokens(shape, "claude-sonnet-5");
  ok(`${task}: its ${MAX_OUTPUT[task]}-token output cap is above the ${Math.round(be)}-token break-even`,
    MAX_OUTPUT[task] > be, `cap ${MAX_OUTPUT[task]} vs break-even ${be.toFixed(0)}`);

  /* Every candidate priced on ITS OWN measured counts — the whole point of the correction. */
  const measured = Object.fromEntries(Object.keys(MEASURED_PROMPT_TOKENS).map((m) => {
    const s = measuredShape(task, m, MAX_OUTPUT[task]);
    return [m, { prefixTokens: s.prefixTokens, messageTokens: s.messageTokens }];
  }));
  const { winner } = cheapestModelFor(
    shape, ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"], { measured });
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
/*
 * And the prefix has to clear the floor IN THE TARGET MODEL'S OWN TOKENS, which is a trap this
 * assertion walked into. It first used 4100 — over Haiku's 4096 floor, so "both models cache"
 * looked obvious. But 4100 Sonnet tokens are only ~3009 Haiku tokens, comfortably UNDER the floor,
 * so Haiku would not have cached at all. The same conflation the whole section is about, one level
 * down. 4096 x 1.363 is the smallest Sonnet-token prefix whose Haiku equivalent clears 4096.
 */
ok("above every floor IN BOTH TOKENIZERS, the small model wins outright — no break-even",
  breakEvenOutputTokens(
    { ...MEASURED_FINAL_CONTENT, model: "claude-sonnet-5", prefixTokens: Math.ceil(4096 * 1.363) + 10 },
    "claude-haiku-4-5",
  ) === Infinity);

/* And the reverse of today's finding: from Haiku there is no input saving to spend, because Haiku
   is the one model whose floor this prefix misses. */
ok("a model with no input saving to spend returns 0",
  breakEvenOutputTokens(MEASURED_FINAL_CONTENT, "claude-haiku-4-5") === 0);

/* ─────────────── 8b. a cross-model comparison in tokens is not apples to apples ─────────────── */

console.log("\n── token counts are model-specific, and the error has a known direction ──");

/*
 * Sonnet 5 uses a newer tokenizer that produces roughly 30% more tokens for the same text than
 * Sonnet 4.6, and Anthropic's migration guidance is explicit: do not apply a blanket multiplier,
 * re-run `count_tokens` against the model you will actually send to. `ops/tokens.mjs` does that,
 * for free.
 *
 * Until it is run, the comparison above reuses Haiku's counts for every candidate. What makes that
 * acceptable is the DIRECTION of the error, asserted here rather than asserted in prose: a bigger
 * tokenizer inflates the candidate's input (cached at 0.1×, so small) and its output (billed in
 * full, at the higher rate). So reusing the smaller counts flatters the bigger model — and "haiku
 * wins" is a lower bound.
 */
{
  const shape = { ...MEASURED_FINAL_CONTENT, outputTokens: MAX_OUTPUT.final_content };
  const plain = cheapestModelFor(shape, ["claude-haiku-4-5", "claude-sonnet-5"]);
  ok("an unmeasured candidate is flagged as unmeasured",
    plain.ranking.every((r) => r.measured === false));

  /* The same shape, with Sonnet's counts inflated the way the newer tokenizer would inflate them.
     Haiku must not merely still win — it must win by MORE. */
  const inflate = (n) => Math.round(n * 1.3);
  const measured = {
    "claude-sonnet-5": {
      prefixTokens: inflate(shape.prefixTokens),
      messageTokens: inflate(shape.messageTokens),
      outputTokens: inflate(shape.outputTokens),
    },
  };
  const withCounts = cheapestModelFor(shape, ["claude-haiku-4-5", "claude-sonnet-5"], { measured });
  ok("a measured candidate is flagged as measured",
    withCounts.ranking.find((r) => r.model === "claude-sonnet-5").measured === true);
  ok("measuring haiku is unnecessary — it IS the baseline",
    withCounts.ranking.find((r) => r.model === "claude-haiku-4-5").measured === false);

  const gapBefore = plain.ranking[1].usd - plain.ranking[0].usd;
  const gapAfter = withCounts.ranking[1].usd - withCounts.ranking[0].usd;
  ok("haiku still wins once the candidate's real token counts are used",
    withCounts.winner.model === "claude-haiku-4-5");
  ok("and it wins by MORE — so the unmeasured answer was the pessimistic one for haiku",
    gapAfter > gapBefore, `gap $${gapBefore.toFixed(6)} → $${gapAfter.toFixed(6)}`);

  /* Measured counts must be able to change the floor verdict too, not just the price — that is the
     whole reason a 1024-token floor and a 30% tokenizer difference interact. */
  const nearFloor = { ...shape, model: "claude-sonnet-5", prefixTokens: 800 };
  ok("a prefix below a floor stays below it without measurements", !prefixCaches(nearFloor));
  const lifted = cheapestModelFor({ ...shape, prefixTokens: 800 }, ["claude-sonnet-5"],
    { measured: { "claude-sonnet-5": { prefixTokens: 1040, messageTokens: 83 } } });
  ok("a measured count can lift a prefix over a floor the estimate missed",
    lifted.winner.mode === "read");
}

/* ─────────────── 8c. the correction itself, locked down ─────────────── */

console.log("\n── measured beats estimated, and here is the size of the gap ──");

/*
 * This section exists because an estimate produced a wrong recommendation, and the wrongness was
 * invisible: every number looked plausible and the total still matched the invoice.
 *
 * The split was the problem. `prefixTokens` was 2261 and `messageTokens` 64; measured, they are 2032
 * and 293. The total is identical — 2325, the figure production logged — so no cost assertion could
 * have caught it. But a cache only ever discounts the PREFIX, so the split is the entire argument:
 * assuming 64 uncacheable tokens instead of 293 made the cacheable share look like 97% when it is
 * 87%, and that turned "Sonnet is 2.7x cheaper on input" out of "Sonnet is 1.14x cheaper".
 */
ok("the split still reproduces the invoice", Math.abs(callCost(MEASURED_FINAL_CONTENT, "none") - 0.005040) < 1e-9);
ok("the prefix is the measured 2032, not the inferred 2261", MEASURED_FINAL_CONTENT.prefixTokens === 2032);
ok("the message is the derived 293, not the assumed 64", MEASURED_MESSAGE_TOKENS === 293);
ok("prefix + message equals the logged input exactly",
  MEASURED_FINAL_CONTENT.prefixTokens + MEASURED_FINAL_CONTENT.messageTokens === 2325);

{
  const cacheableShare = MEASURED_FINAL_CONTENT.prefixTokens
    / (MEASURED_FINAL_CONTENT.prefixTokens + MEASURED_FINAL_CONTENT.messageTokens);
  ok("the cacheable share of the input is ~87%, not ~97%",
    cacheableShare > 0.86 && cacheableShare < 0.88, `${(cacheableShare * 100).toFixed(1)}%`);
}

/* Sonnet 5 and Opus 5 returned IDENTICAL counts for every task — same tokenizer. Worth asserting,
   because it means one measurement covers both and a future divergence should be noticed. */
for (const task of ["coreRules", ...LIVE_TASKS]) {
  ok(`sonnet 5 and opus 5 tokenize ${task} identically`,
    MEASURED_PROMPT_TOKENS["claude-sonnet-5"][task] === MEASURED_PROMPT_TOKENS["claude-opus-5"][task]);
}

/*
 * The tokenizer ratio, measured on this product's own text rather than borrowed. The migration guide
 * quotes ~30% for Sonnet 5 against Sonnet 4.6 — a different pair — and the real figure against
 * Haiku 4.5 here is 1.363.
 */
ok("haiku is the baseline, ratio 1", tokenizerRatio("claude-haiku-4-5") === 1);
{
  const r = tokenizerRatio("claude-sonnet-5");
  ok("the measured sonnet ratio is ~1.36, not the borrowed ~1.30", r > 1.35 && r < 1.38, r.toFixed(3));
  ok("an unmeasured model does not silently get a ratio of its own", tokenizerRatio("claude-imaginary-9") === 1);
}

/* And the corrected verdict: the crossover is now tiny, so Haiku wins at any realistic output. */
{
  const be = breakEvenOutputTokens(measuredShape("final_content", "claude-haiku-4-5", 900), "claude-sonnet-5");
  ok("the measured break-even is far below the old estimate of 145", be < 40, `${be.toFixed(0)} tokens`);
  ok("and below every output cap in the product",
    Object.values(MAX_OUTPUT).every((cap) => cap > be));

  /* Opus 5 cached is DEARER on input than uncached Haiku, so there is no crossover at all. */
  const opus = breakEvenOutputTokens(measuredShape("final_content", "claude-haiku-4-5", 900), "claude-opus-5");
  ok("opus 5 has no crossover — it is dearer on input too", opus === 0, `${opus}`);
  console.log(`   (measured break-even vs sonnet 5: ${be.toFixed(0)} output tokens; vs opus 5: none)`);
}

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
