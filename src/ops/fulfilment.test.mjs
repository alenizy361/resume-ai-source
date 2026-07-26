/**
 * Paying once must grant once.
 *
 * ── the three defects this pins, all of them live before it ──
 *
 *   1. `grantEntitlement` was an unconditional overwrite, and `/api/pay/verify` computes
 *      `until = now + window` on every call. Re-opening the callback URL from browser history 89
 *      days after a 90-day pack renewed it for another 90 — indefinitely, from one payment. And it
 *      was not an exotic path: the callback page's effect depends on `owner`, which changes when
 *      `/api/auth/me` answers, so the ordinary happy path fired verify twice.
 *
 *   2. A receipt email AND a fresh 15-minute magic sign-in token were sent on EVERY call, with no
 *      authentication beyond a `transactionNo` that lives in browser history and referrers. An
 *      unauthenticated sign-in-link oracle pointed at the buyer's inbox.
 *
 *   3. The entitlement key was `base64url(email).replace(/-/g, "_")`, which folds two distinct
 *      alphabet characters into one. Two emails could share a key — one account reading, and on the
 *      next purchase overwriting, another's paid access.
 *
 * Run against a fake Upstash speaking the real REST shape, for the same reason as
 * `ops/resumeserver.test.mjs`: the thing under test is a conversation with a store, and stubbing the
 * store's client asserts only that the code calls the functions it calls.
 *
 *   node --experimental-strip-types ops/fulfilment.test.mjs
 */

import { createServer } from "node:http";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => {
  if (c) { pass++; console.log(`✅ ${n}`); }
  else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); }
};

