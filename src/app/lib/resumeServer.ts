/**
 * The structured CV, on the server, addressed by (account, resumeId) and versioned.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * `resumeStore.ts` says it plainly in its own header: browser storage is a RECOVERY DRAFT, not the
 * source of truth, and server persistence "is a separate, larger piece of work". This is that work.
 *
 * Until now the document a person spends twenty minutes building — `BuilderState`, with their
 * employers, dates, licences and every confirmed line — existed in exactly one place: the
 * localStorage of the browser they built it in. Clearing site data, switching phones, or a Safari
 * eviction under storage pressure took it permanently.
 *
 * `/api/resumes` and `cvstore.ts` are NOT this. They keep a flat `{ title, text }` snapshot for the
 * "my saved CVs" list — a rendered copy, not the document; you cannot resume editing from it. And
 * nothing in the builder ever wrote to them: grep for `api/resumes` outside its own route and the
 * only hits are the account screen reading and deleting. Both stay, unchanged, because a plain-text
 * copy is what the download and publish paths want. This is the editable document beside them.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE THREE RULES IT ENFORCES
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 *   1. A record is addressed by (account, resumeId) and CARRIES both. A record whose contents
 *      disagree with the key it was found under is refused, not returned — the same rule the
 *      browser store already applies, for the same reason: that disagreement is what serves one
 *      account's CV to another.
 *
 *   2. Every write states the revision it is based on. A write based on a stale revision is
 *      REFUSED with the current record attached, rather than silently winning. Two tabs, or a phone
 *      and a laptop, are the ordinary case; last-write-wins there means the older device quietly
 *      deletes the newer work.
 *
 *   3. Nothing is stored for a caller without an account. Anonymous work stays in the browser,
 *      where it already lives, because there is no identity to file it under and inventing one is
 *      how a shared laptop mixes two people's CVs.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE BACKEND, AND WHY EDGE CONFIG IS NOT ONE
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * `cvstore.ts`, `publicresume.ts` and `entitlements.ts` all read Edge Config first. This one does
 * not, and the difference is the write pattern rather than a preference.
 *
 * An Edge Config write is a call to `api.vercel.com` — an account-wide, rate-limited control-plane
 * operation whose result takes seconds to propagate to readers. That is the right shape for an
 * entitlement, which changes when someone pays. It is the wrong shape for a document that autosaves
 * while a person types: the writes would be throttled account-wide, and a read straight after a
 * write could return the previous value, which reads to the user as the builder losing their work.
 *
 * So: Redis, which is a data plane, already in this product, under the two names it ships as
 * (`redisEnv.ts` explains that mess). When it is absent, `resumeServerConfigured()` is false, every
 * function here is a no-op, and the builder keeps working exactly as it does today off the browser
 * draft. That is the whole degradation story — no half-saved state, no error a user has to read.
 */

import { redisConfigured, redisToken, redisUrl } from "./redisEnv.ts";
import type { BuilderState } from "./builderDoc.ts";

/** Bumped when this envelope changes. Independent of `BuilderState.schemaVersion`. */
export const SERVER_RECORD_VERSION = 1;

/**
 * Whether server persistence is available at all.
 *
 * Checked by the route before anything else, so the answer to "is my CV saved to my account" is a
 * fact the client can render rather than a promise that quietly is not kept.
 */
export const resumeServerConfigured = (): boolean => redisConfigured();

export interface ServerResume {
  /** The account. Lower-cased email — the same identity `/api/resumes` and entitlements use. */
  account: string;
  resumeId: string;
  recordVersion: number;
  /** Monotonic per (account, resumeId). The concurrency token. */
  revision: number;
  lang: "ar" | "en";
  updatedAt: number;
  state: BuilderState;
}

export interface ServerResumeSummary {
  resumeId: string;
  title: string;
  lang: "ar" | "en";
  revision: number;
  updatedAt: number;
}

/**
 * A stored write can be refused, and the caller has to be able to tell WHICH refusal.
 *
 * "conflict" carries the winning record so the client can show the newer version rather than only
 * saying no; "unconfigured" is not a failure at all and must not be rendered as one.
 */
