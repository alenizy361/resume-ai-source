/**
 * The occupation pack cache that is shared BETWEEN users.
 *
 * This is the one part of the cost brief that had nowhere to live. There is no SQL database in
 * this project — no Prisma, no Drizzle, no Postgres. What exists is `localStorage` (per browser,
 * so useless for sharing), Edge Config (readable from the app, writable only through the Vercel
 * API with a token) and Upstash Redis, which `ratelimit.ts` already speaks and which is
 * currently NOT configured: `/api/health/ai` reports `backing: "in-memory"`.
 *
 * So this is written against Upstash, exactly as the rate limiter is, and it does the right thing
 * when Upstash is absent: it misses, every time, silently, and the caller falls through to the
 * hand-written packs in `rolePacks.ts`. That fallback is not a consolation prize — a local pack
 * costs nothing, answers instantly, and was written by a person rather than generated. The shared
 * cache exists to cover the occupations `rolePacks.ts` does not have, which is the long tail.
 *
 * ── what "shared" is safe to share ──
 *
 * Only content keyed entirely by `CareerContext` plus versions: occupation, specialism,
 * seniority, country, CV language, prompt version, rules version, model version. Nothing about a
 * PERSON goes in here and nothing derived from their own writing. A blueprint for "radiology
 * technologist / sa / mid / en" is a fact about the occupation and the market; two users asking
 * for it should get the same answer and it costs one request between them.
 *
 * The experience package deliberately does NOT use this cache. It is built from lines the user
 * wrote, so it is theirs, and it lives in their own resume record instead.
 *
 * ── failure is a miss, never an error ──
 *
 * Every path here swallows its failure and returns null or false. A cache that can break the
 * product it accelerates has negative value, and the fallback below it is genuinely good.
 */

import { redisConfigured, redisToken, redisUrl } from "./redisEnv.ts";

/** Whether a shared cache exists at all. Reported by the health endpoint, not assumed. */
export const packCacheConfigured = redisConfigured;

/**
 * Thirty days.
 *
 * An occupation's toolkit does not change monthly, so a shorter TTL only buys regeneration. It is
 * not longer because the versions in the key already handle deliberate change — a prompt edit or
 * a rules update retires every entry immediately — and the TTL is there for the undeliberate
 * kind: a model quietly getting better, a market term falling out of use.
 */
const TTL_SECONDS = 60 * 60 * 24 * 30;

/** Short, because a user is waiting behind it. A slow cache is worse than no cache. */
const TIMEOUT_MS = 1200;

export interface PackRecord<T = unknown> {
  result: T;
  /** Which model produced it — kept so quality can be compared per model later. */
  model: string;
  /** Unix ms. Not used for expiry (Redis owns that); used to report cache age. */
  createdAt: number;
  /** Bumped on every read, so the popular occupations are knowable for precomputation. */
  usageCount: number;
  /** "ok" once an administrator has eyeballed it; "generated" until then. */
  qualityStatus: "generated" | "ok" | "rejected";
}

async function redis(command: unknown[]): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${redisUrl()}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${redisToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify([command]),
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Redis ${res.status}`);
    const out = await res.json();
    return out?.[0]?.result ?? null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read a shared pack.
 *
 * `usageCount` is incremented on the record rather than in a separate counter, in one extra
 * command, because the count is what identifies the occupations worth precomputing (Part 14) —
 * and guessing that list from intuition is exactly what Part 14 says not to do. If the increment
 * fails the read still succeeds; a missing statistic must not cost a cache hit.
 */
export async function readPack<T>(key: string): Promise<PackRecord<T> | null> {
  if (!packCacheConfigured()) return null;
  try {
    const raw = await redis(["GET", key]);
    if (typeof raw !== "string") return null;
    const rec = JSON.parse(raw) as PackRecord<T>;
    if (rec.qualityStatus === "rejected") return null;

    // Fire-and-forget: the hit is already earned, the statistic is a bonus.
    void redis(["HINCRBY", "packstats", key, "1"]).catch(() => {});
    return rec;
  } catch (e) {
    console.error("packCache: read failed, falling through to local packs —", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Write a shared pack. Returns whether it landed, for the log line — never throws. */
export async function writePack<T>(key: string, rec: PackRecord<T>): Promise<boolean> {
  if (!packCacheConfigured()) return false;
  try {
    await redis(["SET", key, JSON.stringify(rec), "EX", String(TTL_SECONDS)]);
    return true;
  } catch (e) {
    console.error("packCache: write failed —", e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * The occupations actually being asked for, most-requested first.
 *
 * This is the input to Part 14's precomputation, and the reason it is measured rather than
 * assumed: the brief lists ten plausible occupations and then says, correctly, "do not assume
 * the final list — use anonymized product analytics". A cache key is anonymous by construction —
 * it contains an occupation, a country, a seniority and a language, and nothing about a person.
 */
export async function popularPacks(limit = 25): Promise<Array<{ key: string; hits: number }>> {
  if (!packCacheConfigured()) return [];
  try {
    const raw = await redis(["HGETALL", "packstats"]);
    if (!Array.isArray(raw)) return [];
    const out: Array<{ key: string; hits: number }> = [];
    for (let i = 0; i + 1 < raw.length; i += 2) {
      out.push({ key: String(raw[i]), hits: Number(raw[i + 1]) || 0 });
    }
    return out.sort((a, b) => b.hits - a.hits).slice(0, limit);
  } catch {
    return [];
  }
}
