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
  if (!j) return {};
  const hasAr = Boolean(getJobAr(job));
  return {
    /* The year and the keyword phrase are appended only when the job name leaves room — see
       `fitTitle`. "Customer Service Representative" made this template 68 characters. */
    title: fitTitle(`${j.title} Resume Example`, " & ATS Keywords", " (2026)"),
    /* Kept under 155 characters: the job title is interpolated, and the longest of them —
       "Customer Service Representative" — added 31 characters to every one of these. */
    description: `A free ${j.title} resume example with the ATS keywords and skills recruiters scan for.`,
    keywords: `${j.title} resume example, resume for ${j.title}, ${j.title} resume skills, resume keywords for ${j.title}, ${j.title} CV example`,
    /*
     * Reciprocal alternates, and only when the Arabic page for THIS job exists.
     *
     * The Arabic pages have declared their English twin since they were written; the English side
     * never declared back, so Google was discarding the pair — an hreflang that is not returned is
     * ignored, and the two pages then compete for the same intent instead of serving two languages.
     * Guarded on `getJobAr`, because the two catalogues do not cover the same jobs and pointing at
     * an Arabic page that does not exist would be worse than pointing at nothing.
     */
    alternates: hasAr
      ? {
        canonical: `${BASE}/resume-examples/${j.slug}`,
        languages: {
          en: `${BASE}/resume-examples/${j.slug}`,
          ar: `${BASE}/ar/resume-examples/${j.slug}`,
          "x-default": `${BASE}/resume-examples/${j.slug}`,
        },
      }
      : { canonical: `${BASE}/resume-examples/${j.slug}` },
    openGraph: { title: `${j.title} Resume Example & Skills (2026)`, description: `The ATS keywords, skills, and a full example for a ${j.title} resume.`, type: "article" },
  };
}

