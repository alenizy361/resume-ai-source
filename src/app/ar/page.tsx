import type { Metadata } from "next";
import Landing from "../components/marketing/Landing";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

/** The Arabic homepage. See app/page.tsx for why it explains the product rather than being it. */
export const metadata: Metadata = {
  title: "منشئ سيرة ذاتية بالذكاء الاصطناعي متوافقة مع ATS | سيرة",
  description:
    "منشئ سيرة ذاتية خطوة بخطوة للسوق السعودي. الذكاء يقترح مهارات مهنتك وأنت تعتمد كل سطر — بلا اختلاق. مجاناً، بالعربية والإنجليزية.",
  alternates: {
    canonical: `${BASE}/ar`,
    languages: { en: `${BASE}/`, ar: `${BASE}/ar`, "x-default": `${BASE}/` },
  },
  openGraph: {
    title: "أنت تكتب الحقائق. والذكاء يصوغها بلغة مهنية.",
    description:
      "منشئ سيرة ذاتية خطوة بخطوة. مهارات ومهام مقترحة لمهنتك، مجمّعة وقابلة للتعديل — ولا يدخل شيء سيرتك قبل أن تعتمده.",
    url: `${BASE}/ar`,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "أنت تكتب الحقائق. والذكاء يصوغها | سيرة",
    description: "منشئ سيرة متوافقة مع أنظمة الفرز، خطوة بخطوة. مجاناً وبدون تسجيل.",
  },
};

export default function ArabicHome() {
  return <Landing lang="ar" />;
}
