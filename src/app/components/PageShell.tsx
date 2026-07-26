import Link from "next/link";
import BrandOrb from "./BrandOrb";
import { copyright } from "@/app/lib/brand";

/**
 * One header, one background, one spacing scale — for every page that is not the builder.
 *
 * ── the problem it fixes ──
 *
 * Every page wrote its own chrome, and they had drifted apart. Measured across the pages the
 * brief names:
 *
 *   · **Header height** varied from `py-3` to `py-6`, so the content started at a different
 *     height on each page and navigating between them made the whole page jump.
 *   · **Background** was `var(--bg)` on some pages, `var(--cosmos-bg)` on four others — two
 *     different blacks — and several also stacked a `.hero-ambient` block of their own on top.
 *   · **Header background** was a hardcoded `rgba(5,7,13,0.85)` gradient repeated in nineteen
 *     files, none of which matched the page background underneath it after the palette moved.
 *   · The **logo mark** was a violet-pink gradient disc that was not the product's orb.
 *
 * None of that is a bug in any one page; it is the absence of a shared shell. This is the
 * shell. A page passes its language and its content, and everything a visitor recognises as
 * "the site" comes from here.
 *
 * ── why a server component with no state ──
 *
 * The header contains a link, a wordmark, a CSS orb and one call to action. Nothing in it needs
 * JavaScript, and it is the first thing painted on every page — so making it a client component
 * would put a hydration boundary in front of the content a visitor is waiting for, for no gain.
 *
 * ── what it deliberately does NOT do ──
 *
 * No animation on mount, no reveal, no transition wrapper. The header and the content are in the
 * first response and are painted in the first frame. The old shell wrapped every page in an
 * `AnimatePresence mode="wait"` crossfade, which held the incoming page back until the outgoing
 * one had finished fading — that pause is the "blank screen before the content" in the brief, and
 * the fix is the absence of code rather than faster code.
 */
export default function PageShell({
  lang,
  cta,
  children,
  /** Wider than the default 768px reading column — galleries and dashboards want it. */
  width = "reading",
  /** Set when the page renders its own footer (the SEO hubs do). */
  footer = true,
}: {
  lang: "ar" | "en";
  /** The header's one action. Omit on pages that ARE that action (login, checkout). */
  cta?: { href: string; label: string };
  children: React.ReactNode;
  width?: "reading" | "wide" | "full";
  footer?: boolean;
}) {
  const ar = lang === "ar";
  const home = ar ? "/ar" : "/";
  const brand = ar ? "سيرة" : "Sira";
  const max = width === "wide" ? "max-w-5xl" : width === "full" ? "max-w-7xl" : "max-w-3xl";

  return (
    /*
     * `min-h-dvh`, not `min-h-screen`: on iOS Safari `100vh` is the viewport WITHOUT the
     * address bar, so a `100vh` page is 60–90px taller than the screen it is on — which is a
     * scrollbar on a page that has nothing to scroll, and it is where the "huge empty space"
     * came from. No background of its own: the one backdrop shows through.
     */
    <main dir={ar ? "rtl" : "ltr"} lang={lang} className="min-h-dvh" style={{ color: "var(--fg)" }}>
      <header className="ps-header">
        <div className="ps-header-in">
          <Link href={home} className="ps-brand">
            <BrandOrb size={26} />
            <span>{brand}</span>
          </Link>
          {cta && <Link href={cta.href} className="ps-cta">{cta.label}</Link>}
        </div>
      </header>

      <div className={`ps-body ${max}`}>{children}</div>

      {footer && (
        <footer className="ps-footer">
          <p>{copyright(lang)}</p>
        </footer>
      )}
    </main>
  );
}
