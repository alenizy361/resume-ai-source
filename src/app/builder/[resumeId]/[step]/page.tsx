import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BuilderStep from "../../../components/build/BuilderStep";
import { SECTION_COPY, stepFromSlug } from "../../../components/build/steps";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

/**
 * One step of one resume.
 *
 * The step is validated server-side and a nonsense slug 404s rather than rendering an
 * empty page — `/builder/r1/qualifications` is a plausible guess, and a blank form under
 * a real-looking URL is worse than a not-found.
 *
 * The `resumeId` is deliberately NOT validated here. Whether an id exists is a fact about
 * localStorage, which the server cannot see; `BuilderShell` rewrites a wrong id to the
 * stored one after hydration. Rejecting it here would 404 every valid URL.
 */
export async function generateMetadata(
  { params }: { params: Promise<{ resumeId: string; step: string }> },
): Promise<Metadata> {
  const { step } = await params;
  const id = stepFromSlug(step);
  if (!id) return { title: "Not found" };
  const title = SECTION_COPY.en.sections[id];
  return {
    title: `${title} — Build your CV | cv.rabit.sa`,
    description: SECTION_COPY.en.subs[id],
    // Every step holds one person's draft. There is nothing here for a search engine,
    // and eleven near-identical indexed pages per visitor would dilute /builder.
    robots: { index: false, follow: false },
    alternates: { canonical: `${BASE}/builder` },
  };
}

export default async function StepPage(
  { params }: { params: Promise<{ resumeId: string; step: string }> },
) {
  const { step } = await params;
  const id = stepFromSlug(step);
  if (!id) notFound();
  return <BuilderStep step={id} />;
}
