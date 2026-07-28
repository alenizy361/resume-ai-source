import type { Metadata } from "next";
import CheckoutButton from "@/app/components/CheckoutButton";
import PageShell from "@/app/components/PageShell";
import AuthNav from "@/app/components/AuthNav";
import MobileMenu from "@/app/components/MobileMenu";
import { PLANS, formatPrice } from "@/app/lib/plans";
import { navCta } from "@/app/lib/brand";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

export const metadata: Metadata = {
  title: "Pricing — One-time, No Subscription | Sira",
  description:
    /* Two interpolated prices pushed this to 274 characters. Every feature is in both packs, so
       the sentence that matters is the difference between them — the rest is on the page. */
    `${formatPrice("single", "en")} for 24 hours or ${formatPrice("complete", "en")} for 90 days. Every feature in both packs — only the access period differs. No subscription.`,
  alternates: {
    canonical: `${BASE}/pricing`,
    languages: { en: `${BASE}/pricing`, ar: `${BASE}/ar/pricing`, "x-default": `${BASE}/pricing` },
  },
  openGraph: { title: "Sira Pricing — Pay once, no subscription", description: `${formatPrice("single", "en")} (24h) or ${formatPrice("complete", "en")} (90 days). Every feature in both.`, url: `${BASE}/pricing` },
};

function PlanCard({ id, highlight }: { id: "single" | "complete"; highlight?: boolean }) {
  const p = PLANS[id];
  return (
    <div className="card p-8" style={highlight ? { borderColor: "rgba(139,92,246,0.5)", background: "rgba(139,92,246,0.06)", position: "relative", boxShadow: "0 30px 80px -30px rgba(139,92,246,0.55)" } : undefined}>
      {highlight && (
        <div className="absolute right-5 top-5 rounded-full px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider" style={{ background: "var(--accent)", color: "#ffffff" }}>BEST VALUE</div>
      )}
      <div className="font-mono text-xs uppercase tracking-widest" style={{ color: "var(--faint)" }}>{p.name} · one-time</div>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-5xl font-extrabold">SAR {p.priceSar}</span>
        <span className="text-sm" style={{ color: "var(--muted)" }}>once ({p.priceUsd})</span>
      </div>
      <p className="mt-2 text-sm font-semibold" style={{ color: "var(--accent)" }}>{p.accessLabel}</p>
      <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{p.tagline}</p>
      <ul className="mt-6 space-y-3 text-sm">
        {p.features.map((f) => (
          <li key={f} className="flex items-center gap-3" style={{ color: "rgba(244,245,243,0.85)" }}>
            <span className="text-accent">✓</span> {f}
          </li>
        ))}
        {id === "complete" && (
          <li className="flex items-center gap-3" style={{ color: "rgba(244,245,243,0.85)" }}>
            <span className="text-accent">✓</span> 7-day money-back guarantee
          </li>
        )}
      </ul>
      <div className="mt-8">
        <CheckoutButton plan={id} label={id === "single" ? "Get 24-hour access" : "Get the Complete Pack →"} variant={highlight ? "accent" : "ghost"} />
      </div>
    </div>
  );
}

export default function PricingPage() {
  return (
    <PageShell lang="en" cta={navCta("en")} langToggle="/ar/pricing" authNav={<AuthNav />} mobileMenu={<MobileMenu />}>
      <section className="t-enter relative">
        <div className="relative mb-12 text-center">
          <div className="chip mb-4">Pricing</div>
          <h1 className="text-4xl font-extrabold tracking-tight">Pay once. No subscription.</h1>
          <p className="mx-auto mt-3 max-w-xl" style={{ color: "var(--muted)" }}>
            Both plans include <strong>every feature</strong> — full resume rewrite, cover letter, LinkedIn, interview prep, and watermark-free downloads. The only difference is how long your access lasts.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <PlanCard id="single" />
          <PlanCard id="complete" highlight />
        </div>
        <p className="mt-8 text-center font-mono text-xs" style={{ color: "var(--faint)" }}>
          Secure Paylink checkout · Instant access · 7-day money-back guarantee on the Complete Pack · No subscription, ever
        </p>

        <div className="mt-16">
          <h2 className="mb-6 text-2xl font-bold">Frequently asked</h2>
          <div className="space-y-4">
            {[
              ["Is the scan free?", "Yes — the ATS score, missing keywords, skills-gap, and a preview of improvements are free. The full rewrite and downloads unlock with a one-time payment."],
              ["Is this a subscription?", `No. Pay once. ${formatPrice("single", "en")} gives 24-hour full access; ${formatPrice("complete", "en")} gives 90 days. Nothing recurs.`],
              ["What's the difference between the two plans?", `Nothing in features — both unlock everything. ${formatPrice("complete", "en")} simply keeps your access open for 90 days, ideal for an active job hunt.`],
              ["Can I get a refund?", "Yes — the Complete Pack (90 days) carries a 7-day money-back guarantee."],
            ].map(([q, a]) => (
              <div key={q} className="card p-5">
                <h3 className="font-bold">{q}</h3>
                <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PageShell>
  );
}
