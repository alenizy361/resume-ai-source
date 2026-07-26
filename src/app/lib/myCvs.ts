"use client";

/**
 * The CVs this person already has, gathered from every place the product keeps one.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE GAP THIS CLOSES
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * Five pages — interview prep, the live mock interview, the LinkedIn optimiser and both
 * resume optimisers — open on a blank textarea reading "paste your resume". Every one of
 * them is reached from inside a product that has just spent eleven steps collecting that
 * exact resume, and none of them could read it. The user's own CV was two keys away in
 * the same browser and the answer was "type it again".
 *
 * That is not a cosmetic gap. It is the reason those features feel bolted on: a tool that
 * cannot see your work is a different product from a tool that can, whatever the menu says.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * TWO STORES, ONE LIST — AND WHY IT IS NOT A THIRD STORE
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * A finished CV can be in either of two places, for good reasons:
 *
 *   `ra_cv:{owner}:{id}`        the builder's structured draft — live, editable, and the
 *                               only one that also knows the target job
 *   `ra_saved_resumes:{owner}`  flat text the user explicitly saved, from the chat door or
 *                               from an optimiser run
 *
 * This module READS both and writes neither. It deliberately introduces no new key: a
 * "recent CVs" cache would be a third copy of the same text that could disagree with the
 * two that already exist, and the standing rule in this repo is that a parallel store is
 * how one of them quietly stops being true.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE LANGUAGE OF A CV IS NOT THE LANGUAGE OF THE INTERFACE
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * `ResumeRecord.lang` is the language the BUILDER WAS BEING READ IN when the record was
 * written — `BuilderProvider` passes its route's `lang` prop straight through. The CV's own
 * language is `cvLang(state.target)`, which is the field the user actually chose. Reading
 * `record.lang` here would reintroduce the single most damaging bug this product has had:
 * an Arabic interface producing Arabic output for an English CV.
 *
 * So every entry carries the CV's own language, and the pages hand it to the model rather
 * than the `lang: "en"` they used to hardcode.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * AND IT OBEYS THE VISIT RULE
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * `mayRestore(owner)` gates the whole list, not just the builder half. For a signed-in
 * account it is always true. For `anon` it is true only inside the tab session — the same
 * answer the builder and `ContinueDraft` give, because a shared browser must not offer the
 * previous person's career to whoever opens the laptop next. Gating one store and not the
 * other would make the rule depend on which door the CV came through, which is not a rule.
 */

import { getResumes } from "./localdata.ts";
import { listResumes, mayRestore, readResume } from "./resumeStore.ts";
import { assembleResume } from "./mergeProfile.ts";
import { cvLang } from "./builderDoc.ts";
import { dominantScript } from "./cvHeadings.ts";

export interface MyCv {
  /** Unique across both stores, for React keys and for de-duplication. */
  key: string;
  /** Which store it came from. Only `builder` entries can carry a target job. */
  origin: "builder" | "saved";
  title: string;
  updatedAt: number;
  /** The CV's OWN language — never the interface's. See the header. */
  lang: "ar" | "en";
  /** The whole CV as flat text, which is what every consumer of this already takes. */
  text: string;
  /** The role the user already told the builder they were aiming at, when there is one. */
  targetTitle: string;
  /** The job advert already pasted into the builder, when there is one. */
  jobAdText: string;
}

/** Most people have one or two. Six is generous and keeps the strip from becoming a screen. */
const MAX_OFFERED = 6;

/**
 * Is this text a CV worth offering back to someone, or just a header?
 *
 * A half-started draft holding a name and a phone number is worse than nothing here: it fills
 * the textarea with three lines, looks like the CV was loaded, and the model then coaches an
 * interview against an empty career. The threshold is deliberately about CONTENT rather than
 * about which fields are set, because both stores arrive as text and only one of them has fields.
 */
function worthOffering(text: string): boolean {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return text.trim().length >= 120 && lines.length >= 4;
}

