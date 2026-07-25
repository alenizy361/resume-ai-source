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
