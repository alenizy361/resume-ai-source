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
  /**
   * The account revision this record last agreed with — written by `markMirrored` after a
   * successful mirror or an adoption, 0 for a record that has never met the server.
   *
   * This is what makes "is the server AHEAD of what this browser has seen?" answerable at all.
   * `revision` above cannot answer it: that is a local per-write counter, incremented by every
   * autosave, and comparing it to the server's own counter compares two unrelated clocks. Without
   * this field the mount-time pull had no basis for comparison and offered the server copy
   * unconditionally — which, after a session whose final mirror failed (tab closed on a train),
   * adopted the OLDER server copy over the newer local edits and then autosaved the loss.
   */
  serverRevision: number;
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
      /* 0 for records written before the field existed: "never met the server" is the safe
         reading — the pull then treats any server copy as new and the untouched-guard decides. */
      serverRevision: Number(r.serverRevision) || 0,
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
  opts: { revision?: number; dirty?: boolean; now?: number; serverRevision?: number } = {},
): number {
  const store = ls();
  if (!store || !resumeId) return 0;
  const now = opts.now ?? Date.now();
  const existing = readResume(owner, resumeId).record;
  const revision = opts.revision ?? (existing?.revision ?? 0) + 1;

  const record: ResumeRecord = {
    owner, resumeId, recordVersion: RESUME_RECORD_VERSION,
    revision, lang, updatedAt: now, dirty: opts.dirty !== false,
    /* Carried forward by default: an ordinary autosave does not change which server revision
       this browser has seen — only `markMirrored` (a confirmed mirror or an adoption) does. */
    serverRevision: opts.serverRevision ?? existing?.serverRevision ?? 0,
    state,
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

/**
 * Record that this browser's copy and the account's copy agree, as of `serverRevision`.
 *
 * Called after a successful mirror PUT, and after adopting an incoming server copy. A targeted
 * amendment, deliberately NOT a `writeResume`: acknowledging a mirror is not an edit, so it must
 * not bump `revision`, must not move the resume to the top of the index, and must not extend an
 * anonymous visit. It clears `dirty` — the definition of clean is exactly "the server has
 * confirmed this content".
 */
export function markMirrored(
  owner: string, resumeId: string, serverRevision: number,
  opts: { clean?: boolean } = {},
): void {
  const store = ls();
  if (!store || !resumeId) return;
  const { record } = readResume(owner, resumeId);
  if (!record) return;
  try {
    store.setItem(recordKey(owner, resumeId), JSON.stringify({
      ...record,
      /* `clean` only when the caller knows the mirrored content IS the current content — a mirror
         that raced a newer keystroke confirms the revision without vouching for the edits. */
      dirty: opts.clean === false ? record.dirty : false,
      serverRevision,
    }));
  } catch { /* a failed acknowledgement costs nothing — the next mirror repeats it */ }
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

/*
 * ══════════════════════════════════════════════════════════════════════════════
 * A SECOND TAB IS NOT A NEW VISIT — AND USED TO DESTROY THE FIRST TAB'S WORK
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The rule above ("the visit is the tab session") is right, and the header even anticipated a
 * second tab — it judged the cost to be "one clean builder rather than a stranger's half-built
 * CV appearing". That was the intent. It is not what the code did.
 *
 * `sessionStorage` is per TAB. So a second tab has no marker, `mayRestore` answers false, and
 * `BuilderProvider` then calls `endAnonymousVisit()` — which does not merely decline to restore,
 * it `forgetOwner("anon")`s the entire anonymous keyspace. Measured: two real CVs (12,504 and
 * 7,033 bytes) replaced by one empty 781-byte record, from nothing but opening cv.rabit.sa in a
 * new tab while the first was still open and mid-edit. Silent, immediate, unrecoverable.
 *
 * The missing fact is "is another tab of this same browser session still alive?", which
 * `sessionStorage` structurally cannot answer and `localStorage` can. That is a DIFFERENT
 * question from "when does a visit end" — the header retired `VISIT_GAP_MS` so that question
 * would have one answer, and this does not reopen it. A visit still ends when the last tab
 * closes. This only stops one live tab being mistaken for zero.
 *
 * ── the numbers ──
 *
 * Every open builder tab restamps the lease each `LEASE_BEAT_MS`. A lease newer than
 * `LEASE_FRESH_MS` means a sibling tab is live, so this tab joins the visit instead of ending it.
 *
 * The gap between the two is deliberate and large. Browsers throttle timers in BACKGROUND tabs to
 * roughly once a minute, which is exactly the tab this has to protect — the one left open on the
 * review step while the user reads a job advert in another. A 60s beat against a 5-minute
 * threshold survives that throttling five times over. Erring long is the safe direction: the cost
 * of a stale lease read as live is that an old anonymous draft survives a few extra minutes; the
 * cost of a live lease read as stale is the bug above.
 */
const LIVE_LEASE = "ra_visit_live";
const LEASE_BEAT_MS = 60_000;
const LEASE_FRESH_MS = 5 * 60_000;

/*
 * ── the lease is a REGISTRY of tabs, not one timestamp, and the first version was worse than
 *    the bug it fixed ──
 *
 * The first version stored a bare `Date.now()`. `keepVisitAlive()` stamps it on mount, and the
 * builder's hydration effect bails on its first pass because `useOwner()` has not answered yet —
 * so by the time `mayRestore("anon")` actually runs, the only thing in the lease is a stamp THIS
 * TAB wrote milliseconds earlier. Every tab therefore read itself as a live sibling, the anonymous
 * visit never expired, and a shared machine showed the next person the previous one's half-built
 * CV — the exact complaint the header above quotes, reintroduced by the fix for a different one.
 * Measured with a negative control: block the lease write and correct wiping returns immediately.
 *
 * A stamp cannot answer "is somebody ELSE alive", so the value is now `{ tabId: lastBeat }` and a
 * tab looks for a fresh entry belonging to a DIFFERENT id. That also makes the multi-tab lifecycle
 * correct, which a single shared key could not be: closing one of three tabs removes only its own
 * entry, so the remaining two still hold the visit open.
 *
 * ── the residual window, stated rather than hidden ──
 *
 * A tab that is KILLED (crash, force-quit, iOS reclaiming the process) never runs its teardown, so
 * its entry lingers until it goes stale. For up to `LEASE_FRESH_MS` after a crash, reopening looks
 * like joining a live visit. That is the deliberate trade: the alternative is a shorter freshness
 * window, and the window has to outlast a BACKGROUNDED tab's throttled timer — browsers cut those
 * to roughly one beat a minute, which is exactly the tab this protects. Five minutes against a
 * 60-second beat is the smallest ratio that survives the throttling with margin.
 */
type Lease = Record<string, number>;

/**
 * This tab's id, stable for the tab's lifetime.
 *
 * In `sessionStorage`, so a RELOAD keeps the same id — a reload is the same tab, and a fresh id on
 * every reload would let a tab inherit its own previous entry and reintroduce the self-read above.
 */
function tabId(): string {
  const sess = ss();
  if (!sess) return "";
  try {
    let id = sess.getItem("ra_tab_id");
    if (!id) {
      id = `t${Math.random().toString(36).slice(2, 10)}`;
      sess.setItem("ra_tab_id", id);
    }
    return id;
  } catch { return ""; }
}

function readLease(): Lease {
  const store = ls();
  if (!store) return {};
  try {
    const raw = store.getItem(LIVE_LEASE);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Lease = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
    return out;
  } catch { return {}; }   // includes the bare-timestamp value the first version wrote
}

/** Is a sibling tab of this browser session still holding the anonymous visit open? */
function siblingTabIsLive(now = Date.now()): boolean {
  const me = tabId();
  return Object.entries(readLease()).some(([id, at]) =>
    id !== me
    /* A future-dated entry is a clock that moved (a timezone change, an NTP correction). Read as
       live: that failure direction costs an old draft a few extra minutes, and the other one is the
       data loss this whole mechanism exists to prevent. */
    && (at > now || now - at < LEASE_FRESH_MS));
}

/**
 * Hold the anonymous visit open for as long as this tab is on screen.
 *
 * Called by the builder on mount. Returns its own teardown, which removes THIS tab's entry — so
 * when the last tab goes, the registry empties and the next visit starts clean, which is the rule
 * in the header intact.
 */
export function keepVisitAlive(): () => void {
  const store = ls();
  const me = tabId();
  if (!store || !me) return () => {};

  const write = (mutate: (l: Lease) => void) => {
    try {
      const now = Date.now();
      const lease = readLease();
      /* Stale entries are pruned on every write, so a browser that crashed months ago does not
         leave a key growing an entry per visit. */
      for (const [id, at] of Object.entries(lease)) {
        if (id !== me && at <= now && now - at >= LEASE_FRESH_MS) delete lease[id];
      }
      mutate(lease);
      const keys = Object.keys(lease);
      if (keys.length) store.setItem(LIVE_LEASE, JSON.stringify(lease));
      else store.removeItem(LIVE_LEASE);
    } catch { /* a blocked storage must not break the builder */ }
  };

  const beat = () => write((l) => { l[me] = Date.now(); });
  const leave = () => write((l) => { delete l[me]; });

  beat();
  const id = setInterval(beat, LEASE_BEAT_MS);
  /* A tab returning to the foreground has just had its timer throttled for however long it was
     hidden; restamping on the way back means the lease is never judged on a beat the browser
     refused to run. */
  const onShow = () => { if (document.visibilityState === "visible") beat(); };
  /*
   * Both listeners are OPTIONAL, and that is not defensive noise.
   *
   * This module is unit-tested in plain Node against a fake `window` that carries only the two
   * storages — deliberately, because the key scheme is what those tests are about. An unguarded
   * `window.addEventListener` threw there, and the same shape of gap is real in a browser too: an
   * embedded webview or a hardened environment can hand back an object missing either API, and a
   * store that cannot register a listener must still keep the lease beating.
   */
  document.addEventListener?.("visibilitychange", onShow);
  /* `pagehide` as well as the React teardown: a tab closed outright never unmounts anything, and a
     clean close is the case where the visit genuinely should end immediately rather than waiting
     out the freshness window. */
  window.addEventListener?.("pagehide", leave);

  return () => {
    clearInterval(id);
    document.removeEventListener?.("visibilitychange", onShow);
    window.removeEventListener?.("pagehide", leave);
    leave();
  };
}

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
  try { if (sess.getItem(SESSION_VISIT)) return true; } catch { return false; }
  /* No marker in THIS tab, but a sibling tab of the same browser session may still be holding
     the visit open — see the lease block above. Without this, a second tab was a new visit, and
     a new visit destroys the old one's CVs. */
  return siblingTabIsLive();
}

/**
 * Move the anonymous resumes into an account that has just signed in.
 *
 * The resume half of `personalStore.adoptAnonymous`, and it exists for the same reported failure:
 * a buyer pays anonymously, `/api/pay/verify` signs them in, the owner changes from `anon` to
 * `u_<base64 email>` — and everything they had built in this browser was addressed `ra_cv:anon:*`.
 *
 * ── the ids are kept ──
 *
 * A resume keeps its `resumeId` across the move, so a URL the user has open, or has bookmarked, or
 * pressed Back to, still resolves. Minting new ids would break every one of those and gain nothing.
 * The id was never a secret and was never account-scoped; the KEY is.
 *
 * ── collisions cannot happen, and are handled anyway ──
 *
 * `newResumeId` is time-plus-random, so an anonymous id colliding with one the account already has
 * is not a real scenario. If it ever did, the account's record wins and the anonymous one is
 * dropped, matching the rule in `adoptAnonymous`: the account is the authority.
 *
 * ── and the anonymous keyspace is emptied ──
 *
 * `forgetOwner("anon")` at the end, so nothing is left for the next anonymous visitor in this
 * browser to inherit. Adopting without removing would turn a data-loss bug into a data-leak one.
 */
export function adoptAnonymousResumes(owner: string, now = Date.now()): number {
  const store = ls();
  if (!store || !owner || owner === "anon") return 0;
  let moved = 0;
  for (const summary of listResumes("anon")) {
    const { record } = readResume("anon", summary.resumeId);
    if (!record) continue;
    if (readResume(owner, summary.resumeId).record) continue;   // the account's own wins
    /* Written through `writeResume` rather than by copying the raw string: the record CARRIES its
       owner, and a copied record would still say `anon` inside — which `readResume` would then
       refuse and quarantine, silently losing exactly what this function set out to save. */
    writeResume(owner, summary.resumeId, record.lang, record.state, { now });
    moved++;
  }
  if (moved) forgetOwner("anon");
  return moved;
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
  /* And the liveness lease, so the tab that just declared the visit over does not immediately
     read its OWN stale stamp as a sibling and re-open it. */
  try { store.removeItem(LIVE_LEASE); } catch { /* noop */ }
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
