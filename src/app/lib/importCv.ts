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
  /*
   * The sections this builder has no field for — and the reason they are named here rather than
   * ignored. `VOLUNTEER WORK`, `PROJECTS`, `REFERENCES` and their siblings are not in the six above,
   * so inside the experience block each became a fabricated DUTY on the last job and the entry
   * beneath it became a fabricated JOB:
   *
   *   VOLUNTEER WORK                → a bullet of the job above
   *   Red Crescent Society          → job title
   *   Riyadh Chapter, 2021 - 2022   → employer + dates, imported as EMPLOYMENT
   *
   * Naming them ends the experience block instead, and their content goes to `unread` — visible,
   * unplaced, and honest. There is no field for a volunteer entry; inventing a salaried job out of
   * one is the worse answer.
   *
   * Matched on the WHOLE line, unlike the six above which match as a prefix. That is deliberate:
   * "VOLUNTEER WORK" is a heading, "Volunteer Coordinator" and "Projects Manager" are job titles,
   * and a prefix test cannot tell them apart. A false positive here DELETES a real job, so the match
   * is exact or nothing. Two earlier attempts at this guard scored the SHAPE of the line instead —
   * short, capitalised, dateless — and both ate ordinary job titles ("Registered Nurse",
   * "Set Designer") for exactly that reason.
   */
  { key: "other", re: /^(volunteer(ing)?( work| experience)?|community service|references|projects|key projects|achievements|accomplishments|awards|awards (and|&) honou?rs|honou?rs|publications|memberships|professional memberships|affiliations|professional development|activities|extracurricular activities|interests|hobbies|personal (information|details)|portfolio|patents|conferences|workshops|presentations)$/i },
  { key: "other", re: /^(التطوع|العمل التطوعي|الأعمال التطوعية|الاعمال التطوعية|الأنشطة|الانشطة|الأنشطة التطوعية|المراجع|المشاريع|الإنجازات|الانجازات|الجوائز|المنشورات|العضويات|الاهتمامات|الهوايات|التطوير المهني|معلومات شخصية|المعلومات الشخصية|البيانات الشخصية)$/ },
];

type Section = "summary" | "experience" | "education" | "skills" | "certifications" | "languages" | "header" | "other";

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
/**
 * Which separator held the line together — the signal `roleFromHeader` resolves its ambiguity with.
 *
 * `comma` means "X, Y" with Y capitalised, which is how a place and its city are written.
 * `phrase` means `|`, an em-dash, ` at ` or ` في `, which is how a title and its employer are.
 */
export type SepKind = "comma" | "phrase" | "none";

/*
 * ` - ` with spaces around it is included: "Radiographer - Dallah Hospital" is an ordinary CV line
 * and was landing whole in the job-title field. Safe because `splitDates` strips the date range
 * BEFORE `splitRole` runs, so "2019 - 2021" is gone by now, and because a hyphenated NAME
 * (Al-Otaibi, Jeddah-based) carries no spaces around its hyphen.
 */
const SEP_PHRASE = /\s+(?:at|@|في|لدى)\s+|\s*[|—–]\s*|\s+-\s+/;
const SEP_COMMA = /\s*,\s*(?=[A-Z؀-ۿ])/;

