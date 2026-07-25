/**
 * Reading a CV the user already has, so they do not retype their own career.
 *
 * `/api/extract` turns a PDF or DOCX into plain text. This turns that text into the
 * structure the builder speaks: roles with dates and bullets, skills, education,
 * credentials, and the contact block. No model is involved — a parser that guesses
 * wrong is correctable in a form field, whereas a model that "tidies" an employer
 * name while parsing has quietly changed a fact, and the user has no way to tell.
 *
 * Everything here is deliberately CONSERVATIVE. A line it cannot place is counted in
 * `unread` and reported, rather than being forced into whichever section is nearest.
 * The number of lines this parser silently loses is the number of things the user will
 * discover missing at the interview.
 *
 * Nothing in this file may reach for `process.env` or `next/*`: `ops/importcv.test.mjs`
 * loads it in plain Node with `--experimental-strip-types`.
 */

export interface ParsedRole {
  title: string;
  company: string;
  location: string;
  start: string;
  end: string;
  bullets: string[];
}

export interface ParsedCv {
  name: string;
  email: string;
  phone: string;
  linkedin: string;
  roles: ParsedRole[];
  skills: string[];
  /** Kept as lines: an education entry is one line on a CV and edits as one. */
  education: string[];
  certifications: string[];
  languages: string[];
  summary: string;
  /** Lines the parser could not place. Reported, never hidden. */
  unread: string[];
}

/* ───────────────────────── section detection ───────────────────────── */

/**
 * Headings in both languages, including the ones this market actually writes.
 *
 * Matched on a whole line only, and only when the line is short: "EXPERIENCE" is a
 * heading, "Experience with CT and MRI scanners" is a duty, and a substring test
 * cannot tell them apart.
 */
const HEADINGS: Array<{ key: Section; re: RegExp }> = [
  { key: "summary", re: /^(professional\s+)?(summary|profile|objective|about)\b|^(الملخص|نبذة|الهدف|الملف)/i },
  { key: "experience", re: /^(work\s+|professional\s+|employment\s+)?(experience|history|employment)\b|^(الخبرة|الخبرات|التاريخ الوظيفي|الخبرة العملية|الخبرات العملية)/i },
  { key: "education", re: /^(education|academic|qualifications)\b|^(التعليم|المؤهلات|المؤهل العلمي)/i },
  { key: "skills", re: /^(skills|technical skills|core competencies|competencies)\b|^(المهارات|الكفاءات)/i },
  { key: "certifications", re: /^(certifications?|licen[cs]es?|credentials|courses|training)\b|^(الشهادات|الرخص|الدورات|التدريب)/i },
  { key: "languages", re: /^(languages)\b|^(اللغات)/i },
];

type Section = "summary" | "experience" | "education" | "skills" | "certifications" | "languages" | "header";

function headingFor(line: string): Section | null {
  const bare = line.replace(/[:：]\s*$/, "").trim();
  // A heading is a label, not a sentence. Six words is generous for "PROFESSIONAL
  // EXPERIENCE & EMPLOYMENT HISTORY" and still excludes a duty that starts with one.
  if (bare.length > 48 || bare.split(/\s+/).length > 6) return null;
  for (const h of HEADINGS) if (h.re.test(bare)) return h.key;
  return null;
}

/* ───────────────────────── dates ───────────────────────── */

const MONTHS =
  "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december|" +
  "يناير|فبراير|مارس|أبريل|ابريل|مايو|يونيو|يوليو|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نوفمبر|ديسمبر";

const NOW = "present|current|now|to date|till date|الآن|حالياً|حاليا|حتى الآن";

/** "Sep 2024", "09/2024", "2024" — one endpoint of a range. */
const POINT = `(?:(?:${MONTHS})[a-z]*\\.?\\s*,?\\s*)?(?:\\d{1,2}[/.-])?(?:19|20)\\d{2}`;
const RANGE = new RegExp(`(${POINT})\\s*(?:–|—|-|to|until|إلى|الى|حتى)\\s*(${POINT}|${NOW})`, "i");
const SINGLE_NOW = new RegExp(`(${POINT})\\s*(?:–|—|-|to|until|إلى|الى|حتى)?\\s*(?:${NOW})`, "i");

