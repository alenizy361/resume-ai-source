import type { Metadata } from "next";
import Landing from "@/app/components/marketing/Landing";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

/** The Arabic homepage. See app/page.tsx for why it explains the product rather than being it. */
export const metadata: Metadata = {
  title: "مساعد مهني ذكي للسوق السعودي — سيرة ذاتية، تطابق ATS، تحضير مقابلات | سيرة",
  description:
    "احصل على وظيفة أسرع بمساعدة مهنية ذكية مصممة للسوق السعودي والخليجي. ابنِ سيرتك، طابقها مع وظيفة حقيقية، تحقق من توافقها مع أنظمة الفرز، جهّز نفسك للمقابلة، وتابع تقديماتك. مجاناً، بالعربية والإنجليزية.",
  alternates: {
    canonical: `${BASE}/ar`,
    languages: { en: `${BASE}/`, ar: `${BASE}/ar`, "x-default": `${BASE}/` },
  },
  openGraph: {
    title: "احصل على وظيفة أسرع بمساعدة مهنية ذكية مصممة للسوق السعودي",
    description:
      "ابنِ سيرة قوية، طابقها مع وظيفة حقيقية، تحقق من توافقها مع أنظمة الفرز، جهّز نفسك للمقابلة، وتابع تقديماتك — كل هذا في مكان واحد. لا يدخل شيء سيرتك قبل أن تعتمده.",
    url: `${BASE}/ar`,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "احصل على وظيفة أسرع بمساعدة مهنية ذكية | سيرة",
    description: "سيرة ذاتية، تطابق وظيفي، تحضير مقابلات، ومتابعة تقديمات — مجاناً وبدون تسجيل.",
  },
};

export default function ArabicHome() {
  return <Landing lang="ar" />;
}
