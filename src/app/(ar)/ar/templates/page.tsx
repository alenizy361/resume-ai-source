import type { Metadata } from "next";
import HubLinks from "@/app/components/HubLinks";
import PageShell from "@/app/components/PageShell";
import { navCta } from "@/app/lib/brand";
import TemplatesGallery from "@/app/components/TemplatesGallery";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

export const metadata: Metadata = {
  title: "قوالب السيرة — متوافقة مع ATS، عربية وإنجليزية | سيرة",
  description:
    "تصفّح قوالب سيرة احترافية متوافقة مع أنظمة الفرز ATS بالعربية والإنجليزية. اختر التصميم، والذكاء يعبّئه بخبرتك الحقيقية — بدون اختلاق. ابدأ مجاناً.",
  alternates: {
    canonical: `${BASE}/ar/templates`,
    languages: { en: `${BASE}/templates`, ar: `${BASE}/ar/templates`, "x-default": `${BASE}/templates` },
  },
  openGraph: { title: "قوالب سيرة متوافقة مع ATS", description: "قوالب احترافية تعبر أنظمة الفرز، بالعربية والإنجليزية.", url: `${BASE}/ar/templates` },
};

export default function ArabicTemplatesPage() {
  return (
    <PageShell lang="ar" cta={navCta("ar")} langToggle="/templates" width="full">
      <section className="t-enter relative mx-auto max-w-6xl py-14">
        <div className="relative mb-10 text-center">
          <div className="chip mb-4">القوالب</div>
          <h1 className="text-4xl font-extrabold tracking-tight">قوالب سيرة احترافية</h1>
          <p className="mx-auto mt-3 max-w-2xl" style={{ color: "var(--muted)" }}>
            كل قالب <strong>متوافق مع ATS</strong> ويعمل بالعربية والإنجليزية. اختر التصميم — والذكاء يعبّئه بخبرتك <em>الحقيقية</em>، بدون اختلاق أي حقيقة.
          </p>
        </div>
        <TemplatesGallery ar />
        <p className="mt-10 text-center text-sm" style={{ color: "var(--faint)" }}>
          الـ PDF المصمّم ممتاز للمسؤولين ولينكدإن. وللتقديم عبر أنظمة الفرز استخدم PDF/Word النصي — كلاهما مشمول.
        </p>
      </section>
      <HubLinks ar current="/ar/templates" />
    </PageShell>
  );
}
