/**
 * The five languages in this product, named apart so they can stop being confused.
 *
 * ── why five, and why this is not pedantry ──
 *
 * The single most damaging bug this product has shipped was one word doing two jobs: `lang`. A
 * Saudi applicant read the Arabic interface, so `lang === "ar"`, so the CV was written in Arabic —
 * the duties, the credential names, the proficiency words — while the job they were applying for
 * was in English. Nobody chose that. It was chosen by a variable name.
 *
 * Splitting interface from document fixed the reported case. It did not name the other three, and
 * each of them has its own way of going wrong:
 *
 *   interface   what the chrome is in. Comes from the route: `/builder` or `/ar/builder`.
 *   authoring   what the DOCUMENT is written in. `target.language`, the user's explicit choice.
 *   view        which stored version the preview and the exports are rendering. Wording only —
 *               a version can never change a fact.
 *   input       what the user is actually TYPING. Measured, never declared, because the mismatch
 *               it detects is one the user does not know they are making.
 *   export      what the downloaded file will contain. Follows `view`, except "both", which is
 *               the one setting that produces two documents from one draft.
 *
 * ── the one that earns its place ──
 *
 * `input`. A user who chose an English CV and then typed their duties in Arabic has produced a
 * document that is half in each language, and neither the preview nor the ATS score says so —
 * the preview renders exactly what was typed and the score is computed on the same text. It reads
 * as fine on screen and parses as noise to a recruiter's filter. `languageMismatch` is what turns
 * that into a sentence in the review.
 */

import type { BuilderState } from "./builderDoc.ts";
import { cvLang } from "./builderDoc.ts";

export type Lang = "ar" | "en";
export type Script = "ar" | "en" | "mixed" | "empty";

export interface LanguageSet {
  interface: Lang;
  authoring: Lang;
  view: Lang;
  input: Script;
  export: Lang | "both";
}

/**
 * Which script a piece of text is written in — measured over SEGMENTS, not characters.
 *
 * The character-counting version was written first and measured wrong on real CVs. Three correct
 * documents came back "mixed":
 *
 *   "شغّلت أجهزة CT و MRI و PACS و RIS و DICOM"     — an Arabic sentence about Latin-named machines
 *   "التصوير المقطعي، الرنين المغناطيسي، PACS، RIS"  — an Arabic skills list with Latin acronyms
 *   "Operated CT scanners at مستشفى دلة"            — an English bullet naming an Arabic employer
 *
 * None of those is a mixed document; every one of them is how people in this market actually write.
 * A rule that fires on them is noise, and a user who learns to dismiss a warning dismisses the one
 * that mattered too.
 *
 * So each SEGMENT — a line, a bullet, a comma-separated item — is classified by which script
 * dominates it, and the document is judged on how its segments divide. Latin acronyms inside an
 * Arabic sentence lose to the Arabic around them; short segments (an acronym on its own in a skills
 * list) are not classified at all, because four letters is not evidence of a language.
 */
export function detectScript(text: string): Script {
  const segments = text
    .split(/[\n،,;·|]+/)
    .map((x) => x.trim())
    .filter(Boolean);

  const counts = { ar: 0, en: 0 };
  for (const seg of segments) {
    const arabic = (seg.match(/[؀-ۿݐ-ݿ]/g) ?? []).length;
    const latin = (seg.match(/[A-Za-z]/g) ?? []).length;
    /* Eight letters is roughly two words: below that a segment is an acronym or a fragment, and
       counting it would let "PACS" outvote a sentence. */
    if (arabic + latin < 8) continue;
    if (arabic > latin) counts.ar++;
    else if (latin > arabic) counts.en++;
  }

  const total = counts.ar + counts.en;
  if (total === 0) return "empty";
  if (total === 1) return counts.ar ? "ar" : "en";

  const minority = Math.min(counts.ar, counts.en);
  /*
   * A THIRD of the document, and never fewer than two segments.
   *
   * One Arabic line among six English ones is a degree title or an employer, not a bilingual CV.
   * Two or more, and a third of what was written, is a document that genuinely does not know which
   * language it is in.
   */
  if (minority >= 2 && minority / total >= 1 / 3) return "mixed";
  return counts.ar > counts.en ? "ar" : "en";
}

/**
 * The text the user WROTE, which is not the text the CV renders.
 *
 * Only the fields a person types into: the summary, the bullets, the skills, education. The name
 * and the contact line are excluded on purpose — a name is in whatever script the person's name is
 * in, and treating "عبدالعزيز العنزي" on an English CV as a language mismatch would flag the single
 * most correct thing on the page.
 */
export function authoredText(state: BuilderState): string {
  const p = state.profile;
  const roles = p.roles ?? [];
  return [
    p.summary ?? "",
    p.skills ?? "",
    p.education ?? "",
    ...roles.flatMap((r) => [r.title ?? "", ...(r.bullets ?? [])]),
  ].join(" ");
}

/**
 * All five, for one draft.
 *
 * `interfaceLang` is optional because half the callers do not know it and do not need it: the
 * review runs over a stored document and has no route locale, and every mismatch it can report is
 * between the other four. Defaulting it to the authoring language is honest for those callers —
 * they are not making a claim about the chrome — and passing a wrong value would be worse than
 * omitting one.
 */
export function languageSet(state: BuilderState, interfaceLang?: Lang): LanguageSet {
  const authoring = cvLang(state.target);
  const view: Lang = state.activeVersion === "en" ? "en"
    : state.activeVersion === "ar" ? "ar"
    : authoring;
  return {
    interface: interfaceLang ?? authoring,
    authoring,
    view,
    input: detectScript(authoredText(state)),
    /* "both" is a target-language setting, not a view one: it means the export writes the CV
       twice. Everything else follows what is on screen, because a download that differs from the
       preview is the surprise this field exists to prevent. */
    export: state.target.language === "both" ? "both" : view,
  };
}

export type MismatchCode = "input-not-authoring" | "input-mixed" | "view-not-authoring";

export interface LanguageMismatch {
  code: MismatchCode;
  /** What was typed, for a message that can name it. */
  found: Script;
  expected: Lang;
}

/**
 * The mismatch worth telling the user about, or null.
 *
 * Ordered by cost. Writing the whole document in the wrong language is worse than writing half of
 * it in each, and both are worse than previewing a version that is not the one being authored —
 * which is not a defect at all, merely a thing worth saying out loud before someone exports.
 */
export function languageMismatch(set: LanguageSet): LanguageMismatch | null {
  if (set.input === "empty") return null;
  if (set.input === "ar" || set.input === "en") {
    if (set.input !== set.authoring) {
      return { code: "input-not-authoring", found: set.input, expected: set.authoring };
    }
    return null;
  }
  if (set.input === "mixed") return { code: "input-mixed", found: "mixed", expected: set.authoring };
  return null;
}
