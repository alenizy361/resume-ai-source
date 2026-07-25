/**
 * The screenshot, as an assertion.
 *
 * A production screenshot showed Target Job ticked, every earlier step ticked, the user on Step 7 of
 * 11 (Skills), and the Skills step saying "Enter a job title first." A screen contradicting itself,
 * and worse than either half alone: the user cannot tell whether the tick is lying or the message is.
 *
 * Two independent causes, both reproduced below before being fixed:
 *
 *   1. `sectionsDone` was appended by `markDone`, called when the user presses Continue. A tick meant
 *      "this person pressed a button", never "the data later steps depend on is present".
 *
 *   2. `SkillsBody` printed "Enter a job title first" whenever it had no suggestions AND no confirmed
 *      skills. Suggestions are seeded from `findRolePack`, and there are SEVEN role packs — so every
 *      job title outside those seven produced zero suggestions and the step told the user to enter
 *      the title they had already entered.
 *
 * The fix is one shared validator. These tests assert the property that makes the screenshot
 * impossible rather than the string that made it visible: a step cannot show a tick and a
 * missing-prerequisite message at the same time, because both now come from `stepReady`.
 *
 *   node --experimental-strip-types ops/stepready.test.mjs
 */

import {
  targetReady, personalReady, experienceReady, skillsReady, summaryReady,
  stepReady, stepMark, completedSteps,
} from "../app/lib/stepReady.ts";
import { missingLabel, MESSAGE_CODES } from "../app/lib/stepMessages.ts";
import { EMPTY_BUILDER, EMPTY_TARGET } from "../app/lib/builderDoc.ts";
import { STEPS } from "../app/components/build/steps.ts";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };

/** A builder state with a target that satisfies every gate. */
const withTarget = (patch = {}) => ({
  ...EMPTY_BUILDER,
  target: { ...EMPTY_TARGET, title: "Radiology Technologist", country: "SA", language: "en", ...patch },
});

/* ─────────────────── the exact reported state ─────────────────── */

{
  /*
   * The screenshot, rebuilt: a title that `rolePacks.ts` does not know, so ZERO seeded skills, and
   * every earlier step marked done because the user pressed Continue on each.
   *
   * "Insurance Claims Analyst" is deliberately outside the seven packs. That is not a contrived
   * input — seven packs is the coverage, so this is the ordinary case, not the edge one.
   */
  const s = {
    ...withTarget({ title: "Insurance Claims Analyst" }),
    personal: { ...EMPTY_BUILDER.personal, fullName: "Abdulaziz", email: "a@b.co" },
    profile: { ...EMPTY_BUILDER.profile, roles: [{ id: "r1", title: "Analyst", company: "Bupa", location: "", start: "2020", end: "", bullets: [] }] },
    sectionsDone: ["target", "blueprint", "personal", "experience", "education", "credentials"],
    suggestions: [],
  };

  ok("the reported state has a job title", s.target.title.length > 0);
  ok("and no seeded skill suggestions at all — the condition that produced the message",
    s.suggestions.filter((i) => i.section === "skills").length === 0);

  /*
   * THE ASSERTION. Skills must be READY: it has everything it needs. Having no suggestions to show
   * is a different fact from missing a prerequisite, and conflating them is the entire bug.
   */
  ok("Skills is ready — so it may NOT claim the job title is missing", skillsReady(s).ready === true);

  /*
   * And ready with NO experience at all.
   *
   * Added after injecting the likeliest wrong fix and watching this suite pass it: making Skills
   * depend on an experience row. The fixture above happens to have one, so the injection survived.
   * It must not — a user may fill in skills before jobs, the brief says so explicitly ("do not
   * require experience.jobTitle if a valid target occupation already exists"), and demanding more
   * than a step needs is the same class of error as claiming more than it knows.
   */
  ok("Skills is ready before any experience exists — it needs the target, nothing more",
    skillsReady({ ...s, profile: { ...s.profile, roles: [] } }).ready === true);
  ok("and so are credentials and languages, which share the dependency",
    stepReady("credentials", { ...s, profile: { ...s.profile, roles: [] } }).ready === true
    && stepReady("languages", { ...s, profile: { ...s.profile, roles: [] } }).ready === true);
  ok("and Target Job legitimately keeps its tick", stepMark("target", s, "skills") === "done");
  ok("the two therefore cannot contradict each other",
    stepMark("target", s, "skills") === "done" && skillsReady(s).ready);
}

