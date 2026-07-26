import type { Metadata } from "next";
import { copyright } from "@/app/lib/brand";
import HubLinks from "../components/HubLinks";
import BrandOrb from "../components/BrandOrb";
import Link from "next/link";
import { JOBS, CATEGORIES } from "../lib/jobs";

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
    <main className="min-h-dvh" style={{ background: "var(--bg)", color: "var(--fg)" }}>
      <nav className="ps-header">
        <div className="ps-header-in">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandOrb size={26} />
            <span className="text-[15px] font-bold tracking-tight">Sira</span>
          </Link>
          <Link href="/optimize" className="btn-accent px-4 py-2 text-sm">Scan my resume</Link>
        </div>
      </nav>

      <div className="mx-auto max-w-5xl px-6 py-14">
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

      <footer className="px-6 py-10" style={{ borderTop: "1px solid var(--line)" }}>
        <p className="text-center font-mono text-xs" style={{ color: "var(--faint)" }}>{copyright("en")}</p>
      </footer>
          <HubLinks current="/resume-skills" />
    </main>
  );
}
