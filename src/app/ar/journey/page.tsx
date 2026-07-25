import type { Metadata } from "next";
import Journey from "../../components/Journey";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

/** The Arabic chat door. See `app/journey/page.tsx` for why this is noindex. */
export const metadata: Metadata = {
  title: "ابنِ سيرتك بالمقابلة | cv.rabit.sa",
  description:
    "تحدّث مع المستشار دقيقتين: يقابلك، يعيد صياغة كلامك العفوي إلى أسطر احترافية متوافقة مع أنظمة الفرز، ويسلّمك سيرة جاهزة للتنزيل.",
  alternates: {
    canonical: `${BASE}/ar`,
    languages: { ar: `${BASE}/ar/journey`, en: `${BASE}/journey`, "x-default": `${BASE}/` },
  },
  robots: { index: false, follow: true },
};

export default function ArabicJourneyPage() {
  return <Journey lang="ar" />;
}
