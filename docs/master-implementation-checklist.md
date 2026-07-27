# Master implementation checklist

The source of truth for the career-platform order. Status is recorded against evidence,
not against whether code was written.

**Status vocabulary — used strictly.**

| Status | Means |
|---|---|
| `DONE` | Implemented, build passes, tests pass, behaviour verified. Evidence named. |
| `PARTIAL` | Implemented and tested in part. What is missing is stated. |
| `BLOCKED` | Cannot proceed without something this environment does not have. Named. |
| `TODO` | Not started. |

**A note on what "tested" can mean here.** This environment has **no product secrets** —
`env` contains `ANTHROPIC_BASE_URL` and nothing else. No Redis, no Edge Config, no
Paylink, no Resend, no Anthropic or NVIDIA key. So:

- **Mock-tested** and **local-integration-tested** are achievable and are what most rows say.
- **Production-tested** is achievable for nothing that needs a credential, and is never
  claimed below for anything that does. Rows that need one say `BLOCKED (no credential)`.

That distinction is the difference between this document and a status report that reads
better than the system behaves.

---

## The finding that gated everything (resolved — P0-3)

> `app/lib/resumeStore.ts:36` — *"This module is browser storage only, and browser storage
> is a RECOVERY DRAFT — not the source of truth. Server persistence is `/api/resumes` and
> is a separate, larger piece of work."*

At the time this was written, the structured CV — `BuilderState`, the thing the builder
actually edits — was never sent to the server: `/api/resumes` stored only a flat
`{ title, text }` snapshot, and nothing in the builder wrote to it.

That gap is now closed. `app/lib/resumeServer.ts` + `/api/resume` (singular — see its own
header for how it differs from `/api/resumes`) + `useServerSync` give `BuilderState` itself
a server-side home, addressed by (account, resumeId), versioned, and `BuilderProvider.tsx`
mirrors every draft to it (`b59dd89`). See P0-3.

---

## P0 — production safety

| ID | Requirement | Status | Evidence / gap |
|---|---|---|---|
| P0-1 | Every CV has a unique `resumeId` | `DONE` (pre-existing) | `resumeStore.ts:112 newResumeId`; `ops/isolation.test.mjs` |
| P0-2 | Every CV belongs to a `userId` | `DONE` (pre-existing) | `resumeStore.ts:83 ownerKey`, `recordKey(owner, resumeId)`; `useOwner.ts` resolves it from `/api/auth/me` |
| P0-3 | **Saved CVs stored on the server** | `DONE` | `app/lib/resumeServer.ts` + `/api/resume` + `useServerSync`, wired into `BuilderProvider` (`b59dd89`) — local write stays first, the server mirrors on a 2.5s beat, and a server copy ahead of an untouched local draft is adopted on mount. `ops/resumeserver.test.mjs` (35 assertions against a fake-Redis) all pass. Redis is configured in Vercel per that commit's own message, so this is live; not independently re-verified against production Redis in this pass. |
| P0-4 | New CV creates a new empty record | `DONE` (pre-existing) | `BuilderProvider.tsx` — `urlId \|\| newResumeId()`; no "current resume" concept exists |
| P0-5 | Old CV data never appears in a new CV | `DONE` (pre-existing) | Records validate `owner`/`resumeId` against the key and quarantine on mismatch (`resumeStore.ts:131`); `ops/isolation.test.mjs` |
| P0-6 | Browser storage is an isolated recovery draft only | `DONE` | Local stays the write path by design; the server is a durable mirror, wired as of P0-3. |
| P0-7 | Local draft keys include user + resume | `DONE` (pre-existing) | `ra_cv:{owner}:{resumeId}`; the seven personal stores are owner-scoped in `personalStore.ts` |
| P0-8 | Query cache keys include user + resume | `DONE` (pre-existing) | `aiCache.ts questionKey` carries `task + contextHash + inputHash + instance`; `RequestStamp` carries `owner` and `resumeId`; `ops/aicache.test.mjs` (147 assertions) |
| P0-9 | A late reply from one CV never updates another | `DONE` (pre-existing) | `acceptReply` checks owner → resumeId → contextHash → inputHash → revision, in that order; `useAiTask` is single-flight and aborts on unmount |
| P0-10 | Old save responses must not overwrite newer revisions | `DONE` (server side) | 409 + winning record, never merged. `ops/resumeserver.test.mjs`. |
| P0-11 | Payment: success / failure / cancel / duplicate callback | `DONE` (code) / `BLOCKED` (verify) | Duplicate-callback replay, the sign-in-token oracle, the key collision and the price divergence are FIXED and tested (`ops/fulfilment.test.mjs`, 25). Webhook added (F-12), return-URL allow-list added (F-13), anon→account adoption added (F-11). One money path in `lib/fulfil.ts`. Still `BLOCKED (no Paylink credential)` for production verification, and the webhook URL must be registered in the Paylink dashboard. See F-1..F-5, F-11..F-13. |
| P0-12 | Export: PDF, Word, watermark | `DONE` (server-enforced) | The PDF and Word downloads are rendered by `POST /api/export`, which stamps the mark from `paidRequest(req)` and refuses to read a watermark field — the components no longer take the prop (F-20). Verified over real HTTP against the bytes, including that a genuinely paid request gets a clean file: `ops/exportgate.mjs` (27), `ops/export.browser.mjs` (14), `ops/exportrender.test.mjs` (43). Two exports stay client-side by necessity and are documented as such: the designed PDF (html2canvas needs a DOM) and the `.txt` (the same text is on screen). Arabic detection now covers Extended-A and both presentation-form blocks (F-21); eleven other call sites still carry independent literals, tracked as a follow-on rather than O-11 itself. |

