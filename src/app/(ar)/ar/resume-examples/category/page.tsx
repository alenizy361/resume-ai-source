import type { Metadata } from "next";
import { SectorIndex } from "@/app/components/seo/SectorPage";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

export const metadata: Metadata = {
  title: "أمثلة السير الذاتية حسب القطاع — كلمات ATS لكل قطاع",
  description: "تصفّح أمثلة السير الذاتية حسب القطاع: المهن في كل قطاع، وكلمات ATS المتكرّرة بينها، والشهادات التي تطلبها أكثر من وظيفة.",
  alternates: {
    canonical: `${BASE}/ar/resume-examples/category`,
    languages: {
      ar: `${BASE}/ar/resume-examples/category`,
      en: `${BASE}/resume-examples/category`,
      "x-default": `${BASE}/resume-examples/category`,
    },
  },
};

export default function Page() {
  return <SectorIndex lang="ar" />;
}
