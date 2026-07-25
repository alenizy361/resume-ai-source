/**
 * The terms that must always come out the same way, held as a table rather than asked of a model.
 *
 * ── why a glossary at all ──
 *
 * "الأشعة المقطعية" is Computed Tomography. It is not "sectional radiation", "tomographic imaging"
 * or "CT scanning department", and a model asked the same question twice will happily produce two of
 * those. On a CV that inconsistency is not cosmetic: an applicant tracking system matches strings, so
 * a resume that says "Computed Tomography" in one bullet and "CT scanning" in another has told the
 * scanner about two different skills and demonstrated neither twice.
 *
 * A table fixes the term once. It is also free and instant, which matters more than it sounds: the
 * standard professional vocabulary is most of what a CV translation touches, so answering it from
 * data leaves the model to do only the part that genuinely needs judgement — the sentences.
 *
 * ── the abbreviation rule ──
 *
 * Arabic professional writing keeps Latin abbreviations. "نظام أرشفة الصور والاتصالات (PACS)" is how
 * a Saudi radiology CV is actually written, and translating PACS into an Arabic acronym would produce
 * something no recruiter and no ATS has ever seen. So each entry carries the abbreviation separately
 * from the term, and the renderer decides: full term plus abbreviation on first use, abbreviation
 * alone afterwards.
 *
 * ── status ──
 *
 * Every entry is `encoded` for the same reason the country rules are: written from professional
 * knowledge and not yet checked against a published bilingual standard, because this environment
 * cannot reach one. Shipping is safe because a glossary hit is still shown to the user for review
 * before it reaches a CV — but the status is recorded rather than implied.
 */

export interface GlossaryEntry {
  /** Language-neutral id, so a skill confirmed in Arabic is the same skill in English. */
  id: string;
  ar: string;
  en: string;
  /** Kept in its own script in BOTH languages when the market writes it that way. */
  abbr?: string;
  /** Occupation families this term belongs to. Empty means general professional vocabulary. */
  families: string[];
  /** Where the term is standard. Empty means everywhere. */
  countries: string[];
  note?: string;
  status: "encoded" | "verified";
}

export const GLOSSARY_VERSION = "g1";

const E = (
  id: string, ar: string, en: string,
  opts: { abbr?: string; families?: string[]; countries?: string[]; note?: string } = {},
): GlossaryEntry => ({
  id, ar, en,
  abbr: opts.abbr,
  families: opts.families ?? [],
  countries: opts.countries ?? [],
  note: opts.note,
  status: "encoded",
});

