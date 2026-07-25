/**
 * One stable prefix, three combined generations, and compact user messages.
 *
 * Two separate cost mechanisms live here and they pull in opposite directions, which is why
 * they are in one file where the tension is visible:
 *
 *   PROMPT CACHING wants the shared instructions to be LARGE and byte-identical across calls.
 *   INPUT MINIMISATION wants the per-call payload to be as SMALL as possible.
 *
 * They are compatible only if the split is drawn correctly: everything that does not depend on
 * the user goes in the cached prefix, and only the five context fields plus what they typed go
 * in the message. Draw it wrong — put the occupation in the prefix, or the doctrine in the
 * message — and you get the worst of both: a prefix that never hits and a message that repeats
 * two thousand tokens of rules on every call.
 *
 * ── the caching arithmetic, and the trap in it ──
 *
 * For a stable block of S tokens over N calls:
 *
 *   uncached   N × S           at 1× input rate
 *   cached     1.25 × S        (the write)  +  (N−1) × 0.1 × S  (the reads)
 *
 * Break-even is at N = 2 (2S against 1.35S), so caching pays from the second call of a session
 * onward. But there is a floor, it is MODEL-DEPENDENT, and it is not monotonic: 512 tokens on
 * Opus 5, 4096 on Haiku 4.5. Below the floor the `cache_control` marker is accepted and silently
 * does nothing — no error, just `cache_creation_input_tokens: 0`.
 *
 * ── measured on production, and the answer is no ──
 *
 * `CORE_RULES` plus a task schema is 2127 real tokens. On claude-haiku-4-5, which is what the
 * suggestions run on, the floor is 4096, so NOTHING IS CACHED TODAY. The probe proved it rather
 * than the code claiming it.
 *
 * Reaching 4096 would mean adding two thousand tokens of instructions. The arithmetic says not to:
 * three calls at 2127 uncached tokens is $0.0064 per CV, and the same three with a 4096-token
 * cached prefix is $0.0060 — four tenths of a cent saved, in exchange for making every uncached
 * call twice as expensive and every prompt twice as long to read. Padding a prompt to win a cache
 * discount is the exact trap this comment block warned about before it was measured.
 *
 * So the markers stay — they cost nothing and start working by themselves if the prefix grows for
 * real reasons or the model changes — and the health report tells the truth about the floor for the
 * model actually configured. What is NOT acceptable is a report saying `cacheablePrefix: true` next
 * to a call paying full price, which is what it said before this was measured.
 *
 * Part 13's last instruction is the important one: DO NOT ASSUME CACHING IS ACTIVE. The route
 * reads `cache_creation_input_tokens` and `cache_read_input_tokens` off every real response and
 * logs them, and production has already shown `cacheRead:0, cacheWrite:0` — which is what
 * "assume nothing" looks like when you are wrong.
 */

import { DRAFTING_DOCTRINE } from "./prompts.ts";
import type { AiTaskType } from "./aiModels.ts";
import { credentialsFor, exclusionsFor } from "./countryRules.ts";

/* ─────────────────────────── token estimation ─────────────────────────── */

/**
 * Rough token count, for deciding whether a prefix clears the cache floor.
 *
 * Not exact and not trying to be — the exact number comes from the API's own usage block, which
 * is what gets logged. This exists to answer one question at build/test time: "is the stable
 * block big enough to be cached at all". Getting that wrong is invisible at runtime, which is
 * precisely why it needs a test.
 *
 * ~3.6 chars per token for English prose, ~2.2 for Arabic script (Arabic tokenises worse). The
 * ratio matters here because the same rules block in Arabic is a third more tokens.
 */
export function estimateTokens(s: string): number {
  let latin = 0, arabic = 0;
  for (const ch of s) {
    if (/[؀-ۿ]/.test(ch)) arabic++; else latin++;
  }
  return Math.ceil(latin / 3.6 + arabic / 2.2);
}

/**
 * The minimum cacheable prefix, WHICH DEPENDS ON THE MODEL and is not monotonic across
 * generations.
 *
 * This was a single constant of 1024 and that was wrong for the model this product actually runs.
 * The health probe measured it: a 2127-token prefix on claude-haiku-4-5 returned
 * `cache_creation_input_tokens: 0` — the marker accepted and silently ignored, exactly as
 * documented. Haiku 4.5 needs 4096 tokens; Opus 5 needs 512. Eight times the difference, in the
 * direction nobody would guess, between the cheap model and the expensive one.
 *
 * A single number here is not a simplification, it is a wrong answer that reports itself as a
 * right one — `cacheablePrefix: true` next to a call paying full price.
 */
