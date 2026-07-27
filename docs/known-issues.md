# Known issues

Found during the career-platform audit. Severity, reproduction, and whether it is fixed.
Anything marked OPEN is not fixed and is not claimed to be.

The three audits behind this: payment/export, the AI task map and language trace, and the
CV state-model survey. Each read the code rather than the docs, and each found things the
docs did not say.

---

## FIXED in this pass

### F-1 · P0 · One payment could renew itself indefinitely

`/api/pay/verify` computed `until = Date.now() + window` on every call, and
`grantEntitlement` was an unconditional overwrite. Re-opening the callback URL from browser
history 89 days after a 90-day pack renewed it for another 90 days. Repeatable forever.

Not an exotic path: `app/(en)/pay/callback/page.tsx` re-fires verify when `owner` changes
from the local guess to the server's answer, which is essentially every load, plus once per
"Refresh status" tap.

**Fix.** `claimTransaction(transactionNo)` returns `true` to exactly one caller; fulfilment
is gated on it. `grantEntitlement` additionally takes `Math.max(existing, until)` so a
genuine second purchase can extend but never shorten. Both halves are needed and neither is
sufficient — `ops/fulfilment.test.mjs` models the composition the route actually uses,
after a first draft of that test asserted the maximum alone was enough, which is false.

**Evidence.** `ops/fulfilment.test.mjs`, 25 assertions.
**Not production-verified** — needs a Paylink credential this environment does not have.

### F-2 · P0 · Unauthenticated sign-in-link oracle

Every call to `/api/pay/verify` sent a receipt email **and minted a fresh 15-minute magic
sign-in token** to the buyer's address. The only thing required was a `transactionNo` —
which lives in browser history, in referrer headers, and in any shared callback link.
Anyone holding one could mint working sign-in links to that inbox, indefinitely.

**Fix.** Fulfilment — grant, receipt and token — happens once per transaction, behind the
same claim. Re-checking a payment still returns the correct JSON and still sets this
browser's cookies; it no longer re-fulfils. That distinction is deliberate: re-checking is
legitimate, re-fulfilling is not.

### F-3 · P0 · Two accounts could share one entitlement key

`"ent_" + base64url(email).replace(/-/g, "_")`. base64url's alphabet is `A–Z a–z 0–9 - _`,
so folding `-` into `_` makes the encoding non-injective: two different emails can produce
the same key, and one account reads — then on its next purchase overwrites — another's paid
access. The `replace` was defending against nothing; Edge Config keys already permit `-`.

**Fix.** Writes use the un-folded key. Reads try it first and fall back to the legacy folded
key, so nobody who paid before the fix loses access. `ops/fulfilment.test.mjs` asserts the
fold survives in exactly one place and that it is the read-only legacy path.

### F-4 · P0 · The designed PDF had no watermark — the paywall, bypassed

`ResumeTemplate` had no `watermark` prop at all, so `DesignSection` — which computes the
flag correctly and passes it to `PdfExport` and `DocxExport` — could not pass it. The
designed PDF was a clean, paid-quality export for every free user, from the most attractive
of the three download buttons.

Worse for Arabic: `PdfExport` refuses Arabic, so `DesignSection` hides the plain PDF for an
Arabic CV, making the designed one the **only** PDF an Arabic user is offered. There was no
version of this that charged an Arabic user anything.

**Fix.** `watermark?: boolean` on `ResumeTemplate`, defaulting to `true` — fail-closed, so a
call site that forgets it marks the file rather than giving it away. Stamped into the PDF
after the image and on every page, so it survives both cropping and editing the DOM before
pressing the button. Wired at `DesignSection` and both `/optimize` pages.

### F-5 · P1 · A promotion would refuse paying customers

`/api/pay/verify` carried a **third** hardcoded price table reading only `PRICE_*`, while
`plans.ts` — used by the modal and `/api/pay` — also honours `NEXT_PUBLIC_PRICE_*`. A
promotion configured the documented way made `/api/pay` invoice 19 while verify expected 35:
`amountOk` false, and a customer who paid exactly what they were shown was refused and told
their payment "needs review".

`ops/pricing.test.mjs` could not see it because it skips `api/` entirely.

**Fix.** The route reads `chargeableAmount()` — the function that exists precisely so retired
plan ids stay verifiable.

### F-10 · P0 · Scrolling down threw the user out of the browser

Third report from the same iPhone, and the most specific: the site opens, and scrolling down
closes the browser.

`t-enter` was `animation-timeline: view()` — a browser-driven scroll animation with no
JavaScript, running on the compositor. On paper the cheapest possible reveal, which is why it
was chosen, and the argument against the alternative still holds: an `IntersectionObserver`
reveal is a main-thread callback per element firing inside the exact window INP measures, on 357
pages whose whole purpose is search traffic.

Measured before removal: **9 live `ViewTimeline`s** on a catalogue detail page, 4 on the
landing page, each attached for the life of the page.

**Why removed rather than tuned.** Two of its faults were already found and fixed by
measurement — the per-card version promoted a compositor layer per item (62 layers on one
page, F-8), and a fixed pixel range could never complete near the bottom of a short document.
Both fixes were real, and the reports kept coming. The deciding fact is not about the effect:
**this environment has Chromium and only Chromium.** Scroll-driven animations shipped in Safari
very recently, WebKit is where the crash happens, and it cannot be reproduced, bisected or
cleared from here. A decorative effect whose safety cannot be checked on the platform most
users are on is not a trade worth making.

**Fix.** `t-enter` is a one-time `@starting-style` entrance at mount. No timeline, nothing
attached after 260ms. Sections below the fold animate while off screen, which is invisible and
free. All 57 call sites keep their markup; only the cost changed.

    live ViewTimelines   9 → 0   (catalogue detail)
    live animations     15 → 6   (catalogue detail), 11 → 7 (landing), 5 → 3 (catalogue index)

**And the question that came with the report** — "why load every screen at once, it's heavy" —
is answered in the same rule. `content-visibility: auto` with `contain-intrinsic-size: auto
500px` on each section lets the browser skip layout, paint and compositing for anything off
screen, on pages that are up to 7.8 screens tall. The content stays in the DOM, so nothing
changes for a crawler or for Cmd-F; only the rendering work is deferred. That is the difference
from pagination, which would cost the search traffic these pages exist for.

Worth noting the measurement that did NOT support the report's premise: these pages are not
heavy in content terms — 145–309 DOM nodes and 34–70 KB of HTML. The weight was in what the
CSS asked the compositor to do, not in how much was loaded.

**Evidence.** `ops/motion.test.mjs` (49 assertions) now bans `animation-timeline` and any
`view()`/`scroll()` timeline outright — a source rule, because no Chromium runtime check can
measure what made it unsafe — and asserts the replacement is still a real entrance and that
`content-visibility` has an intrinsic size to go with it.

### F-9 · P0 · "Open the site and the previous entries are still there"

Reported twice, after the fix that was supposed to prevent it.

The rule asked for was plain: **no cache — signing in is what brings old data back.** What was
built instead was a thirty-minute last-seen timestamp in localStorage, on the reasoning that
thirty minutes covers a refresh, a phone call, a look at the advert in another app.

That is a cache wearing a product rule's clothes, and it produced exactly the reported
behaviour: open the site inside the window and the previous CV is restored.

The argument used to reject `sessionStorage` at the time was that it is per-tab, so a second
tab would read as a new visit and wipe the first. That was weaker than it looked — a second
tab is not how this is used, and the cost of being wrong there is one clean builder, against
a stranger's half-built CV appearing as the cost of being wrong the other way.

**Second defect, same report.** `BuilderProvider` refused to restore a lapsed draft, but
`ContinueDraft` on the landing page read the resume index directly with no such check. So the
landing page went on announcing "you have a CV in progress" and linking to a record the
builder would then decline to load. Two components, one question, two answers, and the louder
one wrong.

**Fix.** The visit is the TAB SESSION, marked in `sessionStorage`:

| | |
|---|---|
| reload, or iOS reclaiming and restoring the tab | same visit — work recovered |
| closing the tab and coming back, at any interval | new visit — clean builder |
| signed in | the account's CVs, always |

It fails **closed**: where `sessionStorage` cannot be reached, nothing is restored. `VISIT_GAP_MS`
is deleted rather than kept, because a second definition of when a visit ends is how one
product ends up with two answers. `ContinueDraft` now asks `mayRestore` like everything else.

**Evidence.** `ops/isolation.test.mjs` (111 assertions) covers the store's answer against a
fake sessionStorage — including that it refuses when the store is unreachable.
`ops/visit.browser.mjs` (new, 10 assertions) runs the actual reported sequence in a browser:
type a title, reload, confirm it survives; open a NEW tab in the same browser seconds later,
confirm the form is empty, the record is dropped rather than skipped, and the landing banner is
gone. The unit test could not have caught the two-components-disagreeing half.

### F-7 · P0 · Fifty backdrop blurs per page closed the browser on iOS

Reported twice from a real iPhone: opening the site closes the browser.

`.card` carried `backdrop-filter: blur(14px)`. It is the most repeated element in the
product — 50 on one catalogue page, across 357 catalogue pages — so that one declaration
asked iOS Safari for fifty backdrop snapshots and fifty blur passes on a single screen.
Measured by selector at 390px wide:

| page | blurred elements | blurred area |
|---|---|---|
| `/resume-examples` | **51** → 2 | **1.42 MPx** → 0.03 |
| `/` | 12 → 2 | 0.81 → 0.03 |
| `/resume-examples/registered-nurse` | 11 → 2 | 0.59 → 0.03 |
| `/pricing` | 7 → 2 | 0.55 → 0.02 |

**Why every check missed it, which is the part worth keeping.** The build emits only the
prefixed form:

```
.card{-webkit-backdrop-filter:blur(14px); …}
```

Blink ignores `-webkit-backdrop-filter`; WebKit requires it. So Chromium — the only engine
this environment has — renders **zero** blurs and reports `backdropFilter: "none"` on a page
that blurs fifty elements on the device the product is actually used on. A browser sweep that
measured compositor layers, computed opacity and real pointer presses was structurally
incapable of seeing the most expensive thing on the page. That is a hole in the method, not
bad luck.

It also compounded with the earlier per-card scroll reveal (F-8 below): fifty permanently
promoted compositor layers *and* fifty backdrop blurs on the same page.

**Fix.** Blur removed from `.card` and `.tpl-card` — the two classes that repeat per item. It
is kept where there is exactly one per page and something real behind it: `.ps-header`,
`.bd-header`, the sheet scrim, `.glass-surface`, `.chip`. **The rule is the count, not the
effect.** Behind a card here is a flat near-black background; blurring a flat colour produces
the same flat colour, so nothing visible changed.

**Evidence.** `ops/motion.test.mjs` forbids a backdrop-filter on any class that repeats, and
asserts the singleton surfaces still blur — a source rule, so it covers all 400+ pages.
`ops/iosblur.browser.mjs` (new, 10 assertions) derives the blurred selectors from the SERVED
stylesheet and matches them against the live DOM, measuring what WebKit will do using a
browser that will not do it.

### F-8 · P0 · The per-card scroll reveal cost a compositor layer each

A scroll-driven animation with `fill: both` never finishes, so every element carrying one
stays promoted to its own compositor layer for the life of the page. Applied to every `.card`,
`/resume-examples` went from 11 layers to **62**, and live animations from 3 to 53.

**Fix.** The reveal moved to the SECTION rather than each card in it — one layer per section
instead of one per item. `ops/motion.browser.mjs` now asserts an absolute cap of 32 layers and,
more importantly, that on a page with 20+ cards the live-animation count stays under half the
card count, so the cost cannot follow the content again.

**This fix existed for hours before it reached production.** Every deployment after it was
refused with HTTP 402 `api-deployments-free-per-day`, so production kept serving the crashing
build while the repository held the fix. A pushed fix is not a shipped fix — see
`docs/vercel-env.md`.

### F-6 · P0 · A transient store blip could overwrite a live CV

Found by `ops/resumeserver.test.mjs` against code written in the same sitting.
`saveServerResume` reads the current record to compare revisions. Written against a lenient
read, a Redis blip returns `null`, which is indistinguishable from "this is a new resume" —
so the conflict check is skipped and the document is written back at revision 1 on top of
whatever was there.

**Fix.** A strict read that throws on transport failure is used by the writer; the lenient
one remains for readers, which can safely fall back to the browser draft.

---

## OPEN

### F-12 · P0 · There is now a payment webhook — FIXED *(was O-1)*

The only thing that granted access was the buyer's browser returning to `/pay/callback` and a
fetch succeeding. Close the tab on the payment page, lose signal in a lift, have iOS kill the
app while the bank's 3-D Secure page is open — charged, with no entitlement, no receipt and no
sign-in link. Nothing on the server knew a payment had happened.

`POST|GET /api/pay/webhook` is the server hearing it directly. The browser path stays and is
still first whenever it works, because it is what makes the confirmation screen instant.

**Safe without a shared secret**, which is the design point: nothing in the request body is
believed. A caller supplies at most a `transactionNo`, and the invoice is then fetched from
Paylink with this server's own credentials — a forged body claiming a 99-riyal payment gets
whatever Paylink actually says about that transaction. `PAY_WEBHOOK_SECRET` is honoured when set
but deliberately optional: a webhook that refuses everything because a variable was never pasted
is a webhook that silently does not exist, which is the failure being fixed.

**One money path, not two.** The grant, the amount check, the receipt and the sign-in token moved
to `app/lib/fulfil.ts`, and both routes call it. On the money path two implementations is not
duplication to tidy later — it is two answers to "was this paid for, and for how long", drifting
apart where being wrong costs a customer or costs revenue. `ops/paycallback.test.mjs` asserts
neither route grants, mints a token or sends mail itself.

`claimTransaction` already made fulfilment once-per-transaction, so the webhook and the browser
racing each other produces one grant and one receipt. That guard was built for the browser
replaying itself; the webhook is why it had to be keyed on the transaction rather than the request.

Any transaction the server successfully looked at answers **200**, whatever the outcome, because
providers retry non-2xx and "already fulfilled" is the system working. The only 5xx is 503, for
the one case a retry genuinely helps: Paylink itself unreachable.

**Still needs you, and this part code cannot do:** register the URL in the Paylink dashboard as
the merchant webhook — `https://cv.rabit.sa/api/pay/webhook`. Until then the route is correct and
never called.

### O-1 · superseded by F-12

The entire grant depends on the buyer's browser returning to `/pay/callback` and the fetch
succeeding. Close the tab after paying and the customer is charged with no entitlement, no
receipt and no sign-in link.

**Blocked**: needs a webhook endpoint registered in the Paylink dashboard — an external
account this environment cannot reach. The endpoint itself is straightforward and
`claimTransaction` already makes it safe to run alongside the browser path.

### F-13 · P0 · The payment return URL is no longer the caller's choice — FIXED *(was O-2)*

`/api/pay` built the invoice's `callBackUrl` from `req.headers.get("origin")`, with no allow-list,
on an unauthenticated endpoint. Any caller could mint a real Paylink invoice whose return URL
pointed at a host they control: the buyer pays on Paylink's own hosted page and lands somewhere
else, carrying a live payment reference.

**Fix.** `app/lib/payOrigin.ts` — the configured app URL, this project's `*.vercel.app`
deployments, and localhost. Anything else falls back to the app URL rather than erroring, because
an unexpected Origin is far more likely to be a legitimate buyer than an attack, and refusing the
purchase to punish a header would cost a sale to prevent nothing.

Previews are allowed on purpose: a real test purchase is the only way this path is ever verified,
since no Paylink credential exists outside production.

The suffix check is anchored, which is the part a naive version gets wrong. `ops/paycallback.test.mjs`
asserts both mistakes are refused — `evil-vercel.app`, and `vercel.app.attacker.com`, the one that
reads as safe. Plain HTTP is refused too, localhost excepted: a return URL is where a paying
customer lands, and `http` there is a cleartext hop carrying a payment reference.

Its own module rather than a helper in the route, because the interesting cases are the refusals
and a route file cannot be imported outside Next.

### O-2 · superseded by F-13

`app/api/pay/route.ts` interpolates the caller's `origin` into the payment return URL with
no allow-list, and the endpoint is unauthenticated and unrate-limited.

**Not fixed in this pass.** The fix is a small allow-list against `NEXT_PUBLIC_APP_URL`, but
changing where a payment provider returns to is not something to ship without being able to
run one real transaction against it, and no Paylink credential is available here.

### F-11 · P0 · Paying lost the buyer's own data — FIXED

*(was O-3)*

A buyer almost always pays anonymously: checkout does not require an account, deliberately,
because requiring one beforehand loses most of the funnel. `/api/pay/verify` then signs them in
so their access follows them to another device.

So the owner changed mid-session from `anon` to `u_<base64 email>` — and every personal key is
`${base}:${owner}`. The buyer's CV in the builder, their optimiser draft, their saved CV texts,
their scan history and their job list were all still filed under `:anon`, unreachable, on the
very screen that says "payment received". `migrateUnowned` did not help: it adopts the
*pre-scoping* keys with no owner suffix at all, which is an older and different problem.

**Fix.** `adoptAnonymousResumes(owner)` in `resumeStore` and `adoptAnonymous(owner)` in
`personalStore`, called from `useOwner` on the `anon` → account **transition** — the only moment
it is correct. On mount it would file whatever is in the anonymous keyspace under whoever happens
to be signed in, which is how a shared laptop mixes two people's data.

Three rules make it safe:

- **Ids are kept**, so a URL the buyer has open or bookmarked still resolves.
- **The account is the authority.** Where it already holds a value, its own wins — a returning
  customer's saved CVs are theirs, and anonymous work in the same browser is a contribution, not
  a replacement.
- **The anonymous keyspace is emptied**, adopted or not. Leaving it would hand one person's work
  to the next anonymous visitor in that browser: a data-loss bug turned into a data-leak one.

The resumes are re-written through `writeResume` rather than copied as raw strings, because a
record CARRIES its owner — a copied record would still say `anon` inside, and `readResume` would
refuse and quarantine it, silently losing exactly what this set out to save. Asserted directly.

**Evidence.** `ops/isolation.test.mjs`, now 126 assertions, including the full reported sequence,
the returning-customer collision case, and that `useOwner` wires it to the transition rather than
to mount.

### O-3 · superseded by F-11

The buyer typically pays anonymously (`owner` = `anon`). `/api/pay/verify` auto-signs them
in, so the next `/api/auth/me` returns `u_<base64>`. Every personal key is `${base}:${owner}`,
and `migrateUnowned` adopts only *legacy unscoped* keys — it never migrates `:anon` →
`:u_…`. The optimizer draft, saved resumes, scan history and job list written before payment
become unreachable immediately after payment.

