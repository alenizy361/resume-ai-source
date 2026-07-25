/**
 * The review's honesty rules, asserted.
 *
 * The shipped product printed one number over every CV and called it an "ATS
 * match score" — even when the user had never pasted a job advert. There was
 * nothing to match against, so the label was a lie the code told on the user's
 * behalf, and the number could not be questioned because nothing explained it.
 *
 * `reviewChecks` replaces that with two reports the data chooses between, and
 * these tests exist to hold the four promises that make the replacement worth
 * trusting:
 *
 *   1. No job description ⇒ the report is a QUALITY report, and the word "match"
 *      appears nowhere in its dimension labels. `reviewMatch` refuses to run
 *      without an advert at all.
 *   2. Every dimension carries a non-empty `why`. A deduction with no explanation
 *      is not allowed to exist — asserted by looping over every dimension of
 *      every report built here, not by spot-checking one.
 *   3. A requirement the user's confirmed evidence does not support comes back in
 *      `unsupported` and never in `supported`, and there is no function anywhere
 *      in the module that would write it onto the CV.
 *   4. Repetition earns nothing. Stuffing a term into the summary, the skills
 *      list and three bullets produces a finding and cannot raise keyword
 *      alignment by a point.
 *
 * Scores are also asserted to be deterministic: the expiry check takes its
 * reference date as an argument, so this file passes today and in eight months.
 *
 *   node --experimental-strip-types src/ops/reviewchecks.test.mjs
 */

import { EMPTY_BUILDER, newItem } from "../app/lib/builderDoc.ts";
import { upsertRole, rolesToLines } from "../app/lib/resumeDoc.ts";
import {
  reviewQuality, reviewMatch, parseJobAd, review,
} from "../app/lib/reviewChecks.ts";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };
const eq = (n, g, w) => ok(n, JSON.stringify(g) === JSON.stringify(w), `got ${JSON.stringify(g)}, want ${JSON.stringify(w)}`);

/** The day the review is being run. Passed in, never read from the clock. */
const TODAY = "2026-07-24";

const base = () => ({
  ...EMPTY_BUILDER,
  profile: { ...EMPTY_BUILDER.profile, roles: [], extras: [], wovenLines: [] },
  personal: { ...EMPTY_BUILDER.personal },
  target: { ...EMPTY_BUILDER.target },
  credentials: [],
  languages: [],
  suggestions: [],
});

/** A CV with nothing missing — the shape the scores are calibrated against. */
function complete() {
  const st = base();
  st.personal = {
    fullName: "Abdulaziz Alenzi", professionalTitle: "Radiology Technologist",
    city: "Riyadh", country: "Saudi Arabia", phone: "0581453234",
    email: "abdulaziz@example.com", linkedin: "https://linkedin.com/in/abdulaziz", portfolio: "",
  };
  st.profile.name = "Abdulaziz Alenzi";
  st.profile.role = "Radiology Technologist";
  st.profile.contact = "0581453234 | abdulaziz@example.com | Riyadh";
  st.profile.summary = "Radiology technologist with three years in diagnostic imaging across CT and general radiography.";
  st.profile.skills = "General X-ray، Computed Tomography، PACS، Radiation Safety، Patient Positioning";
  st.profile.education = "Bachelor of Radiologic Technology — King Saud University · 2022";
  st.profile.roles = upsertRole([], {
    id: "r1", title: "Radiology Technologist", company: "Dallah Hospital", location: "Riyadh",
    department: "CT", start: "Sep 2024", end: "Present",
    bullets: [
      "Operated CT and general X-ray systems for 40 patients daily to approved clinical protocols",
      "Managed imaging studies and documentation through PACS across three shifts",
      "Trained 4 new technologists on radiation safety and patient positioning",
    ],
  });
  st.profile.roles = upsertRole(st.profile.roles, {
    id: "r2", title: "Radiology Intern", company: "NGHA", location: "Riyadh",
    start: "Jan 2022", end: "Aug 2024",
    bullets: [
      "Assisted senior technologists during 200 fluoroscopy and mobile radiography examinations",
      "Logged 12 equipment quality-control checks each morning against hospital standards",
    ],
  });
  st.profile.wovenLines = rolesToLines(st.profile.roles);
  st.credentials = [{
    id: "c1", kind: "certification", title: "Basic Life Support (BLS)",
    issuer: "National CPR Foundation", issueDate: "2026-05", expiryDate: "2028-05",
    status: "confirmed", source: "user",
  }];
  st.profile.certifications = "Basic Life Support (BLS) — National CPR Foundation — valid to 2028-05";
  st.languages = [
    { id: "l1", name: "Arabic", level: "native", status: "confirmed", source: "user" },
    { id: "l2", name: "English", level: "professional", status: "confirmed", source: "user" },
  ];
  st.profile.languages = "Arabic (native), English (professional)";
  return st;
}

