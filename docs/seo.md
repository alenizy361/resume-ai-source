# SEO: what was measured, what was fixed, what is left

Written 2026-07-26, second pass the same day (the category layer, the two orphaned Arabic hubs, and
the organic funnel). Every number here came from `src/ops/seo-audit.mjs` run against a production
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

| | first run | after pass 1 | after pass 2 |
|---|---|---|---|
| Sitemap routes | 363 | 363 | **382** |
| Crawled (sampled: 3 per templated family) | 195 | 195 | 198 |
| Indexable | 188 | 188 | **191** |
| With a canonical | — | 188 / 188 | **191 / 191** |
| With reciprocal hreflang | 0 | 100 | **104** |
| Average words in the **server** response | — | 522 | **531** |
| Indexable pages under 200 words | — | 1 | **0** |
| Pages built | 402 | 406 | **425** |
| Open findings | **336** | 17 | **4** |

The four that remain are the four intentional redirects in the table below. Every title, every
description, every canonical, every hreflang pair and every page's word count now passes.

Structured data: Organization, SoftwareApplication, BreadcrumbList, FAQPage, ItemList, Offer.
`ItemList` is new with the sector pages and is generated from the same array that is rendered, so it
cannot drift out of step with the visible list.

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

## Pass two: the category layer

### 7. There was no layer between the site and 363 pages

An index listing every profession, then the profession pages. Nothing in between. A visitor who
knows they work in healthcare but has not decided which job title to search for had nowhere to land,
and a crawler had no signal that "Radiology Technologist" and "Registered Nurse" belonged together
beyond a shared word in a sibling list.

Fifteen sector pages now sit between them — six English, nine Arabic — at
`/resume-examples/category/<sector>`, with an index at `/resume-examples/category` and Arabic twins
of both. Each carries hand-written sector prose, the professions in it linking to all three of their
page types, and two tables **computed from the catalogue**: the ATS keywords that recur across the
sector's roles, and the certifications more than one of those roles asks for. That second kind is the
only content on the site that no single profession page could carry.

Three decisions worth knowing about, all in `app/lib/sectors.ts` and all asserted in
`ops/sectors.test.mjs` (226 assertions):

- **`MIN_PROFESSIONS = 3`.** A sector is published only when that language's catalogue holds at least
  three of them. Four English categories are deliberately withheld — a heading with two links under
  it is the thin auto-generated content the brief bans, and the gate reads the catalogue rather than
  a hand-maintained list, so adding a profession can publish a sector and removing one retires it.
- **Six English, nine Arabic, from one registry.** The catalogues are not translations of each other.
  Arabic carries transport and logistics, hospitality and media at publishable depth; English does
  not. That asymmetry is correct rather than a bug to paper over.
- **hreflang only when both sides publish.** `hasBoth()` decides per sector. Declaring a reciprocal
  alternate for a sector only one language has would point at a page that was never generated, and
  Google discards a whole cluster when it finds one broken member — which is the same mistake
  finding #2 was.

### 8. One hundred and twenty-two Arabic pages were orphans

`/ar/resume-skills/<slug>` existed for sixty-one professions and `/ar/resume-skills` returned a 404.
Same for `/ar/cover-letter-examples`. Those pages were in the sitemap, so a crawler could reach
them, and nothing on the site linked to the set as a whole: indexable, unreachable, and receiving no
internal link equity from anywhere. Their English twins have had index pages since they were written.

Both hubs now exist, are reciprocal with the English ones, and are in `HubLinks`, which is the
component every hub renders — so the fix cannot be undone by forgetting one page.

### 9. Nothing linked upward

Every templated page linked sideways to its siblings. None linked up, because there was nothing
above them. `components/seo/SectorLink.tsx` adds that link to all six templated families and returns
`null` for a category too thin to have a sector page — the conditional is the reason it is a
component rather than six copies of the same `if`.

### 10. The organic funnel was not measured at all

Twenty-eight `track()` calls lived inside the builder and described what a user does once they are
already there. Nothing recorded which page brought them. Three hundred pages with no attribution is a
portfolio with no returns column, and the honest answer to "twenty more profession pages or two more
tools?" was *nobody here knows*.

`lib/funnel.ts` + `components/seo/FunnelBeacon.tsx` now stamp the entry page once per tab and report
six steps against it: `funnel_landing`, `funnel_tool_opened`, `funnel_scan_done`,
`funnel_builder_started`, `funnel_checkout_started`, `funnel_paid`.

