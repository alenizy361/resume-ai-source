import type { Metadata } from "next";
import { PLANS, formatPrice } from "@/app/lib/plans";
import PageShell from "@/app/components/PageShell";
import Link from "next/link";
import { BRAND } from "@/app/lib/brand";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

export const metadata: Metadata = {
  title: "الشروط والأحكام وسياسة الاسترجاع | سيرة",
  description: "شروط استخدام خدمة «سيرة» على cv.rabit.sa، الأسعار، وسياسة الاسترجاع.",
  alternates: {
    canonical: `${BASE}/ar/terms`,
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
            {/* الباقتان تختلفان في المدة لا في المزايا — كل دوال الاستحقاق هي `active(e)`، فأي باقة
                سارية تفتح كل شيء. حصر المزايا بالحزمة الكاملة يصف حصرية لا يطبّقها الكود. */}
            <li><strong>الباقتان تفتحان كل شيء:</strong> السيرة المحسّنة كاملة، وخطاب التعريف، ومحسّن لينكدإن، وتحضير المقابلة، والتنزيل بلا علامة. الفرق بينهما في مدة الوصول فقط.</li>
            <li><strong>{PLANS.single.nameAr} — {formatPrice("single", "ar")} (دفعة واحدة):</strong> {PLANS.single.accessLabelAr}</li>
            <li><strong>{PLANS.complete.nameAr} — {formatPrice("complete", "ar")} دفعة واحدة:</strong> {PLANS.complete.accessLabelAr}. دفعة واحدة بدون اشتراك ولا تجديد.</li>
            <li>فحص الدرجة والتحليل مجاني دائماً بدون بطاقة.</li>
          </ul>
        </Section>

        <Section id="refund" title="٣. سياسة الاسترجاع">
          <p>ندفع لك فلوسك كاملة إذا لم تحصل على الخدمة:</p>
          <ul className="mr-5 list-disc space-y-1">
            <li>إذا دفعت ولم تُفعَّل خدمتك، أو فشل النظام بتوليد سيرتك المحسّنة — <strong>استرجاع كامل</strong> خلال ٧ أيام من الدفع.</li>
            {/* الضمان كان معلناً في صفحة الأسعار وفي الأسئلة الشائعة وفي إيصال البريد، وغائباً عن هذه
                الوثيقة وحدها — وهي المكان الوحيد الذي يُلزم. ما يُعلن يُلتزم به، فالأمانة أن يُكتب. */}
            <li>وتحمل <strong>الحزمة الكاملة</strong> إضافةً إلى ذلك <strong>ضمان استرداد ٧ أيام</strong>: اطلب خلال ٧ أيام من الدفع ونعيد لك المبلغ بلا سبب.</li>
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
          <p dir="ltr">📧 <a href={`mailto:${BRAND.supportEmail}`} className="text-accent underline">{BRAND.supportEmail}</a></p>
        </Section>

        <div className="mt-10 flex gap-4">
          <Link href="/ar/privacy" className="btn-ghost px-6 py-2.5 text-sm font-semibold" style={{ color: "var(--fg)" }}>سياسة الخصوصية ←</Link>
          <Link href="/ar" className="btn-accent px-6 py-2.5 text-sm">الرئيسية</Link>
        </div>
      </div>
    </PageShell>
  );
}