Fixable without credentials; not attempted here because it needs its own isolation test pass
and this sitting's budget went to the payment defects above.

### F-14 · P1 · The cover letter is written in the CV's language — FIXED *(was O-4)*

`/api/cover-letter` took `resume` and `jobDescription` and nothing else. It never named an output
language and no caller sent one, so the letter's language was whatever the model inferred from an
input that is frequently mixed — an Arabic CV against an English advert is the ordinary case in
this market. An Arabic-CV user could be handed an English cover letter, or the reverse.

This is a **paid** feature, and nothing detected it, because there was no expectation to compare
the output against.

Worse, one of the prompt's own rules was *"Mirror the job's language/keywords naturally"* — on a
mixed input that is an instruction to do the wrong thing. It now says keywords, not language.

**Fix.** `outLang` is an explicit argument, stated at the top of the prompt where a model is most
likely to honour it, and then **checked** with `languageHonoured` and retried once with
`LANGUAGE_RETRY`. Both already existed for `/api/optimize`, which learned the same lesson from a
live build that returned a fully Arabic CV to an English request — so the two routes share one
detector and one retry text and cannot drift on what a language failure sounds like.

All three callers send it. The builder's derives it from the CV (`arabicCv`), never from the
interface: a user reading the Arabic UI while building an English CV must get an English letter.

`outLang: "both"` — valid for a bilingual *résumé* on `/optimize` — resolves to English, because a
bilingual letter addressed to a person is not a thing anyone wants. Decided explicitly rather than
left to fall through an `=== "ar"` test, since the two produce the same output and only one is a
choice somebody made.

**Evidence.** `ops/language.test.mjs`, +10 assertions.

### O-4 · superseded by F-14

The prompt never names an output language and no call site sends one. An Arabic CV can get
an English cover letter and vice versa, decided by the model. This is a **paid** feature.
Three call sites: `DesignSection.tsx:243`, both `/optimize` pages.

### F-15 · P1 · `/api/optimize`'s Anthropic branch now receives both languages — FIXED *(was O-5)*

`callAnthropic(resume, jobDescription, extra)` called `PROMPT(resume, jobDescription)` — no
`uiLang`, no `outLang` — while accepting `extra` and never concatenating it. The NVIDIA branch
beside it passed all four. Two consequences, live the moment `AI_PROVIDER=anthropic` is set:

- `outLang` undefined falls to the prompt's English branch, which says the resume "must ALWAYS be
  100% professional ENGLISH". A user who explicitly chose Arabic gets English.
- `extra` is where `LANGUAGE_RETRY` arrives. Dropped, the retry re-sent a byte-identical prompt, so
  the model was never told what it got wrong. The comment at the retry site — *"Attempt 1 tells the
  model exactly what it got wrong last time"* — was false on this provider.

Masked by the default provider being NVIDIA: the kind of defect that appears the day someone flips
one environment variable, with nothing in the diff to explain it.

**Evidence.** `ops/language.test.mjs` asserts both branches now receive the same four arguments, so
it cannot regress on one provider only.

### O-5 · superseded by F-15

`callAnthropic` calls `PROMPT(resume, jobDescription)` without `uiLang`/`outLang`, and never
concatenates its `extra` argument. Under `AI_PROVIDER=anthropic` a user who chose Arabic
gets English, and the language-retry instruction never reaches the model — so the retry
sends a byte-identical prompt. Currently masked because the default provider is NVIDIA.

### F-16 · P1 · `ats_review` sends the CV's language, in a key the route reads — FIXED *(was O-6)*

`aiTasks.ts` sent `lang: i.lang ?? "en"`. Two faults, stacked: `/api/optimize` reads `uiLang` and
`outLang` and nothing called `lang`, so the field was discarded and `outLang` defaulted to English
inside the route — and even the discarded value was the **interface** language, where the CV's own is
`i.cvLang`, as `TaskInput`'s own documentation says.

Any caller reaching this task through `runTask` got an English rewrite of an Arabic CV. Masked
because the two live `/optimize` pages bypass `runTask` and post `outLang` themselves — a defect
reachable only through the typed, shared path, which is the one a new caller would use.

**Fix.** `uiLang: i.lang`, `outLang: i.cvLang ?? i.lang`. The advice's language follows the reader;
the resume's follows the document. Collapsing them is what returned a fully Arabic CV to an English
request once already.

### O-6 · superseded by F-16

`aiTasks.ts:361` sends `lang: i.lang ?? "en"` — the **UI** language. `/api/optimize` reads
only `uiLang`/`outLang`, so the field is discarded and `outLang` defaults to English. Masked
only because the live pages bypass `runTask` and post `outLang` themselves.

### F-17 · P1 · `/api/tools` takes a language — FIXED *(was O-7)*

Both prompts were English text and the route read no language field, so a LinkedIn headline, an
About section and eight interview questions came back in English regardless of the CV or the
interface.

Latent rather than live — both callers are English pages today — but latent in the direction the
product is growing. An Arabic LinkedIn profile is the normal case for this market, and "we will add
the Arabic pages later" is exactly when a hardcoded prompt language becomes a bug nobody remembers
introducing.

**Fix.** `lang` on the request, an `OUTPUT LANGUAGE` rule on its own line in both prompts, and both
callers declaring `"en"` explicitly rather than inheriting it by accident.

The JSON **keys** stay English deliberately: they are a wire format the caller destructures, not
content, and translating them would break the reader rather than serve them.

### O-7 · superseded by F-17

Both prompts are hardcoded English and the route reads no language. LinkedIn headline/About
and the eight interview questions always return English regardless of CV or UI language.

### F-18 · P1 · The five pages now read the CV this browser already holds — FIXED *(was O-8)*

`/interview`, `/interview-live`, `/linkedin` and both `/optimize` pages each opened on an empty
textarea labelled "paste your resume". Every one of them is reached from inside a product that had
just spent eleven steps collecting that exact resume, and none of them could see it. The CV was two
keys away in the same browser and the answer was "type it again".

`/interview-live` was the worst of the five: it refuses to start until the box holds a real career,
so the only way through was to type a CV out in front of a camera.

**Fix — one reader, one strip, five call sites.**

`app/lib/myCvs.ts` gathers both places a finished CV can live — the builder's structured
`ra_cv:{owner}:{id}` records, assembled through `assembleResume`, and the flat text in
`ra_saved_resumes:{owner}` — into one list. It writes nothing and adds no key: a "recent CVs" cache
would be a third copy of the same text that could disagree with the two that already exist.

`app/components/MyCvPicker.tsx` is the surface. It **offers and never fills by itself** — the lesson
from the "the cache still shows my previous entries" report, where storage silently repopulating a
form read as the product remembering something it had not been asked to remember. It renders `null`
when there is nothing to offer, so a first-time visitor arriving from search sees those pages exactly
as before.

Three properties are load-bearing and each is asserted:

- **The language comes from the DOCUMENT.** `ResumeRecord.lang` is the language the *builder was
  being read in* — `BuilderProvider` passes its route's `lang` prop straight through. The CV's own
  language is `cvLang(state.target)`. Reading the wrong one reintroduces the most damaging bug this
  product has had.
- **The visit rule governs both stores.** `mayRestore(owner)` gates the whole list. Gating the
  builder's records and not the saved ones would make the rule depend on which door the CV came
  through, which is not a rule.
- **De-duplication keeps the builder's copy.** Building a CV and saving it puts the same text in both
  stores; only the builder's knows the target job, so the loop order decides whether the interview
  page can fill its second box.

**And the hardcoded output language, which a picker alone would not have fixed.** `/interview` and
`/linkedin` both sent `lang: "en"` to `/api/tools`. `/ar/interview` and `/ar/linkedin` redirect to
those same pages with `?lang=ar`, so every Arabic user was handed English interview questions and an
English LinkedIn headline with no field anywhere to say otherwise. `outLangFor` now prefers the
picked CV's own declaration, falls back to the script the user actually typed, and only then to the
interface — and stops trusting the pick once the text is replaced, because otherwise the language
follows a CV that is no longer in the box.

The fallback counts letters (`dominantScript`) rather than looking for one (`hasArabic`). A Saudi
applicant's English CV routinely carries an Arabic name, employer or city, and a presence test calls
that document Arabic. In this market that is the common case, not the edge one.

**Deliberately excluded: `/interview-live`'s spoken language.** Its question is read by `/api/tts`
and the answer captured by SpeechRecognition, both keyed on the interface language (`srLang`).
Switching only the text would leave the voice and the transcriber in the other language, which is
worse than the inconsistency it fixes. Its picker fills the CV and the target role and leaves
`uiLang` alone; `ops/mycvs.test.mjs` asserts that, so the omission stays a decision.

**Verification.** `ops/mycvs.test.mjs` — 49 assertions in Node against fake storage, so a failure
names the cause. `ops/mycvs.browser.mjs` — 30 assertions in Chromium across all five pages: the offer
appears, the click fills the boxes, the CV reaches the **request body**, an Arabic CV asks for Arabic
in an English interface, an English CV picked on the Arabic page selects English, and a new tab
offers nothing. A field filled but ignored by the request would pass every visual check and change
nothing about what the model sees, which is the whole point of the item.

### O-8 · superseded by F-18

`/interview`, `/interview-live`, `/linkedin` and both `/optimize` pages each opened on a blank
"paste your resume" box and read none of the CVs this browser already held.

### F-19 · P1 · The hand-off writes a real resume record, and the retired key has no live writer — FIXED *(was O-9)*

`/optimize` held flat strings plus an `OptimizeResult` DTO, its own storage keys, and a one-way
bridge (`handoff.ts`) that wrote `ra_journey_{lang}` — a key the read path considers **retired** and
consults only during a one-shot legacy migration.

**Measured in a browser before anything was changed.** Four findings, none of them visible in the
code alone:

1. **The transport was a one-shot upgrade path.** Every scan sent to the builder consumed
   `migrateLegacy` and left `ra_journey_en_legacy` behind. A migration written to run once per
   (owner, language) for pre-existing drafts was doing duty as the live bridge, so a resume arriving
   from `/optimize` was indistinguishable in storage from a legacy upgrade.
2. **The "you already have work in the builder" confirm never fired.** It asked
   `builderDraftExists(lang)`, which reads the retired key — empty for every user whose work is in
   the live store, which is every user. Driven with three completed builder steps on screen: no
   dialog. A unit test of that function would have passed; it correctly reported what was in the
   store it was asked about, and the defect was *which store it was asked about*.
3. **The user's own CV was silently demoted.** Their record survived — this was never data loss —
   but `/builder` shows one "continue where you left off", and after a hand-off it pointed at the
   scan. An Accountant CV three steps in was nowhere on the screen.
4. **The owner was bypassed.** `writeDraft` writes an unowned key and `migrateLegacy` then attributes
   it to whoever the session resolves to. Every other write in this product carries its owner.

**Fix — the live store, an addressed URL, and a visible choice.**

`sendToBuilder(owner, lang, text, opts)` now calls `writeResume` — the same function the builder's
own autosave calls — and returns `/builder/{resumeId}/target`. There is no bridge left to break, the
write carries its owner, and the URL names the resume rather than leaving the front door to guess
which one the visitor meant.

`resumesInProgress(owner)` replaces `builderDraftExists(lang)` and reads the live index. It returns
the list rather than a boolean, because the point is to be able to **name** what already exists:
"you already have work" is not a question anyone can answer, and "replace *Accountant*" is. The
`window.confirm` is gone — the choice sits on the page, where adding is the default (it cannot lose
anything) and replacing is one tap that says which CV it would replace.

**And the start screen now lists the index.** `resumeStore` has kept a per-owner resume index since
it was written and nothing rendered it: `BuilderStart`, `ContinueDraft` and `BuilderProvider` all
took `listResumes(owner)[0]`. A second resume was a record in storage with no screen able to open
it — survivable while only the builder created resumes, and not survivable once the hand-off started
adding one. Gated on `mayRestore(owner)`, so a lapsed anonymous visit is offered nothing, from the
same function the provider and the landing banner use.

**Plus the CV's language, which the bridge dropped.** `stateFromText` leaves `target.language` at the
schema default of English, so a hand-off of an Arabic document opened an English builder and every
suggestion after that came back English. Both pages now pass the `outLang` the user chose on step 3;
`"both"` resolves to English, the same rule as everywhere else.

**End state on the retired key.** `ra_journey_{lang}` now has **zero live writers** anywhere in
`app/` — asserted by scanning every `.ts`/`.tsx` file rather than three named ones, so a fourth
writer cannot quietly appear. `readDraft` stays, because a chat draft written before this change is
still somebody's CV. One persistence writing, one reading old data, which is what "do not leave both
persistences active" actually asks for.

**Verification.** `ops/handoff.test.mjs` — 46 assertions (was 12) against fake storage.
`ops/handoff.browser.mjs` — 23 assertions in Chromium: the page names the CV in progress, no browser
dialog is used, the retired key is never written, adding leaves the existing record untouched,
replacing creates no second CV and does overwrite the named one, the URL names the resume, the
builder opens the scan, the start screen shows both CVs with two continue buttons, an Arabic document
choice survives, and `/ar/optimize` does all of it too.

Three of that suite's assertions failed on their first run **because of the probe, not the product**:
`addInitScript` re-runs on every navigation and was re-seeding the index over what the hand-off had
just written; an input's value is not part of `innerText`; and `/Radiograph/i` against the whole page
matched `/builder`'s own SEO copy ("the skills offered to a radiographer in Riyadh"), so a list with
one row passed a two-row assertion. Recorded because each is a way a browser test passes or fails for
the wrong reason.

**What is still not unified, and is not this item.** `/optimize` keeps its own `OptimizeResult` DTO
and its own draft keys for the *scan* — the score, the keywords, the rewrite. That is a result
document, not a CV state model, and merging it into `BuilderState` would put model output inside the
confirmed-content store, which the whole suggestion bag exists to prevent. The CV itself now has one
model and one store on both sides of the hand-off, which is what O-9 was about.

### O-9 · superseded by F-19

`/optimize`'s hand-off wrote `ra_journey_{lang}` — a key the read path considers retired — and was
picked up only by the one-shot legacy migration.

### O-10 · P2 · Six declared AI tasks are unreachable

`duties_draft`, `skills_groups`, `summary_variants`, `education_format`, `credentials_hint`,
`languages_hint`, `blueprint_groups` have specs and prompts and no call site. `AiStrip.tsx`,
the generic control they were built for, has zero call sites. `app/lib/flags.ts` is entirely
dead. `draftStore.writeBuilder`/`readBuilder` are dead. `POST /api/resumes` has no client
caller.

**F-19 added one to this list and left it deliberately.** `draftStore.writeDraft` now has no live
caller either — the hand-off was its last one. It is kept rather than deleted because `writeBuilder`
calls it and `ops/draftstore.test.mjs` documents the old record shape, which is what makes a chat
draft written before the current scheme still readable. `ops/handoff.test.mjs` asserts that no file in
`app/` calls it, so it cannot acquire a caller by accident.

**F-23's dead-CSS audit (O-16) added one more.** `AtsMarquee.tsx` — the "ATS systems we beat" logo
strip, styled correctly with `.marquee`/`.marquee-track` and a real `marqueeScroll` keyframe — is
defined, exports a working component, and is imported by nothing. It is not deleted, and neither is
its CSS: unlike the six tasks above, this looks finished and ready to place on the landing page, and
deleting the styling would leave a landmine for whoever wires it in. `ops/deadcss.test.mjs` asserts
it is STILL unimported — if that assertion starts failing, it means someone wired it in, which is
good news the test should be updated to reflect, not a regression to fix.

### F-21 · P1 · The Arabic detector covers Extended-A and both presentation-form blocks — FIXED *(was O-11)*

`PdfExport` used to carry its own `[؀-ۿ]` literal, testing only U+0600–06FF; `cvHeadings.hasArabic`
tested that plus U+0750–077F. Neither covered Arabic Extended-A (U+08A0–08FF) or the two
presentation-form blocks (U+FB50–FDFF, U+FE70–FEFF) that `importCv.ts` itself documents some PDF
producers as emitting — pre-shaped glyphs rather than the standard block. Text in those ranges passed
the text-PDF guard silently and rendered as mojibake with no warning.

F-18/F-20's rewrite of the export path had already closed the first half: `PdfExport` now imports
`pdfRefusesArabic` from `renderPdf.ts`, which reads `hasArabic` from `cvHeadings.ts` — one function,
not two disagreeing literals.

**This closes the second half.** `ARABIC_RANGE` in `cvHeadings.ts` now covers all five blocks. Each
segment was generated from its numeric codepoint boundaries and byte-compared against the literal
before being pasted in — the first draft, transcribed by eye through a chat interface, silently
dropped U+FC00–FD3F from Presentation Forms-A, which is exactly the failure mode a hand-typed Unicode
range invites and the reason the comparison exists.

**Verification.** `ops/cvheadings.test.mjs` — 46 assertions: every block's first, last and three
interior codepoints are detected; the codepoint immediately outside each block is not; the gaps
between blocks are excluded; a real presentation-form string (`"ﺏﺱﻡ"`, shaped بسم) is recognised as
Arabic — the concrete case that used to reach jsPDF as mojibake with no refusal; and the existing
majority-script behaviour (`dominantScript`) is unchanged.

**A wider duplication found, not fixed here.** At least eleven other files carry their own inline
`[؀-ۿ]`-style literal rather than importing `hasArabic`/`dominantScript`:
`ResumeTemplate.tsx` (×2), `r/[slug]/page.tsx`, `optimize/page.tsx`, `api/generate/route.ts`,
`languages.ts`, `resumeLang.ts`, `aiModels.ts`, `translate.ts`, `interviewGuards.ts`, `aiPrompts.ts`.
None of them independently covers Extended-A or the presentation forms, so each is the same latent
gap this item closed, in a different file. Out of scope for this pass — it is a consolidation across
eleven call sites with eleven different surrounding contexts, not a boundary widening — and worth its
own item rather than being rushed alongside one.

### F-20 · P1 · The PDF and Word downloads are rendered on the server — FIXED *(was O-12)*

Every file this product handed out was built in the browser from a `watermark` prop. On `/optimize`
that prop came from `watermarkFromResponse(result)`, and `result` is persisted to `localStorage` and
rehydrated on load — so editing one boolean in devtools produced a clean, unmarked PDF and Word file
with no server call at all. The freemium model was opt-out. F-4 had closed the case where the designed
PDF shipped unmarked *by accident*, and said plainly that it did not make the paywall enforceable.

