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
4096-token cached prefix, Sonnet 5 needs 1024, Opus 5 needs 512. Measured with `count_tokens`, the
`final_content` prefix is **2032** tokens on Haiku and **2779** on Sonnet 5 — so it clears Sonnet's
floor and misses Haiku's. Below the floor the `cache_control` marker is **accepted and silently
ignored** — no error, no warning, full price.

**Token counts are per model, and the prefix/message split is the whole cache argument.** Everything
above is measured, and an earlier version of this document was not. See the correction below.

### The floor behaviour, observed rather than cited

Until now the claim "below the floor the marker is accepted and silently ignored" came from the
documentation. `GET /api/health/ai?live=1` on a preview deployment sent the **same two cached blocks**
to two models and reported what the provider billed:

| Model | Prompt | `cache_write` | `cache_read` | Uncached input | Verdict |
|---|---|---|---|---|---|
| Haiku 4.5 (floor 4096) | `CORE_RULES` + `role_blueprint` | **0** | 0 | **2127** | markers ignored, full price |
| Sonnet 5 (floor 1024) | identical | **2873** | 0 | 14 | prefix cached |

Same request, same markers, opposite outcomes — the non-monotonic floor, visible in the billing
rather than inferred from a document. The 2873 also independently confirms the `count_tokens` figure
of 2878 to within five tokens, and 2127 confirms Haiku's 2121.

That run also settled a live question: `thinking: {type: "disabled"}` — a parameter this product only
started sending, on the escalation tier that nothing normally reaches — returns **200 on Sonnet 5**.
Given that the bug it replaced was an unacceptable `temperature` silently 400ing on that exact model,
confirming the replacement was worth the **$0.013** the two probes cost.

**A 1-hour cache TTL exists** (generally available, no beta header) at 2× the write instead of
1.25×, reads still 0.1×. It pays off after two reads instead of one.

### Priced options, per call

All figures below use `count_tokens` measurements, and the bigger models' output is scaled by their
measured 1.363x tokenizer ratio — the same answer costs more tokens there.

| Option | Cache miss | Cache hit | No caching |
|---|---|---|---|
| **Today** — Haiku, prefix 2032, markers ignored | — | — | **$0.005040** |
| Pad prefix to 4100, 5-min TTL | $0.008133 | $0.003418 | — |
| Sonnet 5 (caches immediately) | $0.022718 | $0.013131 | — |
| Opus 5 (caches immediately) | $0.037864 | $0.021885 | — |

Break-even read fraction for padding: **65.6%**, about **35 calls an hour**. Production is doing
**four**, so even if all four clustered inside one five-minute window the padding would not pay.

**Cheapest correct setting: change nothing.** Padding is +61% on a miss at this traffic; Sonnet is
**+161% even on a cache hit**; Opus is +334%. Revisit when `/api/generate` sustains roughly 35 calls
an hour, and `/api/health/ai` will say so itself — the `cacheDecision` field computes the verdict from
live numbers rather than repeating this paragraph.

### The AI wins that have no trade-off — all shipped

**A cancelled generation is no longer billed.** `useAiTask` single-flights by aborting its own fetch,
but aborting a fetch only closes the browser's end: the route went on waiting for Anthropic and paid
in full for a completion nobody received. Tap twice, pay twice, see one answer. `/api/generate` now
forwards `req.signal` to the provider call.

**Reasoning is now switched off on the escalation model.** `max_tokens` is a hard cap on thinking
*plus* response text. Every budget in `MAX_OUTPUT` was sized on Haiku, which does not think — 900
tokens for three summaries, 500 for a JD delta. The escalation path routes to `claude-sonnet-5`,
which thinks unless told not to, so an escalated call spent part of that budget reasoning, **billed
the reasoning as output at $15/M**, and could return truncated JSON with
`stop_reason: "max_tokens"`.