export type SaveResult =
  | { ok: true; revision: number; summary: ServerResumeSummary }
  | { ok: false; reason: "conflict"; current: ServerResume }
  | { ok: false; reason: "unconfigured" | "too-large" | "invalid" };

/* ── the keyspace ────────────────────────────────────────────────────────────────────
 *
 * Plain lower-cased email, like `cvstore.ts`'s Redis path, for the reason stated there: a key you
 * can read in `redis-cli` is worth more during an incident than one that is uniform with Edge
 * Config's base64.
 */
const norm = (email: string): string => email.toLowerCase().trim();
export const docKey = (email: string, resumeId: string): string => `cvdoc:${norm(email)}:${resumeId}`;
export const indexKey = (email: string): string => `cvdocidx:${norm(email)}`;

/**
 * Caps. Both are refusals rather than truncations.
 *
 * A truncated CV is a corrupted CV that looks fine until the user scrolls to where their last two
 * jobs used to be. Refusing tells them something, and the browser draft still holds the full
 * document, so nothing is lost by saying no.
 */
export const MAX_DOC_BYTES = 400_000;
export const MAX_RESUMES_PER_ACCOUNT = 40;

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

const parse = <T>(raw: unknown): T | null => {
  if (raw === null || raw === undefined) return null;
  try { return (typeof raw === "string" ? JSON.parse(raw) : raw) as T; } catch { return null; }
};

/**
 * One record, or null.
 *
 * ── the validation, which is the whole point of the function ──
 *
 * A record is returned only if the account and resumeId INSIDE it match the ones asked for. That
 * looks redundant — it was fetched by that key — and it is exactly the check whose absence caused
 * the bug this product already had once on the client: a value written under the wrong key, or a
 * key built from a stale variable, is indistinguishable from a correct one unless the payload is
 * asked to agree with its own address.
 *
 * A mismatch returns null rather than throwing. The caller's fallback is the browser draft, which
 * is the right document; an exception here would turn a storage anomaly into a broken page.
 */
export async function readServerResume(email: string, resumeId: string): Promise<ServerResume | null> {
  try { return await readStrict(email, resumeId); } catch { return null; }
}

/**
 * The same read, but a TRANSPORT failure throws instead of answering "nothing here".
 *
 * ── the data-loss path this exists to close, found by its own test ──
 *
 * `saveServerResume` reads the current record to compare revisions. Written against the lenient
 * read above, a Redis blip during that read returns `null`, which the save cannot distinguish from
 * "this is a new resume" — so the conflict check is skipped and the document is written back at
 * revision 1, on top of whatever was there. One transient 500 on the read, and the user's CV is
 * replaced by whatever the saving tab happened to hold.
 *
 * The two conditions genuinely differ and only the caller knows which one it can tolerate. A reader
 * rendering a page can fall back to the browser draft, so `null` is right for it. A writer about to
 * overwrite cannot, so it gets the exception and the save fails loudly — the browser draft still has
 * the work, and the user is told rather than quietly losing it.
 *
 * A record that is PRESENT but disagrees with its key still returns `null` here, deliberately: that
 * is a definite answer about a definite record, not an absence of one.
 */
async function readStrict(email: string, resumeId: string): Promise<ServerResume | null> {
  if (!resumeServerConfigured() || !email || !resumeId) return null;
  const rec = parse<ServerResume>(await redis(["GET", docKey(email, resumeId)]));
  if (!rec || typeof rec !== "object") return null;
  if (norm(rec.account || "") !== norm(email) || rec.resumeId !== resumeId) return null;
  if (!rec.state || typeof rec.state !== "object") return null;
  return rec;
}

