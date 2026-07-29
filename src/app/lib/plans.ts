/**
 * Single source of truth for what each paid plan includes.
 *
 * EVERY page, the checkout modal, the terms, the structured data and the payment API
 * itself read from here. They did not before: `/api/pay` kept its own PLANS map with
 * `process.env.PRICE_SINGLE || 35`, CheckoutButton printed "SAR 35" as a string, the
 * terms hardcoded ٣٥/٩٩, and layout.tsx's JSON-LD offers hardcoded 35/99 again. Four
 * sources for one number, and only one of them was the amount actually charged — so a
 * PRICE_SINGLE env change would have shown 35 to a customer while billing something
 * else. `planPrice()` below is now the only way to learn a price.
 *
 * IMPORTANT — this mirrors the ACTUAL gating in the code: every paid feature
 * (full resume rewrite, cover letter, LinkedIn optimizer, interview prep,
 * watermark-free downloads) is unlocked by ANY valid pass. Plans differ ONLY in
 * how long access lasts — see WINDOW_MS in access.ts (single = 24h, complete =
 * 90 days). Do not describe features as exclusive to the Complete Pack; the
 * honest differentiator is duration. Every page's pricing copy should read from
 * here so the plans never contradict each other again.
 */

export type PlanId = "single" | "complete";

/**
 * Plans that can still be CHARGED but are no longer sold.
 *
 * `monthly` predates the one-time switch and is kept so an invoice created before it
 * can still be verified. It is deliberately outside `PLANS`, so nothing can render it
 * as an option while `chargeableAmount` can still price it.
 */
export const RETIRED_PRICES: Record<string, number> = { monthly: 75 };

export interface Plan {
  id: PlanId;
  name: string;
  nameAr: string;
  priceSar: number;
  priceUsd: string;
  accessLabel: string;
  accessLabelAr: string;
  tagline: string;
  taglineAr: string;
  /** Full feature list — identical for both plans; only access duration differs. */
  features: string[];
  featuresAr: string[];
}

const FULL_FEATURES = [
  "Full ATS-optimized resume rewrite",
  "Cover letter generator",
  "LinkedIn headline & about optimizer",
  "Interview prep questions & answers",
  "Watermark-free PDF & Word downloads",
];

const FULL_FEATURES_AR = [
  "إعادة كتابة السيرة كاملة ومهيّأة لأنظمة التوظيف",
  "مولّد خطاب التعريف",
  "تحسين عنوان ونبذة لينكدإن",
  "أسئلة وأجوبة تحضير المقابلة",
  "تنزيل PDF و Word بدون علامة مائية",
];

export const PLANS: Record<PlanId, Plan> = {
  single: {
    id: "single",
    name: "One-time optimization",
    nameAr: "تحسين واحد",
    priceSar: 35,
    priceUsd: "~$9",
    accessLabel: "Full access for 24 hours",
    accessLabelAr: "وصول كامل لمدة ٢٤ ساعة",
    tagline: "Everything unlocked — perfect for one big application.",
    taglineAr: "كل شيء مفتوح — مثالي لتقديم واحد مهم.",
    features: FULL_FEATURES,
    featuresAr: FULL_FEATURES_AR,
  },
  complete: {
    id: "complete",
    name: "Complete Pack",
    nameAr: "الحزمة الكاملة",
    priceSar: 99,
    priceUsd: "~$26",
    accessLabel: "Full access for 90 days",
    accessLabelAr: "وصول كامل لمدة ٩٠ يوماً",
    tagline: "Same full access, 90 days — best for an active job hunt. No subscription.",
    taglineAr: "نفس الوصول الكامل لكن ٩٠ يوماً — الأفضل للبحث النشط. بدون اشتراك.",
    features: FULL_FEATURES,
    featuresAr: FULL_FEATURES_AR,
  },
};

/* ─────────────────── the one way to learn a price ─────────────────── */

