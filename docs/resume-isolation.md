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
| `ra_published` | global | slugs **and unpublish tokens** for live public CVs. Fixed — `ra_published:{owner}` |
| `ra_owned` | global | an entitlement flag with no owner. Fixed — `ra_owned:{owner}`; the server is still the real check |
| `ra_optimize_result`, `ra_ar_optimize_result` | global | one person's ATS analysis. Fixed — `…:{owner}` |
| `ra_optimize_draft`, `ra_ar_optimize_draft` | global | pasted CV text and the job advert. Fixed — `…:{owner}` |
| `ra_saved_resumes` | global | **full text of up to ten finished CVs**, with scores. Fixed — `…:{owner}` |
| `ra_scan_history` | global | ten complete ATS analyses, each embedding its result. Fixed — `…:{owner}` |
| `ra_jobs` | global | up to fifty applications: company, role, private notes. Fixed — `…:{owner}` |
| `ra_lang`, `ra_lang_choice` | global | a language preference. Correctly global — no CV content |
| `ra_login_sent` | global | a rate-limit breadcrumb, set before anyone is signed in. Correctly global |
| `ra_flag_builder` | global | a local feature-flag override, for development. Correctly global |
| `ra_funnel_entry` (sessionStorage) | per tab | referrer class and page family only. No CV content. Fine |

The last three columns of that table are now enforced rather than described: `PERSONAL_KEYS` and
`DEVICE_KEYS` in `app/lib/personalStore.ts` are the two lists, and `ops/isolation.test.mjs` walks every
`.ts`/`.tsx` file under `app/` collecting literal `ra_*` storage keys and fails if one belongs to
neither list, or if a personal key is addressed by name anywhere outside the store.

### The three that were missed the first time round

The original audit listed four unowned keys and called the builder draft the bug. It missed
`ra_saved_resumes`, `ra_scan_history` and `ra_jobs` — which between them hold more of a person than the
draft does. `SavedResume` even carries a `userId` field, written and never read, so the store *looked*
account-aware while nothing filtered on it. A record that knows whose it is, in a store that does not,
is worse than neither: it reads like protection.

`ra_published` is the sharpest of the set and looked the mildest. Each entry carries the **unpublish
token**, which is a capability rather than data — the second account on a shared browser inherited both
the list of someone else's live CVs and the power to take them offline.

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

## The AI cache keys, which were a second family of the same bug

The storage audit above is about what is stored. The generation cache is about what is *asked*, and
three of its keys were incomplete in exactly the way that produces confident wrong answers.

**The de-duplication key omitted the career context.** `dedupe(task, inputHash)` shared one in-flight
request between every caller asking the same task with the same input — and for `role_blueprint` the
question lives entirely in the context (occupation, country, level) while the input is
`{ confirmedSkills: [] }`, byte-identical on every new resume. Two resumes open in one tab, one for a
nurse and one for an accountant, both firing their automatic blueprint on mount: one request, and the
second rendered the nurse's skills under the accountant. Nothing downstream could catch it — the answer
was well-formed, the cost was right, the ledger was right, only the content belonged to another resume.
The key is now the cache slot plus the input hash, which gives the invariant that a follower is only
ever a caller that would have written the identical cache entry.

**`final_content` did not key on the job advert.** The payload sends `jobAd: state.target.jobAdText`
and the model tailors every summary to it; the key had the confirmed-facts digest and the target title,
and `jobAdText` is not part of a `CareerContext` either. So: paste an advert, generate three summaries,
replace it with a different employer's advert, generate again — and the cache answers instantly with
the summaries written for the first one. The product's central claim, silently false on the second try,
and regenerating could not fix it.

**`experience_package` did not key on whether the role is current.**
`payload.experience.current` is `!role.end.trim()` and it decides the tense of every suggested duty.
Filling in an end date on a role whose duties were already generated left the present-tense set cached.
Keyed on the boolean rather than the date, so correcting a month does not discard a valid entry.

**Stale-response rejection now includes identity.** `acceptReply` checked context hash, input hash and
revision, none of which can see a resume *switch*: `BuilderProvider` is not remounted when the user
opens a different resume — it re-hydrates inside an effect — so a request already on the wire outlives
the switch, and two fresh resumes for the same job title agree on all three (same hashes, both at
revision 0). The first resume's reply was therefore accepted into the second and charged to it. The
stamp now carries `(resumeId, owner)` and `useGenerate` aborts any in-flight request when either
changes, so the reply is not merely refused, it is not paid for.

