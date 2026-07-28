"use client";

/**
 * Scene 5 — the Career Road: seven stations from Career Profile to Offer, on one vertical
 * line that fills as the user travels it. Each stop activates as it enters focus (its own
 * small observer — a stop lights when LOOKED AT, not when the section starts), pulses the
 * scene's orb, and says one thing. Vertical by construction, so mobile needs nothing special.
 */

import { useEffect, useRef, useState } from "react";
import BrandOrb from "../brand-orb/BrandOrb";
import { LANDING_COPY } from "./copy";
import { useScene } from "./useScene";

export default function CareerRoadScene({ lang }: { lang: "ar" | "en" }) {
  const t = LANDING_COPY[lang].road;
  const { ref, on } = useScene<HTMLElement>();
  const roadRef = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState(0);

  /* Which stops have been seen — drives both the stop states and the line's fill height. */
  useEffect(() => {
    const root = roadRef.current;
    if (!root) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    /* External-state branch (reduced motion) — the rule's carve-out. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (reduced) { setLit(t.steps.length); return; }
    const stops = [...root.querySelectorAll("[data-stop]")];
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const i = Number((e.target as HTMLElement).dataset.stop) + 1;
        setLit((v) => Math.max(v, i));
        io.unobserve(e.target);
      }
    }, { threshold: 0.6 });
    stops.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [t.steps.length]);

  return (
    <section ref={ref} className="cine-scene cine-scene--below" data-on={on ? "" : undefined} aria-labelledby="road-h">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="cine-kicker cine-rise">{t.kicker}</p>
          <h2 id="road-h" className="cine-h2 cine-rise">{t.h2}</h2>
        </div>
        {/* One orb walks the road with the reader: a pulse for every station reached. */}
        <div className="cine-rise" style={{ marginTop: 8 }}>
          <BrandOrb size={44} state={lit >= t.steps.length ? "success" : lit > 0 ? "suggestion" : "idle"} lang={lang} pulse={lit >= t.steps.length ? "success" : "warning"} pulseKey={lit} />
        </div>
      </div>

      <div ref={roadRef} className="cine-road" style={{ "--road": lit / t.steps.length } as React.CSSProperties}>
        <div className="cine-road-line" aria-hidden><i /></div>
        {t.steps.map((s, i) => (
          <div key={s.t} data-stop={i} className="cine-stop" data-on={lit > i ? "" : undefined}>
            <span className="cine-stop-dot" aria-hidden><i /></span>
            <h3 className="cine-stop-t">{s.t}</h3>
            <p className="cine-stop-d">{s.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
