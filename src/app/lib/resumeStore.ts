/**
 * One resume, one key, one owner.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE BUG THIS EXISTS TO KILL
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * `draftStore.writeBuilder(lang, id, state)` wrote to `ra_journey_en` — ONE slot per language,
 * for every resume the browser had ever held. The `resumeId` was a FIELD INSIDE the value, not
 * part of the key. So:
 *
 *   1. Build Resume A → `ra_journey_en` = { resumeId: "rA", builder: A }
 *   2. Build Resume B → `ra_journey_en` = { resumeId: "rB", builder: B }     ← A is gone
 *   3. Open /builder/rA/target → hydrate reads `ra_journey_en`, gets B
 *
 * B's content then rendered under A's URL, and the next autosave wrote it back as A. That is both
 * halves of the report — "old resume data returns" and "overwrites the current form" — and the
 * second half is silent destruction of the CV the user thought they were editing.
 *
 * `BuilderProvider` made it certain rather than likely: it hydrated with `readBuilder(lang)` and its
 * own comment said "Keyed on `lang` only. Not on `urlId`". The URL's id was used for the address bar
 * and ignored for the data.
 *
 * And no key anywhere carried an OWNER, so the same browser signed into a second account showed the
 * first account's CV. That is a worse bug than the one reported, and nobody had reported it yet.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE RULE
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * A stored resume is addressed by (owner, resumeId) and validates both on the way out. A record
 * whose contents disagree with the key it was found under is not returned — it is quarantined.
 * Nothing is "the current resume"; there is no such concept here, because that concept is what
 * broke.
 *
 * This module is browser storage only, and browser storage is a RECOVERY DRAFT — not the source of
 * truth. Server persistence is `/api/resumes` and is a separate, larger piece of work; see
 * `docs/resume-isolation.md` for the staging and for the anonymous-user problem that makes
 * "the server is always authoritative" untrue for this product today.
 */

import type { BuilderState } from "./builderDoc.ts";

/** Bumped when the RECORD envelope changes. Independent of `BuilderState.schemaVersion`. */
export const RESUME_RECORD_VERSION = 1;

export interface ResumeRecord {
  /** Repeated inside the value so a record found under the wrong key can be detected. */
  owner: string;
  resumeId: string;
  recordVersion: number;
  /** Monotonic per resume. The server's revision, when there is one, supersedes it. */
  revision: number;
  lang: "ar" | "en";
  updatedAt: number;
  /** Set when this copy holds edits not yet confirmed by a server save. */
  dirty: boolean;
  state: BuilderState;
}

export interface ResumeSummary {
  resumeId: string;
  title: string;
  lang: "ar" | "en";
  updatedAt: number;
  revision: number;
}

/* ─────────────────────────── keys ─────────────────────────── */

/**
 * The owner half of every key.
 *
 * `anon` is a real owner, not a missing one. The builder works without an account by design — the
 * product promises exactly that — so an anonymous draft has to live somewhere addressable. What
 * matters is that `anon` and a signed-in owner never collide, and that signing in does not silently
 * adopt whatever `anon` was holding.
 *
 * base64url of the lowercased email: stable, reversible for nobody who matters, and free of the
 * characters that make storage keys ambiguous. The email is already in the browser's own session;
 * this adds no exposure.
 */
