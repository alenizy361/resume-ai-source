# Every route, and what was decided about it

The root-cause brief named "overlapping product versions" and "inconsistent routes" as two of
the thirteen findings. This is the decision for each of the 47 page routes and 21 API routes,
so that "is this still needed?" has a written answer rather than being re-litigated every time
someone opens the tree.

Built from the code, not from memory: the route list is `find app -name page.tsx`, and the
"linked from" column comes from grepping for each path. Where the grep was ambiguous — a
ternary like `href={ar ? "/ar/journey" : "/journey"}` does not match a literal search — the
call site was read.

---

## Decisions

### Retired in this pass

| Route | Was | Now | Why |
|---|---|---|---|
| `/v1` | the v1 scrollytelling landing (`LandingScroll`, 725 lines) | **308 → `/`** | Kept "for A-B comparison against the v2 Advisor" — a comparison that stopped happening, leaving a third landing page. Nothing linked to it, absent from the sitemap, `noindex`. Reachable only by typing the URL. |
| `/ar/v1` | its Arabic twin | **308 → `/ar`** | Same. |
| `components/AdvisorLanding.tsx` | 1,015 lines | **deleted** | Rendered by nothing. Not a route, not imported, not lazy-loaded — verified by grep across `app/`. It also carried 2 of the app's 24 lint errors. |
| `components/LandingScroll.tsx` | 725 lines | **deleted** | Its only two callers were the `/v1` pages above. |

A 308 rather than a 404 because the addresses may sit in someone's history, and handing them
to the pages that replaced them costs one file each. The components are recoverable from git
if the comparison is ever wanted again — that is what history is for, and 1,740 lines of
unrendered code in the tree is the thing the audit was complaining about.

Already gone before this pass: `/api/build-cv` and `/api/refine`, deleted with the Arabic
scripted chat builder that was their only caller.

### Kept, deliberately, with a reason

| Route | Decision | Why not retired |
|---|---|---|
| `/build`, `/ar/build` | **keep, `noindex`, canonical → `/`** | The long single-page builder. It is the rollback target for the step routes: reverting is editing two files, and that stays true only while this exists. Linked from the chat door and from `/optimize`. |
| `/journey`, `/ar/journey` | **keep** | The chat door. `draftStore` shares a draft with it by design, and the builder's header links to it — via a ternary, so the grep reported zero. A user the form fails needs somewhere to go, which is the whole argument for two doors. |
| `/builder`, `/ar/builder` | **the product** | Indexed, in the sitemap. |
| `/builder/[resumeId]/[step]` | **`noindex`** | One visitor's draft. Eleven near-identical indexed pages per visitor would dilute `/builder` and index nothing useful. |
| `/optimize`, `/ar/optimize` | **keep** | Upload-and-improve. A distinct job from building, and the one most people with an existing CV want. |
| `/ats-resume-checker`, `/free-resume-checker`, `/jobscan-alternative` | **keep** | SEO landing pages, in the sitemap, linked from nothing on purpose — search is their entrance. "Unlinked" is not "orphaned" for this kind of page. |
| `/resume-examples`, `/resume-skills`, `/cover-letter-examples`, `/resume-templates` and their `[job]` / `[style]` children | **keep** | 402 generated pages; the programmatic SEO surface. |
| `/interview`, `/interview-live` | **keep** | Interview preparation, an entitlement feature. `/interview-live` is in the sitemap and linked from `/interview`. |
| `/linkedin` | **keep** | LinkedIn optimizer, an entitlement feature. |
| `/templates`, `/ar/templates` | **keep** | Template gallery. Distinct from `/resume-templates/[style]`, which is the SEO page per style. |
| `/score/[id]`, `/ar/score/[id]` | **keep** | A shared score result. |
| `/r/[slug]` | **keep** | A published CV's public page. |
| `/pay/callback` | **keep** | The payment provider returns here. |
| `/login`, `/ar/login`, `/account`, `/ar/account` | **keep** | Magic-link auth and the account page. |
| `/pricing`, `/ar/pricing`, `/privacy`, `/terms` | **keep** | Required, and the pricing pages read `lib/plans.ts` so they cannot drift from the invoice. |

### The one known gap, accepted

`/ar/cover-letter-examples` and `/ar/resume-skills` have `[job]` children but no index page, so
truncating one of those URLs by hand gives a 404. Their English twins have indexes.

Left as it is, on purpose: nothing links to either bare path (checked with an exact-match grep,
not the prefix one), neither is in the sitemap, and a 404 for a URL that is not published
anywhere is correct behaviour rather than a defect. Writing two Arabic index pages to serve a
URL nobody requests would be work aimed at a hypothetical crawler.

Recorded rather than fixed so that the next person to notice the asymmetry does not have to
re-derive whether it matters.

### API routes

All 21 have callers except one, and that one is deliberate:

`/api/ads` is admin-only Meta ads control, driven by `curl` with `ADMIN_SECRET`, and it returns
404 unless **both** the secret and the Meta credentials are configured — so it has no attack
surface until the account is connected. "No page calls it" is the design, not an orphan.

`/api/health/ai` is new in this pass and is called by nothing in the app for the same reason:
it is for an operator, and it 404s without `HEALTH_TOKEN`.

---

## What "keep" costs

Two builders and two doors are a real compatibility surface, and it is mitigated by an
invariant rather than by hope: the chat is unaware of the suggestion bag and cannot corrupt it,
because `profile` holds only confirmed content and the chat only ever writes `profile`.
Switching doors loses unconfirmed drafts, which is the correct semantic — and the door says so.

The long page at `/build` is the rollback path. If the step routes turn out to be wrong, `/` and
`/ar` render `<Builder>` again and the product is back to a working state without a revert of
this branch. That property is worth more than the duplication costs, and it expires the moment
someone deletes `/build` — so this table is where that trade is written down.
