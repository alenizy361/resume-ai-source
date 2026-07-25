import type { Metadata } from "next";
import DoorRedirect from "../components/DoorRedirect";
import Builder from "../components/build/Builder";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

/** The Arabic homepage. See app/page.tsx for why this is the builder now. */
export const metadata: Metadata = {
  title: "أنشئ سيرة ذاتية تعبر أنظمة الفرز — أنت تكتب الحقائق والذكاء يصوغها | cv.rabit.sa",
  description:
    "منشئ سيرة ذاتية خطوة بخطوة للسوق السعودي والخليجي. الذكاء يقترح مهارات ومهام مهنتك، وأنت تعتمد كل سطر. لا يختلق جهة عمل ولا تاريخاً ولا شهادة ولا رقماً. مجاناً، بلا تسجيل، بالعربية والإنجليزية.",
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
  return (
    <>
      <Builder lang="ar" />
      <DoorRedirect lang="ar" rendered="form" />
    </>
  );
}