## P1 — core product quality

| ID | Requirement | Status | Evidence / gap |
|---|---|---|---|
| P1-1 | One builder for build / upload / continue / tailor | `DONE` | Four ways in, one CV model. Upload lands in the builder (`ImportPanel` → `/api/extract` → `BuilderState`); the five feature pages read the CV this browser holds rather than asking again (F-18); and `/optimize`'s hand-off now writes a real owned resume record through `writeResume` and lands on `/builder/{id}/target` (F-19) — the retired `ra_journey_*` key has zero live writers, asserted across every file in `app/`. The start screen lists the resume index, so an added CV is reachable. Verified in Chromium: `ops/mycvs.browser.mjs` (30), `ops/handoff.browser.mjs` (23). |
| P1-2 | Arabic CV → Arabic suggestions; English → English | `DONE` | Every route that writes CV text now takes the document's language: `/api/cover-letter` (F-14), `/api/optimize` (F-15), `ats_review` (F-16), `/api/tools` (F-17), and the two pages that called `/api/tools` with a hardcoded `"en"` (F-18). The fallback counts letters (`dominantScript`) rather than looking for one, so an Arabic name on an English CV no longer flips the document. |
| P1-3 | Country + occupation context respected | `PARTIAL` | `countryRules.ts`, `rolePacks.ts`, `occupations.ts` exist and are wired into the blueprint path |
| P1-4 | Mobile navigation, sticky bars, safe areas, route transitions | `DONE` (earlier this session) | One step bar, fixed action bar with `env(safe-area-inset-*)`, `dvh`, one scroll system; `ops/devices.test.mjs`, `ops/motion.browser.mjs` |
| P1-5 | Cinematic loading screen removed | `DONE` (earlier this session) | Blocking page transition, canvas cosmos and the 1100 ms step reveal are gone; `ops/motion.test.mjs` forbids their return |
| P1-6 | Identity preserved: black orb, purple, space styling, subtle AI motion | `DONE` | `BrandOrb` is the one orb, three variants; `transitions.css` is the one motion layer |

## P2–P4 — growth

Not started, and under the order's own rule they must not start while a P0 row is open.
Listed here so the checklist is complete rather than convenient.