const JOB_AD = `Job Title: Radiology Technologist
Dallah Medical Group is hiring for its diagnostic imaging department in Riyadh.

Requirements:
- General X-ray and Computed Tomography experience
- PACS documentation
- Radiation safety awareness

Preferred:
- MRI experience
- Mammography

Certifications:
- BLS
- Radiation Protection Officer (RSO)
`;

const has = (findings, id) => findings.some((f) => f.id === id || f.id.startsWith(`${id}:`));
const find = (findings, id) => findings.find((f) => f.id === id || f.id.startsWith(`${id}:`));
const criticals = (r) => r.findings.filter((f) => f.severity === "critical");
const dim = (r, id) => r.dimensions.find((d) => d.id === id);

/* Every report this file builds goes in here, and the `why` rule is asserted
 * over all of them at the end. A new fixture is covered automatically. */
const allReports = [];
const track = (r) => { allReports.push(r); return r; };

/* ══════════ an empty CV scores low, and says why ══════════ */
{
  const r = track(reviewQuality(base(), TODAY));
  ok("an empty CV is not flattered", r.score <= 20, `score ${r.score}`);
  ok("an empty CV has critical findings", criticals(r).length >= 4, `${criticals(r).length} criticals`);
  ok("missing contact details is critical", has(criticals(r), "missing-contact"));
  ok("an empty experience section is critical", has(criticals(r), "empty-experience"));
  ok("an empty skills section is critical", has(criticals(r), "empty-skills"));
  ok("an empty education section is critical", has(criticals(r), "empty-education"));
  ok("a zero dimension still explains itself",
    r.dimensions.every((d) => d.why.length > 20), JSON.stringify(r.dimensions.map((d) => d.why)));
}

/* ══════════ a complete CV scores well, with nothing critical ══════════ */
{
  const r = track(reviewQuality(complete(), TODAY));
  ok("a complete CV scores well", r.score >= 70, `score ${r.score}`);
  eq("and has no critical findings", criticals(r).map((f) => f.id), []);
  eq("six dimensions, as promised", r.dimensions.length, 6);
  const total = r.dimensions.reduce((n, d) => n + d.weight, 0);
  ok("the weights are a real weighted average", Math.abs(total - 1) < 1e-9, `sum ${total}`);
}

/* ══════════ RULE 1: no job description, no match score ══════════ */
{
  const st = complete();
  eq("no advert means the target carries no advert", st.target.jobAdText, "");

  const r = track(reviewQuality(st, TODAY));
  eq("with no job description the report is a quality report", r.kind, "quality");

  const labels = r.dimensions.map((d) => d.label);
  ok("no dimension label says \"match\" when there is nothing to match against",
    !labels.some((l) => /match/i.test(l)), labels.join(" | "));
  ok("nor does any dimension id", !r.dimensions.some((d) => /match/i.test(d.id)));

  // The data chooses the report, so a caller cannot ask for the wrong one.
  eq("review() picks quality when the document has no advert", review(st, TODAY).kind, "quality");
  st.target = { ...st.target, jobAdText: JOB_AD };
  eq("review() picks match once an advert exists", review(st, TODAY).kind, "match");

  let threw = "";
  try { reviewMatch(complete(), "   ", TODAY); } catch (e) { threw = e.message; }
  ok("reviewMatch refuses to invent a match from no advert", /job description|reviewQuality/i.test(threw), threw);
}