export function ownerKey(email: string | null | undefined): string {
  const e = (email || "").toLowerCase().trim();
  if (!e) return "anon";
  try {
    return "u_" + btoa(e).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch {
    /* Non-Latin email, or a browser without btoa. A stable non-colliding fallback beats throwing
       inside a storage-key helper. */
    let h = 0;
    for (let i = 0; i < e.length; i++) h = (h * 31 + e.charCodeAt(i)) | 0;
    return "u_h" + (h >>> 0).toString(36);
  }
}

export const recordKey = (owner: string, resumeId: string): string => `ra_cv:${owner}:${resumeId}`;
export const indexKey = (owner: string): string => `ra_cv_index:${owner}`;
/** Where a record that disagrees with its own key is put, so nothing overwrites it silently. */
export const quarantineKey = (owner: string, resumeId: string): string => `ra_cv_bad:${owner}:${resumeId}`;

/* ─────────────────────────── ids ─────────────────────────── */

/**
 * A fresh resume id, unique per owner.
 *
 * Time-plus-entropy rather than time alone. The old `newResumeId` was `r${Date.now().toString(36)}`,
 * which collides when two resumes are created inside the same millisecond — rare by hand, routine in
 * a test that creates two in a loop, and a collision here means two resumes sharing one key, which
 * is the exact class of bug this module exists to end.
 */
export function newResumeId(now = Date.now()): string {
  const rand = Math.floor(Math.random() * 1296).toString(36).padStart(2, "0");
  return `r${now.toString(36)}${rand}`;
}

/* ─────────────────────────── read ─────────────────────────── */

const ls = (): Storage | null => {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
};

/**
 * Read ONE resume, by owner and id, or `null`.
 *
 * Returns `null` for "not here" and never for "here is a different one". Every earlier version of
 * this code had a fallback that reached for the most recent draft when the requested one was
 * missing, and that fallback is the bug: a missing resume must render an empty form, because the
 * alternative is showing someone another CV.
 */
export function readResume(owner: string, resumeId: string): { record: ResumeRecord | null; damaged: boolean } {
  const store = ls();
  if (!store || !resumeId) return { record: null, damaged: false };

  let raw: string | null = null;
  try { raw = store.getItem(recordKey(owner, resumeId)); } catch { return { record: null, damaged: false }; }
  if (!raw) return { record: null, damaged: false };

  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch {
    /* Unparseable. Copy it aside before anything is allowed to write over it — this is somebody's
       only copy, and an autosave 450ms later used to be the thing that finished it off. */
    try { store.setItem(quarantineKey(owner, resumeId), raw); store.removeItem(recordKey(owner, resumeId)); } catch { /* nothing more to do */ }
    return { record: null, damaged: true };
  }

  const r = parsed as Partial<ResumeRecord>;
  /*
   * The identity check, and it is the whole point of storing the pair inside the value.
   *
   * A record that says it belongs to a different owner or a different resume has been written under
   * the wrong key — by a bug, a migration, or a shared browser. Serving it would be the original
   * fault wearing a new key scheme, so it is quarantined and reported as damaged rather than used.
   */
  if (!r || typeof r !== "object" || !r.state || r.owner !== owner || r.resumeId !== resumeId) {
    try { store.setItem(quarantineKey(owner, resumeId), raw); store.removeItem(recordKey(owner, resumeId)); } catch { /* noop */ }
    return { record: null, damaged: true };
  }

  return {
    record: {
      owner,
      resumeId,
      recordVersion: Number(r.recordVersion) || 1,
      revision: Number(r.revision) || 0,
      lang: r.lang === "ar" ? "ar" : "en",
      updatedAt: Number(r.updatedAt) || 0,
      dirty: r.dirty !== false,
      state: r.state as BuilderState,
    },
    damaged: false,
  };
}

/* ─────────────────────────── write ─────────────────────────── */

/**
 * Persist one resume under its own key and keep the owner's index in step.
 *
 * Synchronous, because autosave is debounced and a debounce plus a route change is a race the user
 * loses: type, press Continue, and the navigation beats the timer. Every Continue calls this
 * directly so the write has landed before the next step mounts.
 *
 * Returns the revision it wrote, so a caller can tell a confirmed save from a stale one.
 */
export function writeResume(
  owner: string, resumeId: string, lang: "ar" | "en", state: BuilderState,
  opts: { revision?: number; dirty?: boolean; now?: number } = {},
): number {
  const store = ls();
  if (!store || !resumeId) return 0;
  const now = opts.now ?? Date.now();
  const revision = opts.revision ?? (readResume(owner, resumeId).record?.revision ?? 0) + 1;

  const record: ResumeRecord = {
    owner, resumeId, recordVersion: RESUME_RECORD_VERSION,
    revision, lang, updatedAt: now, dirty: opts.dirty !== false, state,
  };
  try { store.setItem(recordKey(owner, resumeId), JSON.stringify(record)); } catch { return 0; }

  touchIndex(owner, {
    resumeId, lang, updatedAt: now, revision,
    title: titleOf(state),
  });
  /* Stamped here rather than by a caller: every write is activity by definition, and a marker a
     caller has to remember to set is a marker that drifts from the data it describes. */
  touchVisit(owner, now);
  return revision;
}

/** The list a "my CVs" screen reads. Derived from writes, never from scanning storage. */
export function listResumes(owner: string): ResumeSummary[] {
  const store = ls();
  if (!store) return [];
  try {
    const raw = store.getItem(indexKey(owner));
    if (!raw) return [];
    const list = JSON.parse(raw) as ResumeSummary[];
    if (!Array.isArray(list)) return [];
    return list
      .filter((e) => e && typeof e.resumeId === "string")
      .sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
  } catch { return []; }
}

function touchIndex(owner: string, entry: ResumeSummary): void {
  const store = ls();
  if (!store) return;
  const next = [entry, ...listResumes(owner).filter((e) => e.resumeId !== entry.resumeId)].slice(0, 50);
  try { store.setItem(indexKey(owner), JSON.stringify(next)); } catch { /* noop */ }
}

/** Remove one resume and its index entry. Quarantined copies are left alone deliberately. */
export function deleteResume(owner: string, resumeId: string): void {
  const store = ls();
  if (!store) return;
  try {
    store.removeItem(recordKey(owner, resumeId));
    store.setItem(indexKey(owner), JSON.stringify(listResumes(owner).filter((e) => e.resumeId !== resumeId)));
  } catch { /* noop */ }
}

/**
 * Every key belonging to one owner, removed. For sign-out.
 *
 * Scans rather than trusting the index, because the index is itself a cache and the one thing that
 * must not survive a sign-out is a record the index had forgotten about.
 */
export function forgetOwner(owner: string): number {
  const store = ls();
  if (!store) return 0;
  const doomed: string[] = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (!k) continue;
      if (k.startsWith(`ra_cv:${owner}:`) || k.startsWith(`ra_cv_bad:${owner}:`) || k === indexKey(owner)) doomed.push(k);
    }
    for (const k of doomed) store.removeItem(k);
  } catch { /* noop */ }
  return doomed.length;
}

