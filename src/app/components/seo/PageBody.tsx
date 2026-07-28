import Link from "next/link";
import { toArabicDigits } from "@/app/lib/plans";

/**
 * The part of a tool page that a crawler can actually read.
 *
 * ── the problem this solves ──
 *
 * `/optimize` is a client component: the whole tool appears after JavaScript runs. Measured with
 * `ops/seo-audit.mjs`, the server response for that page contains **65 words** — and 50 for the
 * Arabic one. Those are the pages meant to rank for "ATS resume checker" and "فحص السيرة الذاتية",
 * the highest-intent queries this product has, and they arrive at a search engine with nothing in
 * them. Metadata cannot rescue a body that is empty; a title tag is a label, not content.
 *
 * So the tool keeps its client component, and the page gains a server-rendered half underneath it:
 * what the tool does, how it works, what the score means, and the questions people actually ask.
 * That text is in the HTML the first request returns, with no JavaScript involved.
 *
 * ── why it is shared and generic ──
 *
 * Because the alternative is copy-paste, and copy-paste is how two pages end up with the same body
 * — which is worse than a thin page. This component takes the CONTENT as data, so each page's
 * words are its own; only the shape is shared.
 *
 * ── what it must never become ──
 *
 * Text written for a crawler that a human would not read. Everything here is shown, in the same
 * place, at the same size, to everybody. If a section is not worth a reader's time it should be
 * deleted rather than hidden.
 */

export interface FaqItem { q: string; a: string }
export interface LinkItem { href: string; label: string }

/** One language's worth of this section. */
export interface PageBodyContent {
  heading: string;
  intro: string[];
  stepsHeading: string;
  steps: { title: string; body: string }[];
  faqHeading: string;
  faq: FaqItem[];
  relatedHeading: string;
  related: LinkItem[];
}

/**
 * ── the bilingual pages, and why both languages ship in the HTML ──
 *
 * `/interview`, `/linkedin` and `/career-plan` have no `/ar/*` PAGE — `/ar/interview` is a stub
 * that redirects to `?lang=ar` on this same URL, and the language is then chosen in the browser.
 * That works for the tool above, which is a client component. It could not work here: this half
 * is server-rendered precisely so a crawler can read it, and a server component cannot know a
 * choice the client has not made yet.
 *
 * So a page that has an `ar` bundle renders BOTH, and the one that does not match the document's
 * language is hidden by CSS keyed on `<html lang>` — which `useLang` already sets on these exact
 * routes. A crawler reads a genuinely bilingual page under one canonical URL; an Arabic reader
 * reads Arabic. Measured before this: /interview?lang=ar was 89% Latin characters inside a
 * `dir="rtl"` document — an Arabic shell wrapped around an English article.
 */
function Body({ dir, c }: { dir: "ltr" | "rtl"; c: PageBodyContent }) {
  const { heading, intro, steps, stepsHeading, faq, faqHeading, related, relatedHeading } = c;
  return (
    <section dir={dir} className="mx-auto max-w-3xl px-5 py-16" style={{ color: "var(--fg)" }}>
      {/* An h2, not an h1: the tool above owns the page's single h1, and two of them is a signal
          that the page is about two things. */}
      <h2 className="text-xl font-bold">{heading}</h2>
      {intro.map((p) => (
        <p key={p.slice(0, 24)} className="mt-3 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{p}</p>
      ))}

      <h3 className="mt-10 text-base font-bold">{stepsHeading}</h3>
      <ol className="mt-3 space-y-3">
        {steps.map((s, i) => (
          <li key={s.title} className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
            {/* Arabic-Indic digits on an Arabic page. The tool directly above this list says
                «الخطوة ١ من ٣» and this list numbered itself «1. 2. 3. 4.» — two digit systems for
                the same kind of ordinal, on one screen. The helper already existed and was used in a
                dozen other places. One line here covers /ar/optimize, /interview?lang=ar,
                /linkedin?lang=ar and /ar/career-plan together, since they share this component. */}
            <span className="font-semibold" style={{ color: "var(--fg)" }}>{dir === "rtl" ? toArabicDigits(i + 1) : i + 1}. {s.title}</span>
            {" — "}{s.body}
          </li>
        ))}
      </ol>

      <h3 className="mt-10 text-base font-bold">{faqHeading}</h3>
      <dl className="mt-3 space-y-4">
        {faq.map((f) => (
          <div key={f.q}>
            <dt className="text-sm font-semibold">{f.q}</dt>
            <dd className="mt-1 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{f.a}</dd>
          </div>
        ))}
      </dl>

      {/*
        Internal links with descriptive text, which is the half of internal linking that gets
        skipped: "click here" tells a crawler nothing about what it will find, and tells a reader
        nothing about whether to bother.
      */}
      <h3 className="mt-10 text-base font-bold">{relatedHeading}</h3>
      <ul className="mt-3 flex flex-wrap gap-2">
        {related.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              /* `t-tap` for the 44px floor. Measured at 390px: 34 of these across six pages, every
                 one exactly 30px, and several sitting with 0px between adjacent rows. The class's
                 own docstring names "the optimize template chips 30px" as a reason it exists — the
                 chips just never carried it, and until now an `li .t-tap` exception would have
                 cancelled it anyway. */
              className="t-tap inline-block rounded-full px-3 py-1.5 text-xs font-semibold"
              style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>

      {/*
        The FAQ as structured data, generated from the SAME array that is rendered above.
        Google's guidance is explicit that FAQ markup must match visible content; building both
        from one source is how that stays true when someone edits a question a year from now.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faq.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }),
        }}
      />
    </section>
  );
}

export default function PageBody(
  props: PageBodyContent & { dir?: "ltr" | "rtl"; ar?: PageBodyContent },
) {
  const { dir = "ltr", ar, ...en } = props;
  if (!ar) return <Body dir={dir} c={en} />;
  return (
    <>
      <div data-seo-lang="en"><Body dir="ltr" c={en} /></div>
      <div data-seo-lang="ar"><Body dir="rtl" c={ar} /></div>
    </>
  );
}
