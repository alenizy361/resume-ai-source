import type { Metadata } from "next";
import CheckoutButton from "@/app/components/CheckoutButton";
import PageShell from "@/app/components/PageShell";
import AuthNav from "@/app/components/AuthNav";
import MobileMenu from "@/app/components/MobileMenu";
import { PLANS, formatPrice } from "@/app/lib/plans";
import { navCta } from "@/app/lib/brand";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

export const metadata: Metadata = {
  title: "الأسعار — دفعة واحدة، بدون اشتراك | سيرة",
  description:
    `${formatPrice("single", "ar")} لـ٢٤ ساعة أو ${formatPrice("complete", "ar")} لـ٩٠ يوماً. كل المزايا في الباقتين — الفرق مدة الوصول فقط. بدون اشتراك.`,
  alternates: {
    canonical: `${BASE}/ar/pricing`,
    languages: { en: `${BASE}/pricing`, ar: `${BASE}/ar/pricing`, "x-default": `${BASE}/pricing` },
  },
  openGraph: { title: "أسعار سيرة — ادفع مرة، بدون اشتراك", description: `${formatPrice("single", "ar")} (٢٤ ساعة) أو ${formatPrice("complete", "ar")} (٩٠ يوماً). كل المزايا في الباقتين.`, url: `${BASE}/ar/pricing` },
};

function PlanCard({ id, highlight }: { id: "single" | "complete"; highlight?: boolean }) {
  const p = PLANS[id];
  return (
    <div className="card p-8" style={highlight ? { borderColor: "rgba(139,92,246,0.5)", background: "rgba(139,92,246,0.06)", position: "relative", boxShadow: "0 30px 80px -30px rgba(139,92,246,0.55)" } : undefined}>
      {/* left-5 on the RTL card: the plan name starts at the RIGHT here, and the badge —
          copied from the EN page's right-5 — sat directly on top of it at every width. */}
      {highlight && (
        <div className="absolute left-5 top-5 rounded-full px-2.5 py-1 font-mono text-[10px] font-bold" style={{ background: "var(--accent)", color: "#ffffff" }}>الأفضل قيمة</div>
      )}
      {/* Room for the corner badge: the name line spans the card, so on narrow cards the
          long label ran under the badge whichever side it sat on. inline-end = the badge's
          side in this direction. */}
      <div className="font-mono text-xs uppercase tracking-widest" style={{ color: "var(--faint)", paddingInlineEnd: highlight ? 92 : undefined }}>{p.nameAr} · دفعة واحدة</div>
      <div className="mt-4 flex items-baseline gap-1">
        {/* formatPrice, not p.priceSar: the raw number renders as "35 ريالاً" — Western
            digits on an Arabic page — and it bypasses any configured promotion. */}
        <span className="text-5xl font-extrabold">{formatPrice(p.id, "ar")}</span>
        <span className="text-sm" style={{ color: "var(--muted)" }}>مرة واحدة ({p.priceUsd})</span>
      </div>
      <p className="mt-2 text-sm font-semibold" style={{ color: "var(--accent)" }}>{p.accessLabelAr}</p>
      <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{p.taglineAr}</p>
      <ul className="mt-6 space-y-3 text-sm">
        {p.featuresAr.map((f) => (
          <li key={f} className="flex items-center gap-3" style={{ color: "rgba(244,245,243,0.85)" }}>
            <span className="text-accent">✓</span> {f}
          </li>
        ))}
        {id === "complete" && (
          <li className="flex items-center gap-3" style={{ color: "rgba(244,245,243,0.85)" }}>
            <span className="text-accent">✓</span> ضمان استرداد ٧ أيام
          </li>
        )}
      </ul>
      <div className="mt-8">
        <CheckoutButton plan={id} label={id === "single" ? "وصول ٢٤ ساعة" : "الحزمة الكاملة ←"} variant={highlight ? "accent" : "ghost"} />
      </div>
    </div>
  );
}

export default function ArabicPricingPage() {
  return (
    <PageShell lang="ar" cta={navCta("ar")} langToggle="/pricing" authNav={<AuthNav ar />} mobileMenu={<MobileMenu ar />}>
      <section className="t-enter relative">
        <div className="relative mb-12 text-center">
          <div className="chip mb-4">الأسعار</div>
          <h1 className="text-4xl font-extrabold tracking-tight">ادفع مرة واحدة. بدون اشتراك.</h1>
          <p className="mx-auto mt-3 max-w-xl" style={{ color: "var(--muted)" }}>
            الباقتان تفتحان <strong>كل المزايا</strong> — إعادة كتابة السيرة كاملة، خطاب التعريف، لينكدإن، تحضير المقابلات، وتنزيل بدون علامة مائية. الفرق الوحيد هو مدة الوصول.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <PlanCard id="single" />
          <PlanCard id="complete" highlight />
        </div>
        <p className="mt-8 text-center font-mono text-xs" style={{ color: "var(--faint)" }}>
          دفع آمن عبر Paylink · وصول فوري · ضمان استرداد ٧ أيام على الحزمة الكاملة · بدون اشتراك أبداً
        </p>

        <div className="mt-16">
          <h2 className="mb-6 text-2xl font-bold">أسئلة شائعة</h2>
          <div className="space-y-4">
            {[
              ["هل الفحص مجاني؟", "نعم — درجة التوافق مع ATS والكلمات الناقصة وفجوة المهارات ومعاينة التحسينات كلها مجانية. إعادة الكتابة الكاملة والتنزيل تنفتح بدفعة واحدة."],
              ["هل هو اشتراك؟", `لا. ادفع مرة واحدة. ${formatPrice("single", "ar")} تفتح وصولاً كاملاً ٢٤ ساعة، و${formatPrice("complete", "ar")} تفتح ٩٠ يوماً. لا شيء يتكرر.`],
              ["ما الفرق بين الباقتين؟", `لا فرق في المزايا — كلتاهما تفتح كل شيء. الـ ${formatPrice("complete", "ar")} تُبقي وصولك مفتوحاً ٩٠ يوماً، مثالية لموسم توظيف نشط.`],
              ["هل يمكنني الاسترداد؟", "نعم — الحزمة الكاملة (٩٠ يوماً) عليها ضمان استرداد ٧ أيام."],
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
