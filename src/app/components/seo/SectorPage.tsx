import Link from "next/link";
import HubLinks from "../HubLinks";
import PageShell from "../PageShell";
import { navCta } from "@/app/lib/brand.ts";
import {
  type Lang, type Sector, copyFor, professions, sectorsFor, sharedKeywords, sharedCerts,
} from "@/app/lib/sectors.ts";

/**
 * A sector page and the index above it, rendered once for both languages.
 *
 * ── why one component and not two route files ──
 *
 * The opposite decision was made for `PageBody`, deliberately: there the CONTENT had to differ per
 * page, so the component takes content as data and each page supplies its own words. Here the words
 * already live in `sectors.ts`, one entry per sector per language, and what would be duplicated is
 * only the shape — a breadcrumb, a grid, two computed tables, an FAQ. Copying that into two route
 * files means fixing every layout bug twice, and the Arabic copy is the one that gets forgotten.
 *
 * So the structure is shared, the direction and the labels are parameters, and every sentence a
 * reader sees comes from the registry.
 *
 * ── what the tables are for ──
 *
 * `sharedKeywords` and `sharedCerts` are the only content on the site that no single profession
 * page could carry: the terms that recur ACROSS a sector. They also legitimately come out empty —
 * the five English healthcare professions in the catalogue share no keyword at all, because they
 * were written separately and phrase the same idea differently. An empty table is not rendered,
 * rather than rendered with a heading and nothing under it. Filling it would mean editing the
 * catalogue, which is a content job and not this component's.
 */

interface Labels {
  brand: string;
  homeHref: string;
  home: string;
  hubHref: string;
  hub: string;
  indexHref: string;
  index: string;
  build: string;
  buildHref: string;
  professionsHeading: (n: number) => string;
  keywordsHeading: string;
  keywordsNote: (n: number) => string;
  certsHeading: string;
  certsNote: string;
  hiringHeading: string;
  faqHeading: string;
  cardSub: string;
  skills: string;
  cover: string;
  allExamples: string;
  otherSectors: string;
  indexIntro: string;
  indexH1: string;
  count: (n: number) => string;
}

const L: Record<Lang, Labels> = {
  en: {
    brand: "Sira",
    homeHref: "/", home: "Home",
    hubHref: "/resume-examples", hub: "Resume Examples",
    indexHref: "/resume-examples/category", index: "By sector",
    build: "Build my resume", buildHref: "/builder",
    professionsHeading: (n) => `${n} professions in this sector`,
    keywordsHeading: "Keywords that recur across this sector",
    keywordsNote: (n) => `These terms appear in the postings for more than one profession below — the count is how many of the ${n} they cover. Use the ones you genuinely have, worded the way the job posting words them.`,
    certsHeading: "Certifications named by more than one role",
    certsNote: "Named in this sector's postings. Verify the current requirement with the issuing body before you build a plan on it — an advert is not a regulator.",
    hiringHeading: "What applying in this sector involves",
    faqHeading: "Questions people ask",
    cardSub: "Resume example · ATS keywords · bullet examples",
    skills: "Skills", cover: "Cover letter",
    allExamples: "See all resume examples →",
    otherSectors: "Other sectors",
    indexIntro: "Each sector page lists the professions it covers, the ATS keywords that recur across them, and the certifications more than one of those roles asks for. Pick yours to see the resume examples for it.",
    indexH1: "Resume examples by sector",
    count: (n) => `${n} professions`,
  },
  ar: {
    brand: "سيرة",
    homeHref: "/ar", home: "الرئيسية",
    hubHref: "/ar/resume-examples", hub: "أمثلة السير",
    indexHref: "/ar/resume-examples/category", index: "حسب القطاع",
    build: "ابنِ سيرة من الصفر", buildHref: "/ar/builder",
    professionsHeading: (n) => `${n} مهنة في هذا القطاع`,
    keywordsHeading: "كلمات تتكرّر في هذا القطاع",
    keywordsNote: (n) => `هذه الكلمات تظهر في إعلانات أكثر من مهنة من المهن أدناه — والرقم يعني في كم مهنة من الـ${n} ظهرت. استخدم ما تملكه فعلاً، بنفس صياغة الإعلان.`,
    certsHeading: "شهادات تطلبها أكثر من وظيفة",
    certsNote: "مذكورة في إعلانات هذا القطاع. تحقّق من الاشتراط الحالي من الجهة المُصدِرة قبل أن تبني عليه خطة — الإعلان ليس جهة تنظيمية.",
    hiringHeading: "ما يتطلّبه التقديم في هذا القطاع",
    faqHeading: "أسئلة يسألها الناس",
    cardSub: "مثال سيرة · كلمات ATS · أمثلة إنجازات",
    skills: "المهارات", cover: "خطاب تعريف",
    allExamples: "كل أمثلة السير الذاتية ←",
    otherSectors: "قطاعات أخرى",
    indexIntro: "كل صفحة قطاع تعرض المهن التي يشملها، وكلمات ATS المتكرّرة بينها، والشهادات التي تطلبها أكثر من وظيفة منها. اختر قطاعك لترى أمثلة السير الذاتية الخاصة به.",
    indexH1: "أمثلة السير الذاتية حسب القطاع",
    count: (n) => `${n} مهنة`,
  },
};

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://cv.rabit.sa";

