import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SectorPage } from "@/app/components/seo/SectorPage";
import { copyFor, getSector, hasBoth, sectorSlugs } from "@/app/lib/sectors.ts";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

export function generateStaticParams() {
  return sectorSlugs("ar").map((sector) => ({ sector }));
}

export async function generateMetadata({ params }: { params: Promise<{ sector: string }> }): Promise<Metadata> {
  const { sector } = await params;
  const s = getSector(sector, "ar");
  const copy = s && copyFor(s, "ar");
  if (!copy) return {};
  const url = `${BASE}/ar/resume-examples/category/${sector}`;
  return {
    title: copy.title,
    description: copy.description,
    /* Reciprocal, and only for the sectors both catalogues publish. See the English twin. */
    alternates: hasBoth(sector)
      ? {
        canonical: url,
        languages: {
          ar: url,
          en: `${BASE}/resume-examples/category/${sector}`,
          "x-default": `${BASE}/resume-examples/category/${sector}`,
        },
      }
      : { canonical: url },
    openGraph: { title: copy.h1, description: copy.description, type: "website", locale: "ar_SA" },
  };
}

export default async function Page({ params }: { params: Promise<{ sector: string }> }) {
  const { sector } = await params;
  const s = getSector(sector, "ar");
  if (!s) notFound();
  return <SectorPage sector={s} lang="ar" />;
}
