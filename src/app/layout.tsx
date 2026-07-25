import type { Metadata } from "next";
import { PLANS, planPrice, formatPrice } from "./lib/plans";
import { BRAND } from "./lib/brand";
import { headers } from "next/headers";
import { Analytics } from "@vercel/analytics/next";
import OrbProvider from "./components/orb/OrbProvider";
import "./globals.css";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

export const metadata: Metadata = {
  metadataBase: new URL(BASE),
  title: "Sira — Honest AI Resume Optimizer (No-Fabrication Engine)",
  description:
    "Optimize your resume with AI in 10 seconds. Free ATS match score, missing keywords, and a rewritten resume aligned to any job description — without inventing a single fact you didn't provide.",
  keywords: "resume optimizer, ATS resume, AI resume writer, resume checker, ATS resume checker, job application, cover letter generator",
  openGraph: {
    title: "Sira — Honest AI Resume Optimization in 10 Seconds",
    description: "Free ATS score + analysis, and a rewritten resume that never invents facts you didn't provide.",
    type: "website",
    url: BASE,
    siteName: "Sira",
  },
  twitter: { card: "summary_large_image", title: "Sira — Honest AI Resume Optimization", description: "Free ATS score + a no-fabrication rewrite in 10 seconds." },
};

// Rich structured data — Organization + SoftwareApplication (with real SAR
// offers) + FAQPage. No aggregateRating/review is emitted because we have no
// verified ratings yet, and the brand promise is zero fabrication.
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${BASE}/#org`,
      name: "Sira",
      url: BASE,
      description: "Honest AI resume optimizer for the Saudi, Gulf, and global job markets.",
    },
    {
      "@type": "SoftwareApplication",
      name: BRAND.name,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      publisher: { "@id": `${BASE}/#org` },
      description: "AI resume optimizer that scores your resume against a job description, finds missing ATS keywords, and rewrites it to pass applicant tracking systems — without inventing facts you didn't provide.",
      // Built from lib/plans.ts: a rich result quoting a price the checkout does not
      // charge is a Google policy problem as well as a customer-trust one.
      offers: (["single", "complete"] as const).map((id) => ({
        "@type": "Offer",
        price: String(planPrice(id)),
        priceCurrency: BRAND.currency,
        name: `${PLANS[id].name} — ${PLANS[id].accessLabel}`,
      })),
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        { "@type": "Question", name: "Is the resume scan free?", acceptedAnswer: { "@type": "Answer", text: "Yes. The ATS match score, missing keywords, skills-gap analysis, and a preview of improvements are free. The full rewritten resume and downloads unlock with a one-time payment." } },
        { "@type": "Question", name: "Does it invent experience or skills?", acceptedAnswer: { "@type": "Answer", text: "It never invents a number, employer, date, degree, or certification — those come from you alone. To save you the blank page it drafts the duties and skills typical of your job title, which you then edit and prune; only what you keep goes into your resume." } },
        { "@type": "Question", name: "Is it a subscription?", acceptedAnswer: { "@type": "Answer", text: `No subscription. Pay once — ${formatPrice("single", "en")} for 24-hour full access or ${formatPrice("complete", "en")} for 90 days. There is a 7-day money-back guarantee.` } },
        { "@type": "Question", name: "Does it support Arabic?", acceptedAnswer: { "@type": "Answer", text: "Yes. Full Arabic (RTL) interface, Saudi/Gulf resume fields, and you can even write in Arabic and get a polished English resume back." } },
      ],
    },
  ],
};

// Meta (Facebook/Instagram) Pixel — measures ad-driven visits and, via the
// Purchase event on the pay callback, real revenue from paid campaigns. Fully
// dormant until NEXT_PUBLIC_META_PIXEL_ID is set (no ID → no script), so it can
// ship now and activate the moment the ad account is connected.
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The Arabic UI lives under /ar — serve it with the correct lang/dir on the
  // <html> root (proxy.ts forwards the pathname). Fixes lang="en" on /ar (a11y/SEO).
  const pathname = (await headers()).get("x-pathname") || "";
  const isArabic = pathname === "/ar" || pathname.startsWith("/ar/");

  return (
    <html lang={isArabic ? "ar" : "en"} dir={isArabic ? "rtl" : "ltr"}>
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
        <OrbProvider>{children}</OrbProvider>
        <div className="grain-overlay" aria-hidden="true" />
        <Analytics />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
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