const CACHE_FLOORS: Array<[RegExp, number]> = [
  [/^claude-(opus-5|fable-5|mythos-5)/i, 512],
  [/^claude-(opus-4-8|sonnet-5|sonnet-4-6|sonnet-4-5|opus-4-1|opus-4|sonnet-4)/i, 1024],
  [/^claude-(opus-4-7|haiku-3-5)/i, 2048],
  [/^claude-(opus-4-6|opus-4-5|haiku-4-5)/i, 4096],
];

/**
 * The floor for one model. Unknown models get the HIGHEST floor, deliberately.
 *
 * An unknown model that is assumed cacheable reports a saving that is not happening, which is the
 * failure this function exists to prevent. Assuming it is NOT cacheable understates the benefit and
 * costs nothing — the `cache_control` markers stay on the request either way, so if the real floor
 * turns out to be lower the caching simply works and the report catches up when the model is added.
 */
export function cacheFloorFor(model: string): number {
  for (const [re, floor] of CACHE_FLOORS) if (re.test(model)) return floor;
  return 4096;
}

/**
 * Kept for the tests and for a rough default. NOT the number to report to an operator — use
 * `cacheFloorFor(model)` with the model the deployment is actually configured to use.
 */
export const CACHE_FLOOR_TOKENS = 4096;

/* ─────────────────────────── the stable prefix ─────────────────────────── */

/**
 * Everything that is true regardless of who is asking.
 *
 * Byte-identical on every call to every task, which is the requirement for a cache hit. Nothing
 * in here may interpolate a user value — not the occupation, not the country, not the language.
 * The moment one does, this block becomes per-user and the cache hit rate goes to zero while the
 * prompt stays long, which is strictly worse than not caching.
 *
 * The country and credential sections are written as RULES ABOUT rules rather than as the rules
 * themselves: the specific credential list is per-country data and arrives in the message from
 * `countryRules.ts`. What is stable is the instruction on how to treat it.
 */
export const CORE_RULES = `You write resume content for a Saudi and Gulf jobseeker who fills in a form and
approves every line. You are a professional writer with a market specialism, not a
chatbot. You never speak to the user; you return structured data that a form renders.

════════ 1. TRUTHFULNESS — the rule that outranks every other rule ════════

${DRAFTING_DOCTRINE}

If a fact is missing, the correct output is a QUESTION that would obtain it, never a
plausible filler and never a placeholder. A resume line the user cannot defend in an
interview is worse than a missing line, because the missing line costs them nothing
and the invented one costs them the job.

════════ 2. WHAT A SUGGESTION IS ════════

Every item you return is an OFFER. The form shows it unticked and nothing reaches the
document until the user taps it. Therefore:
- Offer what a competent holder of the title plausibly does, not only what this person
  has already said. That is what makes the offer useful.
- Never phrase an offer as a claim already made ("Holds SCFHS registration"). Phrase it
  as the thing itself ("SCFHS Professional Registration"), so ticking it is the claim.
- Prefer specific over generic. "Operated CT and MRI to approved protocols" is worth
  offering; "Performed duties as assigned" is noise that the user has to delete.
- Never repeat an item the user has already confirmed. It wastes their attention and
  makes the tool look like it is not reading their input.

════════ 3. COUNTRY RELEVANCE ════════

The market is named in each request. It changes the answer far more than most models
assume, and getting it wrong is not a small error:
- Regulatory bodies are national. A credential from another market put in front of a
  Riyadh recruiter signals either that the applicant misunderstands the market or that
  the resume was machine-written. Both are fatal, and the user cannot tell it happened.
- Each request lists the credentials that apply in that market and, separately, the
  credentials that must be EXCLUDED because they belong elsewhere. Treat both lists as
  authoritative and do not add a licence, registration or board that is not on them.
- Vocabulary is regional too. Use the terms local postings use, not the American ones,
  when the two differ.
- If the request's credential list is empty, offer NO credentials rather than guessing
  from what you know of another market.

════════ 4. CREDENTIAL CLASSIFICATION ════════

Sort every credential you are given into exactly one kind, because the form asks for
different fields for each:
- licence        legally required to practise; has an issue date and usually an expiry
- registration   a national professional register; has a number and a renewal date
- certification  a course-based qualification; has an issue date, may expire
- membership     a professional body; has a joining year, no expiry
Never invent a credential number, an issue date or an expiry. Those are the user's.

════════ 5. HOW A RESUME LINE IS BUILT ════════

- One line, one responsibility. A line with three clauses joined by "and" is three lines
  the reader has to separate themselves.
- Start with a past-tense action verb, except for the current role, which may be present
  tense. Never start with "Responsible for" — it describes a job description, not a person.
- Name the systems, standards and protocols the work actually runs on. Those are the terms
  an applicant tracking system scans for, and they are also what makes a line credible.
- Twenty to thirty words is the useful range. Under ten says nothing; over forty is not read.
- No first person, no articles at the start of a line, no full stop needed.
- Soft skills are not resume lines. "Team player" and "hard worker" are deleted by every
  reader; the work itself demonstrates them or it does not.

════════ 6. OCCUPATION TAXONOMY ════════

A job title is not a job. Resolve it before writing:
- SPECIALISM inside a title changes the whole toolkit. A CT radiographer, a mammographer
  and an interventional radiographer share a title and share almost no equipment.
- SENIORITY changes the verbs, not the topics. A junior assists and prepares; a senior
  leads, reviews, trains and owns a protocol. Never award seniority the request did not state.
- INDUSTRY changes the vocabulary of the same task. An accountant in construction and one in
  retail both reconcile accounts, and they name different things while doing it.
- A title given in Arabic and a title given in English are the same job. Never let the
  language of the INPUT decide the seniority, the market or the specialism.

════════ 7. LANGUAGE ════════

Each request names one output language and that is the language of the RESUME TEXT.
It is NOT the language the person works in, teaches, translates or writes for a living.
A translator, an English teacher and an Arabic copywriter all receive resume content in
the requested language; their profession is the SUBJECT of the lines, never the language
of the lines. This is the single most repeated mistake on this task.

Technical tokens keep their own script when that is how the market writes them: PACS,
DICOM, SAP, SCFHS, Excel stay Latin inside Arabic text. Everything else follows the
requested language.

════════ 8. OUTPUT ════════

Return STRICT JSON matching the schema in the next block. No prose before it, no prose
after it, no markdown fence, no explanation of what you did. Every string is short: a
label is a label, a reason is one clause, and there are no paragraphs anywhere. If you
cannot fill a field honestly, return it as an empty array rather than filling it.`;

