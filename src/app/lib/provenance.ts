/**
 * What a suggestion says when the user asks where it came from.
 *
 * ── why this is a library and not a string inside the chip ──
 *
 * A suggestion that cannot say where it came from is asking to be trusted on nothing, and this
 * product asks for more trust than most: it offers professional credentials, licence names and
 * clinical vocabulary to people who will have to defend them in an interview. "Common for this
 * occupation in this market" and "read from the CV you uploaded" are different claims, and a chip
 * that renders both identically is quietly flattening the difference.
 *
 * It lives here rather than in the component for the same reason `stepMessages.ts` does: copy that
 * makes a claim about provenance is a testable fact, and a `.tsx` file cannot be run by the test
 * suite. `ops/provenance.test.mjs` asserts every source has a sentence in both languages, and that
 * the Arabic one is actually Arabic — the failure this repo has seen more than once is an English
 * string reaching an Arabic screen through a fallback nobody looked at.
 */

import type { ItemSource } from "./builderDoc";

/**
 * One sentence per source, in both languages.
 *
 * Deliberately a full `Record` and not a partial one with a default: adding a source to
 * `ItemSource` should break the build here, in the place that has to explain it, rather than
 * silently inherit whatever the fallback says.
 */
export const SOURCE_SENTENCE: Record<"ar" | "en", Record<ItemSource, string>> = {
  en: {
    user: "You wrote this.",
    imported: "Read from the CV you uploaded.",
    job_description: "Found in the job advert you pasted.",
    occupation: "Common for this occupation in this market.",
    ai: "Suggested from your job title and what you have confirmed.",
  },
  ar: {
    user: "أنت كتبته.",
    imported: "قُرئ من السيرة التي رفعتها.",
    job_description: "موجود في الإعلان الوظيفي الذي لصقته.",
    occupation: "شائع في هذه المهنة في هذا السوق.",
    ai: "مقترَح من مسماك الوظيفي وما أكّدته.",
  },
};

/** Wording for the "Why this?" control itself, so the label and the note stay together. */
export const WHY_LABEL: Record<"ar" | "en", { why: string; reject: string }> = {
  en: { why: "Why this?", reject: "Not for me" },
  ar: { why: "لماذا اقتُرح هذا؟", reject: "لا يناسبني" },
};

/**
 * The explanation for one suggestion: its own reason when it has one, its source's sentence
 * otherwise.
 *
 * `reason` is written by whatever produced the item and is specific ("required for this role in
 * Saudi Arabia"); the source sentence is the general case. Preferring the specific one means a role
 * pack and a model suggestion do not both say the same generic thing — and falling back rather than
 * showing nothing means a chip is never left unable to answer the question it invited.
 */
export function whySentence(lang: "ar" | "en", source?: ItemSource, reason?: string): string {
  const specific = reason?.trim();
  if (specific) return specific;
  return SOURCE_SENTENCE[lang][source ?? "ai"] ?? SOURCE_SENTENCE[lang].ai;
}

/**
 * The one sentence a whole group of suggestions shares — or `null` when they do not share one.
 *
 * ── why a group needs this ──
 *
 * A phone screenshot of the Arabic skills step settled it: twenty-five chips, each with its own
 * "why" button, each opening the SAME sentence, because every one of them came from the same role
 * pack. Twenty-five controls carrying one fact is not provenance, it is clutter — and clutter is
 * what makes a person stop reading the thing you wanted them to read.
 *
 * So the section asks first. A uniform group states its provenance once, above the chips, and the
 * chips keep only the decision that is genuinely theirs — "not for me". A MIXED group (a CV was
 * imported, so some skills are the user's own and some are the pack's) keeps the per-chip button,
 * because there the sentence differs per chip and that difference is the whole point.
 */
export function sharedWhy(
  items: Array<{ source?: ItemSource; reason?: string }>,
  lang: "ar" | "en",
): string | null {
  if (!items.length) return null;
  const first = whySentence(lang, items[0].source, items[0].reason);
  return items.every((i) => whySentence(lang, i.source, i.reason) === first) ? first : null;
}
