import type { Metadata } from "next";
import Landing from "@/app/components/marketing/Landing";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

/*
 * The homepage explains the product. It does not BE the product.
 *
 * It was the builder itself — twelve sections in one scrolling page, eleven of them dimmed
 * to 38% with empty bodies until you reached them. Two things were wrong with that at once:
 * a visitor who has not yet decided to spend ten minutes was shown a form, and a visitor
 * who had decided was shown all ten steps stacked on top of each other.
 *
 * Reverting is this file and app/ar/page.tsx: render <Builder lang="en" /> again and the
 * previous homepage is back, because nothing was deleted to make room. The long page still
 * used to answer at /build and /ar/build; those addresses now redirect to the step builder.
 */
export const metadata: Metadata = {
  title: "AI CV Builder — Arabic & English, ATS-Ready | Sira",
  description:
    "A step-by-step CV builder for Saudi Arabia and the Gulf. AI suggests the skills for your profession; you approve every line. Free, Arabic and English.",
  alternates: {
    canonical: `${BASE}/`,
    languages: { en: `${BASE}/`, ar: `${BASE}/ar`, "x-default": `${BASE}/` },
  },
  openGraph: {
    title: "You provide the facts. AI writes the professional CV.",
    description:
      "Eleven short steps, with your CV building itself beside you. Suggested skills and duties for your profession — nothing reaches the document until you approve it.",
    url: `${BASE}/`,
    type: "website",
  },
};

export default function Home() {
  return <Landing lang="en" />;
}
