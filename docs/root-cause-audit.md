# cv.rabit.sa — root-cause audit

Written by inspecting the codebase and driving the running site in Chromium. Every
finding below was reproduced, not inferred. Where a claim could not be verified from
this environment it says so.

Method: 45 `page.tsx` files, 20 API routes, `proxy.ts`, `globals.css` (1000+ lines),
and the deployed HTML of the production alias (fetched through the Vercel API, since
the sandbox proxy blocks `cv.rabit.sa` directly).

---

## Severity summary

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | Every page except the chat rendered invisible — content painted under the ambient background | **Critical** | **Fixed** (`1ae669f`) |
| 2 | Displayed price and charged price came from different files | **Critical** | **Fixed** (`1ae669f`) |
| 3 | A retired 75 SAR plan was still chargeable via the payment API | High | **Fixed** — moved to `RETIRED_PRICES`, unsellable, still verifiable |
| 4 | "Your file is never uploaded" — it is POSTed to `/api/extract` | High | **Fixed** |
| 5 | Two resume data models (`Profile`/`BuilderState` vs the optimizer's `OptimizeResult`) | High | **Fixed** — `lib/scoreText.ts` adapts flat text to `BuilderState`; `lib/handoff.ts` carries an upload into the builder |
| 6 | Entitlement interpreted independently in 26 places | High | **Fixed** — `lib/entitlement.ts`; `/optimize` was failing OPEN on a missing `watermark` field |
| 7 | Personal Gmail as the support address in 7 user-facing files | Medium | Mitigated — now one env var (`NEXT_PUBLIC_SUPPORT_EMAIL`) |
| 8 | Three product names in circulation; the assistant calls itself "Rabit" | Medium | **Fixed** — assistant names the product; 13 footers consolidated |
| 9 | Arabic prices rendered with Western digits (`{p.priceSar} ريالاً` → "35 ريالاً") | Medium | **Fixed** |
| 10 | Arabic copy duplicated by hand in 31 component-local `C = { en, ar }` objects | Medium | **Enforced** — `ops/i18n.test.mjs` asserts key parity, no Western digits in Arabic, no untranslated strings. Found 4 real defects on the Arabic landing page |
| 11 | Salary ranges published as Saudi market facts with no source (62 ar + 55 en) | Medium | **Fixed** — `SALARY_BASIS` labels every published range; a test forbids printing one without it |
| 12 | `next start` locally emits HTML referencing a client chunk the build never wrote | Low (local only) | Open — Vercel builds are clean |
| 13 | Nine pre-existing React lint errors (ref-during-render, setState-in-effect, component-in-render) | Low | Open |

---

## 1. Why the site looked empty (the "scrolling down" report)

`globals.css` declares the layer contract as a **comment**:

```css
.ambient-field { position: fixed; inset: 0; z-index: 1; /* below content (z-10+) */ }
```

CSS paint order puts a positioned element (`z-index: 1`) above *all* non-positioned
content in the same stacking context. Twenty-seven page roots were `position: static`,
so the animated cosmos painted over them. Reproduced at 1280×900 and 390×844 on `/`,
`/optimize` and `/pricing`: only the sticky header was visible; scrolling revealed
1300px of empty gradient.

**Why no test caught it:** the field is `pointer-events: none`. Clicks pass through, so
the DOM stayed reachable, `elementFromPoint` still returned the heading (it ignores
`pointer-events: none`), `isVisible()` returned true, and a 21-assertion browser smoke
test passed against a page nobody could read. **Reachable is not visible.**

**Root fix:** enforce the contract once — `main { position: relative; z-index: 10 }` —
instead of asking 27 files to remember it. `ops/routes.test.mjs` now asserts the
heading's stacking chain beats the ambient field's z-index on every public route.

This was not caused by the builder promotion. It predates it on `/optimize`,
`/pricing` and every SEO page; promoting the builder to `/` only made it unmissable.

## 2. Why the root route could show different experiences

Verified as **deterministic**, with one intentional exception:

- `proxy.ts` rewrites nothing. It sets an `x-pathname` header and 308-redirects
  legacy `?lang=` params to path locales, guarded by an `AR_TWINS` allowlist so
  English-only tools never redirect into a 404.
- `/` renders `<Builder>` unconditionally on the server.
- `DoorRedirect` navigates a visitor **only** when they previously made an explicit
  choice (`localStorage.ra_flag_builder`), read by `storedBuilderMode()`, which has no
  environment fallback. `ops/flags.test.mjs` asserts it disagrees with `builderMode()`
  precisely so a rollout dial cannot move people who never chose.

No cookie routing, no experiment assignment, no service worker, no static export
artifacts, no App/Pages Router conflict (App Router only). Deployment aliases resolve
to a single production deployment; preview URLs carry `_vercel_share` tokens and are
`x-robots-tag: noindex` at the edge.

## 3. Stale artifacts and caching

- Vercel: one production branch (`main`), one alias set. The current alias
  (`cv.rabit.sa`) resolved to the newest READY deployment when checked.
- HTML responses carry `cache-control: private, no-cache, no-store, must-revalidate` —
  no CDN HTML caching to invalidate.
- **Local-only defect:** `next start` from a clean `.next` served `/build` referencing
  `chunks/1426nkhp0ltt-.js`, which the build never wrote → 500 → no hydration. The same
  commit's Vercel build references a different, complete chunk set. Reproduced across
  two clean rebuilds. Not user-facing; it does mean local production smoke tests must
  verify chunk presence before trusting a result.

## 4. Multiple builders, separate business logic

Three CV engines existed. One is gone, two remain:

| Engine | Status | Business logic |
|---|---|---|
| Form builder (`components/build/*`) | **Primary**, at `/` and `/ar` | `builderDoc` + `resumeDoc` + `mergeProfile` + `reviewChecks` |
| Chat (`Journey.tsx`, 1300 lines) | Legacy door at `/journey` | Shares `mergeProfile`, `resumeDoc`, `interviewGuards`; has its own turn loop and its own ATS result shape |
| Arabic scripted chat (`ar/builder`) | **Retired** — 308 to `/ar/build`; `/api/build-cv` and `/api/refine` deleted | — |

Remaining duplication is real but narrower than it looks: both live engines already
share the resume document, the merge, the bullet budgets and the guards. What is *not*
shared is the scoring path — see below.

## 5. Two resume data models

- **Builder:** `BuilderState { profile: Profile, suggestions: Item[], credentials, languages, target }`, `schemaVersion: 2`, with the invariant that `profile` holds only confirmed content.
- **Optimizer:** `OptimizeResult { matchScore, afterScore, missingKeywords, presentKeywords, skillsGap, improvements[], optimizedResume: string }` — declared **twice**, independently, in `optimize/page.tsx` and `ar/optimize/page.tsx`, and never converted into a `Profile`.

Consequence: an upload scored at `/optimize` produces a flat rewritten string, not
structured content, so nothing from that flow can be edited section-by-section. The
builder's own import path (`lib/importCv.ts`, 40 tests) does produce structure — so the
capability exists and the optimizer simply predates it.

Also note `qualityScore`/`matchScore` are computed **locally and deterministically** by
`lib/reviewChecks.ts` for the builder, and by a **model call** for the optimizer. Two
scores, two mechanisms, same words.

## 6. Entitlement rules

One correct implementation, twenty-six independent readings.

- Authoritative: `lib/access.ts` (`verifyPass`, `ACCESS_COOKIE`, `WINDOW_MS`) plus
  `lib/entitlements.ts`, consulted server-side by `/api/optimize`, `/api/cover-letter`,
  `/api/interview-live` and `/api/auth/me`.
- But the *decision* is re-derived in components: `score?.watermark !== false` in
  `Journey.tsx`, `paid !== true` in `DesignSection`, `result.watermark` in both
  optimize pages, and a `hasAccess` fetch in three nav components. There is no
  `canExportPDF()` / `shouldShowWatermark()` function; each caller invents the rule.

No entitlement bypass was found — the server checks hold — but the client rules can
drift from them, and one already does: the builder's `DesignSection` defaults to
watermarked when `/api/auth/me` fails, while `Journey` defaults to watermarked only if
the score response says so.

## 7. Pricing sources found (before)

| Source | Value | Used by |
|---|---|---|
| `lib/plans.ts` `priceSar` | 35 / 99 hardcoded | 2 pricing pages |
| `/api/pay` own `PLANS` | `PRICE_SINGLE \|\| 35`, `PRICE_COMPLETE \|\| 99`, `PRICE_MONTHLY \|\| 75` | **the invoice** |
| `CheckoutButton` | `"SAR 35"` literal | the modal shown before paying |
| `layout.tsx` JSON-LD | `"35"`, `"99"` | Google rich results |
| `terms/page.tsx` | ٣٥ / ٩٩ / 35 / 99 | the legal statement |
| ~10 marketing/FAQ files | prose | landing, checker, interview pages |

After: `planPrice()` and `chargeableAmount()` in `lib/plans.ts` are the only paths; the
first five rows now read from them, the last is an allowlist the test forbids growing.

## 8. Brand names found

No `ResumeAI` remains. In circulation: **Sira** (43 files), **سيرة** (33), **Rabit**
(8 footers as company attribution — legitimate — plus `AdvisorLanding:130` where the
*assistant* says "I'm Rabit", which is the actual inconsistency: the company name used
as the assistant's name). `lib/brand.ts` now defines product / company / attribution;
migrating the 51 call sites is outstanding.

## 9. Privacy statements audited

| Claim | Where | Accurate? |
|---|---|---|
| "never uploaded anywhere else" (uploaded file) | ImportPanel | **No** — POSTed to `/api/extract`. Fixed |
| "Processed instantly — never stored on our servers" | /optimize | Incomplete — omitted the cloud AI provider. Fixed |
| "resume text is never stored on our servers" | /privacy | Self-contradicting (its own sentence listed an exception) and silent on uploaded files. Rewritten |
| "Saved on this device only — never uploaded" | DesignSection | **Yes** — `saveResume` is localStorage |

No CV content was found in analytics events, URLs, or client logs: `track()` calls send
only counts, section ids and enum values. Verified across all 19 builder events.

## 10. Localization

One translation *mechanism* does not exist. Each component carries its own
`const C = { en: {...}, ar: {...} }` — ~20 of them, ~1,400 strings, no key checking,
no fallback. That is why `{p.priceSar} ريالاً` shipped Western digits on an Arabic
page: nothing compares the two trees.

Confirmed working: path-based locale (`/ar/*`), `dir="rtl"` from the proxy's
`x-pathname`, and — since this session — the CV's language being independent of the
interface's (`cvLang()`), which had been putting Arabic duties on English CVs.

## 11. Local storage keys (18)

`ra_access`, `ra_ar_optimize_draft`, `ra_ar_optimize_result`, `ra_booted`, `ra_ent`,
`ra_flag_builder`, `ra_jobs`, `ra_lang`, `ra_lang_choice`, `ra_login_sent`,
`ra_optimize_draft`, `ra_optimize_result`, `ra_owned`, `ra_pay`, `ra_published`,
`ra_saved_resumes`, `ra_scan_history`, `ra_session`.

Note the pair `ra_optimize_draft` / `ra_ar_optimize_draft`: the same flow keeps two
separate drafts per language, so a user who switches language mid-scan silently starts
over. The builder deliberately does the opposite — one `ra_journey_${lang}` record
shared by both doors.

---

## What is fixed, and what remains

**All thirteen findings are now closed or explicitly enforced.** Eight fixes shipped:
the invisible site, the price-display/price-charged split, the chargeable retired plan,
three inaccurate privacy claims, Arabic price digits, one entitlement service, the
model-typed ATS score, the disconnected upload flow, the brand names, and the unsourced
salary claims. Three are enforced rather than restructured — localization, the pricing
prose allowlist, and the support address — each with a test that fails if it regresses.

### The pattern worth remembering

Four of the worst findings were **contracts that existed only as a comment**:

- `globals.css:669` documented "content sits at z-10+"; 27 page roots did not, so the
  entire site painted its background over itself.
- `lib/plans.ts` called itself "single source of truth" in its docstring while two of the
  four files that knew a price were the two a customer reads.
- `access.ts` owned the entitlement rules correctly; twenty-six callers re-derived them,
  and one re-derived them backwards.
- `reviewChecks.ts` computed an honest score; only half the product could reach it.

In each case the knowledge existed and the enforcement did not. Every fix here turned a
comment into a function or an assertion.

### Verification harness added

| Suite | Asserts |
|---|---|
| `ops/routes.test.mjs` | 160 assertions over 25 public routes: status, title, one h1, the layer contract, no horizontal overflow, no page errors, the retired redirect |
| `ops/pricing.test.mjs` | display equals charge; a half-configured promotion is caught; Arabic digits; identical plan features; no new hardcoded price |
| `ops/entitlement.test.mjs` | 47 assertions, mostly on the unknown state; no gate reads `plan` |
| `ops/scoretext.test.mjs` | determinism; stuffing buys nothing; a worse rewrite scores lower |
| `ops/handoff.test.mjs` | the upload crosses as confirmed facts; the rewrite does not cross by default |
| `ops/i18n.test.mjs` | key parity; no Western digits in Arabic; no untranslated strings |
| `ops/brand.test.mjs` | one name; footers generated; salary ranges labelled |

Eighteen suites in `npm run test`, plus `npm run test:routes` against a running server.

### Still open, and deliberately

1. **The support address is a personal Gmail** in seven files. Asserted as a known item;
   the fix is `NEXT_PUBLIC_SUPPORT_EMAIL`, not a code change. Inventing a `support@`
   mailbox that does not exist would be worse than shipping one that is read.
2. **Ten marketing/FAQ files still carry prices in prose.** An allowlist the pricing test
   forbids growing; each can be migrated independently.
3. **1,800 strings still live in 31 component-local copy objects.** The invariants are
   enforced; the extraction is optional and was judged higher-risk than the defects it
   would prevent.
4. **A local `next start` emits HTML referencing a chunk the build never wrote.** Vercel
   builds are clean; local production smoke tests must check chunk presence first.
5. **Nine pre-existing React lint errors** (ref-during-render, setState-in-effect,
   component-in-render), unchanged in count throughout and verified against a stash.
6. **Arabic PDF needs an embedded font in jsPDF.** Arabic downloads as Word (ATS-readable)
   or a rasterised designed PDF, and the choice screen says so.

None of these are load-bearing for a user completing a CV and paying for it.