**Fix — the bytes now come from the server.**

`POST /api/export` renders both files and stamps the mark from `paidRequest(req)`. Three properties
make that enforcement rather than a better suggestion:

1. **The request cannot ask for a clean file.** There is no `watermark` field in the body type, and
   one sent anyway is ignored. Asserted directly: a body carrying `watermark: false`, and another
   carrying `paid: true, hasAccess: true, watermark: 0`, both come back marked.
2. **Patching the page cannot remove a mark stamped before the response left the server.**
3. **It fails closed.** No cookies, an unreadable session, a store that throws — all "not paid".

jsPDF turned out to run fine in Node, including `getTextWidth` and rotated text, which are the two
things the layout depends on. That was measured before anything was designed around it.

**Supporting changes, each of which removes a way for the old hole to come back:**

- `lib/renderPdf.ts` / `lib/renderDocx.ts` — the layouts, extracted from the click handlers. One
  implementation serves the route and the offline fallback, and the fallback passes `watermark: true`
  unconditionally, so a download still works on a train and can never produce a clean file. Extracting
  them also made the layouts testable at all; they were previously unreachable behind a `doc.save()`.
- `PdfExport` / `DocxExport` **no longer take a `watermark` prop.** The hole cannot be reintroduced by
  a caller, because there is nothing to pass. Asserted against the source, including that no page
  passes one.
- `lib/paidRequest.ts` — the same eleven lines existed in `/api/optimize` and `/api/auth/me`, and the
  export route needed them a third time. One server-side answer now, honouring all three routes to
  access: a signed device pass, an account entitlement, and the entitlement cookie — which may only
  ever speak for the address actually signed in, so a copied cookie unlocks nothing.
- Both `/optimize` pages now compose the verdict for what is *left* in the browser:
  `entLoading || shouldShowWatermark(entitlement) || watermarkFromResponse(result)`. OR, so either
  source can ask for a mark and neither can remove one — the fresh server verdict still counts, a
  paying customer who reloads still gets a clean file, and a rehydrated result with an edited flag can
  only ever ADD a mark.

**What is still client-side, stated rather than glossed.**

- **The designed PDF.** html2canvas rasterises a live DOM node, so it cannot be produced without a
  browser; a headless-chromium render route is out of scope. Its verdict now comes from
  `useEntitlement` (a server call) rather than a rehydrated boolean, but a determined user can still
  patch it. The ATS-parseable PDF and the Word file — what an employer actually receives, and the only
  download an Arabic CV gets — are stamped server-side.
- **The `.txt` download**, deliberately. The same text is displayed on the page; anyone can select and
  copy it. Enforcing a mark on it server-side would be theatre.

The route also does NOT expose a GET that reports the verdict, though it easily could: that would be a
second way to ask a question `useEntitlement` already answers from the same cookies and the same store.
`ops/exportgate.mjs` asserts the 405.

**Verification.**

- `ops/exportrender.test.mjs` — 43 assertions in `npm test`: both renderers marked/clean, and
  `paidRequest` against hand-built requests (forged signature, hand-written payload, expired pass, an
  entitlement cookie for another account, junk cookies).
- `ops/exportgate.mjs` — 27 assertions against a running server over real HTTP, reading the **bytes**
  rather than the `X-Watermark` header, because a route lying in its header would pass a header check.
  Includes the paid half: a pass minted with the server's own `ACCESS_SECRET` must produce a clean
  file, because "always watermark" would satisfy every unpaid assertion and break the product.
- `ops/export.browser.mjs` — 14 assertions clicking the real buttons, reading the downloaded file off
  disk, and counting `/api/export` calls — because a button that silently fell into its local fallback
  on every click still downloads a marked file and looks fine.

Run the browser suite BEFORE the gate suite, or restart the server between them: the gate suite
deliberately exhausts the shared per-IP bucket, and the buttons then correctly refuse rather than
download. That cost one confusing 20-second timeout, so the browser suite now captures dialogs and
names the cause instead of failing with "waiting for event download".

**Two things the move itself created, closed in the same pass.**

- **A rate limit.** Rendering on the server turned this into a public POST that lays out an A4 document
  and zips a Word file — a surface the client-side render never had, because it spent the visitor's own
  CPU. 30 per ten minutes per IP via `allowShared`, generous enough that iterating on a CV never sees
  it, with `Retry-After` on the refusal.
- **A 4xx is the server's considered answer and must not be worked around.** The offline fallback
  exists for an unreachable server; using it on a reply would turn every deliberate refusal into a
  silently watermarked file — and the refusal that matters is the 429, where a paying customer
  iterating would have received a marked download with no explanation. So a 4xx is shown to the user
  and only a network failure or a 5xx renders locally.

**Two harness bugs found and recorded, both of which made a test pass for the wrong reason:**

- `docxContainsMark` used `require()` inside an ES module (throws, and the throw was swallowed by the
  catch meant for unreadable zip members) and scanned for the bare string `"PK"` rather than the local
  header signature. Visible symptom: two failures. Invisible one: *"the paid Word file has no footer
  mark" passed vacuously*, because the detector could never find a mark at all. The suite now proves
  the detector can say yes before any negative assertion is trusted.
- `ops/i18n.test.mjs`'s `blockAfter` was comment-blind while its sibling `topKeys` was not, so an
  apostrophe in a comment — "the request's own cookies" — was read as an opening quote and the block
  ran thousands of characters past the copy table. Latent for as long as the over-run happened to stop
  at a convenient brace; one ordinary comment moved the stopping point and it began reporting that
  English was "missing" keys that are in neither table. Fixed, with a fixture asserting a comment
  apostrophe and a comment brace no longer swallow the file.

### O-11 · superseded by F-21

`PdfExport` and `cvHeadings.hasArabic` tested different ranges, and neither covered Arabic Extended-A
or the presentation-form blocks.

### O-12 · superseded by F-20

Files were generated in the browser from a `watermark` flag rehydrated from localStorage, so editing
one boolean produced clean files with no server call.

### O-13 · P2 · `ops/form-smoke.mjs` drives a retired route

The harness targets `/build`, which is now a `permanentRedirect` to `/builder`, and then waits
for copy that the builder start page no longer shows. It fails at its first step. Pre-existing
drift — it is outside `npm test`, so nothing was watching it.

Worth fixing rather than deleting: it is the one harness that runs with `/api/suggest` blocked,
which is what proves the form still works with the AI switched off. That is the product's stated
thesis and nothing else asserts it end to end.

### F-22 · P1 · `/resume-examples` no longer shifts at load — FIXED *(was O-14)*

Measured at 0.2489 CLS — the edge of Google's "poor" threshold — on the page whose entire purpose is
organic search. The Arabic twin shifted a sixth as much (0.0398), which was the clue: something
language-specific in the header area, not the layout itself, since the Arabic hero uses different
markup.

**Cause.** `content-visibility: auto` + `contain-intrinsic-size: auto 500px` on `.t-enter`
(`transitions.css`), applied to the page's own HERO section — content on screen from the first frame.
`content-visibility` exists to skip layout and paint for content that is genuinely off-screen; applied
to content everyone sees immediately, the browser still renders it at the 500px placeholder before it
can measure the real (shorter) content — a chip, a heading, one paragraph — and the collapse from
placeholder to real height IS a layout shift, whether or not anything was actually skipped. The
English page wrapped its hero in `.t-enter`; the Arabic page's hero is plain markup with no
`content-visibility` at all, and its residual 0.0398 traced to its OWN near-top `.t-enter` section
("browse by sector") — the same mechanism, smaller only because that section sits lower and closer to
its natural height.

**Fix.** `.t-no-cv`, a modifier that resets `content-visibility` on an element that keeps `.t-enter`'s
opacity/translate transition — for sections that are inside the initial viewport and therefore have
nothing to defer. Applied to the English hero, the English "browse by sector" section, and the
Arabic equivalent. The per-category card blocks were never `.t-enter` at all; they only *appeared* in
Chrome's shift-source report because they were pushed down by the hero collapsing above them — fixing
the actual source removed their shift too, with no change to those blocks themselves.

| page | CLS before | CLS after |
|---|---|---|
| `/resume-examples` | 0.2489 | **0.0000** |
| `/ar/resume-examples` | 0.0398 | **0.0000** |

**Verification.** `ops/cls.browser.mjs` — 10 assertions against the real `LayoutShift` entries the
browser reports (the same signal Search Console reads), not a CSS-source check: a CSS assertion would
catch a removed `.t-no-cv` class but not a *new* section added above the fold without it, which is how
this actually regresses. Covers both pages named in the original measurement, the three pages already
at zero (to catch a regression elsewhere), and that `.t-no-cv` reports `content-visibility: visible`
in a real browser rather than only in the stylesheet.

### O-14 · superseded by F-22

`/resume-examples` measured a CLS of 0.2489 at load, traced to `content-visibility` applied to an
above-the-fold hero section.

### F-23 · P1 · The root layout no longer forces React's client runtime onto static pages — FIXED *(was O-15)*

Measured with `next start`, 390px viewport, uncompressed script bodies: `/resume-examples` 409–641 KB,
`/resume-examples/registered-nurse` 570–810 KB, `/` 720 KB — ten times the 34–70 KB of HTML they
carry, on server components rendering nothing but headings, lists and links.

**Cause.** `RootShell` — every route's shared layout — rendered `<Analytics />` (`@vercel/analytics/next`)
and `<FunnelBeacon />`, both `"use client"`. A client component anywhere in a page's tree needs React's
client runtime to hydrate — not "more JS", the whole runtime — and this was in the ROOT every route
shares, so all 357 static catalogue pages paid for it.

**A previous attempt was reverted, for two reasons — both now fixed at the root.**

1. *"The inline beacon did not fire, not diagnosed."* Found by reading `@vercel/analytics`'s own
   source rather than guessing: `track()` calls `window.va` with optional chaining and **no
   fallback**. `window.va` is only ever defined by `initQueue()`, which the React `<Analytics />`
   component calls on mount before anything else. Drop `<Analytics />` and replace the beacon with a
   bare script, and the very first `track()` call — the landing event, fired as early as the page can
   run JS — hits `window.va === undefined` and silently no-ops forever. No throw, no console line,
   just an event that never arrived.
2. *"The saving did not reproduce; Turbopack chunk splitting varies between builds."* `ops/jsweight.mjs`
   now runs `next build` N times and measures with a real browser (`waitUntil: "load"`, excluding
   Next's own viewport-prefetch requests, which inflated an early measurement pass here too — a
   catalogue page links to `/optimize`, and `networkidle` was waiting for that prefetch to finish and
   folding a different page's weight into this one's number). Three builds, this fix: **523 KB, 523 KB,
   523 KB** for `/resume-examples/registered-nurse`, **523/523/523** for `/resume-examples`,
   **535/535/535** for `/`. Zero variance — and the remaining 523–535 KB is Next's own App Router
   runtime (deployment ID, scroll restoration, bailout-to-CSR handling — confirmed by reading the chunk
   contents), present on every Next.js page regardless of content. Both catalogue pages now converge to
   the *identical* flat floor, which is the direct evidence the analytics-driven variable cost is gone
   rather than merely smaller.