/** Hoisted: see the Arabic twin. A component declared in a render remounts its subtree. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="t-enter mt-10">
      <h2 className="mb-4 text-2xl font-bold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

export default async function Page({ params }: { params: Promise<{ job: string }> }) {
  const { job } = await params;
  const j = getJob(job);
  if (!j) notFound();

  const siblings = JOBS.filter((x) => x.category === j.category && x.slug !== j.slug).slice(0, 6);
  const others = JOBS.filter((x) => x.category !== j.category).slice(0, 4);
  const hasAr = Boolean(getJobAr(job));

  const faqs = [
    { q: `What skills should a ${j.title} put on a resume?`, a: `The most important ${j.title} resume skills are: ${j.skills.slice(0, 6).join(", ")}. Match these to the exact wording in the job posting so the ATS scores your resume higher.` },
    { q: `What ATS keywords do ${j.title} resumes need?`, a: `Applicant tracking systems scan ${j.title} resumes for terms like ${j.atsKeywords.slice(0, 6).join(", ")}. Include the ones you genuinely have, using the exact phrasing from the job description.` },
    { q: `How long should a ${j.title} resume be?`, a: `One page for under 10 years of experience, two pages maximum for senior ${j.title} roles. Keep it single-column and ATS-safe — no tables or graphics.` },
    { q: `How do I make my ${j.title} resume pass the ATS?`, a: `Use standard headings, mirror the job title, include the ${j.title} keywords above, and quantify your bullets. Or paste it into our free scanner to see your match score instantly.` },
  ];

  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: BASE },
        { "@type": "ListItem", position: 2, name: "Resume Examples", item: `${BASE}/resume-examples` },
        { "@type": "ListItem", position: 3, name: j.title, item: `${BASE}/resume-examples/${j.slug}` },
      ]},
      { "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    ],
  };

  return (
    <PageShell lang="en" cta={navCta("en")} langToggle={hasAr ? `/ar/resume-examples/${j.slug}` : undefined}>
      <article className="mx-auto max-w-3xl py-10">
        {/* Breadcrumb */}
        <div className="mb-6 font-mono text-xs" style={{ color: "var(--faint)" }}>
          <Link href="/" style={{ color: "var(--faint)" }}>Home</Link> ›{" "}
          <Link href="/resume-examples" style={{ color: "var(--faint)" }}>Resume Examples</Link> › {j.title}
        </div>

        <div className="chip mb-4">{j.category} · ATS-optimized</div>
        <h1 className="text-4xl font-extrabold leading-tight tracking-tight">{j.title} Resume Example &amp; ATS Keywords (2026)</h1>
        <p className="mt-4 text-lg leading-relaxed" style={{ color: "var(--muted)" }}>
          {j.demand} Typical salary: {j.salary}. Below is a complete {j.title} resume example plus the exact keywords applicant tracking systems (ATS) scan for — then build yours free in 60 seconds.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/optimize" className="btn-accent px-6 py-3">Check my {j.title} resume free →</Link>
          <Link href="/builder" className="btn-ghost px-6 py-3 font-semibold" style={{ color: "var(--fg)" }}>Build my resume</Link>
        </div>
        {/*
          A footnote, not a parenthesis inside the lede.

          Set inline at reduced contrast, this three-line qualifier occupied lines 2–4 of a
          five-line opening paragraph and the actual sentence resumed mid-line after it — the
          lede was cut in half by its own disclaimer. It still sits with the figure it qualifies
          (`ops/brand.test.mjs` requires the two on the same page, and rightly), just where a
          qualifier belongs: after the content, in caption type.
        */}
        <p className="mt-4 text-xs leading-relaxed" style={{ color: "var(--faint)" }}>
          Salary: {salaryBasis("en")}
        </p>

        <Section title={`Professional summary example for a ${j.title}`}>
          <div className="card p-5 font-mono text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{j.summary}</div>
        </Section>

        <Section title={`ATS keywords for a ${j.title} resume`}>
          <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>These are the exact terms an ATS scans for. Include the ones you genuinely have, worded like the job posting:</p>
          <div className="flex flex-wrap gap-2">
            {j.atsKeywords.map((k) => (
              <span key={k} className="rounded-full px-3 py-1 text-xs font-medium" style={{ background: "rgba(139,92,246,0.14)", color: "var(--accent-deep)" }}>{k}</span>
            ))}
          </div>
        </Section>

        <Section title={`Top skills for a ${j.title}`}>
          <ul className="grid gap-2 sm:grid-cols-2">
            {j.skills.map((s) => (
              <li key={s} className="flex items-center gap-2 text-sm" style={{ color: "var(--muted)" }}><span className="text-accent">✓</span> {s}</li>
            ))}
          </ul>
        </Section>

        <Section title={`Work experience bullet examples`}>
          <ul className="space-y-3">
            {j.bullets.map((b) => (
              <li key={b} className="card p-4 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>• {b}</li>
            ))}
          </ul>
        </Section>

        <Section title={`Certifications that strengthen a ${j.title} resume`}>
          <div className="flex flex-wrap gap-2">
            {j.certs.map((c) => (
              <span key={c} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--muted)" }}>{c}</span>
            ))}
          </div>
        </Section>

        <Section title={`Common ${j.title} resume mistake`}>
          <div className="card p-5 text-sm leading-relaxed" style={{ borderColor: "rgba(248,113,113,0.3)", color: "var(--muted)" }}>
            <span style={{ color: "var(--danger)" }}>Avoid this:</span> {j.mistake}
          </div>
        </Section>

        {/* CTA */}
        {/* The third job of BrandOrb: decoration. `relative` on the card and
            `variant="decor"` on the orb, which is absolutely positioned, dimmed, behind the
            content and transparent to the pointer — so the button in this card cannot be
            swallowed by the decoration behind it. Asserted in ops/design.test.mjs. */}
        <div className="card relative mt-10 overflow-hidden p-7 text-center" style={{ borderColor: "rgba(139,92,246,0.4)", background: "rgba(139,92,246,0.05)" }}>
          <BrandOrb variant="decor" size={140} style={{ top: -40, insetInlineEnd: -30 }} />
          <h2 className="text-2xl font-bold">Is your {j.title} resume ATS-ready?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: "var(--muted)" }}>Paste it and get an instant match score plus the missing keywords — free, no sign-up.</p>
          <Link href="/optimize" className="btn-accent mt-5 inline-block px-8 py-3">Scan my resume free →</Link>
        </div>

        <Section title="FAQ">
          <div className="space-y-4">
            {faqs.map((f) => (
              <div key={f.q} className="card p-5">
                <h3 className="font-bold">{f.q}</h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{f.a}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Cross-links to this job's cover-letter + skills pages */}
        <Section title="For this role">
          <div className="flex flex-wrap gap-3">
            <Link href={`/cover-letter-examples/${j.slug}`} className="btn-ghost px-4 py-2 text-sm font-semibold" style={{ color: "var(--fg)" }}>{j.title} cover letter example →</Link>
            <Link href={`/resume-skills/${j.slug}`} className="btn-ghost px-4 py-2 text-sm font-semibold" style={{ color: "var(--fg)" }}>{j.title} skills &amp; ATS keywords →</Link>
          </div>
        </Section>

        {/* Internal linking — siblings + others */}
        <Section title={`More ${j.category} resume examples`}>
          <div className="flex flex-wrap gap-2">
            {siblings.map((s) => (
              <Link key={s.slug} href={`/resume-examples/${s.slug}`} className="rounded-lg px-3 py-1.5 text-sm" style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--muted)" }}>{s.title}</Link>
            ))}
            {others.map((s) => (
              <Link key={s.slug} href={`/resume-examples/${s.slug}`} className="rounded-lg px-3 py-1.5 text-sm" style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--muted)" }}>{s.title}</Link>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-4">
            <SectorLink category={j.category} lang="en" className="text-sm font-semibold text-accent" />
            <Link href="/resume-examples" className="text-sm font-semibold text-accent">See all resume examples →</Link>
          </div>
        </Section>
      </article>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
    </PageShell>
  );
}
