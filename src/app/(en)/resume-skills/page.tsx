import type { Metadata } from "next";
import { navCta } from "@/app/lib/brand";
import HubLinks from "@/app/components/HubLinks";
import PageShell from "@/app/components/PageShell";
import Link from "next/link";
import { JOBS, CATEGORIES } from "@/app/lib/jobs";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

export const metadata: Metadata = {
  title: "Resume Skills by Job (2026) — ATS Keywords for 50 Roles | Sira",
  description: "The exact skills and ATS keywords to put on your resume, role by role — plus a free scanner that shows which ones your resume is missing.",
  /* Reciprocal now that the Arabic hub exists. Declared one way it is discarded, and the
     two languages compete for one intent instead of serving two audiences. */
  alternates: {
    canonical: `${BASE}/resume-skills`,
    languages: {
      en: `${BASE}/resume-skills`,
      ar: `${BASE}/ar/resume-skills`,
      "x-default": `${BASE}/resume-skills`,
    },
  },
};

export default function ResumeSkillsHub() {
  return (
    <PageShell lang="en" cta={navCta("en")} langToggle="/ar/resume-skills" width="wide">
      <div className="mx-auto max-w-5xl py-14">
        <div className="text-center">
          <div className="chip mb-4">Resume skills</div>
          <h1 className="text-4xl font-extrabold tracking-tight">The right skills <span className="accent-underline text-accent">for every resume</span></h1>
          <p className="mx-auto mt-4 max-w-2xl" style={{ color: "var(--muted)" }}>
            Role-by-role: the ATS keywords hiring systems scan for, the skills recruiters shortlist on, and how to present them honestly.
          </p>
        </div>

        {CATEGORIES.map((cat) => (
          <section key={cat} className="mt-12">
            <h2 className="mb-4 text-xl font-bold">{cat}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {JOBS.filter((j) => j.category === cat).map((j) => (
                <Link key={j.slug} href={`/resume-skills/${j.slug}`} className="card card-hover p-4 text-sm font-semibold">
                  {j.title} skills →
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>

      <HubLinks current="/resume-skills" />
    </PageShell>
  );
}