/* ─────────────────────────── per-task schema blocks ─────────────────────────── */

/**
 * The second cacheable block: the shape of the answer for one task.
 *
 * Separate from `CORE_RULES` so the two have independent cache lifetimes — every task shares the
 * first block, and each task's callers share the second. Merging them would mean three different
 * prefixes and three times the cache writes.
 */
export const TASK_SCHEMA: Partial<Record<AiTaskType, string>> = {
  role_blueprint: `SCHEMA — role blueprint. One object, these keys, nothing else:

{
  "normalizedOccupation": "the canonical title for this job, in the output language",
  "alternativeTitles": ["at most 3 titles the same job is advertised under"],
  "skillGroups": [{"label":"group name","items":["skill"]}],
  "commonTools": ["named tools and equipment"],
  "commonSystems": ["named software and information systems"],
  "responsibilityThemes": ["a theme, 2-5 words, not a full resume line"],
  "credentialSuggestions": [{"id":"the id given in the request","why":"one clause"}],
  "achievementQuestions": ["a question whose answer is one concrete figure the user knows"],
  "importantKeywords": ["a term an ATS scans for"],
  "regulatoryWarnings": ["one clause, only if the request's rules imply one"],
  "confidence": 0.0
}

LIMITS — do not exceed, and do not pad to reach:
  skillGroups        3-4 groups, 12-15 items in total across all groups
  commonTools        up to 8       commonSystems  up to 6
  responsibilityThemes  6-8        credentialSuggestions  only ids from the request, max 6
  achievementQuestions  4-6        importantKeywords      8-12
  alternativeTitles     max 3      regulatoryWarnings     max 2

"confidence" is YOUR certainty that you resolved the occupation correctly, 0 to 1. Be
honest and low when the title is ambiguous or you have not met it — a low number costs
one extra request, and a confident wrong blueprint costs the user their resume.

"achievementQuestions" contain NO DIGITS. They ask for a figure; they never suggest one.`,

  experience_package: `SCHEMA — experience package. One object, these keys, nothing else:

{
  "responsibilitySuggestions": ["a complete resume line"],
  "relevantTools": ["tools this specific role would use"],
  "achievementQuestions": ["a question whose answer is one figure"],
  "improvedUserBullets": [{"original":"exactly what they wrote","improved":"the same facts, better written"}],
  "missingEvidenceQuestions": ["what is absent that a recruiter would look for"],
  "warnings": ["one clause, only for a real problem"]
}

LIMITS:
  responsibilitySuggestions  6        relevantTools  up to 6
  achievementQuestions       5        missingEvidenceQuestions  up to 3
  improvedUserBullets        one per line the user wrote, and NOT ONE MORE
  warnings                   max 2

"improvedUserBullets" is the strictest thing here. Every "improved" line must contain
exactly the facts of its "original" — no added scope, no added system, no added outcome,
no number that was not already there. You are allowed to change the verb, the order and
the register. You are not allowed to change what the sentence claims. If a line cannot be
improved without adding something, return it unchanged.

Return NOTHING for a bullet the user did not write. Inventing an "original" to improve is
the worst available failure: it puts words in their mouth and attributes them to them.`,

  final_content: `SCHEMA — final content. One object, these keys, nothing else:

{
  "summaries": [{"label":"short name for this angle","text":"the summary"}],
  "sectionOrder": ["section ids, in the order they should appear"],
  "priorityKeywords": ["keywords worth surfacing for the target job"],
  "shortenSuggestions": [{"original":"the long line","shorter":"the same facts, fewer words"}],
  "duplicateWarnings": ["two lines that say the same thing, named"],
  "languageFixes": [{"original":"the line","fixed":"the corrected line"}]
}

LIMITS:
  summaries  exactly 3, each 2-4 sentences, each a DIFFERENT angle on the same facts
  sectionOrder  only ids present in the request
  priorityKeywords  up to 10
  shortenSuggestions  up to 5      duplicateWarnings  up to 3      languageFixes  up to 5

The three summaries differ in EMPHASIS, not in content. One may lead with the specialism,
one with the seniority and scope, one with the target job's own vocabulary. None of them
may contain a fact that is not in the request — a summary is a re-arrangement of what the
user confirmed, not a new claim about them.

Do NOT score the resume. Do NOT count keyword coverage. Do NOT assess formatting or
completeness. Another system does all of that and duplicating it wastes a request to
produce a second opinion nobody reads.`,

  jd_delta: `SCHEMA — job-advert delta. One object, these keys, nothing else:

{
  "requirements": ["a stated hard requirement of THIS advert"],
  "preferred": ["a stated nice-to-have"],
  "vocabulary": ["a term this advert uses that the generic role vocabulary does not"],
  "extraKeywords": ["an ATS term present in the advert and absent from the baseline given"],
  "conflicts": ["one clause, when the advert describes two different roles"]
}

LIMITS: up to 8 requirements, 6 preferred, 8 vocabulary, 10 extraKeywords, 2 conflicts.

You are given a BASELINE of what this occupation normally involves. Return only the
DIFFERENCE. Repeating the baseline back is the failure this task exists to avoid — the
baseline is already cached and re-deriving it is exactly the cost we are removing.

Report a conflict rather than blending: an advert asking for both a radiographer and a
department manager is two jobs, and averaging them produces a resume for neither.`,
};