## The anonymous-user question, answered

This document has carried the same open item since it was written: the builder works without an
account by design, so an anonymous user has no id to key a server record on, and everything
downstream — conflict UI, multi-tab detection, cross-device sync — waited on that.

The owner decided it: **anonymous work lasts the visit. Signing in is what saves it.**

That is a product decision rather than a technical one, and it is a good one, because it makes the
guarantee match what can actually be guaranteed. A browser that silently resurrects a half-built CV
weeks later is the behaviour behind every "old data came back" report here, and on a shared device it
is worse than annoying.

### What it means in code

`mayRestore(owner)` in `app/lib/resumeStore.ts` is the whole rule:

- a signed-in account restores always — that is the offer made in exchange for the account;
- `anon` restores only inside the visit, and a lapsed visit has its records **removed** rather than
  merely skipped, so nothing can surface later through a path the rule does not control.

`BuilderProvider` asks before it reads anything, and all three doors to old data are closed together:
the resume record, the legacy `ra_journey_*` slot, and the chat draft. Closing one and leaving the
others would make the rule look implemented while old work still walked back in.

### Thirty minutes, and why there is a window at all

The window is a judgement and is worth naming as one. Dropping the draft on unload would be the
literal reading of "no cache", and it would mean a person who fills four fields, has the phone
background the tab, and comes back loses everything — which loses the customer, not the cache.

Thirty minutes covers a refresh, a phone call, a look at the job advert in another app, a train
tunnel. It does not cover "yesterday". `sessionStorage` was the obvious alternative and is wrong: it
is per-TAB, so opening the builder in a second tab would read as a new visit and wipe the first.

The marker is stamped by `writeResume` itself rather than by a caller, so it cannot drift from the
data it describes — and the last write on the way out is the tab closing, which is exactly the right
definition of "when this visit ended".

### The promise that was quietly withdrawn, and put back

Anonymous work no longer reappears, which is correct and is also a promise being taken away. Saying
"Saved" and nothing else would be the product knowing that and letting the user find out by losing a
CV. So the builder now tells an anonymous visitor what the limit is, next to the save indicator —
the exact place someone looks to ask whether their work is safe — with a link to sign in, because
the sentence is only fair if the remedy is one tap away.

## Still open

- Server persistence for signed-in accounts already exists at `/api/resumes`; what remains is
  `revision` / `baseRevision` conflict resolution across devices
- Multi-tab conflict detection

## Tests

`ops/isolation.test.mjs`, **78 assertions** against a fake `localStorage`, so failures point at the key
scheme rather than at a rendered screen: two resumes never mix; an unknown id yields nothing; two
accounts in one browser stay separate; sign-out removes the departed owner; a mismatched record is
quarantined; revisions advance; delete removes exactly one; the legacy slot migrates once and never
overwrites a newer record; no generic key is ever written; private routes carry a private policy and
the policy is not global.

Then, for the other seven stores: each account sees only its own saved CV text; scan history and the
job tracker are scoped and a private note does not cross; delete, update and remove are all
owner-scoped; **an empty owner reads nothing and never falls back to the unowned key** — the single
most important one, because every page renders at least once before `/api/auth/me` answers and a
fallback there is exactly how the previous person's CV appears on screen; the pre-scoping values are
adopted once, retired rather than deleted, and never overwrite newer data; an anonymous visitor's data
lands under `anon` and signing in does not inherit it; sign-out takes the publish tokens with it; no
literal `ra_*` key escapes classification; and a corrupt value degrades to empty rather than crashing a
page.

`ops/aicache.test.mjs`, 147 assertions, covers the cache-key family: two occupations asking the same
task with the same input are two calls; two role instances are two calls; the dedupe key is provably
the cache slot plus the input hash; a reply for a different resume or a different owner is refused;
two fresh resumes with identical context, input and revision are still told apart; an *unstamped* reply
is refused rather than silently accepted — which is how these clauses passed their own tests for one
run after being added, since `undefined === undefined`. Plus source-level assertions that the summary's
key names the job advert it sends and the experience key names `current`, because those omissions live
in a `useMemo` inside a component and no unit test can reach them.
