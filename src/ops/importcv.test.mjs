/**
 * Reading a CV without changing what it says.
 *
 * The fixture is the product owner's own resume shape — a radiology technologist with
 * five positions, eight credentials, mixed date formats and no bullet characters on
 * some lines — because that is the document the whole feature was measured against.
 * A second fixture is Arabic, since half this market writes their CV in it and an
 * English-only parser would report those users as having no career at all.
 *
 * What these tests are really guarding: the parser must never INVENT a job. A stray
 * date line that becomes a fifth employer is worse than a line left in `unread`, so
 * the assertions count roles exactly and check `unread` for what fell out.
 *
 *   node --experimental-strip-types src/ops/importcv.test.mjs
 */

import { parseCv, splitDates, worthImporting } from "../app/lib/importCv.ts";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };
const eq = (n, g, w) => ok(n, JSON.stringify(g) === JSON.stringify(w), `got ${JSON.stringify(g)}, want ${JSON.stringify(w)}`);

/* ── date ranges, in the shapes CVs actually use ── */
{
  eq("month and year, en dash",
    splitDates("Radiographer — Dallah Hospital | Sep 2024 – Present"),
    { start: "Sep 2024", end: "Present", rest: "Radiographer — Dallah Hospital" });

  eq("year to year",
    splitDates("Radiologic Technologist, KFSH | 2020 - 2023"),
    { start: "2020", end: "2023", rest: "Radiologic Technologist, KFSH" });

  eq("Arabic month and 'until now'",
    splitDates("أخصائي أشعة – مستشفى دلة | سبتمبر 2024 حتى الآن"),
    { start: "سبتمبر 2024", end: "Present", rest: "أخصائي أشعة – مستشفى دلة" });

  eq("slashed month",
    splitDates("X-ray Technician at Al Hammadi 03/2018 — 08/2020"),
    { start: "03/2018", end: "08/2020", rest: "X-ray Technician at Al Hammadi" });

  const bare = splitDates("Intern, Riyadh Care 2017");
  eq("a lone year is a start with an unknown end", [bare.start, bare.end], ["2017", ""]);

  eq("no date at all leaves the line alone",
    splitDates("Senior Radiographer"),
    { start: "", end: "", rest: "Senior Radiographer" });
}

/* ── a full English CV ── */
const EN = `
Abdulaziz Alanazi
Riyadh, Saudi Arabia | +966 581 453 234 | alanzi@example.com | linkedin.com/in/abdulaziz

PROFESSIONAL SUMMARY
Radiology technologist with hospital experience across CT, MRI and general radiography.
Committed to radiation safety and accurate patient positioning.

WORK EXPERIENCE
Radiographer, CT — Dallah Hospital, Riyadh | Sep 2024 – Present
- Performed CT examinations following departmental protocols
- Operated PACS to store and retrieve diagnostic images
Positioned patients and applied shielding to ALARA standards
Radiologic Technologist — King Fahad Specialist Hospital | 2020 - 2023
- Covered general radiography and fluoroscopy lists
- Maintained equipment quality-assurance logs

EDUCATION
Bachelor of Radiologic Technology — King Saud University, 2020

CERTIFICATIONS
SCFHS Registration — Saudi Commission for Health Specialties, valid to 2027
Basic Life Support (BLS) — American Heart Association, 2025

SKILLS
Computed Tomography (CT), PACS, Radiation Protection, Patient Positioning
Contrast Administration

LANGUAGES
Arabic, English
`;

