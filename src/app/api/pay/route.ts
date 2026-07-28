import { NextRequest, NextResponse } from "next/server";
import { chargeableAmount } from "@/app/lib/plans";
import { BRAND } from "@/app/lib/brand";
import { setOrderEmail } from "@/app/lib/entitlements";
import { allowedOrigin } from "@/app/lib/payOrigin";
import { signTx, PAY_BIND_COOKIE } from "@/app/lib/paybind";

export const maxDuration = 30;

/**
 * Creates a Paylink invoice and returns the hosted payment-page URL.
 * Flow: authenticate (apiId + secretKey) -> addInvoice -> return `url`.
 * Credentials live only in server-side env vars, never in the client bundle.
 */

const BASE = process.env.PAYLINK_BASE_URL || "https://restapi.paylink.sa";

const CURRENCY = process.env.PAY_CURRENCY || "SAR";

/*
 * The amount comes from lib/plans.ts, not from here.
 *
 * This route used to own its own PLANS map — meaning the number a customer READ on the
 * pricing page and the number they were CHARGED were computed in different files, and a
 * PRICE_SINGLE env change would have moved only the second one. `chargeableAmount`
 * still honours the env override and still prices retired plan ids so old invoices
 * verify, but it is now the same function the pricing page calls.
 */
const TITLES: Record<string, string> = {
  single: `${BRAND.name} — Single Optimization`,
  complete: `${BRAND.name} — Complete Pack`,
  monthly: `${BRAND.name} — Unlimited (1 month)`,
};

async function authenticate(): Promise<string> {
  const apiId = process.env.PAYLINK_API_ID;
  const secretKey = process.env.PAYLINK_SECRET_KEY;
  if (!apiId || !secretKey) throw new Error("Paylink credentials are not configured");

  const res = await fetch(`${BASE}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    /* A BOOLEAN, per the documented schema. This was the string "false", which a server that
       coerces would read as truthy — silently taking the ~30-hour token instead of the ~30-minute
       one. Nothing broke, which is why it survived; it was simply not what the field means. */
    body: JSON.stringify({ apiId, secretKey, persistToken: false }),
  });
  if (!res.ok) throw new Error(`Paylink auth ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  if (!data.id_token) throw new Error("Paylink auth returned no token");
  return data.id_token;
}

export async function POST(req: NextRequest) {
  try {
    const { plan, name, email, mobile, locale } = await req.json();
    const lang = locale === "ar" ? "ar" : "en";

    const amount = chargeableAmount(String(plan));
    const title = TITLES[String(plan)];
    /*
     * ── every rejection carries a `code`, because the reason has to survive translation ──
     *
     * These messages are written in English, and `CheckoutButton` replaced ALL of them with one
     * generic "تعذّر بدء الدفع، حاول مرة أخرى" on an Arabic surface rather than leak English into a
     * payment step. Defensible instinct, wrong result: an Arabic buyer whose mobile number was
     * rejected was told only that checkout failed, so retrying the same unfixable input failed the
     * same way. A payment dead-end with no discoverable cause.
     *
     * A code is language-neutral, so the client can say which field is wrong in the buyer's own
     * language without either side guessing.
     */
    if (amount === null || !title) return NextResponse.json({ error: "Unknown plan.", code: "plan" }, { status: 400 });
    const chosen = { title, amount };
    if (!name || String(name).trim().length < 2) {
      return NextResponse.json({ error: "Please enter your name.", code: "name" }, { status: 400 });
    }
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email))) {
      return NextResponse.json({ error: "Please enter a valid email — it's how your access is unlocked.", code: "email" }, { status: 400 });
    }
    /*
     * Separators are stripped, not rejected.
     *
     * This stripped only spaces and `+`, so "055-123-4567" — an ordinary way to write a Saudi
     * mobile — failed validation, and the Arabic buyer could not find out why (above). Punctuation
     * in a phone number is formatting, not data: every non-digit goes, and what reaches the
     * provider is the same normalised string the check ran on.
     */
    const mobileDigits = String(mobile ?? "").replace(/\D/g, "");
    if (!/^\d{6,15}$/.test(mobileDigits)) {
      return NextResponse.json({ error: "Please enter a valid mobile number.", code: "mobile" }, { status: 400 });
    }

    const token = await authenticate();

    /*
     * ── where the payment provider sends the buyer back, and why it is not the caller's choice ──
     *
     * This was `req.headers.get("origin") || APP_URL`. The Origin header is supplied by whoever makes
     * the request, and this endpoint is unauthenticated — so any caller could mint a real Paylink
     * invoice whose return URL points at a host they control. The buyer would pay on Paylink's own
     * hosted page, then land somewhere else entirely, carrying `transactionNo` in the URL. Before the
     * idempotency work that number was enough to trigger a receipt and a fresh 15-minute sign-in
     * token; it is still a real payment reference that should not be handed to a third party.
     *
     * An allow-list rather than "always use APP_URL", because preview deployments have to be able to
     * complete a real test purchase — that is the only way this path gets verified at all, and no
     * Paylink credential exists outside production. So: the configured app URL, and this project's
     * own `*.vercel.app` deployments. Anything else falls back to the app URL rather than erroring,
     * because a legitimate buyer on an unexpected host should still be able to pay and still be
     * returned somewhere that works.
     */
    const origin = allowedOrigin(req.headers.get("origin"));
    // Encode the plan in the order number — Paylink echoes it back on Get Invoice,
    // so verification can trust which plan was actually paid for.
    const orderNumber = `RA-${plan}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

    const res = await fetch(`${BASE}/api/addInvoice`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        orderNumber,
        amount: chosen.amount,
        currency: CURRENCY,
        clientName: String(name).trim(),
        clientMobile: mobileDigits,
        callBackUrl: `${origin}/pay/callback?lang=${lang}`,
        note: chosen.title,
        products: [{ title: chosen.title, price: chosen.amount, qty: 1 }],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`addInvoice ${res.status}: ${body.slice(0, 300)}`);
    }
    const invoice = await res.json();
    if (!invoice.url) throw new Error("Paylink did not return a payment URL");

    // Remember which email bought this order so verification can unlock the account.
    try {
      await setOrderEmail(orderNumber, String(email));
    } catch (e) {
      console.error("setOrderEmail failed:", e);
    }

    const out = NextResponse.json({ url: invoice.url, orderNumber, transactionNo: invoice.transactionNo });
    // Bind this checkout to the buyer's browser: verify will only auto-sign-in
    // / grant the account entitlement if this signed cookie matches the
    // transactionNo — so a leaked/guessed transactionNo can't sign in as them.
    if (invoice.transactionNo) {
      out.cookies.set(PAY_BIND_COOKIE, `${invoice.transactionNo}.${signTx(String(invoice.transactionNo))}`, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 72 * 60 * 60, // 72h — covers even a very delayed payment so the
        // secure device-pass path (which requires this cookie) never wrongly
        // denies a genuine buyer. It stays the ONLY proof trusted for a device
        // pass, so widening the window costs no security — a leaked transactionNo
        // still can't forge this HMAC-signed, httpOnly binding.
      });
    }
    return out;
  } catch (err) {
    console.error("Pay error:", err);
    return NextResponse.json(
      { error: "Could not start checkout. Please try again.", detail: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
