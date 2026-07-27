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
  title: "AI Career Assistant for Saudi Arabia — CV, ATS Match, Interview Prep | Sira",
  description:
    "Get hired faster with an AI career assistant built for Saudi Arabia and the Gulf. Build a CV, match it to a real job, check ATS compatibility, prepare for interviews, and track applications. Free, Arabic and English.",
  alternates: {
    canonical: `${BASE}/`,
    languages: { en: `${BASE}/`, ar: `${BASE}/ar`, "x-default": `${BASE}/` },
  },
  openGraph: {
    title: "Get hired faster with an AI career assistant built for Saudi Arabia",
    description:
      "Build a strong CV, match it to a real job, check ATS compatibility, prepare for interviews and track your applications — in one place. Nothing reaches your CV until you approve it.",
    url: `${BASE}/`,
    type: "website",
  },
};

export default function Home() {
  return <Landing lang="en" />;
}
