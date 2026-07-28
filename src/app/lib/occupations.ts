/**
 * What job is this, really — asked of a title the user typed, in either language.
 *
 * ── why this exists ──
 *
 * The builder generated suggestions straight from a raw title, and that is the same class of error
 * as the screenshot bug: acting on less information than the answer needs. "معلم" is six different
 * jobs with six different toolkits. "فني" is not a job at all, it is half of one. A model asked to
 * suggest skills for "Technician" will confidently produce a blend of radiology, IT and electrical
 * work, and the user cannot tell which parts belong to them.
 *
 * So a broad title gets ONE clarifying question, and everything else resolves silently.
 *
 * ── what it deliberately does not do ──
 *
 * It does not gate the builder. `stepReady.ts` accepts a raw title as a valid target on purpose: a
 * resolver that has not been taught an occupation must not be able to block someone from writing
 * their CV. Resolution makes suggestions better; it is not a precondition for having a job. So
 * `confidence` is reported and acted on, never enforced.
 *
 * It also does not call a model. Everything here is data and string matching — free, instant, and
 * identical in both languages. The model sees the RESULT (a normalized occupation, a family, a
 * specialism) rather than being asked to do the resolution on every request, which is both cheaper
 * and more consistent: two users typing "أخصائي أشعة" get the same occupation id rather than two
 * paraphrases of one.
 *
 * Pure, no React, no `next/*` — driven offline by `ops/occupations.test.mjs`.
 */

import { normalizeLabel } from "./builderDoc.ts";

/* ─────────────────────────── shape ─────────────────────────── */

export interface Bilingual { en: string; ar: string }

/**
 * A family is the level at which market knowledge is shared.
 *
 * Two radiographers with different modalities still need SCFHS and still name PACS; a radiographer
 * and a teacher share nothing. The family is what the country-rules layer keys on, which is why it
 * is separate from the specific occupation.
 */
export type OccupationFamily =
  | "health" | "education" | "engineering" | "finance" | "it"
  | "sales" | "admin" | "logistics" | "hospitality" | "legal" | "unknown";

export type Seniority = "junior" | "mid" | "senior" | "lead" | "manager" | "";

export interface Occupation {
  id: string;
  family: OccupationFamily;
  display: Bilingual;
  /** Titles and misspellings that resolve here. Matched after `normalizeLabel`. */
  aliases: string[];
  /** A specialism inside the occupation, when the title itself names one. */
  specialization?: Bilingual;
}

export interface Resolution {
  /** Empty when nothing matched — a valid outcome, not an error. */
  occupationId: string;
  family: OccupationFamily;
  /** What to show the user. Falls back to what they typed, never to an English guess. */
  display: Bilingual;
  specialization: Bilingual | null;
  seniority: Seniority;
  /** 0–1. Low means "ask", never "refuse". */
  confidence: number;
  /** Other plausible readings, best first, at most three. */
  alternatives: Array<{ occupationId: string; display: Bilingual; confidence: number }>;
  /** True when the title is a real word for a category of jobs rather than a job. */
  clarificationRequired: boolean;
  /** The one question to ask, and its options. Empty unless `clarificationRequired`. */
  clarification: {
    question: Bilingual;
    options: Array<{ occupationId: string; display: Bilingual }>;
  } | null;
  /** What the user actually typed, preserved verbatim for display and for the prompt. */
  raw: string;
}

/* ─────────────────────────── the taxonomy ─────────────────────────── */

/**
 * Occupations the product knows by name.
 *
 * Not a complete taxonomy and not trying to be — ISCO has thousands of entries and encoding them
 * here would be a data-entry project that mostly never gets read. These are the ones that either
 * (a) have a role pack, (b) have Saudi credential rules, or (c) are broad titles that need a
 * clarifying question. Everything else resolves to `unknown` with the user's own words preserved,
 * which is the honest outcome and still produces useful suggestions from the raw title.
 */
