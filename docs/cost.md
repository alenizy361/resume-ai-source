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

**Built and tested; off by default.** `lib/aiSchemas.ts` holds all four schemas and
`ops/schemas.test.mjs` asserts 53 things about them — that they stay inside the documented subset,
that every object carries the required `additionalProperties: false`, that "off" means the parameter
is *absent* rather than present-and-empty, and, the assertion worth having, that each schema's keys
are derived-and-compared against the prose example so a key added to one and not the other fails a
test. What no test here can prove is that a schema-constrained model still honours the LIMITS prose.
That needs one real run: set `ANTHROPIC_STRUCTURED_OUTPUTS=1` on the deployment and run
`npm run ai:stages` — about $0.05, and the harness now prints which mode it saw.

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

**Model tiering — cheapest, but not for the obvious reason.** Every task runs on the `fast` class
(`claude-haiku-4-5`); `claude-sonnet-5` is the configured reasoning model and no task is assigned to
it. "Small model is cheaper" is the wrong reasoning to reach that conclusion by, because the cache
floors cut across it. Haiku's floor is 4096 and Sonnet's is 1024, and this product's prefix sits
**between them** — so the real comparison is uncached Haiku against Sonnet at a tenth of its input
price:

| | Input per call |
|---|---|
| Haiku, prefix 2261, **uncached** (floor missed) | $0.002325 |
| Sonnet 5, same prefix, **cache read** | $0.000870 |

**On input alone the bigger model is 2.7× cheaper.** What reverses it is output: Sonnet charges
$15/M against Haiku's $5, so each output token costs $10/M more and repays the $0.001455 input
saving after **145 tokens**. Against Opus 5 the threshold is **44**.

So Haiku wins only where output exceeds that, and every live task does — comfortably:

| `/api/generate` task | Output cap | Break-even vs Sonnet | Margin |
|---|---|---|---|
| `role_blueprint` | 1400 | 150 | 9.3× |
| `experience_package` | 1100 | 146 | 7.5× |
| `final_content` | 900 (measured 543) | 145 | 6.2× (3.7× measured) |
| `jd_delta` | 500 | 138 | 3.6× |

`cheapestModelFor` and `breakEvenOutputTokens` in `lib/aiEconomics.ts` compute this, and
`ops/economics.test.mjs` runs them over the **live** `CORE_RULES`, `TASK_SCHEMA` and `MAX_OUTPUT` —
so adding a short-output task to `/api/generate` fails the suite rather than quietly overpaying. The
narrowest margin is `jd_delta` at 3.6×; a task capped under ~145 tokens would be genuinely cheaper
on cached Sonnet.

Two caveats, both of which make Haiku's win larger rather than smaller — so the conclusion is a
lower bound, not a best case.

**Token counts are model-specific, and the table above reuses Haiku's.** Sonnet 5 uses a newer
tokenizer that produces roughly 30% more tokens for the same text than Sonnet 4.6. Anthropic's own
migration guidance is explicit about the remedy — *"Do not apply a blanket multiplier"*, re-run
`count_tokens` against the model you will actually send to — so `aiEconomics.ts` refuses to invent
one and instead accepts measurements, flagging any row it did not get them for. Reasoning about the
direction of that gap is what makes the unmeasured answer usable: a larger tokenizer inflates the
candidate's input (cached at 0.1×, so small) *and* its output (billed in full, at the higher rate).
Applying a 1.3× factor to Sonnet moves `final_content` from $0.014370 to $0.018681 against Haiku's
$0.006825, and drops the break-even from 145 tokens to **82**. Haiku wins by more, not less.

**Run `npm run ai:tokens` to remove the estimate entirely — it bills $0.00.**
`POST /v1/messages/count_tokens` returns a count and no completion, so nothing is billed: no output
tokens, no input tokens. The script measures `CORE_RULES` and all four task schemas on each of the
three models, prints the floor verdict per model, and emits a JSON block that
`cheapestModelFor({ measured })` consumes. Unlike `npm run ai:stages`, which spends real credit,
this one can be run as often as you like.

There is no task under the threshold today. `MAX_OUTPUT` lists four names under it or near it —
`occupation_classify` (120), `bullet_rewrite` (160), `achievement_write` (400), `ask_section` (400) —
but `/api/generate`'s `TASKS` array accepts only the four in the table above, so three of those names
are routed nowhere and cost nothing. (`ask_section` reaches `/api/suggest`, which is a different
prompt shape — see below.) A dead table entry is not a saving opportunity.

**`/api/suggest` has no `cache_control` at all, and that is correct.** Next to `/api/generate`'s two
breakpoints it looks like an oversight. Its only stable text is `DRAFTING_DOCTRINE` plus a one-line
shape rule — **409 tokens**, measured — which is below *every* model's floor, Opus's 512 included.
Markers there would be accepted and silently ignored on any model we could send them to. Asserted,
so the claim decays visibly if the doctrine grows.

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
Nothing schedules it. `ops/tokens.mjs` is the opposite and worth knowing about for that reason —
`count_tokens` returns a count and no completion, so it bills nothing and can be run freely.

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
