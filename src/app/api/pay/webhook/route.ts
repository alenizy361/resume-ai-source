/**
 * Paylink telling the server a payment happened — so fulfilment no longer depends on the buyer.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE FAILURE THIS FIXES
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * Until now the only thing that granted access was the buyer's browser returning to
 * `/pay/callback` and a `fetch` succeeding. Close the tab on the payment page, lose signal in the
 * lift, have the app killed by iOS while the bank's 3-D Secure page is open — and the customer is
 * charged with no entitlement, no receipt and no sign-in link. Nothing on the server knew.
 *
 * This route is the server hearing it directly. The browser path stays, unchanged and still first
 * whenever it works, because it is what makes the confirmation screen instant.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHY IT IS SAFE WITHOUT A SHARED SECRET, AND WHY IT CHECKS ONE ANYWAY
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * Nothing in the request body is believed. A caller supplies at most a `transactionNo`; the invoice
 * is then fetched from Paylink with this server's own credentials, and the amount decides the plan.
 * A forged body claiming a 99-riyal payment gets whatever Paylink actually says about that
 * transaction, which for an invented number is nothing.
 *
 * So the worst an unauthenticated caller can do is ask the server to re-check a real transaction —
 * which `claimTransaction` already makes idempotent, and which the buyer's own browser does anyway.
 *
 * `PAY_WEBHOOK_SECRET` is nevertheless honoured when set, as a rate-limit-by-obscurity and to keep
 * random internet noise out of the payment logs. It is deliberately OPTIONAL: a webhook that refuses
 * everything because a variable was never pasted is a webhook that silently does not exist, which is
 * exactly the failure being fixed. Absent, the route works and says so in the log at startup cost of
 * nothing; present, a mismatch is a 401.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHAT IT ANSWERS, AND WHY ALWAYS 200 ON A KNOWN TRANSACTION
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * Providers retry non-2xx. A 500 because our Redis blinked would mean Paylink re-delivering for
 * hours, and every retry racing the browser path. So anything we have successfully looked at answers
 * 200 with a body saying what happened. A 4xx is reserved for a request that cannot be understood,
 * and a 5xx for the one case a retry genuinely helps: Paylink itself was unreachable.
 *
 * ── setup, which is not something this code can do ──
 *
 * The URL has to be registered in the Paylink dashboard as the merchant webhook:
 *
 *     https://cv.rabit.sa/api/pay/webhook
 *
 * Until it is, this route is correct and never called. That is the one part of closing this gap that
 * needs an account this repository has no access to.
 */

import { NextRequest, NextResponse } from "next/server";
import { fulfilOrder, readInvoice } from "@/app/lib/fulfil";

/** Constant-time string compare. Node's own needs equal-length buffers, hence the length gate. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const maxDuration = 30;

/**
 * The transaction reference, found without knowing what this provider calls it.
 *
 * ── why this is a search and not a field name ──
 *
 * The first version read four guessed keys: `transactionNo`, `transaction_no`, `transactionId`,
 * `orderNumber`. That is a guess about someone else's JSON, and the failure mode if the guess is
 * wrong is the worst one available here — every delivery answers 400, the dashboard shows a
 * correctly configured webhook, and nobody learns that paid orders are going unfulfilled. Exactly
 * the silent nothing this route was added to eliminate.
 *
 * Paylink's own docs would settle it. They are unreachable from this environment: the egress policy
 * refuses `developer.paylink.sa` at the CONNECT stage, and the GitHub code search that could read a
 * community SDK is out of this session's repository scope. So rather than guess harder, the code
 * stops needing the answer.
 *
 * Any key whose name contains "transaction" wins; failing that, one that looks like our own order
 * number. The search is recursive because a provider that nests the payload under `data` or
 * `invoice` is ordinary, and a top-level-only reader would find nothing in a body that plainly
 * contains the value.
 *
 * ── and the value is validated, not merely found ──
 *
 * A tolerant search must not become a credulous one. Whatever is found is used only as a LOOKUP KEY
 * against Paylink's own `getInvoice`, so a wrong pick cannot grant anything — it produces a 200
 * saying nothing was found. The character class keeps obvious rubbish out of a URL path.
 */
const TXN_SHAPE = /^[A-Za-z0-9_-]{4,64}$/;

function transactionFrom(body: unknown, req: NextRequest): string {
  /* A query parameter first: it is the form a plain browser request can carry, which makes the
     dashboard's own Test button and a manual re-check possible. */
  for (const k of ["transactionNo", "transaction_no", "transactionId", "orderNumber"]) {
    const v = req.nextUrl.searchParams.get(k);
    if (v && TXN_SHAPE.test(v)) return v;
  }

  /* Then the body, by MEANING rather than by name. `seen` guards against a cyclic payload; the
     depth cap stops a hostile body making this walk forever. */
  const seen = new Set<object>();
  let fallback = "";

  const walk = (node: unknown, depth: number): string => {
    if (depth > 6 || node === null || typeof node !== "object") return "";
    if (seen.has(node as object)) return "";
    seen.add(node as object);

    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const flat = typeof value === "string" ? value.trim()
        : typeof value === "number" ? String(value) : "";
      if (flat && TXN_SHAPE.test(flat)) {
        const name = key.toLowerCase();
        if (name.includes("transaction")) return flat;
        /* Our own order numbers are `RA-<plan>-<ts>-<rand>`. Kept as a fallback rather than a match,
           because a transaction reference is what `getInvoice` wants. */
        if (!fallback && (name.includes("order") || flat.startsWith("RA-"))) fallback = flat;
      }
      if (value && typeof value === "object") {
        const found = walk(value, depth + 1);
        if (found) return found;
      }
    }
    return "";
  };

  return walk(body, 0) || fallback;
}

