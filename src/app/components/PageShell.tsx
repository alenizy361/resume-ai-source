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
  /** Path to this same page's other-language twin. Omit when no twin exists (EN-only pages). */
  langToggle,
  /**
   * Fires before the language-toggle link navigates. For the one page that must carry state
   * across the switch (`/optimize` persists its in-progress draft under the other language's
   * storage key first, so it isn't lost) — most pages don't need this. `PageShell` itself has
   * no `"use client"` directive, so it renders as ordinary server-side JSX when a Server
   * Component page uses it (this prop simply stays undefined there) and as ordinary
   * client-side JSX when a Client Component page uses it (this prop works normally, since
   * that page already crossed the client boundary before rendering `PageShell` at all).
   */
  onLangToggle,
  /**
   * The session-aware sign-in/account control, when the page wants one — pass `<AuthNav ar={ar} />`.
   * Taken as a node, not a boolean, on purpose: `AuthNav` is a `"use client"` component, and a
   * static `import AuthNav from "./AuthNav"` at the top of THIS file would put it in the client
   * reference manifest for every page that renders `PageShell` — including the ~350 static SEO
   * pages that pass no `authNav` at all. Measured: that one unconditional import alone pushed
   * `/resume-examples`'s shipped JS from ~109 KB to 523 KB, the exact class of regression F-23
   * fixed for the root layout, reintroduced through this file instead. Accepting a node means only
   * the pages that actually import `AuthNav` themselves pay for it.
   */
  authNav,
  /**
   * Skip the `ps-body` wrapper (its max-width and fixed padding) and render children directly
   * under `<main>`. For landing-style pages built from full-width, alternating-background
   * sections — each section manages its own inner column — wrapping them in a padded box would
   * pull every section's background in from the viewport edge. Header and footer are unaffected.
   */
  bleed = false,
}: {
  lang: "ar" | "en";
  /** The header's one action. Omit on pages that ARE that action (login, checkout). */
  cta?: { href: string; label: string };
  children: React.ReactNode;
  width?: "reading" | "wide" | "full";
  footer?: boolean;
  langToggle?: string;
  onLangToggle?: () => void;
  authNav?: React.ReactNode;
  bleed?: boolean;
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
          <div className="flex items-center gap-3">
            {langToggle && (
              <Link href={langToggle} onClick={onLangToggle} className="text-sm font-semibold" style={{ color: "var(--muted)" }}>
                {ar ? "EN" : "AR"}
              </Link>
            )}
            {authNav}
            {cta && <Link href={cta.href} className="ps-cta">{cta.label}</Link>}
          </div>
        </div>
      </header>

      {bleed ? children : <div className={`ps-body ${max}`}>{children}</div>}

      {footer && (
        <footer className="ps-footer">
          <p>{copyright(lang)}</p>
        </footer>
      )}
    </main>
  );
}