const OCCUPATIONS: Occupation[] = [
  /* ── health ── */
  {
    id: "radiology-technologist", family: "health",
    display: { en: "Radiology Technologist", ar: "أخصائي أشعة" },
    aliases: [
      "radiology technologist", "radiologic technologist", "radiographer", "diagnostic radiographer",
      "radiology technician", "x ray technician", "medical imaging technologist", "imaging technologist",
      "اخصائي اشعه", "اخصائي الاشعه", "فني اشعه", "تقني اشعه", "اخصائي تصوير طبي", "فني تصوير طبي", "اشعه",
    ],
  },
  {
    id: "ct-radiographer", family: "health",
    display: { en: "CT Radiographer", ar: "أخصائي أشعة مقطعية" },
    specialization: { en: "Computed Tomography", ar: "الأشعة المقطعية" },
    aliases: ["ct radiographer", "ct technologist", "computed tomography technologist", "اخصائي اشعه مقطعيه", "فني اشعه مقطعيه"],
  },
  {
    id: "mri-radiographer", family: "health",
    display: { en: "MRI Radiographer", ar: "أخصائي رنين مغناطيسي" },
    specialization: { en: "Magnetic Resonance Imaging", ar: "التصوير بالرنين المغناطيسي" },
    aliases: ["mri radiographer", "mri technologist", "magnetic resonance technologist", "اخصائي رنين مغناطيسي", "فني رنين"],
  },
  {
    id: "mammographer", family: "health",
    display: { en: "Mammographer", ar: "أخصائي تصوير الثدي" },
    specialization: { en: "Mammography", ar: "تصوير الثدي الشعاعي" },
    aliases: ["mammographer", "mammography technologist", "اخصائي تصوير الثدي"],
  },
  {
    id: "nurse", family: "health",
    display: { en: "Nurse", ar: "ممرض" },
    aliases: ["nurse", "registered nurse", "staff nurse", "rn", "ممرض", "ممرضه", "تمريض"],
  },
  {
    id: "pharmacist", family: "health",
    display: { en: "Pharmacist", ar: "صيدلي" },
    aliases: ["pharmacist", "clinical pharmacist", "صيدلي", "صيدليه", "صيدلانى", "صيدلاني"],
  },
  {
    id: "lab-technologist", family: "health",
    display: { en: "Laboratory Technologist", ar: "أخصائي مختبر" },
    aliases: ["laboratory technologist", "lab technologist", "medical laboratory technologist", "lab technician", "اخصائي مختبر", "فني مختبر", "محلل مختبر"],
  },

  /* ── education ── */
  {
    id: "primary-teacher", family: "education",
    display: { en: "Primary School Teacher", ar: "معلم مرحلة ابتدائية" },
    specialization: { en: "Primary education", ar: "التعليم الابتدائي" },
    aliases: ["primary school teacher", "primary teacher", "elementary teacher", "معلم ابتدائي", "معلم مرحله ابتدائيه"],
  },
  {
    id: "secondary-teacher", family: "education",
    display: { en: "Secondary School Teacher", ar: "معلم مرحلة ثانوية" },
    specialization: { en: "Secondary education", ar: "التعليم الثانوي" },
    aliases: ["secondary school teacher", "secondary teacher", "high school teacher", "معلم ثانوي", "معلم مرحله ثانويه"],
  },
  {
    id: "english-teacher", family: "education",
    display: { en: "English Teacher", ar: "معلم لغة إنجليزية" },
    specialization: { en: "English language", ar: "اللغة الإنجليزية" },
    aliases: ["english teacher", "english language teacher", "esl teacher", "efl teacher", "معلم لغه انجليزيه", "مدرس لغه انجليزيه", "معلم انجليزي"],
  },
  {
    id: "mathematics-teacher", family: "education",
    display: { en: "Mathematics Teacher", ar: "معلم رياضيات" },
    specialization: { en: "Mathematics", ar: "الرياضيات" },
    aliases: ["mathematics teacher", "maths teacher", "math teacher", "معلم رياضيات", "مدرس رياضيات"],
  },
  {
    id: "science-teacher", family: "education",
    display: { en: "Science Teacher", ar: "معلم علوم" },
    specialization: { en: "Science", ar: "العلوم" },
    aliases: ["science teacher", "physics teacher", "chemistry teacher", "biology teacher", "معلم علوم", "معلم فيزياء", "معلم كيمياء", "معلم احياء"],
  },
  {
    id: "special-education-teacher", family: "education",
    display: { en: "Special Education Teacher", ar: "معلم تربية خاصة" },
    specialization: { en: "Special education", ar: "التربية الخاصة" },
    aliases: ["special education teacher", "special needs teacher", "معلم تربيه خاصه", "معلم صعوبات تعلم"],
  },
  {
    id: "university-lecturer", family: "education",
    display: { en: "University Lecturer", ar: "محاضر جامعي" },
    aliases: ["university lecturer", "lecturer", "assistant professor", "محاضر جامعي", "محاضر", "استاذ مساعد"],
  },

  /* ── engineering ── */
  {
    id: "civil-engineer", family: "engineering",
    display: { en: "Civil Engineer", ar: "مهندس مدني" },
    aliases: ["civil engineer", "structural engineer", "مهندس مدني", "مهندس انشائي"],
  },
  {
    id: "mechanical-engineer", family: "engineering",
    display: { en: "Mechanical Engineer", ar: "مهندس ميكانيكي" },
    aliases: ["mechanical engineer", "مهندس ميكانيكي", "مهندس ميكانيكا"],
  },
  {
    id: "electrical-engineer", family: "engineering",
    display: { en: "Electrical Engineer", ar: "مهندس كهربائي" },
    aliases: ["electrical engineer", "مهندس كهربائي", "مهندس كهرباء"],
  },
  {
    id: "industrial-engineer", family: "engineering",
    display: { en: "Industrial Engineer", ar: "مهندس صناعي" },
    aliases: ["industrial engineer", "مهندس صناعي"],
  },

  /* ── finance ── */
  {
    id: "accountant", family: "finance",
    display: { en: "Accountant", ar: "محاسب" },
    aliases: ["accountant", "financial accountant", "general accountant", "محاسب", "محاسبه", "محاسب عام"],
  },
  {
    id: "auditor", family: "finance",
    display: { en: "Auditor", ar: "مراجع" },
    aliases: ["auditor", "internal auditor", "external auditor", "مراجع", "مدقق", "مدقق حسابات", "مراجع داخلي"],
  },

  /* ── it ── */
  {
    id: "software-developer", family: "it",
    display: { en: "Software Developer", ar: "مطوّر برمجيات" },
    aliases: ["software developer", "software engineer", "developer", "programmer", "backend developer", "frontend developer", "full stack developer", "مطور برمجيات", "مبرمج", "مهندس برمجيات"],
  },
  {
    id: "it-support", family: "it",
    display: { en: "IT Support Specialist", ar: "أخصائي دعم تقني" },
    specialization: { en: "Information technology", ar: "تقنية المعلومات" },
    aliases: ["it support", "it support specialist", "help desk", "technical support", "اخصائي دعم تقني", "دعم فني", "فني حاسب"],
  },
  {
    id: "network-engineer", family: "it",
    display: { en: "Network Engineer", ar: "مهندس شبكات" },
    aliases: ["network engineer", "network administrator", "مهندس شبكات", "مسؤول شبكات"],
  },

  /* ── the rest ── */
  {
    id: "hr-specialist", family: "admin",
    display: { en: "Human Resources Specialist", ar: "أخصائي موارد بشرية" },
    aliases: ["human resources specialist", "hr specialist", "hr officer", "اخصائي موارد بشريه", "موارد بشريه"],
  },
  {
    id: "project-manager", family: "admin",
    display: { en: "Project Manager", ar: "مدير مشاريع" },
    aliases: ["project manager", "programme manager", "مدير مشاريع", "مدير مشروع"],
  },
  {
    id: "admin-assistant", family: "admin",
    display: { en: "Administrative Assistant", ar: "مساعد إداري" },
    aliases: ["administrative assistant", "admin assistant", "secretary", "office administrator", "مساعد اداري", "سكرتير", "موظف اداري"],
  },
  {
    id: "sales-representative", family: "sales",
    display: { en: "Sales Representative", ar: "مندوب مبيعات" },
    aliases: ["sales representative", "sales rep", "sales executive", "مندوب مبيعات", "مسؤول مبيعات"],
  },
  {
    id: "customer-service", family: "sales",
    display: { en: "Customer Service Representative", ar: "موظف خدمة عملاء" },
    aliases: ["customer service representative", "customer service", "call center agent", "خدمه عملاء", "موظف خدمه عملاء", "خدمة العملاء"],
  },
  {
    id: "lawyer", family: "legal",
    display: { en: "Lawyer", ar: "محامٍ" },
    aliases: ["lawyer", "attorney", "legal counsel", "محامي", "محاميه", "مستشار قانوني"],
  },
];

