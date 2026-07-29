/**
 * Where a payment provider is allowed to send a buyer back, and who may fulfil an order.
 *
 * ── the two defects pinned here ──
 *
 *   O-2  `/api/pay` built the invoice's `callBackUrl` from the request's `Origin` header, with no
 *        allow-list, on an unauthenticated endpoint. Any caller could mint a real Paylink invoice
 *        whose return URL pointed at a host they control — the buyer pays on Paylink's own page and
 *        lands somewhere else, carrying a live payment reference.
 *
 *   O-1  there was no webhook. The only thing that granted access was the buyer's browser coming
 *        back. Close the tab on the payment page and you are charged with no entitlement, no receipt
 *        and no sign-in link.
 *
 * The interesting cases for the first are the ones that must be REFUSED, and those are invisible from
 * the route's happy path — which is why `allowedOrigin` is exported and tested directly.
 *
 *   node --experimental-strip-types ops/paycallback.test.mjs
 */

import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => {
  if (c) { pass++; console.log(`✅ ${n}`); }
  else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); }
};

process.env.NEXT_PUBLIC_APP_URL = "https://cv.rabit.sa";
/* From `lib/payOrigin.ts` rather than the route: a route file imports `next/server` and cannot
   be loaded outside Next, which is why the helper lives in a module of its own. */
const { allowedOrigin } = await import("../app/lib/payOrigin.ts");

