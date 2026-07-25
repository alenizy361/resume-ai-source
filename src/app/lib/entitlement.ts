/**
 * What this visitor is allowed to do. One service, one answer.
 *
 * The audit found the rules were correct on the server and re-invented everywhere else:
 * `score?.watermark !== false` in Journey, `paid !== true` in DesignSection,
 * `result.watermark` in both optimize pages, a bare `hasAccess` fetch in three nav
 * components — twenty-six places each deciding for themselves what a paid user gets. No
 * bypass resulted, because `/api/optimize` and `/api/cover-letter` verify the pass
 * server-side. But the client rules had already drifted: the builder fails closed to
 * watermarked when `/api/auth/me` errors, while Journey fails closed only if the score
 * response happens to say so.
 *
 * So the shape of a decision lives here, as pure functions over one value:
 *
 *     const e = entitlementFrom({ hasAccess, until });
 *     if (shouldShowWatermark(e)) …
 *
 * `access.ts` still owns the CRYPTOGRAPHY (signing and verifying a pass) and
 * `entitlements.ts` the STORE. This owns the policy — which is the part that was
 * duplicated, because a signature is hard to guess wrong and a business rule is easy.
 *
 * Every predicate FAILS CLOSED. An unknown state is treated as unpaid: a free user
 * shown a watermark is annoyed, a paying user shown one complains, but an unpaid user
 * handed a clean PDF is revenue that never arrives — and an outage must not decide
 * which of those happens.
 *
 * Nothing here may import `next/*` or reach for a cookie: it is pure so that
 * `ops/entitlement.test.mjs` can run every rule in plain Node, and so the same function
 * answers on the server and in the browser.
 */

/** Everything a decision may depend on. Deliberately small. */
export interface Entitlement {
  /** Does this visitor currently hold paid access, by any route (pass or account)? */
  paid: boolean;
  /** Epoch ms when access lapses, or 0 when it is not known / not applicable. */
  expiresAt: number;
  /** Which plan granted it, when known. Never used to gate a FEATURE — only to explain. */
  plan?: string;
}

/** The safe default: no access. Returned whenever the truth is not yet known. */
export const NO_ACCESS: Entitlement = { paid: false, expiresAt: 0 };

/**
 * Build an entitlement from whatever the caller has.
 *
 * Accepts the shape `/api/auth/me` returns (`hasAccess`, `until`) and the shape a server
 * route holds (`pass`), so neither side has to translate. Anything unrecognised becomes
 * NO_ACCESS rather than throwing — a malformed response must not take a page down, and
 * it must not grant access either.
 */
export function entitlementFrom(input: unknown): Entitlement {
  if (!input || typeof input !== "object") return NO_ACCESS;
  const o = input as Record<string, unknown>;

  // /api/auth/me: { signedIn, hasAccess, unlimited?, until? }
  if (typeof o.hasAccess === "boolean") {
    const until = typeof o.until === "number" ? o.until : 0;
    return { paid: o.hasAccess, expiresAt: o.hasAccess ? until : 0 };
  }

  // A verified pass: { plan, exp }
  if (typeof o.exp === "number" && typeof o.plan === "string") {
    return { paid: true, expiresAt: o.exp, plan: o.plan };
  }

  return NO_ACCESS;
}

/**
 * Has access run out?
 *
 * `expiresAt: 0` means "paid, expiry unknown" — which happens for a device pass read
 * through `hasAccess` without an accompanying timestamp. That is trusted, because the
 * server already refused to report `hasAccess` for an expired pass; re-deciding it here
 * from a missing number would revoke access the server just granted.
 */
export function isExpired(e: Entitlement, now: number): boolean {
  return e.expiresAt > 0 && e.expiresAt <= now;
}

/** The single question every gate below is a wording of. */
function active(e: Entitlement | null | undefined, now: number): boolean {
  if (!e || !e.paid) return false;
  return !isExpired(e, now);
}

/* ─────────────────────────── the gates ─────────────────────────── */

/**
 * A watermark is the freemium model, so this is the one gate that must never
 * accidentally return false. Note the sense: `true` means SHOW the mark.
 */
export function shouldShowWatermark(e: Entitlement | null | undefined, now = Date.now()): boolean {
  return !active(e, now);
}

/**
 * Both export formats are open to everyone — free users get them WATERMARKED.
 *
 * This is the rule the product already ships and the one the pricing copy promises
 * ("watermark-free PDF & Word downloads" is the paid line, not "downloads"). It is a
 * function rather than a constant so a future decision to gate a format has exactly one
 * place to change, and so a caller cannot conclude otherwise on its own.
 */
export function canExportPDF(): boolean { return true; }
export function canExportWord(): boolean { return true; }

/** Paid features, per lib/plans.ts: every paid feature is unlocked by ANY valid pass. */
export function canUseCoverLetter(e: Entitlement | null | undefined, now = Date.now()): boolean {
  return active(e, now);
}
export function canUseLinkedInOptimizer(e: Entitlement | null | undefined, now = Date.now()): boolean {
  return active(e, now);
}
export function canUseInterviewPreparation(e: Entitlement | null | undefined, now = Date.now()): boolean {
  return active(e, now);
}
export function canRunUnlimitedChecks(e: Entitlement | null | undefined, now = Date.now()): boolean {
  return active(e, now);
}

/**
 * The watermark verdict carried on an API response, read so that absence means "mark it".
 *
 * `/api/optimize` and the interview stream already compute `watermark: !hasPass`
 * server-side and send it with the result, which is better than a second round trip —
 * the page uses the same verdict the server applied. The bug was in how two callers read
 * it. `Journey` wrote `score?.watermark !== false` (fail closed: mark unless explicitly
 * told not to) and `/optimize` wrote `result.watermark` (fail OPEN: a missing field
 * hands out a clean file). Both are now this function, and its sense is the safe one.
 */
export function watermarkFromResponse(res: unknown): boolean {
  if (!res || typeof res !== "object") return true;
  return (res as { watermark?: unknown }).watermark !== false;
}

/** For "your access ends on…" copy. 0 means unknown — render nothing, not "1970". */
export function accessExpiresAt(e: Entitlement | null | undefined): number {
  return e && e.paid ? e.expiresAt : 0;
}

/**
 * How many days are left, rounded up, or null when there is nothing to say.
 *
 * Rounded UP because a pass with four hours left has one day left, not zero — telling a
 * paying customer they have "0 days" while their access still works is the kind of
 * detail that produces a support email.
 */
export function daysRemaining(e: Entitlement | null | undefined, now = Date.now()): number | null {
  const at = accessExpiresAt(e);
  if (!at || at <= now) return null;
  return Math.ceil((at - now) / (24 * 60 * 60 * 1000));
}
