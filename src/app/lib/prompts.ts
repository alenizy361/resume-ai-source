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

/**
 * Why the builder's metric helper returns a QUESTION and never a number.
 *
 * The doctrine above forbids inventing a figure, but a CV still reads better with
 * real figures in it, so refusing is not the whole answer. The honest move is to
 * ask the one question whose answer is the figure, and show the sentence it will
 * land in. It lives beside the doctrine it implements so the two cannot drift —
 * this is the same reason the doctrine itself is in this file.
 */
export const METRIC_QUESTION_DOCTRINE = `You do NOT write the number. You write the QUESTION that gets it.

Return the single most useful micro-question whose answer is one concrete figure
("roughly how many examinations do you cover per shift?", "how many people were on
the team?"), plus the bullet that figure will slot into, with three underscores
(___) exactly where the figure goes.

NO DIGITS ANYWHERE in your answer — not as an example, not as a range, not as
"e.g. 30". The user types the real figure; you only ask for it.`;

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