{
  const p = parseCv(EN);

  eq("the name is the first line", p.name, "Abdulaziz Alanazi");
  eq("the email is found", p.email, "alanzi@example.com");
  ok("the phone is found", /581\s?453\s?234/.test(p.phone), p.phone);
  ok("linkedin is found", /linkedin\.com\/in\/abdulaziz/.test(p.linkedin), p.linkedin);
  ok("the summary is captured", /Radiology technologist/.test(p.summary));

  eq("two employers, not four", p.roles.length, 2);
  eq("the first role reads correctly",
    [p.roles[0].title, p.roles[0].company, p.roles[0].start, p.roles[0].end],
    ["Radiographer", "CT", "Sep 2024", "Present"]);
  eq("the second role reads correctly",
    [p.roles[1].title, p.roles[1].company, p.roles[1].start, p.roles[1].end],
    ["Radiologic Technologist", "King Fahad Specialist Hospital", "2020", "2023"]);

  eq("bulleted and un-bulleted duties both attach to the job", p.roles[0].bullets.length, 3);
  ok("an un-bulleted duty is not lost",
    p.roles[0].bullets.some((b) => /shielding to ALARA/.test(b)));
  ok("no duty keeps its bullet character", p.roles[0].bullets.every((b) => !/^[-•*]/.test(b)));

  eq("education is one line", p.education.length, 1);
  eq("both credentials are read", p.certifications.length, 2);
  ok("SCFHS is read as written", p.certifications.some((c) => /SCFHS Registration/.test(c)));

  ok("skills are split on commas across two lines", p.skills.length >= 5, JSON.stringify(p.skills));
  ok("and a skill keeps its parenthetical", p.skills.some((s) => /Computed Tomography \(CT\)/.test(s)));
  eq("languages are split", p.languages, ["Arabic", "English"]);

  ok("this is worth importing", worthImporting(p));
  ok("nothing meaningful fell out", p.unread.length === 0, JSON.stringify(p.unread));
}

/* ── an Arabic CV ── */
const AR = `
عبدالعزيز العنزي
الرياض | 0581453234 | alanzi@example.com

الخبرة العملية
أخصائي أشعة – مستشفى دلة | سبتمبر 2024 حتى الآن
- تنفيذ فحوصات الأشعة المقطعية حسب البروتوكولات
- تشغيل نظام PACS لأرشفة الصور
فني أشعة – مستشفى الحمادي | 2018 - 2020
- تغطية قوائم الأشعة العامة

التعليم
بكالوريوس تقنية الأشعة – جامعة الملك سعود، 2020

الشهادات
تصنيف الهيئة السعودية للتخصصات الصحية
دعم الحياة الأساسي

المهارات
الأشعة المقطعية، PACS، الوقاية من الإشعاع

اللغات
العربية، الإنجليزية
`;

{
  const p = parseCv(AR);
  eq("the Arabic name is read", p.name, "عبدالعزيز العنزي");
  eq("two Arabic employers", p.roles.length, 2);
  eq("the Arabic role splits on the dash",
    [p.roles[0].title, p.roles[0].company],
    ["أخصائي أشعة", "مستشفى دلة"]);
  eq("'حتى الآن' becomes Present", p.roles[0].end, "Present");
  eq("Arabic duties attach", p.roles[0].bullets.length, 2);
  eq("Arabic skills split on the Arabic comma", p.skills.length, 3);
  eq("Arabic credentials", p.certifications.length, 2);
  eq("Arabic languages", p.languages.length, 2);
  ok("nothing meaningful fell out of the Arabic CV", p.unread.length === 0, JSON.stringify(p.unread));
}

/* ── the parser must not invent ── */
{
  // A date on its own line, which some templates produce beside a heading. It must not
  // become an employer.
  const p = parseCv("EXPERIENCE\n2020 - 2023\n- Did a thing");
  eq("a bare date range does not become a job", p.roles.length, 0);
  // Both the stray date and the orphan bullet under it are unplaceable, and both are
  // reported. Two entries is the correct answer, not a leak.
  ok("and it is reported rather than swallowed",
    p.unread.length === 2 && p.unread.some((u) => /2020 - 2023/.test(u)), JSON.stringify(p.unread));

  const q = parseCv("SKILLS\nExperienced in the operation of computed tomography scanners across three sites");
  ok("a sentence in the skills section is not shredded into fragments",
    q.skills.length <= 1, JSON.stringify(q.skills));

  const r = parseCv("");
  ok("an empty file is not worth importing", !worthImporting(r));
  eq("and produces no roles", r.roles.length, 0);

  const s = parseCv("EXPERIENCE\nAchieved 30% faster turnaround at 128-slice CT\n");
  ok("a duty mentioning numbers is not read as a phone number", s.phone === "", s.phone);
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