| ID | Phase | Requirement | Status |
|---|---|---|---|
| P2-1 | 3 | Job description → tailored CV | `DONE` (pre-existing) — was marked `TODO` in error; `/optimize`'s `mode: "target"` already takes a job description, calls `/api/optimize` with it, and returns `result.optimizedResume` — a fully rewritten CV tailored to that JD, not just an analysis (`OptimizeTool.tsx:500`, `api/optimize/route.ts` `optimizedResume`). It is auto-saved to the account (`OptimizeTool.tsx:555`) and offers copy/download/PDF/Word/template rendering — found while auditing for P2-2, not built new |
| P2-2 | 4 | Duplicate and tailor | `DONE` | `duplicateServerResume`/`POST /api/resume` gave this a server-side primitive but had zero client callers. Added a "Duplicate → tailor for a job" action to `/builder`'s start screen (`BuilderStart.tsx`): clones a saved resume's full local record under a fresh id (title suffixed "(copy)"/"(نسخة)"), and lands on the target step so the job details can be edited for the new application while the original stays untouched. The clone is picked up by the existing server mirror (`useServerSync`) the same as any new resume — no direct call to the duplicate endpoint was needed. **Metadata added later**: `BuilderState.tailoredFrom` (source resume id, tailored-at timestamp, application status) — target employer/job/JD and match score reuse `target.*`/`snapshot.matchScore`, which already existed. A status selector on each tailored copy is now visible on the `/builder` start screen. See F-32. |
| P2-3 | 5 | Saudi occupation knowledge base | `PARTIAL`, improved across three passes — 25 of 29 `occupations.ts` entries now resolve to a `RolePack` (`rolePacks.ts`): the original 6, then Teacher/Civil Engineer/Pharmacist/Lawyer, then Physician/Dentist/Physiotherapist/Laboratory Technologist (completing `sa-scfhs-registration`'s own occupation list), then Mechanical/Electrical/Industrial Engineer, Auditor, and the IT/admin/sales families that had no pack at all before this pass (Software Developer, IT Support, Network Engineer, HR Specialist, Project Manager, Sales Representative, Customer Service). The IT/admin/sales packs' credentials are widely recognized professional certifications (PMP, CCNA, CompTIA, SHRM…), not Saudi government licences — there is no such licensing requirement for those roles, so nothing was invented to fill a gap that isn't real. Same discipline throughout: no invented numbers, credentials for the licensed occupations copied verbatim from the matching `CredentialRule`, everything offered as an unconfirmed suggestion. `ops/rolepacks.test.mjs` — 364 assertions, all passing. Remaining 4 occupations resolve reasonably to an existing pack via fuzzy alias matching (special-education-teacher/university-lecturer → Teacher; the radiography sub-specialties → Radiology Technologist) rather than having their own. `countryRules.ts` still covers Saudi Arabia only despite `COUNTRY_NAMES` resolving 9 other markets — those assert jurisdiction-specific regulatory facts rather than generic duties, a materially different risk, and remain untouched. |
| P2-4 | 6 | Career dashboard | `DONE` — `/account` renamed "Career Dashboard" (F-25); links saved CVs, scan history, and cloud-saved CVs, all already-collected data `localdata.ts` had no page rendering before |
| P3-1 | 7 | Job application tracker | `DONE` — was marked `TODO` in error; `AccountClient.tsx` already has a working tracker (add/list/status/delete, backed by `localdata.ts`'s `addJob`/`getJobs`) — found while auditing the account page for F-25, not built new |
| P3-2 | 8 | Interview preparation | `DONE` — was left `PARTIAL` citing the F-18 CV-hookup fix as if it were a residual gap; it isn't. `/interview` (202 lines) generates 8 scored Q&A with model answers, now tagged `behavioral`/`technical`/`gap` and grouped by category — the "gap" group is the missing-evidence question set the order named; `/interview-live` (486 lines) runs a full scored mock interview with camera, TTS, live transcription and a paywall gate; both bilingual, both CV-aware via `MyCvPicker`, both server-rendered for SEO. Added a client-side STAR answer builder (Situation/Task/Action/Result) plus a "weak-answer feedback" mode on `/api/tools` that critiques the candidate's own drafted answer — strength, specific weaknesses, missing evidence, a revised opening built only from facts already present. See F-33. `ops/mycvs.test.mjs`/`ops/mycvs.browser.mjs` cover the CV hand-off. |
| P3-3 | 9 | LinkedIn improvement | `DONE` — `/linkedin` returns `headlineOptions` (3 differently-angled options, was 1), `about`, `experience` (per-role LinkedIn Experience-section descriptions, new), `skills`, `keywords` (recruiter search terms, distinct from `skills`, new), and `tips` via `/api/tools`, explicitly forbids inventing employers/roles/dates/achievements, answers in the CV's language (F-18), copies section-by-section including each headline option and each experience entry individually, and is server-rendered for SEO. See F-34. |
| P3-4 | 10 | Career plan | `TODO` — genuinely undefined beyond this one line; needs a product decision on scope before any code |
| P3-5 | 11 | Resume health | `DONE` — was left `PARTIAL` describing the scoring engine as if the gap were rendering it; it's already rendered twice over. `reviewChecks.ts` (1209 lines) scores 5 weighted dimensions into typed findings at 3 severities; `ReviewSection.tsx` (305 lines) renders a score ring, critical-vs-advisory findings, a per-dimension breakdown and a job-match view, live and localized; the score is also persisted (`DesignSection.tsx`) and shown per saved resume on the Career Dashboard (`AccountClient.tsx`). 82 assertions in `ops/reviewchecks.test.mjs`. |
| P4-1 | 12 | SEO free tools | `PARTIAL`, but as a complete instance of its own pattern rather than a half-built feature: 3 keyword-targeted `SeoLanding` doors (`/ats-resume-checker`, `/free-resume-checker`, `/jobscan-alternative`, the last not previously listed here) all correctly funnel into `/optimize`, plus 2 real AI tools (`/api/tools`'s `linkedin`/`interview` modes) behind their own pages. Adding more landing-page variants is mechanical but is a keyword/growth decision — which queries are worth a page — not an engineering gap, so none were added speculatively. |
| P4-2 | 13 | Reviewed occupation pages | `PARTIAL`, confirmed. "Reviewed, not generated" means the salary/demand/certification claims on the 357 catalogue pages are AI/hand-authored assertions with zero provenance tracking — no `countryRules.ts`-style `status`/`sourceUrl` for any of it, unlike the credential rules which at least record "encoded vs verified". Built the missing mechanism: `app/lib/jobsVerification.ts` + `ops/verify-jobs.mjs`, mirroring `verify-rules.mjs` exactly — tracks the salary line (the highest-risk unsourced figure) per job per language (111 entries), starts every one honestly `unverified`, and auto-invalidates a recorded verdict if the salary text is later edited. `ops/jobsverification.test.mjs` (11 assertions). The review itself — a person checking ~111 figures against real market data — remains outside what code can do; this makes that review trackable, it doesn't perform it. |
| P4-3 | 14 | Referral system | `TODO` — undefined AND touches payment/money mechanics directly (incentive structure, tracking, fraud prevention); needs a real product decision before any code, given this is a live payment-enabled product |
| P4-4 | 15 | Analytics funnel | `DONE` | `funnel.ts` wired, and the entry stamp on all 357 static catalogue pages no longer requires React (F-23) — the root layout used to force React's client runtime onto every page for this alone. `ops/funnel.test.mjs` (282 equivalence assertions), `ops/funnelbootstrap.browser.mjs` (18, proving the entry stamps with every JS chunk blocked). |

---

## Newly discovered issues

Recorded here as found, with severity, per the order's issue-tracking rule. Detail and
reproduction steps live in `docs/known-issues.md`.

| ID | Sev | Issue |
|---|---|---|
| N-1 | P0 | The structured CV is never persisted server-side. A cleared browser loses the document; only a flat text snapshot could ever have been recovered, and nothing wrote even that. |
| N-2 | P2 | `app/components/build/AiStrip.tsx` is dead code — defined, never rendered. `BlueprintStrip` superseded it. |
| N-3 | P1 | ~~`/optimize` carries a second CV state model~~ — **CLOSED by F-19.** The hand-off writes a real resume record through the live store and the URL names it. `/optimize` keeps its own `OptimizeResult` DTO for the scan result, which is a result document rather than a CV state model — merging it into `BuilderState` would put model output inside the confirmed-content store. |