/* ══════════ the advert, parsed ══════════ */
{
  const jd = parseJobAd(JOB_AD);
  eq("the job title is read from the advert", jd.title, "Radiology Technologist");
  ok("requirements are found", jd.required.length >= 3, JSON.stringify(jd.required));
  ok("preferred extras are kept apart from requirements",
    jd.preferred.some((p) => /MRI/i.test(p)) && !jd.required.some((p) => /MRI/i.test(p)), JSON.stringify(jd.preferred));
  ok("credentials are picked out", jd.credentials.some((c) => /BLS/i.test(c)), JSON.stringify(jd.credentials));
  ok("named tools are recognised", jd.tools.some((t) => /PACS/i.test(t)), JSON.stringify(jd.tools));
  ok("keywords come back in the advert's own spelling", jd.keywords.some((k) => /PACS|Radiology/i.test(k)), JSON.stringify(jd.keywords));
  eq("parsing is deterministic", parseJobAd(JOB_AD), jd);
}

/* ══════════ RULE 3: three honest groups, and no way to fake the third ══════════ */
{
  const st = complete();
  // The user has an RSO certificate confirmed, but it was never written onto the
  // CV — that is the "missingFromCv" case, and it is the cheap win.
  st.credentials = [...st.credentials, {
    id: "c2", kind: "certification", title: "Radiation Protection Officer (RSO)",
    issuer: "SCFHS", issueDate: "2025-03", expiryDate: "2029-03",
    status: "confirmed", source: "user",
  }];
  // MRI is only ever a suggestion. A suggestion is not evidence.
  st.suggestions = [newItem({ section: "skills", type: "skill", text: "Magnetic Resonance Imaging" })];

  const r = track(reviewMatch(st, JOB_AD, TODAY));
  eq("with a job description the report is a match report", r.kind, "match");
  eq("six dimensions here too", r.dimensions.length, 6);

  ok("what the CV evidences is supported",
    r.supported.some((s) => /Computed Tomography/i.test(s)), JSON.stringify(r.supported));
  ok("what the user has but the CV omits is missingFromCv",
    r.missingFromCv.some((s) => /Radiation Protection Officer/i.test(s)), JSON.stringify(r.missingFromCv));
  ok("what nothing supports is unsupported",
    r.unsupported.some((s) => /MRI/i.test(s)), JSON.stringify(r.unsupported));
  ok("an unsupported requirement is NEVER also supported",
    !r.supported.some((s) => /MRI|Mammography/i.test(s)), JSON.stringify(r.supported));
  ok("a pending suggestion is not treated as evidence",
    !r.supported.some((s) => /MRI/i.test(s)) && !r.missingFromCv.some((s) => /MRI/i.test(s)));
  eq("the three groups never overlap",
    r.supported.filter((s) => r.missingFromCv.includes(s) || r.unsupported.includes(s)), []);

  const gap = find(r.findings, "unsupported-requirements");
  ok("the gap is reported, not offered", Boolean(gap));
  ok("and the wording says the evidence is not there",
    /no evidence|nothing you have confirmed/i.test(`${gap.title} ${gap.detail}`), gap && gap.detail);
  ok("it explicitly refuses to add it", /will not add/i.test(gap.detail), gap && gap.detail);

  const cheap = find(r.findings, "missing-from-cv");
  ok("the cheap win is surfaced", Boolean(cheap) && /confirmed/i.test(cheap.detail));

  ok("required coverage names the count, not just a number",
    /\d+ of \d+ are on your CV/.test(dim(r, "required-coverage").why), dim(r, "required-coverage").why);
  eq("the title aligns exactly", dim(r, "title-alignment").score, 100);
}

