import type { Metadata } from "next";
import { copyright } from "@/app/lib/brand";
import HubLinks from "@/app/components/HubLinks";
import BrandOrb from "@/app/components/BrandOrb";
import Link from "next/link";
import { JOBS_AR, AR_CATEGORIES } from "@/app/lib/jobs-ar";
import { copyFor, sectorForCategory, sectorsFor } from "@/app/lib/sectors.ts";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

/** The second orphaned set — sixty-one Arabic cover-letter pages with no index above them. */
export const metadata: Metadata = {
  title: "نماذج خطابات تعريف عربية لكل مهنة (2026)",
  description: "خطاب تعريف جاهز للتخصيص لكل مهنة، بهيكل من أربع فقرات وأمثلة صياغة — واضح ومختصر بلا مبالغات.",
  alternates: {
    canonical: `${BASE}/ar/cover-letter-examples`,
    languages: {
      ar: `${BASE}/ar/cover-letter-examples`,
      en: `${BASE}/cover-letter-examples`,
      "x-default": `${BASE}/cover-letter-examples`,
    },
  },
};

export default function Hub() {
  return (
    <main dir="rtl" lang="ar" className="min-h-dvh" style={{ background: "var(--bg)", color: "var(--fg)" }}>
      <nav className="ps-header">
        <div className="ps-header-in">
          <Link href="/ar" className="flex items-center gap-2.5">
            <BrandOrb size={26} />
            <span className="text-[15px] font-bold tracking-tight">سيرة</span>
          </Link>
          <Link href="/ar/optimize" className="btn-accent px-4 py-2 text-sm">افحص سيرتي</Link>
        </div>
      </nav>

      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="mb-6 font-mono text-xs" style={{ color: "var(--faint)" }}>
          <Link href="/ar" style={{ color: "var(--faint)" }}>الرئيسية</Link> ‹ خطابات التعريف
        </div>
        <div className="chip mb-4">خطابات التعريف</div>
        <h1 className="text-4xl font-extrabold tracking-tight">نماذج خطابات تعريف لكل مهنة</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed" style={{ color: "var(--muted)" }}>
          خطاب التعريف في السوق السعودي يُقرأ سريعاً أو لا يُقرأ أصلاً، فالمكسب كله في أول سطرين: الوظيفة المحدّدة
          التي تتقدّم لها، وسبب واحد ملموس يجعلك مناسباً لها. اختر مهنتك لترى هيكلاً من أربع فقرات ونموذجاً
          تُبدِّل فيه الأقواس بحقائقك — وليس نصاً يُنسَخ كما هو.
        </p>

        <section className="t-enter mt-10">
          <h2 className="mb-3 text-xl font-bold">تصفّح حسب القطاع</h2>
          <div className="flex flex-wrap gap-2">
            {sectorsFor("ar").map((s) => (
              <Link key={s.slug} href={`/ar/resume-examples/category/${s.slug}`}
                className="rounded-lg px-3.5 py-2 text-sm font-semibold"
                style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--muted)" }}>
                {copyFor(s, "ar")!.name}
              </Link>
            ))}
          </div>
        </section>

        {AR_CATEGORIES.map((cat) => {
          const sector = sectorForCategory(cat, "ar");
          return (
            <section key={cat} className="mt-10">
              <h2 className="mb-4 text-xl font-bold">
                {sector
                  ? <Link href={`/ar/resume-examples/category/${sector.slug}`} style={{ color: "var(--fg)" }}>{cat}</Link>
                  : cat}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {JOBS_AR.filter((j) => j.category === cat).map((j) => (
                  <Link key={j.slug} href={`/ar/cover-letter-examples/${j.slug}`} className="card card-hover p-4" style={{ color: "var(--fg)" }}>
                    <div className="font-bold">{j.title}</div>
                    <div className="mt-1 text-xs" style={{ color: "var(--faint)" }}>هيكل · نموذج جاهز · أخطاء شائعة</div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <footer className="px-6 py-10" style={{ borderTop: "1px solid var(--line)" }}>
        <p className="text-center font-mono text-xs" style={{ color: "var(--faint)" }}>{copyright("ar")}</p>
      </footer>
      <HubLinks ar current="/ar/cover-letter-examples" />
    </main>
  );
}