function jobHref(lang: Lang, kind: "resume-examples" | "resume-skills" | "cover-letter-examples", slug: string) {
  return lang === "ar" ? `/ar/${kind}/${slug}` : `/${kind}/${slug}`;
}

/**
 * `twin` is the same page in the other language, and its absence was a real gap.
 *
 * These 20 sector pages were the only bilingual pair in the product with NO language toggle and no
 * cross-language link of any kind — from an English sector page there was literally no path to any
 * Arabic page at all — while both sets sit in the sitemap and declare each other as reciprocal
 * hreflang alternates. `PageShell` renders the toggle only when it is given one, so the header shipped
 * an empty container where it belongs.
 *
 * The sector slugs are identical in both languages (business, design-media, engineering, finance,
 * healthcare, hospitality, logistics, marketing, technology), so the twin is a prefix swap — which is
 * exactly what the hreflang tags already claimed and nothing was letting a reader act on.
 */
function Chrome({ lang, twin, children }: { lang: Lang; twin: string; children: React.ReactNode }) {
  const rtl = lang === "ar";
  return (
    <PageShell lang={lang} cta={navCta(lang)} langToggle={twin} bleed>
      {children}
      <HubLinks ar={rtl} />
    </PageShell>
  );
}

/* ─────────────────── one sector ─────────────────── */

