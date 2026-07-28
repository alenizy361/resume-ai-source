import type { Metadata } from "next";
import { navCta } from "@/app/lib/brand";
import Link from "next/link";
import SectorLink from "@/app/components/seo/SectorLink";
import PageShell from "@/app/components/PageShell";
import { notFound } from "next/navigation";
import { JOBS_AR, AR_SLUGS, getJobAr } from "@/app/lib/jobs-ar";
import { getJob } from "@/app/lib/jobs";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

export function generateStaticParams() {
  return AR_SLUGS.map((job) => ({ job }));
}

export async function generateMetadata({ params }: { params: Promise<{ job: string }> }): Promise<Metadata> {
  const { job } = await params;
  const j = getJobAr(job);
  if (!j) return {};
  const hasEn = !!getJob(job);
  return {
    title: `مهارات وكلمات ATS لسيرة ${j.title} (2026)`,
    description: `أهم مهارات ${j.title} وكلمات ATS التي يبحث عنها مسؤولو التوظيف. أضف الصحيحة منها لترفع نسبة تطابق سيرتك.`,
    keywords: `مهارات ${j.title}, كلمات ATS ${j.title}, مهارات السيرة الذاتية ${j.title}, ${j.titleEn} skills`,
    alternates: {
      canonical: `${BASE}/ar/resume-skills/${j.slug}`,
      languages: hasEn
        ? { ar: `${BASE}/ar/resume-skills/${j.slug}`, en: `${BASE}/resume-skills/${j.slug}`, "x-default": `${BASE}/resume-skills/${j.slug}` }
        : { ar: `${BASE}/ar/resume-skills/${j.slug}` },
    },
  };
}

