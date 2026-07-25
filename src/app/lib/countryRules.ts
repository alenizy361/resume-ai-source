/**
 * Which credentials exist where, held as data instead of asked per user.
 *
 * The alternative — letting the model search the web for every applicant's occupation — costs
 * a search on every CV and scales linearly with traffic forever, to answer a question whose
 * answer changes maybe twice a year. Worse, it answers it differently each time: the same
 * Riyadh radiographer can be told SCFHS on Monday and ARRT on Tuesday, and ARRT is an American
 * registration that a Saudi hospital does not ask for. A confidently wrong credential is worse
 * than no credential, because the user has no way to know it is wrong and will put it on a CV.
 *
 * So the rules live here, they are versioned by `RULES_VERSION` in `aiCache.ts`, and the model
 * is given them rather than asked for them.
 *
 * ── STATUS: every rule below is `encoded`, not `verified` ──
 *
 * They were written from general knowledge of the Saudi professional-licensing landscape and
 * they have NOT been checked against the authorities' own pages, because this sandbox cannot
 * reach those hosts — the environment's network policy answers 403 to anything outside GitHub.
 * That is recorded per rule rather than glossed: `status: "encoded"` means usable as a
 * suggestion the user confirms, and not usable as a claim the product makes.
 *
 * `sourceUrl` is filled in on every entry so verification is one visit each, and
 * `needsVerificationBy` says when it stops being reasonable to keep trusting it.
 *
 * What the product does with an `encoded` rule is exactly what it does with a `verified` one:
 * offer it UNCHECKED. "SCFHS registration exists for this job" is a prompt for the user to
 * confirm; only they can say they hold it. That is why an unverified rule is safe to ship — the
 * confirmation step is the guarantee, not the data's provenance.
 */

export type RuleStatus =
  /** Written from general knowledge, source recorded, not yet checked against it. */
  | "encoded"
  /** An administrator opened the source and confirmed it on `verifiedAt`. */
  | "verified"
  /** Checked and found wrong or obsolete. Kept so it is not re-encoded by mistake. */
  | "retired";

export interface CredentialRule {
  /** Stable id, referenced from role packs and cache keys. */
  id: string;
  country: string;
  /** Occupation families this applies to, matched against the normalized occupation. */
  occupations: string[];
  title: { en: string; ar: string };
  issuer: { en: string; ar: string };
  /** What kind of thing it is — drives whether an expiry date is asked for. */
  kind: "licence" | "registration" | "certification" | "membership";
  /** True when practising the occupation legally requires it, as far as is encoded. */
  mandatory: boolean;
  sourceUrl: string;
  status: RuleStatus;
  /** ISO date. For `encoded` rules this is when the text was written, not when it was checked. */
  encodedAt: string;
  verifiedAt?: string;
  /** ISO date after which an unverified rule should not be shown without a re-check. */
  needsVerificationBy: string;
}

/**
 * Credentials that belong to ANOTHER market and must never be suggested for this one.
 *
 * This list is the reason the file exists. A general-purpose model asked "what certifications
 * does a radiographer need" answers with the American ones, because that is what most of its
 * training data is about. Putting ARRT on a Saudi CV is not a small error: it signals to a
 * Riyadh recruiter either that the applicant misunderstands the market or that the CV was
 * generated, and both are fatal.
 */
export interface ExclusionRule {
  id: string;
  /** The credential to keep out. */
  name: string;
  /** The market it actually belongs to — shown when explaining the exclusion. */
  belongsTo: string;
  occupations: string[];
  /** The country this exclusion applies IN. */
  excludedIn: string[];
  /** What to offer instead, by `CredentialRule.id`. */
  insteadOf: string[];
  sourceUrl: string;
  status: RuleStatus;
  encodedAt: string;
  needsVerificationBy: string;
}

const ENCODED = "2026-07-25";
/** Twelve months. A licensing regime does not usually move faster, and rarely slower. */
const RECHECK = "2027-07-25";

const base = { status: "encoded" as RuleStatus, encodedAt: ENCODED, needsVerificationBy: RECHECK };

