import type { Metadata } from "next";
import { copyright } from "@/app/lib/brand";
import HubLinks from "@/app/components/HubLinks";
import BrandOrb from "@/app/components/BrandOrb";
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
    <main className="min-h-dvh" style={{ background: "var(--bg)", color: "var(--fg)" }}>
      <nav className="ps-header">
        <div className="ps-header-in">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandOrb size={26} />
            <span className="text-[15px] font-bold tracking-tight">Sira</span>
          </Link>
          <Link href="/builder" className="btn-accent px-4 py-2 text-sm">Build my resume</Link>
        </div>
      </nav>

      <section className="relative px-6 py-16 text-center">
        <div className="relative z-10 mx-auto max-w-3xl">
          <div className="chip mb-4">Free · ATS-friendly</div>
          <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">Free resume templates</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg" style={{ color: "var(--muted)" }}>
            Pick a style, fill it in with our AI builder, and download a print-ready resume — free. Every template is tuned to pass applicant tracking systems.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-6 pb-16">
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

      <footer className="px-6 py-10" style={{ borderTop: "1px solid var(--line)" }}>
        <p className="text-center font-mono text-xs" style={{ color: "var(--faint)" }}>{copyright("en")}</p>
      </footer>
          <HubLinks current="/resume-templates" />
    </main>
  );
}
