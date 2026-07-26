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
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
