import type { Metadata } from "next";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

/*
 * This page had NO metadata export at all — confirmed live: it served whatever generic default the
 * root layout falls back to, on a route that IS in `sitemap.ts`. The title/description below are
 * the page's own real H1 and lede, not invented copy.
 *
 * No `ar` alternate, matching `interview-live/layout.tsx`'s own documented reasoning: this is one
 * bilingual client component behind one URL, switching language via `?lang=ar` on the browser side.
 * The canonical strips that query, so declaring it as a separate language edition would point an
 * hreflang pair at the same page — a contradiction, not a language signal.
 */
export const metadata: Metadata = {
  title: "Career Transition Plan — Current Role to Target Role | Sira",
  description: "Compare your current role to where you want to go and get a realistic plan: transferable skills, real gaps, and concrete next steps.",
  alternates: {
    canonical: `${BASE}/career-plan`,
    languages: { "x-default": `${BASE}/career-plan` },
  },
};

export default function CareerPlanLayout({ children }: { children: React.ReactNode }) {
  return children;
}
