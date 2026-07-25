# Builder flow — verified bug list

Each of the fifteen suspected problems, checked against the running application. Several
were already fixed earlier in this session's work; those say so, with the commit. The rest
are confirmed with a root cause.

Method: the app running at `localhost:3113`, driven in Chromium; `ops/routes.test.mjs`
(30 routes, 217+ assertions); direct source inspection.

---

## Confirmed, and fixed in this pass

### #3 — Empty section heading after the target-job section — **CONFIRMED · fixed**

| | |
|---|---|
| Route | `/`, `/ar`, `/build`, `/ar/build` |
| Component | `components/build/Builder.tsx` |
| Reproduce | Open `/`, scroll one section past "The job you are aiming for" |
| Expected | A titled section |
| Actual | `<h2 class="bd-title"></h2><p class="bd-sub"></p>` — an empty heading and an empty subtitle |
| Console | Clean. Nothing warns. |
| Severity | Medium — visible on the homepage, reads as a broken build |

**Root cause, precisely:** `ORDER` contains twelve `SectionId`s including `"blueprint"`.
`T.sections` and `T.subs` had eleven keys each — no `blueprint` — and were written as

```ts
} as Record<SectionId, string>,
```

`as` is an *assertion*: it tells TypeScript to stop checking. The missing key was
therefore invisible to the compiler, and `t.sections["blueprint"]` evaluated to
`undefined`, which React renders as nothing.

**Fix:** added the four missing strings (title and subtitle × two languages) and changed
all four casts from `as` to `satisfies`, which *checks* rather than asserts. Omitting a
`SectionId` is now a compile error, so this cannot recur silently.

---

## Already fixed earlier in this session

| # | Suspected | Status |
|---|---|---|
| 6 | Upload goes to a disconnected optimizer | **Fixed** (`68caacc`) — `lib/handoff.ts` writes the parsed CV into the shared draft store and both optimize pages offer "keep editing in the builder". The original upload crosses, not the AI rewrite. |
| 7 | Optimizer and builder use different state models | **Fixed** (`4b17d7a`, `68caacc`) — `lib/scoreText.ts` adapts flat text to `BuilderState`; both halves score through `reviewChecks`. |
| 12 | Live preview rerenders incorrectly | **Fixed earlier** — 250 ms debounce, explicit `dir` from the resume language, and unreached sections no longer mount at all (`99cde13`). |
| 14 | Legacy ResumeAI routes compete | **Verified absent** — zero occurrences of `ResumeAI` / `Resume AI` / `resume-ai` in `app/`. The name in circulation was Rabit-as-product, fixed in `03f365b`. |
| 15 | No clear path to review/design/export/payment | **Fixed earlier** — review (`99cde13`), design and export (`363dbf9`), payment via the existing entitlement service (`a0b113c`). |

## Verified NOT broken

| # | Suspected | Finding |
|---|---|---|
| 4 | "Talk to the AI instead" points at a broken route | `/journey` returns 200, renders the chat's own `h1`, no page errors. Asserted every run in `ops/routes.test.mjs`. |
| 5 | The Arabic AI journey is broken | `/ar/journey` likewise. Both were 404s until `dfa4f46`; they exist and are covered. |
| 8 | AI buttons exist without working endpoints | Every builder AI control posts to `/api/suggest`, which is live. The `ops/form-smoke.mjs` suite blocks that endpoint deliberately and asserts the form still completes — so both the connected and the disconnected paths are exercised. |
| 11 | Refresh loses progress | `Builder` hydrates from `readDraft(lang)` on mount and autosaves 450 ms after any change. Asserted in `ops/draftstore.test.mjs`. |
| 13 | Arabic and English behave differently | Asserted: `ops/form-smoke.mjs` runs the full journey in both (`UI=ar`), `ops/i18n.test.mjs` checks key parity, `ops/pricing.test.mjs` checks both languages state the same rules. The one real divergence found — Arabic duties on an English CV — was fixed in `a619b27`. |

## Confirmed and OPEN — the structural work

### #1 / #2 — The root page is a long builder, not a landing page + guided flow

| | |
|---|---|
| Route | `/`, `/ar` |
| Component | `app/page.tsx` → `Builder.tsx` |
| Actual | All twelve sections render in one scrolling page. Unreached sections are visible but dimmed (`.bd-section.locked { opacity: .38 }`) with empty bodies. |
| Expected | `/` explains the product; the builder is a separate guided workflow with one active step |
| Severity | High — this is the product's first impression and its core interaction |

