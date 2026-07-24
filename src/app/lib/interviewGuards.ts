/**
 * Server-side guards for the Advisor interview (/api/interview).
 *
 * The model is instructed to behave; these functions make it structural. Every
 * one of them exists because a live run of 100 scenarios proved the prompt alone
 * was not enough:
 *
 * - scrubPii          → scenario 45 stored a national ID + IBAN into contact
 *                       (the English SSN case was refused, the Arabic one was not).
 * - stripPlaceholders → scenario 1 wrote "[أضف التخصص]" into profile_patch.summary,
 *                       which is printed verbatim on the PDF. guardLines only ever
 *                       covered resume_lines.
 * - normalizePatch    → the model emitted years / years_of_experience / industry /
 *                       experiences[] interchangeably, and role swallowed whole
 *                       sentences ("Nurse, 5 years in emergency care").
 * - freezeHistory     → scenario 22 accepted "غيّر تاريخ التخرج من ٢٠١٩ الى ٢٠٢٢".
 * - computeProgress   → the model's own progress was 0 or 17 and nothing else.
 * - gateFinish        → a conversation reached FINISH/100 then fell back to ASK/83.
 * - ageGate / SENSITIVE → minors got a plain job-title question; so did "كنت مسجون
 *                       سنتين" and "I have a 3-year gap because of depression".
 */

/* ────────────────────────── time ────────────────────────── */

/**
 * The model has no clock. Without being told, it reasons from whenever its
 * training data ended — which is why "توظفت ٢٠٢٥" came back as a date in the
 * future. Every prompt that reasons about dates gets this block.
 */
export function todayContext(now: Date = new Date()): string {
  const iso = now.toISOString().slice(0, 10);
  const year = now.getUTCFullYear();
  return `TODAY'S DATE IS ${iso}. The current year is ${year}.
Any year up to and including ${year} is the PAST — treat it as a real date the
user lived, never as a future or hypothetical one. Only a year after ${year} is
the future. Compute durations from ${year}: someone who graduated in ${year - 3}
graduated 3 years ago, and someone hired in ${year - 1} has been there about a year.
Never tell the user a date of theirs is in the future unless it is after ${year}.`;
}

/* ────────────────────────── digits ────────────────────────── */

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** Fold Arabic-Indic digits to ASCII so one set of patterns covers both scripts. */
export function foldDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}

export function hasDigits(s: string): boolean {
  return /\d|[٠-٩]/.test(s);
}

/* ────────────────────────── PII ────────────────────────── */

/**
 * Patterns for data that must never reach a resume — it is printed on a document
 * the user hands to an employer. Deliberately narrow: a resume is FULL of
 * legitimate numbers (SAR 40M revenue, 15 branches, 30% reduction) and scrubbing
 * those would break THE ONE LAW harder than leaking an ID would.
 *
 * Phone numbers and emails are intentionally NOT here — they belong in the header.
 */
const PII_RULES: Array<{ name: string; re: RegExp }> = [
  // Saudi IBAN (SA + 2 check digits + 18) and IBANs generally.
  { name: "iban", re: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,28}\b/g },
  // Saudi national ID / Iqama: exactly 10 digits starting 1 or 2. A bare 10-digit
  // run is not something an achievement bullet legitimately contains.
  { name: "national_id", re: /(?<!\d)[12]\d{9}(?!\d)/g },
  // US SSN.
  { name: "ssn", re: /\b\d{3}-\d{2}-\d{4}\b/g },
  // Passport: one letter + 7-8 digits.
  { name: "passport", re: /\b[A-Z]\d{7,8}\b/g },
  // Payment cards (13-19 digits, optionally grouped).
  { name: "card", re: /\b(?:\d[ -]?){13,19}\b/g },
];

/**
 * Salary/compensation figures, keyword-anchored so revenue and headcount survive.
 * The Arabic keyword takes possessive suffixes in ordinary speech ("راتبي",
 * "مرتبها"), so the stem is matched with them attached.
 */
