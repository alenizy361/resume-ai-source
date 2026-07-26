import type { Metadata } from "next";
import BuilderStart from "@/app/components/build/BuilderStart";
import PageBody from "@/app/components/seo/PageBody";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

export const metadata: Metadata = {
  title: "AI Resume Builder — Step by Step, ATS-Ready | Sira",
  description:
    "Eleven short steps to an ATS-ready CV. AI suggests the skills for your profession; you approve every line. Free, Arabic and English.",
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

/**
 * The builder's front door is also the page that has to rank for "AI resume builder".
 *
 * It shipped 112 words to a crawler — measured with `ops/seo-audit.mjs` — because everything on it
 * is a client component that appears after JavaScript. That is fine for the person using it and
 * fatal for the page: the highest-intent query this product has, answered with an empty body.
 *
 * The tool stays exactly where it is. The section under it is server-rendered, arrives in the first
 * response, and says what the thing actually does — which is also what a first-time visitor who
 * has not yet pressed anything needs to read.
 */
export default function BuilderStartPage() {
  return (
    <>
      <BuilderStart lang="en" />
      <PageBody
        heading="What this builder does, and what it refuses to do"
        intro={[
          "Eleven short steps, one screen each: the job you are aiming for, how employers reach you, your experience, education, credentials, skills, languages, a summary, a review, and the design you download. Your CV renders beside the form and updates as you type.",
          "The AI suggests — it does not write your CV. It proposes skills and responsibilities for your profession, and every one of them is a chip you tap or ignore. Nothing enters the document until you approve it, and nothing it proposes can contain an employer, a date, a certification or a number you did not give it. That is enforced in the data model, not by asking the model nicely.",
        ]}
        stepsHeading="How it works"
        steps={[
          { title: "Name the job", body: "The title and the market. Everything after this is steered by those two — the skills offered to a radiographer in Riyadh are not the ones offered to an accountant in Dubai." },
          { title: "Fill in the facts", body: "Employer, dates, what you did. Short and plain is fine; the wording is the part you get help with." },
          { title: "Approve the suggestions", body: "Skills and responsibilities arrive as chips. Add the true ones, decline the rest — a declined suggestion does not come back reworded." },
          { title: "Read the review", body: "Missing dates, empty sections, duplicated responsibilities, a summary that no longer matches the CV under it. Errors and recommendations are shown apart, because they are not the same thing." },
          { title: "Download", body: "PDF and Word, both ATS-parseable, plus a designed page for a human reader. Arabic CVs get Word and the designed PDF, because a text PDF cannot shape Arabic correctly." },
        ]}
        faqHeading="Questions people actually ask"
        faq={[
          {
            q: "Is it free?",
            a: "Building and downloading a CV is free and needs no account. Paid features are the extras around it — cover letters, the interview prep, removing the small footer mark.",
          },
          {
            q: "Can I build my CV in Arabic?",
            a: "Yes, start to finish: the questions, the suggestions, the review and the document itself. You can also produce an English version of the same facts afterwards, translated and checked rather than re-typed.",
          },
          {
            q: "Will it invent experience to fill the page?",
            a: "No. A suggestion carrying a figure you did not provide is dropped before you see it, and an improvement to a line you wrote is rejected if it gains a number the original did not have.",
          },
          {
            q: "What makes a CV 'ATS-ready'?",
            a: "One column, standard section headings, real text rather than an image, dates a parser can read, and the employer's own vocabulary where it honestly applies. Every template here is built that way; the review checks the rest.",
          },
          {
            q: "Where is my CV stored?",
            a: "In this browser. It is not uploaded for storage, and it survives a refresh or a closed tab on the same device.",
          },
        ]}
        relatedHeading="Related"
        related={[
          { href: "/optimize", label: "Check an existing CV against a job" },
          { href: "/resume-examples", label: "Resume examples by job" },
          { href: "/templates", label: "ATS-safe templates" },
          { href: "/cover-letter-examples", label: "Cover letter examples" },
          { href: "/ar/builder", label: "ابنِ سيرتك بالعربية" },
        ]}
      />
    </>
  );
}