/** The account's list, newest first. Derived from writes — never from scanning the keyspace. */
export async function listServerResumes(email: string): Promise<ServerResumeSummary[]> {
  if (!resumeServerConfigured() || !email) return [];
  let list: ServerResumeSummary[] | null = null;
  try { list = parse<ServerResumeSummary[]>(await redis(["GET", indexKey(email)])); } catch { return []; }
  if (!Array.isArray(list)) return [];
  return list
    .filter((s) => s && typeof s.resumeId === "string")
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

/**
 * Save, refusing a write built on a stale revision.
 *
 * `baseRevision` is what the client believed the server held when it started editing. `0` means "I
 * believe there is nothing here yet", which is how a first save and a resurrected-from-draft save
 * both announce themselves honestly.
 *
 * ── why the check is not a transaction ──
 *
 * Two writers racing between the GET and the SET can both pass the check. That window is
 * milliseconds and the loser is the one whose SET lands second, so the outcome is the same
 * last-write-wins it would have been WITHOUT the check — never worse. What the check removes is the
 * common case, which is not a race at all: a tab left open for an hour, or a phone coming back from
 * sleep, saving a revision from before everything the laptop did. That is minutes stale, not
 * milliseconds, and it is the one that destroys work.
 *
 * A Lua CAS would close the window and is the right upgrade if this ever runs hot. It is not the
 * reason this function exists and pretending otherwise would be the wrong thing to optimise first.
 */
export async function saveServerResume(input: {
  email: string;
  resumeId: string;
  lang: "ar" | "en";
  state: BuilderState;
  baseRevision: number;
  title: string;
  now?: number;
}): Promise<SaveResult> {
  if (!resumeServerConfigured()) return { ok: false, reason: "unconfigured" };
  const { email, resumeId, lang, state, baseRevision } = input;
  if (!email || !resumeId || !state || typeof state !== "object") return { ok: false, reason: "invalid" };

  const body = JSON.stringify(state);
  if (body.length > MAX_DOC_BYTES) return { ok: false, reason: "too-large" };

  /* `readStrict`, not the lenient read — a failed read here must not be mistaken for an empty slot.
     See its header: that mistake overwrites a live CV at revision 1. */
  const current = await readStrict(email, resumeId);
  if (current && current.revision !== baseRevision) {
    return { ok: false, reason: "conflict", current };
  }

  const now = input.now ?? Date.now();
  const revision = (current?.revision ?? 0) + 1;
  const record: ServerResume = {
    account: norm(email), resumeId, recordVersion: SERVER_RECORD_VERSION,
    revision, lang, updatedAt: now, state,
  };
  await redis(["SET", docKey(email, resumeId), JSON.stringify(record)]);

  const summary: ServerResumeSummary = {
    resumeId, lang, revision, updatedAt: now,
    title: (input.title || "").slice(0, 120),
  };
  await touchIndex(email, summary);
  return { ok: true, revision, summary };
}

/**
 * Keep the index in step with the record.
 *
 * Written after the record, deliberately. If this throws, the document is safely stored and only
 * the list is stale — a CV you have to reach by URL. The other order loses the document and keeps a
 * list entry pointing at nothing, which is the worse half of the same failure.
 */
async function touchIndex(email: string, summary: ServerResumeSummary): Promise<void> {
  const list = await listServerResumes(email);
  const next = [summary, ...list.filter((s) => s.resumeId !== summary.resumeId)]
    .slice(0, MAX_RESUMES_PER_ACCOUNT);
  try { await redis(["SET", indexKey(email), JSON.stringify(next)]); } catch { /* see above */ }
}

/** Remove one. The index entry goes first here — a list entry for a deleted CV is a dead link. */
export async function deleteServerResume(email: string, resumeId: string): Promise<boolean> {
  if (!resumeServerConfigured() || !email || !resumeId) return false;
  const list = await listServerResumes(email);
  try { await redis(["SET", indexKey(email), JSON.stringify(list.filter((s) => s.resumeId !== resumeId))]); } catch { /* fall through */ }
  try { await redis(["DEL", docKey(email, resumeId)]); } catch { return false; }
  return true;
}

/**
 * Copy a record into a new resumeId, under the same account.
 *
 * This is the primitive Phase 4's "duplicate and tailor" is built from, and it lives here rather
 * than in the route because the ONE rule that makes it safe is a storage rule: the source record is
 * read and never written. A duplicate that can touch its original is not a duplicate, and the
 * failure would appear as the user's good CV being overwritten by an experiment.
 */
export async function duplicateServerResume(input: {
  email: string; sourceId: string; newId: string; title: string; now?: number;
}): Promise<SaveResult> {
  const src = await readServerResume(input.email, input.sourceId);
  if (!src) return { ok: false, reason: "invalid" };
  return saveServerResume({
    email: input.email, resumeId: input.newId, lang: src.lang, state: src.state,
    baseRevision: 0, title: input.title, now: input.now,
  });
}
