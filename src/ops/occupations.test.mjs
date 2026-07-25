/**
 * What job is this — asked of titles in both languages, including the ones that are not jobs.
 *
 * The resolver exists because generating suggestions from a raw title is the same class of error as
 * the screenshot bug: acting on less information than the answer needs. "معلم" is six jobs with six
 * toolkits; "فني" is half a job. A model asked for a technician's skills produces a blend of
 * radiology, IT and electrical work, and the user cannot tell which parts are theirs.
 *
 * The assertion that matters most is the NEGATIVE one: an unrecognised title must resolve to nothing
 * and block nothing. A resolver that can refuse a job it has not been taught is worse than no
 * resolver, and that failure mode is one line away at all times.
 *
 *   node --experimental-strip-types ops/occupations.test.mjs
 */

import {
  resolveOccupation, occupationById, CONFIDENCE_FLOOR, OCCUPATION_IDS, OCCUPATION_COUNT,
} from "../app/lib/occupations.ts";
import { targetReady } from "../app/lib/stepReady.ts";
import { EMPTY_BUILDER, EMPTY_TARGET } from "../app/lib/builderDoc.ts";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };

/* ─────────────────── broad titles ask exactly once ─────────────────── */

for (const [title, expect] of [
  ["teacher", "education"], ["معلم", "education"], ["مدرس", "education"],
  ["technician", "mixed"], ["فني", "mixed"], ["تقني", "mixed"],
  ["engineer", "engineering"], ["مهندس", "engineering"],
  ["specialist", "mixed"], ["أخصائي", "mixed"],
  ["manager", "mixed"], ["مدير", "mixed"],
]) {
  const r = resolveOccupation(title);
  ok(`"${title}" asks for clarification instead of guessing`, r.clarificationRequired === true);
  ok(`"${title}" offers real options`, (r.clarification?.options.length ?? 0) >= 4);
  ok(`"${title}" resolves to no occupation until answered`, r.occupationId === "");
  void expect;
}

{
  const r = resolveOccupation("معلم");
  /* One question, never two. A form that asks twice before showing anything is a form people leave. */
  ok("the clarifying question is asked in both languages",
    Boolean(r.clarification?.question.ar) && Boolean(r.clarification?.question.en));
  ok("and the Arabic question is Arabic", /[؀-ۿ]/.test(r.clarification.question.ar));
  ok("every option carries a bilingual display",
    r.clarification.options.every((o) => o.display.ar && o.display.en));
  ok("and every option is a real occupation id",
    r.clarification.options.every((o) => occupationById(o.occupationId) !== null));
  ok("the teaching options include the ones that actually differ",
    ["primary-teacher", "english-teacher", "university-lecturer"]
      .every((id) => r.clarification.options.some((o) => o.occupationId === id)));
}

/* ─────────────────── specific titles resolve silently ─────────────────── */

for (const [title, id] of [
  ["معلم لغة إنجليزية", "english-teacher"],
  ["مدرس رياضيات", "mathematics-teacher"],
  ["معلم تربية خاصة", "special-education-teacher"],
  ["أخصائي أشعة", "radiology-technologist"],
  ["Radiology Technologist", "radiology-technologist"],
  ["Radiographer", "radiology-technologist"],
  ["فني أشعة", "radiology-technologist"],
  ["محاسب", "accountant"],
  ["مدقق حسابات", "auditor"],
  ["ممرضة", "nurse"],
  ["مهندس مدني", "civil-engineer"],
  ["مطور برمجيات", "software-developer"],
  ["Software Engineer", "software-developer"],
  ["خدمة عملاء", "customer-service"],
  ["مدير مشاريع", "project-manager"],
]) {
  const r = resolveOccupation(title);
  ok(`"${title}" → ${id}`, r.occupationId === id, r.occupationId || "unresolved");
  ok(`"${title}" is confident enough not to ask`, r.clarificationRequired === false);
}

{
  /*
   * Arabic orthography is not optional here. A user typing "اخصائي اشعه" without hamza or with ha
   * instead of ta-marbuta is the common case, not the careless one — phone keyboards produce it.
   */
  const forms = ["أخصائي أشعة", "اخصائي اشعه", "أخصائي أشعه", "  اخصائي   أشعة  "];
  const ids = forms.map((f) => resolveOccupation(f).occupationId);
  ok("hamza, ta-marbuta and spacing all resolve to the same occupation",
    new Set(ids).size === 1 && ids[0] === "radiology-technologist", ids.join(" · "));
}

/* ─────────────────── specialisation and seniority ─────────────────── */

