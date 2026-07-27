import type { Metadata } from "next";
import { navCta } from "@/app/lib/brand";
import HubLinks from "@/app/components/HubLinks";
import PageShell from "@/app/components/PageShell";
import Link from "next/link";
import { JOBS, CATEGORIES } from "@/app/lib/jobs";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

export const metadata: Metadata = {
  title: "Cover Letter Examples & Templates by Job (2026) | Sira",
  description: "Free cover letter examples and fill-in templates for 50 jobs — the structure, keywords, and mistakes to avoid, plus an AI generator tailored to any posting.",
  /*
   * No `languages` here on purpose: there is no Arabic COVER-LETTER HUB, only Arabic pages for
   * individual jobs. Declaring an alternate to a page that does not exist is worse than declaring
   * none — it sends a crawler to a 404 and invalidates the cluster.
   */
  /* Reciprocal now that the Arabic hub exists. Declared one way it is discarded, and the
     two languages compete for one intent instead of serving two audiences. */
  alternates: {
    canonical: `${BASE}/cover-letter-examples`,
    languages: {
      en: `${BASE}/cover-letter-examples`,
      ar: `${BASE}/ar/cover-letter-examples`,
      "x-default": `${BASE}/cover-letter-examples`,
    },
  },
};

export default function CoverLetterHub() {
  return (
    <PageShell lang="en" cta={navCta("en")} langToggle="/ar/cover-letter-examples" width="wide">
      <div className="mx-auto max-w-5xl py-14">
        <div className="text-center">
          <div className="chip mb-4">Cover letter examples</div>
          <h1 className="text-4xl font-extrabold tracking-tight">Cover letter examples <span className="accent-underline text-accent">by job</span></h1>
          <p className="mx-auto mt-4 max-w-2xl" style={{ color: "var(--muted)" }}>
            A proven 4-paragraph structure, a fill-in template, and the role-specific keywords — for 50 jobs. Every template uses your real facts only.
          </p>
        </div>

        {CATEGORIES.map((cat) => (
          <section key={cat} className="mt-12">
            <h2 className="mb-4 text-xl font-bold">{cat}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {JOBS.filter((j) => j.category === cat).map((j) => (
                <Link key={j.slug} href={`/cover-letter-examples/${j.slug}`} className="card card-hover p-4 text-sm font-semibold">
                  {j.title} cover letter →
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>

      <HubLinks current="/cover-letter-examples" />
    </PageShell>
  );
}
