import type { Metadata } from "next";
import { fitTitle } from "@/app/lib/seoTitle.ts";
import { salaryBasis, navCta } from "@/app/lib/brand";
import BrandOrb from "@/app/components/BrandOrb";
import Link from "next/link";
import SectorLink from "@/app/components/seo/SectorLink";
import PageShell from "@/app/components/PageShell";
import { notFound } from "next/navigation";
import { JOBS, JOB_SLUGS, getJob } from "@/app/lib/jobs";

import { getJobAr } from "@/app/lib/jobs-ar";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

export function generateStaticParams() {
  return JOB_SLUGS.map((job) => ({ job }));
}

export async function generateMetadata({ params }: { params: Promise<{ job: string }> }): Promise<Metadata> {
  const { job } = await params;
  const j = getJob(job);
  if (!j) return { title: "Not found" };
  const hasAr = Boolean(getJobAr(job));
  return {
    /*
     * The brand suffix is dropped from these templated titles, deliberately.
     *
     * Measured: with "| Sira" appended, 47 of the 60 skills pages ran past 65 characters and were
     * truncated in the result — and what gets cut is the END, which is where the brand was. A
     * suffix that is only ever shown when the title is short enough not to need it is costing the
     * page its most specific words for nothing.
     */
    /* Four of these ran past 65 characters on the longest job names. See `fitTitle`. */
    title: fitTitle(`${j.title} Skills for a Resume`, " — ATS Keywords", " (2026)"),
    description: `The ${j.atsKeywords.length} keywords ATS software scans for in ${j.title} resumes, the skills recruiters shortlist for, and how to present them honestly.`,
    /*
     * Reciprocal alternates — see `cover-letter-examples/[job]` for why a one-way hreflang is
     * worse than none. Guarded on the Arabic catalogue having this job.
     */
    alternates: hasAr
      ? {
        canonical: `${BASE}/resume-skills/${j.slug}`,
        languages: {
          en: `${BASE}/resume-skills/${j.slug}`,
          ar: `${BASE}/ar/resume-skills/${j.slug}`,
          "x-default": `${BASE}/resume-skills/${j.slug}`,
        },
      }
      : { canonical: `${BASE}/resume-skills/${j.slug}` },
  };
}