export function SectorPage({ sector, lang }: { sector: Sector; lang: Lang }) {
  const l = L[lang];
  const copy = copyFor(sector, lang)!;
  const jobs = lang === "ar" ? professions(sector.slug, "ar") : professions(sector.slug, "en");
  const keywords = sharedKeywords(sector.slug, lang);
  const certs = sharedCerts(sector.slug, lang);
  const siblings = sectorsFor(lang).filter((s) => s.slug !== sector.slug);
  const sep = lang === "ar" ? "‹" : "›";

  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: l.home, item: `${BASE}${l.homeHref}` },
          { "@type": "ListItem", position: 2, name: l.hub, item: `${BASE}${l.hubHref}` },
          { "@type": "ListItem", position: 3, name: copy.name, item: `${BASE}${l.indexHref}/${sector.slug}` },
        ],
      },
      /*
       * An ItemList of the professions, which is what this page actually is. Google uses it to
       * understand that the page is a collection rather than an article, and it is built from the
       * same array that is rendered — never a second list that can drift out of step with it.
       */
      {
        "@type": "ItemList",
        name: copy.h1,
        numberOfItems: jobs.length,
        itemListElement: jobs.map((j, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: j.title,
          url: `${BASE}${jobHref(lang, "resume-examples", j.slug)}`,
        })),
      },
      {
        "@type": "FAQPage",
        mainEntity: copy.faq.map((f) => ({
          "@type": "Question", name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  return (
    <Chrome lang={lang} twin={lang === "ar" ? `/resume-examples/category/${sector.slug}` : `/ar/resume-examples/category/${sector.slug}`}>
      <article className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-6 font-mono text-xs" style={{ color: "var(--faint)" }}>
          <Link href={l.homeHref} style={{ color: "var(--faint)" }}>{l.home}</Link> {sep}{" "}
          <Link href={l.hubHref} style={{ color: "var(--faint)" }}>{l.hub}</Link> {sep}{" "}
          <Link href={l.indexHref} style={{ color: "var(--faint)" }}>{l.index}</Link> {sep} {copy.name}
        </div>

        <div className="chip mb-4">{copy.name}</div>
        <h1 className="text-4xl font-extrabold leading-tight tracking-tight">{copy.h1}</h1>
        {copy.intro.map((p) => (
          <p key={p.slice(0, 28)} className="mt-4 text-lg leading-relaxed" style={{ color: "var(--muted)" }}>{p}</p>
        ))}

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={navCta(lang).href} className="btn-accent px-6 py-3">{navCta(lang).label}</Link>
          <Link href={l.buildHref} className="btn-ghost px-6 py-3 font-semibold" style={{ color: "var(--fg)" }}>{l.build}</Link>
        </div>

        {/* ── the professions, each linking to all three of its pages ── */}
        <section className="t-enter mt-12">
          <h2 className="mb-4 text-2xl font-bold tracking-tight">{l.professionsHeading(jobs.length)}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {jobs.map((j) => (
              <div key={j.slug} className="card p-4">
                <Link href={jobHref(lang, "resume-examples", j.slug)} className="font-bold" style={{ color: "var(--fg)" }}>
                  {j.title}
                </Link>
                <div className="mt-1 text-xs" style={{ color: "var(--faint)" }}>{l.cardSub}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                  <Link href={jobHref(lang, "resume-skills", j.slug)} style={{ color: "var(--accent-deep)" }}>{l.skills} {lang === "ar" ? "←" : "→"}</Link>
                  <Link href={jobHref(lang, "cover-letter-examples", j.slug)} style={{ color: "var(--accent-deep)" }}>{l.cover} {lang === "ar" ? "←" : "→"}</Link>
                </div>
              </div>
            ))}
          </div>
          <Link href={l.hubHref} className="mt-4 inline-block text-sm font-semibold text-accent">{l.allExamples}</Link>
        </section>

        {/* ── computed from the catalogue; absent when the catalogue has no overlap to report ── */}
        {keywords.length > 0 && (
          <section className="t-enter mt-12">
            <h2 className="mb-3 text-2xl font-bold tracking-tight">{l.keywordsHeading}</h2>
            <p className="mb-4 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{l.keywordsNote(jobs.length)}</p>
            <div className="flex flex-wrap gap-2">
              {keywords.map((k) => (
                <span key={k.term} className="rounded-full px-3 py-1 text-xs font-medium"
                  style={{ background: "rgba(139,92,246,0.14)", color: "var(--accent-deep)" }}>
                  {k.term} <span style={{ opacity: 0.6 }}>×{k.count}</span>
                </span>
              ))}
            </div>
          </section>
        )}

        {certs.length > 0 && (
          <section className="t-enter mt-12">
            <h2 className="mb-3 text-2xl font-bold tracking-tight">{l.certsHeading}</h2>
            <p className="mb-4 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{l.certsNote}</p>
            <div className="flex flex-wrap gap-2">
              {certs.map((c) => (
                <span key={c.term} className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                  style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--muted)" }}>
                  {c.term} <span style={{ opacity: 0.6 }}>×{c.count}</span>
                </span>
              ))}
            </div>
          </section>
        )}

        <section className="t-enter mt-12">
          <h2 className="mb-3 text-2xl font-bold tracking-tight">{l.hiringHeading}</h2>
          <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{copy.hiring}</p>
        </section>

        <section className="t-enter mt-12">
          <h2 className="mb-4 text-2xl font-bold tracking-tight">{l.faqHeading}</h2>
          <div className="space-y-4">
            {copy.faq.map((f) => (
              <div key={f.q} className="card p-5">
                <h3 className="font-bold">{f.q}</h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        {siblings.length > 0 && (
          <section className="t-enter mt-12">
            <h2 className="mb-4 text-2xl font-bold tracking-tight">{l.otherSectors}</h2>
            <div className="flex flex-wrap gap-2">
              {siblings.map((s) => (
                <Link key={s.slug} href={`${l.indexHref}/${s.slug}`}
                  className="rounded-lg px-3 py-1.5 text-sm"
                  style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--muted)" }}>
                  {copyFor(s, lang)!.name}
                </Link>
              ))}
            </div>
          </section>
        )}
      </article>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
    </Chrome>
  );
}

/* ─────────────────── the index above them ─────────────────── */

/**
 * Not a duplicate of `/resume-examples`.
 *
 * That page lists every profession grouped under a heading; this one lists the SECTORS, each with
 * the sentence that describes it and the size of what is behind it. Different intent ("resume
 * examples by industry" against "resume example for my job title"), different content, and it is
 * the page that gives the sector pages a parent instead of leaving them reachable only from each
 * other.
 */
export function SectorIndex({ lang }: { lang: Lang }) {
  const l = L[lang];
  const list = sectorsFor(lang);
  const sep = lang === "ar" ? "‹" : "›";

  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: l.home, item: `${BASE}${l.homeHref}` },
          { "@type": "ListItem", position: 2, name: l.hub, item: `${BASE}${l.hubHref}` },
          { "@type": "ListItem", position: 3, name: l.index, item: `${BASE}${l.indexHref}` },
        ],
      },
      {
        "@type": "ItemList",
        name: l.indexH1,
        numberOfItems: list.length,
        itemListElement: list.map((s, i) => ({
          "@type": "ListItem", position: i + 1,
          name: copyFor(s, lang)!.name,
          url: `${BASE}${l.indexHref}/${s.slug}`,
        })),
      },
    ],
  };

  return (
    <Chrome lang={lang} twin={lang === "ar" ? "/resume-examples/category" : "/ar/resume-examples/category"}>
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-6 font-mono text-xs" style={{ color: "var(--faint)" }}>
          <Link href={l.homeHref} style={{ color: "var(--faint)" }}>{l.home}</Link> {sep}{" "}
          <Link href={l.hubHref} style={{ color: "var(--faint)" }}>{l.hub}</Link> {sep} {l.index}
        </div>
        <div className="chip mb-4">{l.index}</div>
        <h1 className="text-4xl font-extrabold tracking-tight">{l.indexH1}</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed" style={{ color: "var(--muted)" }}>{l.indexIntro}</p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {list.map((s) => {
            const copy = copyFor(s, lang)!;
            const n = lang === "ar" ? professions(s.slug, "ar").length : professions(s.slug, "en").length;
            return (
              <Link key={s.slug} href={`${l.indexHref}/${s.slug}`} className="card card-hover p-5" style={{ color: "var(--fg)" }}>
                <div className="text-lg font-bold">{copy.name}</div>
                <div className="mt-1 text-xs" style={{ color: "var(--faint)" }}>{l.count(n)}</div>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{copy.description}</p>
              </Link>
            );
          })}
        </div>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
    </Chrome>
  );
}
