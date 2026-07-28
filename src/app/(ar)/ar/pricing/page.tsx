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
      {/* In flow, matching the EN card — see that file for why reserving padding for an
          absolutely-positioned badge could not hold. A flex row needs no side-awareness at all:
          `justify-between` follows the writing direction on its own, which is what the old
          left-5/right-5 pair was hand-simulating. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 font-mono text-xs uppercase tracking-widest" style={{ color: "var(--faint)" }}>{p.nameAr}</div>
        {highlight && (
          <div className="shrink-0 rounded-full px-2.5 py-1 font-mono text-[10px] font-bold" style={{ background: "var(--accent-deep)", color: "#ffffff" }}>الأفضل قيمة</div>
        )}
      </div>
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
          <li key={f} className="flex items-center gap-3" style={{ color: "var(--muted)" }}>
            <span className="text-accent">✓</span> {f}
          </li>
        ))}
        {id === "complete" && (
          <li className="flex items-center gap-3" style={{ color: "var(--muted)" }}>
            <span className="text-accent">✓</span> ضمان استرداد ٧ أيام
          </li>
        )}
      </ul>
      <div className="mt-8">
        <CheckoutButton ar plan={id} label={id === "single" ? "وصول ٢٤ ساعة" : "الحزمة الكاملة ←"} variant={highlight ? "accent" : "ghost"} />
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
          {/* الصفحة الرئيسية تعرض خطة مجانية، وهذه الصفحة كانت تعرض باقتين مدفوعتين فقط — فيرى
              الزائر منتجين مختلفين بعد نقرة واحدة. سطر واحد يوفّق بينهما. */}
          <p className="mx-auto mt-3 max-w-xl text-sm" style={{ color: "var(--faint)" }}>
            البناء مجاني — البنّاء كامل بالعربي والإنجليزي، مع مطابقة الوظائف وفحص الفرز. التنزيل
            المجاني يحمل علامة مائية صغيرة، والدفع هو ما يزيلها ويفتح إعادة الكتابة وخطاب التعريف
            ولينكدإن وتحضير المقابلات.
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
