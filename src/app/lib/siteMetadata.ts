/**
 * The site-wide metadata defaults, in one place because there are now two root layouts.
 *
 * Identical for both, deliberately. Every page supplies its own title, description and canonical —
 * these are only the fallbacks, and they were one English object for the whole site before the split.
 * Making the Arabic group's defaults Arabic would be an improvement, and it would also change the
 * fallback title of any Arabic page that turns out not to set its own. That is a separate change with
 * its own way of going wrong; bundling it into a structural move is how a restructuring gets blamed
 * for a copy regression.
 */

import type { Metadata } from "next";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

export const SITE_METADATA: Metadata = {
  metadataBase: new URL(BASE),
  title: "Sira — Honest AI Resume Optimizer (No-Fabrication Engine)",
  description:
    /* 165 characters is where Google cuts. The old one ran to 191 and lost the clause that is
       the entire product claim: that nothing is invented. */
    "Free ATS match score, the keywords you are missing, and a resume rewritten for the job — inventing nothing you did not provide. Arabic and English.",
  keywords: "resume optimizer, ATS resume, AI resume writer, resume checker, ATS resume checker, job application, cover letter generator",
  openGraph: {
    title: "Sira — Honest AI Resume Optimization in 10 Seconds",
    description: "Free ATS score + analysis, and a rewritten resume that never invents facts you didn't provide.",
    type: "website",
    url: BASE,
    siteName: "Sira",
  },
  twitter: { card: "summary_large_image", title: "Sira — Honest AI Resume Optimization", description: "Free ATS score + a no-fabrication rewrite in 10 seconds." },
  /*
   * Search-console ownership, as an environment variable rather than a code change.
   *
   * Verifying a property needs a token that only the person logged into Search Console can see, so
   * the alternative was a commit-per-token: paste it into this file, push, wait for a deploy, click
   * verify. That is three failure points (a typo lands in git history, the deploy is the slow part,
   * and the token ends up committed) for a value that is not a secret but is not source either.
   *
   * `verification.google` accepts one token or several. Several matters: adding a second property —
   * `cv.rabit.sa` alongside `rabit.sa`, or a colleague's own access — must not evict the first, and
   * a comma-separated variable keeps both meta tags on the page.
   *
   * Bing is included because it costs one line and Bing Webmaster Tools can import from Search
   * Console; a property that cannot be verified cannot be imported into.
   *
   * ── which method to use ──
   *
   * A DNS TXT record on `rabit.sa` (a Domain property) is better than this and needs no code at all:
   * it covers every subdomain and both protocols, so `cv.rabit.sa` and anything added later are
   * verified once. This exists for the URL-prefix path, which is what someone reaches for when they
   * do not control DNS or want it working in the next two minutes.
   */
  verification: {
    google: (process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || "")
      .split(",").map((t) => t.trim()).filter(Boolean),
    other: {
      ...(process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
        ? { "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION.trim() }
        : {}),
    },
  },
};