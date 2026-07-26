# Resume isolation: why CVs mixed, what changed, what has not

Written 2026-07-26.

## The root cause, in one sentence

`draftStore.writeBuilder(lang, id, state)` wrote to **`ra_journey_en`** — one slot per language for
every resume the browser had ever held — with the `resumeId` stored as a *field inside the value*
rather than as part of the key.

```
1. Build Resume A → ra_journey_en = { resumeId: "rA", builder: A }
2. Build Resume B → ra_journey_en = { resumeId: "rB", builder: B }   ← A is gone
3. Open /builder/rA/target → hydrate reads ra_journey_en, gets B
```

`BuilderProvider` turned that from a possibility into a certainty. Its hydration effect called
`readBuilder(lang)` and carried this comment:

> Keyed on `lang` only. Not on `urlId`: re-running this when the URL's id changes would let a
> mistyped id wipe a live reducer back to the stored copy.

So the id came from the URL and the data came from the shared slot. Both halves of the report follow
directly: *"old resume data returns"* is step 3, and *"overwrites the current form"* is the next
autosave writing B back under A's id — silent destruction of the CV the user thought they were
editing.

The old reasoning was not stupid. Re-hydrating on an id change genuinely can clobber a live reducer.
The answer is to reset to an **empty** form for an id with no record, not to load a different resume.
An unknown id showing a blank builder is correct; an unknown id showing someone else's CV is not.

## A worse bug nobody had reported

No key anywhere carried an **owner**. Sign out, sign in as a different account on the same browser,
and `ra_journey_en` still held the first person's CV — so the builder loaded it. On a shared laptop or
an internet café machine, that is one stranger's employment history, phone number and national ID
handed to the next.

## Every storage key found

| Key | Scope | Verdict |
|---|---|---|
| `ra_journey_{lang}` | one per language | **the bug.** Migrated to `ra_cv:{owner}:{resumeId}`, then retired to `ra_journey_{lang}_legacy` |
| `ra_journey_{lang}_damaged` | one per language | superseded by `ra_cv_bad:{owner}:{resumeId}` |
| `ra_published` | global | no owner — a publish list survives a sign-out. **Not yet fixed** |
| `ra_owned` | global | an entitlement flag with no owner. **Not yet fixed**, and the server is the real check |
| `ra_optimize_result`, `ra_ar_optimize_result` | global | one person's ATS analysis. **Not yet fixed** |
| `ra_optimize_draft` | global | pasted CV text. **Not yet fixed** |
| `ra_lang`, `ra_lang_choice` | global | a language preference. Correctly global — no CV content |
| `ra_funnel_entry` (sessionStorage) | per tab | referrer class and page family only. No CV content. Fine |

## There is no query-cache library

The brief specifies TanStack Query keys, Zustand persistence and Redux. **None of these exist in this
codebase** — `package.json` has no query library at all. Saying so matters, because inventing query
keys for a cache that does not exist would look like compliance and change nothing.

The caches that do exist, and what each needed:

| Cache | Keyed by | Verdict |
|---|---|---|
| `localStorage` builder draft | *language only* | the bug. Now `(owner, resumeId)` |
| Upstash shared AI pack cache | occupation, specialization, seniority, country, cvLang, modelVersion | **correct.** These are cross-user occupation packs — the brief's §10 explicitly allows this |
| `final_content`, `experience_package` | not cached at all | correct — derived from one person's facts |
| Next.js route cache | per route | `/api/*` are `force-dynamic` or POST |
| CDN | URL | see the Cache-Control section |

## What changed

`app/lib/resumeStore.ts` — the new store.

- `ra_cv:{owner}:{resumeId}` — one record per resume
- `ra_cv_index:{owner}` — the owner's list, built from writes
- `ra_cv_bad:{owner}:{resumeId}` — quarantine
- `owner` is `u_<base64url(email)>` or `anon`

The record repeats `owner` and `resumeId` **inside** the value, and `readResume` refuses any record
whose contents disagree with the key it was found under — quarantining the bytes rather than serving
them. That check is what makes the class of bug detectable rather than merely less likely.

`readResume(owner, id)` returns `null` for "not here" and **never** a different resume. Every earlier
version of this code had a most-recent-draft fallback, and that fallback *was* the bug.

`newResumeId` gained entropy. It was `r${Date.now().toString(36)}`, which collides inside one
millisecond — routine in a loop, and a collision means two resumes sharing one key.

`useOwner` resolves the owner from `/api/auth/me` and returns `""` until it answers, so nothing is
read under the wrong owner. On a sign-out transition it removes the departed account's records.

## Cache-Control

Two real problems, both fixed:

- **`/api/resumes` set no `Cache-Control` at all.** That is not the same as "not cached" — a response
  without one is subject to heuristic caching by intermediaries. Now `private, no-cache,
  must-revalidate` plus `Vary: Cookie` on all 13 responses.
- **`/api/tts` set `public, max-age=86400`** on synthesised speech of interview questions generated
  from a candidate's CV. A shared cache holding that for a day is one person's résumé read aloud to
  whoever requests the same URL next. Now `private, no-store`.

Deliberately **not** applied globally, and a test asserts it is absent from `middleware.ts` and
`next.config`: static assets and the 382 public SEO pages must stay cacheable. Fixing a leak in two
routes by making the whole site slow is not a fix.

## The requirement that is not true yet, and why

> **PRIMARY RULE:** The server database is the authoritative source for all saved CVs.

This product lets you build and download a CV **without an account** — the FAQ promises exactly that,
and it is the top of the funnel. An anonymous user has no `userId`, so there is no server record to be
authoritative, and there cannot be one without either forcing sign-up or minting server rows for every
bounce.

So today: `/api/resumes` holds a flat text snapshot for signed-in users, and the structured builder
state lives in browser storage as a recovery draft. The isolation bug is fixed independently of that,
which is why this work shipped first — it needed no schema, no auth change, and no decision about
anonymous users.

Making the server authoritative needs a product decision before it needs code:

1. Anonymous drafts stay local, and signing in **offers** to adopt them (never silently).
2. Or the builder requires an account, which costs conversion at the top of the funnel.

Until that is decided, the honest description is: **browser storage is the source of truth for
unsaved work, and it is now correctly isolated.** The remaining items — server revisions, optimistic
concurrency, conflict UI, multi-tab detection, cross-device sync — all sit downstream of that decision
and are not claimed as done.

## Still open

- Server-authoritative persistence with `revision` / `baseRevision` and a conflict prompt
- Multi-tab conflict detection
- `ra_published`, `ra_owned`, `ra_optimize_*` still lack an owner
- Request cancellation on resume switch (`AbortController` per resume) and stale-response rejection by
  `(resumeId, owner, revision, contextHash)` — the store now makes the check possible; the call sites
  do not yet perform it

## Tests

`ops/isolation.test.mjs`, 43 assertions against a fake `localStorage`, so failures point at the key
scheme rather than at a rendered screen: two resumes never mix; an unknown id yields nothing; two
accounts in one browser stay separate; sign-out removes the departed owner; a mismatched record is
quarantined; revisions advance; delete removes exactly one; the legacy slot migrates once and never
overwrites a newer record; no generic key is ever written; private routes carry a private policy and
the policy is not global.