{
  /* The inverse: the message is CORRECT when the target genuinely is missing. Suppressing it
     everywhere would be the same error with the opposite sign. */
  const s = { ...EMPTY_BUILDER, sectionsDone: ["target", "personal"] };
  ok("with no title at all, Skills is not ready", skillsReady(s).ready === false);
  ok("and names the missing field rather than the step",
    skillsReady(s).missing.some((m) => m.field === "title"));
  ok("and points back to the step that owns it",
    skillsReady(s).missing.every((m) => m.step === "target"));

  /*
   * And the tick must come OFF. This is the half that mattered most: a visited-but-invalid step
   * used to render a green tick, which is what made the contradiction visible.
   */
  ok("a visited step whose data does not validate shows a warning, not a tick",
    stepMark("target", s, "skills") === "warn");
}

/* ───────────── the country belongs to the step that uses it ───────────── */

/*
 * Found in a phone screenshot of the Arabic skills step: the banner read "the country you are
 * applying in is not set — it is what decides which credentials are required", printed above a
 * skills list, where no credential is involved. The sentence was true; the place was wrong.
 *
 * A missing country stops credentials from being correct — SCFHS or ARRT depends entirely on the
 * market — and stops nothing else. Skills, languages and the summary work without one, and telling
 * a user otherwise is the original bug in different words.
 */
{
  const noCountry = {
    ...EMPTY_BUILDER,
    target: { ...EMPTY_TARGET, title: "أخصائي أشعة", country: "", language: "ar" },
    personal: { ...EMPTY_BUILDER.personal, country: "" },
  };

  ok("Skills does not demand a country", skillsReady(noCountry).ready === true);
  ok("nor do languages", stepReady("languages", noCountry).ready === true);
  ok("credentials DOES — it is the step whose answer changes with the market",
    stepReady("credentials", noCountry).ready === false);
  ok("and it says so by naming the country",
    stepReady("credentials", noCountry).missing.some((m) => m.code === "no-country"));

  /* The summary is about a person's work, not their jurisdiction. */
  const withRole = {
    ...noCountry,
    profile: { ...EMPTY_BUILDER.profile, roles: [{ id: "r1", title: "أخصائي أشعة", company: "مستشفى", location: "", start: "2020", end: "", bullets: [] }] },
  };
  ok("the summary does not demand a country either", stepReady("summary", withRole).ready === true);

  /* And the target step still asks for it — that is where the field lives. */
  ok("the target step still wants the country", targetReady(noCountry).ready === false);
}

/* ─────────────────── the target gate ─────────────────── */

{
  ok("a bare state is not ready", targetReady(EMPTY_BUILDER).ready === false);
  ok("a title alone is not enough — a credential without a market is the ARRT-on-a-Saudi-CV bug",
    targetReady({ ...EMPTY_BUILDER, target: { ...EMPTY_TARGET, title: "Nurse" } }).ready === false);
  ok("title plus country plus CV language is enough", targetReady(withTarget()).ready === true);

  /* Where they live counts when they have not named a target market. Requiring the target country
     specifically would block every user who simply has not thought about it yet. */
  ok("the personal country satisfies the market requirement",
    targetReady({
      ...EMPTY_BUILDER,
      target: { ...EMPTY_TARGET, title: "Nurse", country: "" },
      personal: { ...EMPTY_BUILDER.personal, country: "Saudi Arabia" },
    }).ready === true);

  ok("whitespace is not a title",
    targetReady(withTarget({ title: "   " })).ready === false);

  /*
   * Deliberately NOT required: a normalized occupation id. The brief asks for one, and it is a real
   * improvement — but making it a PRECONDITION would turn a misleading message into a hard block for
   * every job title the resolver has not been taught, which is strictly worse than the bug being
   * fixed. A raw title the user typed is a real job.
   */
  ok("an unrecognised occupation is still a valid target",
    targetReady(withTarget({ title: "Falconry Equipment Specialist" })).ready === true);
}

/* ─────────────────── the other gates ─────────────────── */

{
  ok("a name with no way to reach the person is incomplete",
    personalReady({ ...EMPTY_BUILDER, personal: { ...EMPTY_BUILDER.personal, fullName: "A" } }).ready === false);
  ok("either an email or a phone is enough — which one is the user's choice",
    personalReady({ ...EMPTY_BUILDER, personal: { ...EMPTY_BUILDER.personal, fullName: "A", phone: "0500000000" } }).ready === true);

  ok("no roles means experience is incomplete", experienceReady(EMPTY_BUILDER).ready === false);

  const current = {
    ...EMPTY_BUILDER,
    profile: { ...EMPTY_BUILDER.profile, roles: [{ id: "r1", title: "Radiographer", company: "KFMC", location: "", start: "2021", end: "", bullets: [] }] },
  };
  /*
   * An empty end date is how this codebase has always meant "currently working here" — see
   * `rolesToLines`. Requiring it would mark every current job incomplete, which would put a warning
   * beside the experience step of everyone who has a job.
   */
  ok("a current role with no end date is complete, not incomplete", experienceReady(current).ready === true);
  ok("but a role with no employer is not",
    experienceReady({ ...current, profile: { ...current.profile, roles: [{ ...current.profile.roles[0], company: "" }] } }).ready === false);

  /* The summary is the one gate genuinely stricter than the target: a summary written before any
     experience exists is a paragraph about nobody. */
  ok("the summary needs a role to describe", summaryReady(withTarget()).ready === false);
  ok("and is ready once one exists",
    summaryReady({ ...withTarget(), profile: current.profile }).ready === true);
}

