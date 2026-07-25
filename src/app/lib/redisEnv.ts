/**
 * Where the Redis credentials are, whichever name they arrived under.
 *
 * Not indecision — there are genuinely two spellings in circulation and which one you get depends
 * on how the store was created:
 *
 *   UPSTASH_REDIS_REST_URL / _TOKEN    Upstash's own Vercel integration, and the names the
 *                                      Upstash SDK documents
 *   KV_REST_API_URL / KV_REST_API_TOKEN  what a store created through Vercel's Storage tab sets,
 *                                      inherited from the old Vercel KV product
 *
 * Reading only the first name is a silent failure with a cost attached: the store exists, the
 * dashboard shows it connected, and the app quietly runs its rate limiter in memory and misses
 * every shared cache lookup. Nothing errors. `/api/health/ai` would report `backing: "in-memory"`
 * next to a Redis the operator can see in the same browser, which is the most confusing possible
 * outcome.
 *
 * So both are accepted, the Upstash spelling wins when both exist, and `redisSource()` names which
 * one was used so the health endpoint can say so out loud.
 */

/** The REST endpoint, or empty when no store is configured under either name. */
export function redisUrl(): string {
  return (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "").trim();
}

export function redisToken(): string {
  return (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "").trim();
}

export function redisConfigured(): boolean {
  return Boolean(redisUrl() && redisToken());
}

/**
 * Which naming the credentials came from — for diagnostics only, never a value.
 *
 * `"half"` is the case worth naming separately: a URL with no token, or a token with no URL, which
 * happens when someone copies one line out of a dashboard. It behaves exactly like "absent" and
 * looks exactly like "configured" to a person reading their env list.
 */
export function redisSource(): "upstash" | "vercel-kv" | "half" | "absent" {
  const upstash = Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim());
  if (upstash) return "upstash";
  const kv = Boolean(process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim());
  if (kv) return "vercel-kv";
  const anyHalf = Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() || process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
    || process.env.KV_REST_API_URL?.trim() || process.env.KV_REST_API_TOKEN?.trim(),
  );
  return anyHalf ? "half" : "absent";
}