export default async function ResumeSkillsPage({ params }: { params: Promise<{ job: string }> }) {
  const { job } = await params;
  const j = getJob(job);
  if (!j) notFound();

  const related = JOBS.filter((x) => x.category === j.category && x.slug !== j.slug).slice(0, 4);
  const hasAr = Boolean(getJobAr(job));

  const faqs = [
    { q: `How many skills should a ${j.title} resume list?`, a: `8–14, grouped by category, front-loading what the specific posting asks for. A wall of 30 skills dilutes the signal — ATS ranking favors focused matches.` },
    { q: `Should I list skills I'm still learning?`, a: `Not in the skills section. If a posting requires something you're learning, mention it honestly in context ("currently completing X certification") — never present it as a working skill.` },
    { q: `Do soft skills belong on a ${j.title} resume?`, a: `Show them through achievements instead of listing them. "Coordinated a 4-person team to deliver X" proves teamwork better than the word "teamwork" ever will.` },
    { q: `How do I know which of these keywords a specific job wants?`, a: `Paste the posting into our free scanner — it extracts the exact terms that employer's system looks for and shows which ones your resume is missing.` },
  ];

  return (
    <PageShell lang="en" cta={navCta("en")} langToggle={hasAr ? `/ar/resume-skills/${j.slug}` : undefined}>
      <div className="mx-auto max-w-3xl py-12">
        <nav className="mb-6 font-mono text-xs" style={{ color: "var(--faint)" }}>
          <Link href="/">Home</Link> / <Link href="/resume-skills">Resume Skills</Link> / <span style={{ color: "var(--muted)" }}>{j.title}</span>
        </nav>

        <div className="chip mb-4">{j.category}</div>
        <h1 className="text-4xl font-extrabold leading-tight tracking-tight">
          {j.title} skills <span className="accent-underline text-accent">for your resume</span>
        </h1>
        <p className="mt-4 text-lg leading-relaxed" style={{ color: "var(--muted)" }}>
          {j.demand} Typical range: {j.salary}. Below: the exact terms applicant tracking software scans for in {j.title} resumes, and the skills recruiters actually shortlist on.
        </p>
        {/* Caption type, below the lede — see the resume-examples page for why this stopped being
            a parenthesis in the middle of the opening sentence. */}
        <p className="mt-4 text-xs leading-relaxed" style={{ color: "var(--faint)" }}>
          Salary: {salaryBasis("en")}
        </p>

        {/* ATS keywords */}
        <section className="t-enter mt-10">
          <h2 className="mb-2 text-2xl font-bold">ATS keywords ({j.atsKeywords.length})</h2>
          <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
            These are the terms hiring systems match against {j.title} postings. Include the ones that are genuinely true of you — in your skills section AND woven into experience bullets.
          </p>
          <div className="flex flex-wrap gap-2">
            {j.atsKeywords.map((k) => (
              <span key={k} className="rounded-full px-4 py-1.5 text-sm font-medium" style={{ background: "rgba(139,92,246,0.1)", color: "var(--accent)", border: "1px solid rgba(139,92,246,0.25)" }}>{k}</span>
            ))}
          </div>
        </section>

        {/* Core skills */}
        <section className="t-enter mt-10">
          <h2 className="mb-2 text-2xl font-bold">Core skills recruiters look for</h2>
          <ul className="mt-4 space-y-2">
            {j.skills.map((s) => (
              <li key={s} className="card flex items-center gap-3 px-5 py-3 text-sm">
                <span className="text-accent">✓</span> {s}
              </li>
            ))}
          </ul>
        </section>

        {/* How to present */}
        <section className="t-enter mt-10">
          <h2 className="mb-4 text-2xl font-bold">How to present them (example)</h2>
          <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
            A grouped skills section parses cleanly in ATS software. Then prove your top skills inside experience bullets — like this example of the level to aim for:
          </p>
          <div className="card whitespace-pre-wrap p-6 font-mono text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
            {`SKILLS
${j.atsKeywords.slice(0, 4).join(" · ")}
${j.skills.slice(0, 3).join(" · ")}

EXPERIENCE (example bullet)
• ${j.bullets[0] ?? ""}`}
          </div>
          <p className="mt-3 text-xs" style={{ color: "var(--faint)" }}>
            Illustrative example — your bullets must use your own real numbers. Where you don&apos;t have one, our tool writes [add your real number] instead of inventing it.
          </p>
        </section>

        {/* Certs */}
        {j.certs.length > 0 && (
          <section className="t-enter mt-10">
            <h2 className="mb-3 text-2xl font-bold">Certifications worth listing</h2>
            <div className="flex flex-wrap gap-2">
              {j.certs.map((c) => (
                <span key={c} className="rounded-lg px-4 py-2 text-sm" style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--muted)" }}>{c}</span>
              ))}
            </div>
          </section>
        )}

        {/* Mistake */}
        <section className="t-enter card mt-10 p-6" style={{ borderColor: "rgba(248,113,113,0.3)" }}>
          <h2 className="font-bold" style={{ color: "var(--danger)" }}>⚠ Common {j.title} mistake</h2>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{j.mistake}</p>
        </section>

        {/* CTA */}
        <section className="t-enter card relative mt-10 overflow-hidden p-8 text-center" style={{ borderColor: "rgba(139,92,246,0.4)", background: "rgba(139,92,246,0.05)" }}>
          {/* Decoration only: behind the text, dimmed, and inert to the pointer. */}
          <BrandOrb variant="decor" size={150} style={{ top: -46, insetInlineEnd: -34 }} />
          <h2 className="text-2xl font-bold">Which of these is YOUR resume missing?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: "var(--muted)" }}>
            Paste your resume + a real posting — see your match score and the exact missing keywords, free, in ~10 seconds.
          </p>
          <Link href="/optimize" className="btn-accent mt-5 inline-block px-8 py-3">Check my skills gap free →</Link>
        </section>

        {/* FAQ */}
        <section className="t-enter mt-12">
          <h2 className="mb-6 text-2xl font-bold">Frequently asked questions</h2>
          <div className="space-y-4">
            {faqs.map((f) => (
              <div key={f.q} className="card p-5">
                <h3 className="font-bold">{f.q}</h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Cross-links */}
        <section className="t-enter mt-12">
          <h2 className="mb-4 text-lg font-bold">Keep going</h2>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href={`/resume-examples/${j.slug}`} className="btn-ghost px-4 py-2" style={{ color: "var(--fg)" }}>{j.title} resume example</Link>
            <Link href={`/cover-letter-examples/${j.slug}`} className="btn-ghost px-4 py-2" style={{ color: "var(--fg)" }}>{j.title} cover letter</Link>
            <SectorLink category={j.category} lang="en" className="btn-ghost px-4 py-2 font-semibold" style={{ color: "var(--accent)" }} />
            {related.map((r) => (
              <Link key={r.slug} href={`/resume-skills/${r.slug}`} className="btn-ghost px-4 py-2" style={{ color: "var(--muted)" }}>{r.title} skills</Link>
            ))}
          </div>
        </section>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
          }),
        }}
      />
    </PageShell>
  );
}