/* ─────────────────────────── how long an anonymous draft lives ─────────────────────────── */

/**
 * The visit marker, and the product rule it encodes.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * ANONYMOUS WORK LASTS THE VISIT. SIGNING IN IS WHAT SAVES IT.
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * The builder works without an account, which is deliberate and is most of the funnel. But a browser
 * that quietly resurrects a stranger's half-built CV weeks later is the behaviour that produced
 * every "old data came back" report in this product — and on a shared device it is worse than
 * annoying.
 *
 * So the rule is now explicit rather than emergent: an anonymous draft is a RECOVERY BUFFER for the
 * visit in progress, not a saved document. Come back later and the builder starts clean. Sign in and
 * your CVs are yours again, from `/api/resumes` and from the owner-scoped records that survive.
 *
 * ── what "the visit" means, and why the first answer was wrong ──
 *
 * This was a thirty-minute last-seen timestamp in localStorage. The reasoning was that thirty
 * minutes covers a refresh, a phone call, a look at the advert in another app — and that
 * `sessionStorage` was unusable because it is per-tab, so a second tab would read as a new visit and
 * wipe the first.
 *
 * It was reported straight back: open the site and the previous entries are still there. The
 * instruction had been plain — no cache, and signing in is what brings old data back — and thirty
 * minutes of localStorage is a cache. The second-tab argument was also weaker than it looked: a
 * second tab is not how people use this, and the cost of getting it wrong there is one clean builder
 * rather than a stranger's half-built CV appearing.
 *
 * So the visit is now the TAB SESSION, marked in `sessionStorage`:
 *
 *   refresh, or iOS reclaiming and restoring the tab   → same visit, work recovered
 *   closing the tab and coming back, at any interval   → new visit, clean builder
 *   signing in                                         → the account's CVs, always
 *
 * That is the rule as asked for, and it keeps the one recovery that is not optional: a person who
 * fills four fields and reloads must not lose them.
 *
 * ── it fails CLOSED ──
 *
 * If `sessionStorage` cannot be reached — private mode in some browsers, a storage policy — the
 * answer is "do not restore". The cost of that is a clean builder. The cost of failing the other way
 * is old data surfacing, which is the thing being fixed.
 *
 * `VISIT_GAP_MS` is gone rather than kept "in case": a second definition of when a visit ends is how
 * two answers to the same question end up in one product.
 */