const SALARY_RE =
  /(?:(?:ال)?(?:راتب|مرتب|أجر|اجر)(?:ي|ه|ها|هم|ك|نا)?|صافي\s*الراتب|salary|monthly\s+pay|compensation)\s*(?:هو|الحالي|الشهري|is|was)?\s*[:؟=]?\s*[\d,.]+\s*(?:SAR|ر\.?س|ريال|USD|\$)?/gi;

/** Explicit ID/IBAN labels, so the label does not survive its own value. */
const PII_LABEL_RE =
  /(?:رقم\s*(?:ال)?(?:هوية|الهويه|الإقامة|الاقامة|جوازي?|الجواز)|هويتي|ايبان|الايبان|الآيبان|national\s*id|iqama|passport\s*(?:no\.?|number)|iban)\s*[:؟=]?\s*/gi;

export interface ScrubResult { text: string; hits: string[] }

/** Remove PII from a single string, reporting which rules fired. */
export function scrubPii(input: string): ScrubResult {
  const hits: string[] = [];
  let out = input;
  const folded = foldDigits(out);

  // Work on the folded copy for detection, but rebuild from it so Arabic-Indic
  // digits inside an ID cannot slip past by staying un-normalized.
  out = folded;

  for (const { name, re } of PII_RULES) {
    if (re.test(out)) { hits.push(name); out = out.replace(re, ""); }
    re.lastIndex = 0;
  }
  if (SALARY_RE.test(out)) { hits.push("salary"); out = out.replace(SALARY_RE, ""); }
  SALARY_RE.lastIndex = 0;

  if (hits.length) {
    // Drop the now-orphaned labels ("رقم الهوية: ، ايبان: ").
    out = out.replace(PII_LABEL_RE, "");
    PII_LABEL_RE.lastIndex = 0;
  }
  // Tidy the punctuation the removals left behind.
  out = out
    .replace(/[،,;|]\s*(?=[،,;|])/g, "")
    .replace(/^[\s،,;|:.\-–—]+/, "")
    .replace(/[\s،,;|:\-–—]+$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return { text: out, hits };
}

/** Recursively scrub every string inside a JSON-ish value. */
export function scrubDeep<T>(value: T, hits: string[] = []): T {
  if (typeof value === "string") {
    const r = scrubPii(value);
    hits.push(...r.hits);
    return r.text as unknown as T;
  }
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, hits)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = scrubDeep(v, hits);
    return out as unknown as T;
  }
  return value;
}

/* ────────────────────── placeholders ────────────────────── */

const PLACEHOLDER_RE = /\[[^\]]*(?:add|أضف|رقم|number|figure|اذكر|حدد)[^\]]*\]/gi;

/**
 * Strip bracketed [add …] placeholders. Allowed at most once per response and
 * never when the user's own words already carry the number.
 */
export function stripPlaceholders(text: string, sourceHasDigits: boolean, budget: { left: number }): string {
  if (!PLACEHOLDER_RE.test(text)) { PLACEHOLDER_RE.lastIndex = 0; return text; }
  PLACEHOLDER_RE.lastIndex = 0;
  if (!sourceHasDigits && budget.left > 0) { budget.left--; return text; }
  return text
    .replace(/[,،]?\s*(?:by|بنسبة|of|في)?\s*\[[^\]]*\]/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.،,])/g, "$1")
    .replace(/[\s،,\-–—]+$/, "")
    .trim();
}

/* ─────────────────── schema normalization ─────────────────── */

export interface NormalizedPatch {
  patch: Record<string, unknown>;
  /** Fields the guards refused, for logging — never surfaced to the client. */
  dropped: string[];
  /**
   * The role we captured is a sector or a life stage, not a job title — the
   * live run produced role:"سياحة" (an industry) and role:"خريج جديد" (a status),
   * both of which print as the headline of the resume. The value is KEPT (throwing
   * away what the user said would be its own bug); the route uses this to ask for
   * the actual title instead of moving on.
   */
  roleNeedsTitle: boolean;
}

