"use client";

/**
 * Handing a scanned resume to the builder — through the live store, not through a migration.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHAT WAS MEASURED, BEFORE ANY OF THIS WAS CHANGED
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * The previous version wrote `ra_journey_{lang}` through `draftStore.writeDraft` and navigated to
 * `/builder`. That key is the OLD single-slot scheme. `resumeStore` calls it legacy, reads it exactly
 * once per (owner, language) through `migrateLegacy`, and renames it to `_legacy` on the way past.
 *
 * Driven in a browser against the real pages, that produced four findings:
 *
 *   1. **The hand-off's transport was a one-shot upgrade path.** Every scan sent to the builder
 *      consumed `migrateLegacy` and left `ra_journey_en_legacy` behind. A migration written to run
 *      once, for drafts that predate the current scheme, was doing duty as a live bridge — so a
 *      resume arriving from `/optimize` was indistinguishable in storage from a legacy upgrade, and
 *      any future change to that migration would silently break this feature.
 *
 *   2. **The "you already have work in the builder" confirm never fired.** It asked
 *      `builderDraftExists(lang)`, which reads the legacy key — empty for every user whose work is
 *      in the live store, which is every user. Measured with three completed builder steps on
 *      screen: no dialog. A warning that cannot fire is worse than none, because it reads as a
 *      guarantee in the code.
 *
 *   3. **The user's own CV was silently demoted.** The existing record survived — this was never
 *      data loss — but `/builder` shows exactly one "continue where you left off", and after a
 *      hand-off it pointed at the scan. An Accountant CV three steps in was nowhere on the screen.
 *
 *   4. **The owner was bypassed.** `writeDraft` writes an unowned key, and `migrateLegacy` then
 *      attributes it to whoever the session resolves to. Every other write in this product carries
 *      its owner; this one asked the migration to guess.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE REPLACEMENT
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * `writeResume(owner, id, lang, state)` — the same call the builder's own autosave makes. There is
 * no bridge left: a scan becomes a resume record in the live store, under an owner, and the URL
 * returned points AT it (`/builder/{id}/target`) rather than at a front door that has to work out
 * what just happened.
 *
 * Nothing writes `ra_journey_*` any more. `draftStore` keeps reading it, because a draft written by
 * the chat door before this change is still somebody's CV — but the retired key now has no live
 * writer, which is what "do not leave both persistences active" actually asks for.
 *
 * ── a fresh id, and why the caller must still be told ──
 *
 * A hand-off never overwrites: `newResumeId` is time-plus-entropy and the record is new, so the
 * user's in-progress CV is untouched by construction. But *untouched* is not *reachable* — the
 * builder's start screen listed one resume until this change — so `resumesInProgress` reports what
 * the owner already has and the caller decides between adding and replacing. That is a question the
 * user can answer, unlike the dialog it replaces.
 */

import { listResumes, newResumeId, writeResume } from "./resumeStore.ts";
/* Relative, not the `@/` alias: `ops/handoff.test.mjs` imports this module in plain Node, where the
   bundler's alias does not exist. `steps.ts` itself only imports a type, which is erased. */
import { stepHref } from "../components/build/steps.ts";
import { stateFromText } from "./scoreText.ts";

export interface InProgress {
  resumeId: string;
  title: string;
  updatedAt: number;
}

/**
 * The resumes this owner already has here, newest first — read from the store the builder reads.
 *
 * Replaces `builderDraftExists(lang)`, which asked the retired key and therefore always answered
 * "no". Returns the list rather than a boolean because the caller has to be able to NAME what it is
 * about to sit beside: "you already have work" is not a question anyone can answer, and "you have a
 * CV in progress — Accountant, 3 of 11 steps" is.
 */
export function resumesInProgress(owner: string): InProgress[] {
  if (!owner) return [];
  try {
    return listResumes(owner).map((r) => ({
      resumeId: r.resumeId,
      title: r.title || "",
      updatedAt: Number(r.updatedAt) || 0,
    }));
  } catch { return []; }
}

/**
 * Put a scanned resume into the builder as its own record, and return where to go.
 *
 * `text` should normally be the user's ORIGINAL resume rather than the AI rewrite. The rewrite is
 * the model's phrasing of the user's facts, and the builder's whole contract is that model wording
 * arrives as a suggestion to accept — silently installing it as confirmed content would launder it
 * into fact. A caller that genuinely wants the rewrite (the user pressed "keep the improved
 * version") passes it explicitly and owns that choice.
 *
 * ── `cvLang` is not `lang`, and conflating them is the bug this product has paid for repeatedly ──
 *
 * `lang` is the interface the user is reading; `cvLang` is the language of the DOCUMENT, which on
 * `/optimize` the user chose explicitly on step 3. `stateFromText` leaves `target.language` at the
 * schema default of English, so before this a hand-off of an Arabic rewrite opened an English
 * document — and every suggestion the builder made afterwards came back in English.
 *
 * `replace` overwrites an existing record instead of adding one. Offered only because the
 * alternative — a second CV the user did not ask for — is its own kind of mess, and only ever with
 * an id the caller obtained from `resumesInProgress`, so it cannot name a resume nobody chose.
 */
export function sendToBuilder(
  owner: string,
  lang: "ar" | "en",
  text: string,
  opts: { jobAd?: string; cvLang?: "ar" | "en"; replace?: string } = {},
): string {
  const base = stateFromText(text, opts.jobAd ?? "");
  const state = {
    ...base,
    entry: "upload" as const,
    target: { ...base.target, language: opts.cvLang ?? lang },
  };

  /* An id the caller chose to replace, or a new one. `newResumeId` is time-plus-entropy, so the
     new-record branch cannot collide with anything the owner already holds. */
  const id = opts.replace || newResumeId();
  writeResume(owner, id, lang, state);

  /*
   * Straight to the first step, not to `/builder`.
   *
   * The front door has to GUESS which resume the visitor means — it resolves to the most recent one
   * — and that guess is what made a hand-off look like it had replaced the user's CV. An address
   * that names the resume cannot be wrong about it.
   */
  return stepHref(lang, id, "target");
}
