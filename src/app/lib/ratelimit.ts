import { redisConfigured, redisToken, redisUrl } from "./redisEnv.ts";
import type { NextRequest } from "next/server";

/**
 * Rate limiting with two backends.
 *
 * `allowShared` is the one to use. When Upstash is configured (the same
 * UPSTASH_REDIS_REST_* pair entitlements.ts already uses) the counter lives in
 * Redis, so it holds across serverless instances and across cold starts — which
 * is what makes a per-IP budget an actual budget rather than a suggestion. When
 * it is not configured, or Redis is unreachable, it degrades to the in-memory
 * limiter below rather than failing open.
 *
 * `allow` is that in-memory limiter: per-instance and reset on cold start, so on
 * serverless it blunts casual abuse and nothing more. It stays exported because
 * it is the fallback path and is synchronous.
 */

type Hit = { count: number; reset: number };
const buckets = new Map<string, Hit>();

/* Two spellings, one store — see redisEnv.ts. Reading only one name is a silent
   downgrade to in-memory counting next to a Redis the operator can see. */
const UP_URL = redisUrl();
const UP_TOKEN = redisToken();
const sharedConfigured = redisConfigured;

export function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

/** Check without consuming: true if at least one action remains in the window. */
export function peek(key: string, limit: number, windowMs: number): boolean {
  const hit = buckets.get(key);
  if (!hit || Date.now() > hit.reset) return true;
  return hit.count < limit;
}

/**
 * Returns true if the action is allowed, false if the caller is over the limit.
 * @param key    unique bucket key (e.g. `optimize:<ip>` or `auth:<email>`)
 * @param limit  max actions per window
 * @param windowMs window length in ms
 */
export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hit = buckets.get(key);
  if (!hit || now > hit.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    // Opportunistic cleanup so the map can't grow unbounded.
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
    }
    return true;
  }
  if (hit.count >= limit) return false;
  hit.count++;
  return true;
}

/**
 * SET key 0 EX <window> NX  →  creates the counter with its TTL only if the
 * window is not already open; INCR  →  consumes one. INCR leaves the TTL alone,
 * so the window is fixed rather than sliding and a steady caller is not locked
 * out forever. Both travel in one pipelined request, so a failure between them
 * cannot leave a counter without an expiry.
 */
async function sharedHit(key: string, windowMs: number): Promise<number> {
  const seconds = Math.max(1, Math.ceil(windowMs / 1000));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1500);
  try {
    const res = await fetch(`${UP_URL}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${UP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["SET", `rl:${key}`, "0", "EX", String(seconds), "NX"],
        ["INCR", `rl:${key}`],
      ]),
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Redis ${res.status}`);
    const out = await res.json();
    const count = Number(out?.[1]?.result);
    if (!Number.isFinite(count)) throw new Error("Redis malformed reply");
    return count;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The limiter to reach for. Shared across instances when Upstash is configured,
 * in-memory otherwise. A rate limiter that is down must not take the product
 * down with it, so an unreachable Redis falls back rather than rejecting.
 */
export async function allowShared(key: string, limit: number, windowMs: number): Promise<boolean> {
  if (!sharedConfigured()) return allow(key, limit, windowMs);
  try {
    return (await sharedHit(key, windowMs)) <= limit;
  } catch (e) {
    console.error("ratelimit: shared store unavailable, using in-memory —", e instanceof Error ? e.message : e);
    return allow(key, limit, windowMs);
  }
}

/** True when the counter is backed by the shared store (for diagnostics). */
export const rateLimitIsShared = sharedConfigured;