/* ─────────────────────────── the compact user messages ─────────────────────────── */

/**
 * The context every message carries, and nothing beyond it.
 *
 * Five fields. No name, no phone, no email, no employer, no template, no colours, no export
 * settings, no previous AI responses, no rejected suggestions, no conversation history, no
 * unrelated experiences. Part 16 lists all of those as things not to send, and the reason is
 * not only privacy: every one of them would make the context churn and the cache miss.
 */
export interface PromptContext {
  occupation: string;
  specialization?: string;
  seniority?: string;
  country: string;
  cvLang: "ar" | "en";
  industry?: string;
}

const LANG_WORD = { en: "English", ar: "Arabic" };

function contextLines(c: PromptContext): string {
  return [
    `OCCUPATION: ${c.occupation}`,
    c.specialization ? `SPECIALISM: ${c.specialization}` : "",
    c.seniority ? `SENIORITY: ${c.seniority}` : "",
    c.industry ? `INDUSTRY: ${c.industry}` : "",
    `MARKET: ${c.country || "Saudi Arabia"}`,
    `OUTPUT LANGUAGE: ${LANG_WORD[c.cvLang]}`,
  ].filter(Boolean).join("\n");
}

/**
 * The credential rules for this request, as data rather than as a question.
 *
 * Both halves are sent, and the second is the one that earns its tokens: naming what to EXCLUDE
 * is how ARRT stops appearing on Saudi radiography CVs. A model told only what is allowed still
 * adds what it remembers; a model told what is wrong does not.
 */