/* ─────────────────────────── broad titles ─────────────────────────── */

/**
 * Titles that are a CATEGORY of jobs, not a job — and the one question that resolves each.
 *
 * The test for inclusion is not "is it vague" but "would suggestions for it be wrong for most people
 * who typed it". "Teacher" fails that test: a primary teacher and a university lecturer share the
 * word and not the work. "Nurse" passes it — nurses specialise, but the core of the job and every
 * Saudi credential is shared, so a nurse who typed "nurse" gets useful answers without being
 * interrogated.
 *
 * One question, never two. A form that asks twice before showing anything is a form people leave.
 */
interface BroadTitle {
  match: string[];
  question: Bilingual;
  options: string[];
}

const BROAD: BroadTitle[] = [
  {
    match: ["teacher", "معلم", "معلمه", "مدرس", "مدرسه"],
    question: {
      en: "Which kind of teaching? It changes the skills and the license.",
      ar: "أي نوع من التعليم؟ يغيّر المهارات والرخصة المطلوبة.",
    },
    options: [
      "primary-teacher", "secondary-teacher", "english-teacher",
      "mathematics-teacher", "science-teacher", "special-education-teacher", "university-lecturer",
    ],
  },
  {
    match: ["technician", "فني", "تقني"],
    question: {
      en: "A technician in which field?",
      ar: "فني في أي مجال؟",
    },
    options: ["radiology-technologist", "lab-technologist", "it-support", "electrical-engineer", "mechanical-engineer"],
  },
  {
    match: ["engineer", "مهندس", "مهندسه"],
    question: {
      en: "Which engineering discipline?",
      ar: "أي تخصص هندسي؟",
    },
    options: ["civil-engineer", "mechanical-engineer", "electrical-engineer", "industrial-engineer", "software-developer", "network-engineer"],
  },
  {
    match: ["specialist", "اخصائي", "اخصائيه"],
    question: {
      en: "A specialist in what?",
      ar: "أخصائي في ماذا؟",
    },
    options: ["radiology-technologist", "lab-technologist", "hr-specialist", "it-support"],
  },
  {
    match: ["manager", "مدير", "مديره"],
    question: {
      en: "Which kind of manager?",
      ar: "مدير في أي مجال؟",
    },
    options: ["project-manager", "sales-representative", "hr-specialist", "accountant"],
  },
];

