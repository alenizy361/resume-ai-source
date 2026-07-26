/**
 * The one HTML document, shared by both root layouts.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHY THERE ARE TWO ROOT LAYOUTS AND THIS FILE EXISTS
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * The old `app/layout.tsx` read the request path to decide `lang` and `dir`:
 *
 *     const pathname = (await headers()).get("x-pathname") || "";
 *     const isArabic = pathname === "/ar" || pathname.startsWith("/ar/");
 *
 * That is one line, and it opted the ENTIRE SITE out of static generation. `headers()` is a
 * dynamic API, and a dynamic API in the root layout makes every route beneath it dynamic —
 * every page in the app shares that layout.
 *
 * Measured, not assumed. Building with the line removed:
 *
 *                        static (○)   prerendered SSG (●)   dynamic (ƒ)
 *     with `headers()`         5              0                  80
 *     without                 46              9                   5
 *
 * The five that remain dynamic are the ones that genuinely are: a builder step for one resume,
 * a score by id, a published CV by slug. The other twenty-five `ƒ` entries are `/api` route
 * handlers, which are supposed to run per request.
 *
 * For a product whose entire growth plan is organic search with no ad spend, that table is the
 * whole argument. Fifty-five route entries — covering all 382 indexed pages — move from
 * server-rendered-on-demand to HTML sitting on a CDN. Time to first byte is the front half of
 * LCP, and LCP is a ranking input.
 *
 * `<html>` can only be written by a root layout, so varying `lang` per language means two root
 * layouts, which means route groups: `app/(en)` and `app/(ar)`. Neither knows the request path
 * and neither needs to — the group IS the answer.
 *
 * ── and why the shell is here rather than copied into both ──
 *
 * Two copies of a hundred lines of structured data would drift, and this file's own history says
 * how: the JSON-LD used to be one English object served on every route, so Arabic pages emitted
 * English FAQ answers and English price labels to Google. That was fixed once. Duplicating the
 * block to split the layout would have re-introduced it by a different route, and slowly.
 *
 * So `lang` is a prop. It is now known statically at build time instead of read from a header,
 * which is both cheaper and more honest: the language of a page is a fact about the page, not
 * about the request.
 */

import { PLANS, planPrice, formatPrice } from "@/app/lib/plans";
import { BRAND, brandName } from "@/app/lib/brand";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import FunnelBeacon from "@/app/components/seo/FunnelBeacon";
import SpaceBackdrop from "@/app/components/SpaceBackdrop";
import "@/app/globals.css";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

/**
 * The FAQ answers Google may quote. Both languages, side by side.
 *
 * Prices are interpolated from lib/plans.ts — an answer quoting a price the checkout does
 * not charge is a Google policy problem on top of a trust one.
 */
const FAQ_EN: [string, string][] = [
  ["Is the resume scan free?",
   "Yes. The ATS match score, missing keywords, skills-gap analysis, and a preview of improvements are free. The full rewritten resume and downloads unlock with a one-time payment."],
  ["Does it invent experience or skills?",
   "It never invents a number, employer, date, degree, or certification — those come from you alone. To save you the blank page it drafts the duties and skills typical of your job title, which you then edit and prune; only what you keep goes into your resume."],
  ["Is it a subscription?",
   `No subscription. Pay once — ${formatPrice("single", "en")} for 24-hour full access or ${formatPrice("complete", "en")} for 90 days. There is a 7-day money-back guarantee.`],
  ["Does it support Arabic?",
   "Yes. Full Arabic (RTL) interface, Saudi/Gulf resume fields, and you can even write in Arabic and get a polished English resume back."],
];

const FAQ_AR: [string, string][] = [
  ["هل فحص السيرة مجاني؟",
   "نعم. تقييم التوافق مع أنظمة التتبّع، والكلمات المفتاحية الناقصة، وتحليل فجوة المهارات، ومعاينة التحسينات — كلها مجانية. السيرة المُعاد كتابتها كاملةً والتنزيلات تُفتح بدفعة واحدة."],
  ["هل يختلق خبرة أو مهارات؟",
   "لا يختلق رقماً ولا جهة عمل ولا تاريخاً ولا شهادة — هذه منك وحدك. ولتوفير عناء الصفحة البيضاء يكتب المهام والمهارات المعتادة لمسمّاك الوظيفي، فتعدّلها وتحذف ما لا ينطبق؛ ولا يدخل سيرتك إلا ما أبقيته."],
  ["هل هو اشتراك؟",
   `لا اشتراك. ادفع مرة واحدة — ${formatPrice("single", "ar")} لوصول كامل ٢٤ ساعة أو ${formatPrice("complete", "ar")} لتسعين يوماً. وهناك ضمان استرداد خلال ٧ أيام.`],
  ["هل يدعم العربية؟",
   "نعم. واجهة عربية كاملة من اليمين إلى اليسار، وحقول السيرة المعتادة في السعودية والخليج، وتستطيع الكتابة بالعربية والحصول على سيرة إنجليزية مصقولة."],
];

