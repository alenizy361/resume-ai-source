import type { Metadata } from "next";
import { PLANS, formatPrice } from "@/app/lib/plans";
import PageShell from "@/app/components/PageShell";
import Link from "next/link";
import { BRAND } from "@/app/lib/brand";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

export const metadata: Metadata = {
  title: "Terms & Refund Policy | Sira",
  description: "Terms of use for the Sira resume service at cv.rabit.sa, pricing, and the refund policy.",
  alternates: {
    canonical: `${BASE}/terms`,
    languages: { en: `${BASE}/terms`, ar: `${BASE}/ar/terms`, "x-default": `${BASE}/terms` },
  },
};

/* `id` so a deep link can land on a clause — the payment sheet now links straight to the
   refund policy, and a customer sent to the top of a long legal page has not been shown it. */
const Section = ({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) => (
  <section id={id} className="t-enter mb-8" style={{ scrollMarginTop: 90 }}>
    <h2 className="mb-3 text-xl font-bold">{title}</h2>
    <div className="space-y-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{children}</div>
  </section>
);

/*
 * A genuine parallel document, not a summary — this page used to be a short bullet list under an
 * otherwise-Arabic page (`/terms` served Arabic content with an "English summary" card at the
 * bottom, at a URL with no `/ar` in it). Same policy substance as `/ar/terms`, same section order,
 * written in full English rather than condensed — a reader here shouldn't get less than a reader
 * of the Arabic page gets.
 */
export default function TermsPage() {
  return (
    <PageShell lang="en" langToggle="/ar/terms">
      <div className="mx-auto max-w-3xl">
        <div className="chip mb-4">Terms &amp; Conditions</div>
        <h1 className="mb-2 text-3xl font-extrabold">Terms of Use &amp; Refund Policy</h1>
        <p className="mb-10 text-sm" style={{ color: "var(--muted)" }}>Last updated: July 2026 · Applies to cv.rabit.sa</p>

        <Section title="1. The service">
          <p>
            Sira is an AI tool that helps you clarify your resume and match it to a job's requirements,
            and build an English resume from your own answers. Results are <strong>editorial assistance</strong> —
            we do not guarantee you will be hired, or that your resume will pass any specific applicant
            tracking system, because hiring decisions rest with employers and the systems they use.
          </p>
          <p>You are responsible for reviewing the result before you use it — especially anywhere marked with a placeholder like "[add your real number]".</p>
        </Section>

        <Section title="2. Pricing">
          <ul className="ml-5 list-disc space-y-1">
            {/* The two plans differ in DURATION, not in features — `canUseCoverLetter`,
                `canUseLinkedInOptimizer` and `canUseInterviewPreparation` are each `active(e)`, so
                any valid pass unlocks all of them. Listing the extras only under the Complete Pack
                described an exclusivity the code does not enforce, in the one document that binds. */}
            <li><strong>Both plans unlock everything:</strong> the full optimized resume, cover letters, the LinkedIn optimizer, interview preparation and watermark-free downloads. They differ only in how long access lasts.</li>
            <li><strong>{PLANS.single.name} — {formatPrice("single", "en")} (one-time):</strong> {PLANS.single.accessLabel}.</li>
            <li><strong>{PLANS.complete.name} — {formatPrice("complete", "en")} one-time:</strong> {PLANS.complete.accessLabel}. One payment, no subscription and no renewal.</li>
            <li>The score check and analysis are always free, no card required.</li>
          </ul>
        </Section>

        <Section id="refund" title="3. Refund policy">
          <p>We refund you in full if you did not get the service:</p>
          <ul className="ml-5 list-disc space-y-1">
            <li>If you paid and your access was never activated, or the system failed to generate your optimized resume — a <strong>full refund</strong> within 7 days of payment.</li>
            {/* The Complete Pack guarantee was advertised on /pricing, in the homepage FAQ and in the
                receipt email, and appeared nowhere in this document — the one place a refund promise
                actually binds. Written down here rather than quietly dropped from the advertising:
                what is promised publicly is owed, so the honest move is to record it. */}
            <li>The <strong>Complete Pack</strong> additionally carries a <strong>7-day money-back guarantee</strong>: ask within 7 days of payment and we refund it, no reason needed.</li>
            <li>Email us with your order reference and we handle the request within 3 business days; the amount returns via the same payment method.</li>
            <li>A refund does not cover using the service in full and then asking for one because you didn't like the style — but email us anyway and we'll try to make it right.</li>
          </ul>
        </Section>

        <Section title="4. Acceptable use">
          <ul className="ml-5 list-disc space-y-1">
            <li>Do not use the service to create resumes with false information about another person's identity, or fabricated qualifications.</li>
            <li>Public publish links are for your own resume only — content that violates this or is abusive is removed.</li>
            <li>Excessive automated use (scripts, attacks) is prohibited and may be rate-limited.</li>
          </ul>
        </Section>

        <Section title="5. Payment">
          <p>
            Payments are processed through Paylink, a payment gateway licensed in Saudi Arabia (mada, Visa,
            Mastercard), in Saudi riyals. We never see or store your card details.
          </p>
        </Section>

        <Section title="6. Contact">
          <p>
            The service runs on <span dir="ltr">cv.rabit.sa</span>, operated by Rabit. For any payment
            issue or question:
          </p>
          <p>📧 <a href={`mailto:${BRAND.supportEmail}`} className="text-accent underline">{BRAND.supportEmail}</a></p>
        </Section>

        <div className="mt-10 flex gap-4">
          <Link href="/privacy" className="btn-ghost px-6 py-2.5 text-sm font-semibold" style={{ color: "var(--fg)" }}>Privacy policy →</Link>
          <Link href="/" className="btn-accent px-6 py-2.5 text-sm">Home</Link>
        </div>
      </div>
    </PageShell>
  );
}
