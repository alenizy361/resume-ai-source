import type { Metadata } from "next";
import PageShell from "@/app/components/PageShell";
import Link from "next/link";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

export const metadata: Metadata = {
  title: "سياسة الخصوصية | سيرة",
  description: "كيف نعالج سيرتك الذاتية وبياناتك: ما يبقى على جهازك، وما يُحفظ في حسابك عند تسجيل الدخول، وكيف تحذف أياً منهما.",
  alternates: {
    canonical: `${BASE}/ar/privacy`,
    languages: { en: `${BASE}/privacy`, ar: `${BASE}/ar/privacy`, "x-default": `${BASE}/privacy` },
  },
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="t-enter mb-8">
    <h2 className="mb-3 text-xl font-bold">{title}</h2>
    <div className="space-y-2 text-sm leading-relaxed" style={{ color: "rgba(244,245,243,0.75)" }}>{children}</div>
  </section>
);

export default function ArPrivacyPage() {
  return (
    <PageShell lang="ar" langToggle="/privacy">
      <div className="mx-auto max-w-3xl">
        <div className="chip mb-4">سياسة الخصوصية</div>
        <h1 className="mb-2 text-3xl font-extrabold">خصوصيتك وسيرتك الذاتية</h1>
        <p className="mb-10 text-sm" style={{ color: "var(--muted)" }}>
          آخر تحديث: يوليو ٢٠٢٦ · تنطبق على cv.rabit.sa — خدمة السير الذاتية المقدَّمة عبر نطاق Rabit.sa
        </p>

        <Section title="١. هل تُخزَّن سيرتك عندنا؟">
          <p>
            <strong>إن لم تكن مسجّلاً دخولك</strong>، فلا. المسودّة التي تكتبها تُحفَظ على جهازك أنت فقط
            (متصفحك — localStorage) لكي لا تضيع كتابتك عند تحديث الصفحة، وتقدر تمسحها بزر «ابدأ من جديد» أو
            بمسح بيانات المتصفح. وعند الفحص يُرسَل النص لمعالجته فوراً ثم يُعاد إليك — لا يبقى شيء لدينا.
          </p>
          <p>
            <strong>أما إن سجّلت دخولك</strong>، فسيرتك المنظَّمة (السيرة التي تبنيها — جهات عملك، تواريخك،
            تراخيصك، وكل سطر أكّدته) تُحفَظ في حسابك على خوادمنا، لتكون متاحة إن عدت من جهاز آخر. تُحفَظ تحت
            بريدك الإلكتروني، ولا تُشارَك مع أي جهة، وتقدر تحذف أي سيرة محفوظة نهائياً من صفحة حسابك في أي وقت
            — الحذف فوري، وليس طلباً ننفّذه لاحقاً.
          </p>
          <p>
            استثناء آخر في الحالتين: إذا ضغطت أنت «انشر رابطاً عاماً» فسيُحفَظ النص الذي اخترت نشره على رابط
            عام، ومعك زر «إلغاء النشر» يحذفه نهائياً في أي وقت.
          </p>
        </Section>

        <Section title="٢. أين تتم المعالجة؟">
          <p>
            المعالجة تتم عبر مزوّد ذكاء اصطناعي سحابي (خوادم خارج المملكة — الولايات المتحدة). يُرسَل نص السيرة
            لغرض توليد النتيجة فقط. <strong>لا نستخدم بياناتك لتدريب أي نموذج</strong>، ولا نبيعها أو نشاركها مع
            أي جهة تسويقية.
          </p>
        </Section>

        <Section title="٣. ما الذي نحتفظ به فعلاً؟">
          <p>فقط الحد الأدنى لتشغيل حسابك:</p>
          <ul className="mr-5 list-disc space-y-1">
            <li>بريدك الإلكتروني (لتسجيل الدخول وربط اشتراكك) — يُحفَظ حتى تطلب حذفه.</li>
            <li>حالة اشتراكك وتاريخ انتهائه.</li>
            <li>أي سيرة تختار حفظها وأنت مسجّل الدخول — تبقى محفوظة حتى تحذفها من حسابك، وتقدر تفعل ذلك في أي وقت.</li>
            <li>بيانات الدفع تُعالَج بالكامل لدى بوابة الدفع المرخّصة «Paylink» — نحن لا نرى ولا نخزّن رقم بطاقتك إطلاقاً.</li>
          </ul>
        </Section>

        <Section title="٤. تعهّد عدم الاختلاق">
          <p>
            نظامنا مقيَّد برمجياً بعدم إضافة أي رقم أو خبرة أو شهادة لم تذكرها أنت في سيرتك. إذا كان الرقم
            ناقصاً يكتب النظام مكانه «[أضف رقمك الفعلي]» بدل اختراعه. سيرتك تبقى سيرتك — أوضح وأقوى، لكن صادقة.
          </p>
        </Section>

        <Section title="٥. حقوقك وطريقة الحذف">
          <ul className="mr-5 list-disc space-y-1">
            <li>حذف مسودّاتك: زر «ابدأ من جديد» أو مسح بيانات الموقع من متصفحك (فوري، بيدك).</li>
            <li>حذف رابط منشور: زر «إلغاء النشر» بجانب الرابط.</li>
            <li>حذف حسابك وبريدك نهائياً: راسلنا وسننفّذ خلال ٧ أيام.</li>
            <li>وفق نظام حماية البيانات الشخصية السعودي (PDPL) لك حق الاطلاع والتصحيح والحذف — تواصل معنا لأي منها.</li>
          </ul>
        </Section>

        <Section title="٦. من نحن وكيف تتواصل معنا؟">
          <p>
            «سيرة» خدمة سير ذاتية تعمل على نطاق <span dir="ltr">cv.rabit.sa</span> التابع لـ«رابِت» (Rabit).
            لأي استفسار عن بياناتك أو الدفع أو الحذف:
          </p>
          <p dir="ltr">
            📧 <a href="mailto:alanziabdulaziz4@gmail.com" className="text-accent underline">alanziabdulaziz4@gmail.com</a>
          </p>
          <p>نرد عادة خلال ٢٤–٤٨ ساعة.</p>
        </Section>

        <div className="mt-10 flex gap-4">
          <Link href="/ar/terms" className="btn-ghost px-6 py-2.5 text-sm font-semibold" style={{ color: "var(--fg)" }}>الشروط والأحكام ←</Link>
          <Link href="/ar" className="btn-accent px-6 py-2.5 text-sm">الرئيسية</Link>
        </div>
      </div>
    </PageShell>
  );
}
