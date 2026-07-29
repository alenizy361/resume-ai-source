/**
 * Fulfilling a paid order — once, whoever asks.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS A LIBRARY AND NOT A SECOND COPY INSIDE THE WEBHOOK
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * There are now two ways an order gets fulfilled, and there have to be:
 *
 *   `/api/pay/verify`   the buyer's browser returning to `/pay/callback`
 *   `/api/pay/webhook`  Paylink telling the server directly
 *
 * The browser path alone was the whole system, and its failure mode is simple: close the tab after
 * paying and you are charged with no entitlement, no receipt and no sign-in link. The webhook fixes
 * that, because the server hears about the payment whether or not the buyer comes back.
 *
 * Which means the grant, the amount check and the receipt would exist twice. On the money path, two
 * implementations is not duplication to tidy up later — it is two answers to "was this paid for, and
 * for how long", drifting apart in the one place where being wrong costs a customer or costs revenue.
 * So the logic lives here and both routes call it.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHAT MAKES IT SAFE TO CALL FROM ANYWHERE, INCLUDING AN UNAUTHENTICATED WEBHOOK
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * 1. **Nothing in the caller's payload is trusted.** Only a `transactionNo` is taken, and the
 *    invoice is then fetched from Paylink with this server's own credentials. A webhook body claiming
 *    a payment proves nothing; Paylink's own answer does. This is why the webhook needs no shared
 *    secret to be safe — though one is still checked when configured, see the route.
 *
 * 2. **The amount decides the plan, not the caller.** `chargeableAmount` prices it, and a payment
 *    that does not cover the tier it claims grants nothing.
 *
 * 3. **`claimTransaction` runs first.** Exactly one caller per `transactionNo` gets to fulfil, so the
 *    webhook and the browser racing each other produces one grant and one receipt rather than two.
 *    That guard already existed for the browser replaying itself; the webhook is the reason it had to
 *    be about the transaction rather than about the request.
 */

import { chargeableAmount, refundLine } from "./plans.ts";
import { claimTransaction, getOrderEmail, grantEntitlement } from "./entitlements.ts";
import { createMagicToken } from "./session.ts";
import { emailShell, sendEmail } from "./email.ts";

const BASE = process.env.PAYLINK_BASE_URL || "https://restapi.paylink.sa";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

/* Retired ids included, so an invoice raised before a plan was withdrawn stays verifiable. */
const PLAN_PRICE: Record<string, number> = {
  single: chargeableAmount("single") ?? Infinity,
  complete: chargeableAmount("complete") ?? Infinity,
  monthly: chargeableAmount("monthly") ?? Infinity,
};

const WINDOW_SEC: Record<string, number> = {
  complete: 90 * 24 * 60 * 60,
  monthly: 30 * 24 * 60 * 60,
  single: 24 * 60 * 60,
};

export interface Invoice {
  paid: boolean;
  status: string;
  amount: number;
  orderNumber: string;
  plan: string;
  amountOk: boolean;
}

