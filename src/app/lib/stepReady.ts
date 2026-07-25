/**
 * One answer to "is this step actually done", used by everything that claims to know.
 *
 * ── the bug this exists to make impossible ──
 *
 * Production showed a resume with Target Job ticked, every earlier step ticked, and the Skills step
 * saying "Enter a job title first." An impossible state on the screen, and two entirely separate
 * causes behind it:
 *
 *   1. `sectionsDone` is appended by `markDone`, which is called when the user presses Continue. So
 *      a tick meant "this person pressed a button", never "the data required by later steps is
 *      present". Pressing Continue on an empty form ticked the step.
 *
 *   2. `SkillsBody` rendered "Enter a job title first" whenever it had no suggestions AND no
 *      confirmed skills. Those are different propositions from "there is no job title", and the
 *      string described the wrong one. Suggestions are seeded from `findRolePack`, and there are
 *      SEVEN role packs — so every job title outside those seven produced zero suggestions and the
 *      step told the user to enter the title they had just entered.
 *
 * Either alone is a bad message. Together they produce a screen that contradicts itself, which is
 * worse than either: the user cannot tell whether the tick is lying or the message is.
 *
 * So completion is DERIVED from the data by the functions below, and `sectionsDone` becomes what it
 * always should have been — a record of where the user has been, not a claim about what is valid.
 * The rail, the step header, the Continue gate and every AI dependency call the same function, and
 * a step that cannot show its tick and its warning at the same time cannot contradict itself.
 *
 * Pure, no React, no `next/*` — `ops/stepready.test.mjs` drives all of it offline.
 */

import type { BuilderState, SectionId } from "./builderDoc.ts";

/**
 * Why a step is not ready, as a machine reason plus the field to blame.
 *
 * `field` is the point. "Target job is incomplete" sends the user back to a form to hunt; "the
 * target country is missing" sends them to one input. The brief's requirement is exactly this:
 * show the exact missing field and link back to the exact stage.
 */
export interface Missing {
  /** Machine reason; the UI maps it to a sentence in the reader's language. */
  code: string;
  /** The step that owns the missing field, for the "go back and fix it" link. */
  step: SectionId;
  /** The field itself, when one field is to blame. */
  field?: string;
}

export interface Readiness {
  ready: boolean;
  missing: Missing[];
}

const READY: Readiness = { ready: true, missing: [] };
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/* ─────────────────────────── the target ─────────────────────────── */

/**
 * The one every later step depends on.
 *
 * Deliberately NOT requiring a normalized occupation id or a resolved occupation family. The brief
 * asks for both, and both are real improvements — but making them REQUIRED here would turn today's
 * misleading message into a hard block for every job title the resolver has not been taught, which
 * is a strictly worse bug than the one being fixed. A raw title the user typed is a real target;
 * normalisation makes the suggestions better and is not a precondition for having a job.
 *
 * The country is required, because a credential suggestion without a market is the ARRT-on-a-Saudi-CV
 * failure, and the CV language is required because it decides what language every suggestion is
 * written in.
 */
export function targetReady(s: BuilderState): Readiness {
  const missing: Missing[] = [];
  if (!str(s.target.title)) missing.push({ code: "no-title", step: "target", field: "title" });
  /* Either the target market or where they live. A jobseeker who has said neither has told us
     nothing about which regulator applies. */
  if (!str(s.target.country) && !str(s.personal.country)) {
    missing.push({ code: "no-country", step: "target", field: "country" });
  }
  if (!str(s.target.language)) missing.push({ code: "no-cv-language", step: "target", field: "language" });
  return missing.length ? { ready: false, missing } : READY;
}

/* ─────────────────────────── the other gates ─────────────────────────── */

export function personalReady(s: BuilderState): Readiness {
  const missing: Missing[] = [];
  if (!str(s.personal.fullName)) missing.push({ code: "no-name", step: "personal", field: "fullName" });
  /* One way to be contacted. Which one is the user's choice; having none is not. */
  if (!str(s.personal.email) && !str(s.personal.phone)) {
    missing.push({ code: "no-contact", step: "personal", field: "email" });
  }
  return missing.length ? { ready: false, missing } : READY;
}