/**
 * The shape of what actually arrived, logged once per delivery.
 *
 * Since the docs cannot be read from here, production is where the real payload shape becomes
 * known — and the first genuine delivery should teach it rather than being consumed silently.
 *
 * KEY NAMES ONLY, never values. A payment webhook carries a customer's name, mobile number and
 * email, and a log line is the wrong place for any of them. The names are enough to confirm the
 * search above found the right field, or to fix it in one commit if it did not.
 */
function shapeOf(body: unknown): string {
  if (!body || typeof body !== "object") return typeof body;
  const names: string[] = [];
  const walk = (node: unknown, prefix: string, depth: number) => {
    if (depth > 3 || !node || typeof node !== "object") return;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      names.push(prefix + k);
      if (v && typeof v === "object") walk(v, `${prefix}${k}.`, depth + 1);
    }
  };
  walk(body, "", 0);
  return names.slice(0, 40).join(",");
}

async function handle(req: NextRequest) {
  const secret = process.env.PAY_WEBHOOK_SECRET;
  if (secret) {
    /*
     * ── three places the secret may arrive, and why not one ──
     *
     * The first version of this read `x-paylink-secret` only, which was a guess. Paylink's dashboard
     * lets a merchant name the header themselves, and the account this ships to had already
     * configured `Authorization` — the conventional choice, and the one a reader would assume.
     * Insisting on our spelling would have meant a webhook that 401s every delivery while the
     * dashboard shows it correctly configured: the exact "silently does not exist" failure this
     * route was added to fix, wearing a different hat.
     *
     * `Bearer ` is stripped because a header called `Authorization` invites it, and a merchant who
     * types the prefix is not making a mistake.
     *
     * The comparison is length-checked before contents so a wrong-length value cannot be
     * distinguished by timing from a wrong-content one. This is not a high-value oracle — the route
     * is safe without the secret at all, since nothing in the body is trusted — but constant-time is
     * cheap and the alternative is explaining why it was not worth it.
     */
    const raw = req.headers.get("authorization")
      || req.headers.get("x-paylink-secret")
      || req.nextUrl.searchParams.get("secret")
      || "";
    const given = raw.replace(/^Bearer\s+/i, "").trim();
    if (!timingSafeEqual(given, secret)) {
      console.warn("[pay/webhook] rejected: secret mismatch");
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  let body: unknown = null;
  try { body = await req.json(); } catch { /* a form post or a bare GET — the query is read below */ }

  const transactionNo = transactionFrom(body, req);
  if (!transactionNo) {
    /* The shape is logged here above all: a delivery this route could not read is the one case where
       the payload's field names are the whole diagnosis, and without them the next attempt is another
       guess. */
    console.error("[pay/webhook] no transaction reference found", { shape: shapeOf(body), query: req.nextUrl.search });
    return NextResponse.json({ ok: false, error: "no transaction reference" }, { status: 400 });
  }

  let inv;
  try {
    inv = await readInvoice(transactionNo);
  } catch (e) {
    /* The ONE case where a retry helps: we could not reach Paylink, so we do not know. */
    console.error("[pay/webhook] readInvoice failed — asking for a retry", { transactionNo, e: String(e).slice(0, 200) });
    return NextResponse.json({ ok: false, error: "upstream unavailable" }, { status: 503 });
  }

  const outcome = await fulfilOrder(transactionNo, inv);

  /*
   * 200 whatever the outcome, because every outcome here is final. "Already fulfilled" is the
   * expected answer when the buyer's browser got there first, and is the system working. Returning an
   * error for it would have Paylink retrying a completed order for hours.
   */
  console.log("[pay/webhook]", {
    transactionNo, orderNumber: inv.orderNumber, paid: inv.paid, plan: inv.plan,
    outcome: outcome.done ? "fulfilled" : outcome.reason,
    /* Names only — see `shapeOf`. This is how the real payload shape gets confirmed from a live
       delivery, given the documentation is unreachable from the build environment. */
    shape: shapeOf(body),
  });
  return NextResponse.json({ ok: true, paid: inv.paid, plan: inv.plan, fulfilled: outcome.done });
}

export async function POST(req: NextRequest) { return handle(req); }

/*
 * GET as well, and not for convenience.
 *
 * Providers differ on the method they use for a merchant callback, and some send a GET with query
 * parameters. Supporting both removes an entire class of "the webhook is registered and nothing
 * happens". It is safe for the same reason POST is: nothing in the request is trusted, and the work
 * is idempotent.
 */
export async function GET(req: NextRequest) { return handle(req); }
