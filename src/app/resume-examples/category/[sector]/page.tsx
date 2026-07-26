import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SectorPage } from "@/app/components/seo/SectorPage";
import { copyFor, getSector, hasBoth, sectorSlugs } from "@/app/lib/sectors.ts";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

export function generateStaticParams() {
  return sectorSlugs("en").map((sector) => ({ sector }));
}

export async function generateMetadata({ params }: { params: Promise<{ sector: string }> }): Promise<Metadata> {
  const { sector } = await params;
  const s = getSector(sector, "en");
  const copy = s && copyFor(s, "en");
  if (!copy) return {};
  const url = `${BASE}/resume-examples/category/${sector}`;
  return {
    title: copy.title,
    description: copy.description,
    /*
     * hreflang only when the Arabic side publishes this sector too. The two catalogues are not
     * translations of each other — Arabic carries logistics and hospitality at publishable depth
     * and English does not — and a declared alternate pointing at a page that was never generated
     * invalidates the whole cluster rather than just that one pair.
     */
    alternates: hasBoth(sector)
      ? {
        canonical: url,
        languages: {
          en: url,
          ar: `${BASE}/ar/resume-examples/category/${sector}`,
          "x-default": url,
        },
      }
      : { canonical: url },
    openGraph: { title: copy.h1, description: copy.description, type: "website" },
  };
}

export default async function Page({ params }: { params: Promise<{ sector: string }> }) {
  const { sector } = await params;
  const s = getSector(sector, "en");
  /* `getSector` already applies the minimum-professions gate, so a sector that exists in the
     registry but is too thin to publish 404s here rather than rendering a heading and two links. */
  if (!s) notFound();
  return <SectorPage sector={s} lang="en" />;
}