const visitKey = (owner: string): string => `ra_visit:${owner}`;

/**
 * The tab-session marker for anonymous work. Not owner-keyed: `sessionStorage` is already scoped to
 * the tab, and `anon` is the only owner this applies to.
 */
const SESSION_VISIT = "ra_visit_session";

const ss = (): Storage | null => {
  try { return typeof window === "undefined" ? null : window.sessionStorage; } catch { return null; }
};

/**
 * Record that this owner is active in this visit. Called on every write.
 *
 * For `anon` the marker that DECIDES restoration is the sessionStorage one. The localStorage
 * timestamp is still written because `endAnonymousVisit` and the account screens use it to tell "has
 * ever worked here" from "has never" — it no longer grants anything.
 */
export function touchVisit(owner: string, now = Date.now()): void {
  const store = ls();
  if (store && owner) {
    try { store.setItem(visitKey(owner), String(now)); } catch { /* noop */ }
  }
  if (owner === "anon") {
    const sess = ss();
    try { sess?.setItem(SESSION_VISIT, String(now)); } catch { /* noop */ }
  }
}

/**
 * May a stored draft be restored for this owner?
 *
 * Always true for a signed-in account — their CVs are theirs, and that is the whole offer made in
 * exchange for signing in. For `anon` it is true only inside the visit.
 */
export function mayRestore(owner: string): boolean {
  if (!owner) return false;
  /* A signed-in account, always. That is the entire offer made in exchange for signing in, and it is
     the answer to "how do I get my old CV back": sign in. */
  if (owner !== "anon") return true;
  const sess = ss();
  if (!sess) return false;                    // fails closed — see the header
  try { return Boolean(sess.getItem(SESSION_VISIT)); } catch { return false; }
}

/**
 * Drop the anonymous keyspace, for a visit that has expired.
 *
 * Only `anon`. A signed-in account's records are never touched by this — the point of the rule is
 * the difference between the two, and a function that blurred it would be the rule cancelling itself.
 */
export function endAnonymousVisit(): number {
  const store = ls();
  if (!store) return 0;
  const removed = forgetOwner("anon");
  try { store.removeItem(visitKey("anon")); } catch { /* noop */ }
  /* The session marker too, so a builder opened twice in one lapsed tab does not decide differently
     the second time. */
  try { ss()?.removeItem(SESSION_VISIT); } catch { /* noop */ }
  return removed;
}

