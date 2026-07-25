import type { Metadata } from "next";
import Builder from "../../components/build/Builder";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

export const metadata: Metadata = {
  title: "أنشئ سيرة ذاتية متوافقة مع ATS خطوة بخطوة | cv.rabit.sa",
  description:
    "أنت تكتب الحقائق، والذكاء يصوغها بلغة مهنية. مهارات ومهام مقترحة لمهنتك، مجمّعة وقابلة للتعديل — ولا يدخل شيء سيرتك قبل أن تعتمده. مجاناً وبلا تسجيل.",
  // The long single-page builder in Arabic. See app/build/page.tsx.
  alternates: {
    canonical: `${BASE}/ar/builder`,
    languages: { en: `${BASE}/builder`, ar: `${BASE}/ar/builder`, "x-default": `${BASE}/builder` },
  },
  robots: { index: false, follow: true },
  openGraph: {
    title: "أنشئ سيرة ذاتية متوافقة مع ATS خطوة بخطوة",
    description: "أنت تكتب الحقائق. والذكاء يصوغها — ولا يختلق جهة عمل ولا تاريخاً ولا شهادة ولا رقماً.",
    url: `${BASE}/ar/build`,
    type: "website",
  },
};

export default function ArabicBuildPage() {
  return <Builder lang="ar" />;
}
