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
  /** Customer-facing product name. Used in titles, invoices, exports, emails. */
  name: "Sira",
  nameAr: "سيرة",
  /** The company behind it. Attribution only — never the product name. */
  company: "Rabit",
  /** Shown as "Sira · a resume service by Rabit". One string, one place. */
  attribution: "Sira · a resume service by Rabit",
  attributionAr: "سيرة · خدمة سيرة ذاتية من رابِط",
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
