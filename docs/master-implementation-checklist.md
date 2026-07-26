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

## The finding that gates everything

> `app/lib/resumeStore.ts:36` — *"This module is browser storage only, and browser storage
> is a RECOVERY DRAFT — not the source of truth. Server persistence is `/api/resumes` and
> is a separate, larger piece of work."*

The structured CV — `BuilderState`, the thing the builder actually edits — **is never sent
to the server.** `/api/resumes` exists, but:

- it stores a flat `{ title, text }` snapshot, not the document;
- nothing in the builder calls it. Grep for `api/resumes` outside its own route returns
  `AccountClient.tsx` (list + delete) and comments. There is no writer.

So the order's requirement *"Saved CVs must be stored on the server"* is **not met**, and
under the order's own priority rule (P0 before everything) that is the first thing built.

---

## P0 — production safety

| ID | Requirement | Status | Evidence / gap |
|---|---|---|---|
| P0-1 | Every CV has a unique `resumeId` | `DONE` (pre-existing) | `resumeStore.ts:112 newResumeId`; `ops/isolation.test.mjs` |
| P0-2 | Every CV belongs to a `userId` | `DONE` (pre-existing) | `resumeStore.ts:83 ownerKey`, `recordKey(owner, resumeId)`; `useOwner.ts` resolves it from `/api/auth/me` |
| P0-3 | **Saved CVs stored on the server** | `PARTIAL` | `app/lib/resumeServer.ts` + `/api/resume` + `useServerSync` built and tested (`ops/resumeserver.test.mjs`, 35 assertions against a real fake-Redis). **Not yet wired into `BuilderProvider`, and needs a Redis credential to be live.** |
| P0-4 | New CV creates a new empty record | `DONE` (pre-existing) | `BuilderProvider.tsx` — `urlId \|\| newResumeId()`; no "current resume" concept exists |
| P0-5 | Old CV data never appears in a new CV | `DONE` (pre-existing) | Records validate `owner`/`resumeId` against the key and quarantine on mismatch (`resumeStore.ts:131`); `ops/isolation.test.mjs` |
| P0-6 | Browser storage is an isolated recovery draft only | `PARTIAL` | Local stays the write path by design; the server is a durable mirror. True once P0-3 is wired. |
| P0-7 | Local draft keys include user + resume | `DONE` (pre-existing) | `ra_cv:{owner}:{resumeId}`; the seven personal stores are owner-scoped in `personalStore.ts` |
| P0-8 | Query cache keys include user + resume | `DONE` (pre-existing) | `aiCache.ts questionKey` carries `task + contextHash + inputHash + instance`; `RequestStamp` carries `owner` and `resumeId`; `ops/aicache.test.mjs` (147 assertions) |
| P0-9 | A late reply from one CV never updates another | `DONE` (pre-existing) | `acceptReply` checks owner → resumeId → contextHash → inputHash → revision, in that order; `useAiTask` is single-flight and aborts on unmount |
| P0-10 | Old save responses must not overwrite newer revisions | `DONE` (server side) | 409 + winning record, never merged. `ops/resumeserver.test.mjs`. |
| P0-11 | Payment: success / failure / cancel / duplicate callback | `PARTIAL` | Duplicate-callback replay, the sign-in-token oracle, the key collision and the price divergence are FIXED and tested (`ops/fulfilment.test.mjs`, 25). **No webhook exists** and none of it is production-verified — `BLOCKED (no Paylink credential)`. See F-1..F-5, O-1, O-2. |
| P0-12 | Export: PDF, Word, watermark | `PARTIAL` | The unwatermarked designed PDF is fixed (F-4). The paywall remains client-side and advisory (O-12), and Arabic detection ranges still disagree (O-11). |

## P1 — core product quality

| ID | Requirement | Status | Evidence / gap |
|---|---|---|---|
| P1-1 | One builder for build / upload / continue / tailor | `PARTIAL` | Upload already lands in the builder (`ImportPanel` → `/api/extract` → `BuilderState`). `/optimize` is a second state model and still separate. |
| P1-2 | Arabic CV → Arabic suggestions; English → English | audit run | The CV language is a stored field (`resumeLanguage`), distinct from UI language — the conflation was fixed earlier. Per-task verification in the AI task map. |
| P1-3 | Country + occupation context respected | `PARTIAL` | `countryRules.ts`, `rolePacks.ts`, `occupations.ts` exist and are wired into the blueprint path |
| P1-4 | Mobile navigation, sticky bars, safe areas, route transitions | `DONE` (earlier this session) | One step bar, fixed action bar with `env(safe-area-inset-*)`, `dvh`, one scroll system; `ops/devices.test.mjs`, `ops/motion.browser.mjs` |
| P1-5 | Cinematic loading screen removed | `DONE` (earlier this session) | Blocking page transition, canvas cosmos and the 1100 ms step reveal are gone; `ops/motion.test.mjs` forbids their return |
| P1-6 | Identity preserved: black orb, purple, space styling, subtle AI motion | `DONE` | `BrandOrb` is the one orb, three variants; `transitions.css` is the one motion layer |

## P2–P4 — growth

Not started, and under the order's own rule they must not start while a P0 row is open.
Listed here so the checklist is complete rather than convenient.

| ID | Phase | Requirement | Status |
|---|---|---|---|
| P2-1 | 3 | Job description → tailored CV | `TODO` |
| P2-2 | 4 | Duplicate and tailor | `TODO` |
| P2-3 | 5 | Saudi occupation knowledge base | `PARTIAL` — `rolePacks.ts` (906 lines), `occupations.ts`, `countryRules.ts` with a verification pack already exist |
| P2-4 | 6 | Career dashboard | `TODO` |
| P3-1 | 7 | Job application tracker | `TODO` |
| P3-2 | 8 | Interview preparation | `PARTIAL` — `/interview` and `/interview-live` exist |
| P3-3 | 9 | LinkedIn improvement | `PARTIAL` — `/linkedin` exists |
| P3-4 | 10 | Career plan | `TODO` |
| P3-5 | 11 | Resume health | `PARTIAL` — `reviewChecks.ts` is 1209 lines and already scores completeness, evidence and ATS formatting |
| P4-1 | 12 | SEO free tools | `PARTIAL` — `/ats-resume-checker`, `/free-resume-checker`, `/api/tools` exist |
| P4-2 | 13 | Reviewed occupation pages | `PARTIAL` — 357 catalogue pages exist; "reviewed, not generated" is the open question |
| P4-3 | 14 | Referral system | `TODO` |
| P4-4 | 15 | Analytics funnel | `PARTIAL` — `funnel.ts` exists and is wired |

---

## Newly discovered issues

Recorded here as found, with severity, per the order's issue-tracking rule. Detail and
reproduction steps live in `docs/known-issues.md`.

| ID | Sev | Issue |
|---|---|---|
| N-1 | P0 | The structured CV is never persisted server-side. A cleared browser loses the document; only a flat text snapshot could ever have been recovered, and nothing wrote even that. |
| N-2 | P2 | `app/components/build/AiStrip.tsx` is dead code — defined, never rendered. `BlueprintStrip` superseded it. |
| N-3 | P1 | `/optimize` carries a second CV state model, so an uploaded-and-improved CV there cannot be continued in the builder. |
