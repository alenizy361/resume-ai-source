/**
 * Per-account entitlements stored in Vercel Edge Config (provisioned via API,
 * no external signup). Key: `ent_<sanitized email>` -> epoch ms until which
 * the account has unlimited access.
 *
 * Reads: edge-config.vercel.com with a scoped read token (fast, global).
 * Writes: api.vercel.com with an API token (one write per purchase — low volume).
 * Falls back to Upstash Redis if configured, else no-access.
 */

const EC_ID = process.env.EDGE_CONFIG_ID;
const EC_READ = process.env.EDGE_CONFIG_READ_TOKEN;
const EC_TEAM = process.env.EDGE_CONFIG_TEAM_ID;
const EC_WRITE = process.env.VERCEL_API_TOKEN;

const UP_URL = process.env.UPSTASH_REDIS_REST_URL;
const UP_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const edgeConfigured = () => !!(EC_ID && EC_READ && EC_WRITE);
const upstashConfigured = () => !!(UP_URL && UP_TOKEN);
export const storeConfigured = () => edgeConfigured() || upstashConfigured();

/*
 * ── the key, and the collision that was in it ──
 *
 * This was `base64url(...).replace(/-/g, "_")`. base64url's alphabet is `A–Z a–z 0–9 - _`, so
 * folding `-` into `_` maps TWO distinct characters onto one — the encoding stops being injective.
 * Two different emails whose encodings differ only at such a sextet land on the SAME entitlement
 * key, which means one account reading, and on the next purchase overwriting, another's paid access.
 *
 * The `replace` was defending against nothing: Edge Config keys already permit `-`. It was a guess
 * about the charset that cost correctness.
 *
 * ── why the old key is still read ──
 *
 * Every entitlement granted before this change is stored under the folded key. Simply fixing the
 * function would strand every existing paying customer — the exact "do not break old saved data"
 * rule. So writes go to the correct key and reads try the correct key FIRST, then the legacy one.
 * A customer whose grant is under the legacy key keeps their access, and their next purchase writes
 * the correct one.
 *
 * The legacy read is deliberately not "fixed up" on read: a read that writes is a read that can fail
 * in a path with no error handling, and there is nothing to gain — the collision only matters when
 * two accounts share a key, and re-writing under the correct key is what the next grant does anyway.
 */
const encode = (email: string) => Buffer.from(email.toLowerCase().trim()).toString("base64url");
const key = (email: string) => "ent_" + encode(email);
/** The pre-fix spelling. Read-only, and only when the correct key holds nothing. */
const legacyKey = (email: string) => "ent_" + encode(email).replace(/-/g, "_");

async function edgeGet(k: string): Promise<number> {
  const res = await fetch(`https://edge-config.vercel.com/${EC_ID}/item/${k}?token=${EC_READ}`, { cache: "no-store" });
  if (res.status === 404) return 0;
  if (!res.ok) throw new Error(`edge-config read ${res.status}`);
  const v = await res.json();
  return parseInt(String(v)) || 0;
}