/** For de-duplication: the same CV saved from the builder must not appear twice. */
const fingerprint = (text: string): string => text.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Every CV this browser holds for this owner, newest first.
 *
 * Returns `[]` — never a guess — when the owner is not yet known. `useOwner()` answers `""`
 * until the session is resolved, and listing under `""` would either show nothing or, worse,
 * show whatever an unscoped read happened to find.
 */
export function listMyCvs(owner: string): MyCv[] {
  if (!owner || !mayRestore(owner)) return [];

  const out: MyCv[] = [];
  const seen = new Set<string>();

  const add = (cv: MyCv) => {
    const fp = fingerprint(cv.text);
    if (seen.has(fp)) return;
    seen.add(fp);
    out.push(cv);
  };

  /*
   * The builder's drafts FIRST, and the order is the point rather than a preference.
   *
   * When the same CV exists in both stores — which is the normal outcome of building one and
   * saving it — the builder's copy is the one to keep: it is the live document, and it is the
   * only one carrying the target job, which is what lets the interview page fill the job advert
   * as well as the resume. De-duplication keeps whichever arrives first, so this loop runs first.
   */
  try {
    for (const summary of listResumes(owner)) {
      const { record } = readResume(owner, summary.resumeId);
      if (!record) continue;
      const state = record.state;
      const lang = cvLang(state.target);
      const text = assembleResume(state.profile, lang === "ar");
      if (!worthOffering(text)) continue;
      add({
        key: `builder:${summary.resumeId}`,
        origin: "builder",
        title: summary.title || state.target.title || state.personal.fullName || "CV",
        updatedAt: Number(summary.updatedAt) || record.updatedAt || 0,
        lang,
        text,
        targetTitle: state.target.title || "",
        jobAdText: state.target.jobAdText || "",
      });
    }
  } catch { /* A damaged index must not take the saved list down with it. */ }

  try {
    for (const saved of getResumes(owner)) {
      const text = String(saved.text || "");
      if (!worthOffering(text)) continue;
      add({
        key: `saved:${saved.id}`,
        origin: "saved",
        title: saved.title || "CV",
        updatedAt: Number(saved.ts) || 0,
        /* These records carry `lang` only if they were written after that field existed, so the
           text itself is the fallback — by majority script, not by the presence of one Arabic
           letter. Reading the interface language here would be the exact conflation the header
           warns about. */
        lang: saved.lang === "ar" || saved.lang === "en" ? saved.lang : dominantScript(text),
        text,
        targetTitle: "",
        jobAdText: "",
      });
    }
  } catch { /* noop — an unreadable store offers nothing, it does not throw into a render. */ }

  return out.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_OFFERED);
}

/**
 * What language the model should ANSWER in, for a page whose only input is pasted text.
 *
 * ── evidence first, interface last ──
 *
 * A CV the user picked STATES its language: they chose it in the builder, and a declared answer
 * beats any amount of guessing. Text they typed is weaker evidence but still real. Only when there
 * is neither does the interface get to decide. Both `/api/tools` callers used to send a hardcoded
 * `lang: "en"`, so an Arabic-reading user pasting an Arabic CV was given English interview
 * questions to prepare for an Arabic interview — and no field anywhere let them say otherwise.
 *
 * ── why the picked CV stops counting once the text changes ──
 *
 * The pick fills a textarea the user can then empty and replace. Trusting the pick after that would
 * mean the language follows a CV that is no longer in the box, which is the same class of mistake as
 * trusting the interface: an answer about something other than what will be sent.
 *
 * ── and why the fallback counts letters instead of looking for one ──
 *
 * `dominantScript`, not `hasArabic`. A single Arabic name on an English CV must not make the whole
 * document Arabic; in this market that is the common case, not the edge one.
 */
export function outLangFor(picked: MyCv | null, typed: string, ar: boolean): "ar" | "en" {
  if (picked && picked.text.trim() === typed.trim()) return picked.lang;
  if (typed.trim()) return dominantScript(typed);
  return ar ? "ar" : "en";
}
