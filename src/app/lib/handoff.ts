"use client";

/**
 * Handing a scanned resume to the builder, instead of ending at a download button.
 *
 * The optimizer and the builder were two products sharing a domain. Upload a CV at
 * `/optimize` and you got a score, a rewritten string and two download buttons — and
 * that was the end of the road. Nothing could be edited section by section, because the
 * flow never produced sections. The audit called this "two resume data models"; the
 * capability to fix it arrived with `parseCv` and `stateFromText`, so what was left was
 * the hand-off.
 *
 * There is no new mechanism here. `draftStore` already declares itself the store shared
 * between both doors, and `Builder` already hydrates a `builder` record from it on mount.
 * This writes that record. The hand-off IS the existing store, used the way it was
 * designed.
 *
 * Everything imported this way is CONFIRMED, which is correct for a document the user
 * already had: it is their resume, not a suggestion about it. The one thing the rewrite
 * cannot carry is provenance — the optimizer's output is the model's wording of the
 * user's facts — so the resume text handed over is the ORIGINAL upload, not the rewrite,
 * unless the caller asks otherwise. See `sendToBuilder`.
 */

import { readDraft, writeDraft } from "./draftStore";
import { stateFromText } from "./scoreText";

/** Does the user already have builder work here that a hand-off would replace? */
export function builderDraftExists(lang: "ar" | "en"): boolean {
  try {
    const d = readDraft(lang) as unknown as { builder?: { profile?: { roles?: unknown[] } } };
    const roles = d.builder?.profile?.roles;
    return Array.isArray(roles) && roles.length > 0;
  } catch { return false; }
}

/**
 * Put a resume into the builder's draft and return where to navigate.
 *
 * `text` should normally be the user's ORIGINAL resume rather than the AI rewrite. The
 * rewrite is the model's phrasing of the user's facts, and the builder's whole contract
 * is that model wording arrives as a suggestion to accept — silently installing it as
 * confirmed content would launder it into fact. A caller that genuinely wants the
 * rewrite (the user pressed "keep the improved version") passes it explicitly and owns
 * that choice.
 */
export function sendToBuilder(
  lang: "ar" | "en",
  text: string,
  opts: { jobAd?: string } = {},
): string {
  const state = stateFromText(text, opts.jobAd ?? "");
  writeDraft(lang, {
    profile: state.profile,
    door: "form",
    // Nested under `builder` because that is the key Builder.tsx hydrates, and keeping
    // the chat's own keys untouched is what lets someone switch doors without loss.
    ...({ builder: { ...state, entry: "upload" } } as unknown as Record<string, unknown>),
  });
  return lang === "ar" ? "/ar/build" : "/build";
}
