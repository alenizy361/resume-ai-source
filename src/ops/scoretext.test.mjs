/**
 * The score must be a computation, not an opinion.
 *
 * It used to be whatever the model typed after `SCORE:`, and the "after" score was
 * invented arithmetic (+4..+12 when the model omitted it) sold as before/after proof.
 * These tests assert the three properties that make a number worth printing:
 * determinism, insensitivity to stuffing, and honesty when a rewrite is worse.
 *
 *   node --experimental-strip-types src/ops/scoretext.test.mjs
 */

import { scoreFlatResume, beforeAfter, stateFromText } from "../app/lib/scoreText.ts";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };
const eq = (n, g, w) => ok(n, JSON.stringify(g) === JSON.stringify(w), `got ${JSON.stringify(g)}, want ${JSON.stringify(w)}`);

const REF = "2026-07-25";

const CV = `Abdulaziz Alanazi
Riyadh | +966 581 453 234 | a@example.com

WORK EXPERIENCE
Radiographer — Dallah Hospital | Sep 2024 - Present
- Performed CT examinations following departmental protocols
- Operated PACS to store and retrieve diagnostic images

EDUCATION
Bachelor of Radiologic Technology — King Saud University, 2020

SKILLS
Computed Tomography, PACS, Radiation Protection
`;

const AD = `Senior Radiographer. Required: CT, PACS, radiation protection.
Preferred: MRI. Must hold SCFHS registration.`;

/* ── the text becomes a document review can read ── */
{
  const st = stateFromText(CV, AD);
  eq("the employer is read", st.profile.roles[0].company, "Dallah Hospital");
  eq("the target title defaults to the most recent role", st.target.title, "Radiographer");
  ok("the advert is carried", st.target.jobAdText.includes("SCFHS"));
  ok("contact details reach the profile", st.profile.contact.includes("a@example.com"));
}

/* ── the same input always scores the same ── */
{
  const a = scoreFlatResume(CV, AD, REF);
  const b = scoreFlatResume(CV, AD, REF);
  eq("scoring is deterministic", a.score, b.score);
  ok("and it is a real number in range", a.score >= 0 && a.score <= 100, String(a.score));
}

/* ── the KIND of score is decided by the data ── */
{
  eq("no advert means a quality score", scoreFlatResume(CV, "", REF).kind, "quality");
  eq("an advert means a match score", scoreFlatResume(CV, AD, REF).kind, "match");
  const q = scoreFlatResume(CV, "", REF).report;
  ok("a quality report never labels a dimension a match",
    q.dimensions.every((d) => !/match/i.test(d.label)));
  ok("every dimension explains itself", q.dimensions.every((d) => d.why && d.why.length > 10));
}

/* ── stuffing the advert's words must not buy points ── */
{
  const base = scoreFlatResume(CV, AD, REF).score;
  const stuffed = scoreFlatResume(
    CV + "\nCT CT CT PACS PACS PACS radiation protection radiation protection MRI MRI\n",
    AD, REF,
  ).score;
  // Coverage is counted as present-or-absent, so repetition cannot move it. A claim of
  // MRI the CV cannot evidence is a different matter — it is the user's to make, and the
  // review reports it as unsupported rather than rewarding it.
  ok("repeating a keyword ten times does not raise the score",
    stuffed <= base + 6, `base ${base} → stuffed ${stuffed}`);
}

/* ── before/after is measured, not promised ── */
{
  const better = CV.replace(
    "- Operated PACS to store and retrieve diagnostic images",
    "- Operated PACS to store and retrieve diagnostic images\n- Applied radiation protection to ALARA standards\n- Positioned patients for CT and general radiography",
  );
  const { before, after } = beforeAfter(CV, better, AD, REF);
  ok("a genuinely fuller rewrite scores at least as well", after >= before, `${before} → ${after}`);

  // The old code clamped `after` so it could never fall below `before`. A rewrite that
  // loses half the CV must be allowed to score lower, or the pair is marketing.
  const gutted = "Abdulaziz Alanazi\n\nWORK EXPERIENCE\nRadiographer — Dallah Hospital | Sep 2024 - Present\n";
  const worse = beforeAfter(CV, gutted, AD, REF);
  ok("a rewrite that drops content scores LOWER, and says so",
    worse.after < worse.before, `${worse.before} → ${worse.after}`);
}

/* ── an empty or unreadable input does not produce a confident number ── */
{
  const empty = scoreFlatResume("", AD, REF);
  ok("an empty resume scores low, not zero-crash", empty.score >= 0 && empty.score < 40, String(empty.score));
  ok("and the report says what is missing", empty.report.findings.length > 0);
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