The sharp end is which escalation triggers this: `schema-invalid-retry`. The rescue for invalid JSON
was a call *more* likely to produce invalid JSON, at three times the price. `/api/generate` now sends
`thinking: {type: "disabled"}` wherever the model both thinks by default and permits the parameter.
Disabled rather than given headroom, deliberately: what escalation buys here is the stronger base
model on a task that is already schema-constrained and validated on arrival, and paying $15/M for
reasoning tokens nobody sees, behind a form field with a 30-second timeout, buys latency and cost
instead of quality. Fable 5 and Mythos 5 reject an explicit disable, so `outputBudget()` gives those
4× output headroom instead — unreachable today, but `ANTHROPIC_MODEL_REASONING` is an environment
variable and a 400 behind a form field is not an acceptable way to find that out.

**And the same two rules on every Anthropic route, not just the one that was audited.** All four
call sites — `/api/generate`, `/api/translate`, `/api/optimize`, `/api/cover-letter` — are now checked
by one loop in `ops/aiwiring.test.mjs`, because a fix applied in one route is not the product learning
anything. Two defects it found:

- **`/api/translate` sent `temperature: 0` unconditionally, and escalates to Sonnet 5.** Every
  escalated translation was answering **HTTP 400** — the route logs `http-400` and breaks, so the
  retry that exists to rescue a bad translation had never once run. This is precisely the fault that
  produced `acceptsTemperature` in the first place; the fix landed in `/api/generate` and this route
  kept the bug. A 400 bills nothing directly, but a user whose translation silently fails retries the
  whole document, and that does.
- **`/api/optimize` and `/api/cover-letter` read `process.env.AI_MODEL || "claude-sonnet-5"`
  unguarded.** `AI_MODEL` also names the *NVIDIA* model those routes default to, so setting it to
  `meta/llama-4-maverick-…` — the correct value for their default provider — sends an NVIDIA id to
  `api.anthropic.com` the moment `AI_PROVIDER=anthropic`. The result is a 404 that reads like an
  outage. Both now go through `claudeModelOr`, which keeps a valid Claude id, falls back otherwise,
  and logs the variable's *name* only.

The temperature check counts occurrences inside the Anthropic request body and requires each to sit
in an `acceptsTemperature` guard — scoped to that body, because the NVIDIA branches accept
`temperature` perfectly well and a file-wide grep would teach the next person to delete a working
parameter. Verified by reverting the fix and watching the assertion fail.

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

### The retry that costs four times a clean call — schemas built, switch off

The most expensive thing `/api/generate` can do is fail to parse its own answer. A malformed brace
raises `schema-invalid-retry`, which re-sends the whole request to `claude-sonnet-5`:

| | |
|---|---|
| Clean `final_content` on Haiku | $0.005040 |
| Failed Haiku call (billed in full) + Sonnet retry | **$0.019410** |

Nearly 4×, for a response whose *content* was probably fine. **Structured outputs remove that class
of failure instead of retrying it** — `output_config: {format: {type: "json_schema", schema}}`
constrains the response so "wrapped its JSON in prose" and "dropped a key" stop being possible. It is
supported on **Claude Haiku 4.5**, which is what makes it a saving rather than a reason to move up a
tier.

What it does *not* do is enforce size. The documented JSON Schema subset has no `minItems`/`maxItems`,
no string or numeric bounds — so "exactly 3 summaries", "12–15 skills in total", "one improved bullet
per line the user wrote and NOT ONE MORE" are inexpressible. Those are the rules that stop the model
inventing content, so the prose `TASK_SCHEMA` blocks stay and the route's own `validate()` stays.
Three layers, none redundant: the API guarantees the container, the prompt asks for the counts, the
validator checks them.

**Built and tested; off by default, with a probe that can justify turning it on.**
`lib/aiSchemas.ts` holds all four schemas and `ops/schemas.test.mjs` asserts 53 things about them —
that they stay inside the documented subset, that every object carries the required
`additionalProperties: false`, that "off" means the parameter is *absent* rather than
present-and-empty, and, the assertion worth having, that each schema's keys are derived-and-compared
against the prose example so a key added to one and not the other fails a test.

