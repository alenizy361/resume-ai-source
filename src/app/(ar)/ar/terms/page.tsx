import type { Metadata } from "next";
import { PLANS, formatPrice } from "@/app/lib/plans";
import PageShell from "@/app/components/PageShell";
import Link from "next/link";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

export const metadata: Metadata = {
  title: "الشروط والأحكام وسياسة الاسترجاع | سيرة",
  description: "شروط استخدام خدمة «سيرة» على cv.rabit.sa، الأسعار، وسياسة الاسترجاع.",
  alternates: {
    canonical: `${BASE}/ar/terms`,
    languages: { en: `${BASE}/terms`, ar: `${BASE}/ar/terms`, "x-default": `${BASE}/terms` },
  },
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="t-enter mb-8">
    <h2 className="mb-3 text-xl font-bold">{title}</h2>
    <div className="space-y-2 text-sm leading-relaxed" style={{ color: "rgba(244,245,243,0.75)" }}>{children}</div>
  </section>
);

export default function ArTermsPage() {
  return (
    <PageShell lang="ar" langToggle="/terms">
      <div className="mx-auto max-w-3xl">
        <div className="chip mb-4">الشروط والأحكام</div>
        <h1 className="mb-2 text-3xl font-extrabold">شروط الاستخدام وسياسة الاسترجاع</h1>
        <p className="mb-10 text-sm" style={{ color: "var(--muted)" }}>آخر تحديث: يوليو ٢٠٢٦ · تنطبق على cv.rabit.sa</p>

        <Section title="١. الخدمة">
          <p>
            «سيرة» أداة ذكاء اصطناعي تساعدك على تحسين وضوح سيرتك الذاتية وملاءمتها لمتطلبات الوظائف،
            وبناء سيرة إنجليزية من إجاباتك. النتائج <strong>مساعدة تحريرية</strong> — لا نضمن قبولك في وظيفة
            ولا اجتياز أي نظام توظيف معيّن، لأن قرارات التوظيف بيد جهات التوظيف وأنظمتها المختلفة.
          </p>
          <p>أنت مسؤول عن مراجعة النتيجة قبل استخدامها، خاصة المواضع المعلَّمة بـ«[أضف رقمك الفعلي]».</p>
        </Section>

        <Section title="٢. الأسعار">
          <ul className="mr-5 list-disc space-y-1">
            <li><strong>{PLANS.single.nameAr} — {formatPrice("single", "ar")} (دفعة واحدة):</strong> {PLANS.single.accessLabelAr} يشمل السيرة المحسّنة كاملة وخطاب التعريف.</li>
            <li><strong>{PLANS.complete.nameAr} — {formatPrice("complete", "ar")} دفعة واحدة:</strong> السيرة + خطاب التعريف + لينكدإن + تحضير المقابلة، {PLANS.complete.accessLabelAr}. دفعة واحدة بدون اشتراك ولا تجديد.</li>
            <li>فحص الدرجة والتحليل مجاني دائماً بدون بطاقة.</li>
          </ul>
        </Section>

        <Section title="٣. سياسة الاسترجاع">
          <p>ندفع لك فلوسك كاملة إذا لم تحصل على الخدمة:</p>
          <ul className="mr-5 list-disc space-y-1">
            <li>إذا دفعت ولم تُفعَّل خدمتك، أو فشل النظام بتوليد سيرتك المحسّنة — <strong>استرجاع كامل</strong> خلال ٧ أيام من الدفع.</li>
            <li>راسلنا بالبريد مع رقم العملية وسنعالج الطلب خلال ٣ أيام عمل، ويعود المبلغ عبر نفس وسيلة الدفع.</li>
            <li>لا يشمل الاسترجاع حالة استخدام الخدمة الكامل ثم طلب الاسترجاع لعدم الإعجاب بالأسلوب — لكن راسلنا وسنحاول إرضاءك.</li>
          </ul>
        </Section>

        <Section title="٤. الاستخدام المقبول">
          <ul className="mr-5 list-disc space-y-1">
            <li>لا تستخدم الخدمة لإنشاء سير بمعلومات كاذبة عن هوية شخص آخر أو مؤهلات مزوّرة.</li>
            <li>روابط النشر العامة مخصّصة لسيرتك أنت — يُحذَف أي محتوى مخالف أو مسيء.</li>
            <li>يُحظر الاستخدام الآلي المفرط (سكربتات/هجمات) وقد يُقيَّد.</li>
          </ul>
        </Section>

        <Section title="٥. الدفع">
          <p>
            المدفوعات تُعالَج عبر بوابة «Paylink» المرخّصة في السعودية (مدى، فيزا، ماستركارد) بالريال السعودي.
            لا نطّلع على بيانات بطاقتك ولا نخزّنها.
          </p>
        </Section>

        <Section title="٦. التواصل">
          <p>
            الخدمة تعمل على نطاق <span dir="ltr">cv.rabit.sa</span> التابع لـ«رابِت» (Rabit).
            لأي مشكلة دفع أو استفسار:
          </p>
          <p dir="ltr">📧 <a href="mailto:alanziabdulaziz4@gmail.com" className="text-accent underline">alanziabdulaziz4@gmail.com</a></p>
        </Section>

        <div className="mt-10 flex gap-4">
          <Link href="/ar/privacy" className="btn-ghost px-6 py-2.5 text-sm font-semibold" style={{ color: "var(--fg)" }}>سياسة الخصوصية ←</Link>
          <Link href="/ar" className="btn-accent px-6 py-2.5 text-sm">الرئيسية</Link>
        </div>
      </div>
    </PageShell>
  );
}