**Fix.** `<Analytics />` → a plain `defer`red `<script src="/_vercel/insights/script.js">`, preceded by
the same queueing stub `<Analytics />` used to install (`if(!window.va) window.va = …`) so `track()`
calls have somewhere to queue before the real script loads — closing the exact hole the previous
attempt fell into. `<FunnelBeacon />` (root, entry-only usage) → `funnelBootstrapScript()`
(`lib/funnelBootstrap.ts`), an inline script assembled from the SAME classification code
`lib/funnel.ts` already exercises, not a retyped copy. The three tool pages that also need a `step`
(`interview-live`, `/optimize` EN/AR) keep the React `FunnelBeacon` unchanged in their own layouts —
those pages already ship real client JS for the tool itself, so this optimization does not apply to
them, and both mechanisms coexist correctly on the same page (verified: entry stamped once, landing
fires once, the React beacon's own step fires alongside it, from the same entry).

**A second silent-failure mode, found here before it shipped a second time.** The first draft of
`funnelBootstrap.ts` called `.toString()` on `stamp`, `pageFamily`, `pageSlug`, `pageLang` and
`referrerClass` *separately* and reassembled them under their own names. It read correctly out of
plain Node. Built through Next's own minifier and inspected in the **actual served HTML**, it was
broken the same way the original bug was: minified `stamp` called `pageFamily` under a renamed
identifier consistent within the module Next minified, and the reassembled script declared that
helper under the ORIGINAL name — one `stamp`'s compiled body never referred to. The script parsed,
ran, and threw a `ReferenceError` inside the `try/catch` wrapping it. Silently. The exact failure mode
this item exists to fix, reproduced by an early draft of the fix — caught only because the actual
built HTML was read rather than trusted from a Node-only check.

**Fix for that:** `lib/funnel.ts#standaloneEntryStamp` — one function with every helper `stamp` calls
inlined as a local closure, so nothing is left at module scope for a per-function extraction to lose
track of. A minifier's renaming is only ever inconsistent ACROSS independently-extracted functions;
within one function's own body, declaration and call site are always renamed together. This is a
genuine second implementation of `stamp`, which is exactly the duplication the architecture is built
against — so it is not left on trust: `ops/funnel.test.mjs` runs both against every case in its
existing route table crossed with six referrer classes (282 assertions) and requires byte-identical
output. An edit to `pageFamily` not mirrored here fails on the next `npm test`, not months later in a
dashboard where a wrong classification looks exactly like a right one.

**Verification.**

- `ops/funnel.test.mjs` — 282 new assertions (equivalence matrix), on top of the existing classifier
  suite. In `npm test`.
- `ops/funnelbootstrap.browser.mjs` — 18 assertions in Chromium: the entry is stamped correctly from a
  real referrer, `window.vaq` carries exactly the landing event with only the four declared fields, the
  entry stamp works with **every JS chunk blocked** (proving it needs no React runtime at all), a
  second page visited in the same tab does not re-stamp or re-fire, `/optimize` runs the script AND the
  React step-beacon together correctly, and the plain analytics script tag is present.
- `ops/jsweight.mjs` — a reusable tool, not a pass/fail suite: repeats `next build` N times and reports
  the median JS weight per page, specifically so a future measurement here is never a single noisy pair
  again.

**Not a proven cause of the iOS crash.** Still true — the crash causes measured and fixed were GPU-side
(F-7, F-8, F-10), not JavaScript weight. This closes a real ranking-relevant payload problem on its own
terms, on pages whose only purpose is organic search.

### O-15 · superseded by F-23

`RootShell` rendered `<Analytics />` and `<FunnelBeacon />`, both `"use client"`, in the layout every
route shares — putting React's client runtime on all 357 static catalogue pages.

### F-24 · P3 · The genuinely dead CSS is gone; the wrongly-accused CSS was left alone — FIXED *(was O-16)*

Raised as a hypothesis for the iOS crash — "maybe the old design is still running in the
background". Checked directly, and it was not. Measured on the pages that crash, 390px viewport:

| what | `/resume-examples` | `/…/registered-nurse` | `/` |
|---|---|---|---|
| infinite animations | 3 | 6 | 3 |
| …and they are | `bo-pulse`, `bo-breathe`, `bo-spin` — the one orb, three per orb | same, two orbs | same |
| `position: fixed` elements | 1 | 1 | 1 |
| …and it is | `.space-backdrop` | | |
| `will-change` declarations | 0 | 0 | 0 |
| scroll timelines | 0 (after F-10) | 0 | 0 |

`.space-backdrop` was read line by line as part of this. It is one fixed element with five
static layers of tiled radial gradients: no JavaScript, no `filter`, no animation, one paint.
Its own comment records what it replaced — a `<canvas>` cosmos on a rAF loop, a second rAF loop
lerping a light toward the pointer, per-page ambient blocks, `.aurora-bg`, and a grain overlay.
That removal was real; none of it came back.

**The original dead-rule list was wrong, and re-checking it directly is what this closes.** O-16
named `reveal-aurora`, `stage-orb`, `breathe`, `dock`, `float-slow`, `marquee`, `ia-*`,
`improved-banner`, `aurora-burst`, `gold-stamp`, `reveal-pop`, `reveal-rise` as dead — "their class
names appear in no `className` in the codebase." Re-audited from nothing rather than trusted:
`ia-*` is `InterviewerAvatar.tsx`'s whole face, live on `/interview-live`. `marquee` is
`AtsMarquee.tsx` (styled correctly, though the COMPONENT itself is unimported — see O-10).
`gold-stamp` is `AccountClient.tsx` and the payment callback page. `improved-banner`/`reveal-pop`/`reveal-rise`
are `ResultCoaching.tsx`, live on `/optimize`. `aurora-burst` is its own component, live on
`/pay/callback`. The list had been accurate when written; the product grew after it was written and
nothing re-ran the check. Trusting it would have deleted six live controls' animations — the exact
outcome its own closing line warned about, which is why it was filed "left undone on purpose"
instead of shipped on faith.

**What was genuinely dead**, all from the retired full-screen "Advisor THEATER" chat interface and an
old template picker, both superseded earlier this session: `.reveal-aurora`, `.tpl-card` (+
`.is-active`, `.tpl-check` — both compound selectors, unreachable without `.tpl-card`), `.stage-orb`,
`.breathe`, `.dock` (+ `::before`/`::after`, the `--dock-aura-a` custom property, `dock-aura`,
`dock-float`), `.float-slow`, `@keyframes radio-wave`. Zero references anywhere in `app/` —
checked past the traps that make a naive sweep wrong in both directions: `BrandOrb.tsx` builds its
class as `` `bo-${variant}` ``, a template literal, so grepping for the literal string `"bo-button"`
finds nothing and a naive scanner would delete a live orb variant; and a keyframe is referenced from
CSS (`animation: iaFloat …`), not from a `.tsx` file, so scanning only `.tsx`/`.ts` for a keyframe's
name — or worse, a substring match with no word boundary — reported `.breathe` as "alive" because
`InterviewerAvatar.tsx` has "breathes slowly" in a docstring comment.

**111 lines removed, 850 → 739.** `AtsMarquee.tsx`'s CSS was deliberately spared despite the
component itself being unimported — see the new O-10 entry — because deleting styling out from
under a component that looks finished and ready to wire in is how a live control loses its animation
months later, which is exactly the risk this item was filed to avoid in the other direction.

**Verification.** `ops/deadcss.test.mjs` — 36 assertions: every removed selector and keyframe is
confirmed gone; every selector the ORIGINAL list wrongly called dead is confirmed still defined AND
still has a real consumer reachable from a real page (not just a string match — `ResultCoaching`
is checked to actually render from `/optimize`, `AuroraBurst` from `/pay/callback`); the
`bo-${variant}` template-literal trap is asserted explicitly, including that the unstyled `"logo"`
default correctly has no dedicated override; `AtsMarquee` is asserted to still be unimported, so if
that ever starts failing it means someone wired it in — good news the test should be updated to
reflect, not a regression. Confirmed in a browser too: `.ia-face`/`.ia-idle` still animate on
`/interview-live`, `.brand-orb.bo-logo .bo-glow` still runs `bo-pulse` on `/`. `npm run build` and
`ops/motion.test.mjs` (49) both clean after the deletion.

### F-25 · P1 · One shared shell replaces 27 hand-rolled headers, and the navigation graph got the links it was missing — FIXED

The owner's complaint: the product reads as separate tools — Builder, Optimizer, Journey, ATS,
LinkedIn, Interview — with no one clear journey, inconsistent navigation, and old UI surviving
behind the new design. A full route/navigation/shared-state audit (three passes, this session)
found the *code* duplication mostly already gone — Journey is a retired redirect, the Arabic and
English builders already share one engine, `lib/myCvs.ts` already threads five tool pages together
— and the actual damage was navigation and chrome: every page hand-rolled its own `<nav
className="ps-header">`, a complete, already-correct shared shell (`PageShell.tsx`) sat unused,
the homepage linked only `/builder` so `/optimize` had no path in from home despite being a real,
separately-marketed tool, `/interview-live` had zero inbound links anywhere in the codebase, and
the "go check your resume" call to action read five different ways depending which page it was on.

**Fix, in five parts:**

1. **`PageShell.tsx` adopted, not rebuilt.** Extended with `langToggle` (+ an `onLangToggle` hook
   for `/optimize`, the one page that must carry its draft across the switch), and an `authNav`
   slot. `authNav` takes a **node**, not a boolean — `PageShell` itself has no `"use client"`
   directive and is rendered by ~350 static SEO pages; a bare `import AuthNav` at its top would
   have put that `"use client"` component's chunk in every one of those pages' client reference
   manifest whether they render it or not. Measured directly (see the `jsweight.mjs` note below):
   passing `<AuthNav ar={ar} />` from the ~10 pages that actually want it, instead of an internal
   `authNav && <AuthNav/>`, keeps that cost off the other 340+.
   Then migrated: the SEO-hub pages first (`resume-examples`, `cover-letter-examples`,
   `resume-skills`, `resume-templates`, `templates`, sector pages via `SectorPage.tsx`'s shared
   `Chrome`, the ATS-checker trio via `SeoLanding.tsx`), then the product surface (`/optimize`,
   `/pricing`, `/interview`, `/linkedin`, `/interview-live`, `/account`). `/login` was deliberately
   **not** migrated — it already carries its own documented reason for a minimal, headerless,
   single-card layout ("no cinema"), and wrapping it in the standard header/CTA chrome would work
   against that, not fix anything.
   A new `bleed` option lets landing-style pages built from full-width, alternating-background
   sections (`SeoLanding`, `SectorPage`) skip `PageShell`'s own padded content box, so their
   sections still reach the viewport edge the way they were designed to.
2. **One CTA.** `lib/brand.ts` gained `NAV_CTA`/`navCta()` — the audit found five live strings for
   "go check your resume against a job" (`Free scan →`, `Scan my resume`, `Resume optimizer →`,
   `افحص سيرتي`, `فحص مجاني ←`), all pointing at the same `/optimize`. Every migrated page's header
   CTA now reads from the one constant.
3. **`HubLinks` Arabic parity.** Its Arabic set omitted the ATS-checker trio and `/linkedin`
   entirely (no Arabic page exists for the trio, so those stay out — an honest gap, not one to
   paper over), and its `"Templates"`/`"Pricing"` entries linked `/templates`/`/pricing` — the
   ENGLISH routes, no `/ar` prefix — dropping an Arabic-reading visitor into the English UI from a
   link on an Arabic page. Fixed to `/ar/templates`/`/ar/pricing`, and added `/ar/linkedin` and a
   new `/ar/interview-live` redirect (mirroring `/ar/interview`'s existing `?lang=ar` pattern —
   `/interview-live` has one address and switches language in the browser, so this is a
   convenience redirect, not a second URL for its content).
4. **Homepage gets a fourth, honestly distinct door.** Not a replacement for the existing "I
   already have a CV — improve it" card, which deliberately feeds a file into the *builder's* own
   data model (see that card's own comment in `Landing.tsx` — one preview, one save, one download).
   The new card is different: "Check a resume against a job posting" → `/optimize`, the actual
   ATS-scoring tool every SEO page already markets, which the homepage never once mentioned.
5. **`/account` renamed Career Dashboard.** Copy/heading only — `AccountClient.tsx` already had a
   working job-application tracker (add/list/status/delete, `localdata.ts`-backed) that an earlier
   pass of this audit had assumed didn't exist; it does, so nothing needed building, only naming.

**`/resume-templates/[style]`'s "Use this template" button was silently broken**, found while
migrating its chrome. It linked `/builder?template=<slug>`, and `BuilderStart.tsx` only recognises
slugs from `templateCatalog.ts` — a completely different catalogue than `lib/templates.ts`, the one
this page reads from. Only `executive` and `minimal` happened to share a slug name between the two;
every other style (`ats`, `modern`, `professional`, `creative`, `simple`, `two-column`, `jadarat`)
silently landed on the builder's default template instead of the one the visitor clicked. Fixed
with an explicit `TEMPLATE_CATALOG_SLUG` mapping in `lib/templates.ts`.

**Verification.** `npx tsc --noEmit` and `npm run build` clean (430 pages, same shape as before —
no product-surface page count change). `ops/jsweight.mjs` / a direct `<script src>` byte count on
`/resume-examples` was compared against the SAME measurement taken from a `git stash`-reverted
build of the identical page — byte-for-byte identical (640 KB in both), which is what proved the
`authNav`-as-node fix mattered defensively but was not, in fact, fixing a regression this pass
introduced; the 640 KB figure predates this work and is a separate, pre-existing item (this
doc's `ops/jsweight.mjs` note elsewhere cites ~109 KB — that number is stale relative to the
current build and is worth re-measuring on its own, not as part of this item).

### F-26 · P2 · `/optimize`'s English and Arabic implementations merged into one component — FIXED *(was O-17)*

F-25's chrome migration gave both `/optimize` and `/ar/optimize` the same shared header, footer,
and sign-in control, but left the actual page logic as two separately-coded ~1,000/~700-line
files — deferred because, unlike `/interview` and `/linkedin` (~250-line files with `{ar ? x : y}`
conditionals already threaded through every string), the English file had **zero** such
conditionals: a from-scratch implementation, not a mirror waiting to be combined. This is also the
paid conversion path — upload, AI scan, watermarking, Paylink checkout — so the merge was done
carefully rather than blind.

**What comparing the two files line by line actually found.** The Arabic file was missing real
features, not deliberately omitting them: the "Full analysis" tab (missing/present keyword cards,
skills-to-highlight, the improvements breakdown), the upload-extraction preview ("here's what we
read — check it"), the sub-metric score breakdown, "email my results", and importing a job posting
from a URL. All five are now in both languages.

The English file had a real bug the Arabic one had already fixed: `handleFile` set `resume` to the
full extracted text with no length check — the textarea's `maxLength={8000}` only limits typing,
not a value set programmatically — so a long extracted resume silently exceeded 8,000 characters
with nothing but an orange counter to show for it. Ported the Arabic file's truncate-with-a-visible-
warning behavior to both.

The English file never sent `uiLang` to `/api/optimize`; the Arabic one always sent `"ar"`. The
route uses `uiLang` for exactly one thing — which language the ANALYSIS/COACHING prose comes back
in, independent of `outLang` (the rewritten resume's own language) — so an English-UI visitor who
pasted an Arabic resume got Arabic analysis text with nothing explaining why. Same class of bug as
F-14 through F-18: the language someone is READING should never be guessed from what they pasted.
Sent explicitly now, both languages.

Kept deliberately asymmetric, not unified: the non-streaming error branch shows the server's own
`data.error` text to an English reader (already in English) but a fixed, friendly Arabic message to
an Arabic one — the Arabic file's own explicit fix against leaking raw English server text into an
Arabic UI, not an accident.

**Two routes stayed two routes.** Unlike `/interview` and `/linkedin`, `/ar/optimize` was not
collapsed into a redirect. Its `layout.tsx` wraps the tool in a substantial, uniquely-Arabic SEO
body — real prose, steps, an FAQ, not a translation of the English layout's — that a redirect would
have orphaned (the redirect fires before that content ever renders). Both `/optimize` and
`/ar/optimize` remain real pages, each still wrapped by its own existing layout, both rendering one
shared component (`app/components/tools/OptimizeTool.tsx`) with a `defaultAr` flag saying which
route it is. `defaultAr`, not the `useLang()` hook `/interview`/`/linkedin` use, decides the
language on first paint — `useLang()` also consults a stored device preference, which is wrong
here: a visitor who reaches `/ar/optimize` must see Arabic regardless of what some earlier,
unrelated page left in `localStorage`. A `?lang=` query param can still override after mount.

**The language switch got simpler anyway.** The two old routes had to hand off a draft to each
other before navigating — write the in-progress `resume`/`jobDescription`/`mode` under the OTHER
route's storage key, then change `location`. That whole dance existed only because switching
language meant switching to a differently-mounted component with different React state. Now both
routes render the same component and read/write the same storage keys (`ra_optimize_draft`/
`ra_optimize_result`, with a one-time fallback to the legacy `ra_ar_optimize_*` keys for a draft
written before this shipped), so switching remounts fresh and finds the draft already there —
nothing left to write before navigating. Verified in a browser: typed text on `/optimize` survives
a real click through the header's language toggle to `/ar/optimize`, confirmed via `localStorage`
inspection, not just visually.

**Verification.** `npx tsc --noEmit`, `npm test` (all suites, including `ops/mycvs.test.mjs`,
`ops/language.test.mjs`, `ops/exportrender.test.mjs`, and `ops/deadcss.test.mjs`, each updated to
check `OptimizeTool.tsx` instead of the two now-thin page wrappers), and `npm run build` all clean.
Confirmed in a real browser (not just reasoned about): `/optimize` renders `dir="ltr"` with its
English SEO body intact; `/ar/optimize` renders `dir="rtl"` with its Arabic SEO body intact (the
thing this whole approach exists to protect); the header toggle navigates correctly in both
directions; a draft typed in one language is present after switching to the other, with no
hand-off code involved.

### F-27 · P2 · `/terms` and `/privacy` split into real English and Arabic pages — FIXED

Filed from the plan as "translate `/terms`/`/privacy` to Arabic" — checked before doing that, and
the premise was backwards. Both pages were **already Arabic**: `dir="rtl" lang="ar"`, full Arabic
legal text, at English-labelled URLs (`/terms`, `/privacy`, no `/ar` prefix), with a condensed
"English summary" card bolted onto the bottom. An English-reading visitor landing on `/terms` got
a page of Arabic legalese and a bullet-point summary, not an English document. The actual gap ran
opposite to what the plan assumed.

**Fix.** `/ar/terms` and `/ar/privacy` are new routes carrying the original, unedited Arabic text —
now migrated onto `PageShell` and given the same `alternates.languages` hreflang pattern as every
other bilingual pair on the site. `/terms` and `/privacy` were rewritten from scratch as full
English documents — same section order, same policy substance (pricing figures pulled from
`lib/plans.ts` exactly as the Arabic page does, same 7-day refund window, same PDPL rights section)
— not a translation-shrunk-to-bullets summary. Every place in the app that linked `/privacy` or
`/terms` unconditionally (`AccountClient.tsx`, `OptimizeTool.tsx` ×2, `interview-live/page.tsx`,
`Landing.tsx`'s Arabic footer) now picks the language-correct URL; `sitemap.ts` gained the two new
routes.

**This is AI-translated/authored legal text and has not had human legal review.** Both new pages
say the same thing as the pre-existing, presumably-reviewed Arabic original — same numbers, same
policy — but a bilingual legal or compliance read before this is relied on as the site's actual
terms is still owed, same as any machine-drafted legal copy.

**Verification.** `npx tsc --noEmit`, `npm test`, `npm run build` clean; all four routes return 200.
Confirmed in a browser: `/terms` and `/privacy` render `dir="ltr"` with full English prose (375 and
430 words respectively, not a summary); `/ar/terms` and `/ar/privacy` render `dir="rtl"` with the
original Arabic text intact; the header language toggle navigates correctly between each pair.

### F-28 · P0/P2 · `master-implementation-checklist.md` had gone stale, and three real gaps in it — FIXED/PARTIAL

Re-auditing the P0-P4 checklist against the actual code turned up two kinds of drift: rows the
checklist under-claimed, and rows it over-claimed. Neither was safe to leave as-is — a status doc a
reader can't trust is worse than no status doc.

**P0-3/P0-6, server-side CV persistence — the checklist was wrong, not the code.** It read "Not yet
wired into `BuilderProvider`", but `BuilderProvider.tsx` has called `useServerSync` since `b59dd89`,
committed well before this pass and unrelated to it. All 35 `ops/resumeserver.test.mjs` assertions
pass; both rows corrected to `DONE`.

**P2-1 (job description → tailored CV) and P3-2/P3-3/P3-5 (interview prep, LinkedIn, resume health)
— same pattern, four more rows.** Each was left `PARTIAL` citing a fix (F-18, or the feature's own
existence) as if it were the residual gap. It wasn't: `/optimize`'s `mode: "target"` already
produces a fully rewritten, auto-saved CV from a job description; `/interview`, `/interview-live`
and `/linkedin` are feature-complete and CV-aware; `reviewChecks.ts`'s 5-dimension score is rendered
twice over (`ReviewSection.tsx` live in the builder, `AccountClient.tsx` persisted per resume). All
five corrected to `DONE`. See the checklist for file:line evidence per row.

**P2-2, duplicate and tailor — an actual gap, now closed.** `resumeServer.ts`'s
`duplicateServerResume` and `POST /api/resume` existed with zero client callers — a primitive with
no door. Added to `/builder`'s start screen (`BuilderStart.tsx`): each saved CV gets a "Duplicate →
tailor for a job" action that clones the local record under a fresh id (title suffixed
"(copy)"/"(نسخة)") and lands on the target step. The clone reaches the server through the existing
mirror, not a direct call to the duplicate endpoint — one write path stays one write path.

**P4-2, reviewed occupation pages — the real content gap, given tooling instead of content.** The
357 SEO catalogue pages assert salary/demand/certification claims with zero provenance tracking,
unlike `countryRules.ts`'s credential rules (which at least carry `status: "encoded"`). Building
`app/lib/jobsVerification.ts` + `ops/verify-jobs.mjs` — the `verify-rules.mjs` pattern applied to
the salary line specifically, the highest-risk unsourced figure — gives this the same bookkeeping:
111 entries (50 EN + 61 AR), every one starting honestly `unverified`, a recorded verdict
auto-invalidated if the salary text is later edited. `ops/jobsverification.test.mjs`, 11 assertions.
**This does not perform the review** — a person still has to check ~111 figures against real market
data — it makes that review trackable, which it was not before.

**P2-3, Saudi occupation knowledge base — confirmed as a real, larger, and deliberately NOT
attempted gap.** Only 6 of 29 resolvable occupations have a `RolePack`; `countryRules.ts` covers
Saudi Arabia only despite the lookup already supporting 9 other markets. Closing this is
data-entry-shaped but not data-entry-*risk*: each pack asserts specific professional duties and
credentials as fact, for a live product read by real job seekers, and this codebase already treats
that category of claim carefully everywhere else (`DRAFTING_DOCTRINE`'s ban on invented numbers,
`countryRules.ts`'s own encoded/verified split, F-27's "not human-reviewed" flag on the legal
pages). Mass-authoring 23 new occupation packs from general knowledge, unsourced, was judged the
same risk as those and was not done blind in this pass. Left `PARTIAL`, correctly described.

**P3-4 (career plan) and P4-3 (referral system) are untouched, on purpose.** Both are one-line
checklist entries with no defined scope, and P4-3 additionally touches money mechanics on a live
payment-enabled product. Neither was attempted — inventing scope for either would be a new feature
decided unilaterally, not a gap closed.

**Verification.** `npx tsc --noEmit`, `npm test` (including the new `ops/jobsverification.test.mjs`,
now registered in the `test` script), `npm run build` all clean.

### F-29 · P0 · `/ar/interview` and `/ar/linkedin` looped forever — FIXED

Found while finally writing the Playwright cross-page nav/CTA consistency pass the IA-redesign
plan's own Verification section asked for and never got (see below) — a real audit against the
plan surfaced two things it committed to that weren't actually true yet.

**The redirect loop.** `proxy.ts`'s `AR_TWINS` list 308-redirects `?lang=ar` on a matched path to
its `/ar/*` twin, so `/interview?lang=ar` → `/ar/interview`. But `/interview` and `/linkedin` were
in that list despite having no real `/ar/*` PAGE — `app/(ar)/ar/interview/page.tsx` and its
`linkedin` twin are one-line stubs whose only job is `redirect("/interview?lang=ar")`. Put the two
together: `/ar/interview` (a direct hit, from `HubLinks`' own Arabic link) → stub redirects to
`/interview?lang=ar` → proxy matches the rule and redirects back to `/ar/interview` → forever. A
visitor clicking "تحضير المقابلة" or "محسّن لينكدإن" from the Arabic nav got
`ERR_TOO_MANY_REDIRECTS`, not the tool. Fixed by removing both from `AR_TWINS` — they have nothing
for the canonicalization to canonicalize TO, so leaving `?lang=ar` alone and letting `useLang()`
read it directly is correct, not a gap. Confirmed with `curl -sL -w '%{num_redirects}'`: 1 redirect
each, not a loop, on a freshly booted server.

**The missing verification pass.** The IA-redesign plan's own Verification section asked for "a
Playwright pass comparing nav markup/labels across a sample of pages before/after" — never written.
Added `ops/navconsistency.browser.mjs`: loads ~25 pages across the migrated surfaces and asserts
every one renders `PageShell`'s shared header structure, the right-language brand link, and — where
one is expected — the exact `NAV_CTA` label/href rather than a page's own string. It is what caught
two smaller, real drifts from the plan while being built:

  - `SectorPage.tsx` had its own hardcoded `cta`/`ctaHref` (identical text to `NAV_CTA`, but a
    second place it was defined) instead of calling `navCta()` — fixed, now imports and uses it.
  - `HubLinks`' Arabic set was missing the ATS-checker trio entirely, on the reasoning that none of
    the three has an Arabic page to link to. That left an Arabic-reading visitor with literally no
    path to three real tools — worse than a clearly-labelled link to the English page, which is what
    every other bilingual site does for an unlocalised resource. Added, labelled "(EN)".

Also, while it was open: the builder's export step (`DesignSection.tsx`) linked only to
`/interview`, not `/interview-live` — the plan's "one entry, two depths" chooser now shows both.

**Getting the test itself right took several dead ends worth recording, because each one produced
a plausible-looking false failure:**
  - `next dev` compiles a route on its first hit, not at boot — a cold hit routinely exceeded a
    30–45s navigation timeout while the same route's second hit was instant. Fixed with an explicit
    warm-up pass before any assertion runs.
  - `HubLinks` renders on most sampled pages and the App Router prefetches its links by default —
    over 60 unrequested background `GET`s to a single route were measured in one run, contending
    with `next dev`'s single compile queue against the navigations the test actually asked for.
    Fixed by aborting anything carrying Next's prefetch header for the test's browser context.
  - `useLang()` (used by `/interview`/`/linkedin`) falls back to a stored `localStorage` preference
    when no `?lang=` is present — correct for a real visitor, but this suite drives one shared tab
    through dozens of URLs, so an earlier `?lang=ar` hit polluted a later plain-path assertion.
    Fixed by clearing storage before every navigation.
  - Those same two pages are client components: `useLang()`'s `useSyncExternalStore` hook renders
    the SSR-safe English default on first paint and corrects to the query param via an effect after
    hydration — by design, to avoid a hydration mismatch. `domcontentloaded` could catch that one
    JS tick before the correction. Fixed by polling for the brand link to settle instead of a fixed
    delay.
  - None of the above is a repo problem: a `next dev` instance run through ~10 heavy Playwright
    cycles in this session hit its own memory threshold and auto-restarted mid-request, producing
    real (if transient) 404s. Confirmed via the dev server's own log line and a clean rerun against
    a freshly started instance, which passed 98/98.

**Verification.** `npx tsc --noEmit`, `npm test`, `npm run build` clean. `curl -sL` confirms the
redirect chain resolves in one hop for both routes. `node ops/navconsistency.browser.mjs` passed
98/98 against a freshly started dev server.

### F-30 · P2 · The homepage still read as a CV template tool, not a career assistant — FIXED

The order's own Phase 2 named the required change directly: replace the "Build a CV" framing with
"Get hired faster with an AI career assistant built for Saudi Arabia" — and required the homepage
to communicate all six capabilities (CV, job match, ATS check, interview prep, application
tracking, career readiness), not just the builder. Checked against the live page rather than
assumed: the `<h1>` still read *"You provide the facts. AI writes the professional CV."* — the
pre-order copy, unchanged — and nothing on the page named the other five capabilities at all; a
visitor could only infer them from footer links.

**Fix.** `Landing.tsx`'s headline and lede now use the order's own wording (EN/AR, both exact).
Added a new section between the four hero doors and "How it works" — six cards, each a real link
to the page that capability actually lives on (`/builder`, `/optimize` ×2, `/interview`,
`/account` ×2), not a claim with nothing behind it. `(en)/page.tsx` and `(ar)/ar/page.tsx`'s
`<title>`/`description`/OpenGraph/Twitter metadata carry the same repositioning — the old copy
called the product "AI CV Builder"; a title tag is part of "the message" the order asked to
change, not just on-page text.

**Verification.** `npx tsc --noEmit`, `npm test`, `npm run build` clean. Confirmed against a
running dev server with `curl`: the new `<title>`, `<h1>`, and the six-capability section all
render server-side (no client JS needed) on both `/` and `/ar`.

### F-31 · P2 · Job Description → Tailored CV: the three missing inputs and the three-group split — FIXED

The order's Phase 3 named five concrete gaps against `/optimize`'s existing target-a-job mode: no
JD file upload, no employer-name field, no target-country field, and the requirement comparison
was two lists (missing/present keywords) plus an unrelated "skills gap" list, not the three named
groups — *supported and already included*, *supported but missing from the CV*, *not supported by
the candidate's evidence*.

**File upload.** `/api/extract` was already a generic PDF/DOCX/TXT-to-text endpoint — nothing
resume-specific in its implementation, despite its docstring. Reused as-is for job postings: a new
`handleJdFile` in `OptimizeTool.tsx` posts to the same route and fills `jobDescription`, no backend
change needed.

**Employer + target country.** Added as two optional text inputs in step 2. Folded into the prompt
context server-side (`app/api/optimize/route.ts`'s `jdWithContext`) rather than given their own
prompt parameter — an employer name doesn't add a requirement to extract, and a target country is
exactly what the existing extraction step already reads from the posting text; there was nothing
for a second code path to do with either except tell the model who's asking.

**The three-group split.** Checked before assuming a new AI field was needed: `PRESENT` (keywords
genuinely present), `MISSING` (keywords absent), and `GAPS` (skills the candidate truly lacks)
already map onto the three required groups almost exactly — `GAPS` *was* "not supported by
evidence," just not labelled that way anywhere the user could see. Sharpened the prompt's own
definitions of `MISSING` (a wording gap — the candidate plausibly has this, just didn't use the
job's term) versus `GAPS` (zero evidence in the resume at all, never to be invented into the
rewrite) so the split is real rather than incidental, and relabelled all three cards in the UI to
the order's own group names, each with a one-line explanation of what it means. No new AI call, no
new schema field — the three groups the feature needed were already being computed and just never
named as what they were.

**Verification.** `npx tsc --noEmit`, `npm test` (including `ops/language.test.mjs`'s static guard
on the Anthropic call site, updated for the renamed `jdWithContext` variable), `npm run build`
clean. A throwaway Playwright script (not committed — this environment has no Anthropic/NVIDIA
credential to run a real scan against) confirmed the JD-upload control, employer field, and
target-country field all render and hold input correctly in step 2 of the wizard.

### F-32 · P2 · Duplicate and tailor: the metadata the order asked for — FIXED

`BuilderStart.tsx` already had a working "Duplicate → tailor for a job" action (P2-2, this session)
— it clones a saved resume under a fresh id and lands on the target step. What it did not do was
store the metadata the order names: source resume id, target employer, target job, job description,
match score, created date, application status.

**Checked before adding a new field for each one.** Four of the seven already exist and are exactly
what the order is asking for, under names this codebase already uses: target employer is
`target.employer`, target job is `target.title`, job description is `target.jobAdText`, match score
is `snapshot.matchScore`. Duplicating those into a second location would only create two places that
can disagree about the same fact — and they get filled in naturally, because the duplicate flow
already lands the user on the target-job step to fill in the new job's own details.

**What genuinely didn't exist:** which resume a tailored copy came from, when the copy was made, and
whether an application went out for it — none of those are a property of the CV's content, so none
of them belonged in `profile` or `target`. Added `BuilderState.tailoredFrom?: { sourceResumeId,
tailoredAt, applicationStatus }` (`builderDoc.ts`) — optional, so every existing stored resume loads
unchanged, no migration needed. `applicationStatus` reuses `localdata.ts`'s job-tracker vocabulary
(`saved`/`applied`/`interview`/`offer`/`rejected`) rather than inventing a second one.

**Wired in:** `duplicate()` stamps `sourceResumeId`/`tailoredAt` at clone time. The `/builder` start
screen's resume list now reads `tailoredFrom` for every row (free — it already read each record's
full state to compute step progress) and shows a "Tailored from *X*" badge plus an inline status
selector on any tailored copy; changing the status patches just that field back into storage.

**Verification.** `npx tsc --noEmit`, `npm test`, `npm run build` all clean. Two of `ops/handoff.
test.mjs`'s static source-regex guards needed updating for the refactored (not behaviourally
changed) `listResumes(owner).map(...)` call site — confirmed the guard's actual property (every
resume in the index is listed, not just the first) still holds before loosening the regex, rather
than just making the text match. A live browser click-through of the duplicate → badge → status
→ reload-persists path was attempted but not completed — `next dev` hung compiling `/builder` in
this sandbox for several minutes with no error in its own log, after many heavy Playwright cycles
earlier in this session (the same class of dev-server resource pressure F-29 documents, not a code
defect: `npm run build`, the production compiler, succeeded cleanly on the same code moments
earlier). Relying on the clean production build, typecheck, and full test suite for this pass;
flagged here rather than silently claimed as browser-verified.

### F-33 · P2 · Interview preparation: STAR builder, weak-answer feedback, gap questions — FIXED

`/interview` already generated 8 questions with model answers; the order named three things it
did not have: a STAR answer builder, feedback on the candidate's OWN (weak) answer, and questions
that specifically probe missing evidence, surfaced as their own thing rather than folded into
generic "red flags."

**The gap questions were already being generated, just not labelled.** The prompt already asked
for "2 about gaps in their background" as part of the 8 — it just never told the caller WHICH two.
Added a `category: "behavioral" | "technical" | "gap"` field per question (`/api/tools`'s
`interview` prompt and its response normalizer), and the page now groups questions under three
headings instead of one flat list. The "gap" group IS the missing-evidence questions the order
asked for; no second generation pass needed.

**STAR builder.** Four fields — Situation, Task, Action, Result — client-side only, assembled into
one paragraph. Nothing here calls the model; it exists so the candidate has somewhere to write
their OWN answer before asking for feedback on it, which is the next piece.

**Weak-answer feedback.** New `interview-feedback` mode on the SAME `/api/tools` endpoint the
questions themselves use — same retry loop, same JSON-repair, same rate limiter, so this is not a
new subsystem, just a new prompt. Takes the question + the candidate's own STAR-assembled answer,
returns one genuine strength, 2-4 specific weaknesses, and — the honesty-critical field —
`missingEvidence`: claims that would land better with a specific example, described as what kind
of detail is missing, never invented for the candidate. A `revisedOpening` line is built only from
facts already present in the candidate's own answer or resume, matching the same no-fabrication
contract every other AI surface in this product already enforces.

**Verification.** `npx tsc --noEmit`, `npm test`, `npm run build` all clean. Confirmed in a real
browser against a correctly-started dev server (the earlier F-32 entry's hang turned out to be a
stale process still bound to the port from an earlier session, not a code issue — `fuser -k
3141/tcp` then a clean restart loaded normally) that the form renders with no real console errors
(the only "errors" were `/_vercel/insights/script.js` 404s, expected in local dev and already
filtered by this project's own test suites, e.g. `form-smoke.mjs`). The generation and feedback
calls themselves need `NVIDIA_API_KEY`, which this environment does not have — not live-verified
against the model, same constraint as every other AI-dependent feature this session.

### F-34 · P2 · LinkedIn improvement: headline options, experience descriptions, keyword suggestions — FIXED

`/linkedin` already generated one headline, one About section, a skills list, and tips — and
already supported copying section-by-section (the order's "allow copying section by section" line
was already satisfied). The order named three things the response shape didn't have: **headline
options** (plural), **experience descriptions** (per-role LinkedIn Experience-section rewrites),
and **profile keyword suggestions** as a thing distinct from the skills list.

Changed the `linkedin` prompt in `/api/tools` to return `headlineOptions` (3 differently-angled
headlines instead of 1), `experience` (an array of `{role, description}`, one entry per role found
in the source text, built only from what that role's own text says), and `keywords` (8-12 search
terms a recruiter would type, explicitly described in the prompt as distinct from `skills` — these
are for weaving into text over time, not a section to paste as-is). Kept `about`, `skills`, `tips`
unchanged. The prompt keeps the same no-fabrication line every AI surface in this product carries:
never invent an employer, role, date, or achievement not stated in the source.

Updated both remaining old-schema references in `/api/tools`'s handler: the content-validation
branch (was checking a `headline` singular field that no longer exists — now checks
`headlineOptions.length || about`) and the final response-normalizer (now builds `headlineOptions`,
`experience`, and `keywords` alongside the existing fields, with `experience` defensively
coerced the same way `interview`'s `questions` array already is).

`/linkedin`'s page component (shared by both `/linkedin` and `/ar/linkedin` via `useLang()` — no
Arabic-specific file to duplicate the change into) gained: a "Headline options" card listing all
three, each individually copyable; an "Experience descriptions" card with one sub-card per role,
each individually copyable; and a "Profile keyword suggestions" card, separate from the existing
"Skills to list" card, with its own copy button and a one-line explanation of how keywords differ
from skills. The existing About/Skills/Tips cards and their copy buttons are unchanged.

**Verification.** `npx tsc --noEmit`, `npm test`, `npm run build` all clean (`/linkedin` compiles).
Confirmed in a real browser against a correctly-started dev server (`fuser -k 3141/tcp` before
start, waited for the server's own `✓ Ready in` line) that the form renders its profile textarea,
target-role input, and submit button with no real console errors (only the expected local-dev
`/_vercel/insights/script.js` 404). The actual generation call needs `NVIDIA_API_KEY`, which this
environment does not have — not live-verified against the model, same constraint as every other
AI-dependent feature this session.

### F-35 · P3 · Career plan: compare current vs. target role — FIXED

This checklist entry (P3-4) was previously left honestly `TODO` because the order's own text at the
time was a single undefined line. The order text was re-read in full for this pass and it names a
concrete feature: the user picks a current role, a target role, a country, and a timeline; the
system compares the two roles and returns transferable skills, missing skills, missing credentials,
recommended experience, suggested learning areas, CV changes, and interview preparation areas — and
must never recommend a specific paid course, bootcamp, or platform by name.

Built as a new page, `/career-plan` (English UI, shared with Arabic via `useLang()` — same pattern
as `/linkedin` and `/interview`, with a one-line `/ar/career-plan` redirect stub, deliberately left
out of `proxy.ts`'s `AR_TWINS` list for the exact reason documented there for `/interview` and
`/linkedin`: a stub-only Arabic route in that list produces the F-29 infinite-redirect loop), and a
new `career-plan` mode on the existing `/api/tools` endpoint — reusing its retry loop, JSON
extraction/repair, rate limiter, and per-mode validation/normalize pattern rather than standing up a
new subsystem for a seventh AI surface.

**Inputs, not a resume.** Unlike `/linkedin` and `/interview`, this tool has no resume/profile text
to analyze — its two required fields are role names. The shared endpoint's generic validation
(`inputA` ≥ 50 chars, meant for pasted resume text) would reject a short role name, so `career-plan`
gets its own floor (10 chars) and its own error copy, the same way `interview-feedback` already got
its own error copy without a new endpoint.

**The no-paid-course rule is enforced in the prompt itself**, not left to hope: "Never recommend a
specific paid course, bootcamp, or training platform by name — describe the skill or credential area
only, never a vendor," directly implementing the order's "Do not recommend paid courses unless a
verified integration exists" line (no such integration exists in this codebase, so the safe default
is not naming any). The same no-fabrication line every AI surface here carries also applies: base
every item on the stated roles, never invent employers, dates, or achievements.

`HubLinks` (English and Arabic sets) gained a "Career plan" / "خطة مسيرتك المهنية" entry so the SEO
hub pages that already cross-link every other tool now link to this one too.

**Verification.** `npx tsc --noEmit`, `npm test` (48 suites), `npm run build` all clean — both
`/career-plan` and `/ar/career-plan` compile as static routes in the production build. Browser
verification was attempted against a freshly restarted dev server (`fuser -k 3141/tcp` first,
confirmed `✓ Ready in 486ms` in the server's own log), but the route's first Turbopack dev-compile
did not finish within several minutes even with the port pre-cleared — unlike F-32, where a stale
process on the port turned out to be the whole explanation. The root cause here was not identified;
it may be the same class of sandbox resource pressure noted before, or something specific to this
route, and that distinction was not resolved before this pass ended. Since `npm run build` compiled
the exact same code cleanly (both routes, no errors) moments before and after the dev-server attempt,
this is being shipped on typecheck + test + production-build verification, with the browser check
honestly recorded as inconclusive rather than claimed. The generation call itself needs
`NVIDIA_API_KEY`, which this environment does not have — not live-verified against the model, same
constraint as every other AI-dependent feature this session.

### F-36 · P4 · SEO free tools: two new tools built, seven audited and scoped — PARTIAL

The order names exactly 9 tools: ATS CV Checker, Job Description Keyword Extractor, Professional
Summary Generator, Experience Bullet Generator, Arabic CV Error Checker, Resume Length Checker, Job
Match Checker, Arabic to English CV Translator, PDF Text Readability Checker — each required to give
real value before registration, have a unique URL, have real Arabic AND English landing pages, link
to the builder, keep CV content out of URLs/analytics, and use noindex on private result pages.

**A research pass audited all 9 against the existing codebase first**, per this session's standing
rule against building a second copy of something that already exists under a different name. Result:
three tools (Professional Summary Generator, Experience Bullet Generator, Arabic→English CV
Translator) already have fully-built, production-hardened engines (`/api/suggest`'s `summary`/
`duties`/`variants` kinds; `/api/translate`'s 395-line bidirectional, glossary-first, fact-invariance
-checked engine) — but every one is trapped inside another flow (the builder's per-field AI-suggest
UI, the builder's "Create English version" action) with no standalone indexable page. Two tools (ATS
CV Checker, Job Match Checker) are the same underlying capability (`/api/optimize`'s real match
score) already positioned as separate EN-only landing pages (`/ats-resume-checker`,
`/jobscan-alternative`) that compute nothing themselves and only funnel into `/optimize` — real gap
there is a missing Arabic page, not new logic. One tool (Resume Length Checker) partially exists at
the wrong granularity: `reviewChecks.ts` flags long individual bullets and long summaries, but there
is no whole-document length/page-count check. Two tools (Arabic CV Error Checker, and the
whole-document half of Resume Length Checker) are genuinely net-new logic with nothing to extract.

**Built this pass: PDF Text Readability Checker and Job Description Keyword Extractor**, the two
with the clearest scope and the lowest risk of duplicating existing functionality.

`/pdf-readability-checker` + `/ar/pdf-readability-checker` wrap the exact extraction step
`/api/extract` already runs on a builder import (unpdf for PDF, mammoth for DOCX) — no new backend
route. It surfaces, as a user-facing verdict, two signals that already existed only as an internal
422/log line: a file returning under 20 chars of text (already a 422 from `/api/extract`) reads as
"not readable"; a file whose extracted text is long but has no line breaks (previously only
`console.error`-logged as the `mergePages` flattening symptom) reads as "partially readable." The
extracted text preview is shown so the user can see exactly what a screening system would see.
Nothing is stored — the file is sent once for extraction and never saved — and no CV content reaches
a URL or analytics event (`FunnelBeacon`'s `toolOpened` step carries no page content, matching every
other tool page's convention).

`/jd-keyword-extractor` + `/ar/jd-keyword-extractor` add a `jd-keywords` mode to the existing
`/api/tools` endpoint (its fourth mode, alongside `linkedin`/`interview`/`interview-feedback`/
`career-plan`), reusing its retry loop, JSON repair, and rate limiter. Unlike `/api/optimize`'s
keyword split, this tool takes only a job description — no resume required — because knowing what a
posting scans for is useful before a candidate has decided how to frame their own CV against it.
Every extracted term must appear in (or closely paraphrase) the pasted text; the prompt is
explicit that it must never assume a skill the posting doesn't actually mention.

**Both new tools follow the `/ar/optimize` "real page" pattern, not the `/ar/linkedin` "redirect
stub" pattern** — found during the audit to be the deliberate distinction this codebase already
draws: a stub only works when the tool's own SEO value already lives on one URL with a UI-language
toggle (`/linkedin`, `/interview`, `/career-plan`), but Phase 12 is explicitly about indexability, so
a stub here would ship half the phase's own requirement. Each of the two new tools has its own
`layout.tsx` per language with unique `<title>`/description/canonical/hreflang metadata and
genuinely-authored (not translated) Arabic prose via the shared `PageBody` component — matching
`/optimize`'s own documented reasoning that a translated page is a duplicate in a search engine's
eyes, and an Arabic reader deserves examples from their own market rather than a mirrored sentence.

**Also fixed while in this area:** `/career-plan` (F-35, shipped last pass) was missing from
`app/sitemap.ts` — an oversight from that pass, added now. `HubLinks` (both languages) gained entries
for both new tools.

**What remains, honestly scoped, not attempted this pass:**
- Arabic landing page for the ATS/Job-Match positioning (`/ar/ats-resume-checker` or equivalent) —
  the English `SeoLanding` component is EN-only by construction (`lang="en"` hardcoded); giving it
  real Arabic parity is a bigger job than the marketing-copy pages that use it suggest, and was not
  started.
- Standalone Professional Summary Generator and Experience Bullet Generator pages wrapping
  `/api/suggest` — the engine exists, the page does not.
- Standalone Arabic→English CV Translator page wrapping `/api/translate` — same situation, and the
  route's own header comment currently states it is "only reachable from an explicit 'Create English
  version' action," which would need updating once a standalone caller exists.
- Arabic CV Error Checker — genuinely new logic (no existing Latin-in-Arabic or RTL-specific
  validation anywhere in the codebase).
- Whole-document Resume Length Checker — genuinely new logic (only per-bullet/per-summary length
  checks exist today).

**Verification.** `npx tsc --noEmit`, `npm test` (48 suites), `npm run build` all clean — all four
new routes (`/pdf-readability-checker`, `/ar/pdf-readability-checker`, `/jd-keyword-extractor`,
`/ar/jd-keyword-extractor`) compile as static routes in the production build. Live browser
verification was attempted (`fuser -k 3141/tcp` first, confirmed `✓ Ready in 387ms`), and this time
the stalled first-compile symptom from F-35 was actively diagnosed rather than left unexplained: `ps
aux` during the stall showed the `next-server` process at 300%+ CPU and 3.3GB RSS — genuinely
compute-bound, not hung or a zombie process — on a 4-core sandbox. The compile did not finish within
the time available in this pass. This narrows, but does not close, F-35's open question: a brand-new
route's first Turbopack dev-compile appears to be genuinely CPU-bound and slow in this sandbox,
distinct from the stale-port symptom F-32/F-33 already fixed. Shipped on typecheck + test +
production-build verification; the live click-through (including the PDF-upload round trip, which
needs no AI credential and could be fully end-to-end verified if the compile completes) remains
undone and is recorded here rather than assumed. The `jd-keywords` generation call itself separately
needs `NVIDIA_API_KEY`, which this environment does not have.

### F-37 · P0 · A live false privacy claim, and the "Career Operating System" fragmentation claims verified one by one — FIXED (privacy) / PARTIAL (connectivity)

The user reported the product "still fragmented" despite the earlier IA-redesign pass (shared
`PageShell`, `HubLinks` cross-linking, `/optimize` merged EN/AR, `/account` renamed "Career
Dashboard" — commits `864208f`, `5c0520c`), and listed 7 specific symptoms, closing with "do not
report completion until the old and new product surfaces no longer coexist." Before changing
anything: confirmed via the Vercel MCP that every push to `main` auto-deploys to production
(`cv.rabit.sa` is attached to the `resume-ai` project; the last 20+ deployments, including this
session's own commits, are all `READY`/`target: production`) — so this was not a deploy-pipeline gap.
Then audited each of the 7 claims against the actual current code, since the earlier IA pass's
"completed" status did not match what was being reported.

**1. "Builder, Optimizer, ATS, LinkedIn and Interview remain separate tools."** Partially true, but
weaker than it reads: they are separate ROUTES, but `MyCvPicker` (`app/components/MyCvPicker.tsx`)
already threads a shared "use a CV you already made here" strip through `/optimize`, `/linkedin`,
`/interview`, and `/interview-live`, and `app/lib/handoff.ts`'s `sendToBuilder` already carries an
`/optimize` scan into a real builder resume record (not a copy) with correct job-ad and document-
language context preserved — deliberately sending the user's ORIGINAL text, not the AI rewrite,
into the structured document, so a model's wording is never silently installed as confirmed fact.
This is real, working, already-connected infrastructure, not something this pass invented.

**2. "Arabic and English still use different flows."** FALSE for the core builder — verified by
diffing `app/(en)/builder/page.tsx` against `app/(ar)/ar/builder/page.tsx`: both render the exact
same `<BuilderStart lang="en"|"ar" />` component; the only difference is per-locale SEO metadata and
genuinely-authored (not translated) `PageBody` prose. One engine, two SEO wrappers, not two flows.

**3. "/templates and /resume-templates still coexist."** True that both routes exist, but both
already funnel correctly into `/builder?template=<slug>` (`TemplatesGallery.tsx:169`,
`resume-templates/[style]/page.tsx:44,57`) — not two competing tools. The actual bug was
navigational: `HubLinks` listed BOTH as separate peer items ("Templates" → `/resume-templates`,
"Template gallery" → `/templates`), which is what reads as two products. Fixed by dropping to one
entry, keeping `/templates` (matching the Arabic set, which only ever had one entry — `/ar/templates`
— since the SEO catalog is EN-only). `/resume-templates` was NOT redirected or touched: it stays
fully live, indexed, and reachable from its own pages and the sitemap, per the user's own explicit
"preserve SEO acquisition pages" instruction. Neither surface was deleted — the fix was presentation,
not architecture.

**4. "ResumeAI legacy branding still exists."** FALSE. The only match anywhere under `app/` is a
`User-Agent: "resumeai"` HTTP header string sent to Microsoft's TTS API in `app/api/tts/route.ts` —
never rendered, never user-visible. `app/lib/brand.ts` is the single source of truth for the product
name ("Sira / سيرة") and company ("Rabit"), and it's what every page already reads.

**5. "Account, resumes and job applications are still device-only."** Split verdict, and the
resolution of this claim drove everything else in this entry. Resumes: FALSE — `app/api/resume/route.ts`
+ `app/lib/resumeServer.ts` is a fully built, Redis-backed, versioned, conflict-checked server store
for the structured `BuilderState` document, keyed by (account, resumeId), for signed-in users. Job
applications: TRUE — `app/lib/localdata.ts`'s `addJob`/`getJobs`/`updateJob`/`removeJob` are 100%
`localStorage`, with zero server route (confirmed: no `app/api/job*` route exists at all). The file's
own header says this is deliberate — "matches the privacy pledge" — which led directly to the next,
more serious finding.

**The privacy pledge itself was false.** `/privacy` and `/ar/privacy` stated, in a dedicated opening
section: **"Your resume's text is not saved on our servers... there is no database that keeps
resumes."** That is not true — `resumeServer.ts`'s own header describes exactly what it stores:
"their employers, dates, licences and every confirmed line." A product that cites Saudi PDPL in the
same policy document was making a live, false claim about server-side storage of PII. This was fixed
before anything else, on the reasoning that extending server persistence further (or building it for
job applications) while this claim was live would only compound a real disclosure problem. Both pages
now accurately state: anonymous use is fully local (unchanged); signed-in users' resume documents ARE
saved to their account server-side, self-deletable at any time from the dashboard; and everything else
in the policy (no AI training use, no data sale, Paylink handles payment) is unchanged because it was
already accurate. Section 3's "what we keep" list gained the matching bullet. Both pages edited in
full, independently-authored prose per language, not a translation pass.

**Given the corrected privacy claim, job-application server sync was deliberately NOT built this
pass** — building it would need its own accurate disclosure work, and shipping more server storage in
the same pass as fixing a false claim about server storage risked repeating the mistake under time
pressure. The job tracker's own on-page copy ("Stays on this device") was already accurate and is left
as-is. This is recorded as a real, scoped, follow-up gap — not silently dropped.

**6. "Users must paste their resume again in separate tools."** Same evidence as #1 — largely FALSE
already, via `MyCvPicker`, EXCEPT `/career-plan` (built last pass, F-35) never got it wired in. Fixed:
added `MyCvPicker` to `/career-plan`, prefilling "current role" from the picked CV's target title,
matching the exact pattern `/linkedin` already uses for its own "target role" field.

**7. "There is no shared Career Profile or connected hiring journey."** PARTIAL, and this is the one
genuine architecture gap confirmed. `BuilderState` (via `resumeId`) already functions as the "Career
Profile / Master Resume," and Phase 4's `tailoredFrom` mechanic already connects a resume to the
source it was tailored from. What was missing: a tracked job application had no link to which resume
version it used, and the dashboard didn't connect application status to interview preparation. Fixed:
`JobEntry` (`localdata.ts`) gained optional `resumeId`/`resumeTitle`, captured as a snapshot pair (not
a live reference — editing or deleting the linked resume afterward doesn't corrupt the application
record, it just means the title stops being guaranteed current). The "add application" form on
`/account` now offers a resume picker (reusing the SAME saved-resume list already shown lower on that
page — no new data source), each tracked application shows which resume was used, and any application
marked "applied" or "interview" gets a "Prepare for this interview →" link straight into `/interview`.
This connects Job Tracker → Master Resume → Interview Prep as one visible path on the one dashboard,
without adding a page.

**What remains, honestly scoped:**
- Job-application server sync (see above) — a real, deliberately-deferred gap, not silently dropped.
- A deeper dashboard restructure (grouping each Master Resume with all its tailored versions,
  applications, and scores in one connected block, rather than three lists that now cross-link) was
  not attempted — the connective links added this pass close the "no path between them" gap without
  the larger layout risk of restructuring a live account page in the same pass as a privacy-page fix.
- The other 5 of 9 SEO tools from F-36 remain as scoped there.

**Verification.** `npx tsc --noEmit`, `npm test` (48 suites), `npm run build` all clean. Live browser
verification was attempted (`fuser -k 3141/tcp`, confirmed `✓ Ready in 422ms`) but even `/privacy` —
an existing, previously-compiled route with only text changes — did not finish its first Turbopack
dev-compile within 90 seconds. `free -h` showed 9.7GB free (not a memory-pressure symptom); this
reads as the same CPU-bound slow-compile class F-35/F-36 documented, now apparently affecting
previously-fast routes too, plausibly from the route tree's accumulated size over this long session.
Shipped on typecheck + test + production-build verification, consistent with the last two passes;
the live click-through remains undone and is recorded here rather than assumed.

### F-38 · P0 · Landing page redesigned as a premium career operating system — FIXED

The homepage read as documentation: dense text above the fold, no visual hierarchy, six sections of
equal weight, and — the user's own words — "the first screen feels like documentation instead of a
premium SaaS." Explicitly asked for an Apple/Linear/Stripe/Raycast-level page: huge type, one story
top to bottom, a real "wow" moment, understandable in under 5 seconds. Also explicit: produce a
wireframe, hierarchy and attention map FIRST, get it approved, only then implement.

**Wireframe pass.** Published a high-fidelity HTML mockup as a Claude Artifact before touching the
codebase, with a toggleable numbered attention-map overlay showing intended reading order per
screen. Reused the product's real, already-established palette (`--bg:#0b0626`, `--accent:#8b5cf6`,
`--gold:#f5b840`) rather than inventing a fresh identity — this is a live brand, not a blank canvas —
and the existing bilingual font stack. User approved the direction with one note: make the orb more
"pulsing" and "otherworldly."

**The orb.** `BrandOrb.tsx` gained a fourth variant, `"hero"` (the other three: `logo`, `button`,
`decor`), rather than a new component — the file's whole discipline is "one component, four jobs
now, no client bundle," and a parallel orb implementation for one page would be exactly the
duplication this pass was asked to remove. The "otherworldly" feel comes from a second, larger glow
ring (`bo-corona`) breathing on its own out-of-phase timer behind the existing sphere/glow/crescent
— two static gradients drifting in and out of sync reads as alive; a single shape pulsing harder does
not. Still `transform`/`opacity` only — nothing here animates `filter`, which `BrandOrb.tsx`'s own
header already documents as the thing that cost a real Android device a composited frame budget.

**Motion: reused, not reinvented.** `transitions.css` documents three real iPhone crashes traced to
a scroll-driven reveal system that was deliberately removed — `IntersectionObserver`s and
`animation-timeline: view()` are both named as the cause. The published wireframe used
`IntersectionObserver` for its scroll reveals, because it was a throwaway preview, not committed
code; the real implementation does not carry that over. Every reveal on the rebuilt page uses the
SAME one-time `@starting-style` mount animation this product already trusts: `.t-hero` for the
headline sequence (rises without fading, so the LCP element is never delayed — this page's `<h1>` is
still the LCP element), `.t-enter` for every section below the fold. The ATS score count-up
(`AtsScoreReveal.tsx`) plays once on mount via `requestAnimationFrame`, not gated behind scroll
visibility, for the same reason — a number ticking up slightly before a visitor scrolls to it costs
nothing; a scroll listener watching for when they arrive is the exact pattern that got removed.

**No backdrop-filter added to anything repeated.** `.card`'s own header in `globals.css` documents a
second real crash: `backdrop-filter: blur(14px)` on the most-repeated element in the product closed
an iPhone tab (51 blurred elements, 1.42 megapixels, invisible to this sandbox's Chromium-only
sweep because Blink silently ignores the unprefixed property the build emitted). The rule stated
there — "kept where there is exactly ONE per page" — is followed exactly: the sticky nav reuses the
existing single-instance `.ps-header` (already blurred, already RTL-tested), and the profession
demo's skill/certificate tags use a new blur-free `.pill` class rather than the site's `.chip` (which
does carry a blur, safe at one eyebrow badge per page, not safe at the dozen tags one profession pack
can show at once).

**Content is real, not lorem.** The "why we're different" claims, the profession demo, the template
grid and the proof strip all read from data the product actually has:
- `ProfessionDemo.tsx` reads `allRolePacks()` and picks 5 real packs by slug (radiology technologist,
  software developer, accountant, registered nurse, sales manager) — the same principle the old
  worked-example section already followed ("editing a pack edits the ad"), extended to a tabbed,
  client-side switch with no page reload and no model call.
- The template grid reads `TEMPLATE_CATALOG` (10 real templates, real names, real accent colors) —
  not a hand-typed list that could drift from what `/templates` actually offers.
- The proof strip's profession count is `allRolePacks().length`, not a hardcoded "25+" that goes
  stale the next time a pack is added.
- The ATS score section uses the real dimension labels `reviewChecks.ts` scores every CV on
  (ATS-safe structure, evidence strength, readability, completeness), labeled "illustrative example"
  rather than presented as a live claim about a specific resume.
- The FAQ's "where is my data stored" answer matches the corrected privacy disclosure from F-37
  exactly — the redesign does not reintroduce the claim that pass just fixed.

**What the brief asked for that was not built as asked, and why:** "Social proof — companies,
professionals, trust indicators." This product has no real company logos to show — it serves
individuals, not businesses — and inventing trust logos would be exactly the kind of fabrication
every other part of this product refuses to do (the "0 facts invented" claim two sections later would
be sitting directly below a fabricated one). Built as an honest proof strip instead: real numbers
(professions modeled, languages, templates, "0 invented facts" as a philosophy stated plainly)
rather than borrowed credibility that does not exist yet.

**Files:** `app/components/marketing/Landing.tsx` (full rewrite), three new client islands
(`ProfessionDemo.tsx`, `FaqAccordion.tsx`, `AtsScoreReveal.tsx`), one new scoped stylesheet
(`app/marketing.css`, imported only by `Landing.tsx` — new LAYOUT shapes only: the step rail, the
demo shell, the timeline, the template preview, the score ring; everything that already had a
primitive — cards, buttons, chips, motion — reuses the existing one), and the `BrandOrb`/`globals.css`
hero-variant addition described above.

**Verification.** `npx tsc --noEmit`, `npm test` (48 suites), `npm run build` all clean — `/` and
`/ar` both compile as static routes. Live-verified in a real browser this time (the dev server
happened to compile quickly for this pass): confirmed via `elementFromPoint` that the hero orb does
not sit over the `<h1>` text (the design brief's own "the orb must not cover the text" rule, the
same one `ops/design.test.mjs` checks live), confirmed no horizontal overflow at 1440px, and
screenshotted the hero (English and Arabic, correctly mirrored — orb swaps sides, pipeline arrows
flip direction, nav mirrors), the "why different" cards, and the journey timeline. `ops/design.test.mjs`
itself needs a running app and was not run as part of this pass (it is not part of `npm test`);
flagged rather than assumed clean.

### F-39 · P0 · Hero orb: comfortable on mobile, and a real "planet with rings" — FIXED

User feedback on F-38, with a reference screenshot: the mobile hero orb was "not comfortable, too
big," and asked for the look in the photo — a Saturn-like ring and a starfield around a
medium-sized, clearly-framed planet.

**Found while investigating: the orb wasn't actually "too big" — it was pushed off-screen
entirely.** The hero's text and orb columns share one CSS grid (`lg:grid-cols-[1.05fr_0.95fr]`),
single-column below `lg`. With no explicit order, mobile stacked them in DOM order — text first,
orb second — so the orb rendered roughly 800px down the page, past the headline, the description,
and the CTAs. A user on a phone would have to scroll past the entire hero to ever see it, and the
first "big black circle" they'd have scrolled past to get there would have read as an orb-sized gap,
not a hero visual. Confirmed via `getBoundingClientRect()` on a real iPhone-13 viewport before
touching anything, rather than guessing from the screenshot alone.

**Fixed the order, not just the size.** `.hero-orb-col` gained `order-first lg:order-last` — orb
first on mobile (matching the reference photo's composition: planet at the top, headline below),
grid columns handle left/right placement on desktop unchanged. Re-verified the same way: text now
measured at `top: 371`, orb at `top: 121`, on the same viewport.

**The ring.** `BrandOrb.tsx`'s `hero` variant gained a `bo-ring` element — a circle flattened to an
ellipse and tilted (`scaleY(0.28) rotate(-11deg)`), positioned BEHIND the sphere in paint order so
the opaque sphere naturally occludes its middle third. That's the whole trick: no clip-path, no
z-index games, just paint order, which is what makes it read as a ring viewed at an angle rather
than a halo. One `transform: rotate` animation at 40s (near-static, barely perceptible motion) —
nothing else on it moves, so it costs one static gradient-bordered layer, not a repaint.

**The starfield.** A tiled SVG data-URI (20 small circles, three sizes, varied opacity) as a
`background-image` on a new `.hero-orb-col::before` — one static image paint behind the orb, zero
DOM nodes per star, nothing animated. Considered and rejected: individually-animated twinkling
stars, which would have been N more animated layers for N stars — the same class of cost
`transitions.css` and `.card`'s own header both document real crashes from, just multiplied by
however many stars looked good. A still field of dots reads as depth without needing to move.

**Mobile size.** The orb's `max-width`/`max-height` changed from a flat `88vw` (which could exceed
340px on a wide phone) to `clamp(150px, 46vw, 520px)` — 150px floor, 520px ceiling, 46vw in between.
Measured on an iPhone 13 viewport (390px wide): the sphere itself renders at 179px, comfortably
smaller than before; the ring and corona glow extend beyond that by design (matching the reference
photo's proportions), confirmed NOT to cause horizontal overflow (`document.documentElement.scrollWidth
=== clientWidth`, both 390, measured live).

**Verification.** `npx tsc --noEmit`, `npm test` (48 suites), `npm run build` all clean. Live-verified
on a real iPhone-13-emulated viewport in Playwright: orb stacking order (first on mobile), orb sphere
size (179px), no horizontal overflow, and screenshotted the result in both English and Arabic — the
ring/starfield/planet composition renders correctly and RTL-mirrors correctly (confirmed visually,
not just structurally). One stale-cache lesson from this pass, recorded because it cost real time:
the FIRST verification pass silently re-tested the OLD layout — identical bounding-box numbers,
sub-pixel-for-sub-pixel, across a full dev-server restart — before a direct computed-style check
(`getComputedStyle(...).order`) confirmed the CSS was actually correct and a fresh `getBoundingClientRect()`
call in the same script showed the corrected position. The first script wasn't wrong about what it
measured; something about the page it measured was stale in a way a full `fuser -k` + restart did not
clear. Isolating the check into a single fresh script (debug computed style AND position together, one
navigation) is what surfaced the truth; re-running the exact same standalone script against an
already-restarted server repeated the stale result.

### F-40 · P0 · The landing DEMONSTRATES: eight-beat walkthrough, comparison table, dashboard preview, and the materialize arrival — FIXED

Direction after F-38/F-39 shipped: the page "still feels like an AI Resume Builder" — it explained
too much and demonstrated too little, the full product (tailoring, tracking, interview prep,
dashboard) felt hidden, and there was no interactive preview. Plus one specific ask: when AI
suggestions arrive after being requested, the arrival itself should be a stunning animation
("انميشن يبهر"). A section-by-section audit with per-section verdicts was given in conversation, the
v2 wireframe was updated at the same artifact URL, and the user approved with "ابدع… نفذ".

**The new motion primitive is the deliverable, and it ships in the PRODUCT, not just the ad.**
`transitions.css` §15, `t-materialize`: each arriving item rises with a spring overshoot while
cooling from an accent-hot flash (background/border/glow set only at the 0% keyframe, so the
browser interpolates back to each element's own settled values — chips "cool into being"), and the
container emits one soft radial burst. Additive over `t-stagger` by design: the delay ladder and the
`.t-stagger` selector `ops/aifeedback.browser.mjs` queries stay untouched; the longhands after §12
override only animation-name/duration. Wired into all six REAL AI-arrival sites (`AiStrip`,
`DetailSections` ×2, `FormSections`, `ExperienceSection`, `BlueprintStrip`) — so the moment a user
actually asks the AI for suggestions in the builder, they get the same arrival the landing page
advertises. One animation, both places; the marketing is a demo of the product, not an imitation.
Reduced-motion: everything off, settled values restated (including `scale`), burst hidden.

**Landing restructure per the audit** (`Landing.tsx` header carries the per-section ledger):
- Hero: static pipeline chips → a small live mockup card (shimmering tailored line + "91 ATS match
  after tailoring", labeled Example); three trust numbers moved directly under the CTAs.
- New `DemoWalkthrough.tsx`: eight auto-advancing, clickable beats — profile → master resume →
  paste posting → AI tailors → ATS improves → export → track → interview prep — each beat's mockup
  lines arriving via the same `t-stagger t-materialize`. Auto-advance is a plain interval (not
  scroll-linked — §9's crash rule), off under reduced motion, paused while the tab is hidden, and
  reset by manual navigation. Panel labeled "Illustrative example — every step is a real product
  capability", which is true (builder, /optimize tailoring+scoring, /api/export, tracker,
  /interview).
- "Not X" cards → Traditional-vs-Sira comparison table (Career Profile / AI tailoring / ATS scored /
  tracking / interview prep / LinkedIn — all six real features).
- How-it-works: three icon cards, one line each.
- Profession demo: Teacher in, Sales Manager out (the brief's own list); "Software Developer" kept
  as-is because that is the pack's real title. Tags switched from `.chip` (carries backdrop-filter —
  fine at 1/page, not at ~10; the F-38 note claimed `.pill` was already used here and the code said
  otherwise, now it does) to `.pill`. Arrivals materialize on every tab switch.
- Templates grid removed as a section (the most "resume-builder" visual on the page; export is now a
  walkthrough beat; `/templates` untouched, still in the footer). Dead rail/template/pipeline/proof
  CSS stripped from `marketing.css`.
- New dashboard preview: Resume score / ATS match / Applications / Interviews / next recommended
  action, labeled "Illustrative example — not live account data" in both languages, linking to
  `/account`.
- Trust section before the final CTA: live counts + the no-fabrication pledge. Testimonials were
  explicitly declined: there are no real user quotes to publish, and invented ones two sections
  below "0 facts invented" would refute the page's own thesis. Stated to the user before building.
- Final CTA reframed on the outcome: "Your next job is one profile away."

**Verification.** `npx tsc --noEmit`, `npm test` (48 suites), `npm run build` all clean. Live in a
real browser (desktop 1440px + iPhone-13 viewport + Arabic): no horizontal overflow on any of the
three; walkthrough tab click switches beats and refills the progress bar; a screenshot taken 260ms
after switching the profession tab caught the materialize mid-flight — chips at visibly different
stages of arrival, later ones still accent-lit and translucent — confirming the stagger and the
flash actually render rather than merely parse. Arabic mirrors correctly (progress bar fills
right-to-left, dashboard arrow flipped via `scaleX(-1)`, Arabic-Indic digits from `toArabicDigits`).
The one thing NOT verified live is the builder's own six call sites playing the new arrival — that
needs an AI key this sandbox does not have; the class composition is the same one the landing
plays, and `ops/aifeedback.browser.mjs` (needs a running app + key) remains the live check.

### F-41 · P0 · Hero-side live preview, dashboard progress rings, magnetic CTAs — plus a real mobile rendering bug found and fixed — FIXED

Follow-up direction after F-40 (two further "premium AI product" briefs, largely already satisfied
by F-38/F-39/F-40's shipped structure): resolved via `AskUserQuestion` on the three points that
would have reversed documented architecture (Framer Motion, a scroll-drawn timeline line,
fabricated testimonials) — all three answers kept the existing CSS-only, no-fabrication approach.
What was left as genuinely new: the hero's static mockup card should be a real auto-cycling
preview, not one frozen frame; the dashboard's two score cards should read as progress rings; a
felt "magnetic" hover on the landing's own CTAs; a few drifting particles near the orb.

**Shipped:**
- `DemoWalkthrough.tsx` gained a `compact` prop: the same eight-beat data and interval logic,
  rendered as a smaller card (tag + lines + mini progress row, no tab strip) at a faster 2200ms
  tempo, placed under the hero orb — `<DemoWalkthrough lang={lang} compact />`. One data source, one
  timer implementation; only the JSX around it is thinner.
- Dashboard's Resume Score / ATS Match cards became CSS-only conic-gradient rings (`.ring`, `--pct`
  custom property, `.ring::after` punching the donut hole — no SVG, no JS), plus a fifth "Tailored
  Versions" stat card.
- `.magnetic`: hover-only lift+scale, `@media (hover: hover)` guarded (same convention as `.t-lift`,
  avoids a stuck hover state on touch), applied only to the landing's own 3 CTA buttons — not the
  shared global `.btn-accent`/`.btn-ghost` used sitewide. Not a true cursor-following magnetic
  effect (that needs a `pointermove` listener); this is a lift approximation.
- `.hero-particles`: 3 small dots with independent slow `translate`-only drift, layered near the orb.

**A real bug, found by this session's own "verify in a real browser" discipline.** The desktop
screenshots looked correct; the mobile (iPhone-13 viewport) screenshot of the new compact hero
preview did not — the card's header and progress bar rendered, but the three materializing
`.walk-line` rows were completely blank, and stayed blank after a 3.5s settle (ruling out a
mid-animation capture). This was NOT a computed-style bug: `getComputedStyle` on the actual
`.walk-line` elements reported everything correct — `opacity: 1`, right colors, right
`animation-fill-mode: both`, right layout rects. A screenshot taken at the exact same instant as
that diagnostic still showed the content area empty. Systematically narrowed with one variable at a
time: forcibly disabling all CSS animation (`* { animation: none !important }`) made the content
render correctly every time; the identical `.t-stagger.t-materialize.walk-line` construct rendered
correctly on the SAME mobile page for the full (non-compact) walkthrough further down, which is not
nested inside the hero's stack of always-animating layers (`.cosmos-glow`'s `isolation: isolate`,
the orb's own glow/corona/ring loops, the starfield tile). Swapping `translate`/`scale` for the
`transform` shorthand, removing the per-child `animation-delay` stagger, and forcing
`position: static` on the card each changed the failure pattern without reliably fixing it — this
points to a genuine Chromium headless/mobile-emulation compositing quirk (a delayed CSS animation,
inside several nested stacking contexts that are themselves next to other constantly-animating
layers, sometimes never gets composited into a paintable frame even though it is logically
"settled") rather than anything wrong in this codebase's CSS. Chasing the exact Chromium mechanism
further was not a good use of time against a real, user-visible blank-content risk.

**Fix:** the compact hero preview's lines no longer carry `t-stagger`/`t-materialize` — they render
immediately, unanimated, on each 2.2s card remount. `DemoWalkthrough.tsx` documents why at the call
site. The full walkthrough, the profession demo, and all six real builder AI-arrival sites keep the
materialize animation unchanged — they were verified working, on both desktop and this same mobile
viewport, and are not near the orb's layer stack. The auto-cycling card swap (tag, lines, progress
dots, every 2.2s) still delivers a genuinely live, non-static preview beside the headline; only the
individual per-line arrival flourish was removed, and only from this one location.

**Verification.** `npx tsc --noEmit`, `npm test` (48 suites), `npm run build` all clean. Live in a
real browser, iPhone-13 viewport: the exact "Paste a Job Posting" beat that previously rendered
blank now shows all three lines, both immediately after load and after a 3.5s settle; re-checked
across several page loads (different beats, different points in the 2200ms cycle) with no recurrence.
Desktop 1440px: hero live-cycling card, CTA hover (magnetic lift), and dashboard rings all screenshot
correctly; no horizontal overflow on desktop or mobile. Diagnostic scripts were scratch-only and
deleted after use, per convention.

### F-42 · P0 · Full visual-system pass: high-contrast palette, real typography scale, a volumetric orb, decluttered sections — FIXED

Direction after F-41 shipped: the page reads "faded, low contrast, text-heavy, crowded, small,
flat, difficult to scan, no clear hierarchy" — not a content complaint (F-38 through F-41 already
did the structural/demonstrative work), a VISUAL SYSTEM complaint, with an exact color palette,
type scale, spacing scale, and orb spec supplied, and an explicit instruction not to add sections,
text, or cards. A companion complaint: the hero orb "looks washed out and resembles a white
rotating ring."

**Blocked from the literal instruction to verify on `https://cv.rabit.sa/` directly** — this
sandbox's egress policy denies that host (confirmed 403 from the proxy on both a real headless
browser and `WebFetch`; per this environment's own rules, reported rather than routed around, via
`AskUserQuestion`). Worked instead against the local dev server, which runs the same code that
merges to `main` and deploys to that URL — every claim below is a LOCAL verification; the
production URL itself was never opened this pass.

**Color system — scoped, not global.** A new `.landing-root` class on `Landing.tsx`'s `<main>`
redefines the exact custom-property names the rest of the site already reads (`--bg`, `--fg`,
`--muted`, `--faint`, `--line`, `--accent`, `--accent-deep`) to the requested deep palette
(`#070a12` page bg, `#0f1626`/`#141d30` card tiers, solid-hex text tokens instead of the old
translucent-white `--muted`/`--faint`, `rgba(148,163,184,.18)` borders). Every existing rule that
already does `color: var(--muted)` picks up the new values with zero edits — and every OTHER page
(`/builder`, `/optimize`, `/templates`, …) is provably unaffected, because the global `:root`
tokens in `globals.css` were never touched. `.card`/`.chip`/`.ps-header` get small scoped overrides
for the same reason — `.card` in particular goes from a 3.5%-white wash (invisible as a boundary)
to a solid, bordered panel.

**Typography — every sub-14px "meaningful" label bumped, hero/section scale retuned to the brief's
own numbers.** Swept `marketing.css` for every kicker, tag, and micro-label under 14px (there were
over a dozen: `.section-kicker` 11→14, `.pill` 12.5→14, `.walk-tag`/`.walk-step`/`.walk-note`,
`.compare-row.head`, `.dash-card .lbl`, `.dash-note`, `.score-num span`, `.demo-col .k`, `.demo-note`
— all now ≥14px) and every body-copy paragraph under ~16px (`.duty-list li`, `.walk-line`,
`.faq-a p`, `.t-item p`, `.trust-stat span`, the hero lede, walkthrough/profession-demo subheads —
now 15–18px). Hero `<h1>`: `clamp(2.75rem,6vw,4.75rem)` = 44–76px, `letter-spacing:-0.04em`,
matching the brief's desktop 52–76px range (kept the floor at 44 rather than 52, since 52px singly
at narrow mobile widths would itself violate the mobile 40–46px band the same brief states two
lines later — the two numbers conflict at the low end, and mobile legibility won). Section
`<h2>`s: `clamp(1.9rem,3.8vw,3rem)` caps exactly at the requested 48px (previously uncapped at
51.2px). "How it works" card titles: `text-xl font-semibold` (20px/600), matching the card-title
spec exactly.

**The orb — a new `OrbCore.tsx` canvas component, used ONLY by the `hero` variant.** This is the
literal complaint's fix. `BrandOrb.tsx`'s `logo`/`button`/`decor` variants (30+ server-rendered call
sites sitewide) are UNCHANGED — still the plain CSS sphere, still zero client JS, per that
component's own long-standing "no client bundle for a circle" doctrine. Only `variant="hero"` (two
call sites, both in `Landing.tsx`) now renders `OrbCore`: a `"use client"` canvas that draws a deep
obsidian base, 3–4 independently-drifting purple/blue/cyan plasma blobs (own phase and speed per
blob, not a single value scaling), an inward-drawn particle field, a specular highlight, and a rim
light gradient that is purple→cyan→blue and NEVER white — replacing the old `.bo-ring` (a flattened,
tilted ellipse with a `rgba(226,232,245,0.85)` near-white gradient stop — literally the "white
rotating ring" being complained about) and `.bo-crescent`, both removed from the hero render path;
`.bo-ring`'s now-fully-dead CSS (only that one call site ever used it) was deleted rather than left
unreachable. `devicePixelRatio` capped at 2, rAF paused while `document.hidden`, one static frame
under `prefers-reduced-motion` (no loop). The breathing pulse (0.97→1.04, 3.6s) is a CSS `scale`
animation on the wrapper — NOT redrawn in canvas — composed with a JS-driven desktop-only
mouse-follow that sets `translate` on the same element: `scale` and `translate` are independent
CSS transform properties precisely so the two motions (one CSS, one JS) don't fight over a shared
`transform` and silently cancel each other, the same reasoning `transitions.css` already documents
for card entrances. Verified live: two frames captured ~1.4s apart show the plasma blobs at visibly
different positions and `getComputedStyle(...).animationName` reads `orb-core-breathe` under normal
motion and `none` under `prefers-reduced-motion: reduce`.

**Decluttering, without adding sections/text/cards.**
- Hero: `ContinueDraft` (a returning visitor's "resume in progress" banner) was a full bordered
  `.card` competing with the primary/secondary CTAs directly above it — now a single quiet text
  line with a small live dot, same information, same link, a fraction of the visual weight.
- Profession demo (the most crowded section — up to 15 chips + 5 responsibilities visible at once
  in one screenshot taken this pass): `ProfessionDemo.tsx` rewritten to add a second tab row
  (Modalities / Systems / Typical responsibilities / Certificates …) so only ONE category is ever on
  screen, capped at 6 chips or 3 responsibilities with a real "Show N more" toggle (state resets on
  profession or category switch) — verified in a live browser, both languages, both desktop and
  390px mobile.
- "How it works" step numbers: large gradient-text `01`/`02`/`03` (Arabic-Indic digits in `/ar`, via
  the existing `toArabicDigits`) now lead each card, ahead of the emoji — "make the step number
  visually obvious," literally.
- Container width: `max-w-6xl` (1152px) → `max-w-[1200px]` on every full-width section, inside the
  brief's 1180–1240px range.
- Card hover: landing-scoped override tightens the shared `.card-hover` to a 4px lift, 200ms, and a
  purple-tinted shadow, matching the brief's numbers without touching the shared global rule other
  pages use.
- Hero load sequence: `.t-hero`'s per-child stagger (only ever used on this page) moved from 60ms to
  90ms steps, inside the brief's 80–120ms range. The orb column gained its own mount-in (fade +
  `scale: 0.92→1`, the same `@starting-style` mechanism `transitions.css`'s primitives use) so it
  animates in ahead of the text column, per the brief's own load-sequence order.
- Added a scoped `:focus-visible` ring (`.landing-root a/button`) — none existed anywhere on this
  page before; a small, additive, landing-only accessibility fix, not a sitewide focus-ring change.

**Explicit deviations from the literal brief, and why:**
- "How it works" stayed at 3 cards, not 4 — the product only has three real named steps
  (`Name the job` / `Confirm the facts` / `Review and send`); inventing a fourth would be exactly
  the fabrication this codebase's own doctrine forbids, for a purely cosmetic card count.
- The trust section stayed at 4 stats, not "three concise principles" — all four
  (occupations modeled, languages, facts invented, templates) are real, already-verified product
  facts; dropping one to hit a round number would be removing true information to match a template.
- No pricing section was added to the homepage. It doesn't have one today (pricing lives at
  `/pricing`, linked from the footer) — adding one would violate this same brief's own "without
  adding more sections" instruction, so the homepage's hierarchy stops at Trust → FAQ → Final CTA,
  as it already did.

**Verification.** `npx tsc --noEmit` clean. `npm test` — all 48 suites, 0 failed. `npm run lint` —
253 pre-existing problems (36 errors, 217 warnings), confirmed via `grep` to be zero in every file
this pass touched (`Landing.tsx`, `BrandOrb.tsx`, `OrbCore.tsx`, `ContinueDraft.tsx`,
`ProfessionDemo.tsx`, `globals.css`, `marketing.css`, `transitions.css`) — pre-existing elsewhere,
not introduced or fixed here. `npm run build` clean, full page count unchanged. `axe-core` run live
against both `/` and `/ar`: one real violation found (the comparison table's "Sira" column header,
15px bold `#7c3aed` on `#0a0f1c` = 3.35:1, below the 4.5:1 normal-text floor) and fixed by switching
it to `--accent-bright`; re-run after the fix: **zero violations, both languages.** A second,
independent WCAG-formula pass over the full token palette (18 foreground/background pairs across
every background tier) confirms every pair clears its required ratio, several by a wide margin.
Screenshots captured at 1440×1000, 390×844, and 430×932 (both DPR-3 mobile), English and Arabic — no
horizontal overflow at any of the five. RTL verified separately: profession-demo category tabs and
their active-underline sit correctly on the right, "Show N more" mirrors, `01`/`02`/`03` render as
Arabic-Indic `١`/`٢`/`٣`.

**Not verified this pass, honestly:** the actual production origin (network-blocked, see above —
check `https://cv.rabit.sa/` directly after this merges and deploys); Safari/WebKit rendering of the
new canvas orb (this sandbox is Chromium-only, the same standing limitation every prior pass in this
file has flagged); real 60fps measurement of the orb's rAF loop (no profiler available here — the
loop is a handful of gradient fills on a capped-DPR canvas plus ~10 particles, well within budget on
paper, but "measured 60fps" was not literally produced as a number).

### F-43 · P0 · Phase 1 of the cinematic Career-OS experience: orb state machine, skippable intro — FIXED, PARTIAL

Direction: a much larger brief than F-38 through F-42 — a 30-second cinematic intro (black screen →
orb wakes → three-phrase headline → CTA), the orb as a stateful "AI assistant" reused across the
whole authenticated app (dormant/awakening/idle/thinking/analyzing/listening/suggestion/success/
warning/sleeping), a scroll-driven "camera" turning every section into a cinematic scene, a
Mission-Control dashboard redesign, an orb-as-interviewer redesign of the interview page, and a
public/authenticated navigation split. The brief itself phased this ("Phase 1" through "Phase 5")
and said not to wait for approval between technical substeps.

**This entry covers Phase 1 only** — the orb state machine and the cinematic intro, both shipped and
verified. Phases 2–5 (the scroll-camera story scenes, Mission Control, the interview redesign, the
nav split, wiring orb states into the authenticated app) are NOT done and are not claimed as done;
see "Explicitly not done" below.

**One request flagged, not silently complied with or silently dropped.** Scene 4 asks for
scroll-position-driven camera effects — background lighting, depth, and section transforms tied
continuously to scroll position. That is the exact shape of what `transitions.css` §9 documents
removing after three real iPhone crash reports (`animation-timeline: view()`, a live scroll binding
held for the page's life). Told to the user directly rather than implemented or ignored: this pass
keeps the existing one-time, mount-triggered section reveals (`.t-enter`, fire once via
`@starting-style`, nothing attached afterward) — the same reveal system F-38 through F-42 already
use — rather than reintroducing a scroll-linked binding.

**`OrbCore.tsx` gained a `state` prop** (`OrbState`: the ten values above). An `energy` value (how
bright/fast the internal plasma is) and an optional color `tint` (success green, warning amber) each
EASE toward a per-state target every drawn frame — hoisted into component-level refs
(`energyValRef`/`tintValRef`/`tintAmtRef`) that persist across the effect's re-runs, specifically so
a transition BETWEEN states (idle → thinking → success) eases smoothly from wherever it actually
was, rather than snapping — the effect now depends on `[size, state]` and restarts (fresh blob
phases, fresh particles — a deliberate, minor, infrequent reshuffle) on every state change, instead
of reading a ref inside a single eternal loop, so a `prefers-reduced-motion` viewer still draws
exactly one settled frame per state change (not a live loop polling forever for a change that may
never come) while STILL seeing state changes reflected, just without motion getting there.
`BrandOrb` passes `orbState` through only for `variant="hero"` — every other variant (30+
server-rendered call sites) is untouched, unaware this prop exists.

**`CinematicIntro.tsx`** — a decorative overlay, not a replacement: `Landing.tsx`'s real `<h1>`,
lede, and CTA are unchanged and always server-rendered underneath; a crawler or a screen reader that
never runs this component's JS gets the complete page (verified: raw HTML fetch, no browser, still
contains the real headline and CTA text). Sequence: the orb (`OrbCore` at 180px, `state="awakening"`)
grows in via a one-time CSS scale/opacity keyframe, three phrases cross-fade on staggered
`animation-delay`s (the same nth-child-ladder mechanism `.t-stagger`/`.t-hero` already use
elsewhere — no `filter: blur()` animated anywhere, per this codebase's own ban), then a CTA fades
in. Skippable four ways from the first frame (click anywhere, Escape, a labeled autofocused Skip
button, or the CTA itself), auto-continues after ~5.6s if untouched, never traps focus, never
autoplays audio. Shown once per `sessionStorage`-scoped tab session; never shown at all under
`prefers-reduced-motion`.

**Two real bugs found during verification, both fixed:**
1. **The intro silently never appeared, in dev only.** React 18 StrictMode (on by default in dev,
   off in production builds) double-invokes mount effects — run, cleanup, run again. The intro's
   effect read `sessionStorage`, and if not yet seen, WROTE the seen-flag and showed the intro. On
   the double-invoke's second pass, it read back the FIRST pass's own write and concluded "already
   seen" — so the intro would decide to show, then immediately un-decide, netting out to never
   showing, but only in dev (production never double-invokes). Fixed with a `useRef` guard so the
   real decision is made exactly once per component instance; the redundant second invocation sees
   the guard already set and leaves the first invocation's state untouched.
2. **The black scrim rendered translucent in a screenshot, real page content bleeding through, on a
   FRESH page load with no interaction yet** — despite `getComputedStyle` reporting fully correct
   values (`opacity: 1`, opaque `background`). This is the same category of bug as F-41's mobile
   walkthrough finding: a Chromium headless-capture paint artifact tied to a CSS
   transition/`@starting-style` fade-in, not a logic error — confirmed by three tests: (a) forcibly
   disabling all animation/transition site-wide fixed it instantly; (b) a single real mouse-move
   event on the already-loaded page fixed it without any code change; (c) it never reproduced with
   the fade-in removed. Given this element is the very first thing every visitor sees, the fade-in
   entrance was removed entirely rather than kept on the theory that it's "probably fine for real
   users" — the scrim now appears fully opaque INSTANTLY on mount, with no transition to race. The
   fade-OUT on dismiss keeps its transition, since dismissal only ever follows a genuine user
   interaction (click/Escape/Skip/CTA) — by definition a moment the compositor has already done
   real work, unlike a transition racing the very first paint.

**Verification.** `npx tsc --noEmit` clean. `npm test` — 48/48 suites, 0 failed. `npm run lint` — 0
issues in every file this pass touched (`OrbCore.tsx`, `BrandOrb.tsx`, `CinematicIntro.tsx`,
`Landing.tsx`, `marketing.css`); pre-existing unrelated issues elsewhere untouched. `npm run build`
clean. `axe-core` run live against both `/` and `/ar` WITH the intro overlay showing: zero
violations, both languages. Live-browser checks, both languages, desktop (1440×1000) and mobile
(390×844, DPR 3): raw HTML (no JS) still contains the real headline/CTA; a fresh visit shows the
intro; Skip, Escape-equivalent CTA click, and a plain reload-in-same-session all behave correctly
(skip dismisses and reveals the real hero with no residual click-blocking element; same-session
reload does not replay it); `prefers-reduced-motion` never shows the intro at all; no horizontal
overflow at any tested size; zero console/page errors; the main (non-intro) hero orb, unaffected by
the `OrbCore` refactor, still renders its full plasma detail with no regression.

**Explicitly not done this pass** (Phases 2–5 of the brief, honestly flagged rather than silently
implied as covered by "Phase 1 shipped"):
- The eight cinematic product scenes (Career Profile / Job Description / Tailoring / Career Road /
  Mission Control / Interview / Pricing / Final) as their own animated, scroll-choreographed demo
  components.
- Redesigning `/account` into "Mission Control," redesigning the interview page around the orb as
  interviewer, and wiring `OrbState` into the builder, dashboard, notifications, or any authenticated
  surface — the orb component now CAN express all ten states; nothing outside the landing page's own
  intro/hero calls it with anything but the default `idle` yet.
- The public/authenticated navigation split described in the brief.
- Any change to `/pricing`, `/interview`, `/interview-live`, `/account`, or any authenticated route —
  none of those files were touched this pass.

### F-44 · P0 · Phase 2 of the cinematic Career-OS experience: the hero becomes one continuous four-step story — FIXED, PARTIAL

Direction: continuing the brief's Scene 2/3 ("the hero transforms into the product" — Career Profile
fills in, a job posting arrives, the resume tailors to it, the ATS match rises with the reason
shown) — the first real caller of F-43's orb state machine, which shipped with no caller.

**`HeroExperience.tsx`** (new) — a small client wrapper owning one step timer (`0..3`, 3.4s per
step, paused on `document.hidden`, off under `prefers-reduced-motion`), feeding the SAME step into
both `BrandOrb`'s `orbState` (idle → analyzing → thinking → success) and the new
`CareerProfileScene`. Exists as its own component only because `Landing.tsx` is a server component
and cannot hold this state itself, and because the orb and the card are positioned siblings in the
hero, not parent/child.

**`CareerProfileScene.tsx`** (new) — the four beats: Career Profile fills in (Job Title, Experience,
Skills), a Job Posting arrives (Role, Employer, Requires), Tailoring happens (three concrete content
changes, not just a number), then the ATS Match score counts up through three real stages
(61 → 83 → 91) with the reason for the rise shown alongside it, not just the final number — matching
the brief's explicit "not just a number" requirement. Uses the exact example (Radiology
Technologist, CT/MRI/PACS, City Medical Center) the brief itself specified, kept distinct from the
Accountant example the rest of the landing page already uses. Reuses `.walk-card`/`.walk-line`/
`.walk-tag`/`.walk-progress-compact` — the same primitives F-42 already proved safe in this exact
hero position — and deliberately applies NO `t-materialize`/`t-stagger` animation classes to these
lines, for the same reason F-41 found that exact animation painting blank on a real mobile viewport
next to the orb's own always-animating layers.

`DemoWalkthrough.tsx`'s `compact` mode (the old cycling hero preview F-41/F-42 built) is removed —
`HeroExperience`/`CareerProfileScene` replace it in the hero; the full 8-beat walkthrough further
down the page is untouched.

**A real content bug found and fixed during verification, not a code bug:** the ATS score reason
text originally read "+30 for CT · MRI · PACS keywords, +8 for reordered experience" against stages
61 → 83 → 91 — but 61 + 30 + 8 = 99, not 91. The actual deltas are +22 then +8. Caught by eye while
screenshot-reviewing the live score card (not by any test — nothing in this codebase currently
asserts that an illustrative reason string's numbers sum to its displayed total). Fixed by
correcting the reason text to "+22 for CT · MRI · PACS keywords, +8 for reordered experience"
(and its Arabic-digit equivalent) rather than changing the stage numbers, since 61/83/91 are the
exact values the brief specified. Filed here rather than silently amended, per this codebase's own
no-fabricated/inconsistent-numbers doctrine.

**A real, legitimate test catch, fixed properly rather than bypassed:** `ops/i18n.test.mjs`'s
"no Arabic string is the English one copied over" check correctly flagged `"CT · MRI · PACS"` —
identical text in both language blocks. `PACS` alone was already allowlisted as a legitimate
untranslated acronym (international imaging-system name), but the test's `LATIN_TOKEN_OK` regex only
matched single tokens, not a middle-dot-joined list of them, and `CT`/`MRI` were not yet allowlisted
at all. Fixed at the test, not the component: added `CT` and `MRI` alongside `PACS` and a repeatable
`(?:CT|MRI|PACS)(?:\s*·\s*(?:CT|MRI|PACS))*` alternative so a middle-dot-joined run of these specific
imaging acronyms — alone or combined — passes, while any other untranslated English string in an
Arabic block still fails as before.

**Verification.** `npx tsc --noEmit` clean. `npm test` — 48/48 suites, 0 failed (including the fixed
i18n suite). `npm run lint` — zero issues in every file this pass touched
(`CareerProfileScene.tsx`, `HeroExperience.tsx`, `DemoWalkthrough.tsx`, `Landing.tsx`,
`marketing.css`); `AtsScoreReveal.tsx`'s only change was an unrelated F-42-sweep font-size fix, and
its pre-existing `react-hooks/set-state-in-effect` lint error (same reduced-motion synchronous-
setState pattern this pass's `CareerProfileScene.tsx` also uses) is baseline, not introduced here.
`npm run build` clean, page count unchanged. Live-browser checks against the local dev server (this
sandbox still cannot reach `cv.rabit.sa` — not re-verified against production, same standing
limitation as F-42/F-43), both languages, desktop (1440×1000) and mobile (390×844): the four-step
story cycles correctly, the orb visibly changes state in sync with the card, the score count-up
reaches 91% and settles, RTL renders correctly in Arabic including the score card and progress dots,
no horizontal overflow at mobile width, no console errors.

**Explicitly not done this pass** (Phase 2 covers only the hero's own four-step story — the rest of
the brief's Scene 3 onward is still open): the Job Description panel as its own distinct entering
element (folded into the same card's step 2 rather than a separate animated panel); Scene 4's
scroll-camera treatment (still not implemented, and per F-43's own note, will not be — conflicts with
`transitions.css` §9's crash-tested no-scroll-linked-JS rule; one-time triggered reveals remain the
substitute); Career Road, Mission Control, Interview-as-orb, Pricing, and Final scenes (Phases 3–4);
any change to the authenticated app, navigation split, or non-landing routes (Phase 5).

### F-45 · P0 · Phase 3 of the cinematic Career-OS experience: the Career Road and Mission Control — FIXED, PARTIAL

Direction: the brief's Scene 5 ("Career Road — a large visual journey") and Scene 6 ("Career
Mission Control dashboard, not an accounting dashboard"). Both scenes already had a close
equivalent shipped on the landing page (F-40's six-stop journey timeline, F-41's dashboard
preview) — this pass is a visual reframing of those two existing, already-tested sections rather
than new components, matching this brief's own instruction not to add sections where an existing
one already carries the content.

**Career Road** — the old `.timeline`, a plain vertical list with a thin left-hand line and small
dot markers, is replaced by `.road`: the same six stops (Discover/Build/Tailor/Apply/Interview/Get
hired, unchanged copy, both languages) as numbered, iconed circles VISIBLY connected by a line
running through each circle's own center — horizontal on desktop (six across, in the section's
widened `max-w-[1200px]` container), rotating to the old vertical arrangement on mobile via one
media query, same connecting-line mechanism in both orientations. `.t-stagger` on the row gives a
one-time staggered rise on mount — deliberately NOT `.t-materialize`, which this codebase reserves
for an AI answer arriving (see `transitions.css` §15's own doctrine comment); a road diagram is not
that, so pairing them would misuse the class's meaning even though it's visually available.

**Mission Control** — the existing dashboard-preview panel (`.dash`: two progress rings, three stat
cards, a next-action banner) gains a header bar (`.mc-bar`): a small static `BrandOrb` (the `logo`
CSS-only variant — zero client JS, no `orbState`, same as every other non-hero call site), a title
("Sira Mission Control" / "لوحة تحكم سيرة"), the "illustrative example" disclosure moved up from the
footer into this bar, and a small pulsing green dot on the trailing edge suggesting a live system
rather than a static mockup. Kicker/heading copy reframed toward "command center" language in both
languages. No new data, no new claims — the same illustrative numbers F-41 already labeled as such.

**Verification.** `npx tsc --noEmit` clean. `npm test` — 48/48 suites, 0 failed (the new emoji/Arabic
strings in `journey` pass the i18n suite without changes — icons are non-text glyphs, not
untranslated words). `npm run lint` — zero issues in `Landing.tsx`/`marketing.css`. `npm run build`
clean, page count unchanged. Live-browser checks against the local dev server (still not
`cv.rabit.sa` — same standing limitation as F-42 through F-44), both languages, desktop
(1440×1200) and mobile (390×844): the road's connecting line and RTL mirroring both render
correctly, Arabic-Indic numerals appear in the node badges, the Mission Control header bar and its
live dot render correctly in both writing directions, zero horizontal overflow at mobile width in
either section.

**Explicitly not done this pass**: Scene 7 (Interview experience with the orb as interviewer — no
fake avatar), Scene 8 (pricing), and the Final scene remain Phase 4; the public/authenticated
navigation split and wiring `OrbState` into the builder/dashboard/interview/notifications remain
Phase 5. Scene 4's scroll-camera request remains declined for the same crash-tested reason stated in
F-43/F-44.
