import type { Metadata } from "next";
import Builder from "../../components/build/Builder";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

export const metadata: Metadata = {
  title: "أنشئ سيرة ذاتية متوافقة مع ATS خطوة بخطوة | cv.rabit.sa",
  description:
    "أنت تكتب الحقائق، والذكاء يصوغها بلغة مهنية. مهارات ومهام مقترحة لمهنتك، مجمّعة وقابلة للتعديل — ولا يدخل شيء سيرتك قبل أن تعتمده. مجاناً وبلا تسجيل.",
  alternates: {
    canonical: `${BASE}/ar/build`,
    languages: { ar: `${BASE}/ar/build`, en: `${BASE}/build`, "x-default": `${BASE}/build` },
  },
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