export function experienceReady(s: BuilderState): Readiness {
  const roles = s.profile.roles ?? [];
  if (!roles.length) return { ready: false, missing: [{ code: "no-experience", step: "experience" }] };
  const missing: Missing[] = [];
  for (const r of roles) {
    if (!str(r.title)) missing.push({ code: "role-no-title", step: "experience", field: "title" });
    if (!str(r.company)) missing.push({ code: "role-no-employer", step: "experience", field: "company" });
    if (!str(r.start)) missing.push({ code: "role-no-start", step: "experience", field: "start" });
    /*
     * An empty end date is how this codebase has always meant "currently working here" — see
     * `rolesToLines`. So it is NOT missing data, and requiring it would mark every current job
     * incomplete. Only a role with neither a start nor an end is unfinished.
     */
  }
  return missing.length ? { ready: false, missing } : READY;
}

/**
 * Can the Skills step do its job?
 *
 * This is the function the screenshot bug was missing. Skills needs the TARGET, and nothing else —
 * not an experience, not a job title on the latest role, not a role pack that happens to exist. A
 * step that demands more than it needs is the same class of error as one that claims more than it
 * knows.
 */
export function skillsReady(s: BuilderState): Readiness {
  const missing: Missing[] = [];
  if (!str(s.target.title)) missing.push({ code: "no-title", step: "target", field: "title" });
  if (!str(s.target.language)) missing.push({ code: "no-cv-language", step: "target", field: "language" });
  return missing.length ? { ready: false, missing } : READY;
}

/**
 * Languages, same requirement — and deliberately NOT the country.
 *
 * A phone screenshot of the Arabic skills step is what found this. The banner said "the country you
 * are applying in is not set — it is what decides which credentials are required", on the SKILLS
 * step, where no credential is involved and the country changes nothing. That is the original bug
 * wearing different words: a step telling a user something is missing when the step works fine
 * without it. So the country requirement lives where the sentence is true.
 */
export const languagesReady = skillsReady;

/**
 * Credentials is the step the country genuinely gates.
 *
 * Which licence a radiographer needs is a fact about a jurisdiction — SCFHS in Saudi Arabia, ARRT in
 * the United States — and offering the wrong one is the ARRT-on-a-Saudi-CV bug that `countryRules.ts`
 * exists to prevent. Without a market there is no correct answer to give.
 */
export const credentialsReady = targetReady;

/**
 * The summary describes the whole document, so it needs one confirmed role to describe.
 *
 * The only gate here that is genuinely stricter than the target, and it earns it: a summary written
 * before any experience exists is a paragraph about nobody.
 */
export function summaryReady(s: BuilderState): Readiness {
  /* Built on the skills gate, not the target one: a professional summary is written from a title
     and a history, and no sentence in it depends on which country the user is applying in. */
  const t = skillsReady(s);
  if (!t.ready) return t;
  return (s.profile.roles ?? []).length
    ? READY
    : { ready: false, missing: [{ code: "no-experience", step: "experience" }] };
}

/* ─────────────────────────── the registry ─────────────────────────── */

/**
 * Which validator owns which step. Steps with no entry have no data requirement — design and
 * review read what exists and are always reachable, because a user must be able to look at their
 * own document.
 */
const GATES: Partial<Record<SectionId, (s: BuilderState) => Readiness>> = {
  target: targetReady,
  personal: personalReady,
  experience: experienceReady,
  skills: skillsReady,
  credentials: credentialsReady,
  languages: languagesReady,
  summary: summaryReady,
};

export function stepReady(step: SectionId, s: BuilderState): Readiness {
  return (GATES[step] ?? (() => READY))(s);
}

/**
 * What the rail should draw next to a step.
 *
 * Four states, and the third is the one that did not exist before:
 *
 *   done       visited AND its data validates — the only case that earns a tick
 *   warn       visited and its data does NOT validate — a warning, never a tick
 *   current    where the user is
 *   untouched  a neutral dot
 *
 * A visited-but-invalid step used to render a tick. That is the screenshot: the tick was drawn from
 * `sectionsDone` alone, so it survived data that could not support it.
 */
export type StepMark = "done" | "warn" | "current" | "untouched";

export function stepMark(step: SectionId, s: BuilderState, current: SectionId): StepMark {
  if (step === current) return "current";
  const visited = s.sectionsDone.includes(step);
  if (!visited) return "untouched";
  return stepReady(step, s).ready ? "done" : "warn";
}

/**
 * How far along the journey is, counted from VALIDATED steps only.
 *
 * Separate from `computeProgress` in `interviewGuards.ts`, which scores how complete the resume
 * DOCUMENT is and is the right number for the CV's own quality. This one answers "how much of the
 * form is genuinely finished", which is the number a step rail should show. Conflating them is how a
 * rail reads 60% on a resume with no job title.
 */
export function completedSteps(s: BuilderState, steps: readonly SectionId[]): SectionId[] {
  return steps.filter((step) => s.sectionsDone.includes(step) && stepReady(step, s).ready);
}