/* ══════════ RULE 4: repetition earns nothing ══════════ */
{
  const baseline = complete();
  const stuffed = complete();
  // Same CV, same facts — the term "PACS" is simply written everywhere.
  stuffed.profile.summary = `${stuffed.profile.summary} Daily PACS user.`;
  stuffed.profile.roles = stuffed.profile.roles.map((r) => ({
    ...r, bullets: r.bullets.map((b) => (/PACS/.test(b) ? b : `${b} via PACS`)),
  }));
  stuffed.profile.wovenLines = rolesToLines(stuffed.profile.roles);

  const a = track(reviewMatch(baseline, JOB_AD, TODAY));
  const b = track(reviewMatch(stuffed, JOB_AD, TODAY));

  const stuff = find(b.findings, "keyword-stuffing");
  ok("keyword stuffing is reported", Boolean(stuff), JSON.stringify(b.findings.map((f) => f.id)));
  eq("as a suggestion, not an error", stuff.severity, "recommended");
  ok("the finding counts the repetitions", /repeated \d+ times/.test(stuff.title), stuff && stuff.title);
  ok("and says why repetition is pointless",
    /ATS does not reward repetition/i.test(stuff.detail), stuff && stuff.detail);
  ok("the clean CV is not accused of stuffing", !has(a.findings, "keyword-stuffing"));

  const before = dim(a, "keyword-alignment").score;
  const after = dim(b, "keyword-alignment").score;
  ok("stuffing does not raise keyword alignment", after <= before, `${before} → ${after}`);
  eq("presence is counted once, so the score is unchanged", after, before);
  ok("the match headline does not go up either", b.score <= a.score, `${a.score} → ${b.score}`);

  // The quality report is where padding actually costs something.
  const qa = track(reviewQuality(baseline, TODAY));
  const qb = track(reviewQuality(stuffed, TODAY));
  ok("language quality pays for the padding",
    dim(qb, "language").score < dim(qa, "language").score,
    `${dim(qa, "language").score} → ${dim(qb, "language").score}`);
  ok("and the quality headline does not rise from repetition", qb.score <= qa.score, `${qa.score} → ${qb.score}`);
}

/* ══════════ pending suggestions block an export ══════════ */
{
  const st = complete();
  st.suggestions = [
    newItem({ section: "skills", type: "skill", text: "Magnetic Resonance Imaging" }),
    newItem({ section: "credentials", type: "credential", text: "SCFHS Professional Registration" }),
  ];
  const r = track(reviewQuality(st, TODAY));
  const f = find(criticals(r), "pending-suggestions");
  ok("unconfirmed suggestions are a critical finding", Boolean(f), JSON.stringify(r.findings.map((x) => x.id)));
  ok("it counts them", /2 pending/.test(f.title), f && f.title);
  ok("and promises they will not be added for you", /not be added/i.test(f.detail), f && f.detail);
  eq("it points at the review section", f.section, "review");
}

/* ══════════ credential expiry, judged against a date we are given ══════════ */
{
  const valid = reviewQuality(complete(), TODAY);
  track(valid);
  ok("a credential valid to 2028 is not flagged", !has(valid.findings, "expired-credential"));

  const st = complete();
  st.credentials = [{ ...st.credentials[0], expiryDate: "2025-01" }];
  const r = track(reviewQuality(st, TODAY));
  const f = find(criticals(r), "expired-credential");
  ok("an expired credential is critical", Boolean(f), JSON.stringify(r.findings.map((x) => x.id)));
  ok("the finding names it and its date", /Basic Life Support/.test(f.title) && /2025-01/.test(f.title), f && f.title);

  // No reference date means no claim: the module never reads the clock, so it
  // cannot know that "2025-01" is in the past.
  ok("with no reference date nothing is called expired",
    !has(reviewQuality(st, "").findings, "expired-credential"));

  // A month-only expiry means the END of that month, not the 1st.
  const edge = { ...st, credentials: [{ ...st.credentials[0], expiryDate: "2026-07" }] };
  ok("a credential expiring this month is still valid", !has(reviewQuality(edge, TODAY).findings, "expired-credential"));
  ok("but last month's is not", has(reviewQuality({ ...st, credentials: [{ ...st.credentials[0], expiryDate: "2026-06" }] }, TODAY).findings, "expired-credential"));

  // A suggested credential is not a claim, so it cannot be an expired claim.
  ok("a merely suggested credential is not flagged as expired",
    !has(reviewQuality({ ...st, credentials: [{ ...st.credentials[0], expiryDate: "2020-01", status: "suggested" }] }, TODAY).findings, "expired-credential"));
}

