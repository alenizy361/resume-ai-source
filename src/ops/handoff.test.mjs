/**
 * The optimizer's output reaches the builder as a document, not as a dead string.
 *
 * `/optimize` used to end at two download buttons: a score, a rewritten paragraph and no
 * way to edit a single section, because the flow never produced sections. These tests
 * cover the two decisions in the hand-off that are easy to get wrong and impossible to
 * see: WHICH text crosses over, and what state it arrives in.
 *
 *   node --experimental-strip-types src/ops/handoff.test.mjs
 */

import { stateFromText } from "../app/lib/scoreText.ts";
import { assembleResume } from "../app/lib/mergeProfile.ts";
import { hasUnconfirmed } from "../app/lib/builderDoc.ts";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };
const eq = (n, g, w) => ok(n, JSON.stringify(g) === JSON.stringify(w), `got ${JSON.stringify(g)}, want ${JSON.stringify(w)}`);

const UPLOADED = `Abdulaziz Alanazi
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

/* ── what crosses over arrives as the user's own confirmed facts ── */
{
  const st = stateFromText(UPLOADED, "Senior Radiographer. Required: CT, PACS.");

  eq("the employer crosses", st.profile.roles[0].company, "Dallah Hospital");
  eq("with its dates", [st.profile.roles[0].start, st.profile.roles[0].end], ["Sep 2024", "Present"]);
  eq("both duties cross", st.profile.roles[0].bullets.length, 2);
  ok("education crosses", st.profile.education.includes("King Saud University"));
  ok("skills cross", st.profile.skills.includes("PACS"));
  ok("contact crosses", st.profile.contact.includes("a@example.com"));
  ok("the advert crosses, so the builder can score a match", st.target.jobAdText.includes("PACS"));

  // A resume the user already had is theirs. Arriving as pending suggestions would make
  // them re-approve their own employer, and would leave the review reporting
  // "unconfirmed AI content" about facts no AI wrote.
  ok("nothing arrives as an unconfirmed suggestion", !hasUnconfirmed(st));
  eq("and the suggestion bag is empty", st.suggestions.length, 0);

  // The invariant still holds from the other side: what is in `profile` renders.
  const cv = assembleResume(st.profile, false);
  ok("so the imported CV renders immediately", cv.includes("Dallah Hospital") && cv.includes("PACS"));
}

/* ── the model's rewrite is NOT what crosses by default ── */
{
  // This is the rule the callers implement: they pass `resume` (the upload), not
  // `result.optimizedResume`. The test states why, so a future edit that "helpfully"
  // switches to the rewrite has to argue with it.
  //
  // A rewrite is the model's phrasing of the user's facts. The builder's contract is that
  // model wording arrives as a suggestion to accept; installing it as confirmed content
  // would launder it into fact — the exact failure the whole suggestion bag exists to
  // prevent.
  const rewritten = UPLOADED.replace(
    "Performed CT examinations following departmental protocols",
    "Delivered high-throughput CT imaging aligned to departmental protocols",
  );
  const fromUpload = stateFromText(UPLOADED);
  const fromRewrite = stateFromText(rewritten);
  ok("the two texts genuinely differ",
    fromUpload.profile.roles[0].bullets[0] !== fromRewrite.profile.roles[0].bullets[0]);
  ok("the upload keeps the user's own words",
    fromUpload.profile.roles[0].bullets[0].startsWith("Performed CT"));
}

/* ── an unusable input hands over nothing rather than an empty document ── */
{
  const empty = stateFromText("");
  eq("no roles", empty.profile.roles.length, 0);
  eq("no name", empty.profile.name, "");
  // The callers guard on this: `if (!text) return;` — a hand-off of nothing would
  // overwrite a real draft with a blank one.
  ok("so callers can detect there is nothing to send", !empty.profile.roles.length && !empty.profile.name);
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
