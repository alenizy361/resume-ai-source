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

### O-11 · P1 · Arabic detection ranges disagree across the export paths

`PdfExport` tests U+0600–06FF; `cvHeadings.hasArabic` tests U+0600–06FF plus U+0750–077F.
Neither covers Arabic Extended-A or the presentation forms that `importCv.ts` itself
documents PDF producers as emitting. Text in those ranges passes the PDF guard and renders
as mojibake with no warning, and Word lays it out left-to-right with the Latin font.

**Narrowed by F-18, not closed.** `cvHeadings.ts` now holds the range in one constant
(`ARABIC_RANGE`), shared by `hasArabic` and the new `dominantScript`, so the two script questions
this file answers cannot disagree with each other. `PdfExport` still carries its own literal, and
neither covers Extended-A or the presentation forms — one place to widen instead of two, and the same
bug until someone widens it.

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

### O-14 · P1 · `/resume-examples` has a CLS of 0.25 at load

Found while verifying that `content-visibility` had not introduced layout shift. It had not —
the figure is **identical with and without it**, so this is pre-existing:

| page | CLS at load | after a full scroll down and back |
|---|---|---|
| `/resume-examples` | **0.2489** | 0.2489 |
| `/ar/resume-examples` | 0.0398 | 0.0398 |
| `/resume-examples/registered-nurse`, `/`, `/pricing` | 0.0000 | 0.0000 |

Google's threshold for "good" is 0.1 and "poor" starts at 0.25, so the English catalogue index
is at the edge of poor — on a page whose entire purpose is organic search, which is the
product's only acquisition channel.

One shift entry, sourced to `mx-auto max-w-4xl px-6 pb-16` and `mb-10` — a container and a
block near the top, not the card grid. The Arabic equivalent shifts by a sixth as much, which
points at something language-specific in the header area rather than at the layout itself.

Not fixed here: this turn's budget went to the crash. It is cheap to investigate — one page,
one shift entry, a named source — and it is worth doing before more catalogue pages are added,
because whatever causes it is in a shared template.

### O-15 · P1 · Static pages ship 400–800 KB of JavaScript, and the cause is one line's position

Measured with `next start`, 390px viewport, uncompressed script bodies:

| page | JS | chunks |
|---|---|---|
| `/resume-examples` | 409–641 KB | 15–39 |
| `/resume-examples/registered-nurse` | 570–810 KB | 20–41 |
| `/` | 720 KB | 37 |

These are server components rendering headings, lists and links. They need no client JavaScript
at all. For comparison the same pages carry 145–309 DOM nodes and 34–70 KB of HTML — **the
JavaScript is roughly ten times the content it decorates.**

**The cause.** `RootShell` — which wraps every route — renders `<Analytics />` and
`<FunnelBeacon />`, and both are `"use client"`. A client component in the ROOT layout puts the
client boundary at the top of every route, so React's client runtime and the client-component
manifest ship to all 357 static catalogue pages. The bytes are not those two components' own
size; they are the cost of having any client component that high in the tree.

`SpaceBackdrop` was checked and is already a server component. `BrandOrb` too — a `grep` for
`"use client"` matches its comment text, which is a false positive worth knowing about.

**An attempt was made and reverted.** Replacing both with plain `<script>` tags — Vercel
Analytics is only a script that defines `window.va`, and the beacon is one `sessionStorage` key
plus one event — is the right shape. Two things stopped it shipping:

1. **The inline beacon did not fire.** Nothing written to `ra_funnel_entry`, no event, on any
   page. Not diagnosed. Shipping silent analytics is worse than shipping heavy analytics,
   because a wrong number looks exactly like a right one.
2. **The saving did not reproduce.** Deleting the two components measured 109 KB on
   `/resume-examples`; reimplementing them as scripts measured 409 KB on the same page. Turbopack
   chunk splitting varies between builds, so a single before/after pair is not evidence. The
   83% figure should be treated as unverified until it is measured across repeated builds.

**What a correct fix needs**, so the next attempt starts further along: the two features moved out
of the root layout without becoming React client components; the beacon's referrer and
page-family classification kept in ONE place rather than duplicated into a script — the
duplication is the real hazard, because analytics drift is silent; a repeated-build measurement
rather than one pair; and a test that the entry is stamped once per session and the event fires,
which `ops/funnel.test.mjs` does not currently assert against a browser.

**Not a proven cause of the iOS crash.** It is a real weight problem worth fixing on its own
terms — on pages whose only purpose is organic search, where payload is a ranking input — but the
two crash causes that were measured and fixed were GPU-side (F-7, F-8, F-10), not JavaScript.

### O-16 · P3 · The old design leaves dead CSS, but nothing of it is running

Raised as a hypothesis for the iOS crash — "maybe the old design is still running in the
background". Checked directly, and it is not. Measured on the pages that crash, 390px viewport:

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

**What the old design does leave** is roughly **4.6 KB of dead rules** in `globals.css` (of
35.6 KB) — `reveal-aurora`, `stage-orb`, `breathe`, `dock`, `float-slow`, `marquee`, `ia-*`,
`improved-banner`, `aurora-burst`, `gold-stamp`, `reveal-pop`, `reveal-rise`. Their class names
appear in no `className` in the codebase. `scanSweep` is the one exception: it is referenced
from `ScanDemo.tsx` as an inline `animation`, which is why a plain class-name sweep must not be
the only check before deleting any of them.

Dead stylesheet rules cost parse time and nothing else — they are not composited, not animated,
and not in the DOM. So this is a tidiness item, not a performance one, and deliberately filed
P3 rather than dressed up as a fix.

**Left undone on purpose.** Deleting them is safe only with a check that each is unreferenced
by inline styles and string concatenation as well as by `className`, and that check is the work.
Doing it carelessly is how a live control loses its animation months later.
