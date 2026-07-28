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
  /* The Arabic alternates are not guesses. Each of these was measured leaking into `unread` — which
     means its entire section was lost — on ordinary Saudi CVs. */
  { key: "experience", re: /^(work\s+|professional\s+|employment\s+)?(experience|history|employment)\b|^(الخبرة|الخبرات|التاريخ الوظيفي|الخبرة العملية|الخبرات العملية|الخبرات الوظيفية|خبرات العمل|السجل الوظيفي|الخبرة المهنية|المسار المهني)/i },
  { key: "education", re: /^(education|academic|qualifications)\b|^(التعليم|المؤهلات|المؤهل العلمي|المؤهل الدراسي|المؤهلات العلمية)/i },
  { key: "skills", re: /^(skills|technical skills|core competencies|competencies)\b|^(المهارات|الكفاءات)/i },
  { key: "certifications", re: /^(certifications?|licen[cs]es?|credentials|courses|training)\b|^(الشهادات|الرخص|الدورات|التدريب)/i },
  { key: "languages", re: /^(languages)\b|^(اللغات|إجادة اللغات|اجادة اللغات)/i },
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
/*
 * `14\d{2}` is the Hijri range, and it is not decoration in this market: Saudi CVs routinely date
 * education in Hijri ("1445 - 1447هـ") while dating employment in Gregorian. Without it those lines
 * carry no detectable date at all. Bounded to 14xx rather than any four digits, so a street number
 * or a salary cannot be mistaken for a year.
 */
const POINT = `(?:(?:${MONTHS})[a-z]*\\.?\\s*,?\\s*)?(?:\\d{1,2}[/.-])?(?:(?:19|20)\\d{2}|14\\d{2})\\s*(?:هـ|هجري)?`;
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
 * ══════════════════════════════════════════════════════════════════════════════════════
 * A CV WRITES A JOB OVER TWO OR THREE LINES, AND THE DATE IS ON THE LAST ONE
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * `looksLikeRoleHeader` asks each line in isolation, so it could only ever see the layouts that put
 * everything on ONE line. The two most common real layouts put it on more, and both failed — one by
 * losing the job, the other by inventing one:
 *
 *   Senior Radiology Technologist          ← no date, no separator: not a header, goes to `unread`
 *   King Faisal Hospital                   ← same
 *   Jan 2019 - Present                     ← a header whose `rest` is empty ⇒ no title ⇒ `unread`
 *   → ZERO positions imported, from the most common CV layout there is.
 *
 *   Senior Radiology Technologist          ← goes to `unread`
 *   King Faisal Hospital, Riyadh — Jan 2019 - Present
 *   → title "King Faisal Hospital", company "Riyadh". The EMPLOYER written into the job-title field
 *     and the CITY into the employer field, pushed straight into `profile.roles` as CONFIRMED,
 *     pre-ticked content — on a product whose whole claim is that it does not invent facts. A
 *     dropped fact is a bad import; a wrong fact is a worse one.
 *
 * So a header now looks BACK at the lines above it. `carry` holds the un-bulleted, unclassified
 * lines seen since the last bullet or role, and this decides which of them belong to the job the
 * date is opening.
 *
 * ── the guard, because guessing wrong here fabricates ──
 *
 * A pending line is only eligible if it reads like a heading rather than a duty: short, few words,
 * no trailing full stop, no bullet marker. Anything else stays a duty and is flushed as one. Two
 * lines at most are ever consumed (title, employer); a third means this is prose, not a header
 * block, and none of it is taken.
 */
const MAX_CARRY = 2;

/*
 * Irregular past-tense verbs a duty starts with. The regular ones are caught by `-ed` below; these
 * are the ones English does not inflect that way and that a CV actually uses.
 */
const DUTY_VERB = /^(led|ran|built|drove|grew|oversaw|won|set|wrote|made|took|gave|held|kept|sold|taught|chose|met|began|spoke|drew|brought)\b/i;

function looksLikeHeading(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 60) return false;
  if (BULLET.test(t)) return false;
  if (/[.!?]$/.test(t)) return false;              // a finished sentence is a duty
  if (t.split(/\s+/).length > 8) return false;
  /*
   * ── the verb test, and it is what keeps this from fabricating ──
   *
   * A duty is a sentence about doing something; a job title is a noun phrase. Without this the
   * lookback promoted "Positioned patients and applied shielding to ALARA standards" — a duty of the
   * job ABOVE — into the job title of the one below, which is a worse error than the one the
   * lookback exists to fix. Caught by `ops/importcv.test.mjs`, which is why the fixture is there.
   *
   * English: a regular past tense ends in `-ed`; the irregulars are listed above.
   * Arabic: a first-person past verb ends in ت (قدت, أدرت, نسّقت, أعددت, تابعت), where the job titles
   * this product sees are noun phrases (أخصائي أشعة, محاسب, مهندس مدني).
   */
  const first = t.split(/\s+/)[0].replace(/[,،:]$/, "");
  if (/^[a-z]/i.test(first) && (/[a-z]ed$/i.test(first) && first.length > 3 || DUTY_VERB.test(first))) return false;
  if (/^[؀-ۿ]/.test(first) && /ت$/.test(first) && first.length >= 3) return false;
  return true;
}