/* ══════════ missing dates break the parse, so they are critical ══════════ */
{
  const st = complete();
  st.profile.roles = st.profile.roles.map((r, i) => (i === 0 ? { ...r, start: "" } : r));
  const r = track(reviewQuality(st, TODAY));
  ok("a role without dates is critical", has(criticals(r), "missing-dates"));
  ok("ATS-safe structure pays for it", dim(r, "ats-structure").score <= 70, `${dim(r, "ats-structure").score}`);
  ok("and the deduction is explained", /start date/i.test(dim(r, "ats-structure").why), dim(r, "ats-structure").why);
}

/* ══════════ weak openers, in both languages the product ships ══════════ */
{
  const st = complete();
  st.profile.roles = [
    { ...st.profile.roles[0], bullets: [
      "Responsible for operating the CT scanner during evening shifts at the hospital",
      "مسؤول عن تشغيل أجهزة الأشعة المقطعية في قسم الطوارئ",
      "قمت بتدريب الفنيين الجدد على بروتوكولات السلامة الإشعاعية",
      "Operated CT and general X-ray systems for 40 patients daily to approved protocols",
    ] },
  ];
  st.profile.wovenLines = rolesToLines(st.profile.roles);
  const r = track(reviewQuality(st, TODAY));
  const f = find(r.findings, "weak-openers");
  ok("weak openers are caught", Boolean(f), JSON.stringify(r.findings.map((x) => x.id)));
  ok("all three of them", /3 bullets/.test(f.title), f && f.title);
  ok("the English one is named", /Responsible for/.test(f.detail), f && f.detail);
  ok("the Arabic ones are named too", /مسؤول عن|قمت/.test(f.detail), f && f.detail);
  eq("it is a suggestion, not an error", f.severity, "recommended");
  ok("specificity is docked for them", dim(r, "specificity").score < 100);
  ok("and it says so", /weak verb/i.test(dim(r, "specificity").why), dim(r, "specificity").why);
}