/**
 * Sectors and life stages that get typed in when someone is asked "what is your
 * job title?". Matched only as the WHOLE role — "مهندس سياحة" or "Sales Manager"
 * are real titles and must pass untouched.
 */
const NOT_A_TITLE = new Set([
  // sectors / fields
  "سياحة", "السياحة", "tourism", "مبيعات", "sales", "تسويق", "marketing",
  "محاسبة", "accounting", "هندسة", "engineering", "تقنية المعلومات", "it",
  "الموارد البشرية", "hr", "human resources", "طب", "medicine", "تعليم", "education",
  "قانون", "law", "إدارة", "management", "لوجستيات", "logistics", "مالية", "finance",
  // life stages / statuses
  "خريج جديد", "خريجة جديدة", "fresh graduate", "new graduate", "graduate",
  "طالب", "طالبة", "student", "عاطل", "عاطل عن العمل", "unemployed",
  "باحث عن عمل", "باحثة عن عمل", "job seeker", "متقاعد", "retired",
]);

function isNotATitle(role: string): boolean {
  return NOT_A_TITLE.has(role.trim().toLowerCase().replace(/^(ال)(?=[^\s]{3,})/, ""));
}

const YEARS_KEYS = ["years_of_experience", "years", "experience_years", "yearsOfExperience", "yoe"];

/** "Nurse, 5 years in emergency care" → { role: "Nurse", years_of_experience: 5 } */
function splitRole(raw: string): { role: string; years?: number } {
  let role = foldDigits(raw).trim().replace(/^[\s\-–—,،]+|[\s\-–—,،.]+$/g, "");
  let years: number | undefined;

  const m = role.match(/(\d{1,2})\s*(?:\+)?\s*(?:years?|yrs?|سنوات|سنة|سنين|عام|أعوام)/i);
  if (m) {
    years = Number(m[1]);
    role = role.replace(m[0], "");
  }
  // A job title is a noun phrase, not a sentence: cut at the first clause break.
  role = role.split(/\s*[,،:;()]\s*|\s+(?:with|in|at|من|في|لدى|مع)\s+/i)[0];
  role = role.replace(/^[\s\-–—,،]+|[\s\-–—,،.]+$/g, "").slice(0, 80);
  return { role, years };
}

/**
 * Collapse the model's inconsistent key names into one shape and reject values
 * that would corrupt the resume.
 *
 * @param existing the profile the client already holds, used to freeze history
 */
