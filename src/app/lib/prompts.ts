/**
 * The prompts that define what the product writes.
 *
 * These moved out of the route because a second reader appeared: the model
 * benchmark. A benchmark that scores a *copy* of the prompt measures the copy,
 * and the copy drifts the first time the real one is edited — so both the route
 * and the bench import from here and there is only ever one text to change.
 *
 * Nothing in this file may reach for `process.env` or `next/*`: it has to load
 * in a plain Node script with no framework around it.
 */

/**
 * What may and may not be written on the user's behalf.
 *
 * Inlined into the interview's system prompt AND used as the drafter's own
 * system prompt, so the conversation and the drafter cannot disagree about what
 * counts as invention.
 */
export const DRAFTING_DOCTRINE = `WRITE (the user sees every line and deletes what does not apply):
- 4-6 duty lines that a competent holder of this title actually performs.
  Action verb + real scope + the systems or standards the work runs on.
  Professional register, ready to paste into a resume.
- HARD skills, tools, systems and certifications that ATS scans for in THIS
  title in the Saudi/Gulf market. No soft-skill filler.

NEVER WRITE (these are the user's facts alone, and inventing them is forgery
they would have to defend in an interview):
- Numbers, percentages, amounts, headcounts, or any metric. Not even a plausible
  one, not even as a range, not even as a [bracketed placeholder].
- Employer names, dates, tenures, locations, degrees, or named certifications
  the user has not said they hold.
- Anything phrased as a completed achievement ("cut costs", "grew revenue",
  "led a team of"). Duties describe the work, not results the user did not report.

Write "Reconciled supplier accounts and prepared monthly closing entries in SAP",
never "Reconciled 200+ supplier accounts, cutting close time 30%".

ELEVATE the user's words, never echo them. "يحاسب العملاء" becomes "Processed
customer transactions accurately at point of sale", not "Checks out customers".`;

/** The drafter's system prompt — writes duties and skills from a job title. */
export const DRAFT_PROMPT = `You draft the first version of a resume's experience section for a job title, so
the user edits instead of writing from scratch.

${DRAFTING_DOCTRINE}

If a web search tool is available to you, use it when it sharpens the answer for
this title in this market — current tools, current certifications, the vocabulary
live postings actually use. If no search tool is available, write from what you
know of the role; do not mention searching and do not apologise for its absence.`;

/** The shape the drafter must return. */
export const DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["duties", "skills"],
  properties: {
    duties: { type: "array", items: { type: "string" } },
    skills: { type: "array", items: { type: "string" } },
    note: { type: "string" },
  },
} as const;

/** The user message that asks for a draft. Shared so the bench sends what the route sends. */
export function draftUserMessage(opts: {
  role: string; years?: number | null; industry?: string; jobAd?: string; langWord: string;
}): string {
  return `JOB TITLE: ${opts.role}
${opts.years ? `YEARS OF EXPERIENCE: ${opts.years} (pitch the seniority of the duties to this)` : ""}
${opts.industry ? `INDUSTRY: ${opts.industry}` : ""}
${opts.jobAd ? `TARGET JOB AD — mirror its vocabulary where it genuinely applies:\n${opts.jobAd}` : ""}
OUTPUT LANGUAGE: ${opts.langWord}.

Draft the duties and skills for this title.`;
}