The privacy rule is a property of the code, not a convention: `stamp()` can only produce five fields
— a path with the query string stripped, a page family, a slug taken from the URL, a language, and a
referrer reduced to one of four words before anything is stored. There is no passthrough parameter
and no spread of caller-supplied data, so CV text, a job description, an email or a score are not
*filtered out* — they are unrepresentable. `ops/funnel.test.mjs` (83 assertions) asserts that
directly, including that a path carrying a national ID and a referrer carrying a token survive as
neither.

Two placement decisions:

- The builder step fires inside `BuilderStart`'s `enter()`, not on the landing page. Viewing the
  front door is a page view; every route into the builder passes through that one function.
- Checkout fires on the click that opens the sheet, not on the invoice call — an abandoned checkout
  is the number worth knowing, and the invoice never gets created for the people who abandon first.

### 11. Titles built from data

Five templated titles ran past 65 characters, always the same long professions and always cut at the
end, where the year and the keyword phrase sit. A single shorter template would have stripped
"& ATS Keywords" from fifty titles that had room for it in order to serve five that did not.
`lib/seoTitle.ts` declares a required base plus optional parts in priority order and appends each
only if the result still fits. It uses `continue` rather than `break` on purpose: a part that does
not fit must not block a shorter, less important one.

## Redirect map

| From | To | Why |
|---|---|---|
| `/build` | `/builder` | The long single-page builder is retired — one product, not two |
| `/ar/build` | `/ar/builder` | ″ |
| `/journey` | `/builder` | The chat door is retired |
| `/ar/journey` | `/ar/builder` | ″ |

All 308. Both `/build` addresses were linked from the mobile menu, every template page and every
resume-example page; those links now point at `/builder`, but the ones in someone's history do not.

Two more addresses were considered and deliberately **not** created as redirects: the sector pages
live at `/resume-examples/category/<sector>` rather than `/resume-examples/<sector>`, because the
latter shares a path depth with `/resume-examples/<job>` and would make routing depend on how Next
resolves a static segment against a dynamic sibling. `ops/sectors.test.mjs` asserts that no job slug
in either catalogue is the string `category`.

## What is left

| Finding | Count | Note |
|---|---|---|
| `redirect` | 4 | The table above. Intentional |

That is the whole list. `/interview-live` was the last thin page at 66 words — a live video tool
whose page genuinely is the app — and it now carries a server-rendered half like the other tools, of
which the section that matters most is the one answering where the video goes. Its `?lang=ar`
hreflang was also removed: the canonical strips the query, so that alternate resolved to the same
URL, and an hreflang pair whose two members are one page is a contradiction rather than a signal.

## Known gaps in the data, not in the code

`ops/sectors.test.mjs` prints these rather than failing on them, because they are content facts:

- **English Healthcare has no shared keywords or certifications at all.** Its five professions were
  written separately and phrase the same ideas differently, so the computed tables come out empty and
  are rendered as absent rather than as a heading with nothing under it. Filling them means editing
  the catalogue, which is a writing job.
- Arabic Technology and Arabic Media share no certifications, for the same reason.

## Not done, and honest about it

- **The twenty rebuilt Saudi profession pages.** The existing ones are decent and generic; the brief
  asks for local licences and per-profession depth. Gated on the same thing `countryRules.ts` is
  gated on — a person opening a regulator's website. See `ops/verify-rules.mjs`. The sector pages
  keep every regulator claim soft for exactly this reason: they name the authority (SCFHS, the Saudi
  Council of Engineers, SOCPA) and say to confirm the current requirement with it.
- **Free standalone tool pages** beyond the three that exist (`/optimize`, `/builder`,
  `/interview-live`).
- **Salary sections.** Deliberately absent. There is no verified Saudi salary source in this
  repository, and converting an American figure to riyals is the exact failure the brief names. The
  ranges the profession pages already print carry the `SALARY_BASIS` label from `lib/brand.ts`.
- **Original data reports.** Nothing is aggregated yet, and inventing a sample size would be worse
  than publishing nothing. The funnel events shipped in this pass are the first data that could
  eventually support one — after they have run long enough to mean something.

## What to do next, in order

1. **Read the funnel before writing more pages.** The instrumentation shipped in this pass; give it
   traffic, then choose the next batch from `entry_family` and `entry_slug` rather than from a brief.
   This is the item that changes every item below it.
2. The twenty priority professions, rebuilt with verified local credentials — after the country rules
   are verified, not before.
3. Two more free tools, each with a permanent URL and a result worth sharing.
4. Editorial answers to the questions people actually ask, each linked from the professions and tools
   it serves.
5. Sector pages for the categories currently withheld — which happens by writing professions into
   them, not by lowering `MIN_PROFESSIONS`.