/* ─────────────────────────── seniority ─────────────────────────── */

/**
 * Seniority read out of the title, in both languages.
 *
 * Order matters: "senior" is checked before "lead" so "Senior Lead" reads as lead, and "assistant"
 * before "manager" so "Assistant Manager" is not a manager. This is the kind of ordering that looks
 * arbitrary and is not — each pair was chosen because the other order gives the wrong answer.
 */
const SENIORITY: Array<[Seniority, string[]]> = [
  ["lead", ["lead", "principal", "chief", "رئيس", "قائد"]],
  ["manager", ["manager", "head of", "director", "مدير", "رئيس قسم"]],
  ["senior", ["senior", "sr", "اول", "خبير", "كبير"]],
  ["junior", ["junior", "jr", "trainee", "intern", "assistant", "مبتدئ", "متدرب", "مساعد"]],
];

function readSeniority(norm: string): Seniority {
  /* Junior markers are checked FIRST, because "Assistant Manager" is junior and contains both. */
  for (const [level, words] of [...SENIORITY].reverse()) {
    if (words.some((w) => norm === w || norm.startsWith(`${w} `) || norm.includes(` ${w} `) || norm.endsWith(` ${w}`))) {
      return level;
    }
  }
  return "";
}

/* ─────────────────────────── matching ─────────────────────────── */

const index = OCCUPATIONS.map((o) => ({
  occ: o,
  keys: [...new Set([normalizeLabel(o.display.en), normalizeLabel(o.display.ar), ...o.aliases.map(normalizeLabel)])],
}));

/**
 * Strip seniority words so "Senior Radiographer" matches "radiographer".
 *
 * Returns the ORIGINAL when stripping would empty it, and that guard is not defensive padding — the
 * tests caught it. "Manager" and "مدير" are seniority markers AND broad job titles, so a naive strip
 * turns the whole input into an empty string: the broad-title check then matches nothing, the scorer
 * matches nothing, and someone who typed a real (if vague) job title gets silence instead of the
 * clarifying question the resolver exists to ask.
 */
function withoutSeniority(norm: string): string {
  let out = ` ${norm} `;
  for (const [, words] of SENIORITY) {
    for (const w of words) out = out.replace(new RegExp(`\\s${w}\\s`, "g"), " ");
  }
  const stripped = out.replace(/\s+/g, " ").trim();
  return stripped || norm;
}

interface Scored { occ: Occupation; score: number }