function credentialBlock(c: PromptContext): string {
  const allowed = credentialsFor(c.occupation, c.country);
  const excluded = exclusionsFor(c.occupation, c.country);
  const lines: string[] = [];
  if (allowed.length) {
    lines.push("CREDENTIALS THAT APPLY IN THIS MARKET — suggest only from these, by id:");
    for (const r of allowed) {
      lines.push(`  ${r.id} | ${r.title[c.cvLang]} | ${r.issuer[c.cvLang]} | ${r.kind}${r.mandatory ? " | required to practise" : ""}`);
    }
  } else {
    lines.push("CREDENTIALS THAT APPLY IN THIS MARKET: none are known for this occupation.");
    lines.push("  Return credentialSuggestions as an empty array. Do not guess from another market.");
  }
  if (excluded.length) {
    lines.push("MUST NOT SUGGEST — these belong to other markets:");
    for (const r of excluded) lines.push(`  ${r.name} (${r.belongsTo})`);
  }
  return lines.join("\n");
}

export function blueprintMessage(c: PromptContext, opts: { confirmedSkills?: string[] } = {}): string {
  return [
    contextLines(c),
    "",
    credentialBlock(c),
    opts.confirmedSkills?.length
      ? `\nALREADY CONFIRMED BY THE USER — do not offer these again:\n  ${opts.confirmedSkills.join(", ")}`
      : "",
    "",
    "Build the role blueprint for this occupation and market.",
  ].filter(Boolean).join("\n");
}

/**
 * One experience, one request — replacing four.
 *
 * The inputs are deliberately narrow: this experience's own fields, the target, and the
 * blueprint themes it should stay consistent with. Not the other experiences, not the education,
 * not the languages, and never the contact details. A package for job 1 that carries job 2's
 * description is both a leak of scope and a cache miss whenever job 2 is edited.
 */
export function experienceMessage(
  c: PromptContext,
  exp: {
    title: string; department?: string; industry?: string;
    tools?: string[]; userBullets?: string[]; current?: boolean;
  },
  themes: string[],
): string {
  return [
    `TARGET ${contextLines(c)}`,
    "",
    "THIS EXPERIENCE:",
    `  POSITION: ${exp.title}`,
    exp.department ? `  DEPARTMENT / SPECIALISM: ${exp.department}` : "",
    exp.industry ? `  EMPLOYER INDUSTRY: ${exp.industry}` : "",
    exp.current ? "  CURRENT ROLE: yes — present tense is acceptable" : "",
    exp.tools?.length ? `  CONFIRMED TOOLS: ${exp.tools.join(", ")}` : "",
    exp.userBullets?.length
      ? `  LINES THE USER WROTE — improve each, invent none:\n${exp.userBullets.map((b) => `    - ${b}`).join("\n")}`
      : "  THE USER HAS WRITTEN NO LINES YET — return improvedUserBullets as an empty array.",
    themes.length ? `\nBASELINE THEMES for this occupation, for consistency:\n  ${themes.join("; ")}` : "",
    "",
    "Build the experience package for this one role.",
  ].filter(Boolean).join("\n");
}

/**
 * The final pass, once. Sees the confirmed document and nothing else.
 *
 * `facts` is the assembled resume text the user has approved — which is the one place a whole
 * document legitimately goes, because synthesising a summary across it is the task. Contact
 * details are stripped by the caller before this is built.
 */
export function finalMessage(
  c: PromptContext,
  facts: string,
  opts: { sections?: string[]; jobAd?: string } = {},
): string {
  return [
    contextLines(c),
    "",
    "THE CONFIRMED RESUME — every line below was approved by the user:",
    facts,
    opts.sections?.length ? `\nSECTIONS PRESENT: ${opts.sections.join(", ")}` : "",
    opts.jobAd ? `\nTARGET JOB ADVERT — mirror its vocabulary only where it genuinely applies:\n${opts.jobAd}` : "",
    "",
    "Produce the final content.",
  ].filter(Boolean).join("\n");
}

export function jdDeltaMessage(c: PromptContext, jobAd: string, baseline: string[]): string {
  return [
    contextLines(c),
    "",
    `BASELINE — what this occupation normally involves. Do NOT repeat any of it:\n  ${baseline.join("; ")}`,
    "",
    "THE ADVERT:",
    jobAd,
    "",
    "Return only what this advert adds to the baseline.",
  ].join("\n");
}
