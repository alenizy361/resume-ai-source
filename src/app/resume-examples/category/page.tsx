import type { Metadata } from "next";
import { SectorIndex } from "@/app/components/seo/SectorPage";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

/**
 * The parent of the sector pages.
 *
 * It exists for two reasons, one of them structural. Without it `/resume-examples/category` has no
 * page while `/resume-examples/category/technology` does, which is a hole in the tree that a
 * crawler reads as a broken hierarchy and a visitor reaches by deleting the last path segment. And
 * `/resume-examples/[job]` sits at the same depth: leaving the bare `category` path unhandled makes
 * routing depend on how Next resolves a static segment with no page against a dynamic sibling,
 * which is not a thing to rely on.
 */
export const metadata: Metadata = {
  title: "Resume Examples by Sector — ATS Keywords by Industry",
  description: "Browse resume examples by sector: the professions in each, the ATS keywords that recur across them, and the certifications more than one role asks for.",
  alternates: {
    canonical: `${BASE}/resume-examples/category`,
    languages: {
      en: `${BASE}/resume-examples/category`,
      ar: `${BASE}/ar/resume-examples/category`,
      "x-default": `${BASE}/resume-examples/category`,
    },
  },
};

export default function Page() {
  return <SectorIndex lang="en" />;
}