export function normalizePatch(
  raw: Record<string, unknown>,
  opts: { sourceText: string; existing?: Record<string, unknown> } = { sourceText: "" },
): NormalizedPatch {
  const dropped: string[] = [];
  const patch: Record<string, unknown> = {};
  let roleNeedsTitle = false;
  const src = opts.sourceText || "";
  const srcDigits = hasDigits(src);
  const budget = { left: 1 };

  const str = (v: unknown, cap: number): string | null => {
    if (typeof v !== "string") return null;
    const s = stripPlaceholders(v.trim(), srcDigits, budget).slice(0, cap);
    return s || null;
  };

  // ── role (+ years hiding inside it)
  if (typeof raw.role === "string" && raw.role.trim()) {
    const { role, years } = splitRole(raw.role);
    if (role) {
      patch.role = role;
      if (isNotATitle(role)) {
        roleNeedsTitle = true;
        // A sector is still useful information — file it where it belongs.
        if (!patch.industry) patch.industry = role;
      }
    }
    if (years !== undefined) patch.years_of_experience = years;
  }
  if (typeof raw.targetRole === "string" && raw.targetRole.trim() && !patch.role) {
    const { role } = splitRole(raw.targetRole);
    if (role) {
      patch.role = role;
      if (isNotATitle(role)) roleNeedsTitle = true;
    }
  }

  // ── years: one canonical key
  for (const k of YEARS_KEYS) {
    if (patch.years_of_experience !== undefined) break;
    const v = (raw as Record<string, unknown>)[k];
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(foldDigits(v).replace(/[^\d.]/g, "")) : NaN;
    if (Number.isFinite(n) && n >= 0 && n <= 60) patch.years_of_experience = Math.round(n);
    else if (v !== undefined) dropped.push(k);
  }

  // ── plain string fields
  const S: Array<[string, number]> = [
    ["name", 100], ["contact", 200], ["summary", 700],
    ["industry", 80], ["skills", 400], ["certifications", 300],
  ];
  for (const [k, cap] of S) {
    const s = str(raw[k], cap);
    if (s) patch[k] = s;
  }
  if (Array.isArray(raw.skills)) {
    const sk = raw.skills.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 12);
    if (sk.length) patch.skills = sk.join("، ");
  }

  // ── education: object or string, with graduation_year frozen
  if (typeof raw.education === "string") {
    const s = str(raw.education, 400);
    if (s) patch.education = s;
  } else if (raw.education && typeof raw.education === "object") {
    const e = raw.education as Record<string, unknown>;
    const edu: Record<string, unknown> = {};
    for (const k of ["degree", "university", "field"]) {
      const s = str(e[k], 160);
      if (s) edu[k] = s;
    }
    const gy = foldDigits(String(e.graduation_year ?? "")).match(/\d{4}/)?.[0];
    if (gy) {
      const prior = String(
        (opts.existing?.education as Record<string, unknown> | undefined)?.graduation_year ??
        (opts.existing?.graduation_year ?? ""),
      ).match(/\d{4}/)?.[0];
      // Dates are history. Once a graduation year is on record, a later turn may
      // not silently overwrite it with a different one — that is the forgery the
      // product promises not to do.
      if (prior && prior !== gy) dropped.push(`education.graduation_year:${prior}->${gy}`);
      else edu.graduation_year = gy;
    }
    if (Object.keys(edu).length) patch.education = edu;
  }

  // ── experiences[]
  if (Array.isArray(raw.experiences)) {
    const exps = (raw.experiences as Array<Record<string, unknown>>)
      .map((ex) => {
        const h = (ex?.header && typeof ex.header === "object" ? ex.header : {}) as Record<string, unknown>;
        const header = typeof ex?.header === "string"
          ? { title: String(ex.header).slice(0, 120), company: "", start_date: "" }
          : {
              title: str(h.title, 120) || "",
              company: str(h.company, 120) || "",
              start_date: normalizeDate(String(h.start_date ?? "")),
            };
        const bullets = Array.isArray(ex?.bullets)
          ? (ex.bullets as unknown[])
              .map((b) => stripPlaceholders(String(b).replace(/^[-•*]\s*/, "").trim(), srcDigits, budget))
              .filter((b) => b.length > 2)
              .slice(0, 4)
          : [];
        return { header, bullets };
      })
      .filter((ex) => ex.header.title || ex.bullets.length)
      .slice(0, 6);
    if (exps.length) patch.experiences = exps;
  }

  if (Array.isArray(raw.extras)) {
    const ex = raw.extras.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 6);
    if (ex.length) patch.extras = ex;
  }

  return { patch, dropped, roleNeedsTitle };
}

/**
 * A graduation year is not a job start date. The model put "2017" (the year the
 * user graduated) into experiences[0].header.start_date; a bare 4-digit year is
 * accepted as-is but never invented into a month.
 */
