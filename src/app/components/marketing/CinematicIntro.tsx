"use client";

/**
 * A short, skippable, one-time-per-session takeover: the orb wakes up, three lines resolve one at
 * a time, then a single CTA. This is a decorative ENHANCEMENT layered on top of the real hero —
 * `Landing.tsx`'s actual `<h1>`, lede and CTA are always server-rendered underneath, unchanged, so
 * a crawler or a screen reader that never runs this component's JS still gets the complete page.
 *
 * ── why it renders `null` until an effect fires ──
 *
 * Whether to show the intro depends on `sessionStorage` (has this tab seen it already?) and
 * `prefers-reduced-motion`, neither of which exists during SSR or the first client render — so
 * this always renders nothing on mount, then a `useEffect` decides, client-side, whether to turn
 * itself on. That is the same reasoning `ContinueDraft.tsx` documents for its own storage read;
 * the difference is this component has nothing to keep *subscribed* to (an intro is a one-time
 * decision, not a live value), so a plain `useState` set once in an effect is enough — no
 * `useSyncExternalStore` needed.
 *
 * ── why the text is a CSS crossfade, not a typewriter ──
 *
 * A per-character typing effect means one timer (or one animation-delay) per character across
 * three sentences — real ongoing cost for a one-time decoration. Three full phrases, stacked and
 * cross-fading on staggered `animation-delay`s, is the SAME mechanism `.t-stagger`/`.t-hero`
 * already use elsewhere in this codebase (nth-child delay ladder, `@starting-style`-free
 * `animation: … both`), reused rather than reinvented. No `filter: blur()` anywhere — this file's
 * own motion budget follows `transitions.css`'s documented ban on animating it (a real iPhone
 * crash pattern elsewhere in this codebase; this component does not touch that budget).
 *
 * ── accessibility ──
 *
 * The animated headline text is `aria-hidden` (it duplicates, word-for-word in spirit, the real
 * `<h1>` underneath — nothing here is information found ONLY in the animation). The Skip control
 * is a real, labeled, autofocused `<button>`, reachable immediately without Tab-hunting, and
 * clicking anywhere on the overlay, pressing Escape, or letting the sequence finish all call the
 * same `dismiss()`. No focus trap: this is a temporary decorative layer, not a modal dialog.
 */

import { useEffect, useRef, useState } from "react";
import BrandOrb from "../BrandOrb";

const SEEN_KEY = "sira_intro_seen_v1";

const T = {
  en: {
    lines: ["Your career starts here.", "Not another resume builder.", "Your Career Operating System."],
    cta: "Start Building",
    skip: "Skip",
  },
  ar: {
    lines: ["مسارك المهني يبدأ هنا.", "ليست مجرد أداة لبناء سيرة.", "نظام تشغيلك المهني."],
    cta: "ابدأ الآن",
    skip: "تخطّي",
  },
};

export default function CinematicIntro({ lang }: { lang: "ar" | "en" }) {
  /*
   * Fully self-contained: the real hero underneath never re-renders or knows this component
   * exists. "leaving" plays the fade-out transition; the component then sets itself to "hidden"
   * and unmounts its own DOM (rather than sitting invisible-but-still-`position:fixed` over the
   * page forever, which would silently eat clicks the moment the leaving transition finished).
   */
  const [phase, setPhase] = useState<"hidden" | "playing" | "leaving">("hidden");
  const t = T[lang];
  /*
   * React 18 StrictMode (on by default in dev, not in production builds) double-invokes this
   * effect on mount — run, cleanup, run again — to surface impurities. Read-then-write-sessionStorage
   * is exactly the impurity it's designed to catch: the FIRST invocation would see "not seen yet"
   * and write the flag; the SECOND invocation would then read its own sibling's write back and
   * conclude "already seen," so the intro would silently never show — but only in dev, since
   * production never double-invokes. This ref makes the decision exactly once per real component
   * instance; the second (dev-only) invocation sees it already made and leaves the first
   * invocation's state alone instead of re-deriving (and corrupting) it.
   */
  const decidedRef = useRef(false);

  useEffect(() => {
    if (decidedRef.current) return;
    decidedRef.current = true;
    let alreadySeen = true;
    try { alreadySeen = sessionStorage.getItem(SEEN_KEY) === "1"; } catch { /* storage blocked — treat as already-seen, degrade to the plain hero */ }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (alreadySeen || reduced) return;
    try { sessionStorage.setItem(SEEN_KEY, "1"); } catch { /* best-effort */ }
    setPhase("playing");
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  function dismiss() {
    if (phase !== "playing") return;
    setPhase("leaving");
    document.body.style.overflow = "";
    window.setTimeout(() => setPhase("hidden"), 550);
  }

  useEffect(() => {
    if (phase !== "playing") return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") dismiss(); }
    window.addEventListener("keydown", onKey);
    // Auto-continue once the sequence has clearly finished (~5.6s) — short, and never the only
    // way out (Escape / click / Skip / the CTA all work from the first frame).
    const auto = window.setTimeout(dismiss, 5600);
    return () => { window.removeEventListener("keydown", onKey); window.clearTimeout(auto); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (phase === "hidden") return null;

  return (
    <div className={`intro-scrim${phase === "leaving" ? " intro-leaving" : ""}`} onClick={dismiss}>
      <button
        type="button"
        className="intro-skip"
        autoFocus
        onClick={(e) => { e.stopPropagation(); dismiss(); }}
      >
        {t.skip}
      </button>
      <div className="intro-stage" onClick={(e) => e.stopPropagation()}>
        <div className="intro-orb">
          <BrandOrb variant="hero" size={180} orbState="awakening" />
        </div>
        <div className="intro-lines" aria-hidden>
          {t.lines.map((line, i) => (
            <p key={line} className="intro-line" style={{ animationDelay: `${900 + i * 1350}ms` }}>{line}</p>
          ))}
        </div>
        <button type="button" className="intro-cta" onClick={(e) => { e.stopPropagation(); dismiss(); }}>
          {t.cta}
        </button>
      </div>
    </div>
  );
}