const store = new Map();
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    const [cmd, key, value] = JSON.parse(body);
    let result = null;
    if (cmd === "GET") result = store.has(key) ? store.get(key) : null;
    else if (cmd === "SET") { store.set(key, value); result = "OK"; }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ result }));
  });
});
await new Promise((r) => server.listen(0, r));
process.env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${server.address().port}`;
process.env.UPSTASH_REDIS_REST_TOKEN = "t";

const E = await import("../app/lib/entitlements.ts");

const DAY = 24 * 60 * 60 * 1000;
const BUYER = "buyer@example.com";

/* ── 1. one transaction fulfils once ──────────────────────────────────────────────── */
console.log("\n── a transaction can be claimed exactly once ──");
{
  ok("the first claim wins", (await E.claimTransaction("TX-1", 1000)) === true);
  ok("the second is refused", (await E.claimTransaction("TX-1", 2000)) === false);
  ok("and the third", (await E.claimTransaction("TX-1", 3000)) === false);
  ok("a different transaction is unaffected", (await E.claimTransaction("TX-2", 4000)) === true);
  /* This is what stops the receipt + magic-token oracle: fulfilment is gated on the claim, so a
     replayed callback URL cannot mint a second sign-in link. */
  ok("an empty transaction number can never claim", (await E.claimTransaction("", 5000)) === false);
}

/* ── 2. the grant never shortens, and a replay cannot extend ──────────────────────── */
console.log("\n── re-verifying a payment does not renew it ──");
{
  const t0 = 1_000_000_000_000;
  ok("the purchase grants 90 days", (await E.grantEntitlement(BUYER, t0 + 90 * DAY)) === true);
  ok("stored as given", (await E.getEntitlement(BUYER)) === t0 + 90 * DAY);

  /*
   * ── the two halves have to be tested together, and the first draft of this test got it wrong ──
   *
   * `Math.max` alone does NOT stop the replay, and asserting that it does was a test written against
   * a hope rather than the design. The route recomputes `until = now + window`, so a replay 89 days
   * later asks for a LATER expiry — and a maximum correctly accepts a later one. That is the whole
   * point of the maximum, and it is why the claim exists.
   *
   * So the property is a property of the COMPOSITION, and it is modelled here exactly as
   * `/api/pay/verify` composes it: claim first, fulfil only if the claim was won.
   */
  const fulfil = async (tx, now, windowMs) => {
    if (!(await E.claimTransaction(tx, now))) return false;
    await E.grantEntitlement(BUYER, now + windowMs);
    return true;
  };

  ok("the real purchase fulfils", (await fulfil("TX-PAY", t0, 90 * DAY)) === true);
  const granted = await E.getEntitlement(BUYER);

  const later = t0 + 89 * DAY;
  ok("a replay 89 days later does not fulfil at all", (await fulfil("TX-PAY", later, 90 * DAY)) === false);
  ok("so the window is untouched — one payment, one 90-day pack",
    (await E.getEntitlement(BUYER)) === granted, `${granted} → ${await E.getEntitlement(BUYER)}`);

  /* And the maximum's own job, which the claim does not cover: a genuine SECOND purchase, with its
     own transaction, must never shorten an entitlement that still has longer to run. */
  ok("a real 24-hour purchase during an active pack fulfils",
    (await fulfil("TX-PAY-2", t0 + DAY, 1 * DAY)) === true);
  ok("but does not cut the pack down to tomorrow",
    (await E.getEntitlement(BUYER)) === granted, `${await E.getEntitlement(BUYER)}`);

  /* …while one that reaches further does extend. */
  ok("a real longer purchase extends", (await fulfil("TX-PAY-3", t0 + 2 * DAY, 400 * DAY)) === true);
  ok("to the further date", (await E.getEntitlement(BUYER)) === t0 + 2 * DAY + 400 * DAY);
}

/* ── 3. a charged customer with no grant is never silent ──────────────────────────── */
console.log("\n── a write that could not happen is reported ──");
{
  /*
   * In a CHILD PROCESS, because `entitlements.ts` reads its credentials into module-level constants
   * at import time. Clearing `process.env` in this process after importing changes nothing — the
   * first attempt at this test did exactly that and passed against a module that was still fully
   * configured, which is a green tick for an assertion that ran on the wrong subject.
   *
   * That import-time capture is correct for production, where the environment is fixed at boot. It
   * simply means "what happens with no store" is a question only a fresh process can answer.
   */
  const { execFileSync } = await import("node:child_process");
  const probe = `
    const E = await import("./app/lib/entitlements.ts");
    const grant = await E.grantEntitlement("nobody@example.com", Date.now() + 86400000);
    const claim = await E.claimTransaction("TX-NOSTORE", 1);
    console.log(JSON.stringify({ grant, claim, configured: E.storeConfigured() }));
  `;
  let out = {};
  try {
    const env = { ...process.env };
    for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL",
      "KV_REST_API_TOKEN", "EDGE_CONFIG_ID", "EDGE_CONFIG_READ_TOKEN", "VERCEL_API_TOKEN"]) delete env[k];
    out = JSON.parse(execFileSync(process.execPath,
      ["--experimental-strip-types", "--input-type=module", "-e", probe],
      { env, encoding: "utf8" }).trim());
  } catch (e) { out = { error: String(e).slice(0, 120) }; }

  ok("with no store, the module says so", out.configured === false, JSON.stringify(out));
  /* The failure that must never be silent: a customer is charged and nothing is written. It used to
     return `void` either way, so the caller could not tell and nothing was logged. */
  ok("granting reports false rather than returning nothing", out.grant === false, JSON.stringify(out));
  ok("and claiming refuses, so nothing is fulfilled twice later", out.claim === false, JSON.stringify(out));
}

/* ── 4. two accounts, two keys ────────────────────────────────────────────────────── */
console.log("\n── distinct emails cannot share an entitlement ──");
{
  /*
   * The Redis path keys on the plain email, so it was never exposed to the base64url collision —
   * the Edge Config path was. What is asserted here is the property that matters and that both
   * paths must hold: granting to one account changes nothing for another.
   */
  const a = "a.person@example.com", b = "b.person@example.com";
  await E.grantEntitlement(a, 5_000_000);
  ok("the other account has nothing", (await E.getEntitlement(b)) === 0);
  await E.grantEntitlement(b, 9_000_000);
  ok("and granting to it leaves the first alone", (await E.getEntitlement(a)) === 5_000_000);
  ok("each holds its own value", (await E.getEntitlement(b)) === 9_000_000);

  /* Case and whitespace are the same account, not two — a buyer who typed a capital at checkout
     must not end up with an entitlement they cannot find when they sign in lower-case. */
  ok("case and spacing resolve to one account",
    (await E.getEntitlement("  A.Person@Example.COM  ")) === 5_000_000);
}

/* ── 5. the encoding property, asserted on the source ─────────────────────────────── */
console.log("\n── the key function is injective again ──");
{
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("app/lib/entitlements.ts", "utf8");
  const decls = src.replace(/\/\*[\s\S]*?\*\//g, "");
  /*
   * `.replace(/-/g, "_")` on a base64url string is the collision. It may appear ONCE — in the
   * legacy reader that keeps pre-fix customers working — and never in the function that writes.
   */
  const folds = [...decls.matchAll(/replace\(\/-\/g,\s*"_"\)/g)];
  ok("the fold survives in exactly one place", folds.length === 1, `${folds.length} occurrences`);
  ok("and that place is the legacy read-only key",
    /legacyKey\s*=\s*\(email: string\)\s*=>[^\n]*replace\(\/-\/g/.test(decls));
  ok("the writing key does not fold",
    /const key = \(email: string\) => "ent_" \+ encode\(email\);/.test(decls));
  ok("and the legacy key is still consulted, so nobody who paid loses access",
    /legacyKey\(email\)/.test(decls));
}

/* ── 6. a refund takes the access back ────────────────────────────────────────────── */
console.log("\n── the 7-day money-back guarantee we advertise ──");
{
  /*
   * Every receipt this product sends ends with "7-day money-back guarantee applies", and until now
   * nothing could act on one: Paylink's refund webhook is documented, and there was no endpoint to
   * receive it, so a refunded customer kept the entitlement they had been refunded for.
   */
  const R = "refunded@example.com";
  const t = 2_000_000_000_000;
  await E.grantEntitlement(R, t + 90 * DAY);
  ok("the customer has access", (await E.getEntitlement(R)) === t + 90 * DAY);

  ok("revoking reports success", (await E.revokeEntitlement(R, t)) === true);
  const after = await E.getEntitlement(R);
  ok("and access has ended", after < t, String(after));
  ok("via an explicit past expiry, not a deleted key", after > 0, String(after));

  /*
   * The distinction the past-timestamp buys: `getEntitlement` returns 0 both for a missing key and
   * for a store that failed, because it swallows its errors on purpose. Deleting would make
   * "refunded" indistinguishable from "the store blinked" — and `grantEntitlement` takes a maximum
   * against the current value, so it would then see 0 and write whatever it was handed.
   */
  await E.grantEntitlement(R, t + 1 * DAY);
  ok("a later genuine purchase still works after a refund",
    (await E.getEntitlement(R)) === t + 1 * DAY);

  ok("revoking nobody is refused", (await E.revokeEntitlement("")) === false);

  /* And the route's own contract, which is specified rather than guessed — unlike the payment
     webhook next door, whose field names could not be looked up. */
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("app/api/pay/refund/route.ts", "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

  ok("the route reads X-API-KEY, not Authorization",
    /headers\.get\("x-api-key"\)/.test(code) && !/headers\.get\("authorization"\)/.test(code));
  ok("and compares it in constant time", /sameSecret\(given, expected\)/.test(code));
  /* Stricter than the payment webhook on purpose: that one only ever GRANTS what Paylink confirms,
     this one REMOVES access and has no server-side refund check to verify a claim against. */
  ok("with no key configured it refuses rather than revoking",
    /if \(!expected\)/.test(code) && /status: 503/.test(code));

  /* The case a careless handler gets exactly backwards: `Failed` means the refund did NOT happen. */
  ok("only `Refunded` revokes", /refundStatus\.toLowerCase\(\) !== "refunded"/.test(code));
  ok("and a failed refund is acknowledged without revoking",
    /revoked: false, reason: `status:/.test(code));

  /* The provider reads the body, not just the status code, and retries ten times on anything else. */
  ok("the documented success body is returned", /const OK = \{ status: "success" \}/.test(code));

  /* The buyer's email comes from OUR checkout record. A refund notice naming an email would be a way
     to revoke a stranger's access. */
  ok("the email is looked up, never taken from the request",
    /getOrderEmail\(orderNumber\)/.test(code) && !/body\.email/.test(code));
}

server.close();
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