function score(norm: string): Scored[] {
  const bare = withoutSeniority(norm);
  const out: Scored[] = [];
  for (const { occ, keys } of index) {
    let best = 0;
    for (const k of keys) {
      if (!k) continue;
      if (k === norm || k === bare) { best = Math.max(best, 1); continue; }
      /*
       * Containment in either direction, scored by how much of the longer string is explained.
       *
       * "معلم لغه انجليزيه" contains the alias "معلم لغه انجليزيه" exactly (1.0); "senior english
       * language teacher" contains "english teacher" only after seniority stripping, which is why
       * `bare` is tried too. A short alias inside a long title scores low on purpose — "it" inside
       * "audit" must not resolve to IT support, which is what the length ratio prevents.
       */
      if (bare.includes(k) || k.includes(bare)) {
        const ratio = Math.min(k.length, bare.length) / Math.max(k.length, bare.length);
        if (ratio >= 0.5) best = Math.max(best, 0.55 + ratio * 0.35);
      }
    }
    if (best > 0) out.push({ occ, score: best });
  }
  return out.sort((a, b) => b.score - a.score);
}

/* ─────────────────────────── the resolver ─────────────────────────── */

const byId = new Map(OCCUPATIONS.map((o) => [o.id, o]));

/** Confidence at or below this asks for clarification rather than guessing. */
export const CONFIDENCE_FLOOR = 0.55;

/**
 * Resolve a title the user typed.
 *
 * `raw` is preserved and `display` falls back to it rather than to an English guess. That matters
 * for an Arabic CV: a user who typed "منسق سلامة" and matched nothing must see their own words on
 * their own CV, not a transliteration and not the nearest English occupation.
 */
export function resolveOccupation(raw: string, opts: { cvLang?: "ar" | "en" } = {}): Resolution {
  const typed = String(raw ?? "").trim();
  const norm = normalizeLabel(typed);
  const cvLang = opts.cvLang === "ar" ? "ar" : "en";
  const seniority = readSeniority(norm);

  const unresolved = (confidence: number, extra: Partial<Resolution> = {}): Resolution => ({
    occupationId: "", family: "unknown",
    /* Their words, in both slots. Never an invented translation of a title we did not recognise. */
    display: { en: typed, ar: typed },
    specialization: null, seniority, confidence,
    alternatives: [], clarificationRequired: false, clarification: null, raw: typed, ...extra,
  });

  if (!norm) return unresolved(0);

  /*
   * A BROAD title is checked before an exact match, and the order is the point.
   *
   * "معلم" normalises to a broad marker AND is a prefix of several occupation aliases. Matching
   * first would silently pick whichever teaching occupation happened to score highest — which is
   * exactly the "confidently wrong" behaviour the clarification exists to prevent.
   */
  const bare = withoutSeniority(norm);
  const broad = BROAD.find((b) => b.match.some((m) => normalizeLabel(m) === bare));
  if (broad) {
    const options = broad.options
      .map((id) => byId.get(id))
      .filter((o): o is Occupation => Boolean(o))
      .map((o) => ({ occupationId: o.id, display: o.display }));
    return unresolved(0.3, {
      clarificationRequired: true,
      clarification: { question: broad.question, options },
      alternatives: options.slice(0, 3).map((o) => ({ ...o, confidence: 0.3 })),
    });
  }

  const scored = score(norm);
  if (!scored.length) return unresolved(0.15);

  const top = scored[0];
  const resolved: Resolution = {
    occupationId: top.occ.id,
    family: top.occ.family,
    display: top.occ.display,
    specialization: top.occ.specialization ?? null,
    seniority,
    confidence: Math.min(1, top.score),
    alternatives: scored.slice(1, 4).map((s) => ({
      occupationId: s.occ.id, display: s.occ.display, confidence: Math.min(1, s.score),
    })),
    clarificationRequired: false,
    clarification: null,
    raw: typed,
  };

  /*
   * A weak match that has RIVALS is a clarification, not a guess.
   *
   * A weak match with no rivals is just a weak match — asking "did you mean X?" when X is the only
   * candidate wastes the user's time and teaches them to dismiss the question.
   */
  if (resolved.confidence < CONFIDENCE_FLOOR && resolved.alternatives.length) {
    return {
      ...resolved,
      clarificationRequired: true,
      clarification: {
        question: {
          en: "Which of these is closest to your job?",
          ar: "أي هذه أقرب إلى وظيفتك؟",
        },
        options: [
          { occupationId: top.occ.id, display: top.occ.display },
          ...resolved.alternatives.map((a) => ({ occupationId: a.occupationId, display: a.display })),
        ],
      },
    };
  }

  void cvLang;
  return resolved;
}

/** Look one up by id — for applying a clarification answer. */
export function occupationById(id: string): Occupation | null {
  return byId.get(id) ?? null;
}

/** Every id, for tests and for the health report. */
export const OCCUPATION_IDS = OCCUPATIONS.map((o) => o.id);
export const OCCUPATION_COUNT = OCCUPATIONS.length;