export const CREDENTIAL_RULES: CredentialRule[] = [
  {
    ...base,
    id: "sa-scfhs-registration",
    country: "sa",
    occupations: [
      "radiology technologist", "radiographer", "nurse", "pharmacist", "laboratory technologist",
      "physiotherapist", "respiratory therapist", "dentist", "physician", "medical technologist",
      "أخصائي أشعة", "ممرض", "ممرضة", "صيدلي", "فني مختبر", "أخصائي علاج طبيعي",
    ],
    title: { en: "SCFHS Professional Classification & Registration", ar: "التصنيف والتسجيل المهني — الهيئة السعودية للتخصصات الصحية" },
    issuer: { en: "Saudi Commission for Health Specialties", ar: "الهيئة السعودية للتخصصات الصحية" },
    kind: "registration",
    mandatory: true,
    sourceUrl: "https://scfhs.org.sa",
  },
  {
    ...base,
    id: "sa-etec-teacher-licence",
    country: "sa",
    occupations: ["teacher", "school teacher", "mathematics teacher", "science teacher", "english teacher", "معلم", "معلمة", "مدرس"],
    title: { en: "Professional Teaching Licence", ar: "الرخصة المهنية للمعلمين" },
    issuer: { en: "Education & Training Evaluation Commission (ETEC)", ar: "هيئة تقويم التعليم والتدريب" },
    kind: "licence",
    mandatory: true,
    sourceUrl: "https://etec.gov.sa",
  },
  {
    ...base,
    id: "sa-socpa-membership",
    country: "sa",
    occupations: ["accountant", "auditor", "financial accountant", "chief accountant", "محاسب", "مراجع", "مدقق حسابات"],
    title: { en: "SOCPA Fellowship / Membership", ar: "عضوية الهيئة السعودية للمراجعين والمحاسبين" },
    issuer: { en: "Saudi Organization for Chartered and Professional Accountants", ar: "الهيئة السعودية للمراجعين والمحاسبين" },
    kind: "membership",
    mandatory: false,
    sourceUrl: "https://socpa.org.sa",
  },
  {
    ...base,
    id: "sa-sce-registration",
    country: "sa",
    occupations: [
      "engineer", "civil engineer", "mechanical engineer", "electrical engineer",
      "industrial engineer", "chemical engineer", "مهندس", "مهندسة",
    ],
    title: { en: "Saudi Council of Engineers Professional Accreditation", ar: "الاعتماد المهني — الهيئة السعودية للمهندسين" },
    issuer: { en: "Saudi Council of Engineers", ar: "الهيئة السعودية للمهندسين" },
    kind: "registration",
    mandatory: true,
    sourceUrl: "https://saudieng.sa",
  },
  {
    ...base,
    id: "sa-bar-licence",
    country: "sa",
    occupations: ["lawyer", "attorney", "legal counsel", "محام", "محامية", "مستشار قانوني"],
    title: { en: "Practising Licence — Saudi Bar Association", ar: "ترخيص المحاماة — الهيئة السعودية للمحامين" },
    issuer: { en: "Saudi Bar Association", ar: "الهيئة السعودية للمحامين" },
    kind: "licence",
    mandatory: true,
    sourceUrl: "https://sba.gov.sa",
  },
  {
    ...base,
    id: "sa-bls",
    country: "sa",
    occupations: [
      "radiology technologist", "radiographer", "nurse", "physiotherapist",
      "respiratory therapist", "paramedic", "أخصائي أشعة", "ممرض", "ممرضة",
    ],
    title: { en: "Basic Life Support (BLS)", ar: "دعم الحياة الأساسي" },
    issuer: { en: "Accredited training provider", ar: "جهة تدريب معتمدة" },
    kind: "certification",
    mandatory: false,
    sourceUrl: "https://scfhs.org.sa",
  },
];

