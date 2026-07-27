/**
 * One place that knows what this product is called.
 *
 * The audit found three names in circulation and no single definition: "Sira" in 43
 * files, "سيرة" in 33, and "Rabit" in eight footers plus — the actual inconsistency —
 * the assistant introducing ITSELF as Rabit ("I'm Rabit", AdvisorLanding). Rabit is the
 * company; Sira is the product; the assistant is neither. A user who reads three names
 * across four screens cannot tell which one to trust, or which one charged their card.
 *
 * So the customer-facing product name is **Sira / سيرة**, the company is **Rabit**, and
 * the two appear together only where attribution belongs — a footer, an invoice, the
 * legal pages. Nothing else may hardcode either.
 *
 * The support address is deliberately env-driven. The code currently ships the owner's
 * personal Gmail in seven user-facing places, which is not a support channel and cannot
 * be handed to a colleague. Rather than invent a support@ mailbox that does not exist,
 * this reads `NEXT_PUBLIC_SUPPORT_EMAIL` and falls back to the address already shipping
 * — so moving to a real one is an environment variable, not a code change.
 *
 * No `next/*` imports: `ops/brand.test.mjs` loads this in plain Node.
 */

export const BRAND = {
  /**
   * Customer-facing product name. Titles, invoices, exports, emails — and the
   * assistant's own name. It used to introduce itself as "I'm Rabit", which is the
   * COMPANY: a user who is told three names across four screens cannot tell which one
   * charged their card.
   */
  name: "Sira",
  nameAr: "سيرة",
  /** The company behind it. Attribution only — never the product name. */
  company: "Rabit",
  /** Shown as "Sira · a resume service by Rabit". One string, one place. */
  attribution: "Sira · a resume service by Rabit",
  attributionAr: "سيرة · خدمة سير ذاتية من رابِط",
  domain: "cv.rabit.sa",
  url: process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa",
  /**
   * Where a user is told to write. Override with NEXT_PUBLIC_SUPPORT_EMAIL.
   *
   * The fallback is the address the product already publishes. It is a personal
   * mailbox, which is a real problem — but printing an address nobody reads would be a
   * worse one, so the fix is configuration rather than invention.
   */
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "alanziabdulaziz4@gmail.com",
  /** Currency the product charges in. Formatting lives in plans.ts. */
  currency: "SAR",
} as const;

/** The product name in the reader's language. */
export function brandName(lang: "ar" | "en"): string {
  return lang === "ar" ? BRAND.nameAr : BRAND.name;
}

/** "© 2026 Sira · a resume service by Rabit" — one footer, both languages. */
export function copyright(lang: "ar" | "en", year = 2026): string {
  return lang === "ar"
    ? `© ${year} ${BRAND.attributionAr}`
    : `© ${year} ${BRAND.attribution}`;
}

/** True when the support address is still the personal fallback. Asserted in tests. */
export function supportEmailIsPersonal(): boolean {
  return /@gmail\.com$|@hotmail\.|@outlook\.|@yahoo\./i.test(BRAND.supportEmail);
}

/* ─────────────────── salary ranges ─────────────────── */

/**
 * What a salary range on this site is, and is not.
 *
 * The SEO pages publish a range for every occupation — 62 in Arabic, 55 in English —
 * presented as "Typical salary" / "نطاق الراتب التقريبي" with nothing behind it. No
 * survey, no dataset, no year. Read as a Saudi market fact, which is how a jobseeker
 * deciding what to ask for will read it, that is a claim the product cannot support, and
 * a wrong one costs the reader money in a negotiation.
 *
 * These figures are not removed, because a labelled estimate is genuinely useful and
 * every job board publishes one. They are labelled. This is the label, in one place, so
 * a page cannot print the number without it — asserted in `ops/brand.test.mjs`.
 *
 * If a sourced dataset is ever licensed, this string becomes the citation and nothing
 * else changes.
 */
export const SALARY_BASIS = {
  en: "Indicative range only — a rough guide compiled from public job postings, not a verified salary survey. Check current listings before you negotiate.",
  ar: "نطاق استرشادي فقط — تقدير عام مجمَّع من إعلانات وظائف منشورة، وليس مسحاً موثّقاً للرواتب. راجع الإعلانات الحالية قبل التفاوض.",
} as const;

export function salaryBasis(lang: "ar" | "en"): string {
  return SALARY_BASIS[lang];
}

/* ─────────────────── the one "go check your resume" call to action ─────────────────── */

/**
 * The header CTA that points at `/optimize`.
 *
 * The audit found five separate strings for this one action across the SEO catalog and the
 * product surface: "Free scan →", "Scan my resume", "Resume optimizer →", "افحص سيرتي",
 * "فحص مجاني ←". Five labels for one destination reads as five different tools, which is
 * exactly the "feels like separate products" complaint the IA redesign set out to fix. One
 * constant, one place — every `PageShell` `cta` prop that points at `/optimize` uses this.
 */
export const NAV_CTA = {
  en: { href: "/optimize", label: "Scan my resume →" },
  ar: { href: "/ar/optimize", label: "افحص سيرتي مجاناً ←" },
} as const;

export function navCta(lang: "ar" | "en"): { href: string; label: string } {
  return NAV_CTA[lang];
}
