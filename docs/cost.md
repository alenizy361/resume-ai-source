# Cost: what is actually billed, and the cheapest correct setting for each line

Written 2026-07-26. Every figure is either measured from this product's own logs or taken from a
vendor's current pricing page, and each is labelled which. Nothing here is an estimate dressed as a
measurement.

## Start with the bill, because it changes the whole answer

Vercel Web Analytics, 30 days to 2026-07-26:

| Day | Visitors | Pageviews |
|---|---|---|
| Jun 26 – Jul 24 | 0 | 0 |
| Jul 25 | 10 | 146 |
| Jul 26 | 2 | 32 |

**The product has no traffic yet.** Total AI spend measured today was about $0.05, most of it my own
test runs. So the honest framing is not "what is expensive" — nothing is — but:

> Which costs are **structural** (they grow with success and are awkward to change later) and which
> are **tunable** (they can be set correctly the day the traffic arrives)?

Spending effort on a tunable line at zero traffic is optimising a number that is currently zero. The
items below are ordered by that distinction, not by size.

## 1. The AI call — the only cost that scales per user

Anchored to a real logged call, `/api/generate` op=`final_content`, 2026-07-26 09:13:43 UTC:

```
provider=anthropic model=claude-haiku-4-5 input=2325 output=543 ms=4106
usd=0.005040  cacheRead=0 cacheWrite=0 cached=false
```

`2325/1e6 × $1 + 543/1e6 × $5 = $0.005040` — the price model in `lib/aiEconomics.ts` reproduces the
logged figure to the microdollar, which is what makes the rest of this section arithmetic rather than
opinion. `ops/economics.test.mjs` asserts it on every `npm test`.

### The three facts that decide every AI cost question here

**Output is 54% of the bill.** Input caching discounts input only, so a *perfect* cache cannot save
more than 46% of a call. That is the ceiling on the entire caching discussion.

**The cache floors are not monotonic — the small model has the high one.** Haiku 4.5 requires a
4096-token cached prefix, Sonnet 5 needs 1024, Opus 5 needs 512. The shared prefix here is 2261
tokens (`CORE_RULES` 1898 + one task schema ~363), so it clears Sonnet's floor and misses Haiku's.
Below the floor the `cache_control` marker is **accepted and silently ignored** — no error, no
warning, full price.

**A 1-hour cache TTL exists** (generally available, no beta header) at 2× the write instead of
1.25×, reads still 0.1×. It pays off after two reads instead of one.

### Priced options, per call

| Option | Cache miss | Cache hit | No caching |
|---|---|---|---|
| **Today** — Haiku, prefix 2261, markers ignored | — | — | **$0.005040** |
| Pad prefix to 4100, 5-min TTL | $0.007904 | $0.003189 | — |
| Pad prefix to 4100, **1-hour TTL** | $0.010979 | $0.003189 | — |
| Sonnet 5 (caches immediately) | $0.016816 | $0.009015 | — |
| Opus 5 (caches immediately) | $0.028026 | $0.015026 | — |

Break-even read fractions: **60.7%** with the 5-minute TTL, **76.2%** with the 1-hour TTL. Production
is doing **four `/api/generate` calls an hour**. Even assuming all four cluster inside one hour, that
is 75% reads — below the 1-hour break-even, and far below with any realistic spacing.

**Cheapest correct setting: change nothing.** Padding the prefix is +57% at this traffic; Sonnet is
+79% even on a cache hit; Opus is +198%. Revisit when `/api/generate` sustains roughly **30 calls an
hour**, and `/api/health/ai` will say so itself — the `cacheDecision` field computes the verdict from
live numbers rather than repeating this paragraph.

### The two AI wins that have no trade-off — both shipped

**A cancelled generation is no longer billed.** `useAiTask` single-flights by aborting its own fetch,
but aborting a fetch only closes the browser's end: the route went on waiting for Anthropic and paid
in full for a completion nobody received. Tap twice, pay twice, see one answer. `/api/generate` now
forwards `req.signal` to the provider call.

**The shared cache key hashes meaning, not spelling.** `country` reaches the key as free text, so
`"Saudi Arabia"`, `"السعودية"`, `"KSA"` and `"المملكة العربية السعودية"` produced **four separate
cache entries for identical content** — measured. `seniority` had the same fault across languages:
an Arabic interface sends `"متوسط"` where an English one sends `"Mid"`, and both can be building an
English CV, so `cvLang` did not separate them either. Every extra key is a full-price generation of
something the cache already held.

`normalizeContext` now folds the country through `countryCode()` — which already handles Arabic
orthography and substrings, because `countryRules.ts` needed exactly this — and the seniority through
the closed set the form offers. Asserted both ways: six spellings of one country collapse to one key,
and four genuinely different countries stay four.

### The largest available saving, not yet taken

The Batch API is **half price** and stacks with caching. It is asynchronous, so no form field can use
it — but `role_blueprint` is already a **cross-user** pack cached in Redis with no TTL, and it is the
most-called task. Today the first visitor for each occupation pays full price and everyone after them
gets it free.

| | |
|---|---|
| `role_blueprint`, standard | $0.006329 |
| `role_blueprint`, batch (−50%) | $0.003165 |
| Pre-warming 113 catalogue occupations × 2 languages | **$0.72, once** |