export const GLOSSARY: GlossaryEntry[] = [
  /* ── imaging ── */
  E("imaging.ct", "الأشعة المقطعية", "Computed Tomography", { abbr: "CT", families: ["health"] }),
  E("imaging.xray", "الأشعة السينية", "General X-ray", { families: ["health"] }),
  E("imaging.mri", "التصوير بالرنين المغناطيسي", "Magnetic Resonance Imaging", { abbr: "MRI", families: ["health"] }),
  E("imaging.mammography", "تصوير الثدي الشعاعي", "Mammography", { families: ["health"] }),
  E("imaging.fluoroscopy", "التنظير الفلوري", "Fluoroscopy", { families: ["health"] }),
  E("imaging.ultrasound", "التصوير بالموجات فوق الصوتية", "Ultrasound", { families: ["health"] }),
  E("imaging.mobile", "التصوير المتنقل", "Mobile imaging", { families: ["health"] }),
  E("imaging.bmd", "قياس كثافة معادن العظام", "Bone Mineral Density", { abbr: "BMD", families: ["health"] }),

  /* ── systems ── */
  E("sys.pacs", "نظام أرشفة الصور والاتصالات", "Picture Archiving and Communication System", { abbr: "PACS", families: ["health"] }),
  E("sys.ris", "نظام معلومات الأشعة", "Radiology Information System", { abbr: "RIS", families: ["health"] }),
  E("sys.dicom", "معيار دايكوم لتبادل الصور الطبية", "DICOM", { abbr: "DICOM", families: ["health"] }),
  E("sys.his", "نظام معلومات المستشفى", "Hospital Information System", { abbr: "HIS", families: ["health"] }),
  E("sys.worklist", "قائمة عمل الجهاز", "Modality worklist", { families: ["health"] }),

  /* ── clinical practice ── */
  E("clin.positioning", "وضعية المريض", "Patient Positioning", { families: ["health"] }),
  E("clin.identification", "التحقق من هوية المريض", "Patient Identification", { families: ["health"] }),
  E("clin.radiation_protection", "الوقاية من الإشعاع", "Radiation Protection", { families: ["health"] }),
  E("clin.image_quality", "تقييم جودة الصور", "Image Quality Assessment", { families: ["health"] }),
  E("clin.infection_control", "مكافحة العدوى", "Infection Control", { families: ["health"] }),
  E("clin.contrast", "سلامة استخدام مواد التباين", "Contrast Media Safety", { families: ["health"] }),
  E("clin.emergency", "التصوير في الحالات الطارئة", "Emergency Imaging", { families: ["health"] }),
  E("clin.paediatric", "تصوير الأطفال", "Paediatric Imaging", { families: ["health"] }),

  /* ── credentials ── */
  E("cred.scfhs_registration", "التسجيل المهني لدى الهيئة السعودية للتخصصات الصحية",
    "SCFHS Professional Registration", { families: ["health"], countries: ["sa"] }),
  E("cred.scfhs_classification", "التصنيف المهني من الهيئة السعودية للتخصصات الصحية",
    "SCFHS Professional Classification", {
      families: ["health"], countries: ["sa"],
      /* Two different things, and merging them is a factual error about the person's status. */
      note: "Classification and registration are separate steps. Never combine them into one line.",
    }),
  E("org.scfhs", "الهيئة السعودية للتخصصات الصحية", "Saudi Commission for Health Specialties",
    { abbr: "SCFHS", families: ["health"], countries: ["sa"] }),
  E("cred.bls", "الإنعاش القلبي الرئوي الأساسي", "Basic Life Support", { abbr: "BLS", families: ["health"] }),
  E("cred.acls", "دعم الحياة القلبي المتقدم", "Advanced Cardiac Life Support", { abbr: "ACLS", families: ["health"] }),
  E("cred.rso", "مسؤول الحماية من الإشعاع", "Radiation Safety Officer", { abbr: "RSO", families: ["health"] }),
  E("org.etec", "هيئة تقويم التعليم والتدريب", "Education & Training Evaluation Commission",
    { abbr: "ETEC", families: ["education"], countries: ["sa"] }),
  E("cred.teaching_licence", "الرخصة المهنية للمعلمين", "Professional Teaching Licence",
    { families: ["education"], countries: ["sa"] }),
  E("org.socpa", "الهيئة السعودية للمراجعين والمحاسبين",
    "Saudi Organization for Chartered and Professional Accountants", { abbr: "SOCPA", families: ["finance"], countries: ["sa"] }),
  E("org.sce", "الهيئة السعودية للمهندسين", "Saudi Council of Engineers",
    { families: ["engineering"], countries: ["sa"] }),

  /* ── general professional vocabulary ── */
  E("gen.quality_control", "ضبط الجودة", "Quality Control", { abbr: "QC" }),
  E("gen.quality_assurance", "ضمان الجودة", "Quality Assurance", { abbr: "QA" }),
  E("gen.accreditation", "الاعتماد", "Accreditation"),
  E("gen.protocols", "البروتوكولات المعتمدة", "Approved protocols"),
  E("gen.occupational_safety", "السلامة المهنية", "Occupational Safety"),
  E("gen.training", "التدريب", "Training"),
  E("gen.supervision", "الإشراف", "Supervision"),
  E("gen.scheduling", "جدولة المواعيد", "Scheduling"),
  E("gen.reporting", "إعداد التقارير", "Reporting"),
  E("gen.documentation", "التوثيق", "Documentation"),
  E("gen.customer_service", "خدمة العملاء", "Customer Service"),
  E("gen.team_coordination", "تنسيق العمل بين الفرق", "Cross-team Coordination"),
  E("gen.budgeting", "إعداد الميزانيات", "Budgeting"),
  E("gen.reconciliation", "التسويات المحاسبية", "Account Reconciliation", { families: ["finance"] }),
  E("gen.month_end", "الإقفال الشهري", "Month-end Closing", { families: ["finance"] }),
  E("gen.curriculum", "المنهج الدراسي", "Curriculum", { families: ["education"] }),
  E("gen.lesson_planning", "تخطيط الدروس", "Lesson Planning", { families: ["education"] }),
  E("gen.assessment", "التقويم", "Assessment", { families: ["education"] }),
  E("gen.classroom_management", "إدارة الصف", "Classroom Management", { families: ["education"] }),
];

