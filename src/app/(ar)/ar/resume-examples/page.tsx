import type { Metadata } from "next";
import { copyright } from "@/app/lib/brand";
import HubLinks from "@/app/components/HubLinks";
import BrandOrb from "@/app/components/BrandOrb";
import Link from "next/link";
import { JOBS_AR, AR_CATEGORIES } from "@/app/lib/jobs-ar";
import { copyFor, sectorForCategory, sectorsFor } from "@/app/lib/sectors.ts";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

export const metadata: Metadata = {
  title: "أمثلة سير ذاتية عربية لكل مهنة + كلمات ATS (2026)",
  description: "دليل أمثلة السير الذاتية العربية لكل مهنة — كلمات ATS، المهارات، ونماذج جاهزة. اختر مهنتك وابنِ سيرتك المتوافقة مع أنظمة التوظيف مجاناً.",
  alternates: {
    canonical: `${BASE}/ar/resume-examples`,
    languages: { ar: `${BASE}/ar/resume-examples`, en: `${BASE}/resume-examples`, "x-default": `${BASE}/resume-examples` },
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
        <div className="chip mb-4">أمثلة السير الذاتية</div>
        <h1 className="text-4xl font-extrabold tracking-tight">أمثلة سير ذاتية عربية لكل مهنة</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed" style={{ color: "var(--muted)" }}>
          اختر مهنتك لترى نموذج سيرة ذاتية كاملاً، كلمات ATS التي تفحصها أنظمة التوظيف، المهارات، وخطاب تعريف جاهز — ثم ابنِ سيرتك مجاناً.
        </p>

        {/* التصفّح حسب القطاع — لمن يعرف مجاله ولا يعرف المسمّى الذي يبحث عنه. */}
        {/* `t-no-cv`: on screen from the first frame — see the note in transitions.css and F-22. */}
        <section className="t-enter t-no-cv mt-10">
          <h2 className="mb-3 text-xl font-bold">تصفّح حسب القطاع</h2>
          <div className="flex flex-wrap gap-2">
            {sectorsFor("ar").map((s) => (
              <Link key={s.slug} href={`/ar/resume-examples/category/${s.slug}`}
                className="rounded-lg px-3.5 py-2 text-sm font-semibold"
                style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--muted)" }}>
                {copyFor(s, "ar")!.name}
              </Link>
            ))}
            <Link href="/ar/resume-examples/category" className="rounded-lg px-3.5 py-2 text-sm font-semibold text-accent"
              style={{ border: "1px solid var(--line)" }}>كل القطاعات →</Link>
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
                <Link key={j.slug} href={`/ar/resume-examples/${j.slug}`}
                  className="card card-hover p-4" style={{ color: "var(--fg)" }}>
                  <div className="font-bold">{j.title}</div>
                  <div className="mt-1 text-xs" style={{ color: "var(--faint)" }}>مثال سيرة · مهارات · خطاب تعريف</div>
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
          <HubLinks ar current="/ar/resume-examples" />
    </main>
  );
}