/* ══════════ the rest of the checklist ══════════ */
{
  const st = complete();
  st.profile.skills = "CT Scan، ct-scan، PACS";
  const r = track(reviewQuality(st, TODAY));
  const f = find(r.findings, "duplicate-skills");
  ok("two spellings of one skill are caught", Boolean(f), JSON.stringify(r.findings.map((x) => x.id)));
  eq("as a suggestion", f.severity, "recommended");
}
{
  const st = complete();
  const duty = "Performed diagnostic X-ray and CT examinations to approved clinical protocols";
  st.profile.roles = [
    { ...st.profile.roles[0], bullets: [duty, "Managed imaging studies and documentation through PACS"] },
    { ...st.profile.roles[1], bullets: [duty, "Logged 12 equipment quality-control checks each morning"] },
  ];
  st.profile.wovenLines = rolesToLines(st.profile.roles);
  const r = track(reviewQuality(st, TODAY));
  ok("the same duty under two roles is caught", has(r.findings, "repeated-duties"), JSON.stringify(r.findings.map((x) => x.id)));
}
{
  const st = complete();
  st.profile.roles = [{ ...st.profile.roles[0], bullets: [
    "Operated CT and general X-ray equipment across the emergency and outpatient departments while coordinating daily with radiologists, referring physicians, porters and the reception team in order to keep the appointment list moving on time throughout every evening shift",
  ] }];
  st.profile.wovenLines = rolesToLines(st.profile.roles);
  const r = track(reviewQuality(st, TODAY));
  ok("a paragraph pretending to be a bullet is caught", has(r.findings, "long-bullets"));
  ok("a role with one bullet is caught", has(r.findings, "thin-role"));
  ok("readability pays for the long line", dim(r, "readability").score < 100);
  ok("and the deduction is explained", /past 30 words/.test(dim(r, "readability").why), dim(r, "readability").why);
}
{
  const st = complete();
  st.personal = { ...st.personal, linkedin: "" };
  st.profile.summary = "";
  st.profile.contact = "0581453234 | abdulaziz@example.com";
  const r = track(reviewQuality(st, TODAY));
  ok("a missing LinkedIn is optional, never critical",
    find(r.findings, "no-linkedin")?.severity === "optional");
  ok("a missing summary is optional too", find(r.findings, "no-summary")?.severity === "optional");
  eq("neither is treated as an error", criticals(r).map((f) => f.id), []);
}
{
  const st = complete();
  // The 2022-2024 role carries four bullets; the current one carries two.
  st.profile.roles = [
    { ...st.profile.roles[0], bullets: ["Operated CT systems for 40 patients daily", "Managed studies through PACS"] },
    { ...st.profile.roles[1], bullets: [
      "Assisted with 200 fluoroscopy examinations",
      "Logged 12 quality-control checks each morning",
      "Prepared 30 contrast studies each week under supervision",
      "Supported 3 mobile radiography rounds each day",
    ] },
  ];
  st.profile.wovenLines = rolesToLines(st.profile.roles);
  const r = track(reviewQuality(st, TODAY));
  ok("an older role heavier than the current one is worth mentioning",
    find(r.findings, "past-role-heavier")?.severity === "optional", JSON.stringify(r.findings.map((x) => x.id)));
}

/* ══════════ RULE 5: the same input always scores the same ══════════ */
{
  const st = complete();
  st.target = { ...st.target, jobAdText: JOB_AD };
  eq("the quality report is deterministic",
    reviewQuality(st, TODAY), reviewQuality(complete(), TODAY));
  eq("the match report is deterministic",
    reviewMatch(st, JOB_AD, TODAY), reviewMatch(st, JOB_AD, TODAY));
  const src = "" + reviewQuality + reviewMatch + parseJobAd;
  ok("no clock and no randomness in the scoring path",
    !/Math\.random|Date\.now|new Date/.test(src));
}

/* ══════════ RULE 2: every deduction has a reason, everywhere ══════════ */
{
  ok("enough reports were built to make this exhaustive check mean something",
    allReports.length >= 12, `${allReports.length} reports`);
  const naked = [];
  for (const r of allReports) {
    for (const d of r.dimensions) {
      if (!d.why || !d.why.trim()) naked.push(`${r.kind}/${d.id}`);
      if (typeof d.score !== "number" || d.score < 0 || d.score > 100) naked.push(`${r.kind}/${d.id} score ${d.score}`);
      if (!d.label || !d.label.trim()) naked.push(`${r.kind}/${d.id} label`);
    }
  }
  eq("every dimension of every report explains itself", naked, []);

  const dims = allReports.flatMap((r) => r.dimensions);
  ok("that is a lot of dimensions checked", dims.length >= 72, `${dims.length}`);
  ok("no explanation is a placeholder", dims.every((d) => d.why.length >= 20));

  const findings = allReports.flatMap((r) => r.findings);
  ok("every finding is actionable and points somewhere",
    findings.every((f) => f.id && f.section && f.title.trim() && f.detail.trim()));
  ok("no finding scolds the user",
    !findings.some((f) => /you failed|you should have|bad|lazy|sloppy/i.test(`${f.title} ${f.detail}`)));
  ok("every severity is one of the three",
    findings.every((f) => ["critical", "recommended", "optional"].includes(f.severity)));
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