/**
 * What a plan costs, in SAR.
 *
 * An env override is honoured — the business needs to be able to run a promotion
 * without a deploy — but it is honoured HERE, so the pricing page, the checkout modal,
 * the terms and the invoice all move together. That is the whole point: the previous
 * arrangement let the invoice move on its own.
 *
 * Reads `process.env.PRICE_<ID>`. On the client only the NEXT_PUBLIC_ form is visible,
 * so a promotional price must be published as both — and `priceMismatch()` below is the
 * assertion that catches it if only one is set.
 */
export function planPrice(id: PlanId): number {
  const key = id.toUpperCase();
  const raw = process.env[`PRICE_${key}`] ?? process.env[`NEXT_PUBLIC_PRICE_${key}`];
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : PLANS[id].priceSar;
}

/** The amount to invoice. Accepts retired ids so old invoices stay verifiable. */
export function chargeableAmount(id: string): number | null {
  if (id === "single" || id === "complete") return planPrice(id);
  const retired = RETIRED_PRICES[id];
  const raw = process.env[`PRICE_${id.toUpperCase()}`];
  const n = Number(raw);
  return retired === undefined ? null : (Number.isFinite(n) && n > 0 ? n : retired);
}

/**
 * Would a visitor see a different number from the one they are charged?
 *
 * Returns the ids where the server-side price and the client-visible price disagree.
 * Non-empty means a customer can be shown one amount and billed another, which is the
 * exact defect this module was restructured to make impossible. The pricing test fails
 * on it, and it is worth calling at boot if a promotion is ever configured.
 */
export function priceMismatch(): PlanId[] {
  return (["single", "complete"] as PlanId[]).filter((id) => {
    const key = id.toUpperCase();
    const server = Number(process.env[`PRICE_${key}`]);
    const client = Number(process.env[`NEXT_PUBLIC_PRICE_${key}`]);
    const hasServer = Number.isFinite(server) && server > 0;
    const hasClient = Number.isFinite(client) && client > 0;
    if (!hasServer && !hasClient) return false;      // both fall back to PLANS
    return !hasServer || !hasClient || server !== client;
  });
}

/**
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE REFUND PROMISE — one source, for the same reason the price has one
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * It was stated in five places with THREE different meanings, and the broadest one was the one
 * printed on the screen where the customer actually pays:
 *
 *   · the checkout sheet, BOTH plans, both languages · "🔒 Secure via Paylink · 7-day money-back"
 *     — unconditional, and shown to the SAR 35 buyer
 *   · `/pricing` and the homepage FAQ ·················· 7 days, COMPLETE PACK only
 *   · `/terms` §3 ····································· a refund only if the service FAILED —
 *     explicitly "not for using the service in full and then asking because you didn't like it"
 *   · the receipt email ································ unconditional again
 *
 * A SAR 35 buyer was therefore promised an unconditional refund in the sheet they paid on and
 * would then be refused under §3. That is a chargeback rather than a support ticket, and the card
 * scheme sides with the screen the customer paid on — which is why this belongs next to the price
 * rather than in four copy blocks. Same lesson, same file: a promise with four homes is four
 * promises.
 *
 * The wording below is the one the product ALREADY advertises publicly on `/pricing` — scoped to
 * the Complete Pack. Nothing new is being promised to anybody; what changes is that the sheet stops
 * making a broader promise than the policy, and `/terms` now records the narrower one in writing.
 */
export function refundLine(id: PlanId, lang: "ar" | "en"): string {
  if (id !== "complete") return "";
  return lang === "ar" ? "ضمان استرداد ٧ أيام" : "7-day money-back guarantee";
}

/** "SAR 35" / "٣٥ ريالاً" — one formatter, so the two languages cannot drift apart. */
export function formatPrice(id: PlanId, lang: "ar" | "en"): string {
  const n = planPrice(id);
  return lang === "ar" ? `${toArabicDigits(n)} ريالاً` : `SAR ${n}`;
}

/** Arabic-Indic digits, because an Arabic page that prints "35" is half-translated. */
export function toArabicDigits(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
}
