import type { Metadata } from "next";
import Builder from "../components/build/Builder";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

// This route was already advertised in sitemap.ts and linked from app/ar/builder
// before it existed, so shipping it here closes a live 404 as well as adding the
// form-first builder.
export const metadata: Metadata = {
  title: "Build an ATS-Ready CV, Step by Step | cv.rabit.sa",
  description:
    "Fill in the facts; the AI writes the professional wording. Suggested skills and responsibilities for your profession, grouped and editable — nothing enters your CV until you approve it. Free, no signup.",
  /*
    * The long single-page builder, kept.
    *
    * `/` is the marketing page now and `/builder` is the guided journey, so this address
    * is neither — it is the same twelve sections in one scroll, which some people prefer
    * and which is the rollback target if the step routes turn out to be worse. It points
    * its ranking at `/builder` rather than competing with it.
    */
  alternates: {
    canonical: `${BASE}/builder`,
    languages: { en: `${BASE}/builder`, ar: `${BASE}/ar/builder`, "x-default": `${BASE}/builder` },
  },
  robots: { index: false, follow: true },
  openGraph: {
    title: "Build an ATS-Ready CV, Step by Step",
    description:
      "You fill the facts. AI completes the professional wording — and never invents an employer, a date, a certification or a number.",
    url: `${BASE}/build`,
    type: "website",
  },
};

export default function BuildPage() {
  return <Builder lang="en" />;
}
