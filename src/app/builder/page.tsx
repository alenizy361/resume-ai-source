import type { Metadata } from "next";
import BuilderStart from "../components/build/BuilderStart";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

export const metadata: Metadata = {
  title: "Build an ATS-Ready CV, One Step at a Time | cv.rabit.sa",
  description:
    "Eleven short steps: the job you are aiming for, your experience, your credentials, then design and download. AI suggests the skills and responsibilities for your profession — you approve every line. Free, no signup, Arabic and English.",
  alternates: {
    canonical: `${BASE}/builder`,
    languages: { en: `${BASE}/builder`, ar: `${BASE}/ar/builder`, "x-default": `${BASE}/builder` },
  },
  openGraph: {
    title: "Build an ATS-Ready CV, One Step at a Time",
    description:
      "One focused step at a time, with your CV updating beside it. Nothing the AI writes reaches the document until you approve it.",
    url: `${BASE}/builder`,
    type: "website",
  },
};

export default function BuilderStartPage() {
  return <BuilderStart lang="en" />;
}