/*
 * Rich structured data — Organization + SoftwareApplication (with real SAR offers) +
 * FAQPage. No aggregateRating/review is emitted because we have no verified ratings yet,
 * and the brand promise is zero fabrication.
 *
 * Built per locale. It used to be one English object rendered on every route, so an
 * Arabic page emitted English answers and "SAR 35" to Google — which reads it as the
 * page's own content, and is the kind of mismatch that suppresses a rich result. The
 * prices come from lib/plans.ts and the copy from the same `formatPrice` the visible
 * pages use, so the two cannot drift.
 */
function structuredDataFor(lang: "ar" | "en") {
  const ar = lang === "ar";
  const url = ar ? `${BASE}/ar` : BASE;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${BASE}/#org`,
        name: brandName(lang),
        url,
        description: ar
          ? "منشئ ومحسّن سير ذاتية بالذكاء الاصطناعي، أمين ولا يختلق، للسوق السعودي والخليجي."
          : "Honest AI resume optimizer for the Saudi, Gulf, and global job markets.",
      },
      {
        "@type": "SoftwareApplication",
        name: brandName(lang),
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        publisher: { "@id": `${BASE}/#org` },
        inLanguage: ar ? "ar-SA" : "en",
        description: ar
          ? "يقيّم سيرتك مقابل وصف الوظيفة، ويجد الكلمات المفتاحية الناقصة لأنظمة التتبّع، ويعيد صياغتها لتعبرها — دون اختلاق أي حقيقة لم تقدّمها."
          : "AI resume optimizer that scores your resume against a job description, finds missing ATS keywords, and rewrites it to pass applicant tracking systems — without inventing facts you didn't provide.",
        offers: (["single", "complete"] as const).map((id) => ({
          "@type": "Offer",
          price: String(planPrice(id)),
          priceCurrency: BRAND.currency,
          name: ar
            ? `${PLANS[id].nameAr} — ${PLANS[id].accessLabelAr}`
            : `${PLANS[id].name} — ${PLANS[id].accessLabel}`,
        })),
      },
      {
        "@type": "FAQPage",
        mainEntity: (ar ? FAQ_AR : FAQ_EN).map(([q, a]) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      },
    ],
  };
}

// Meta (Facebook/Instagram) Pixel — measures ad-driven visits and, via the
// Purchase event on the pay callback, real revenue from paid campaigns. Fully
// dormant until NEXT_PUBLIC_META_PIXEL_ID is set (no ID → no script), so it can
// ship now and activate the moment the ad account is connected.
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

export default function RootShell({
  lang, children,
}: {
  /**
   * Which language's document this is.
   *
   * Supplied by the route group rather than derived from the path, which is the entire point: a
   * value the build knows needs no request to discover.
   */
  lang: "ar" | "en";
  children: React.ReactNode;
}) {
  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"}>
      <body style={{ margin: 0, padding: 0 }}>
        {/* THE VOICE — IBM Plex Sans Arabic: engineered, bilingual, premium.
            (The 'cheap Android' feel was the unstyled system fallback.) */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Inter:wght@400;500;600;700;800&display=swap"
        />
        {/*
          One background, painted once, behind everything. It replaced OrbProvider, which also
          wrapped every page in an AnimatePresence `mode="wait"` crossfade — meaning the next
          page did not begin mounting until the previous one had finished fading out. That is
          the blank pause between screens, and it is gone with the wrapper.
        */}
        <SpaceBackdrop />
        {children}
        <Analytics />
        <SpeedInsights />
        {/* Records which page the visitor arrived on, once per tab. Every later funnel step
            reports itself with that entry attached — see `lib/funnel.ts`. */}
        <FunnelBeacon />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredDataFor(lang)) }} />
        {META_PIXEL_ID && (
          <script
            dangerouslySetInnerHTML={{
              __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${META_PIXEL_ID}');fbq('track','PageView');`,
            }}
          />
        )}
      </body>
    </html>
  );
}
