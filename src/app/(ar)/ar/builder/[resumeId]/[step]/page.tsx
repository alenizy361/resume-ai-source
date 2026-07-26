import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BuilderStep from "@/app/components/build/BuilderStep";
import { SECTION_COPY, stepFromSlug } from "@/app/components/build/steps";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

export async function generateMetadata(
  { params }: { params: Promise<{ resumeId: string; step: string }> },
): Promise<Metadata> {
  const { step } = await params;
  const id = stepFromSlug(step);
  if (!id) return { title: "غير موجود" };
  return {
    title: `${SECTION_COPY.ar.sections[id]} — ابنِ سيرتك | سيرة`,
    description: SECTION_COPY.ar.subs[id],
    // One person's draft. Nothing here for a search engine.
    robots: { index: false, follow: false },
    alternates: { canonical: `${BASE}/ar/builder` },
  };
}

export default async function ArabicStepPage(
  { params }: { params: Promise<{ resumeId: string; step: string }> },
) {
  const { step } = await params;
  const id = stepFromSlug(step);
  if (!id) notFound();
  return <BuilderStep step={id} />;
}