**Root cause:** the builder was built as a single scrolling "cinema" deliberately, to match
the chat's feel (`useSectionCinema`, ported from `Journey.tsx:425-435`). That decision is
what the brief now reverses. It is not a defect in the code so much as the wrong shape for
the product, and changing it means splitting one component into a route per step.

### #9 / #10 — Loading, empty, error and retry states are uneven; suggestions can be lost

Present: experience (`busy`/`err`, abort controller, visible budget), summary (`busy`,
throttle-aware), AskAi. **Absent or partial:** the blueprint section (no loading state —
it reads a cached pack, so there is nothing to wait for, but a model-backed blueprint would
need one), skills (no error state), credentials and languages (no AI at all yet).

Suggestions survive navigation *within* the page because they live in one reducer. They
would not survive a route change — which is exactly what splitting into step routes
introduces, so the persistence has to move with it.

---

## What the restructure requires

Not a rearrangement. Four things have to change together:

1. `/` becomes marketing; the builder moves to `/builder` and a step route.
2. `BuilderState` has to persist across route changes, not just across renders — the
   reducer currently lives in one mounted component.
3. Each step needs to be directly addressable and recoverable from a cold load.
4. The AI calls that exist in three sections need the same treatment in the rest, behind
   one orchestration layer with per-task schemas.

Items 2 and 3 are the load-bearing ones: without them, splitting the page into routes
loses state on every Continue, which is worse than the long page it replaces.

---

## The restructure, and the bug it uncovered

Items 2 and 3 are done. `/builder` is a start page; `/builder/[resumeId]/[step]` is one
step per page in both languages; the reducer moved to `builderState.ts` and is now driven
by a provider mounted in `app/builder/layout.tsx`, which is what lets it outlive a step
navigation. Every Continue flushes to storage synchronously before it navigates.

### #16 — The route crossfade destroyed all layout-held state — **CONFIRMED · fixed**

| | |
|---|---|
| Component | `components/orb/OrbProvider.tsx` → `PageTransition` |
| Scope | Every route in the application, not just the builder |
| Reproduce | Type into any step, wait 300 ms |
| Actual | The field empties. The whole client subtree unmounts and remounts, with no navigation and no error. |
| Severity | High — it makes layout-hosted state impossible anywhere in the app |

`PageTransition` wrapped `{children}` in `<motion.div key={pathname}>`. That is a React
key: when it changes, React discards the entire subtree and builds a new one. Correct for
a crossfade, and fatal for the design above — the provider that holds the resume is *in a
layout*, and React would otherwise have kept it mounted across the URL change.

Measured, not inferred: probes on mount and unmount showed `BuilderProvider`,
`BuilderShell`, `BuilderStep` and `TargetFields` all unmounting roughly 250 ms after
arriving at a step — one exit animation later — and remounting empty. It happened with no
typing at all, which is what ruled out the reducer, the dispatch and the store.

It is also why the first run of `ops/steps.test.mjs` produced five failures that looked
like a persistence bug and were not. Two false leads were eliminated on the way: a stale
`next dev` server hot-reloading a refactor that had moved components between modules, and
`ops/` living inside the watched root, so editing the test file itself triggered a Fast
Refresh mid-run.

**Fix:** the crossfade now keys on a route *group*. The builder's eleven steps are one
surface with eleven addresses, not eleven pages — there was never a reason to fade between
them, and not fading makes the step change instant as well as safe. Every other route
keeps its own key and behaves exactly as before.

### Also found and fixed on the way

- `/builder` rendered its step links before hydration, when `resumeId` is still empty, so
  `stepHref(lang, "", s)` built `/builder//target` — a URL that is not this route and that
  a fast click would follow. Plain text until the id is known.
- `ops/i18n.test.mjs` could not parse a doc comment above a key: the comment's words
  landed in the identifier buffer, so the key after it went unseen. The failure was
  asymmetric — documenting a key in the English block and not the Arabic one made the
  checker report that **English** was missing the key that was plainly there, which sends
  you to the wrong file. The parser now skips comments, verified by injecting a genuinely
  missing key afterwards.

### #1 — The homepage was the builder — **CONFIRMED · fixed**

