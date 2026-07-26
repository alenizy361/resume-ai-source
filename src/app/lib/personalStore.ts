/**
 * Owner-scoped browser storage for everything personal that is NOT a builder draft.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS, AND WHY IT IS SEPARATE FROM `resumeStore`
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * `resumeStore` fixed the builder: a draft is addressed by (owner, resumeId) and a record that
 * disagrees with its key is quarantined rather than served. That closed the reported bug and the worse
 * unreported one — the second account on a shared laptop reading the first account's CV.
 *
 * It closed it for ONE store. Seven others were left keyed on nothing at all, and between them they
 * hold more of a person than the builder draft does:
 *
 *   ra_saved_resumes    the FULL TEXT of up to ten finished CVs, with scores and a `userId`
 *   ra_scan_history     ten complete ATS analyses, each embedding the result it was run on
 *   ra_jobs            up to fifty applications — company, title, private notes
 *   ra_optimize_draft   the full CV text pasted into the optimiser, plus the job advert
 *   ra_optimize_result  the analysis of it            (and `ra_ar_…` for both, one per language)
 *   ra_published        slugs of live public CVs AND their unpublish tokens
 *   ra_owned            the paid-entitlement flag
 *
 * On a shared browser every one of those crossed accounts. `ra_published` is the sharpest: the
 * unpublish token is a capability, so the second account could take the first account's CV offline.
 * `ra_owned` is the cheapest to exploit — sign in as anyone and inherit a purchase.
 *
 * It is a separate module because the shapes are different. A resume record is one object with an
 * identity to validate; these are seven independent values of four different shapes, and the only
 * thing they need in common is that the owner is in the KEY. Forcing them into `ResumeRecord` would
 * mean an envelope around a boolean.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE RULE
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * Nothing personal is read or written without an owner. Callers that do not know the owner yet read
 * NOTHING — not the unowned key, not a default — because the alternative is rendering one person's
 * CV while the answer is in flight.
 *
 * `anon` is a real owner (see `ownerKey`), so signing out does not mean "no scoping". It means a
 * different keyspace, and the two never merge: an anonymous draft stays anonymous, exactly as
 * `migrateLegacy` decided for the builder. Consistency with that decision matters more than
 * re-litigating it here — two different adoption policies in one product is how a browser ends up
 * holding data nobody can account for.
 */

/** Every base name that must carry an owner. Anything not here is not personal — see below. */
export const PERSONAL_KEYS = [
  "ra_saved_resumes",
  "ra_scan_history",
  "ra_jobs",
  "ra_optimize_draft",
  "ra_optimize_result",
  "ra_ar_optimize_draft",
  "ra_ar_optimize_result",
  "ra_published",
  "ra_owned",
] as const;

export type PersonalKey = (typeof PERSONAL_KEYS)[number];

/**
 * Keys that are deliberately NOT scoped, listed so the omission is a decision on the record rather
 * than something a later reader has to guess at.
 *
 *   ra_lang, ra_lang_choice   which language the interface is in. A device preference, and the whole
 *                             point is that it survives a sign-out — scoping it would reset a person's
 *                             language every time they logged out.
 *   ra_login_sent             a rate-limit breadcrumb for the magic-link form, set BEFORE anyone is
 *                             signed in. There is no owner to scope it to.
 *   ra_funnel_entry           which page the visit started on. Anonymous by construction; it exists to
 *                             measure entry doors and carries nothing about a person.
 *   ra_flag_builder           a local feature-flag override, for development.
 *
 * `ops/isolation.test.mjs` asserts this list and `PERSONAL_KEYS` together cover every literal storage
 * key in the app, so a new key cannot quietly join neither list.
 */
export const DEVICE_KEYS = [
  "ra_lang",
  "ra_lang_choice",
  "ra_login_sent",
  "ra_funnel_entry",
  "ra_flag_builder",
] as const;

/** `ra_jobs` → `ra_jobs:u_abc`. Owner last, so a prefix scan by base still groups them. */
export const scopedKey = (owner: string, base: PersonalKey): string => `${base}:${owner}`;

/** Where a legacy unowned value is retired to. Nothing reads these; they are kept, not used. */
export const retiredKey = (base: PersonalKey): string => `${base}_legacy`;