export default async function Page({ params }: { params: Promise<{ job: string }> }) {
  const { job } = await params;
  const j = getJobAr(job);
  if (!j) notFound();

  const siblings = JOBS_AR.filter((x) => x.category === j.category && x.slug !== j.slug).slice(0, 8);
  const hasEn = Boolean(getJob(job));

  const ld = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "الرئيسية", item: `${BASE}/ar` },
      { "@type": "ListItem", position: 2, name: j.title, item: `${BASE}/ar/resume-skills/${j.slug}` },
    ],
  };

  return (
    <PageShell lang="ar" cta={navCta("ar")} langToggle={hasEn ? `/resume-skills/${j.slug}` : undefined}>
      <article className="mx-auto max-w-3xl py-10">
        <div className="mb-6 font-mono text-xs" style={{ color: "var(--faint)" }}>
          <Link href="/ar" style={{ color: "var(--faint)" }}>الرئيسية</Link> › {j.title}
        </div>
        <div className="chip mb-4">{j.category}</div>
        <h1 className="text-4xl font-extrabold leading-tight tracking-tight">مهارات وكلمات ATS لسيرة {j.title}</h1>
        <p className="mt-4 text-lg leading-relaxed" style={{ color: "var(--muted)" }}>
          لتعبر سيرة {j.title} أنظمة التوظيف، تحتاج المهارات والكلمات المفتاحية الصحيحة بصياغة الإعلان الوظيفي. أدرج ما تملكه فعلاً فقط.
        </p>

        <section className="t-enter mt-10">
          <h2 className="mb-4 text-2xl font-bold">كلمات ATS الأساسية</h2>
          <div className="flex flex-wrap gap-2">
            {j.keywords.map((k) => (
              <span key={k} dir="ltr" className="rounded-full px-3 py-1 text-xs font-medium" style={{ background: "rgba(139,92,246,0.14)", color: "var(--accent-deep)" }}>{k}</span>
            ))}
          </div>
        </section>

        <section className="t-enter mt-10">
          <h2 className="mb-4 text-2xl font-bold">المهارات الأساسية (Hard & Soft)</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {j.skills.map((s) => (
              <li key={s} className="flex items-center gap-2 text-sm" style={{ color: "var(--muted)" }}><span className="text-accent">✓</span> {s}</li>
            ))}
          </ul>
        </section>

        {/*
          نثر حقيقي، لا قوائم فقط.
          كانت هذه الصفحة ترسل ١٥٩ كلمة لمحرك البحث بينما ترسل نظيرتها الإنجليزية ٥٠٨ — مقيسة بـ
          `ops/seo-audit.mjs`. صفحة عربية أنحف من الإنجليزية في منتج «العربية أولاً» ليست مصادفة،
          وهي أيضاً السبب في أنها لا تظهر في نتائج البحث العربية. الفقرات أدناه تُبنى من بيانات
          المهنة نفسها، فتختلف من صفحة لأخرى بدل أن تكون قالباً واحداً مكرراً.
        */}
        <section className="t-enter mt-10">
          <h2 className="mb-4 text-2xl font-bold">كيف تكتب هذه المهارات في سيرتك</h2>
          <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
            قائمة مهارات مرصوصة في أسفل الصفحة لا تُقنع أحداً — لا نظام الفرز ولا القارئ. أنظمة
            التتبّع تبحث عن الكلمة في سياقها، والمُوظِّف يقرأ ما فعلته بها. اذكر أهم ثلاث أو أربع
            مهارات من القائمة أعلاه داخل سطور خبرتك نفسها: أين استخدمتها، وعلى أي نظام أو أداة،
            وما الذي تغيّر بعدها. أما قسم المهارات فاجعله للبقية، مكتوباً بنفس صياغة الإعلان
            الوظيفي الذي تتقدّم له — لا بصياغتك أنت.
          </p>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
            ولا تُدرج مهارة لا تستطيع الدفاع عنها في المقابلة. كلمة مفتاحية تعبر بها الفرز ثم تسقط
            عندها في السؤال الأول تكلّفك أكثر مما تكسبه، وفي سوق {j.category} تحديداً يُسأل عنها
            بالتفصيل.
          </p>
        </section>

        <section className="t-enter mt-10">
          <h2 className="mb-4 text-2xl font-bold">أخطاء شائعة في سيرة {j.title}</h2>
          <ul className="space-y-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
            <li>· سرد المهام بدل النتائج: «مسؤول عن…» تصف الوظيفة التي كانت موجودة، لا ما قدّمته أنت فيها.</li>
            <li>· ترجمة المسمى الوظيفي حرفياً: اكتب المسمى كما يُكتب في إعلانات {j.category} في السوق الذي تتقدّم إليه.</li>
            <li>· خلط اللغتين في مستند واحد: نصف السيرة بالعربية ونصفها بالإنجليزية يعني أنها لا تطابق أي بحث كاملاً.</li>
            <li>· إخفاء التواريخ أو كتابتها بصيغة لا يقرأها المحلّل — والوظيفة بلا تاريخ بداية تُقرأ كفجوة.</li>
            <li>· قائمة مهارات طويلة بلا ترتيب: أول خمس كلمات هي ما يُقرأ فعلاً.</li>
          </ul>
        </section>

        <section className="t-enter mt-10">
          <h2 className="mb-4 text-2xl font-bold">شهادات تعزّز فرصك</h2>
          <div className="flex flex-wrap gap-2">
            {j.certs.map((c) => (
              <span key={c} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--muted)" }}>{c}</span>
            ))}
          </div>
        </section>

        <p className="mt-4 text-xs leading-relaxed" style={{ color: "var(--faint)" }}>
          الشهادات أعلاه شائعة في إعلانات هذه المهنة، وليست بالضرورة تراخيص نظامية. أما ما يلزمك
          قانوناً لمزاولة المهنة — تصنيف أو تسجيل أو رخصة — فتحدّده الجهة المنظِّمة لمهنتك في بلد
          العمل، وتحقّق منه لديها مباشرة قبل إدراجه في سيرتك.
        </p>

        <div className="card mt-10 p-7 text-center" style={{ borderColor: "rgba(139,92,246,0.4)", background: "rgba(139,92,246,0.05)" }}>
          <h2 className="text-2xl font-bold">أضف هذه المهارات لسيرتك تلقائياً</h2>
          <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: "var(--muted)" }}>الصق سيرتك واحصل على الكلمات الناقصة ونسبة التطابق فوراً — مجاناً.</p>
          <Link href="/ar/optimize" className="btn-accent mt-5 inline-block px-8 py-3">افحص سيرتي مجاناً ←</Link>
        </div>

        <section className="t-enter mt-10">
          <h2 className="mb-4 text-2xl font-bold">روابط مفيدة</h2>
          <div className="flex flex-wrap gap-3">
            <Link href={`/ar/resume-examples/${j.slug}`} className="btn-ghost px-4 py-2 text-sm font-semibold" style={{ color: "var(--fg)" }}>مثال سيرة {j.title} ←</Link>
            <Link href={`/ar/cover-letter-examples/${j.slug}`} className="btn-ghost px-4 py-2 text-sm font-semibold" style={{ color: "var(--fg)" }}>خطاب تعريف {j.title} ←</Link>
          </div>
        </section>

        {siblings.length > 0 && (
          <section className="t-enter mt-10">
            <h2 className="mb-4 text-2xl font-bold">مهارات مهن {j.category} الأخرى</h2>
            <div className="flex flex-wrap gap-2">
              {siblings.map((s) => (
                <Link key={s.slug} href={`/ar/resume-skills/${s.slug}`} className="rounded-lg px-3 py-1.5 text-sm" style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--muted)" }}>{s.title}</Link>
              ))}
            </div>
            <SectorLink category={j.category} lang="ar" className="mt-4 inline-block text-sm font-semibold text-accent" />
          </section>
        )}
      </article>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
    </PageShell>
  );
}
