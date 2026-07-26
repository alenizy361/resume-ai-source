/**
 * A refund taking the access back.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE GAP THIS CLOSES
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * Every receipt this product sends ends with "7-day money-back guarantee applies". Nothing in the
 * system could act on one. Paylink delivers a refund webhook — documented, with its own header and
 * its own retry policy — and there was no endpoint to receive it, so a customer who was refunded kept
 * the whole entitlement they had been refunded for.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WRITTEN TO THE DOCUMENTED CONTRACT, NOT TO A GUESS
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * The payment webhook next door had to be written defensively — its field names could not be looked
 * up from this environment, so it SEARCHES the payload. This one does not need to guess. The refund
 * contract is specified:
 *
 *   header    `X-API-KEY`                     — not `Authorization`; a different family
 *   fields    `transactionNo`   required
 *             `refundStatus`    required      — `Refunded` | `Failed`
 *             `refundAmount`    required
 *             `currency`        required
 *             `merchantOrderNumber`  optional
 *             `apiVersion`           optional
 *   response  HTTP 200 with `{"status":"success"}`
 *   retries   up to ten times if 200 is not returned
 *
 * The response body matters: this provider looks for `{"status":"success"}`, not merely a 200. And
 * because it retries ten times, every non-2xx is ten more deliveries — so the same rule as the
 * payment webhook applies, harder. Anything understood answers 200.
 *
 * ── `Failed` is not a no-op, it is the case that must NOT revoke ──
 *
 * `refundStatus` has two documented values and only one of them means the money went back. A handler
 * that revoked on any refund event would take a paying customer's access away because an attempted
 * refund FAILED — the worst possible reading of the word.
 *
 * ── and the amount is deliberately not used to decide ──
 *
 * A partial refund is still `Refunded`. Access here is not divisible — there is no half-watermark —
 * so a partial refund revokes, and the amount is logged rather than compared. Pretending to prorate
 * would be a policy invented in a webhook handler, which is the wrong place to invent policy.
 */

import { NextRequest, NextResponse } from "next/server";
import { getOrderEmail, revokeEntitlement } from "@/app/lib/entitlements";
import { readInvoice } from "@/app/lib/fulfil";

export const maxDuration = 30;

/** The body Paylink documents. Extra fields are expected and ignored. */
interface RefundBody {
  transactionNo?: string;
  refundStatus?: string;
  refundAmount?: number;
  currency?: string;
  merchantOrderNumber?: string;
  apiVersion?: string;
}

/** The documented success body. This provider reads it, so a bare 200 is not enough. */
const OK = { status: "success" };

/** Constant-time compare, so a wrong key cannot be found by timing. */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(req: NextRequest) {
  const expected = process.env.PAYLINK_REFUND_API_KEY;

  /*
   * ── the one place this route is STRICTER than the payment webhook ──
   *
   * The payment webhook is safe without a secret, because nothing in its body is believed: it
   * re-reads the invoice from Paylink and grants only what Paylink confirms. So its secret is
   * optional, and making it mandatory would risk a webhook that silently rejects everything.
   *
   * This route REMOVES access. The asymmetry is the whole reason: an unauthenticated caller who can
   * revoke is a caller who can lock a paying customer out of what they bought, and there is no
   * server-side "is this refunded" call to check the claim against — Get Invoice reports the payment,
   * not the refund. Without a key there is nothing separating a real refund notice from a stranger's.
   *
   * So no key configured means the route refuses everything, loudly, and says which variable is
   * missing. A refusal an operator can read and fix beats a revocation nobody asked for.
   */
  if (!expected) {
    console.error("[pay/refund] refused: PAYLINK_REFUND_API_KEY is not set, so no caller can be trusted to revoke");
    return NextResponse.json({ status: "error", error: "not configured" }, { status: 503 });
  }

  const given = req.headers.get("x-api-key") || "";
  if (!sameSecret(given, expected)) {
    console.warn("[pay/refund] rejected: X-API-KEY mismatch");
    return NextResponse.json({ status: "error", error: "unauthorized" }, { status: 401 });
  }

  let body: RefundBody;
  try { body = (await req.json()) as RefundBody; } catch {
    return NextResponse.json({ status: "error", error: "invalid json" }, { status: 400 });
  }

  const transactionNo = String(body.transactionNo || "").trim();
  const refundStatus = String(body.refundStatus || "").trim();
  if (!transactionNo) {
    return NextResponse.json({ status: "error", error: "transactionNo required" }, { status: 400 });
  }

  /*
   * `Failed` means the refund did not happen. Acknowledged with a 200 so it is not retried ten times,
   * and nothing is revoked — this is the case a careless handler gets exactly backwards.
   */
  if (refundStatus.toLowerCase() !== "refunded") {
    console.log("[pay/refund] not a completed refund — nothing revoked",
      { transactionNo, refundStatus, amount: body.refundAmount, currency: body.currency });
    return NextResponse.json({ ...OK, revoked: false, reason: `status:${refundStatus || "missing"}` });
  }

  /*
   * Whose access to remove.
   *
   * `merchantOrderNumber` is optional in the refund payload, so when it is absent the order number is
   * recovered from Paylink by transaction — the same lookup the payment path uses. The buyer's email
   * is then read from OUR record of the checkout, never from the request: a refund notice naming an
   * email would be a way to revoke a stranger's access.
   */
  let orderNumber = String(body.merchantOrderNumber || "").trim();
  if (!orderNumber) {
    try {
      orderNumber = (await readInvoice(transactionNo)).orderNumber;
    } catch (e) {
      /* Unknown state. A retry genuinely helps here, and there are ten of them. */
      console.error("[pay/refund] could not resolve the order — asking for a retry",
        { transactionNo, e: String(e).slice(0, 200) });
      return NextResponse.json({ status: "error", error: "upstream unavailable" }, { status: 503 });
    }
  }

  const email = orderNumber ? await getOrderEmail(orderNumber) : null;
  if (!email) {
    /*
     * A refund for an order this system does not know. Expected if the Paylink account is shared with
     * another project — and 200, because retrying will not make it ours. Logged at warning rather than
     * error for the same reason: on a shared account this is routine, and an error here would train
     * someone to ignore the log that also carries the real failures.
     */
    console.warn("[pay/refund] no buyer email for this order — nothing to revoke",
      { transactionNo, orderNumber });
    return NextResponse.json({ ...OK, revoked: false, reason: "unknown order" });
  }

  try {
    const revoked = await revokeEntitlement(email);
    /* A refunded customer who keeps access is money out and product given away, so this cannot be
       silent. It is the refund mirror of "charged and not granted". */
    if (!revoked) console.error("[pay/refund] revoke wrote nothing — access may still be active", { orderNumber });
    console.log("[pay/refund] revoked", { transactionNo, orderNumber, amount: body.refundAmount, currency: body.currency });
    return NextResponse.json({ ...OK, revoked });
  } catch (e) {
    console.error("[pay/refund] revoke failed — asking for a retry", { transactionNo, e: String(e).slice(0, 200) });
    return NextResponse.json({ status: "error", error: "revoke failed" }, { status: 503 });
  }
}