After that every visitor's first blueprint is a $0 cache hit instead of a $0.0063 call — and arrives
instantly instead of after four seconds, so it is a product improvement as well as a cost one.

**Not built.** It needs an Anthropic key and Upstash credentials, neither of which exists in this
sandbox, and shipping a batch job I could not run once would be worse than shipping nothing. The
cache-key fix above is the prerequisite and is done: pre-warming a fragmented key space would have
warmed the wrong keys.

## 2. Hosting — structural, and worth knowing before traffic arrives

**Every page on this site is a serverless function invocation.** The build's route table shows `ƒ`
(dynamic) for all 425 routes except five. That includes all 382 sitemap URLs — every profession page,
every sector page, `/pricing`, `/terms` — pages whose content comes entirely from constants in
`lib/jobs.ts`, `lib/jobs-ar.ts` and `lib/sectors.ts` and could not vary by request.

The cause is one line, `app/layout.tsx`:

```ts
const pathname = (await headers()).get("x-pathname") || "";
```

Reading `headers()` in the **root** layout opts the entire application into dynamic rendering, and it
also rules out ISR. It is there for two honest reasons: `<html lang dir>` on `/ar/*`, and the JSON-LD
`inLanguage`.

Vercel's own documentation is explicit that this is the expensive shape: *"if the function response
is cached, it will not run and incur a Function invocation or any GB/hrs of duration"*, and CDN reads
and writes are free. Function invocations are $0.0000006 each on Pro — trivial in isolation — but the
Active CPU and Provisioned Memory of rendering a 766-word React tree, on every visit and every
Googlebot fetch of 382 pages, is not the free path.

**Deliberately not changed.** The correct fix is Next's multiple-root-layout pattern: move the
English routes under a `(en)` route group and the Arabic ones under `(ar)`, each with its own
`<html>`. That relocates about forty route folders and every one of the 382 URLs is an SEO asset that
must not move. Trading a real risk to 382 indexed URLs against a hosting cost that is **currently
zero** is the wrong trade today.

**The trigger:** do it when organic traffic is consistent enough for Vercel's usage page to show
function duration as a real line item — or immediately before any paid-traffic campaign, whichever
comes first. It is a contained, reviewable change; it is just not an urgent one, and it is much safer
done deliberately than under pressure.

## 3. The lines that are already at their cheapest

**The shared pack cache.** `role_blueprint` and `jd_delta` are cached cross-user in Upstash with no
TTL, and the logs show it working: `op=role_blueprint:cache-hit provider=cache usd=0`. `final_content`
and `experience_package` are correctly *not* shared — they are derived from one person's own facts.

**Model tiering.** Every task runs on the `fast` class (`claude-haiku-4-5`); `claude-sonnet-5` is
configured as the reasoning model and no task is assigned to it. That is the cheap setting already.

**Output caps.** `MAX_OUTPUT` is per task (900 for `final_content`, 1400 for `role_blueprint`). Caps
do not cost anything unless used — the measured call used 543 of 900 — so there is no saving in
lowering them, only a risk of truncating a summary.

**Rate limits and budgets.** `lib/aiBudget.ts` caps spend per bucket, and `/api/health/ai` reports
whether the limiter is backed by Redis or counting in memory. In-memory counting means the effective
limit is the configured number times the number of warm instances, which is a cost exposure worth
knowing about — reported rather than assumed.

## 4. Where money could leak quietly

**Custom analytics events.** The funnel added six event names, and Web Analytics events are billed
per event beyond the plan's included amount. `funnel_landing` fires once per tab, not once per page
view, specifically so it does not duplicate the pageview count that Vercel already collects.

**`?live=1` on the health endpoint.** It sends a real completion and is opt-in per request for that
reason. An uptime monitor pointed at it would bill a call on every ping. Point monitors at
`/api/health/ai` without the flag; it makes no model call.

**`ops/ai-stages.mjs`.** Ten real calls, roughly $0.04–0.06, and it prints the exact total at the end.
Nothing schedules it.

## The order to act in

1. **Nothing, on the AI side.** The current configuration is the cheapest; the two free wins are
   already shipped. `/api/health/ai` will tell you when that stops being true.
2. **Pre-warm the occupation packs via the Batch API** — $0.72 once, and the biggest single
   improvement available to both cost and latency. Needs a key and Upstash credentials.
3. **Split the root layout into two route groups** when traffic makes function duration visible, or
   before any paid campaign.
4. **Re-read this file against the bill** once there is a bill. Every number here is either
   reproducible from `ops/economics.test.mjs` or a link below.

## Sources

- [Prompt caching — Claude Platform Docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [Batch processing — Claude Platform Docs](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
- [Pricing — Claude Platform Docs](https://platform.claude.com/docs/en/about-claude/pricing)
- [Fluid compute pricing — Vercel](https://vercel.com/docs/functions/usage-and-pricing)
- [Function invocations now billed per unit — Vercel](https://vercel.com/changelog/function-invocations-now-billed-per-unit)
- [Calculating usage of resources — Vercel](https://vercel.com/docs/pricing/how-does-vercel-calculate-usage-of-resources)
- [ISR usage and pricing — Vercel](https://vercel.com/docs/incremental-static-regeneration/limits-and-pricing)
