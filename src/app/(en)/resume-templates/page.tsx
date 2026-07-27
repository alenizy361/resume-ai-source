import type { Metadata } from "next";
import HubLinks from "@/app/components/HubLinks";
import PageShell from "@/app/components/PageShell";
import Link from "next/link";
import { TEMPLATES } from "@/app/lib/templates";
import TemplatePreview from "@/app/components/TemplatePreview";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

export const metadata: Metadata = {
  title: "Free Resume Templates (2026) — ATS-Friendly, Fill & Download",
  description: "8 free, ATS-friendly resume templates: ATS, modern, minimal, professional, executive, creative, simple, and two-column. Fill one in and download in minutes.",
  keywords: "free resume templates, ATS resume template, modern resume template, professional resume template, cv templates free",
  alternates: { canonical: `${BASE}/resume-templates` },
};

export default function Hub() {
  return (
    <PageShell lang="en" cta={{ href: "/builder", label: "Build my resume" }} width="wide">
      <section className="t-enter relative pb-16 text-center">
        <div className="relative z-10 mx-auto max-w-3xl">
          <div className="chip mb-4">Free · ATS-friendly</div>
          <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">Free resume templates</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg" style={{ color: "var(--muted)" }}>
            Pick a style, fill it in with our AI builder, and download a print-ready resume — free. Every template is tuned to pass applicant tracking systems.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl pb-16">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.map((t) => (
            <Link key={t.slug} href={`/resume-templates/${t.slug}`} className="group">
              <div className="transition-transform group-hover:-translate-y-1">
                <TemplatePreview t={t} />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="font-bold">{t.name}</div>
                <div className="font-mono text-xs" style={{ color: t.atsScore >= 90 ? "var(--accent)" : "#fbbf24" }}>ATS {t.atsScore}</div>
              </div>
              <div className="text-xs" style={{ color: "var(--faint)" }}>{t.keyword}</div>
            </Link>
          ))}
        </div>
      </div>

      <HubLinks current="/resume-templates" />
    </PageShell>
  );
}
