# cv.rabit.sa — current-flow audit and migration map

Written before the form-first builder is implemented, so the migration reuses what
works instead of rebuilding it. Line numbers are from the tree at commit `7570525`.

## 1. The flow as it exists

```
/  (or /ar)                     app/page.tsx → <Journey lang="en"/>      25 lines
   └── Journey.tsx  ~1300 lines, "use client"  ← the entire product
       stage 0  landing scenes (rAF scroll engine, 4 marketing scenes)
       stage 1  Advisor chat  → POST /api/interview {action:"turn"}
       stage 2  ATS score     → POST /api/optimize (streams NDJSON)
       stage 3  template + accent picker (TEMPLATE_CATALOG)
       stage 4  resume language + export (PdfExport / DocxExport / PublishLink)
       stage 5  payment or watermarked download (CheckoutButton)
```

`unlockTo(n)` (`Journey.tsx:425-435`) is the whole navigation model: a monotonic
"highest unlocked stage", a 300 ms `scrollIntoView`, and a `justOpened` class that CSS
turns into a blur-to-sharp reveal. Stages cannot be revisited out of order.

**A second, Arabic-only chat builder exists:** `app/ar/builder/page.tsx` (385 lines) —
a scripted 13-step interview calling `/api/refine` per field then `/api/build-cv` to
generate. It is the only caller of both endpoints. It links to `/ar/build` (line 271)
and its layout declares `en: /build` (`ar/builder/layout.tsx:8`) — **neither route
exists**, and `/build` is listed in `sitemap.ts:10`, so the sitemap advertises a 404.

**The upload-and-improve flow is separate and complete:** `app/optimize/page.tsx`
(+ `app/ar/optimize/page.tsx`) — file → `/api/extract` → `analyzeExtraction` confirm
step → `/api/optimize` → score, coaching, templates, exports.

## 2. State and persistence

| Layer | Mechanism | Path |
|---|---|---|
| Builder draft | `localStorage["ra_journey_" + lang]`, written by `Journey.persist()` | `Journey.tsx:438-443` |
| Arabic chat draft | `localStorage["ra_ar_chat"]` | `ar/builder/page.tsx:68-90` |
| Saved resumes | `saveResume({title, source, text})` + `POST /api/resumes` | `lib/localdata.ts:23-29` |
| Entitlement | signed cookies `SESSION_COOKIE`, `ENT_COOKIE`, `ACCESS_COOKIE` + `hasActiveEntitlement(email)` | `lib/access.ts`, `lib/entitlements.ts` |
| Rate limiting | `allowShared(key, limit, windowMs)` — Upstash, **in-memory fallback** | `lib/ratelimit.ts:97-98` |

No Redux/Zustand/React Query anywhere. All state is `useState` inside the page
components; there is no shared store between the two builders.

## 3. AI endpoints

| Route | Reads | Returns | Limit | Guards |
|---|---|---|---|---|
| `/api/interview` `action:"turn"` | `{answer, profile, history, lang}` | `{action, say, profile_patch, resume_lines, chips, progress}` | 60/10min + 6/20s | `scrubDeep`, `stripPlaceholders`, `normalizePatch`, `yearsAreGrounded`, `gateFinish`, `sensitiveTopic`, minor gate, `crossOrigin` |
| `/api/interview` `action:"draft"` | `{targetRole, profile, jobAd, lang}` | `{duties[≤8], skills[≤10]}` via `DRAFT_SCHEMA` | same bucket | same — **already structured and scrubbed** |
| `/api/optimize` | `{resume, jobDescription, uiLang, outLang}` | NDJSON → `{matchScore, afterScore, matchSummary, missingKeywords, presentKeywords, skillsGap, improvements[], optimizedResume, watermark}` | 15/10min | `languageHonoured` + retry. **No PII scrub** |
| `/api/suggest` | `{kind, lang, targetRole, role, company, current, jobAd}` | `{text}` | 30/10min | **None** |
| `/api/build-cv` | `{name, targetRole, experiences[], …}` | NDJSON → `{cv, tips[]}` | 10/10min | **None** — dies with `ar/builder` |
| `/api/refine` | `{field, text, targetRole}` | `{en, note}` | — | **None** — dies with `ar/builder` |
| `/api/fetch-job` | `{url}` | `{ok, text≤4000}` | 20/10min | SSRF allow-list |
| `/api/extract` | FormData file | `{text}` | — | type/size limits |

Provider switch is `AI_PROVIDER` (`nvidia` default | `anthropic`). Web search
(`web_search_20260209`) exists **only** on the Anthropic draft path
(`interview/route.ts:376`) — on NVIDIA there is no search tool at all.

**Every honesty guard is bound to `/api/interview`.** Verified: zero references to
`scrubPii`/`scrubDeep` in `optimize`, `suggest` or `build-cv`. A form that posts to
those routes would have no PII scrubbing, no placeholder stripping and no numeric
grounding.