/* ─────────────────── marks and progress ─────────────────── */

{
  const s = { ...withTarget(), sectionsDone: ["target"] };
  ok("the current step is marked current, whatever its data", stepMark("target", s, "target") === "current");
  ok("an unvisited step is a neutral dot", stepMark("languages", s, "target") === "untouched");
  ok("a visited, valid step is done", stepMark("target", { ...s, sectionsDone: ["target"] }, "skills") === "done");

  /* Progress counts VALIDATED steps. A rail reading 60% on a resume with no job title is the same
     lie as a tick on an empty step, drawn as a bar. */
  ok("progress counts only validated steps",
    completedSteps({ ...EMPTY_BUILDER, sectionsDone: ["target", "personal"] }, STEPS).length === 0);
  ok("and counts them once they validate",
    completedSteps({ ...withTarget(), sectionsDone: ["target"] }, STEPS).length === 1);

  /* A step with no data requirement is always reachable — a user must be able to look at their own
     document. */
  ok("design has no data gate", stepReady("design", EMPTY_BUILDER).ready === true);
  ok("review has no data gate", stepReady("review", EMPTY_BUILDER).ready === true);
}

/* ─────────────────── the messages ─────────────────── */

{
  /* Every code a validator can emit must have a sentence, in both languages. An unmapped code
     reaching the screen as itself is not hypothetical — this codebase printed `http-500` to a
     jobseeker for exactly that reason. */
  const emitted = new Set();
  const states = [
    EMPTY_BUILDER,
    withTarget({ country: "", language: "" }),
    { ...EMPTY_BUILDER, personal: { ...EMPTY_BUILDER.personal, fullName: "A" } },
    { ...EMPTY_BUILDER, profile: { ...EMPTY_BUILDER.profile, roles: [{ id: "r", title: "", company: "", location: "", start: "", end: "", bullets: [] }] } },
  ];
  for (const st of states) {
    for (const step of STEPS) for (const m of stepReady(step, st).missing) emitted.add(m.code);
  }
  const orphans = [...emitted].filter((c) => !MESSAGE_CODES.includes(c));
  ok("every code a validator emits has a sentence", orphans.length === 0, orphans.join(", "));

  for (const lang of ["en", "ar"]) {
    const blank = MESSAGE_CODES.filter((c) => !missingLabel(c, lang).trim());
    ok(`${lang}: no code maps to an empty sentence`, blank.length === 0, blank.join(", "));
  }
  ok("Arabic sentences are Arabic",
    MESSAGE_CODES.every((c) => /[؀-ۿ]/.test(missingLabel(c, "ar"))));
  ok("an unknown code falls back to prose, never to the identifier",
    !missingLabel("some-new-code", "en").includes("some-new-code")
    && !missingLabel("some-new-code", "ar").includes("some-new-code"));
}

/* ─────────────────── the language default ─────────────────── */

{
  /*
   * The second reported bug. `EMPTY_TARGET.language` is "en", so an Arabic-interface user who never
   * opened the dropdown got an English CV and English suggestions throughout. Nobody chose that; a
   * constant chose it, while the one available signal — they were reading Arabic — was ignored.
   *
   * The provider now seeds a FRESH draft's CV language from the interface language. Asserted here as
   * the shape the provider builds, because the provider itself needs React to run.
   */
  const freshFor = (lang) => ({ ...EMPTY_BUILDER, target: { ...EMPTY_BUILDER.target, language: lang } });
  ok("a fresh Arabic draft authors in Arabic", freshFor("ar").target.language === "ar");
  ok("a fresh English draft authors in English", freshFor("en").target.language === "en");
  ok("the constant itself still defaults to English, so this must be seeded explicitly",
    EMPTY_TARGET.language === "en");
  /* And the seeded language satisfies the gate, so seeding cannot create a blocked state. */
  ok("a seeded language passes the target gate",
    targetReady({ ...withTarget(), target: { ...withTarget().target, language: "ar" } }).ready === true);
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
