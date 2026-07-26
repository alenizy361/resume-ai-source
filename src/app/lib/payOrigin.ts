/**
 * Where a payment provider may return a buyer to.
 *
 * ── the defect this closes ──
 *
 * `/api/pay` built the invoice's `callBackUrl` from `req.headers.get("origin")`. That header is
 * supplied by whoever makes the request, and the endpoint is unauthenticated — so any caller could
 * mint a real Paylink invoice whose return URL pointed at a host they control. The buyer pays on
 * Paylink's own hosted page, then lands somewhere else entirely with `transactionNo` in the URL.
 * Before the idempotency work that number alone triggered a receipt and a fresh 15-minute sign-in
 * token; it remains a live payment reference that should not be handed to a third party.
 *
 * ── why an allow-list and not simply "always use APP_URL" ──
 *
 * Preview deployments have to be able to complete a real test purchase. That is the only way this
 * path ever gets verified at all: no Paylink credential exists outside production, so it cannot be
 * exercised from a test suite or a sandbox. Refusing previews would mean the payment flow is only
 * ever tested by shipping it.
 *
 * ── and why it falls back rather than throwing ──
 *
 * An unexpected Origin is far more likely to be a legitimate buyer on a host nobody anticipated than
 * an attack. They should still be able to pay, and still be returned somewhere that works. Refusing
 * the purchase to punish a header would cost a sale to prevent nothing.
 *
 * Its own module rather than a helper inside the route, so it can be tested: the interesting cases
 * are the REFUSALS, which are invisible from the route's happy path, and a route file cannot be
 * imported outside Next because of `next/server`.
 */

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa").replace(/\/$/, "");

export function allowedOrigin(raw: string | null | undefined): string {
  if (!raw) return APP_URL;
  let u: URL;
  try { u = new URL(raw); } catch { return APP_URL; }

  /* Development is the one place plain HTTP is legitimate. */
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";

  /* No downgrade otherwise: a return URL is where a paying customer lands, and `http` there is a
     cleartext hop carrying a payment reference. */
  if (u.protocol !== "https:" && !local) return APP_URL;

  const origin = `${u.protocol}//${u.host}`;
  if (origin === APP_URL) return APP_URL;
  if (local) return origin;

  /*
   * This project's own preview deployments. Anchored deliberately: a bare `endsWith(".vercel.app")`
   * would also accept `vercel.app.attacker.com`, and `includes` would accept `evil-vercel.app`. The
   * host must BE `vercel.app` or end with a dot followed by it.
   */
  if (u.hostname === "vercel.app" || u.hostname.endsWith(".vercel.app")) return origin;

  return APP_URL;
}
