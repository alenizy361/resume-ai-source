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
