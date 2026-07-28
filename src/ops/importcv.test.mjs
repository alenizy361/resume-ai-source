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

import { readFileSync } from "node:fs";
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

/* ── the unreadable-file escape hatch ── */

console.log("\n── a scan that cannot be read has somewhere to go ──");

/*
 * `/api/extract` answers 400 rather than 500 on an unreadable file, and its own comment says why:
 * "so the UI can show a 'paste the text instead' hint". The hint shipped and the box did not — and
 * the hint named the JOB DESCRIPTION field, so a user who followed it would have pasted their own CV
 * in as the advert they were applying to and had the tailoring computed against themselves.
 *
 * A phone photo of a CV is the common case in this market, not an edge one, and it is the single case
 * the upload cannot rescue.
 */
{
  const src = readFileSync("app/components/build/ImportPanel.tsx", "utf8");

  ok("neither language sends the user to the job-description box",
    !/job description box/.test(src) && !/مربع وصف الوظيفة/.test(src));
  ok("a paste affordance exists", /id="cv-paste"/.test(src) && /readPasted/.test(src));
  ok("the paste box opens itself when a read fails",
    (src.match(/setShowPaste\(true\)/g) || []).length >= 2);

  /* One parse path for both entries, or the two review screens drift apart — the paste one would
     quietly stop honouring a budget or a tick the upload still honours. */
  ok("file and paste both funnel through one ingest()",
    /ingest\(String\(data\?\.text \|\| ""\), "file"\)/.test(src) && /ingest\(pasted, "paste"\)/.test(src));
  ok("and only one place builds the review state",
    (src.match(/function ingest\(/g) || []).length === 1);

  /* Pasting must cost nothing: no upload, no request, no model call. */
  const paste = src.slice(src.indexOf("function readPasted"), src.indexOf("function readPasted") + 400);
  ok("the paste path makes no network call", !/fetch\(/.test(paste));

  /* A CV can be in either language whatever the interface is set to. */
  ok("the paste box lets the text decide its own direction", /id="cv-paste"[\s\S]{0,400}dir="auto"/.test(src));

  /* And it must refuse a stub rather than opening a review screen with nothing in it. */
  ok("a too-short paste is refused with its own message", /pasteTooShort/.test(src));
}

/* ── reading a scan or a photo, and the promise it costs ── */

console.log("\n── the OCR door is separate, consented, and honest ──");

/*
 * The upload card promises "no AI provider sees the file, and it is not saved". That sentence is why
 * someone uploads a CV carrying their national ID. `/api/ocr` breaks it — the file itself goes to
 * Anthropic — so the only way to add OCR without making the card a lie is a second door the user
 * chooses, with its own sentence, visible before the click.
 *
 * These assertions are about that structure, not about accuracy. Accuracy is `?live=1`'s liveOcr probe.
 */
{
  const panel = readFileSync("app/components/build/ImportPanel.tsx", "utf8");
  const route = readFileSync("app/api/ocr/route.ts", "utf8");
  const lib = readFileSync("app/lib/ocr.ts", "utf8");

  ok("the OCR route exists and is its own route", route.length > 0);
  ok("the text extractor still promises no AI sees the file",
    /no AI provider sees the file/.test(panel) && /لا يراه أي مزوّد ذكاء اصطناعي/.test(panel));
  ok("and the OCR button says outright that this one does, in both languages",
    /sends the file itself to Anthropic/.test(panel) && /يُرسل الملف نفسه إلى Anthropic/.test(panel));

  /* Never automatic. A failed read must not silently trade a promise the user has been given. */
  ok("OCR is never triggered by a failed read",
    !/catch[\s\S]{0,200}readAsImage/.test(panel));
  ok("it needs its own click", /imageInput\.current\?\.click\(\)/.test(panel));
  /* Its own picker: one input with the union of both accepts would let a DOCX reach a vision model
     and bill for the privilege. */
  ok("it has its own file input, not the extractor's", (panel.match(/type="file"/g) || []).length === 2);

  /* One code path, or the probe tests a copy of the route instead of the route. */
  ok("route and health probe share one transcribe()",
    /transcribe\(buf, isPdf/.test(route)
    && /export async function transcribe\(/.test(lib));
  ok("the prompt forbids inventing anything",
    /Never add a job, a date, an employer/.test(lib) && /transcription, not writing/.test(lib));
  ok("and it keeps the original language", /Arabic stays Arabic/.test(lib));

  /* The transcription is the user's employment history — it must never be logged. */
  ok("the route logs tokens and cost, never the text",
    /input: r\.inputTokens/.test(route) && !/r\.text\b[^)]*console/.test(route));

  /* HEIC is what an iPhone shoots. Telling that user "unsupported file" is useless; tell them what
     to do instead. */
  ok("HEIC gets its own instruction rather than a generic refusal",
    /HEIC/.test(route) && /screenshot/.test(route));

  /* Paying per call means a tighter limit than the free text path. */
  ok("the paid route is rate-limited more tightly than the free one",
    /allowShared\(`ocr:\$\{clientIp\(req\)\}`, 6,/.test(route));
  ok("and it caps the upload size", /4 \* 1024 \* 1024/.test(route));

  /* Whatever comes back is still only a suggestion: it lands on the same review screen. */
  ok("an OCR read goes through the same ingest() as an upload", /ingest\(String\(data\?\.text \|\| ""\), "ocr"\)/.test(panel));
}

/* ── a job written over two or three lines, which is how CVs are actually written ── */
{
  /*
   * `looksLikeRoleHeader` asks each line in isolation, so it only ever saw single-line layouts. The
   * two commonest real ones both failed, and one of them FABRICATED:
   *
   *   three lines (title / employer / dates)  →  ZERO positions imported
   *   two lines (title / Employer, City — dates)  →  title "King Faisal Hospital", company "Riyadh"
   *
   * The second is the serious one: the employer written into the job-title field and the city into
   * the employer field, pushed into `profile.roles` as confirmed, pre-ticked content, on a product
   * whose whole claim is that it does not invent facts.
   */
  const three = parseCv([
    "EXPERIENCE",
    "Senior Radiology Technologist",
    "King Faisal Hospital",
    "Jan 2019 - Present",
    "- Performed CT and MRI examinations",
  ].join("\n"));
  eq("a three-line job imports one position",
    three.roles.map((r) => [r.title, r.company, r.start, r.end]),
    [["Senior Radiology Technologist", "King Faisal Hospital", "Jan 2019", "Present"]]);
  ok("and its duty is attached, not stranded", three.roles[0]?.bullets.length === 1,
    JSON.stringify(three.roles[0]?.bullets));

  const two = parseCv([
    "EXPERIENCE",
    "Senior Radiology Technologist",
    "King Faisal Hospital, Riyadh — Jan 2019 - Present",
    "- Performed CT and MRI examinations",
  ].join("\n"));
  eq("a two-line job keeps the title as the title",
    two.roles.map((r) => [r.title, r.company]),
    [["Senior Radiology Technologist", "King Faisal Hospital"]]);
  ok("and the city lands in location, not in the employer field",
    /Riyadh/.test(two.roles[0]?.location || ""), JSON.stringify(two.roles[0]));

  /* Two three-line jobs in a row: the second must not be swallowed as duties of the first. */
  const both = parseCv([
    "EXPERIENCE",
    "Accountant",
    "Alpha Trading",
    "Jan 2020 - Present",
    "- Prepared monthly financial statements",
    "Junior Accountant",
    "Beta Group",
    "Jan 2016 - Dec 2019",
    "- Processed supplier invoices",
  ].join("\n"));
  eq("two three-line jobs both import",
    both.roles.map((r) => r.title), ["Accountant", "Junior Accountant"]);
  ok("and neither absorbs the other's heading as a duty",
    both.roles.every((r) => r.bullets.length === 1), JSON.stringify(both.roles.map((r) => r.bullets)));

  /*
   * The guard, stated as a test: a prose duty above a normal single-line header must STAY a duty.
   * Without the verb test the lookback promoted it to the next job's title — a worse error than the
   * one being fixed, and the reason this whole block is conservative.
   */
  const prose = parseCv([
    "EXPERIENCE",
    "Radiographer — Dallah Hospital | 2023 - Present",
    "Operated CT and MRI scanners for outpatients",
    "Radiologic Technologist — King Fahad Specialist Hospital | 2020 - 2023",
    "- Positioned patients and applied shielding",
  ].join("\n"));
  eq("a prose duty is not promoted to the next job's title",
    prose.roles.map((r) => r.title), ["Radiographer", "Radiologic Technologist"]);
  ok("it stays a duty of the job it was written under",
    /Operated CT/.test((prose.roles[0]?.bullets || []).join(" ")), JSON.stringify(prose.roles[0]?.bullets));

  /* A date line with nothing above it that reads like a job is still unplaced, not invented. */
  const orphan = parseCv(["EXPERIENCE", "Jan 2019 - Present"].join("\n"));
  ok("a bare date line invents no job", orphan.roles.length === 0, JSON.stringify(orphan.roles));
}

/* ── the three ways the FIRST lookback fabricated, each pinned ── */
{
  /*
   * 1. A duty in the PRESENT tense, or an Arabic masdar, above a self-sufficient dated line. The
   *    first guard was a past-tense denylist, so neither was caught and both were promoted to the
   *    next job's title — while that job's real title was demoted into the employer field. The
   *    pre-fix parser got both of these RIGHT, which is what made it a regression rather than a
   *    gap.
   */
  const present = parseCv([
    "WORK EXPERIENCE",
    "Radiographer - Dallah Hospital | Sep 2024 - Present",
    "Responsible for daily radiography operations",
    "Staff Nurse - Green Clinic | 2018 - 2020",
  ].join("\n"));
  /* Asserted on the ROLE COUNT and on where the duty landed, not on the split of the title —
     `splitRole` separates on `|`, an em-dash and ` at `, and NOT on a plain spaced hyphen, so
     "Radiographer - Dallah Hospital" stays one string. That is pre-existing behaviour (the
     verifier's own before/after shows the old parser doing the same) and a separate gap, recorded
     in docs/known-issues.md rather than changed here on the same night the lookback landed. */
  eq("a present-tense duty is not promoted to a job title",
    present.roles.map((r) => r.title),
    ["Radiographer - Dallah Hospital", "Staff Nurse - Green Clinic"]);
  ok("and it produced exactly two jobs, not three", present.roles.length === 2, JSON.stringify(present.roles.map((r) => r.title)));
  ok("it stays a duty of the job above it",
    /Responsible for daily/.test((present.roles[0]?.bullets || []).join(" ")),
    JSON.stringify(present.roles[0]?.bullets));

  const masdar = parseCv([
    "الخبرة العملية",
    "أخصائي أشعة – مستشفى دلة | سبتمبر 2024 حتى الآن",
    "إدارة قسم الأشعة والإشراف على الفنيين",
    "محاسب – شركة الراجحي | يناير 2019 - ديسمبر 2021",
  ].join("\n"));
  eq("an Arabic masdar duty is not promoted either",
    masdar.roles.map((r) => r.title), ["أخصائي أشعة", "محاسب"]);
  eq("and the employers stay employers",
    masdar.roles.map((r) => r.company), ["مستشفى دلة", "شركة الراجحي"]);

  /*
   * 2. A job title whose first word ends in `-ed` — an ADJECTIVE, not a verb. The denylist threw
   *    these away and wrote the EMPLOYER NAME into the title field, which is verbatim the defect
   *    the lookback was added to fix, still live for a large slice of healthcare, accounting and
   *    engineering CVs.
   */
  for (const title of [
    "Registered Nurse", "Licensed Practical Nurse", "Advanced Practice Nurse",
    "Certified Public Accountant", "Chartered Accountant", "Qualified Teacher",
    "Embedded Systems Engineer", "Set Designer",
  ]) {
    const r = parseCv(["WORK EXPERIENCE", title, "King Faisal Hospital", "Mar 2020 - Present"].join("\n"));
    eq(`"${title}" survives as the job title`,
      r.roles.map((x) => [x.title, x.company]), [[title, "King Faisal Hospital"]]);
  }

  /*
   * 3. The splice bug. `used` was counted against a FILTERED array and applied to the unfiltered
   *    buffer, so an over-long employer was deleted outright — absent from roles, bullets AND
   *    `unread` — while the title was duplicated as a fabricated duty on the job above. Silent loss
   *    is the outcome this file's header calls the worst.
   */
  const longEmployer = "King Faisal Specialist Hospital and Research Centre, Riyadh Region";
  const spliced = parseCv([
    "WORK EXPERIENCE",
    "Radiographer — Dallah Hospital | 2010 - 2018",
    "- Performed CT scans",
    "Senior Radiology Technologist",
    longEmployer,
    "Jan 2019 - Present",
  ].join("\n"));
  const everywhere = JSON.stringify(spliced);
  ok("a long employer line is never silently deleted", everywhere.includes("Research Centre"), everywhere.slice(0, 200));
  ok("and the title is not duplicated as a duty of the job above",
    !(spliced.roles[0]?.bullets || []).some((b) => /Senior Radiology Technologist/.test(b)),
    JSON.stringify(spliced.roles[0]?.bullets));

  /* And the two layouts the lookback exists for still work. */
  const two = parseCv([
    "EXPERIENCE",
    "Senior Radiology Technologist",
    "King Faisal Hospital, Riyadh — Jan 2019 - Present",
  ].join("\n"));
  eq("the comma layout still keeps the title as the title",
    two.roles.map((r) => [r.title, r.company]), [["Senior Radiology Technologist", "King Faisal Hospital"]]);
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
