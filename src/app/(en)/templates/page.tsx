import type { Metadata } from "next";
import Link from "next/link";
import HubLinks from "@/app/components/HubLinks";
import PageShell from "@/app/components/PageShell";
import { navCta } from "@/app/lib/brand";
import TemplatesGallery from "@/app/components/TemplatesGallery";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

export const metadata: Metadata = {
  title: "Resume Templates — ATS-Safe, RTL & English | Sira",
  description:
    "ATS-safe CV templates in Arabic (RTL) and English — single column, standard headings, parseable by every tracking system.",
  alternates: {
    canonical: `${BASE}/templates`,
    languages: { en: `${BASE}/templates`, ar: `${BASE}/ar/templates`, "x-default": `${BASE}/templates` },
  },
  openGraph: { title: "Resume Templates — ATS-Safe, Arabic & English", description: "Professional resume templates that pass ATS, in RTL and English.", url: `${BASE}/templates` },
};

export default function TemplatesPage() {
  return (
    <PageShell lang="en" cta={navCta("en")} langToggle="/ar/templates" width="full">
      <section className="t-enter relative mx-auto max-w-6xl py-14">
        <div className="relative mb-10 text-center">
          <div className="chip mb-4">Templates</div>
          <h1 className="text-4xl font-extrabold tracking-tight">Professional resume templates</h1>
          <p className="mx-auto mt-3 max-w-2xl" style={{ color: "var(--muted)" }}>
            Every template is <strong>ATS-safe</strong> and works in both <strong>Arabic (RTL)</strong> and English. Pick a design — then AI fills it with <em>your</em> real experience, never invented facts.
          </p>
        </div>
        <TemplatesGallery />
        <p className="mt-10 text-center text-sm" style={{ color: "var(--faint)" }}>
          Designed PDF is great for recruiters &amp; LinkedIn. For the applicant-tracking upload, use the plain ATS PDF/Word — both are included.
        </p>
        {/* The SEO template-style catalog's ONE in-product inbound link. HubLinks deliberately
            lists a single "Templates" entry (two identical labels read as a mistake), which left
            /resume-templates and its nine style pages reachable from nowhere — sitemap-only. A
            contextual cross-link from the gallery names it differently, so no label collides. */}
        <p className="mt-3 text-center text-sm" style={{ color: "var(--faint)" }}>
          Want the long-form guides?{" "}
          <Link href="/resume-templates" className="underline" style={{ color: "var(--muted)", textUnderlineOffset: 4 }}>
            Resume template styles, explained
          </Link>
        </p>
      </section>
      <HubLinks current="/templates" />
    </PageShell>
  );
}
