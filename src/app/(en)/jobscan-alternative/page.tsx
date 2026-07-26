import type { Metadata } from "next";
import { fitTitle } from "@/app/lib/seoTitle.ts";
import { PLANS, formatPrice } from "@/app/lib/plans";
import SeoLanding from "@/app/components/SeoLanding";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

export const metadata: Metadata = {
  /* Two interpolated prices ran this to 70 characters, and what gets cut is the price — the whole
     reason someone searching for an alternative clicked. `fitTitle` appends it only if it fits. */
  title: fitTitle("The Best Jobscan Alternative (2026)",
    ` — Same ATS Scan From ${formatPrice("single", "en")}`),
  description:
    `The same ATS match score and keyword analysis, plus a full rewrite — from ${formatPrice("single", "en")} (${PLANS.single.priceUsd}) once, with no monthly subscription.`,
  keywords: "Jobscan alternative, cheaper than Jobscan, Jobscan vs, ATS resume tool, resume optimizer alternative",
  alternates: { canonical: `${BASE}/jobscan-alternative` },
  openGraph: { title: "The Best Jobscan Alternative (2026)", description: `Same ATS scan and keyword match, plus a full rewrite — from ${formatPrice("single", "en")} (${PLANS.single.priceUsd}), no subscription.`, type: "website" },
};

export default function Page() {
  return (
    <SeoLanding
      eyebrow="Jobscan alternative"
      h1="Everything Jobscan does —"
      h1Accent="without the $49.95/month"
      intro={`Jobscan pioneered ATS resume scanning, but at $49.95/month it's the priciest tool on the market. Sira gives you the same job-specific match score and keyword analysis — plus a complete AI rewrite Jobscan doesn't include — starting at just ${formatPrice("single", "en")} (${PLANS.single.priceUsd}) once, with no subscription.`}
      bullets={[
        { title: "Same ATS match score", body: "Paste your resume and the job post and get an instant 0–100 match score and keyword gap analysis — the core of what you pay Jobscan for." },
        { title: "A full rewrite, included", body: "Jobscan tells you what's wrong; we fix it. Every scan includes a rewritten, keyword-optimized resume ready to submit." },
        { title: "Pay once, not every month", body: `${formatPrice("single", "en")} (${PLANS.single.priceUsd}) for a single optimization or ${formatPrice("complete", "en")} one-time for the Complete Pack — versus Jobscan's $49.95/month. No subscription trap for a one-week job hunt.` },
        { title: "Cover letters too", body: "Generate a matching cover letter from the same job description — no extra tool, no extra fee on the unlimited plan." },
      ]}
      faqs={[
        { q: "Is Sira really cheaper than Jobscan?", a: `Yes. Jobscan's cheapest paid plan is $49.95/month. Sira is ${formatPrice("single", "en")} (${PLANS.single.priceUsd}) one-time or ${formatPrice("complete", "en")} one-time for the Complete Pack — and includes a full resume rewrite that Jobscan charges more for.` },
        { q: "Does it do the same ATS keyword matching?", a: "Yes — you get a job-specific match score, the keywords present in your resume, and the keywords you're missing, just like Jobscan's core scan." },
        { q: "What does Sira do that Jobscan doesn't?", a: "It rewrites your entire resume automatically — injecting missing keywords, strengthening bullet points, and fixing ATS-unfriendly formatting — and it generates matching cover letters." },
        { q: "Do I need a subscription?", a: `No. You can pay ${formatPrice("single", "en")} (${PLANS.single.priceUsd}) one time for a single optimization. The ${formatPrice("complete", "en")} one-time unlimited plan is optional for active job seekers applying to many roles.` },
      ]}
      ctaLine="Try the cheaper Jobscan alternative free"
    />
  );
}
