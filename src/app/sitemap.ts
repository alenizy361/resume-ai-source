import type { MetadataRoute } from "next";
import { JOB_SLUGS } from "./lib/jobs";
import { AR_SLUGS } from "./lib/jobs-ar";
import { TEMPLATE_SLUGS } from "./lib/templates";
import { sectorSlugs } from "./lib/sectors.ts";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    "", "/optimize", "/linkedin", "/interview", "/career-plan", "/pricing", "/templates",
    /* `/ar/pricing` and `/ar/templates` were the only two indexable Arabic pages missing from this
       list: both emit a self-canonical, both are declared as the `ar` alternate by their English
       twins, and neither is noindex — so the sitemap contradicted the pages' own tags. (Contrast
       `/ar/account`, correctly absent because its page sets `robots: { index: false }`.) */
    "/ar/pricing", "/ar/templates",
    "/ats-resume-checker", "/jobscan-alternative", "/free-resume-checker",
    "/pdf-readability-checker", "/ar/pdf-readability-checker",
    "/jd-keyword-extractor", "/ar/jd-keyword-extractor",
    "/resume-examples", "/resume-templates",
    "/cover-letter-examples", "/resume-skills",
    "/resume-examples/category", "/ar/resume-examples/category",
    "/ar", "/ar/optimize", "/ar/resume-examples", "/interview-live",
    // The Arabic skills and cover-letter hubs. Their 122 profession pages were in this sitemap
    // with no index page above them — reachable by a crawler, orphaned for a reader.
    "/ar/resume-skills", "/ar/cover-letter-examples",
    "/privacy", "/terms", "/ar/privacy", "/ar/terms",
    // The builder's two landings. The step pages under them are one visitor's draft and
    // are noindex; only the entry points belong in a sitemap.
    "/builder", "/ar/builder",
  ];
  const examplePages = JOB_SLUGS.map((slug) => `/resume-examples/${slug}`);
  const coverPages = JOB_SLUGS.map((slug) => `/cover-letter-examples/${slug}`);
  const skillPages = JOB_SLUGS.map((slug) => `/resume-skills/${slug}`);
  const templatePages = TEMPLATE_SLUGS.map((slug) => `/resume-templates/${slug}`);
  // Arabic programmatic SEO — three page types per Arabic profession.
  const arExamplePages = AR_SLUGS.map((slug) => `/ar/resume-examples/${slug}`);
  const arSkillPages = AR_SLUGS.map((slug) => `/ar/resume-skills/${slug}`);
  const arCoverPages = AR_SLUGS.map((slug) => `/ar/cover-letter-examples/${slug}`);
  /*
   * Sector pages, and the list comes from the same gate the routes use — `sectorSlugs` applies the
   * minimum-professions rule, so a sector too thin to publish cannot end up in the sitemap
   * pointing at a 404. The two languages publish different sets on purpose.
   */
  const sectorPages = sectorSlugs("en").map((slug) => `/resume-examples/category/${slug}`);
  const arSectorPages = sectorSlugs("ar").map((slug) => `/ar/resume-examples/category/${slug}`);

  return [
    ...routes, ...examplePages, ...coverPages, ...skillPages, ...templatePages,
    ...arExamplePages, ...arSkillPages, ...arCoverPages,
    ...sectorPages, ...arSectorPages,
  ].map((path) => ({
    url: `${BASE}${path}`,
    changeFrequency: "weekly",
    /* Sector pages are hubs, not leaves: they sit under /resume-examples/ but rank for a broader
       query and pass link equity down, so they keep the hub priority rather than the leaf one. */
    priority: path === "" ? 1
      : /\/category(\/|$)/.test(path) ? 0.8
        : /\/(resume-examples|cover-letter-examples|resume-skills)\//.test(path) ? 0.7 : 0.8,
  }));
}
