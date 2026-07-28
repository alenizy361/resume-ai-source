"use client";

/**
 * Scene 2 — the hero IS the product. The same viewport the intro played in now holds the
 * headline and a white Career Profile document that fills itself: title typed, experience
 * confirmed, skills landing as chips — the Orb docked in the document's corner, reacting to
 * every accepted fact (thinking while a field types, a success pulse as it confirms).
 *
 * The message this scene must land: "I provide facts once, and Sira builds the professional
 * profile." All copy is in the server HTML; the typing is an enhancement over real text
 * (the full values render immediately for reduced-motion/no-JS via the final stage).
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import BrandOrb from "../brand-orb/BrandOrb";
import type { OrbState } from "../brand-orb/orbStates";
import { LANDING_COPY } from "./copy";
import { useScene } from "./useScene";

/** Types `text` forward; renders complete immediately when `instant`. */
function Typed({ text, go, instant, onDone }: { text: string; go: boolean; instant: boolean; onDone?: () => void }) {
  const [n, setN] = useState(instant ? text.length : 0);
  useEffect(() => {
    if (!go) return;
    /* External-state branch (reduced motion resolved on the client) — the rule's carve-out. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (instant) { setN(text.length); onDone?.(); return; }
    let i = 0;
    const id = setInterval(() => {
      i++;
      setN(i);
      if (i >= text.length) { clearInterval(id); onDone?.(); }
    }, 34);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [go, instant]);
  return <>{text.slice(0, n)}{go && n < text.length && <span className="cine-caret" aria-hidden />}</>;
}

export default function HeroScene({ lang }: { lang: "ar" | "en" }) {
  const t = LANDING_COPY[lang].hero;
  const ar = lang === "ar";
  /* Stages: 1 title typed · 2 exp typed · 3+ chips land one by one · final = settled. */
  const chipCount = t.values.skills.length;
  const { ref, on, stage } = useScene<HTMLElement>([600, 1500, 1100, ...Array.from({ length: chipCount }, () => 420), 500]);
  const settled = stage >= chipCount + 4;
  const instant = on && stage >= chipCount + 4; // reduced-motion lands here immediately

  const orbState: OrbState =
    !on || stage === 0 ? "idle"
    : stage <= 2 ? "thinking"
    : settled ? "success"
    : "suggestion";

  return (
    <section ref={ref} className="cine-scene cine-hero" data-on={on ? "" : undefined} aria-labelledby="hero-h">
      <div className="cine-hero-grid">
        <div>
          <p className="cine-kicker cine-rise">{t.kicker}</p>
          <h1 id="hero-h" className="cine-h1 cine-rise">{t.h1}</h1>
          <p className="cine-sub cine-rise">{t.sub}</p>
          <div className="cine-rise" style={{ marginTop: 30 }}>
            <Link href={ar ? "/ar/builder" : "/builder"} className="cine-cta cine-cta--energy" style={{ fontSize: 16, padding: "14px 28px" }}>
              {t.cta}
            </Link>
          </div>
          <p className="cine-hint cine-rise">{t.hint}</p>
        </div>

        <div className="cine-doc" dir={ar ? "rtl" : "ltr"}>
          <div className="cine-doc-head">
            <span className="cine-doc-title">{t.docTitle}</span>
            {/* The intro's orb lands HERE — the assistant takes its seat inside the document. */}
            <div id="orb-dock" className="cine-doc-orbdock">
              <BrandOrb size={34} state={orbState} lang={lang} pulse={settled ? "success" : undefined} pulseKey={settled ? 1 : 0} />
            </div>
          </div>

          <div className="cine-field">
            <div className="cine-field-label">{t.fields.title}</div>
            <div className="cine-field-value">
              <Typed text={t.values.title} go={stage >= 1} instant={instant} />
              <span className="cine-check" data-on={stage >= 2 ? "" : undefined} aria-hidden>✓</span>
            </div>
          </div>

          <div className="cine-field">
            <div className="cine-field-label">{t.fields.exp}</div>
            <div className="cine-field-value">
              <Typed text={t.values.exp} go={stage >= 2} instant={instant} />
              <span className="cine-check" data-on={stage >= 3 ? "" : undefined} aria-hidden>✓</span>
            </div>
          </div>

          <div className="cine-field">
            <div className="cine-field-label">{t.fields.skills}</div>
            <div className="cine-chips">
              {t.values.skills.map((s, i) => (
                <span key={s} className="cine-chip" data-on={stage >= 4 + i || instant ? "" : undefined}>{s}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