const ls = (): Storage | null => {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
};

/* ─────────────────────────── read and write ─────────────────────────── */

/**
 * Read one value, or `null`.
 *
 * An empty owner returns `null` rather than falling back to the unowned key. That is the single most
 * important line in this module: the fallback is what a caller reaches for while `/api/auth/me` is
 * still in flight, and it is precisely how the previous person's CV gets rendered for one second.
 */
export function readPersonal(owner: string, base: PersonalKey): string | null {
  const store = ls();
  if (!store || !owner) return null;
  try { return store.getItem(scopedKey(owner, base)); } catch { return null; }
}

export function writePersonal(owner: string, base: PersonalKey, value: string): boolean {
  const store = ls();
  if (!store || !owner) return false;
  try { store.setItem(scopedKey(owner, base), value); return true; } catch { return false; }
}

export function removePersonal(owner: string, base: PersonalKey): void {
  const store = ls();
  if (!store || !owner) return;
  try { store.removeItem(scopedKey(owner, base)); } catch { /* noop */ }
}

/** JSON, with the fallback used for anything unreadable — a corrupt list must not crash a page. */
export function readPersonalJson<T>(owner: string, base: PersonalKey, fallback: T): T {
  const raw = readPersonal(owner, base);
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw) as T;
    return v === null || v === undefined ? fallback : v;
  } catch { return fallback; }
}

/**
 * Write a list, capped, retrying once at half the cap.
 *
 * The retry is not defensive padding: `ra_scan_history` embeds a whole analysis per entry, so ten of
 * them is genuinely large enough to hit a quota on a browser that already holds other sites' data.
 * Losing the newest scan silently is worse than keeping five.
 */
export function writePersonalList<T>(owner: string, base: PersonalKey, list: T[], cap: number): boolean {
  const store = ls();
  if (!store || !owner) return false;
  const key = scopedKey(owner, base);
  try { store.setItem(key, JSON.stringify(list.slice(0, cap))); return true; } catch { /* fall through */ }
  try {
    store.setItem(key, JSON.stringify(list.slice(0, Math.max(1, Math.floor(cap / 2)))));
    return true;
  } catch { return false; }
}

/* ─────────────────────────── migration ─────────────────────────── */

/**
 * Adopt the legacy unowned values into this owner's keyspace, once.
 *
 * Attributed to whoever is signed in at migration time, and RENAMED rather than deleted — the same
 * two decisions `resumeStore.migrateLegacy` made, for the same reasons. The unowned key has no owner
 * recorded anywhere, so there is no fact of the matter to recover; the current session is the best
 * available answer and it is what the person in front of the screen expects to see.
 *
 * Never overwrites: a value already written under the new scheme is by definition more recent.
 */
export function migrateUnowned(owner: string): PersonalKey[] {
  const store = ls();
  if (!store || !owner) return [];
  const adopted: PersonalKey[] = [];
  for (const base of PERSONAL_KEYS) {
    let raw: string | null = null;
    try { raw = store.getItem(base); } catch { continue; }
    if (raw === null) continue;
    try {
      if (store.getItem(scopedKey(owner, base)) === null) {
        store.setItem(scopedKey(owner, base), raw);
        adopted.push(base);
      }
      store.setItem(retiredKey(base), raw);
      store.removeItem(base);
    } catch { /* quota, or a locked store. The legacy key stays; the next load tries again. */ }
  }
  return adopted;
}

/**
 * Remove everything belonging to one owner. For sign-out.
 *
 * Scans rather than iterating `PERSONAL_KEYS`, so a key retired from that list in a future version is
 * still cleaned off the browsers that hold it. A sign-out that leaves data behind because the code
 * stopped knowing the name of it is the failure mode worth paying a scan for.
 */
export function forgetPersonal(owner: string): number {
  const store = ls();
  if (!store || !owner) return 0;
  const suffix = `:${owner}`;
  const doomed: string[] = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && k.startsWith("ra_") && k.endsWith(suffix)) doomed.push(k);
    }
    for (const k of doomed) store.removeItem(k);
  } catch { /* noop */ }
  return doomed.length;
}
