"use client";

/**
 * Scene 1 — Awakening. Black screen → a point → the Orb → three statements → one CTA.
 *
 * ── the rules that outrank the cinema ──
 *
 *   · MOUNTED ONLY when it should play: the parent adds this component after checking
 *     sessionStorage and prefers-reduced-motion, so the server HTML never contains it, the
 *     full page is always underneath it, and a crawler or reduced-motion reader never meets
 *     it at all.
 *   · Skippable at every moment: a visible Skip control, Escape, and the CTA all end it.
 *     Focus starts on Skip so a keyboard user's first Tab press is already on the exit.
 *   · Once per tab session (`sessionStorage`), matching the product's own definition of a
 *     visit (`resumeStore`'s rule): a refresh does not replay a film at somebody mid-task.
 *   · ~9 seconds total, and the page behind stays scrollable the moment it leaves.
 *   · No sound. There is nothing here to mute.
 *
 * The finale is a HANDOFF, not a fade: the intro orb measures the hero's docked orb and
 * translates/scales onto it (transform-only FLIP), so the identity the user just met visibly
 * becomes the assistant sitting inside the Career Profile document.
 */

import { useEffect, useRef, useState } from "react";
import BrandOrb from "../brand-orb/BrandOrb";
import type { OrbState } from "../brand-orb/orbStates";
import { LANDING_COPY } from "./copy";

export const INTRO_SEEN_KEY = "sira_intro_seen";

export default function CinematicIntro({ lang, onDone }: { lang: "ar" | "en"; onDone: () => void }) {
  const t = LANDING_COPY[lang].intro;
  const [phase, setPhase] = useState(0);       // 0 point · 1 orb+line1 · 2 line2 · 3 line3 · 4 CTA
  const [leaving, setLeaving] = useState(false);
  const [orbState, setOrbState] = useState<OrbState>("dormant");
  const [handoff, setHandoff] = useState<{ x: number; y: number; s: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const orbRef = useRef<HTMLDivElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  const done = useRef(false);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    try { sessionStorage.setItem(INTRO_SEEN_KEY, "1"); } catch { /* storage blocked — plays again, harmless */ }
    /* FLIP handoff onto the hero's docked orb, when it is on screen to receive it. */
    const dock = document.getElementById("orb-dock");
    const from = orbRef.current?.getBoundingClientRect();
    if (dock && from) {
      const to = dock.getBoundingClientRect();
      if (to.top >= 0 && to.top < innerHeight) {
        setHandoff({
          x: to.left + to.width / 2 - (from.left + from.width / 2),
          y: to.top + to.height / 2 - (from.top + from.height / 2),
          s: to.width / from.width,
        });
      }
    }
    setLeaving(true);
    setTimeout(onDone, 720);
  };

  useEffect(() => {
    skipRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") finish(); };
    window.addEventListener("keydown", onKey);
    /* The page must not scroll under a full-screen scene. Restored on unmount, whatever ends it. */
    const prevB = document.body.style.overflow, prevR = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const timers = [
      setTimeout(() => { setPhase(1); setOrbState("awakening"); }, 350),
      setTimeout(() => setPhase(2), 3300),
      setTimeout(() => setPhase(3), 5600),
      setTimeout(() => { setPhase(4); setOrbState("idle"); }, 7700),
      /*
       * ...and then it LEAVES. This was missing: the timers only advanced the phase, so the
       * overlay reached phase 4 and held the page hostage indefinitely — scroll locked, every
       * nav link covered — until someone clicked Skip or pressed Escape. Measured still up and
       * still blocking after 45s. The CTA stays for anyone who wants to act on it; the film
       * itself now hands the page over on its own, which is what its header always claimed.
       */
      setTimeout(finish, 9700),
    ];
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevB;
      document.documentElement.style.overflow = prevR;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={rootRef} className="cine-intro" data-phase={phase} data-leaving={leaving ? "" : undefined} role="dialog" aria-label={t.lines[2]}>
      <button ref={skipRef} className="cine-skip" onClick={finish}>{t.skip}</button>

      <div
        ref={orbRef}
        className="cine-intro-orbwrap"
        style={handoff ? {
          transform: `translate(${handoff.x}px, ${handoff.y}px) scale(${handoff.s})`,
          transition: "transform 0.7s cubic-bezier(0.16, 1, 0.3, 1)",
        } : undefined}
      >
        <BrandOrb size={Math.min(260, typeof innerWidth === "number" ? innerWidth * 0.5 : 260)} state={orbState} lang={lang} />
      </div>

      {/* The three statements resolve through blur into place, each replacing the last. */}
      <div className="cine-intro-line" aria-live="polite">
        {t.lines.map((line, i) => (
          <span
            key={line}
            data-on={phase === i + 1 || (i === 2 && phase >= 3) ? "" : undefined}
            data-gone={phase > i + 1 && !(i === 2 && phase >= 3) ? "" : undefined}
          >
            {line}
          </span>
        ))}
      </div>

      <div className="cine-intro-cta" data-on={phase >= 4 ? "" : undefined}>
        <button className="cine-cta cine-cta--energy" onClick={finish} style={{ fontSize: 16, padding: "13px 26px" }}>
          {t.cta}
        </button>
      </div>
    </div>
  );
}
