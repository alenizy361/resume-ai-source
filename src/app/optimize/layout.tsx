import type { Metadata } from "next";
import PageBody from "../components/seo/PageBody";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

export const metadata: Metadata = {
  title: "ATS Resume Checker — Free Score & Missing Keywords | Sira",
  description: "Paste your resume and a job description for a free ATS match score, the keywords you are missing, and an honest rewrite that invents nothing. Works in Arabic and English.",
  alternates: {
    canonical: `${BASE}/optimize`,
    languages: { en: `${BASE}/optimize`, ar: `${BASE}/ar/optimize`, "x-default": `${BASE}/optimize` },
  },
};

/**
 * The tool is a client component, so the server response for this page carried 65 words — measured,
 * with `ops/seo-audit.mjs`. This is the page meant to rank for "ATS resume checker", and it was
 * arriving at a crawler empty. The section below ships in the first response, with no JavaScript.
 */
export default function OptimizeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <PageBody
        heading="What this ATS checker actually measures"
        intro={[
          "Applicant tracking systems do not read a CV the way a person does. They extract text, look for the terms in the job description, and rank what they find. A CV that reads beautifully and uses none of the employer's own words scores badly — not because it is weak, but because it is invisible to the filter that runs first.",
          "This tool compares your CV against a specific job advert and reports three things: how much of the advert's vocabulary your CV already contains, which terms are missing, and where the wording is vague enough to be skipped. Everything it suggests comes from what you wrote — it never adds an employer, a date, a certification or a number you did not give it.",
        ]}
        stepsHeading="How to use it"
        steps={[
          { title: "Paste the CV", body: "Any format, Arabic or English. A PDF or Word file works too; the text is extracted in your browser." },
          { title: "Paste the job advert", body: "This is what turns a general score into a real one. Without an advert the tool scores structure and clarity only." },
          { title: "Read the missing keywords", body: "Add the ones you can honestly claim. Skip the rest — a keyword you cannot defend in an interview costs more than it earns." },
          { title: "Rewrite, then check the difference", body: "The rewrite keeps your facts and changes only the wording. The before-and-after view shows exactly what moved." },
        ]}
        faqHeading="Questions people actually ask"
        faq={[
          {
            q: "Is a high ATS score enough to get an interview?",
            a: "No. The score decides whether a human ever opens the file. Everything after that is the content itself — which is why the rewrite here focuses on clarity and evidence rather than on stuffing keywords.",
          },
          {
            q: "Can I use an Arabic CV in Saudi Arabia?",
            a: "Yes, and for many public-sector and local roles it is expected. For multinationals and most technical roles the advert itself tells you: apply in the language it is written in, and keep one document in one language rather than half in each.",
          },
          {
            q: "Does it invent achievements or numbers?",
            a: "It cannot. Suggestions that contain a figure you did not provide are dropped before they reach you, and an improvement to a line you wrote is rejected if it acquires a number the original did not have.",
          },
          {
            q: "How long should a CV be?",
            a: "One page for under five years of experience, two beyond that. A third page is almost always a sign that responsibilities are being listed rather than results.",
          },
          {
            q: "Is my CV stored anywhere?",
            a: "The draft stays in your browser. Nothing is uploaded to a server for storage, and nothing is kept after the scan except what you choose to save on this device.",
          },
        ]}
        relatedHeading="Related"
        related={[
          { href: "/builder", label: "Build a CV from scratch" },
          { href: "/resume-examples", label: "Resume examples by job" },
          { href: "/templates", label: "ATS-safe templates" },
          { href: "/ats-resume-checker", label: "How ATS filtering works" },
          { href: "/ar/optimize", label: "افحص سيرتك بالعربية" },
        ]}
      />
    </>
  );
}
