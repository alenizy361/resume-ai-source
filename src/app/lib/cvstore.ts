/**
 * Per-account saved résumés — cloud storage so a user's CVs survive a cleared
 * browser (a gap vs competitors who save to an account).
 *
 * Two backends, chosen by which credentials are present:
 *
 *   Vercel Edge Config   `res_<base64url email>` → JSON array of SavedCV
 *   Redis                `res:<email>`           → the same JSON
 *
 * ── why there are two ──
 *
 * Edge Config only exists inside Vercel. It has no self-hosted equivalent, so it is the single thing
 * that would pin this product to one host. `entitlements.ts` already carried both paths for exactly
 * that reason; this and `publicresume.ts` were the two that did not, and they are the two that hold a
 * signed-in user's actual documents.
 *
 * Edge Config wins when configured, so nothing about the current deployment changes. Redis is what
 * answers anywhere else, and it is the Redis this product already uses for the shared occupation
 * packs — no new service, no new credential.
 *
 * `ops/portability.test.mjs` asserts the two paths agree on shape, and `ops/store-migrate.mjs` copies
 * the data across.
 */

import { redisConfigured, redisToken, redisUrl } from "./redisEnv.ts";

const EC_ID = process.env.EDGE_CONFIG_ID;
const EC_READ = process.env.EDGE_CONFIG_READ_TOKEN;
const EC_TEAM = process.env.EDGE_CONFIG_TEAM_ID;
const EC_WRITE = process.env.VERCEL_API_TOKEN;

const edgeConfigured = () => !!(EC_ID && EC_READ && EC_WRITE);
export const cvStoreConfigured = () => edgeConfigured() || redisConfigured();

/** Which backend is answering. Reported by the health endpoint so a migration can be watched. */
export const cvStoreBackend = (): "edge-config" | "redis" | "none" =>
  edgeConfigured() ? "edge-config" : redisConfigured() ? "redis" : "none";

/* One Redis command, over the REST protocol both Upstash and Vercel KV speak. */
async function redis(args: (string | number)[]): Promise<unknown> {
  const res = await fetch(redisUrl(), {
    method: "POST",
    headers: { Authorization: `Bearer ${redisToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Redis ${res.status}`);
  return (await res.json()).result;
}

/** The Redis key. Plain email rather than base64 — Redis has no charset limit, and a key you can read
    in `redis-cli` is worth more during a migration than one that is uniform with Edge Config's. */
export const redisKey = (email: string) => `res:${email.toLowerCase().trim()}`;

const MAX_PER_USER = 25;

export interface SavedCV {
  id: string;
  title: string;
  text: string;
  source: string;   // "built" | "optimized" | …
  savedAt: number;
}

const key = (email: string) =>
  "res_" + Buffer.from(email.toLowerCase().trim()).toString("base64url").replace(/-/g, "_");

async function readList(email: string): Promise<SavedCV[]> {
  if (!edgeConfigured()) {
    try {
      const raw = await redis(["GET", redisKey(email)]);
      const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
      return Array.isArray(arr) ? (arr as SavedCV[]) : [];
    } catch { return []; }
  }
  try {
    const res = await fetch(`https://edge-config.vercel.com/${EC_ID}/item/${key(email)}?token=${EC_READ}`, { cache: "no-store" });
    if (res.status === 404) return [];
    if (!res.ok) return [];
    const v = await res.json();
    const arr = typeof v === "string" ? JSON.parse(v) : v;
    return Array.isArray(arr) ? (arr as SavedCV[]) : [];
  } catch {
    return [];
  }
}

async function writeList(email: string, list: SavedCV[]): Promise<void> {
  if (!edgeConfigured()) {
    /* No TTL. A saved CV is the user's document, not a cache entry — it expires when they delete it. */
    await redis(["SET", redisKey(email), JSON.stringify(list)]);
    return;
  }
  const team = EC_TEAM ? `?teamId=${EC_TEAM}` : "";
  const res = await fetch(`https://api.vercel.com/v1/edge-config/${EC_ID}/items${team}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${EC_WRITE}`, "Content-Type": "application/json" },
    body: JSON.stringify({ items: [{ operation: "upsert", key: key(email), value: JSON.stringify(list) }] }),
  });
  if (!res.ok) throw new Error(`edge-config write ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export async function listUserCVs(email: string): Promise<SavedCV[]> {
  if (!cvStoreConfigured()) return [];
  const list = await readList(email);
  return list.sort((a, b) => b.savedAt - a.savedAt);
}

export async function saveUserCV(email: string, cv: { id?: string; title: string; text: string; source?: string; savedAt: number }): Promise<SavedCV[]> {
  if (!cvStoreConfigured()) return [];
  const list = await readList(email);
  const entry: SavedCV = {
    id: cv.id || `${cv.savedAt}-${Math.abs(hash(cv.text)).toString(36)}`,
    title: cv.title.slice(0, 120),
    text: cv.text.slice(0, 12000),
    source: cv.source || "built",
    savedAt: cv.savedAt,
  };
  // De-dupe by id, newest first, cap the list.
  const next = [entry, ...list.filter((c) => c.id !== entry.id)].slice(0, MAX_PER_USER);
  await writeList(email, next);
  return next;
}

export async function deleteUserCV(email: string, id: string): Promise<SavedCV[]> {
  if (!cvStoreConfigured()) return [];
  const list = await readList(email);
  const next = list.filter((c) => c.id !== id);
  await writeList(email, next);
  return next;
}

// Stable non-crypto hash for a fallback id (Date-independent-safe).
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
  return h;
}
