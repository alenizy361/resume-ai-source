import type { Metadata } from "next";
import DoorRedirect from "./components/DoorRedirect";
import Builder from "./components/build/Builder";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

/*
 * The homepage is the form-first builder.
 *
 * It was the conversation, and three live end-to-end builds showed why that could not
 * stay the only way in: a chat is a single path, so every model slip is a dead end with
 * no field to correct. The chat still exists at /journey and is one tap away from here.
 *
 * Reverting is this file and app/ar/page.tsx — render <Journey lang="en" /> again and the
 * previous homepage is back, because nothing was deleted to make room for this.
 */
export const metadata: Metadata = {
  title: "Build an ATS-Ready CV — You Fill the Facts, AI Writes It | cv.rabit.sa",
  description:
    "A step-by-step CV builder for the Saudi and Gulf market. AI suggests the skills and responsibilities for your profession; you approve every line. It never invents an employer, a date, a certification or a number. Free, no signup, Arabic and English.",
  alternates: {
    canonical: `${BASE}/`,
    languages: { en: `${BASE}/`, ar: `${BASE}/ar`, "x-default": `${BASE}/` },
  },
  openGraph: {
    title: "You fill the facts. AI completes the professional wording.",
    description:
      "Step-by-step ATS-ready CV builder. Suggested skills and duties for your profession, grouped and editable — nothing reaches your CV until you approve it.",
    url: `${BASE}/`,
    type: "website",
  },
};

export default function Home() {
  return (
    <>
      <Builder lang="en" />
      {/* Honours a visitor who explicitly chose the chat door before. */}
      <DoorRedirect lang="en" rendered="form" />
    </>
  );
}