{
  ok("a modality in the title becomes a specialism",
    resolveOccupation("CT Radiographer").specialization?.en === "Computed Tomography");
  ok("and it is available in Arabic too",
    resolveOccupation("أخصائي أشعة مقطعية").specialization?.ar === "الأشعة المقطعية");
  ok("a plain radiographer has no specialism claimed for them",
    resolveOccupation("Radiographer").specialization === null);

  for (const [title, level] of [
    ["Senior Radiographer", "senior"],
    ["أخصائي أشعة أول", "senior"],
    ["Junior Accountant", "junior"],
    ["Lead Software Engineer", "lead"],
    ["Project Manager", "manager"],
    ["Radiographer", ""],
  ]) {
    ok(`"${title}" reads seniority as "${level || "unstated"}"`,
      resolveOccupation(title).seniority === level, resolveOccupation(title).seniority);
  }

  /*
   * "Assistant Manager" is junior and contains both markers. Junior wins, and that ordering is not
   * arbitrary — the other order promotes every assistant to management.
   */
  ok("an assistant manager is junior, not a manager",
    resolveOccupation("Assistant Manager").seniority === "junior");

  ok("seniority does not prevent the occupation from resolving",
    resolveOccupation("Senior CT Radiographer").occupationId === "ct-radiographer");
}

/* ─────────────────── THE NEGATIVE CASE: unknown must not block ─────────────────── */

{
  /*
   * The assertion this file exists for.
   *
   * A resolver that can refuse a job it has not been taught is worse than no resolver at all, and
   * that failure is one line away at all times. `stepReady` deliberately accepts a raw title, so
   * these two facts have to hold together: the resolver says "I do not know this", and the builder
   * carries on regardless.
   */
  for (const title of ["Insurance Claims Analyst", "منسق سلامة", "Falconry Equipment Specialist", "حارس أمن"]) {
    const r = resolveOccupation(title);
    ok(`"${title}" is honestly unresolved`, r.occupationId === "" && r.family === "unknown");
    ok(`"${title}" does NOT trigger a pointless question`, r.clarificationRequired === false);
    /* Their words survive, in both slots. Never a transliteration, never the nearest English job. */
    ok(`"${title}" keeps the user's own words for display`,
      r.display.ar === title.trim() && r.display.en === title.trim());

    const state = { ...EMPTY_BUILDER, target: { ...EMPTY_TARGET, title, country: "SA", language: "ar" } };
    ok(`"${title}" is still a valid target — the builder is not blocked`, targetReady(state).ready === true);
  }
}

/* ─────────────────── no false positives from short substrings ─────────────────── */

{
  /*
   * A short alias inside a long word is the classic containment bug: "it" inside "audit" resolving
   * to IT support. The length-ratio floor is what prevents it, asserted rather than trusted.
   */
  ok("an auditor is not IT support", resolveOccupation("Auditor").occupationId === "auditor");
  ok("a pharmacist is not a project manager", resolveOccupation("Pharmacist").occupationId === "pharmacist");
  ok("empty input resolves to nothing and asks nothing",
    resolveOccupation("").occupationId === "" && resolveOccupation("").clarificationRequired === false);
  ok("whitespace only is the same", resolveOccupation("   ").confidence === 0);
  ok("punctuation alone does not match an occupation", resolveOccupation("!!!").occupationId === "");
}

/* ─────────────────── the taxonomy itself ─────────────────── */

{
  ok("every occupation has a unique id", new Set(OCCUPATION_IDS).size === OCCUPATION_COUNT);
  ok("the taxonomy covers the families the country rules key on", OCCUPATION_COUNT >= 25, String(OCCUPATION_COUNT));
  ok("every occupation resolves from its own English name",
    OCCUPATION_IDS.every((id) => {
      const o = occupationById(id);
      const r = resolveOccupation(o.display.en);
      /* Its own name must reach it, OR be a broad title that offers it as an option — "Nurse" is a
         real title and "Engineer" is a category, and both are correct behaviours. */
      return r.occupationId === id || (r.clarificationRequired && r.clarification.options.some((x) => x.occupationId === id));
    }));
  ok("and from its own Arabic name",
    OCCUPATION_IDS.every((id) => {
      const o = occupationById(id);
      const r = resolveOccupation(o.display.ar);
      return r.occupationId === id || (r.clarificationRequired && r.clarification.options.some((x) => x.occupationId === id));
    }));
  ok("an unknown id resolves to null rather than throwing", occupationById("no-such-job") === null);
  ok("the confidence floor is a real threshold, not zero",
    CONFIDENCE_FLOOR > 0 && CONFIDENCE_FLOOR < 1);
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
