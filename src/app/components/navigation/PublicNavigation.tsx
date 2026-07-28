"use client";

/**
 * The public site's one navigation: Explore · Product · Templates · Pricing · Login, and a
 * single CTA. Transparent over the opening scene, solid once the story scrolls — a paint-only
 * class flip on one passive scroll listener, no layout reads in the handler.
 *
 * Mobile collapses to a full-screen sheet (own state, Escape closes, scroll locked while
 * open). Marketing navigation only — the authenticated app has `AppNavigation`.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import BrandOrbMark from "../BrandOrb";
import { LANDING_COPY } from "../landing/copy";

export default function PublicNavigation({ lang }: { lang: "ar" | "en" }) {
  const t = LANDING_COPY[lang].nav;
  const ar = lang === "ar";
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const on = () => setSolid(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prevB = document.body.style.overflow, prevR = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevB;
      document.documentElement.style.overflow = prevR;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const links = [
    { href: ar ? "/ar/resume-examples" : "/resume-examples", label: t.explore },
    { href: "#product", label: t.product },
    { href: ar ? "/ar/templates" : "/templates", label: t.templates },
    { href: ar ? "/ar/pricing" : "/pricing", label: t.pricing },
    { href: ar ? "/ar/login" : "/login", label: t.login },
  ];

  return (
    <nav className="cine-nav" data-solid={solid ? "" : undefined} aria-label={ar ? "التنقل الرئيسي" : "Main navigation"}>
      <div className="cine-nav-in">
        <Link href={ar ? "/ar" : "/"} className="flex min-h-11 items-center gap-2" style={{ fontWeight: 800, fontSize: 16 }}>
          <BrandOrbMark size={26} />
          <span>{ar ? "سيرة" : "Sira"}</span>
        </Link>
        <div className="cine-nav-links">
          {links.map((l) => <Link key={l.href} href={l.href}>{l.label}</Link>)}
          <Link href={ar ? "/" : "/ar"} aria-label={ar ? "English" : "عربي"} style={{ fontSize: 14, fontWeight: 600, color: "var(--cine-dim)" }}>
            {ar ? "EN" : "عربي"}
          </Link>
          <Link href={ar ? "/ar/builder" : "/builder"} className="cine-cta">{t.cta}</Link>
        </div>
        <button className="cine-nav-burger" aria-label={ar ? "القائمة" : "Menu"} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <span /><span /><span />
        </button>
      </div>
      {open && (
        <div className="cine-nav-sheet" role="dialog" aria-modal="true">
          <button className="cine-skip" onClick={() => setOpen(false)}>{ar ? "إغلاق" : "Close"}</button>
          {links.map((l) => <Link key={l.href} href={l.href} onClick={() => setOpen(false)}>{l.label}</Link>)}
          <Link href={ar ? "/" : "/ar"} onClick={() => setOpen(false)}>{ar ? "English" : "عربي"}</Link>
          <Link href={ar ? "/ar/builder" : "/builder"} className="cine-cta cine-cta--energy" onClick={() => setOpen(false)} style={{ marginTop: 14 }}>
            {t.cta}
          </Link>
        </div>
      )}
    </nav>
  );
}
