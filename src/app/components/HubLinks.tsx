import Link from "next/link";

/**
 * Cross-links every resource hub so no page stands alone — internal linking
 * for visitors AND for search crawlers. Server-safe (no hooks).
 */
const EN: [string, string][] = [
  ["Resume examples", "/resume-examples"],
  ["By sector", "/resume-examples/category"],
  ["Skills by job", "/resume-skills"],
  ["Templates", "/resume-templates"],
  ["Template gallery", "/templates"],
  ["Cover letters", "/cover-letter-examples"],
  ["ATS checker", "/ats-resume-checker"],
  ["Free checker", "/free-resume-checker"],
  ["Jobscan alternative", "/jobscan-alternative"],
  ["Interview prep", "/interview"],
  ["Mock interview", "/interview-live"],
  ["LinkedIn optimizer", "/linkedin"],
  ["Career plan", "/career-plan"],
  ["Pricing", "/pricing"],
];
/*
 * Arabic parity, fixed.
 *
 * This set used to omit the ATS-checker trio and LinkedIn entirely, and its "Templates"/"Pricing"
 * entries pointed at `/templates` and `/pricing` — the ENGLISH routes, with no `/ar` prefix — which
 * dropped an Arabic-reading visitor into the English UI from a link on an Arabic page. Every entry
 * up to the ATS trio below is a route that actually exists in Arabic.
 *
 * The ATS-checker trio has no Arabic PAGE — translating three SEO landing pages is real,
 * scoped-out content work, not a navigation fix. But the earlier choice to omit them entirely left
 * an Arabic-reading visitor with literally no path to three real tools, which is worse than sending
 * them to an English page with an Arabic label: the label tells them what they're clicking before
 * they land, same as any bilingual site linking out to an unlocalised resource. So they're listed,
 * pointed at the English routes, and marked "(EN)" rather than pretending they're Arabic pages.
 */
const AR: [string, string][] = [
  ["الرئيسية", "/ar"],
  ["افحص سيرتك", "/ar/optimize"],
  ["أمثلة السير", "/ar/resume-examples"],
  ["حسب القطاع", "/ar/resume-examples/category"],
  ["المهارات لكل مهنة", "/ar/resume-skills"],
  ["خطابات التعريف", "/ar/cover-letter-examples"],
  ["القوالب", "/ar/templates"],
  ["تحضير المقابلة", "/ar/interview"],
  ["مقابلة مباشرة", "/ar/interview-live"],
  ["محسّن لينكدإن", "/ar/linkedin"],
  ["خطة مسيرتك المهنية", "/ar/career-plan"],
  ["الأسعار", "/ar/pricing"],
  ["حسابي", "/ar/account"],
  ["فحص ATS (EN)", "/ats-resume-checker"],
  ["فحص مجاني (EN)", "/free-resume-checker"],
  ["بديل Jobscan (EN)", "/jobscan-alternative"],
];

export default function HubLinks({ current, ar = false }: { current?: string; ar?: boolean }) {
  const links = (ar ? AR : EN).filter(([, href]) => href !== current);
  return (
    <nav className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-2 px-6 pb-12" aria-label="Explore more">
      {links.map(([label, href]) => (
        <Link key={href} href={href} className="rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors"
          style={{ border: "1px solid var(--line)", color: "var(--muted)" }}>{label}</Link>
      ))}
    </nav>
  );
}
