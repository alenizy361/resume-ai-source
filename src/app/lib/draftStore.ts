/**
 * One draft, two doors.
 *
 * The product had exactly one way in — the interview — so a user the
 * conversation failed had nowhere to go. Every competitor keeps an editor beside
 * the assistant for precisely that reason. Adding a form is only worth it if the
 * two share a draft: if the form were a second silo, a user who switched would
 * start over, which is worse than not offering the switch.
 *
 * So both read and write this. The store is the Profile the interview already
 * uses — roles structured, everything else flat — and the key is the same one
 * the interview has always written, so a draft in progress today survives.
 */

import { type Profile, EMPTY_PROFILE } from "./mergeProfile.ts";
import type { BuilderState } from "./builderDoc.ts";

export type Door = "chat" | "form";

/** The interview's own key, kept so existing drafts are not orphaned. */
export function draftKey(lang: "ar" | "en"): string {
  return `ra_journey_${lang}`;
}

export interface Draft {
  profile: Profile;
  /** Which door the user last used, so returning lands them where they were. */
  door?: Door;
  /** Free-text personal details the Gulf market expects, when volunteered. */
  personal?: { nationality?: string; visaStatus?: string; city?: string };
  /** The live posting text, fetched from its URL — shared by both doors. */
  jobAdText?: string;
  msgs?: Array<{ who: string; text: string }>;
  cv?: string;
  stage?: number;
  /**
   * The form builder's whole state.
   *
   * Typed here rather than smuggled in with a cast, which is how it used to travel:
   * `writeDraft(lang, { ...({ builder: state } as unknown as Record<string, unknown>) })`
   * at two call sites, and a matching cast to read it back. A field the compiler cannot
   * see is a field nothing can refactor safely — and the step routes now read it from
   * eleven places rather than one.
   */
  builder?: BuilderState;
  /**
   * The addressable id of the resume in this draft.
   *
   * The builder's URLs are `/builder/<resumeId>/<step>`, so the id has to be stable
   * across a refresh, a route change and a cold load — a step route that minted a new
   * id on arrival would orphan the work on every Continue.
   *
   * There is deliberately still ONE draft per language. `draftStore` exists because the
   * two doors sharing a draft is what makes switching doors survivable; a per-resume
   * keyspace would be a second store, and the id would be the only thing linking them.
   * When multiple saved resumes arrive, they arrive as a list of these records — not as
   * a parallel shape.
   */
  resumeId?: string;
}

/**
 * A fresh resume id.
 *
 * Time-based rather than random: it sorts, it is short enough to read in a URL, and it
 * carries no user content. Uniqueness only has to hold within one browser's storage.
 */
export function newResumeId(now = Date.now()): string {
  return `r${now.toString(36)}`;
}

/** Read the draft, tolerating anything a previous version wrote. */
export function readDraft(lang: "ar" | "en"): Draft {
  try {
    const raw = localStorage.getItem(draftKey(lang));
    if (!raw) return { profile: { ...EMPTY_PROFILE } };
    const d = JSON.parse(raw) as Partial<Draft>;
    return {
      ...d,
      // A draft written before `roles` existed has only flat lines; mergeProfile
      // parses those back on first merge, so an empty roles array is safe here.
      profile: { ...EMPTY_PROFILE, ...(d.profile ?? {}) },
    };
  } catch {
    return { profile: { ...EMPTY_PROFILE } };
  }
}

/** Merge a partial update into the stored draft. Never throws. */
export function writeDraft(lang: "ar" | "en", patch: Partial<Draft>): void {
  try {
    const cur = readDraft(lang);
    localStorage.setItem(draftKey(lang), JSON.stringify({ ...cur, ...patch }));
  } catch { /* a full or blocked localStorage must not break the builder */ }
}

/* ─────────────────── the builder's own view of the draft ─────────────────── */

/**
 * The stored builder state and the id that addresses it.
 *
 * Returns `null` for the state when there is nothing to restore, so the caller decides
 * what an empty builder looks like — `EMPTY_BUILDER` lives in `builderDoc`, and
 * importing it here would give this module a runtime dependency on the document schema
 * purely to express "nothing yet".
 *
 * `id` is always a real id: an existing one when the draft has been touched before, a
 * fresh one when it has not. It is NOT persisted by this call. Reading must not write —
 * a step route that minted and stored an id just by rendering would create a resume for
 * every visitor who bounced.
 */
export function readBuilder(lang: "ar" | "en", now = Date.now()): {
  id: string;
  state: BuilderState | null;
  /** True when a chat draft exists but the form has never run — carry the profile over. */
  fromChat: boolean;
} {
  const d = readDraft(lang);
  const state = d.builder?.schemaVersion ? d.builder : null;
  const fromChat = !state && Boolean(d.profile?.role || d.profile?.name);
  return { id: d.resumeId || newResumeId(now), state, fromChat };
}

/**
 * Persist the builder state under an id, synchronously.
 *
 * Synchronous on purpose. Autosave is debounced, and a debounce plus a route change is
 * a race the user loses: type into a field, press Continue, and the navigation can beat
 * the timer. Every Continue calls this directly, so the write has already landed before
 * the next step mounts.
 *
 * `profile` is mirrored to the top level because that is the half the chat door and
 * `/optimize` read. Writing only the nested copy would make the form invisible to
 * everything that existed before it.
 */
export function writeBuilder(lang: "ar" | "en", id: string, state: BuilderState): void {
  writeDraft(lang, { resumeId: id, builder: state, profile: state.profile, door: "form" });
}

/**
 * The Gulf-convention details, rendered into the one contact line the resume
 * template and the optimizer both read.
 *
 * They are optional and collapsed in the UI by design: a Saudi employer often
 * expects nationality and Iqama status near the header, and plenty of applicants
 * would rather not state them. Asking quietly beats either forcing or omitting.
 */
export function contactLine(
  base: { phone?: string; email?: string },
  personal?: { nationality?: string; visaStatus?: string; city?: string },
): string {
  return [
    base.phone?.trim(),
    base.email?.trim(),
    personal?.city?.trim(),
    personal?.nationality?.trim(),
    personal?.visaStatus?.trim(),
  ].filter(Boolean).join(" | ");
}