/* ─────────────────────────── lookup ─────────────────────────── */

/** Compare Arabic and English alike: fold orthography, drop punctuation, lower-case. */
function fold(s: string): string {
  return String(s ?? "")
    .replace(/[ً-ْ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const byAr = new Map<string, GlossaryEntry>();
const byEn = new Map<string, GlossaryEntry>();
const byId = new Map<string, GlossaryEntry>();
for (const e of GLOSSARY) {
  byAr.set(fold(e.ar), e);
  byEn.set(fold(e.en), e);
  if (e.abbr) byEn.set(fold(e.abbr), e);
  byId.set(e.id, e);
}

/** Exact-term lookup in either direction. Null when the glossary has nothing to say. */
export function lookup(term: string, from: "ar" | "en"): GlossaryEntry | null {
  return (from === "ar" ? byAr : byEn).get(fold(term)) ?? null;
}

export function entryById(id: string): GlossaryEntry | null {
  return byId.get(id) ?? null;
}

/**
 * Render a term in one language, with the abbreviation handled the way the market writes it.
 *
 * `first` decides the shape: "نظام أرشفة الصور والاتصالات (PACS)" on first use and "PACS" afterwards.
 * Repeating the full expansion in every bullet is how a CV reads like a glossary instead of a career.
 */
export function render(e: GlossaryEntry, lang: "ar" | "en", first = true): string {
  const term = lang === "ar" ? e.ar : e.en;
  if (!e.abbr) return term;
  /* An entry whose term IS the abbreviation (DICOM) must not render as "DICOM (DICOM)". */
  if (fold(term) === fold(e.abbr)) return term;
  return first ? `${term} (${e.abbr})` : e.abbr;
}

/**
 * Translate what the table knows, and report what it does not.
 *
 * This is the cost mechanism and the consistency mechanism at once: terms the glossary covers are
 * answered for free and identically every time, and only `unknown` reaches the model. On a radiology
 * CV that is most of the skills section resolved before a request is made.
 *
 * The terms are returned rather than substituted into prose, deliberately. Substituting strings
 * inside sentences produces the literal-translation effect the brief warns about — the sentence has
 * to be re-written by something that understands it, and the glossary's job is to fix the VOCABULARY
 * that re-writing uses, not to do the re-writing.
 */
export function applyGlossary(
  terms: string[],
  from: "ar" | "en",
): { translated: Array<{ source: string; target: string; id: string }>; unknown: string[] } {
  const translated: Array<{ source: string; target: string; id: string }> = [];
  const unknown: string[] = [];
  const to = from === "ar" ? "en" : "ar";
  for (const t of terms) {
    const hit = lookup(t, from);
    if (hit) translated.push({ source: t, target: render(hit, to), id: hit.id });
    else unknown.push(t);
  }
  return { translated, unknown };
}

/**
 * The subset worth putting in a prompt: terms that appear in the text being translated.
 *
 * Sending all fifty entries on every request would be a few hundred wasted tokens per call and, worse,
 * an invitation for the model to use vocabulary the CV never mentioned.
 */
export function glossaryFor(text: string, from: "ar" | "en", families: string[] = []): GlossaryEntry[] {
  const folded = fold(text);
  return GLOSSARY.filter((e) => {
    if (families.length && e.families.length && !e.families.some((f) => families.includes(f))) return false;
    const term = fold(from === "ar" ? e.ar : e.en);
    return term.length > 2 && folded.includes(term);
  });
}

export const GLOSSARY_SIZE = GLOSSARY.length;