/**
 * Compose a role from the dated line and whatever the lines above it were.
 *
 * Returns `null` when there is nothing that can honestly be called a job, so the caller can put the
 * line back in `unread` — which is what "we could not place this" is for.
 */
function roleFromHeader(
  rest: string,
  carry: string[],
): { title: string; company: string; location: string; used: number } | null {
  const eligible = carry.slice(-MAX_CARRY).filter(looksLikeHeading);
  const inline = splitRole(rest);

  /* The dated line carries no text of its own: everything must come from above it. */
  if (!inline.title) {
    if (!eligible.length) return null;
    const [a, b] = eligible.length >= 2 ? eligible.slice(-2) : [eligible[eligible.length - 1], ""];
    return { title: a, company: b, location: "", used: eligible.length >= 2 ? 2 : 1 };
  }

  /*
   * The dated line HAS text, and a heading sits directly above it. That heading is the job title and
   * the dated line's parts are the employer and its city — the second layout above.
   *
   * Preferred over the old reading deliberately: the alternative discards the line above entirely
   * (that is the bug), while this keeps every fact and matches the layout CVs actually use. The
   * `looksLikeHeading` guard is what stops a trailing prose duty being promoted to a job title.
   */
  const above = eligible[eligible.length - 1];
  if (above) {
    return {
      title: above,
      company: inline.title,
      location: [inline.company, inline.location].filter(Boolean).join(", "),
      used: 1,
    };
  }
  return { ...inline, used: 0 };
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

/**
 * Make the text something the rest of this file can actually read.
 *
 * ── Arabic-Indic digits ──
 *
 * `POINT` matches years with `(?:19|20)\d{2}`, and `\d` in JavaScript is ASCII-only. A Saudi CV
 * that writes `سبتمبر ٢٠٢٤ حتى الآن` therefore has NO detectable date: `splitDates` returns empty
 * strings, the date text falls through into `location`, and if the line has no Latin separator
 * `looksLikeRoleHeader` rejects it outright — so the job is not merely undated, it is not imported
 * at all. Two Unicode ranges cover it: U+0660–0669 (Arabic-Indic) and U+06F0–06F9 (Extended, used
 * in Persian/Urdu keyboards that are common on phones here).
 *
 * ── presentation forms ──
 *
 * Some PDF producers emit Arabic as the presentation-form blocks (U+FB50–FDFF, U+FE70–FEFF) —
 * pre-shaped glyphs rather than the standard block every regex in this file is written against.
 * `NFKC` folds them back. It is a no-op for text that is already normal.
 *
 * Both run once, on the raw string, so nothing downstream has to remember.
 */
export function normalizeForParsing(raw: string): string {
  let t = String(raw || "");
  try { t = t.normalize("NFKC"); } catch { /* older runtime — the digit map below still applies */ }
  return t.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => {
    const code = d.charCodeAt(0);
    const base = code >= 0x06F0 ? 0x06F0 : 0x0660;
    return String(code - base);
  });
}

export function parseCv(raw: string): ParsedCv {
  const lines = normalizeForParsing(raw)
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
  /*
   * Un-bulleted experience lines whose meaning is not yet decidable — see `roleFromHeader`. They are
   * this job's prose duties unless a dated header two lines later claims them as the NEXT job's
   * title and employer.
   */
  const carry: string[] = [];
  /** Commit whatever the lookback did not claim: duties of the job in hand, or unplaced lines. */
  const flushCarry = () => {
    for (const c of carry) {
      if (role) role.bullets.push(c);
      else if (c) out.unread.push(c);
    }
    carry.length = 0;
  };

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
      /* Before the section changes, or the last job's trailing prose would be lost with it. */
      flushCarry();
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
      if (role && BULLET.test(line)) {
        /* A real bullet ends any lookback: the lines above it were prose duties of THIS job, not the
           heading of a job that never arrived. */
        flushCarry();
        role.bullets.push(line.replace(BULLET, "").trim());
        continue;
      }
      if (looksLikeRoleHeader(line)) {
        const { start, end, rest } = splitDates(line);
        const made = roleFromHeader(rest, carry);
        // Nothing here and nothing above it that reads like a job: a stray date or separator line.
        if (!made) { out.unread.push(line); flushCarry(); continue; }
        /* Whatever the new role did NOT take belongs to the job before it, as prose duties. */
        carry.length = Math.max(0, carry.length - made.used);
        flushCarry();
        role = { title: made.title, company: made.company, location: made.location, start, end, bullets: [] };
        out.roles.push(role);
        continue;
      }
      /*
       * Held, not committed. Un-bulleted prose under a job IS that job's duty — plenty of CVs use no
       * bullet characters — but the same shape is also the first two lines of the NEXT job when the
       * date is on the third. Which it is only becomes knowable one or two lines later, so the
       * decision waits: `flushCarry` turns these into duties everywhere a header does not claim them.
       */
      carry.push(line.replace(BULLET, "").trim());
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

  /* And at the end of the document, for a CV that finishes on its last job. */
  flushCarry();

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