/** Paylink's own answer about an invoice. The only thing either route trusts. */
export async function readInvoice(transactionNo: string): Promise<Invoice> {
  const apiId = process.env.PAYLINK_API_ID;
  const secretKey = process.env.PAYLINK_SECRET_KEY;
  if (!apiId || !secretKey) throw new Error("Paylink credentials are not configured");

  const auth = await fetch(`${BASE}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    /* A BOOLEAN, per the documented schema. This was the string "false", which a server that
       coerces would read as truthy — silently taking the ~30-hour token instead of the ~30-minute
       one. Nothing broke, which is why it survived; it was simply not what the field means. */
    body: JSON.stringify({ apiId, secretKey, persistToken: false }),
  });
  if (!auth.ok) throw new Error(`auth ${auth.status}`);
  const token = (await auth.json()).id_token;

  const res = await fetch(`${BASE}/api/getInvoice/${encodeURIComponent(transactionNo)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`getInvoice ${res.status}`);
  const inv = await res.json();

  const status = String(inv.orderStatus || "").toLowerCase();
  const orderNumber = String(inv.orderNumber || inv.gatewayOrderRequest?.orderNumber || "");
  const orderPlanRaw = orderNumber.split("-")[1];
  const orderPlan = ["complete", "monthly", "single"].includes(orderPlanRaw) ? orderPlanRaw : "";

  /*
   * The AMOUNT decides the tier, cross-checked against the plan encoded in the order number. When
   * they disagree the amount wins: grant exactly what was paid for, never more, and never a
   * downgrade because an order number arrived garbled.
   */
  const EPS = 0.01;
  const paidAmount = Number(inv.amount) || 0;
  const amountPlan =
    paidAmount + EPS >= PLAN_PRICE.complete ? "complete"
    : paidAmount + EPS >= PLAN_PRICE.monthly ? "monthly"
    : paidAmount + EPS >= PLAN_PRICE.single ? "single"
    : "";
  const plan = amountPlan || orderPlan || "single";

  return {
    paid: status === "paid",
    status: String(inv.orderStatus || "Unknown"),
    amount: paidAmount,
    orderNumber,
    plan,
    amountOk: paidAmount + EPS >= (PLAN_PRICE[plan] ?? Infinity),
  };
}

export type FulfilOutcome =
  /** This call fulfilled it: entitlement granted and receipt sent. */
  | { done: true; plan: string; until: number; email: string }
  /** Already fulfilled by an earlier call, or the store could not confirm. Never a failure to report
   *  to the buyer — the payment itself is unaffected. */
  | { done: false; reason: "already-fulfilled" | "no-buyer-email" | "not-entitled" };

/**
 * Grant, and email the receipt with a sign-in link — for the one caller that wins the claim.
 *
 * `now` is a parameter so a test can pin it. The expiry is computed from it rather than read from
 * the invoice, because Paylink does not carry our access window and the window is our product rule.
 */
export async function fulfilOrder(
  transactionNo: string, inv: Invoice, now = Date.now(),
): Promise<FulfilOutcome> {
  if (!inv.paid || !inv.amountOk) return { done: false, reason: "not-entitled" };

  /*
   * The buyer's email as captured at CHECKOUT, never anything the caller supplied. This is what stops
   * a known transaction number being used to point somebody else's paid access at a new address.
   */
  const email = await getOrderEmail(inv.orderNumber);
  if (!email) {
    /* Charged, and nothing to grant to. Recoverable only by a human, so it must be loud. */
    console.error("[pay] no buyer email for a paid order — manual grant needed", { orderNumber: inv.orderNumber });
    return { done: false, reason: "no-buyer-email" };
  }

  if (!(await claimTransaction(transactionNo, now))) {
    /* Ordinary on a repeat; a paid customer needing a manual grant if this transaction is new and the
       store is down. `claimTransaction` fails closed, which is the right side but has to be visible. */
    console.warn("[pay] claim-refused — already fulfilled, or the store is down",
      { orderNumber: inv.orderNumber, transactionNo });
    return { done: false, reason: "already-fulfilled" };
  }

  const until = now + (WINDOW_SEC[inv.plan] ?? WINDOW_SEC.single) * 1000;

  try {
    const granted = await grantEntitlement(email, until);
    if (!granted) console.error("[pay] grantEntitlement wrote nothing", { orderNumber: inv.orderNumber });
  } catch (e) {
    console.error("[pay] grantEntitlement failed:", e);
  }

  try {
    const planName = inv.plan === "complete" ? "Complete Pack (90 days)"
      : inv.plan === "monthly" ? "Monthly" : "One-time (24 hours)";
    const untilStr = new Date(until).toISOString().slice(0, 10);
    const signin = `${APP_URL}/api/auth/verify?token=${encodeURIComponent(createMagicToken(email, now))}`;
    await sendEmail({
      to: email,
      subject: "Your Sira receipt & access link",
      html: emailShell(`
        <h2 style="margin:0 0 8px">Payment received — thank you! ✅</h2>
        <p>Your <strong>${planName}</strong> access is active until <strong>${untilStr}</strong>.</p>
        <p>Open your paid access from any device with this link (valid 15 min; you stay signed in after):</p>
        <p><a href="${signin}" style="display:inline-block;background:#7c3aed;color:#ffffff;font-weight:bold;padding:12px 24px;border-radius:8px;text-decoration:none">Open my account →</a></p>
        <p style="color:#666;font-size:13px">Plan: ${planName}<br/>Access until: ${untilStr}${inv.plan === "complete" ? `<br/>${refundLine("complete", "en")} applies.` : ""}</p>`),
    });
  } catch (e) {
    /* The grant is already written, so the access works. A missing receipt is a support ticket, not
       a lost purchase — and it must not undo the claim, or the next call would grant a second window. */
    console.error("[pay] receipt email failed:", e);
  }

  return { done: true, plan: inv.plan, until, email };
}
