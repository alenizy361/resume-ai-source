import type { Metadata } from "next";
import FunnelBeacon from "@/app/components/seo/FunnelBeacon";
import PageBody from "@/app/components/seo/PageBody";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

export const metadata: Metadata = {
  title: "Job Description Keyword Extractor — Free ATS Keyword Tool | Sira",
  description: "Paste a job posting and get its hard skills, tools, certifications, and must-have terms — ranked by priority. Free, no CV required, no signup.",
  alternates: {
    canonical: `${BASE}/jd-keyword-extractor`,
    languages: { en: `${BASE}/jd-keyword-extractor`, ar: `${BASE}/ar/jd-keyword-extractor`, "x-default": `${BASE}/jd-keyword-extractor` },
  },
};

export default function JdKeywordExtractorLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <PageBody
        heading="What a job posting is really asking for"
        intro={[
          "A job posting is written for two readers at once: the person deciding whether to apply, and the screening software deciding whether the application ever reaches a human. Most job seekers read only for the first — the responsibilities, the tone, whether the role sounds interesting — and miss the second reading entirely, which is the one an ATS actually performs.",
          "This tool does that second reading for you. It pulls out the specific hard skills, named tools and systems, certifications, and soft skills the posting uses, and flags which of those terms look most central — repeated, in the title, or listed as a hard requirement rather than a nice-to-have. Nothing here is invented: every term comes directly from the text you pasted.",
          "You don't need a resume to use this — it works from the job posting alone, which is the point. Know what the posting is scanning for before you decide how to frame your own experience against it.",
        ]}
        stepsHeading="How to use it"
        steps={[
          { title: "Paste the job posting", body: "The full text — responsibilities, requirements, and qualifications sections all matter, not just the headline skills list." },
          { title: "Add the role title (optional)", body: "Helps the extractor weigh which terms are core to the role versus incidental." },
          { title: "Read the Must-have list first", body: "These are the terms most likely to be scanned and weighted — the ones worth making sure your own CV can honestly claim." },
          { title: "Compare against your CV", body: "Once you know the target list, check how many of these terms your current resume already contains." },
        ]}
        faqHeading="Questions people actually ask"
        faq={[
          {
            q: "Do I need to paste my resume too?",
            a: "No — this tool only reads the job posting. If you want to see how your own CV compares against it, use the ATS resume checker, which takes both.",
          },
          {
            q: "Should I use every keyword this tool finds?",
            a: "Only the ones you can honestly support. A keyword on your CV that you can't speak to in an interview does more harm than leaving it out.",
          },
          {
            q: "What's the difference between 'hard skills' and 'must-have'?",
            a: "Hard skills is the full list of technical terms found in the posting. Must-have is a smaller subset — the terms that look most central to this specific role, based on repetition, placement, and how they're framed.",
          },
          {
            q: "Does it work on Arabic job postings?",
            a: "Yes — paste an Arabic posting and the results come back in Arabic, matching the language of the text you pasted.",
          },
          {
            q: "Is the job posting text stored anywhere?",
            a: "No. It's used once to generate the keyword list and isn't saved.",
          },
        ]}
        relatedHeading="Related"
        related={[
          { href: "/optimize", label: "Check my resume" },
          { href: "/builder", label: "Build my resume" },
          { href: "/career-plan", label: "Plan a move into a new role" },
          { href: "/ar/jd-keyword-extractor", label: "استخرج كلمات الإعلان الوظيفي بالعربية" },
        ]}
      />
      <FunnelBeacon step="toolOpened" />
    </>
  );
}