export const EXCLUSION_RULES: ExclusionRule[] = [
  {
    ...base,
    id: "excl-arrt-in-sa",
    name: "ARRT",
    belongsTo: "United States",
    occupations: ["radiology technologist", "radiographer", "أخصائي أشعة"],
    excludedIn: ["sa", "ae", "kw", "qa", "bh", "om"],
    insteadOf: ["sa-scfhs-registration"],
    sourceUrl: "https://www.arrt.org",
  },
  {
    ...base,
    id: "excl-nclex-in-sa",
    name: "NCLEX-RN",
    belongsTo: "United States",
    occupations: ["nurse", "ممرض", "ممرضة"],
    excludedIn: ["sa"],
    insteadOf: ["sa-scfhs-registration"],
    sourceUrl: "https://www.nclex.com",
  },
  {
    ...base,
    id: "excl-uscpa-in-sa",
    name: "US CPA",
    belongsTo: "United States",
    occupations: ["accountant", "auditor", "محاسب", "مراجع"],
    excludedIn: ["sa"],
    insteadOf: ["sa-socpa-membership"],
    sourceUrl: "https://www.aicpa.org",
  },
  {
    ...base,
    id: "excl-qts-in-sa",
    name: "QTS (Qualified Teacher Status)",
    belongsTo: "United Kingdom",
    occupations: ["teacher", "معلم", "معلمة", "مدرس"],
    excludedIn: ["sa"],
    insteadOf: ["sa-etec-teacher-licence"],
    sourceUrl: "https://www.gov.uk/guidance/qualified-teacher-status-qts",
  },
  {
    ...base,
    id: "excl-pe-in-sa",
    name: "PE (Professional Engineer, US state licence)",
    belongsTo: "United States",
    occupations: ["engineer", "civil engineer", "mechanical engineer", "electrical engineer", "مهندس"],
    excludedIn: ["sa"],
    insteadOf: ["sa-sce-registration"],
    sourceUrl: "https://ncees.org",
  },
];

/* ─────────────────────────── lookup ─────────────────────────── */

/**
 * A country as the rules key them: ISO-3166 alpha-2, lower case.
 *
 * ── the bug this exists to fix ──
 *
 * The rules are keyed `"sa"`. The country FIELD is free text, and what people type into it is
 * "Saudi Arabia", "السعودية", "KSA" — so `r.country === c` matched nothing, and the consequences
 * were silent and exactly backwards:
 *
 *   · `credentialsFor` returned [], so every credential id the blueprint produced was filtered out
 *     and the credentials step offered nothing
 *   · `exclusionsFor` returned [], so the ARRT-on-a-Saudi-CV guard — the reason this file exists —
 *     never fired for anyone who wrote their country in words
 *
 * Measured, not assumed: `credentialsFor("radiology technologist", "Saudi Arabia")` returned zero
 * rules while `"sa"` returned two.
 *
 * ── what it covers, and what it deliberately does not ──
 *
 * The markets this product has rules or exclusions for, under the names its users actually write,
 * in both languages. It is not a world atlas: an unrecognised country returns "", every lookup then
 * finds nothing, and the product behaves exactly as it does today for a market it has not encoded —
 * which is the honest outcome, and better than guessing a jurisdiction for someone's licence.
 */
const COUNTRY_NAMES: Record<string, string[]> = {
  sa: [
    "sa", "ksa", "sau", "saudi", "saudi arabia", "kingdom of saudi arabia",
    "السعودية", "السعوديه", "المملكة العربية السعودية", "المملكه العربيه السعوديه", "المملكة",
  ],
  ae: [
    "ae", "uae", "are", "emirates", "united arab emirates", "dubai", "abu dhabi",
    "الإمارات", "الامارات", "الإمارات العربية المتحدة", "دبي", "أبوظبي", "ابوظبي",
  ],
  qa: ["qa", "qat", "qatar", "قطر", "دولة قطر"],
  kw: ["kw", "kwt", "kuwait", "الكويت", "دولة الكويت"],
  bh: ["bh", "bhr", "bahrain", "البحرين", "مملكة البحرين"],
  om: ["om", "omn", "oman", "عمان", "سلطنة عمان", "عُمان"],
  eg: ["eg", "egy", "egypt", "مصر", "جمهورية مصر العربية"],
  jo: ["jo", "jor", "jordan", "الأردن", "الاردن", "المملكة الأردنية الهاشمية"],
  us: ["us", "usa", "united states", "united states of america", "america", "أمريكا", "امريكا", "الولايات المتحدة"],
  gb: ["gb", "uk", "gbr", "united kingdom", "britain", "great britain", "england", "بريطانيا", "المملكة المتحدة", "إنجلترا"],
};