function splitRole(rest: string): { title: string; company: string; location: string; sep: SepKind } {
  const parts = rest
    .split(/\s+(?:at|@|في|لدى)\s+|\s*[|—–]\s*|\s+-\s+|\s*,\s*(?=[A-Z؀-ۿ])/)
    .map((x) => x.trim())
    .filter(Boolean);
  const [title = "", company = "", location = ""] = parts;
  /* Whichever matched EARLIEST is the one that structured the line. */
  const ph = SEP_PHRASE.exec(rest);
  const cm = SEP_COMMA.exec(rest);
  const sep: SepKind = ph && (!cm || ph.index < cm.index) ? "phrase" : cm ? "comma" : "none";
  return { title, company, location: [location, ...parts.slice(3)].filter(Boolean).join(", "), sep };
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

/**
 * Could this line be a heading — a job title or an employer — rather than a duty?
 *
 * STRUCTURAL only, and the version this replaces was a verb denylist that failed in both
 * directions at once:
 *
 *   under-inclusive · "Responsible for daily radiography operations" and "إدارة قسم الأشعة
 *                     والإشراف على الفنيين" are duties in the present tense / the Arabic masdar,
 *                     which no past-tense test catches — so they were promoted to the next job's
 *                     TITLE and that job's real title was pushed down into the employer field.
 *   over-inclusive  · "Registered Nurse", "Licensed Practical Nurse", "Certified Public
 *                     Accountant", "Embedded Systems Engineer" — the `-ed` there is an ADJECTIVE,
 *                     indistinguishable from a verb by suffix. Those titles were thrown away and
 *                     the EMPLOYER NAME written into the title field instead.
 *
 * Both were measured against the pre-fix parser, which got several of them right. A denylist of
 * twenty-five past-tense forms cannot stand in for "is this a noun phrase", so it is gone; the
 * ambiguity is resolved by the SHAPE of the dated line instead (see `roleFromHeader`).
 *
 * The limits are generous because employers are long: "King Faisal Specialist Hospital and
 * Research Centre, Riyadh Region" is 67 characters and a real place.
 */
function looksLikeHeading(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (t.length > 80) return false;
  if (BULLET.test(t)) return false;
  if (/[.!?]$/.test(t)) return false;              // a finished sentence is a duty
  return t.split(/\s+/).length <= 12;
}

/**
 * Compose a role from the dated line and the lines above it.
 *
 * `used` counts lines taken from the END of `carry`, contiguously — the caller splices exactly that
 * many. It used to be a count taken from a FILTERED array and applied to the unfiltered buffer, so
 * whenever an ineligible line sat among the eligible ones the wrong element was dropped: an
 * over-long employer was deleted outright — absent from roles, bullets and `unread` alike — while
 * the title was both used AND duplicated as a duty on the job above. Silent loss is the one outcome
 * this file's header calls the worst, so the two now index the same array.
 *
 * Returns `null` when nothing here can honestly be called a job.
 */
function roleFromHeader(
  rest: string,
  carry: string[],
  sep: SepKind,
): { title: string; company: string; location: string; used: number } | null {
  const tail = carry.slice(-MAX_CARRY);
  const inline = splitRole(rest);

  /*
   * ── the unambiguous case: the dated line is ONLY a date ──
   *
   * Everything must come from above it, and a duty sitting directly above a bare date line is not a
   * shape CVs use. So this branch is permissive: it is the three-line layout (title / employer /
   * dates), which is the most common there is and which imported ZERO positions before the lookback
   * existed. Any reasonable reading beats losing the job outright.
   */
  if (!inline.title) {
    const usable = tail.filter(looksLikeHeading);
    if (!usable.length) return null;
    const take = Math.min(usable.length, tail.length);
    const [a, b] = take >= 2 ? tail.slice(-2) : [tail[tail.length - 1], ""];
    return { title: a, company: b, location: "", used: take >= 2 ? 2 : 1 };
  }

  /*
   * ── the ambiguous case, resolved by the SEPARATOR rather than by guessing ──
   *
   * The dated line has text of its own, and a line sits above it. Two real layouts collide here:
   *
   *   Senior Radiology Technologist
   *   King Faisal Hospital, Riyadh — Jan 2019 - Present     ← employer, CITY. Above is the title.
   *
   *   Operated CT and MRI scanners for outpatients          ← a duty of the job above
   *   Radiologic Technologist — King Fahad Hospital | 2020  ← title, EMPLOYER. Self-sufficient.
   *
   * The difference is not in the line above — both are short noun-ish phrases — it is in how the
   * dated line splits. A COMMA before a capitalised word separates a place from its city; `|`, an
   * em-dash, ` at ` or ` في ` separate a title from its employer. So the promotion happens only on
   * the comma shape, which is what the first version got wrong: it promoted on every shape and
   * turned duties into job titles.
   */
  if (sep === "comma" && tail.length) {
    const above = tail[tail.length - 1];
    if (looksLikeHeading(above)) {
      return {
        title: above,
        company: inline.title,
        location: [inline.company, inline.location].filter(Boolean).join(", "),
        used: 1,
      };
    }
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
function looksLikeRoleHeader(line: string, roleOpen: boolean): boolean {
  if (BULLET.test(line)) return false;
  if (line.length > 120) return false;
  const hasDate = new RegExp(POINT, "i").test(line);
  if (hasDate) return true;
  /*
   * ── a separator ALONE is not a job, once a job is already open ──
   *
   * ` at ` and ` في ` are the commonest prepositions in their languages, so an un-bulleted duty
   * carrying one was being split into a whole fabricated DATELESS job:
   *
   *   "Trained new technologists at the Riyadh site"  → {title: "Trained new technologists",
   *                                                       company: "the Riyadh site"}
   *   "تشغيل أجهزة الأشعة المقطعية في قسم الطوارئ"     → {title: "تشغيل أجهزة…", company: "قسم الطوارئ"}
   *
   * Two duties became two jobs. It fires hardest on Arabic prose CVs — exactly the ones that use no
   * bullet characters, so every line takes this path.
   *
   * Before the first job it stays permissive: a dateless "Radiographer at Dallah Hospital" opening
   * the experience section really is a job header, and refusing it would lose the only role. Once a
   * role is open and collecting duties, the burden flips — an undated line is a duty until a date
   * says otherwise.
   */
  if (roleOpen) return false;
  return /\s(?:at|@|في|لدى)\s|[|—–]/.test(line);
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
  /*
   * ── the DATES-FIRST layout, which imported nothing at all ──
   *
   *   Jan 2019 - Present                     ← dates alone on the line
   *   Senior Radiology Technologist          ← title
   *   King Faisal Hospital                   ← employer
   *   • Operated CT and MRI scanners
   *
   * `roleFromHeader` reads UPWARD, and above a date line that opens the section there is nothing, so
   * every job in a CV written this way was refused and its title and employer fell out as unplaced
   * lines. Measured: zero roles imported from a layout several popular Word templates produce.
   *
   * The dates are HELD instead of guessed at, and claim the one or two heading-shaped lines directly
   * beneath them — no further, because line three onward is already the duties. A bare date line
   * with nothing usable under it still reaches `unread` as before: some templates put the date
   * beside a section heading, and inventing a job out of that is the failure this whole file exists
   * to avoid.
   */
  let pending: { start: string; end: string; line: string } | null = null;
  const settlePending = () => {
    if (!pending) return;
    const held = pending;
    pending = null;
    const take: string[] = [];
    for (const c of carry.slice(0, 2)) {
      if (!looksLikeHeading(c)) break;
      take.push(c);
    }
    if (!take.length) { out.unread.push(held.line); return; }
    /* If the first line already carries a separator it is the whole header — do not also eat the
       line below it, which is a duty. Same rule `roleFromHeader` applies reading upward. */
    const inline = splitRole(take[0]);
    const used = inline.title && inline.company ? 1 : take.length;
    const title = inline.title && inline.company ? inline.title : take[0];
    const company = inline.title && inline.company ? inline.company : (take[1] || "");
    carry.splice(0, used);
    role = { title, company, location: inline.company ? inline.location : "", start: held.start, end: held.end, bullets: [] };
    out.roles.push(role);
  };
  /** Commit whatever the lookback did not claim: duties of the job in hand, or unplaced lines. */
  const flushCarry = () => {
    settlePending();
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
      /* A bullet means the job header is over: whatever the held dates were going to claim, they
         claim now, so the bullet lands on the right role rather than on the one before it. */
      if (pending && BULLET.test(line)) settlePending();
      if (role && BULLET.test(line)) {
        /* A real bullet ends any lookback: the lines above it were prose duties of THIS job, not the
           heading of a job that never arrived. */
        flushCarry();
        role.bullets.push(line.replace(BULLET, "").trim());
        continue;
      }
      if (looksLikeRoleHeader(line, Boolean(role && role.bullets.length))) {
        const { start, end, rest } = splitDates(line);
        const made = roleFromHeader(rest, carry, splitRole(rest).sep);
        if (!made) {
          /* Dates alone on the line, with nothing above them: the job is BELOW, so hold them. The
             carry is flushed first — anything already in it belongs to the job before this one, and
             letting the held dates claim it would move a duty into the next job's title. */
          if (start && !rest.trim() && !pending) { flushCarry(); pending = { start, end, line }; continue; }
          // Nothing here and nothing above it that reads like a job: a stray date or separator line.
          out.unread.push(line); flushCarry(); continue;
        }
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
      /* Held dates claim at most the two lines directly under them; settle before a third arrives,
         or a duty three lines down would be read as the employer. */
      if (pending && carry.length >= 2) settlePending();
      carry.push(line.replace(BULLET, "").trim());
      continue;
    }

    if (section === "skills") {
      const items = splitList(line);
      // One long sentence is not a skills list; keep it out rather than shredding it.
      out.skills.push(...(items.length > 1 ? items : [line.replace(BULLET, "").trim()].filter((x) => x.length < 60)));
      continue;
    }

    /*
     * A named section with no field to put it in. Every line is reported rather than dropped: the
     * builder cannot store a volunteer entry, but the user can see it was left behind and decide
     * where it belongs. Falling through instead would delete the section in silence.
     */
    if (section === "other") { out.unread.push(line.replace(BULLET, "").trim()); continue; }

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