/**
 * Pull a date range out of a role header and return the header without it.
 *
 * The dates are removed rather than left in place because `roleHeader` composes them
 * back in its own format — leaving them would print "Radiographer, Dallah | Sep 2024 –
 * Present | Sep 2024 – Present", which is exactly what the flat-text builder used to do.
 */
export function splitDates(line: string): { start: string; end: string; rest: string } {
  const m = RANGE.exec(line);
  if (m) {
    const end = new RegExp(`^(?:${NOW})$`, "i").test(m[2].trim()) ? "Present" : m[2].trim();
    return { start: m[1].trim(), end, rest: strip(line, m[0]) };
  }
  const n = SINGLE_NOW.exec(line);
  if (n) return { start: n[1].trim(), end: "Present", rest: strip(line, n[0]) };
  // A bare year with nothing after it is a start date we cannot pair; taking it as the
  // start and leaving the end blank is honest, and the form shows the blank.
  const one = new RegExp(POINT, "i").exec(line);
  if (one) return { start: one[0].trim(), end: "", rest: strip(line, one[0]) };
  return { start: "", end: "", rest: line.trim() };
}

/** Remove a matched span and the punctuation that was holding it in place. */
function strip(line: string, found: string): string {
  return line
    .replace(found, " ")
    .replace(/\(\s*\)/g, " ")
    .replace(/\s*[|·•]\s*$/g, " ")
    .replace(/^\s*[|·•,،—–-]\s*/g, " ")
    .replace(/\s*[|·•,،]\s*$/g, " ")
    .replace(/\s*[—–]\s*$/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/* ───────────────────────── lines ───────────────────────── */

const BULLET = /^\s*[-•*·▪◦‣o]\s+/;
const EMAIL = /[^\s@,;<>()]+@[^\s@,;<>()]+\.[a-z]{2,}/i;
/** A phone number, tolerating +966, 05x, spaces, dashes and brackets. */
const PHONE = /(?:\+?\d[\d\s()-]{7,}\d)/;
const LINKEDIN = /(?:linkedin\.com\/[^\s,;]+|\/in\/[^\s,;]+)/i;

/**
 * Split a role header into what comes before and after the separator.
 *
 * A CV writes the same fact five ways — "Radiographer at Dallah", "Radiographer —
 * Dallah Hospital", "Radiographer | Dallah, Riyadh", "أخصائي أشعة – مستشفى دلة". The
 * separators are the reliable part; the order (title first) is the convention every
 * one of those follows.
 */
function splitRole(rest: string): { title: string; company: string; location: string } {
  const parts = rest
    .split(/\s+(?:at|@|في|لدى)\s+|\s*[|—–]\s*|\s*,\s*(?=[A-Z؀-ۿ])/)
    .map((x) => x.trim())
    .filter(Boolean);
  const [title = "", company = "", location = ""] = parts;
  return { title, company, location: [location, ...parts.slice(3)].filter(Boolean).join(", ") };
}

/**
 * Does this line start a job, or continue one?
 *
 * A header carries a date, or a separator with an employer after it. A duty carries a
 * verb and usually neither. Getting this wrong in the safe direction — treating a
 * header as a duty — leaves a stray line in the bullets, which the user deletes.
 * Getting it wrong the other way invents a job, so the test is deliberately strict.
 */
function looksLikeRoleHeader(line: string): boolean {
  if (BULLET.test(line)) return false;
  if (line.length > 120) return false;
  const hasDate = new RegExp(POINT, "i").test(line);
  const hasSeparator = /\s(?:at|@|في|لدى)\s|[|—–]/.test(line);
  return hasDate || hasSeparator;
}

/** Comma / bullet / pipe separated, in either script. */
function splitList(line: string): string[] {
  return line
    .replace(BULLET, "")
    .split(/[,،;|•·]+|\s{3,}/)
    .map((x) => x.trim().replace(/[.،,;]+$/, ""))
    .filter((x) => x.length > 1 && x.length < 60);
}

/* ───────────────────────── the parse ───────────────────────── */

export function parseCv(raw: string): ParsedCv {
  const lines = String(raw || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const out: ParsedCv = {
    name: "", email: "", phone: "", linkedin: "",
    roles: [], skills: [], education: [], certifications: [], languages: [],
    summary: "", unread: [],
  };

  let section: Section = "header";
  let role: ParsedRole | null = null;
  const summaryLines: string[] = [];

  for (const line of lines) {
    /* contact details are wherever they are — a heading never guards them */
    const email = EMAIL.exec(line);
    if (email && !out.email) out.email = email[0];
    const li = LINKEDIN.exec(line);
    if (li && !out.linkedin) out.linkedin = li[0];
    /*
     * A phone number is only looked for where one lives: above the first heading, or on
     * a line that also carries an email. Scanning every line instead would read
     * "Achieved 30% faster turnaround at 128-slice CT" as a mobile number — a long
     * digit run inside a duty is the most common false positive there is, and it would
     * then be printed in the contact block of the rebuilt CV.
     */
    if (!out.phone && (section === "header" || email)) {
      const ph = PHONE.exec(line);
      if (ph && ph[0].replace(/\D/g, "").length >= 8) out.phone = ph[0].trim();
    }

    const heading = headingFor(line);
    if (heading) {
      section = heading;
      role = null;
      continue;
    }

    if (section === "header") {
      // The name is the first line that reads like a name: no digits, no @, few words.
      if (!out.name && !/[\d@]/.test(line) && line.split(" ").length <= 5 && line.length > 2
          && !LINKEDIN.test(line)) {
        out.name = line;
        continue;
      }
      // Everything else above the first heading is contact noise once the details are
      // extracted; only genuinely unrecognised lines are reported.
      if (!email && !li && !PHONE.test(line) && line !== out.name) out.unread.push(line);
      continue;
    }

    if (section === "summary") { summaryLines.push(line.replace(BULLET, "")); continue; }

    if (section === "experience") {
      if (role && BULLET.test(line)) { role.bullets.push(line.replace(BULLET, "").trim()); continue; }
      if (looksLikeRoleHeader(line)) {
        const { start, end, rest } = splitDates(line);
        const { title, company, location } = splitRole(rest);
        // A "header" with no title is a stray date or separator line, not a job.
        if (!title) { out.unread.push(line); continue; }
        role = { title, company, location, start, end, bullets: [] };
        out.roles.push(role);
        continue;
      }
      // Un-bulleted prose under a job is still that job's duty — plenty of CVs do not
      // use bullet characters at all.
      if (role) { role.bullets.push(line.replace(BULLET, "").trim()); continue; }
      out.unread.push(line);
      continue;
    }

    if (section === "skills") {
      const items = splitList(line);
      // One long sentence is not a skills list; keep it out rather than shredding it.
      out.skills.push(...(items.length > 1 ? items : [line.replace(BULLET, "").trim()].filter((x) => x.length < 60)));
      continue;
    }

    if (section === "education") { out.education.push(line.replace(BULLET, "").trim()); continue; }
    if (section === "certifications") { out.certifications.push(line.replace(BULLET, "").trim()); continue; }
    if (section === "languages") {
      const items = splitList(line);
      out.languages.push(...(items.length ? items : [line.replace(BULLET, "").trim()]));
      continue;
    }
  }

  out.summary = summaryLines.join(" ").trim();
  // De-duplicate the flat lists: a CV that repeats "CT" in two skill rows should not
  // offer it twice.
  out.skills = unique(out.skills);
  out.languages = unique(out.languages);
  out.certifications = unique(out.certifications);
  return out;
}

function unique(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of list) {
    const k = x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

/** Did we read enough to be worth showing? Below this, ask for the text instead. */
export function worthImporting(p: ParsedCv): boolean {
  return p.roles.length > 0 || p.skills.length > 2 || p.education.length > 0;
}
