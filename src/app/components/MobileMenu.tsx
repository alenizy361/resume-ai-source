"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { dest } from "@/app/lib/brand";

/** Hamburger menu for small screens — the header's secondary links (which are
 *  hidden below `sm`) collapse into this, INCLUDING the session-aware Sign in /
 *  Account link that was otherwise unreachable on mobile. Positioned inside a
 *  `relative` wrapper so the dropdown anchors under the button reliably. */
export default function MobileMenu({ ar = false }: { ar?: boolean }) {
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setSignedIn(!!d.signedIn)).catch(() => setSignedIn(false));
  }, []);

  /*
   * An open overlay owes the reader three things, and this one gave only the scrim click.
   * Measured with the menu open: Escape left `aria-expanded="true"`, and a wheel over the
   * panel scrolled the PAGE BEHIND from 0 to 400 — the menu stayed put while the site slid
   * around underneath it, which reads as a rendering fault rather than a menu.
   *
   * The builder's own sheet already does all of this correctly, so the product was
   * contradicting itself between two overlays two taps apart.
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    /*
     * BOTH elements, and locking only `body` was measured to do NOTHING.
     *
     * `globals.css` sets `html { overflow-x: clip }`. A root with a non-`visible` overflow stops
     * the body's overflow being propagated to the viewport, so `body { overflow: hidden }` alone
     * left the page scrolling freely behind the open panel — a real wheel still moved it 0 → 400,
     * the exact number this fix was written to eliminate. `PublicNavigation` already sets both and
     * locks correctly; this is the same treatment.
     *
     * Restored to what each WAS, not to "" — a page that sets its own overflow (the builder does)
     * must not be unlocked by the closing of a menu it never opened.
     */
    const prevBody = document.body.style.overflow;
    const prevRoot = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevRoot;
    };
  }, [open]);

  /*
   * Close on crossing the breakpoint that hides the trigger.
   *
   * The whole component is `sm:hidden`. A phone rotated to landscape while the menu was open left
   * `open === true`, `aria-expanded="true"` and the scroll lock in place, with the panel itself
   * `display: none` — the page unscrollable, the menu invisible, and no control on screen able to
   * undo either. Escape still worked, which is not a thing a user knows to try.
   */
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia("(min-width: 640px)");
    const onChange = () => { if (mq.matches) setOpen(false); };
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [open]);

  /* The Arabic entries point at the ARABIC routes — the bare EN paths landed an Arabic user on
     the English login/account pages (the path is what `useLang` trusts first). */
  const acct = ar
    ? (signedIn ? { href: "/ar/account", label: "● حسابي" } : { href: "/ar/login", label: "تسجيل الدخول" })
    : (signedIn ? { href: "/account", label: "● Account" } : { href: "/login", label: "Sign in" });

  /* The two destination names come from `brand.ts`, not from here. This menu called them "Scan my
     resume" and "CV Builder" while the header CTA two inches above it said "Build my resume" and
     the chip rails said four other things — eleven names for two doors. See `DEST`. */
  const lang = ar ? "ar" : "en";
  const links = ar
    ? [
        dest("optimize", lang),
        dest("builder", lang),
        { href: "/ar/pricing", label: "الأسعار" },
        acct,
        { href: "/", label: "English" },
      ]
    : [
        dest("optimize", lang),
        dest("builder", lang),
        { href: "/pricing", label: "Pricing" },
        acct,
        { href: "/ar", label: "عربي" },
      ];

  return (
    <div className="relative sm:hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={ar ? "القائمة" : "Menu"}
        aria-expanded={open}
        className="flex h-11 w-11 items-center justify-center rounded-lg"
        style={{ border: "1px solid var(--line)", background: "var(--surface)" }}
      >
        <div className="space-y-1.5">
          <span className="block h-0.5 w-5 rounded" style={{ background: "var(--fg)" }} />
          <span className="block h-0.5 w-5 rounded" style={{ background: "var(--fg)" }} />
          <span className="block h-0.5 w-5 rounded" style={{ background: "var(--fg)" }} />
        </div>
      </button>
      {open && (
        <>
          {/* The scrim and the panel are on the ONE layer scale (globals.css), not on two
              hand-picked Tailwind steps that happened not to collide. */}
          <div className="fixed inset-0" onClick={() => setOpen(false)}
            style={{ background: "rgba(0,0,0,0.5)", zIndex: "var(--z-menu)" }} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={ar ? "القائمة" : "Menu"}
            className={`absolute mt-3 min-w-52 rounded-xl p-2 ${ar ? "left-0" : "right-0"}`}
            /* Same layer as the scrim, LATER in the DOM, so it paints above it. Without an explicit
               z-index the fixed scrim (z 60) covered this panel entirely: the menu opened, every
               link rendered — and every tap hit the scrim and only closed the menu. The whole
               mobile nav was dead, both languages, verified by elementFromPoint on every link. */
            style={{ background: "var(--surface)", border: "1px solid var(--line)", boxShadow: "0 20px 50px -15px rgba(0,0,0,0.7)", zIndex: "var(--z-menu)" }}
          >
            {links.map((l) => (
              <Link
                key={l.href + l.label}
                href={l.href}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-4 py-3 text-sm font-semibold"
                style={{ color: "var(--fg)" }}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
