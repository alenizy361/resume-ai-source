import type { Metadata } from "next";
import { copyright } from "@/app/lib/brand";
import HubLinks from "../components/HubLinks";
import OrbBrand from "../components/OrbBrand";
import OrbSceneSetter from "../components/orb/OrbSceneSetter";
import Link from "next/link";
import { JOBS, CATEGORIES } from "../lib/jobs";
import { copyFor, sectorForCategory, sectorsFor } from "../lib/sectors.ts";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

export const metadata: Metadata = {
  title: "Resume Examples & ATS Keywords by Job Title (2026) — Free",
  description: "Free resume examples for 50+ job titles, each with the exact ATS keywords, skills, and bullet examples recruiters scan for. Build or optimize yours in 60 seconds.",
  keywords: "resume examples, resume example by job, ATS resume examples, resume samples, cv examples",
  /*
   * The Arabic twin declares this page as its `en` alternate. Without the reciprocal declaration
   * here, Google discards BOTH — an hreflang that is not returned is not a signal, it is noise,
   * and the two pages then compete with each other for the same intent in two languages.
   */
  alternates: {
    canonical: `${BASE}/resume-examples`,
    languages: {
      en: `${BASE}/resume-examples`,
      ar: `${BASE}/ar/resume-examples`,
      "x-default": `${BASE}/resume-examples`,
    },
  },
};

export default function Hub() {
  return (
    <main className="min-h-screen" style={{ background: "var(--bg)", color: "var(--fg)" }}>
      <OrbSceneSetter visible mood="idle" top="14vh" left="86%" size={100} />
      <nav className="sticky top-0 z-50" style={{ background: "linear-gradient(180deg, rgba(5,7,13,0.85), transparent)" }}>
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <OrbBrand size={26} />
            <span className="text-[15px] font-bold tracking-tight">Sira</span>
          </Link>
          <Link href="/optimize" className="btn-accent px-4 py-2 text-sm">Scan my resume</Link>
        </div>
      </nav>

      <section className="relative overflow-hidden px-6 py-16 text-center">
        <div className="hero-ambient"><div className="grid-lines" /></div>
        <div className="relative z-10 mx-auto max-w-3xl">
          <div className="chip mb-4">Free · ATS-optimized</div>
          <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">Resume examples &amp; ATS keywords by job</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg" style={{ color: "var(--muted)" }}>
            Pick your role for a complete resume example plus the exact keywords applicant tracking systems scan for — then build or check yours free.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-6 pb-16">
        {/*
          Browse by sector, above the profession list rather than below it. A visitor who knows the
          industry but not the job title had nowhere to go before this; a crawler had no signal that
          the professions under one heading belonged together beyond the heading itself.
        */}
        <section className="mb-12">
          <h2 className="mb-3 text-xl font-bold tracking-tight">Browse by sector</h2>
          <div className="flex flex-wrap gap-2">
            {sectorsFor("en").map((s) => (
              <Link key={s.slug} href={`/resume-examples/category/${s.slug}`}
                className="rounded-lg px-3.5 py-2 text-sm font-semibold"
                style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--muted)" }}>
                {copyFor(s, "en")!.name}
              </Link>
            ))}
            <Link href="/resume-examples/category" className="rounded-lg px-3.5 py-2 text-sm font-semibold text-accent"
              style={{ border: "1px solid var(--line)" }}>All sectors →</Link>
          </div>
        </section>

        {CATEGORIES.map((cat) => {
          const sector = sectorForCategory(cat, "en");
          return (
          <div key={cat} className="mb-10">
            <h2 className="mb-4 text-xl font-bold tracking-tight">
              {sector
                ? <Link href={`/resume-examples/category/${sector.slug}`} style={{ color: "var(--fg)" }}>{cat}</Link>
                : cat}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {JOBS.filter((j) => j.category === cat).map((j) => (
                <Link key={j.slug} href={`/resume-examples/${j.slug}`} className="card card-hover p-4">
                  <div className="font-bold">{j.title} Resume Example</div>
                  <div className="mt-1 text-xs" style={{ color: "var(--faint)" }}>ATS keywords · skills · bullet examples</div>
                </Link>
              ))}
            </div>
          </div>
          );
        })}
      </div>

      <footer className="px-6 py-10" style={{ borderTop: "1px solid var(--line)" }}>
        <p className="text-center font-mono text-xs" style={{ color: "var(--faint)" }}>{copyright("en")}</p>
      </footer>
          <HubLinks current="/resume-examples" />
    </main>
  );
}