/**
 * Has any SIGNED-IN account ever stored a resume in this browser?
 *
 * Synchronous, and that is the entire point. `useOwner` cannot answer "who owns this" without asking
 * the server, and the builder cannot read a draft without an owner — so the form was waiting on a
 * network round-trip before rendering a single field. On a phone that is seconds of grey skeleton on
 * the first screen of the funnel.
 *
 * But the wait only BUYS anything when there is something to get wrong. The failure it guards against
 * is showing one account's CV to another, and that requires a signed-in account's record to already
 * exist here. If none does, `anon` is not a guess — it is the only possible answer, and it is
 * available immediately from local storage.
 *
 * So: false means "answer `anon` now and confirm in the background"; true means "wait, correctness
 * outranks speed". Keys are `ra_cv:{owner}:{resumeId}` and a signed-in owner is always `u_…`, so the
 * prefix is exact rather than heuristic.
 */
export function hasOwnedRecords(): boolean {
  const store = ls();
  if (!store) return false;
  try {
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && (k.startsWith("ra_cv:u_") || k.startsWith("ra_cv_index:u_"))) return true;
    }
  } catch { /* a blocked store cannot be holding anyone's record either */ }
  return false;
}

/** A readable name for the index, from whatever the resume has so far. */
export function titleOf(state: BuilderState): string {
  const t = state?.target?.title?.trim();
  const n = state?.profile?.name?.trim();
  return t || n || "Untitled";
}

/* ─────────────────────────── migration off the shared slot ─────────────────────────── */

/** The keys the old scheme used. Read once, then moved aside. */
export const legacyKey = (lang: "ar" | "en"): string => `ra_journey_${lang}`;
export const legacyRetiredKey = (lang: "ar" | "en"): string => `ra_journey_${lang}_legacy`;

/**
 * Move the one shared slot into a proper (owner, resumeId) record, once.
 *
 * The legacy value is RENAMED rather than deleted. It is the only copy of a real person's CV, and
 * the brief's "do not leave both persistences active" is about the READ path — nothing reads
 * `_legacy`, so it is inert, and inert beats destroyed if this migration turns out to be wrong.
 *
 * Its resumeId comes from inside the record, which is the one place the old scheme did record it.
 * Absent that, one is minted — a draft with content and no id still belongs to somebody.
 *
 * Attributed to whoever is signed in AT MIGRATION TIME, and that is a genuine judgement call rather
 * than an obvious answer: the legacy slot has no owner, so there is no fact of the matter. Giving it
 * to the current session matches what the user sees (their own draft, on their own device) and is
 * why `anon` and signed-in owners are separate — an anonymous draft migrated under `anon` stays
 * reachable while signed out, and does not silently become the account's.
 */
export function migrateLegacy(owner: string, lang: "ar" | "en", now = Date.now()): {
  migrated: boolean; resumeId: string | null;
} {
  const store = ls();
  if (!store) return { migrated: false, resumeId: null };

  let raw: string | null = null;
  try { raw = store.getItem(legacyKey(lang)); } catch { return { migrated: false, resumeId: null }; }
  if (!raw) return { migrated: false, resumeId: null };

  const retire = () => { try { store.setItem(legacyRetiredKey(lang), raw as string); store.removeItem(legacyKey(lang)); } catch { /* noop */ } };

  type LegacyDraft = { resumeId?: string; builder?: BuilderState };
  let old: LegacyDraft | null = null;
  try { old = JSON.parse(raw) as LegacyDraft; } catch {
    /* Unparseable legacy draft: retire it so it cannot be read as a resume, and say nothing was
       migrated. The bytes survive under `_legacy`. */
    retire();
    return { migrated: false, resumeId: null };
  }

  const state = old?.builder;
  if (!state || !state.schemaVersion) { retire(); return { migrated: false, resumeId: null }; }

  const id = old?.resumeId || newResumeId(now);
  /* Only if the target is free. A migration must never overwrite a record written under the new
     scheme — the new one is by definition more recent and more trustworthy. */
  if (!readResume(owner, id).record) {
    writeResume(owner, id, lang, state, { revision: 1, dirty: true, now });
  }
  retire();
  return { migrated: true, resumeId: id };
}