/** Built once: every spelling above, pointing at its code. */
const COUNTRY_INDEX: Map<string, string> = new Map(
  Object.entries(COUNTRY_NAMES).flatMap(([code, names]) => names.map((n) => [n, code] as const)),
);

export function countryCode(raw: string): string {
  const c = String(raw ?? "").trim().toLowerCase()
    /* Arabic orthography varies where it does not change the word: أ/إ/آ for ا, ة for ه, and the
       diacritics people's keyboards insert. Folding them means "السعوديه" and "السعودية" are one
       country rather than two, which is how they are written in practice. */
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
  if (!c) return "";

  const direct = COUNTRY_INDEX.get(c);
  if (direct) return direct;

  /* "Riyadh, Saudi Arabia" and "based in the UAE" are things people type into a country field.
     Longest match first, so "united arab emirates" is not shadowed by a shorter entry. */
  const hit = [...COUNTRY_INDEX.keys()]
    .filter((name) => name.length >= 4 && c.includes(name))
    .sort((a, b) => b.length - a.length)[0];
  return hit ? COUNTRY_INDEX.get(hit)! : "";
}

/**
 * Substring matching in BOTH directions, and that is not sloppiness.
 *
 * A user types "Senior Radiology Technologist — CT" and the rule says "radiology technologist";
 * a user types "nurse" and the rule says "registered nurse". Neither direction alone catches
 * both, and requiring exact equality catches neither. The cost of a loose match here is a
 * credential offered to someone who does not need it — which they leave unticked, because
 * nothing is ever pre-checked.
 */
function occupationMatches(occupation: string, list: string[]): boolean {
  const o = occupation.trim().toLowerCase();
  if (!o) return false;
  return list.some((entry) => {
    const e = entry.toLowerCase();
    return o.includes(e) || e.includes(o);
  });
}

/** Rules still fit to show: right country, right occupation, not retired, not expired. */
export function credentialsFor(
  occupation: string,
  country: string,
  today = ENCODED,
): CredentialRule[] {
  const c = countryCode(country);
  if (!c) return [];
  return CREDENTIAL_RULES.filter((r) =>
    r.country === c
    && r.status !== "retired"
    && r.needsVerificationBy >= today
    && occupationMatches(occupation, r.occupations));
}

export function exclusionsFor(occupation: string, country: string): ExclusionRule[] {
  const c = countryCode(country);
  if (!c) return [];
  return EXCLUSION_RULES.filter((r) =>
    r.status !== "retired"
    && r.excludedIn.includes(c)
    && occupationMatches(occupation, r.occupations));
}

/**
 * Is this occupation covered at all?
 *
 * The one gate that decides whether a web search is justified (Part 15): an occupation with no
 * encoded rules is the case where the model genuinely knows more than this file does. Everything
 * else must not pay for a search.
 */
export function isCovered(occupation: string, country: string): boolean {
  return credentialsFor(occupation, country).length > 0;
}

/** Rules whose recheck date has passed — the administrator's work queue. */
export function staleRules(today: string): Array<{ id: string; needsVerificationBy: string }> {
  return [...CREDENTIAL_RULES, ...EXCLUSION_RULES]
    .filter((r) => r.status !== "retired" && r.needsVerificationBy < today)
    .map((r) => ({ id: r.id, needsVerificationBy: r.needsVerificationBy }));
}

/** Every rule's provenance, for the health endpoint and the admin queue. */
export function ruleProvenance(): {
  total: number; encoded: number; verified: number; retired: number; earliestRecheck: string;
} {
  const all = [...CREDENTIAL_RULES, ...EXCLUSION_RULES];
  return {
    total: all.length,
    encoded: all.filter((r) => r.status === "encoded").length,
    verified: all.filter((r) => r.status === "verified").length,
    retired: all.filter((r) => r.status === "retired").length,
    earliestRecheck: all.map((r) => r.needsVerificationBy).sort()[0] ?? "",
  };
}