None of that can tell you whether the **provider** accepts the schemas, and while that stays
unanswered the switch is one nobody can justify flipping — so the 4× retry path stays reachable
forever by default. `GET /api/health/ai?live=1` now sends one real generation with `output_config`
attached, on `jd_delta` (the smallest schema, the smallest output cap), for about **$0.003**. It
reports three separate facts, because they fail for different reasons: whether the request was
**accepted** (a 400 means a malformed schema), whether the body **parsed** as JSON, and whether the
parsed object carries **exactly** the schema's keys — a 200 whose body is prose would pass a naive
check while the constraint did nothing.

If that comes back clean, `ANTHROPIC_STRUCTURED_OUTPUTS=1` is safe to set. Counts are still not
enforced by the schema, only the shape, so the prose LIMITS and the route's own validator both stay.

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

**Model tiering — cheapest, and now measured rather than estimated.** Every task runs on the `fast`
class (`claude-haiku-4-5`); `claude-sonnet-5` is the configured reasoning model and no task is
assigned to it. "Small model is cheaper" is still the wrong reasoning to reach that by, because the
cache floors cut across it: Haiku's floor is 4096 and Sonnet's is 1024, and this product's prefix sits
**between them**. So the real comparison is uncached Haiku against Sonnet at a tenth of its input
price.

> ### Correction
>
> An earlier version of this section said Sonnet was **2.7x cheaper on input**, with a break-even at
> **145 output tokens**. Both numbers were wrong. They came from estimated token counts; the measured
> ones are below.

| Input per call, `final_content` | Measured |
|---|---|
| Haiku, prefix 2032 + message 293, **uncached** | $0.002325 |
| Sonnet 5, prefix 2779 + message 399, **cache read** | $0.002031 |

**1.14x, not 2.7x** — and the break-even collapses to **19 output tokens**. Three errors compounded,
all flattering the bigger model:

- The real cacheable prefix is **2032**, not the estimated 2261 — less to discount.
- The real **uncacheable** message is **293** tokens, not the 64 I had assumed. No cache touches it.
  This was the big one: it made the cacheable share of the input look like 97% when it is **87%**.
- Sonnet's tokenizer inflates every count by a measured **1.363x** — output as well as input, so the
  same three summaries cost $15/M x 1.363 instead of $15/M.

Nothing in the recommendation changes; Haiku still wins, by more. But the reason the first answer was
wrong is worth keeping: the total was never in doubt — 2032 + 293 = 2325, exactly what production
logged, so no cost assertion could have caught it. A cache discounts the **prefix only**, so the
prefix/message *split* is the entire argument, and I guessed the half that mattered.

| `/api/generate` task | Output cap | Break-even vs Sonnet (measured) | Margin |
|---|---|---|---|
| `role_blueprint` | 1400 | 23 | 61x |
| `experience_package` | 1100 | 19 | 58x |
| `final_content` | 900 (measured 543) | 19 | 47x (29x measured) |
| `jd_delta` | 500 | 15 | 33x |

Opus 5 has **no crossover at all**: cached, it is dearer on input than uncached Haiku, so there is no
output length at which it wins.

Two more things only measurement produced. **Sonnet 5 and Opus 5 return identical counts** for every
task — same tokenizer, different floors and prices. And the ratio against Haiku is **1.363** on this
product's own text, not the ~1.30 the migration guide quotes; that figure compares Sonnet 5 with
Sonnet 4.6, a different pair. Anthropic's guidance is explicit — *"Do not apply a blanket
multiplier"* — so `aiEconomics.ts` stores `MEASURED_PROMPT_TOKENS` and `ops/economics.test.mjs`
recomputes every figure above from it. Refresh with `npm run ai:tokens` or
`GET /api/health/ai?tokens=1`, both **free**.