/* ── 1. the allow-list ────────────────────────────────────────────────────────────── */
console.log("\n── the return URL is not the caller's choice ──");
{
  const APP = "https://cv.rabit.sa";

  ok("the app's own origin is kept", allowedOrigin("https://cv.rabit.sa") === APP);
  ok("a missing Origin falls back to the app", allowedOrigin(null) === APP);
  ok("so does an unparseable one", allowedOrigin("not a url") === APP);

  /* The attack, stated plainly: an invoice whose buyer is returned to a host the attacker owns. */
  ok("another host is refused", allowedOrigin("https://attacker.example") === APP);
  ok("and a lookalike is refused", allowedOrigin("https://cv.rabit.sa.attacker.example") === APP);

  /*
   * The two suffix mistakes a naive `endsWith(".vercel.app")` makes. Both must fail, and the second
   * is the one that looks safe: `vercel.app.attacker.com` ENDS WITH nothing suspicious to a reader.
   */
  ok("`evil-vercel.app` is not a Vercel deployment", allowedOrigin("https://evil-vercel.app") === APP);
  ok("nor is `vercel.app.attacker.com`", allowedOrigin("https://vercel.app.attacker.com") === APP);

  /* Previews DO have to work, because a real test purchase is the only way this path is ever
     verified — no Paylink credential exists outside production. */
  ok("this project's preview deployment is allowed",
    allowedOrigin("https://resume-ai-abc123.vercel.app") === "https://resume-ai-abc123.vercel.app");

  /* No downgrade: a return URL is where a paying customer lands, and plain HTTP there is a
     cleartext hop carrying a payment reference. */
  ok("http is refused", allowedOrigin("http://cv.rabit.sa") === APP);
  ok("http on a preview host is refused too", allowedOrigin("http://resume-ai-abc.vercel.app") === APP);
  /* …with development exempted, or nothing can be tested locally. */
  ok("localhost is allowed over http", allowedOrigin("http://localhost:3000") === "http://localhost:3000");

  const route = readFileSync("app/api/pay/route.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  ok("the route no longer falls back to the raw Origin", !/req\.headers\.get\("origin"\)\s*\|\|/.test(route));
  ok("and passes it through the allow-list instead", /allowedOrigin\(req\.headers\.get\("origin"\)\)/.test(route));
}

/* ── 2. one money path, not two ───────────────────────────────────────────────────── */
console.log("\n── the webhook and the browser share one implementation ──");
{
  const webhook = readFileSync("app/api/pay/webhook/route.ts", "utf8");
  const verify = readFileSync("app/api/pay/verify/route.ts", "utf8");
  const fulfil = readFileSync("app/lib/fulfil.ts", "utf8");
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

  ok("the webhook exists", webhook.length > 0);
  ok("both routes call the shared fulfilment",
    /fulfilOrder\(/.test(strip(webhook)) && /fulfilOrder\(/.test(strip(verify)));

  /*
   * The rule that matters on the money path: the grant, the receipt and the sign-in token must exist
   * in exactly ONE place. Two copies is two answers to "was this paid for, and for how long",
   * drifting apart where being wrong costs a customer or costs revenue.
   */
  for (const [name, src] of [["the webhook", webhook], ["verify", verify]]) {
    const code = strip(src);
    ok(`${name} does not grant an entitlement itself`, !/grantEntitlement\(/.test(code));
    ok(`${name} does not mint a sign-in token itself`, !/createMagicToken\(/.test(code));
    ok(`${name} does not send the receipt itself`, !/sendEmail\(/.test(code));
  }
  ok("the shared module does all three",
    /grantEntitlement\(/.test(fulfil) && /createMagicToken\(/.test(fulfil) && /sendEmail\(/.test(fulfil));

  /* Fulfilment is claimed, so the webhook and the browser racing produces one grant and one
     receipt — the guard existed for the browser replaying itself, and the webhook is why it had to
     be keyed on the transaction rather than on the request. */
  ok("fulfilment claims the transaction first", /claimTransaction\(transactionNo/.test(strip(fulfil)));

  /* Nothing in a webhook body is believed. The invoice is fetched from Paylink with this server's own
     credentials, which is what makes the route safe without a shared secret. */
  ok("the webhook re-reads the invoice from the provider", /readInvoice\(transactionNo\)/.test(strip(webhook)));
  ok("and the amount decides the plan, not the caller",
    /amountPlan/.test(strip(fulfil)) && /amountOk/.test(strip(fulfil)));

  /*
   * A provider retries any non-2xx. Answering 500 because our own store blinked would have Paylink
   * re-delivering a completed order for hours, each retry racing the browser path. So the only 5xx is
   * the one case a retry genuinely helps: the provider itself was unreachable.
   */
  const codes = [...strip(webhook).matchAll(/status:\s*(\d{3})/g)].map((m) => m[1]);
  ok("the webhook returns no 500", !codes.includes("500"), codes.join(", "));
  ok("its only 5xx is for an unreachable provider", codes.filter((c) => c.startsWith("5")).every((c) => c === "503"),
    codes.join(", "));

  /* The secret is optional on purpose: a webhook that refuses everything because a variable was never
     pasted is a webhook that silently does not exist, which is the failure being fixed. */
  ok("the secret is checked only when configured",
    /const secret = process\.env\.PAY_WEBHOOK_SECRET;/.test(strip(webhook)) && /if \(secret\)/.test(strip(webhook)));

  /*
   * ── the header name is the merchant's choice, not ours ──
   *
   * The first version read `x-paylink-secret` only. That was a guess, and the account this ships to
   * had already configured `Authorization` in the Paylink dashboard — the conventional choice. A
   * webhook that 401s every delivery while the dashboard shows it correctly set up is the same
   * "silently does not exist" failure this route exists to fix.
   */
  const wcode = strip(webhook);
  ok("the secret is accepted from Authorization", /headers\.get\("authorization"\)/.test(wcode));
  ok("and from a custom header", /headers\.get\("x-paylink-secret"\)/.test(wcode));
  ok("and from the query, which a browser can test with", /searchParams\.get\("secret"\)/.test(wcode));
  ok("a Bearer prefix is tolerated", /\^Bearer/.test(wcode));
  ok("and the compare is constant-time", /timingSafeEqual\(given, secret\)/.test(wcode));
}

/* ── 3. the transaction reference is FOUND, not guessed at ───────────────────────── */
console.log("\n── the webhook reads a payload whose shape we could not look up ──");
{
  /*
   * ── why this is tested against a copy of the finder ──
   *
   * The route imports `next/server` and cannot be loaded outside Next, and the finder is small
   * enough that extracting it to a lib would be a module per function. So the logic is mirrored here
   * and the assertion below pins the mirror to the original: if the route's version changes and this
   * one does not, the pin fails rather than the tests quietly passing against dead code.
   *
   * ── and why a search rather than a field name ──
   *
   * Paylink's documentation is unreachable from this environment — the egress policy refuses
   * `developer.paylink.sa` at CONNECT, and a GitHub code search over community SDKs is outside this
   * session's repository scope. The first version of the route guessed four key names. If the guess
   * were wrong, every delivery would answer 400 while the dashboard showed a correctly configured
   * webhook, and nobody would learn that paid orders were going unfulfilled.
   *
   * So the code stops needing the answer, and these are the shapes it must survive.
   */
  const TXN_SHAPE = /^[A-Za-z0-9_-]{4,64}$/;
  const find = (body, search = {}) => {
    for (const k of ["transactionNo", "transaction_no", "transactionId", "orderNumber"]) {
      const v = search[k];
      if (v && TXN_SHAPE.test(v)) return v;
    }
    const seen = new Set();
    let fallback = "";
    const walk = (node, depth) => {
      if (depth > 6 || node === null || typeof node !== "object") return "";
      if (seen.has(node)) return "";
      seen.add(node);
      for (const [key, value] of Object.entries(node)) {
        const flat = typeof value === "string" ? value.trim()
          : typeof value === "number" ? String(value) : "";
        if (flat && TXN_SHAPE.test(flat)) {
          const name = key.toLowerCase();
          if (name.includes("transaction")) return flat;
          if (!fallback && (name.includes("order") || flat.startsWith("RA-"))) fallback = flat;
        }
        if (value && typeof value === "object") {
          const f = walk(value, depth + 1);
          if (f) return f;
        }
      }
      return "";
    };
    return walk(body, 0) || fallback;
  };

  ok("a flat transactionNo", find({ transactionNo: "1712345678" }) === "1712345678");
  ok("snake_case", find({ transaction_no: "1712345678" }) === "1712345678");
  ok("camelCase Id", find({ transactionId: "abc-123" }) === "abc-123");
  /* The case the guessing version could not survive. */
  ok("a key name nobody guessed", find({ merchantTransactionReference: "XY99881" }) === "XY99881");
  ok("nested under `data`", find({ event: "paid", data: { transactionNo: "777888" } }) === "777888");
  ok("nested twice", find({ payload: { invoice: { transaction_no: "5551212" } } }) === "5551212");

  /* Our own order number is a fallback, never a match: `getInvoice` wants a transaction reference. */
  ok("an order number is used only as a fallback", find({ orderNumber: "RA-single-1712-9" }) === "RA-single-1712-9");
  ok("and a real transaction beats it",
    find({ orderNumber: "RA-single-1", transactionNo: "999000" }) === "999000");
  ok("the query beats the body, so a manual re-check works",
    find({ transactionNo: "body" }, { transactionNo: "fromquery" }) === "fromquery");

  /* Tolerant must not mean credulous. The value only ever becomes a lookup key against Paylink, so a
     bad pick grants nothing — but it must not reach a URL path either. */
  ok("a path traversal is refused", find({ transactionNo: "../../etc/passwd" }) === "");
  ok("something too short is refused", find({ transactionNo: "ab" }) === "");
  ok("an empty body finds nothing", find({}) === "");
  ok("and null finds nothing", find(null) === "");

  const cyclic = { transactionNo: null };
  cyclic.self = cyclic;
  ok("a cyclic payload does not hang the request", find(cyclic) === "");

  /* The pin: this mirror must stay in step with the route it stands in for. */
  const wcode = readFileSync("app/api/pay/webhook/route.ts", "utf8");
  ok("the route uses the same shape guard", /\^\[A-Za-z0-9_-\]\{4,64\}\$/.test(wcode));
  ok("and the same recursive search", /name\.includes\("transaction"\)/.test(wcode));

  /*
   * The payload's field NAMES are logged, and its values are not. A payment webhook carries a
   * customer's name, mobile and email; a log line is the wrong place for any of them. The names are
   * what turn the first real delivery into the documentation this environment cannot fetch.
   */
  const wstrip = wcode.replace(/\/\*[\s\S]*?\*\//g, "");
  ok("the payload shape is logged", /shape: shapeOf\(body\)/.test(wstrip));
  ok("and it is names only, never values",
    /names\.push\(prefix \+ k\)/.test(wstrip) && !/names\.push\([^)]*v\b/.test(wstrip));
}

/* ── an unverifiable payment must not be reported as one that is still processing ── */
{
  /*
   * `/api/pay/verify` answers HTTP 500 with a JSON body — `{ error, paid: false }` — for every
   * verification failure, including any unknown, expired or garbage `transactionNo` (a non-200 from
   * `getInvoice` throws into the route's outer catch). That body PARSES, so the callback's success
   * chain ran on it: `d.paid` falsy, `d.status` undefined, `isDeadStatus(undefined)` false, and the
   * final `else` told the buyer "your payment is still being processed — don't pay again", with a
   * Refresh button that replayed to the same screen forever.
   *
   * `verifyFail` and the Contact-support link were written for exactly this case and were reachable
   * only from `.catch()` — a transport error — so a buyer who may well have been CHARGED got a
   * reassuring "still processing" and no way to reach anybody.
   */
  const { readFileSync } = await import("node:fs");
  const cb = readFileSync("app/(en)/pay/callback/page.tsx", "utf8");
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const cbCode = strip(cb);
  ok("the callback checks res.ok before trusting the body", /if \(!r\.ok\) throw/.test(cbCode),
    "a 500 with a JSON body would otherwise be handled as a successful poll");
  ok("and the support branch is still what a failure lands in",
    /setShowSupport\(true\)/.test(cbCode) && /t\.verifyFail/.test(cbCode));

  /*
   * The Arabic buyer must learn WHICH field was rejected. `CheckoutButton` collapsed every non-OK
   * response — including a field-level 400 — to one generic "تعذّر بدء الدفع، حاول مرة أخرى", so
   * retrying the identical unfixable input failed identically: a dead end at the screen that takes
   * money. `/api/pay` now names the field with a language-neutral code.
   */
  const pay = strip(readFileSync("app/api/pay/route.ts", "utf8"));
  for (const code of ["name", "email", "mobile", "plan"]) {
    ok(`/api/pay names the ${code} rejection with a code`, new RegExp(`code: "${code}"`).test(pay));
  }
  const btn = strip(readFileSync("app/components/CheckoutButton.tsx", "utf8"));
  ok("the modal maps those codes to Arabic rather than discarding them",
    /FIELD_ERR_AR\[String\(data\.code\)\]/.test(btn));
  ok("and every code the server can send has an Arabic sentence",
    ["name", "email", "mobile", "plan"].every((c) => new RegExp(`^\\s*${c}:`, "m").test(btn)));

  /* A phone number's punctuation is formatting, not data. This stripped only spaces and "+", so an
     ordinary "055-123-4567" was rejected — and, before the codes above, rejected mutely. */
  ok("mobile validation strips every non-digit", /replace\(\/\\D\/g, ""\)/.test(pay));
  ok("and the provider is sent the same normalised value the check ran on",
    /clientMobile: mobileDigits/.test(pay));
}

/* ── the page-level notFound() shell: measured, app-wide, NOT fixed ── */
{
  /*
   * Every page-level `notFound()` in this app answers with Next's bare `__next_error__` document —
   * no lang, no dir, no stylesheet, the English homepage title — in BOTH languages
   * (/resume-examples/no-such-job and /resume-skills/nope as much as /ar/zzz). Only the ROUTER-level
   * 404 for an unmatched path renders a real document.
   *
   * No assertion here yet, deliberately: the fix is a structural change above the two route groups
   * and this suite reads source, so a source assertion would only pin whichever guess got written.
   * What IS worth pinning is that the Arabic catch-all keeps its 404 STATUS — a soft 404 returning
   * 200 would turn a rendering bug into an indexing one.
   */
  const cat = readFileSync("app/(ar)/ar/[...missing]/page.tsx", "utf8");
  ok("the Arabic catch-all still returns a real 404", /notFound\(\)/.test(
    cat.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")));
}

/* ── ?lang=ar must never 308 into a 404 ── */
{
  const { readFileSync } = await import("node:fs");
  const px = (t => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""))(readFileSync("proxy.ts", "utf8"));
  /*
   * `AR_TWINS` held prefix patterns for the three catalogs, so they claimed 85 twins where
   * `AR_SLUGS` has 62. For the 23 English-only professions a `?lang=ar` URL redirected straight into
   * a 404 — 69 such URLs across the three trees. The file's own header already promised the opposite
   * ("only when a twin actually exists, so English-only tools are never sent to a 404").
   */
  ok("the catalog patterns no longer match every child",
    !/\/\^\\\/resume-examples\(\\\/\|\$\)\//.test(px),
    "a prefix pattern claims an Arabic twin for all 85 professions");
  ok("the twin check consults the real Arabic slug list", /AR_SLUGS\.includes\(/.test(px));
  ok("and the fully-bilingual sector tree is still redirected",
    /resume-examples\\\/category/.test(px));
}


/*
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE FAILURE SCREEN COMPUTED A REASON AND THREW IT AWAY
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * The body read `state === "failed" && !review ? t.neverLost : detail || t.wait`. Because
 * `failed && !review` always won, `detail` was discarded on every failure — which made
 * `t.statusLine` ("Payment status: declined.") and `t.noTx` DEAD STRINGS that could not render,
 * although both were written for exactly this screen. Every non-success outcome collapsed into one
 * sentence — "Payment didn't go through — try again" — with no reason and no support link, above
 * a button back to the buy page.
 *
 * The dangerous case is the one with NO transaction reference: the back button, a bookmark, or the
 * provider dropping the parameter on the return hop. There we cannot tell whether the customer was
 * charged, so "try again" is the worst available advice — it is the double-payment path printed as
 * an instruction.
 */
{
  console.log("\n── a failed payment says WHY, and an unknown one says it is unknown ──");
  const cb = readFileSync("app/(en)/pay/callback/page.tsx", "utf8");

  ok("the reason is rendered alongside the reassurance, not instead of it",
    /\[detail, t\.neverLost\]\.filter\(Boolean\)\.join\(" "\)/.test(cb));
  ok("so the dead strings are reachable again", /statusLine\(d\.status\)/.test(cb) && /setDetail\(t\.noTx\)/.test(cb));

  ok("a missing reference is its own state, not 'payment failed'", /const \[unresolved, setUnresolved\]/.test(cb));
  ok("with its own title", /unresolved \? t\.unknownTitle/.test(cb));
  ok("and it always offers a human", /setUnresolved\(true\);[\s\S]{0,300}setShowSupport\(true\);/.test(cb));
  ok("its copy tells the customer NOT to pay again, in both languages",
    /Do not pay again/.test(cb) && /\\u0644\\u0627 \\u062a\\u062f\\u0641\\u0639 \\u0645\\u0631\\u0629 \\u0623\\u062e\\u0631\\u0649/.test(cb));
  /* And the loudest control on that screen must not be the one that charges them a second time. */
  ok("the pay-again route is demoted to a quiet secondary when the outcome is unknown",
    /className=\{unresolved \? "mt-6 inline-block text-sm font-semibold"/.test(cb));
  ok("a dead status offers support too", /setDetail\(t\.statusLine\(d\.status\)\);[\s\S]{0,400}setShowSupport\(true\);/.test(cb));

  /*
   * The receipt printed a fourth hardcoded price table. `lib/plans.ts` reads PRICE_SINGLE so a
   * promotion can move the price; this table could not — run the promotion the way plans.ts
   * documents and a buyer charged SAR 19 was handed a receipt saying SAR 35.
   */
  ok("the receipt prints what Paylink actually collected", /const receiptAmount = paidAmount \?\? PLAN_VALUE/.test(cb));
  ok("captured from the verify response", /setPaidAmount\(Number\(d\.amount\)/.test(cb));
  ok("and PLAN_VALUE no longer reaches either receipt surface",
    !/SAR \$\{PLAN_VALUE\[plan/.test(cb) && !/\{PLAN_VALUE\[plan \|\| "single"\] \?\? 35\}<\/span>/.test(cb));
  /* It stays for ad conversion values, where a stale estimate is a dashboard rounding error. */
  ok("but it survives for conversion tracking", /const value = PLAN_VALUE\[paidPlan\] \?\? 35;/.test(cb));
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
