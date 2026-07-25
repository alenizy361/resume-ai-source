import type { Metadata } from "next";
import BuilderStart from "../../components/build/BuilderStart";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

/*
 * This address used to be a 308 to /ar/build.
 *
 * It held the retired Arabic-only scripted chat builder, and the redirect existed so the
 * crawled URL kept its history instead of 404ing. The URL now leads to the thing it always
 * claimed to be — the Arabic builder — so the redirect has served its purpose and the page
 * takes the address back.
 */
export const metadata: Metadata = {
  title: "ابنِ سيرتك الذاتية خطوة بخطوة | cv.rabit.sa",
  description:
    "إحدى عشرة خطوة قصيرة: الوظيفة المستهدفة، خبرتك، شهاداتك، ثم التصميم والتنزيل. الذكاء يقترح المهارات والمهام لمهنتك — وأنت تعتمد كل سطر. مجاناً وبلا تسجيل.",
  alternates: {
    canonical: `${BASE}/ar/builder`,
    languages: { ar: `${BASE}/ar/builder`, en: `${BASE}/builder`, "x-default": `${BASE}/builder` },
  },
  openGraph: {
    title: "ابنِ سيرتك الذاتية خطوة بخطوة",
    description: "خطوة واحدة كل مرة، وسيرتك تتحدّث أمامك. لا يدخل شيء يكتبه الذكاء في المستند قبل أن تعتمده.",
    url: `${BASE}/ar/builder`,
    type: "website",
  },
};

export default function ArabicBuilderStartPage() {
  return <BuilderStart lang="ar" />;
}