There is no task under the threshold. `MAX_OUTPUT` lists `occupation_classify` (120),
`bullet_rewrite` (160), `achievement_write` (400) and `ask_section` (400), but `/api/generate`'s
`TASKS` array accepts only the four above, so three of those names are routed nowhere and cost
nothing. (`ask_section` reaches `/api/suggest`.) A dead table entry is not a saving opportunity.

**`/api/suggest` has no `cache_control` at all, and that is correct — measured, on all three models.**
Next to `/api/generate`'s two breakpoints it looks like an oversight. Its only stable text is
`DRAFTING_DOCTRINE` plus a one-line shape rule:

| Model | Stable text | Floor | Verdict |
|---|---|---|---|
| Haiku 4.5 | 333 | 4096 | far below |
| Sonnet 5 | 453 | 1024 | below |
| Opus 5 | **453** | **512** | below, by 59 tokens |

Opus is the one worth having measured. Scaling the Haiku figure by the 1.363× ratio predicted ~502
against a 512 floor — a ten-token margin, which is not a claim, it is a coin toss. The real number is
453, so the claim holds on every model with room to spare. Nothing changes for `/api/suggest` today;
what changes is that the sentence no longer rests on arithmetic I did once. Asserted, so it decays
visibly if the doctrine grows.

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
Nothing schedules it. `ops/tokens.mjs` and `?tokens=1` are the opposite and worth knowing about for
that reason — `count_tokens` returns a count and no completion, so they bill nothing and can be run
freely.

**The escalation tier is now probed too, under `?live=1`.** One extra call on `claude-sonnet-5` with
`max_tokens: 4`, roughly $0.008, and only when that flag is passed. It exists because nothing
normally reaches the reasoning model — escalation needs a low-confidence classification or a schema
failure — so a request shape that is wrong for it stays broken while every dashboard reads green.
That is not hypothetical: it is exactly how `/api/translate` sent an unacceptable `temperature` to
Sonnet 5 for months.

**An always-thinking model in `ANTHROPIC_MODEL_REASONING`.** Reasoning tokens are billed as output,
at the escalation model's output rate. `/api/generate` disables thinking where it can, but a model
that refuses to be told (Fable 5, Mythos 5) would bill them, and `outputBudget()` raises the ceiling
4× to keep the answer intact — so misconfiguring that variable is a real multiplier on the most
expensive call in the product, not a no-op.

## The order to act in

1. **Nothing, on the AI side.** The current configuration is the cheapest — checked per task
   against the cache floors, not assumed from model size — and the two free wins are already
   shipped. `/api/health/ai` will tell you when the caching verdict stops being true, and
   `ops/economics.test.mjs` will fail if a new short-output task makes the model choice wrong.
2. **Turn on structured outputs** — `ANTHROPIC_STRUCTURED_OUTPUTS=1`, then `npm run ai:stages` to
   confirm the counts still hold. About $0.05 to verify, and it removes the 4×-cost retry path.
3. **Pre-warm the occupation packs via the Batch API** — $0.72 once, and the biggest single
   improvement available to both cost and latency. Needs a key and Upstash credentials.
4. **Split the root layout into two route groups** when traffic makes function duration visible, or
   before any paid campaign.
5. **Re-read this file against the bill** once there is a bill. Every number here is either
   reproducible from `ops/economics.test.mjs` or a link below.

## Sources

- [Prompt caching — Claude Platform Docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [Batch processing — Claude Platform Docs](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
- [Pricing — Claude Platform Docs](https://platform.claude.com/docs/en/about-claude/pricing)
- [Fluid compute pricing — Vercel](https://vercel.com/docs/functions/usage-and-pricing)
- [Function invocations now billed per unit — Vercel](https://vercel.com/changelog/function-invocations-now-billed-per-unit)
- [Calculating usage of resources — Vercel](https://vercel.com/docs/pricing/how-does-vercel-calculate-usage-of-resources)
- [ISR usage and pricing — Vercel](https://vercel.com/docs/incremental-static-regeneration/limits-and-pricing)
