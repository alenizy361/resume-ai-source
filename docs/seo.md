# SEO: what was measured, what was fixed, what is left

Written 2026-07-26. Every number here came from `src/ops/seo-audit.mjs` run against a production
build (`next build && next start`), not from reading the source. Re-run it after any change that
touches metadata, routing or a page's server-rendered body:

```
cd src && npm run build && npx next start -p 3200 &
node ops/seo-audit.mjs http://localhost:3200 --json /tmp/seo.json
```

## Why a crawler and not a checklist

Every SEO claim in a repository is a claim about generated HTML: the title comes from a metadata
export, the canonical from a helper, the hreflang from a layout three levels up, and the body from a
component that may render nothing until JavaScript runs. Reading the source tells you what was
intended. Only fetching tells you what was sent — and search engines index what was sent.

That distinction is not academic here. It is how the two worst problems were found, and neither was
visible from the code.

## The state now

| | |
|---|---|
| Sitemap routes | 363 |
| Crawled (sampled: 3 per templated family) | 195 |
| Indexable | 188 |
| With a canonical | 188 / 188 |
| With reciprocal hreflang | 100 (every bilingual page) |
| Average words in the **server** response | 522 |
| Indexable pages under 200 words | 1 |
| Structured data types | Organization, SoftwareApplication, BreadcrumbList, FAQPage |
| Open findings | 17 |

First run, before any of this: **336 findings**.

## What was actually wrong

### 1. The money pages were empty

`/optimize` shipped **65 words** to a crawler. `/ar/optimize` shipped 50, `/builder` 112,
`/ar/builder` 96. Those are the pages meant to rank for *ATS resume checker*, *فحص السيرة الذاتية*
and *AI resume builder* — the highest-intent queries this product has — and they arrived with
nothing in them, because each is a client component and the page is whatever renders before
JavaScript. Metadata cannot rescue an empty body; a title tag is a label, not content.

All four now carry 450–550 words of server-rendered content: what the tool does, how it works, what
it refuses to do, and the questions people actually ask. It is rendered through
`components/seo/PageBody.tsx`, which takes the content as data so each page's words are its own and
only the shape is shared.

**The Arabic text is written in Arabic, not translated.** Two pages saying the same thing in two
languages are one duplicated page.

### 2. Every Arabic alternate was one-way

The Arabic job pages had declared their English twin since they were written. The English side never
declared back. An hreflang that is not returned is discarded by Google — so the pair was ignored and
the two languages competed for one intent instead of serving two audiences. Fixed across
`resume-examples`, `cover-letter-examples` and `resume-skills`, guarded on the Arabic catalogue
actually containing that job: an alternate pointing at a page that does not exist invalidates the
whole cluster.

### 3. The Arabic content pages were a third of the English ones

`/ar/resume-skills/<job>`: 159 words against 508 for the English twin. Lists of keywords and
certificates, no prose. They now carry job-specific Arabic prose — how to place the skills inside
experience lines, five mistakes that are common in this market, and a caveat under the certificates
saying plainly that they are what adverts ask for while a legal licence is decided by the regulator
and must be checked with them. 159 → 390 words.

### 4. Private pages were indexable and identical

`/login` and `/pay/callback` had no metadata of their own, so they inherited the root title and
description — three private screens all telling Google they were the same page. Both are `noindex`
now, with their own titles. A search result that lands on a login form is a bounce.

### 5. Sixty-three titles were truncated exactly where the brand sat

With `| Sira` appended, most of the `resume-skills` and `cover-letter-examples` titles ran past 65
characters, and what gets cut is the end. A suffix only ever shown when the title is short enough
not to need it costs the page its most specific words. Dropped from the templated families.

### 6. Five pages used the domain as a brand name

`| cv.rabit.sa` in the title on the home page, the builder and the account page, while 108 others
said `| Sira`. One name now: **Sira** in English, **سيرة** in Arabic. The domain is an address.

## Redirect map

| From | To | Why |
|---|---|---|
| `/build` | `/builder` | The long single-page builder is retired — one product, not two |
| `/ar/build` | `/ar/builder` | ″ |
| `/journey` | `/builder` | The chat door is retired |
| `/ar/journey` | `/ar/builder` | ″ |

All 308. Both `/build` addresses were linked from the mobile menu, every template page and every
resume-example page; those links now point at `/builder`, but the ones in someone's history do not.

## What is left, named rather than hidden

| Finding | Count | Note |
|---|---|---|
| `title-long` | 6 | The longest job names — "Customer Service Representative" adds 31 characters to a template |
| `description-long` | 6 | Same families, same cause |
| `redirect` | 4 | The table above. Intentional |
| `thin` | 1 | `/interview-live` — a live voice tool whose page genuinely is the app |

## Not done, and honest about it

The brief asks for more than one session can verify. These are the pieces that were **not** built,
so nobody has to discover it later:

- **Category pages** (`/resume-examples/healthcare`, `/resume-skills/engineering`, …). The
  templated pages link to siblings within a category, but there is no page for the category itself.
- **The twenty rebuilt Saudi profession pages.** The existing ones are decent and generic; the brief
  asks for local licences, local salary sourcing and per-profession depth. That work is gated on the
  same thing `countryRules.ts` is gated on — a person opening a regulator's website. See
  `ops/verify-rules.mjs`.
- **Free standalone tool pages** beyond the two that exist (`/optimize`, `/builder`).
- **Salary sections.** Deliberately absent. There is no verified Saudi salary source in this
  repository, and converting an American figure to riyals is the exact failure the brief names.
- **Analytics events for the organic funnel.** `track()` fires inside the builder; the search →
  tool → builder → payment path is not yet instrumented end to end.
- **Original data reports.** Nothing is aggregated yet, and inventing a sample size would be worse
  than publishing nothing.

## The three-month order

1. Category pages for the eleven sectors, each linking down to its professions and across to the
   tools. This is what turns 363 pages into a structure rather than a list.
2. The twenty priority professions, rebuilt with verified local credentials — after the country
   rules are verified, not before.
3. Organic funnel instrumentation, so the next round of work is chosen from data rather than from
   a brief.
4. Two more free tools, each with a permanent URL and a result worth sharing.
5. Editorial answers to the questions people actually ask, each linked from the professions and
   tools it serves.