`/` and `/ar` now explain the product: the headline, the flow in four steps, a worked
example built from the same cached role pack the builder seeds from, the four things the
product will not do, and a pricing summary read from `lib/plans.ts` so it cannot drift
from the checkout. Three doors: the guided builder, upload-and-improve, and the chat.

A returning visitor with work in progress is offered it by name at the top of the page.
That is the one part of the page that needs a browser, so it is the one client component —
and it reads localStorage through `useSyncExternalStore` rather than in an effect, which
is both correct for an external store and the pattern the rest of this codebase's
remaining lint errors are made of.

The long single-page builder was not deleted. It still answers at `/build` and `/ar/build`,
now canonicalised to `/builder`, which makes reverting the homepage a two-file change.

Two defects surfaced only by looking at the rendered page, which is the lesson this
session already paid for once:

- **The step navigation pushed the page sideways on a phone.** A grid item's default
  `min-width: auto` means it will not shrink below its content, so the eleven-label
  horizontal scroller sized itself to 1151px inside a 390px viewport and the
  `overflow-x: auto` on the list inside it did nothing — the list was never the
  constrained box. `min-width: 0` on every column.
- **The whole step chrome was scrolled off on arrival.** Next scrolls the changed
  *segment* into view, and the changed segment is the step — so the Edit/Preview toggle
  (measured at y = −31) and the step navigation (y = 29, under a 52px sticky header) were
  both present and both unreachable. Every step navigation now passes `scroll={false}`
  and the shell scrolls to the top itself.

Also: the job-description field printed its own caption as its placeholder, so the same
sentence appeared twice in a row.

### #9 / #10 — Uneven AI states, and two sections with no AI — **CONFIRMED · fixed**

`lib/aiTasks.ts` holds fourteen task types, each declaring its validation, request shape,
output parse, timeout and retry budget. `useAiTask` gives every section the same
idle→loading→success|empty|error|cancelled lifecycle and the same wording, and
`/api/health/ai` answers the question "is the AI wired up, and how" that used to have one
symptom for four different causes.

The policies worth restating, because each could have gone the other way:

- A **429 is never retried** — retrying a rate limit spends metered credit to be refused
  again, and turns a throttle into a block.
- **Token-spending tasks get zero retries.** The job-link fetch gets two (costs nothing);
  the upload gets none (the upload *is* the expensive part).
- **A timeout is an error, not a cancellation** — nobody chose it.
- **`empty` is a first-class outcome.** A 200 with nothing usable *worked*.

Credentials and languages now offer suggestions, which closes a real gap rather than adding
a button: a recognised job title gets its licences from the cached packs instantly and
offline, and an unrecognised one — most titles — got nothing at all.

Two defects found on the way, both by tests rather than by reading:

- **A 500 with an empty body printed `http-500` to the user.** `error` carried both the
  server's words and our internal token, so every token was one missing lookup from the
  screen. They are separate fields now, and a sweep over all fourteen tasks asserts no code
  can leak.
- **The skills step was empty unless the user visited the blueprint step.** Seeding from the
  cached role pack lived in `BlueprintBody`'s effect, which was fine while one page mounted
  every section and wrong the moment each step became a route. It is a state transition, not
  a view concern, so it moved to the provider. Caught by the probe written to find selectors
  for the end-to-end test — before that test existed.

### The acceptance run

`ops/radiology-e2e.test.mjs` — a Radiology Technologist in Riyadh builds a CV from nothing
and downloads it, in both languages: 45 assertions, all passing. Every AI response is
stubbed, and every stubbed suggestion the test does not tap carries a marker, so "nothing
unapproved reached the document" is checked against a string that cannot occur by accident.

It also asserts the failures this rebuild existed to fix: one employer yields one job entry,
an English CV contains no Arabic, an Arabic CV's language level is an Arabic word rather than
an English key, a language with no level is not published, a credential is not on the CV
until "I hold this" is ticked, and a cold reload of the last step restores the whole
document.

Three of its own assertions were wrong on the first run and the product was right — worth
recording, because each is a way a test lies:

1. Duties are offered on the job fields losing focus, and `fill` never blurs. Zero
   suggestions, reported as a product failure.
2. The templates upper-case certification lines, so a case-sensitive check failed in English
   and passed in Arabic. Arabic having no case is what gave it away.
3. The duty text was hardcoded, which passed in English by coincidentally matching the
   cached pack and failed in Arabic, where the pack words the same duty differently. It now
   records what the user actually approved and asserts on that.
