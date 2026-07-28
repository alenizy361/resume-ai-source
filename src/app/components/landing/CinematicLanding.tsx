"use client";

/**
 * The Sira homepage — a 30-second product story that becomes the product.
 *
 * ── structure ──
 * One scroll owner (the document), eight scenes, one Orb identity threaded through all of
 * them. The intro overlay is mounted ONLY after a client-side check (first visit this tab
 * session, motion allowed), so the server HTML is always the complete, readable page:
 * headline, story, pricing, CTA — what Sira is, without running a single animation.
 *
 * ── scene 4, the "camera" ──
 * Scroll progress drives ONE custom property (`--cam`) on the root via rAF; the backdrop
 * lighting reads it. No scroll-jacking, no pinned sections, no CSS scroll-timeline (the
 * primitive F-10 removed after it crashed iOS) — the user scrolls normally and the light
 * moves with the story.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import PublicNavigation from "../navigation/PublicNavigation";
import CinematicIntro, { INTRO_SEEN_KEY } from "./CinematicIntro";
import HeroScene from "./HeroScene";
import TailoringScene from "./TailoringScene";
import CareerRoadScene from "./CareerRoadScene";
import MissionControlScene from "./MissionControlScene";
import InterviewScene from "./InterviewScene";
import PricingScene from "./PricingScene";
import FinalScene from "./FinalScene";
import { LANDING_COPY } from "./copy";
import "@/app/landing.css";

export default function CinematicLanding({ lang }: { lang: "ar" | "en" }) {
  const ar = lang === "ar";
  const t = LANDING_COPY[lang];
  const rootRef = useRef<HTMLDivElement>(null);
  const [intro, setIntro] = useState(false);

  /* The film plays once per tab session, never under reduced motion, and never in the
     server HTML — a decision only the client can make, made once, after mount. */
  useEffect(() => {
    try {
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      if (!reduced && !sessionStorage.getItem(INTRO_SEEN_KEY)) setIntro(true);
    } catch { /* storage blocked — no film, full page */ }
  }, []);

  /* The camera: one passive scroll listener, one rAF write, one custom property. */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const h = document.documentElement.scrollHeight - innerHeight;
        root.style.setProperty("--cam", h > 0 ? String(scrollY / h) : "0");
      });
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => { window.removeEventListener("scroll", on); cancelAnimationFrame(raf); };
  }, []);

  return (
    <div ref={rootRef} className="cine-root" dir={ar ? "rtl" : "ltr"} lang={lang}>
      {/* The moving light — one fixed, paint-only backdrop that follows --cam. */}
      <div
        aria-hidden
        style={{
          position: "fixed", inset: 0, zIndex: "var(--z-backdrop)" as never, pointerEvents: "none",
          background:
            "radial-gradient(900px 520px at 50% calc(8% + var(--cam) * 70%), rgba(76, 29, 149, 0.14), transparent 62%)," +
            "radial-gradient(640px 380px at calc(18% + var(--cam) * 56%) 88%, rgba(59, 130, 246, 0.06), transparent 66%)",
        }}
      />

      <PublicNavigation lang={lang} />

      {intro && <CinematicIntro lang={lang} onDone={() => setIntro(false)} />}

      <main id="story" style={{ position: "relative", zIndex: "var(--z-content)" as never }}>
        <HeroScene lang={lang} />
        <TailoringScene lang={lang} />
        <CareerRoadScene lang={lang} />
        <MissionControlScene lang={lang} />
        <InterviewScene lang={lang} />
        <PricingScene lang={lang} />
        <FinalScene lang={lang} />
      </main>

      <footer className="cine-footer">
        <div className="cine-footer-in">
          <span>© {new Date().getFullYear()} {t.footer.rights}</span>
          <span style={{ display: "flex", gap: 18 }}>
            <Link href="/terms">{t.footer.terms}</Link>
            <Link href="/privacy">{t.footer.privacy}</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