## 4. Shared libraries already built (reuse, do not rewrite)

| Module | What it gives the new builder |
|---|---|
| `lib/resumeDoc.ts` | `Role{title,company,location,start,end,bullets}`, `upsertRole` (dedupes by `jobKey`, absorbs title-only stubs), `capBullets` (6 current / 4 past), `dedupeBullets`/`saysTheSame` (semantic), `rolesToLines`, `rolesFromProfile`, `rolesDigest` |
| `lib/mergeProfile.ts` | `Profile`, `mergePatch`, `assembleResume(p, rtl)` — the single renderer feeding preview, optimize, PDF, DOCX |
| `lib/draftStore.ts` | `readDraft`/`writeDraft` on the interview's own key, `contactLine`, `Door` |
| `lib/interviewGuards.ts` | `computeProgress`, `gateFinish`, `yearsAreGrounded`, `scrubPii/scrubDeep`, `stripPlaceholders`, `detectLanguages` |
| `lib/resumeLang.ts` | `languageHonoured`, `arabicRatio` |
| `lib/prompts.ts` | `DRAFTING_DOCTRINE`, `DRAFT_PROMPT`, `DRAFT_SCHEMA` |
| `lib/templateCatalog.ts` | 10 templates; `ats-pro` already flagged `best: true` |
| `lib/usage.ts` | `logUsage` — every model call metered |

## 5. Components

**Reusable as-is:** `ResumeTemplate` (5 variants, renders from flat text),
`PdfExport`, `DocxExport`, `PublishLink`, `TemplateThumb`, `AiOrb`, `OrbBrand`,
`useLang`, `CheckoutButton`, `GapFiller`, `ResultCoaching`, `BeforeAfter`.

**Dead code written for a form builder that never shipped:** `AiSuggest.tsx` (its
docstring says "sits on every builder field"; it is the only client of
`/api/suggest`), `ScoreRing.tsx`. Also unused: `AdvisorLanding`, `AtsMarquee`,
`LiveTicker`, `ScanDemo`, `SubscribeBox`, `MobileMenu`, `NavAccountLink`.

**Chat-only, deprecation candidates:** the chat half of `Journey.tsx` (transcript,
bubbles, input footer, `sendTurn`), all of `ar/builder/page.tsx`, `/api/refine`,
`/api/build-cv`.

## 6. Known defects found while auditing

1. `Journey.persist()` rebuilds the draft record from its own 8-key snapshot and
   calls `setItem` directly — so it **wipes any key the form adds**. Must route
   through `writeDraft` before the form ships.
2. `upsertRole`'s merge branch (`resumeDoc.ts:148`) rebuilds from named fields and
   will **drop a new `Role.id`**.
3. `capBullets` keeps the *earliest* bullets, and `upsertRole` caps after merging —
   confirming a 7th bullet silently discards **the newest**.
4. `rtl = lang === "ar"` (`Journey.tsx:243`) conflates UI language with resume
   language; `ResumeTemplate`'s `detectDir` (line 107) then guesses, flipping a
   half-empty preview mid-build.
5. `ResumeTemplate` re-parses and re-measures on every text change (123-135) — a
   preview bound to raw form state re-lays out A4 per keystroke.
6. `/api/suggest`'s prompt instructs `[bracketed placeholders]` (lines 22-30) while
   `DRAFTING_DOCTRINE` forbids them outright — two endpoints disagreeing about
   invention.
7. `PdfExport` refuses Arabic entirely (`22-31`). Harmless while English is the
   silent default; becomes a wall once resume language is an explicit early choice.
8. `.journey-root` **redefines global variable names with different values**
   (`journey.css:7-10`: `--accent:#7c3aed` vs global `#8b5cf6`) — wrapping new UI in
   it would silently re-theme it.

## 7. Migration posture

- **One store, extended.** `Profile` stays the shared contract (the chat, the guards,
  `assembleResume` and `draftStore` all speak it). The form adds a *suggestion bag*
  beside it, never inside it.
- **The invariant that carries the truthfulness rule:** `profile` holds only
  confirmed content; unconfirmed suggestions live in a separate array. The preview,
  `assembleResume`, `/api/optimize`, PDF and DOCX all read `profile`, so an
  unconfirmed item has **no code path** to a document. Not a render-time filter.
- **Feature flag** gates the new builder; the chat stays reachable for rollback.
- **Schema version** field on the draft, with an idempotent legacy migration.

## 8. Baseline to hold

`npx tsc --noEmit` clean · `npm run build` generates 402 pages · `npm run test` =
guards 61, ratelimit 11, merge 32, language 12, resumedoc 25, draftstore 15 = **156
assertions**.
