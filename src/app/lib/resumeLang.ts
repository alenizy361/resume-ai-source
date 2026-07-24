/**
 * Does the rewrite come back in the language the user asked for?
 *
 * The optimize prompt carries two independent language decisions — what the
 * advice is written in, and what the resume is written in — and a live build
 * showed the model collapsing them, returning a fully Arabic CV to a user who
 * had asked for English. The user picks the resume's language deliberately,
 * because it is the language the employer's ATS reads, so a rewrite in the wrong
 * one is not a stylistic miss: it is unusable output.
 *
 * An instruction the model is free to misread is one it eventually misreads.
 * This is the check that does not depend on it having read carefully.
 */

/** The proportion of a text's letters that are Arabic. */
export function arabicRatio(text: string): number {
  const letters = (text.match(/\p{L}/gu) || []).length;
  if (!letters) return 0;
  const arabic = (text.match(/[\u0600-\u06FF]/gu) || []).length;
  return arabic / letters;
}

/** Did the rewrite come back in the language the user asked for? */
export function languageHonoured(resume: string, outLang?: string): boolean {
  const body = resume.replace(/[^\p{L}\s]/gu, " ");
  if (body.trim().length < 40) return true;   // too short to judge
  const ar = arabicRatio(body);
  if (outLang === "ar") return ar > 0.5;
  if (outLang === "both") return ar > 0.15 && ar < 0.85;
  return ar < 0.25;   // English: proper nouns may stay Arabic, prose may not
}

/** Appended verbatim on the retry, naming the exact mistake that was made. */
export const LANGUAGE_RETRY = (outLang?: string) =>
  `\n\nYOUR PREVIOUS ATTEMPT WROTE THE RESUME IN THE WRONG LANGUAGE AND WAS DISCARDED. The section after the RESUME: marker must be ${
    outLang === "ar" ? "ARABIC" : outLang === "both" ? "ENGLISH FOLLOWED BY ARABIC" : "ENGLISH"
  } and nothing else. The advice sections above it keep their own language. Write the resume again, in the correct language.`;

