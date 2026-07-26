/**
 * Does THIS request hold paid access? One server-side answer.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS A MODULE AND NOT A THIRD COPY
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * The same eleven lines existed twice — in `/api/optimize` and in `/api/auth/me` — and the export
 * route needed them a third time. That is exactly the shape `lib/entitlement.ts` was written to end
 * on the client, where twenty-six places each decided what a paid user gets. The server half was
 * never done, and the third copy is where it stops being tolerable: the export route decides whether
 * a file carries a watermark, so if it drifts from the optimiser's answer the same visitor is paid on
 * one screen and unpaid on the next.
 *
 * Three independent routes to access, and all three have to be honoured:
 *
 *   `SESSION_COOKIE` + `hasActiveEntitlement`   a signed-in account with a live entitlement
 *   `ENT_COOKIE`                                the signed entitlement cookie, as a store fallback —
 *                                               and ONLY for the email that is actually signed in
 *   `ACCESS_COOKIE`                             a device pass, bought without an account
 *
 * The middle one is the subtle one. It exists so an Upstash or Edge Config hiccup cannot lock out a
 * customer who has paid, and it is checked against the signed-in address precisely so it can never
 * unlock a DIFFERENT account: the cookie is signed, but a signed cookie for `a@example.com` sitting
 * in `b@example.com`'s browser must not grant anything.
 *
 * ── it fails closed, and that is a revenue decision rather than a security posture ──
 *
 * Any failure — no cookies, an unreadable session, a store that throws — answers "not paid". A free
 * user shown a watermark is annoyed; a paying user shown one sends a support email; an unpaid user
 * handed a clean PDF is revenue that never arrives, and no outage should be allowed to choose the
 * third. This is the same rule `lib/entitlement.ts` states for the client, in the one place that can
 * actually enforce it.
 */

import type { NextRequest } from "next/server";
import { readSession, SESSION_COOKIE } from "./session.ts";
import { getEntitlement } from "./entitlements.ts";
import { ACCESS_COOKIE, ENT_COOKIE, verifyEntPass, verifyPass } from "./access.ts";

export interface PaidRequest {
  /** May this request have what paying gets? The only field a gate should look at. */
  paid: boolean;
  /** Epoch ms the ACCOUNT entitlement lapses, or 0. A device pass has no account expiry here. */
  until: number;
  /** The signed-in address, or "" — for logging an owner, never for granting. */
  email: string;
  /** Signed in at all, which is a different question from having paid. */
  signedIn: boolean;
}

export async function paidRequest(req: NextRequest, now = Date.now()): Promise<PaidRequest> {
  let email = "";
  try { email = readSession(req.cookies.get(SESSION_COOKIE)?.value, now) || ""; } catch { email = ""; }

  /* A device pass needs no account, so it is read whether or not anyone is signed in. */
  let pass = false;
  try { pass = !!verifyPass(req.cookies.get(ACCESS_COOKIE)?.value, now); } catch (e) {
    /*
     * Fails closed, and says so.
     *
     * `verifyPass` throws exactly one kind of error: `assertSecret` refusing to run without
     * `ACCESS_SECRET` in production. Swallowing that silently would mean every paying customer's
     * download quietly carries a watermark and the log gives no reason — the one failure mode of this
     * module that looks like normal operation. A missing cookie is ordinary and logs nothing; a broken
     * verifier is an operator's problem and has to be visible.
     */
    console.error("[paid] pass verification failed — treating as unpaid", { e: String(e).slice(0, 200) });
    pass = false;
  }

  if (!email) return { paid: pass, until: 0, email: "", signedIn: false };

  /*
   * The store first, then the signed cookie — and the cookie only for THIS address. `getEntitlement`
   * swallows its own errors and answers 0, which is indistinguishable from "no entitlement"; that is
   * deliberate there and it is why the cookie fallback exists here.
   */
  let stored = 0;
  try { stored = await getEntitlement(email); } catch { stored = 0; }

  let cookieUntil = 0;
  try {
    const ent = verifyEntPass(req.cookies.get(ENT_COOKIE)?.value, now);
    if (ent?.email === email.toLowerCase().trim()) cookieUntil = ent.exp;
  } catch { cookieUntil = 0; }

  const until = Math.max(stored, cookieUntil);
  return { paid: until > now || pass, until, email, signedIn: true };
}
