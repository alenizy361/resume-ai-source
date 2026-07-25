import type { Metadata } from "next";
import Journey from "../components/Journey";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

/**
 * The chat door, at its own address.
 *
 * `/` still renders this same component, so nothing about the live homepage moves.
 * What this route adds is a stable URL for the conversation — the form builder links
 * to it as "talk to the AI instead", and that link was pointing at a 404.
 *
 * `robots: noindex` because this is the same content as `/`. An application door
 * deserves an address, not a second entry in the index competing with the homepage
 * it duplicates.
 */
export const metadata: Metadata = {
  title: "Build Your Resume by Interview | cv.rabit.sa",
  description:
    "Talk to the AI Advisor for two minutes: it interviews you, rephrases your casual words into professional ATS-ready lines, and hands you a downloadable resume.",
  alternates: {
    canonical: `${BASE}/`,
    languages: { en: `${BASE}/journey`, ar: `${BASE}/ar/journey`, "x-default": `${BASE}/` },
  },
  robots: { index: false, follow: true },
};

export default function JourneyPage() {
  return <Journey lang="en" />;
}