function normalizeDate(raw: string): string {
  const s = foldDigits(raw).trim();
  if (!s) return "";
  const my = s.match(/^([A-Za-z؀-ۿ]+)\s+(\d{4})$/);
  if (my) return `${my[1]} ${my[2]}`;
  const iso = s.match(/^(\d{4})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const y = s.match(/^(\d{4})$/);
  if (y) return y[1];
  return s.slice(0, 24);
}

/* ────────────────────── progress & finish ────────────────────── */

export interface ProfileLike {
  role?: string; summary?: string; skills?: string; name?: string; contact?: string;
  education?: unknown; wovenLines?: unknown[]; experiences?: unknown[];
}

/**
 * Progress is a fact about the profile, not an opinion of the model's. Six axes,
 * each either has real content or does not.
 */
export function computeProgress(p: ProfileLike): number {
  const filled = (v: unknown): boolean => {
    if (typeof v === "string") return v.trim().length > 1;
    if (Array.isArray(v)) return v.length > 0;
    if (v && typeof v === "object") return Object.values(v).some((x) => filled(x));
    return false;
  };
  const axes = [
    filled(p.role),
    filled(p.summary),
    filled(p.wovenLines) || filled(p.experiences),
    filled(p.skills),
    filled(p.education),
    filled(p.name) && filled(p.contact),
  ];
  return Math.round((axes.filter(Boolean).length / axes.length) * 100);
}

/**
 * FINISH is only real when the resume is actually complete. Without this the
 * interview announces "تم بناء السيرة الذاتية بنجاح" and then asks another
 * question on the next turn, which is how a finished CV "un-finishes" itself.
 */
export function gateFinish(action: string, merged: ProfileLike): { action: string; blocked: boolean } {
  if (action !== "FINISH") return { action, blocked: false };
  const ok =
    Boolean(merged.role) &&
    Boolean(merged.summary) &&
    ((merged.wovenLines?.length ?? 0) > 0 || (merged.experiences?.length ?? 0) > 0) &&
    Boolean(merged.skills) &&
    Boolean(merged.name) &&
    Boolean(merged.contact);
  return ok ? { action: "FINISH", blocked: false } : { action: "ASK", blocked: true };
}

/* ────────────────────── people, not fields ────────────────────── */

/** Stated age, when the user volunteers one. */
export function statedAge(text: string): number | null {
  const s = foldDigits(text);
  const m =
    s.match(/(?:عمري|سني|أبلغ(?:\s*من\s*العمر)?)\s*(\d{1,2})/) ||
    s.match(/\bI(?:'m| am)\s*(\d{1,2})\b/i) ||
    s.match(/\b(\d{1,2})\s*(?:years?\s*old|سنة\s*$)/i);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 8 && n < 100 ? n : null;
}

/**
 * Topics where the correct first move is to answer the human being, not to ask
 * for a job title. Each returns a key; the route pairs it with a real reply.
 */
export function sensitiveTopic(text: string): string | null {
  const s = foldDigits(text).toLowerCase();
  const test = (...pats: RegExp[]) => pats.some((p) => p.test(s));

  // Ordered by acuteness, not by keyword frequency: "unemployed for 3 years and
  // I'm losing hope" is a person in distress before it is a CV gap.
  if (test(/فاقد\s*الأمل|أفقد\s*الأمل|losing\s*hope|يائس|hopeless|ما\s*عاد\s*لي\s*أمل/)) return "hope";
  if (test(/مسجون|سجن|سابقة\s*جنائية|incarcerat|\bin\s+prison\b|criminal\s+record/)) return "record";
  if (test(/اكتئاب|depress|صحتي\s*النفسية|mental\s+health|burnout/)) return "health_gap";
  if (test(/إعاقة|اعاقة|disab|كرسي\s*متحرك|wheelchair/)) return "disability";
  if (test(/عمري\s*(?:5[0-9]|[6-9][0-9])|خايف\s*ما\s*احد\s*يوظفني|too\s*old|age\s*discriminat/)) return "age";
  if (test(/فصلت|طردت|laid\s*off|\bfired\b|أنهوا\s*خدمتي/)) return "layoff";
  if (test(/فجوة|انقطاع|\bgap\b|عاطل|unemploy|بدون\s*عمل/)) return "gap";
  return null;
}

/** Did the model just repeat itself verbatim? (The single loudest UX failure.) */
export function isRepeat(say: string, history: Array<{ who?: string; role?: string; text?: string; content?: string }>): boolean {
  const norm = (s: string) => s.replace(/[\sً-ْ.,،!?؟]/g, "").toLowerCase();
  const target = norm(say);
  if (target.length < 8) return false;
  return history
    .filter((h) => (h.who || h.role) === "ai" || (h.who || h.role) === "assistant")
    .slice(-3)
    .some((h) => norm(String(h.text || h.content || "")) === target);
}
