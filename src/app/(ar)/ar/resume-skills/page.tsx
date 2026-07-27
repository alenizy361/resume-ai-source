import type { Metadata } from "next";
import { navCta } from "@/app/lib/brand";
import HubLinks from "@/app/components/HubLinks";
import PageShell from "@/app/components/PageShell";
import Link from "next/link";
import { JOBS_AR, AR_CATEGORIES } from "@/app/lib/jobs-ar";
import { copyFor, sectorForCategory, sectorsFor } from "@/app/lib/sectors.ts";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

/**
 * The page that was missing.
 *
 * `/ar/resume-skills/<slug>` has existed for sixty-one professions and `/ar/resume-skills` returned
 * a 404. Those pages were in the sitemap, so a crawler could reach them, and nothing on the site
 * linked to the set as a whole — which is the definition of an orphan: indexable, unreachable, and
 * receiving no internal link equity from anywhere. The English twin has had this page since it was
 * written.
 */
export const metadata: Metadata = {
  title: "مهارات السيرة الذاتية وكلمات ATS لكل مهنة (2026)",
  description: "المهارات وكلمات ATS التي تفحصها أنظمة التوظيف، مهنة بمهنة — وكيف تكتبها في سيرتك بصدق دون مبالغة.",
  alternates: {
    canonical: `${BASE}/ar/resume-skills`,
    languages: {
      ar: `${BASE}/ar/resume-skills`,
      en: `${BASE}/resume-skills`,
      "x-default": `${BASE}/resume-skills`,
    },
  },
};

export default function Hub() {
  return (
    <PageShell lang="ar" cta={navCta("ar")} langToggle="/resume-skills" width="wide">
      <div className="mx-auto max-w-5xl py-12">
        <div className="mb-6 font-mono text-xs" style={{ color: "var(--faint)" }}>
          <Link href="/ar" style={{ color: "var(--faint)" }}>الرئيسية</Link> ‹ مهارات السيرة الذاتية
        </div>
        <div className="chip mb-4">مهارات السيرة الذاتية</div>
        <h1 className="text-4xl font-extrabold tracking-tight">المهارات وكلمات ATS لكل مهنة</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed" style={{ color: "var(--muted)" }}>
          اختر مهنتك لترى المهارات التي يُرشَّح عليها المتقدّمون، وكلمات ATS بصياغتها الإنجليزية كما تفحصها الأنظمة،
          والشهادات التي تطلبها إعلانات هذه المهنة — مع تنبيه في كل صفحة إلى أن الشهادة شيء والترخيص النظامي شيء آخر
          تحدّده الجهة المنظِّمة وحدها.
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
                  <Link key={j.slug} href={`/ar/resume-skills/${j.slug}`} className="card card-hover p-4" style={{ color: "var(--fg)" }}>
                    <div className="font-bold">{j.title}</div>
                    <div className="mt-1 text-xs" style={{ color: "var(--faint)" }}>{j.keywords.length} كلمة ATS · {j.skills.length} مهارة</div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <HubLinks ar current="/ar/resume-skills" />
    </PageShell>
  );
}
