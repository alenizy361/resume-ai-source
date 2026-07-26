/**
 * Public shareable resumes, served at `/r/[slug]`.
 *
 * Two backends, the same arrangement as `cvstore.ts` and for the same reason: Edge Config exists only
 * inside Vercel, and this holds a real person's published CV. Edge Config wins when configured so the
 * current deployment is unchanged; Redis answers anywhere else.
 *
 *   Edge Config   `pub_<slug>` → JSON {name, role, text, created}
 *   Redis         `pub:<slug>` → the same JSON
 *
 * This one matters more than its size suggests: a published URL is one somebody has put on a job
 * application. If it 404s after a migration, that is a person's application broken, so
 * `ops/store-migrate.mjs` copies these first and verifies each slug reads back.
 */

import { redisConfigured, redisToken, redisUrl } from "./redisEnv.ts";

const EC_ID = process.env.EDGE_CONFIG_ID;
const EC_READ = process.env.EDGE_CONFIG_READ_TOKEN;
const EC_TEAM = process.env.EDGE_CONFIG_TEAM_ID;
const EC_WRITE = process.env.VERCEL_API_TOKEN;

const edgeConfigured = () => !!(EC_ID && EC_READ && EC_WRITE);
export const publicResumeConfigured = () => edgeConfigured() || redisConfigured();

export const publicResumeBackend = (): "edge-config" | "redis" | "none" =>
  edgeConfigured() ? "edge-config" : redisConfigured() ? "redis" : "none";

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

export const redisKey = (slug: string) => `pub:${slug.replace(/[^a-z0-9_-]/gi, "").toLowerCase()}`;

export interface PublicResume {
  name: string;
  role: string;
  text: string;
  created: number;
}

const key = (slug: string) => "pub_" + slug.replace(/[^a-z0-9_]/gi, "").toLowerCase();

export async function savePublicResume(slug: string, data: PublicResume): Promise<void> {
  if (!publicResumeConfigured()) throw new Error("storage not configured");
  if (!edgeConfigured()) { await redis(["SET", redisKey(slug), JSON.stringify(data)]); return; }
  const team = EC_TEAM ? `?teamId=${EC_TEAM}` : "";
  const res = await fetch(`https://api.vercel.com/v1/edge-config/${EC_ID}/items${team}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${EC_WRITE}`, "Content-Type": "application/json" },
    body: JSON.stringify({ items: [{ operation: "upsert", key: key(slug), value: JSON.stringify(data) }] }),
  });
  if (!res.ok) throw new Error(`edge-config write ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export async function getPublicResume(slug: string): Promise<PublicResume | null> {
  if (!publicResumeConfigured()) return null;
  if (!edgeConfigured()) {
    try {
      const raw = await redis(["GET", redisKey(slug)]);
      if (!raw) return null;
      return (typeof raw === "string" ? JSON.parse(raw) : raw) as PublicResume;
    } catch { return null; }
  }
  try {
    const res = await fetch(`https://edge-config.vercel.com/${EC_ID}/item/${key(slug)}?token=${EC_READ}`, { cache: "no-store" });
    if (!res.ok) return null;
    const v = await res.json();
    return typeof v === "string" ? (JSON.parse(v) as PublicResume) : (v as PublicResume);
  } catch {
    return null;
  }
}

export async function deletePublicResume(slug: string): Promise<void> {
  if (!publicResumeConfigured()) throw new Error("storage not configured");
  if (!edgeConfigured()) { await redis(["DEL", redisKey(slug)]); return; }
  const team = EC_TEAM ? `?teamId=${EC_TEAM}` : "";
  const res = await fetch(`https://api.vercel.com/v1/edge-config/${EC_ID}/items${team}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${EC_WRITE}`, "Content-Type": "application/json" },
    body: JSON.stringify({ items: [{ operation: "delete", key: key(slug) }] }),
  });
  if (!res.ok) throw new Error(`edge-config delete ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/** Build a URL-safe, human-readable slug from a name + short random suffix. */
export function makeSlug(name: string, rand: string): string {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "resume";
  return `${base}-${rand}`;
}