async function edgeSet(k: string, value: string): Promise<void> {
  const team = EC_TEAM ? `?teamId=${EC_TEAM}` : "";
  const res = await fetch(`https://api.vercel.com/v1/edge-config/${EC_ID}/items${team}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${EC_WRITE}`, "Content-Type": "application/json" },
    body: JSON.stringify({ items: [{ operation: "upsert", key: k, value }] }),
  });
  if (!res.ok) throw new Error(`edge-config write ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

async function upstash(args: (string | number)[]): Promise<unknown> {
  const res = await fetch(UP_URL!, {
    method: "POST",
    headers: { Authorization: `Bearer ${UP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Redis ${res.status}`);
  return (await res.json()).result;
}

/**
 * Grant access to an account until `until` (epoch ms) — never SHORTENING what is already there.
 *
 * ── the bug this replaces, which was giving product away ──
 *
 * This was an unconditional overwrite, and `/api/pay/verify` computes `until = Date.now() + window`
 * on every call. So every re-verification of the SAME transaction re-granted a fresh window from the
 * current clock. One Complete Pack, re-opened from browser history 89 days later, renewed itself for
 * another 90 days — indefinitely, from a single payment.
 *
 * And it was not a rare path. The callback page's verify effect depends on `owner`, which changes
 * from the local guess to the server's answer on essentially every load, so the ordinary happy path
 * fired it twice; "Refresh status" fires it again on demand.
 *
 * `Math.max` is the fix for the arithmetic. It is NOT the fix for the replay — that is
 * `claimTransaction` below, because a second payment must genuinely extend, and only the transaction
 * id can tell a second payment from a second look at the same one.
 *
 * The other half: a write that could not happen now REPORTS it. Returning silently when no store is
 * configured meant the caller could not tell "granted" from "dropped", and a customer who was
 * charged got nothing with nothing logged.
 */
export async function grantEntitlement(email: string, until: number): Promise<boolean> {
  if (!storeConfigured()) return false;
  /* Read first so a shorter window can never shorten a longer one — a 24-hour single purchase made
     during an active 90-day pack must not cut it to tomorrow. */
  const existing = await getEntitlement(email);
  const next = Math.max(existing, until);
  if (edgeConfigured()) { await edgeSet(key(email), String(next)); return true; }
  if (upstashConfigured()) {
    await upstash(["SET", `ent:${email.toLowerCase().trim()}`, String(next)]);
    return true;
  }
  return false;
}

/**
 * Claim a transaction for fulfilment, once.
 *
 * Returns `true` to exactly one caller per `transactionNo`; every later call gets `false`. That is
 * what makes the whole of fulfilment idempotent — the grant window, the receipt email, and the
 * 15-minute magic sign-in token that the receipt carries.
 *
 * ── the security half, which matters more than the double-grant ──
 *
 * `/api/pay/verify` sent a receipt AND minted a fresh sign-in token on every call, unauthenticated,
 * keyed on a `transactionNo` that lives in browser history, in referrers, and in any shared link.
 * That is an email-and-token oracle: anyone holding a paid transaction number could mint working
 * sign-in links to the buyer's address, indefinitely. Claiming the transaction closes it — the token
 * can be minted once, by whoever completes fulfilment first.
 *
 * ── read-then-write, and why that is honest rather than sufficient ──
 *
 * Two verifications racing within the same millisecond can both claim. Neither backend here offers a
 * conditional write through the interface this module uses — Edge Config has no compare-and-set at
 * all. What the claim removes is the real pattern: the same browser calling twice seconds apart, and
 * a URL re-opened days later. A genuine simultaneous double-claim would double-send one receipt; it
 * cannot extend the entitlement twice, because `grantEntitlement` takes a maximum rather than adding.
 *
 * Stated plainly instead of being described as atomic, so the next person knows what it does and
 * does not guarantee.
 */
export async function claimTransaction(transactionNo: string, now: number): Promise<boolean> {
  if (!storeConfigured() || !transactionNo) return false;
  const k = "txn_" + transactionNo.replace(/[^a-zA-Z0-9_-]/g, "_");
  try {
    if (edgeConfigured()) {
      const res = await fetch(`https://edge-config.vercel.com/${EC_ID}/item/${k}?token=${EC_READ}`, { cache: "no-store" });
      if (res.ok) return false;            // already claimed
      if (res.status !== 404) return false; // unknown state — do not fulfil twice on a guess
      await edgeSet(k, String(now));
      return true;
    }
    const existing = await upstash(["GET", `txn:${transactionNo}`]);
    if (existing) return false;
    await upstash(["SET", `txn:${transactionNo}`, String(now)]);
    return true;
  } catch {
    /*
     * Fail CLOSED on the side that cannot be undone. An un-sent receipt is recoverable — the buyer
     * signs in, or support resends. A second sign-in token emailed to an address on the strength of
     * a URL is not recoverable, and neither is a duplicated grant.
     */
    return false;
  }
}

/** Returns the entitlement expiry (epoch ms) or 0 if none / not configured. */
export async function getEntitlement(email: string): Promise<number> {
  try {
    if (edgeConfigured()) {
      const current = await edgeGet(key(email));
      /* Fall back to the pre-fix key so nobody who paid before the collision was fixed loses
         access. See the note on `legacyKey`. */
      return current || await edgeGet(legacyKey(email));
    }
    if (upstashConfigured()) {
      const v = await upstash(["GET", `ent:${email.toLowerCase().trim()}`]);
      return v ? parseInt(String(v)) || 0 : 0;
    }
  } catch {
    /* fall through */
  }
  return 0;
}

export async function hasActiveEntitlement(email: string, now: number): Promise<boolean> {
  return (await getEntitlement(email)) > now;
}

// ── Order -> buyer email mapping (set at invoice creation, read at verify) ──
const orderKey = (orderNumber: string) => "ord_" + orderNumber.replace(/[^a-zA-Z0-9_]/g, "_");

export async function setOrderEmail(orderNumber: string, email: string): Promise<void> {
  if (edgeConfigured()) return edgeSet(orderKey(orderNumber), email.toLowerCase().trim());
  if (upstashConfigured()) {
    await upstash(["SET", `ord:${orderNumber}`, email.toLowerCase().trim()]);
  }
}

export async function getOrderEmail(orderNumber: string): Promise<string | null> {
  try {
    if (edgeConfigured()) {
      const res = await fetch(`https://edge-config.vercel.com/${EC_ID}/item/${orderKey(orderNumber)}?token=${EC_READ}`, { cache: "no-store" });
      if (!res.ok) return null;
      const v = await res.json();
      return typeof v === "string" && v.includes("@") ? v : null;
    }
    if (upstashConfigured()) {
      const v = await upstash(["GET", `ord:${orderNumber}`]);
      return v && String(v).includes("@") ? String(v) : null;
    }
  } catch {
    /* fall through */
  }
  return null;
}
