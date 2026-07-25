import type { Metadata } from "next";
import Journey from "../components/Journey";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

/**
 * The chat door, at its own address.
 *
 * `/` used to render this same component. Now that the homepage is the form builder,
 * this is where the conversation lives — reachable in one tap from the builder's header,
 * and sticky for anyone who picks it, so choosing the chat once is a choice that holds.
 *
 * `robots: noindex` because the marketing weight belongs on one page and that page is
 * now the form builder at `/`. The chat is a door, not a landing page — but it is its
 * own content, so it canonicalises to itself rather than pointing at a homepage that no
 * longer shows a conversation.
 */
export const metadata: Metadata = {
  title: "Build Your Resume by Interview | cv.rabit.sa",
  description:
    "Talk to the AI Advisor for two minutes: it interviews you, rephrases your casual words into professional ATS-ready lines, and hands you a downloadable resume.",
  alternates: {
    canonical: `${BASE}/journey`,
    languages: { en: `${BASE}/journey`, ar: `${BASE}/ar/journey`, "x-default": `${BASE}/` },
  },
  robots: { index: false, follow: true },
};

export default function JourneyPage() {
  return <Journey lang="en" />;
}
