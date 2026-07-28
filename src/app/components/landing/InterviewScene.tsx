"use client";

/**
 * Scene 7 — the interview. The room gets quieter, the Orb gets larger, and IT is the
 * interviewer — no face, no avatar. One question, a real answer building, and an honest
 * evaluation: four checks pass, the RESULT is missing, and the STAR frame shows exactly
 * where the gap sits. The closing line carries the product's law: Sira never invents the
 * user's experience.
 */

import BrandOrb from "../brand-orb/BrandOrb";
import { LANDING_COPY } from "./copy";
import { useScene } from "./useScene";

export default function InterviewScene({ lang }: { lang: "ar" | "en" }) {
  const t = LANDING_COPY[lang].interview;
  /* Stages: 1 question asked · 2 answer arrives · 3..7 checks · 8 gap named + STAR focus. */
  const { ref, on, stage } = useScene<HTMLElement>([800, 1600, 500, 380, 380, 380, 380, 700]);

  const orbState =
    !on ? "idle"
    : stage < 1 ? "suggestion"
    : stage < 2 ? "listening"
    : stage < 7 ? "analyzing"
    : "warning";

  return (
    <section ref={ref} className="cine-scene--below cine-interview" data-on={on ? "" : undefined} aria-labelledby="int-h">
      <div className="cine-scene" style={{ paddingBlock: "clamp(84px, 12vh, 130px)" }}>
        <p className="cine-kicker cine-rise">{t.kicker}</p>
        <h2 id="int-h" className="cine-h2 cine-rise">{t.h2}</h2>

        <div className="cine-int-stage">
          <BrandOrb size={150} state={orbState} lang={lang} pulse={stage >= 8 ? "warning" : undefined} pulseKey={stage >= 8 ? 1 : 0} />
          <p className="cine-int-q cine-rise">{t.q}</p>
          <p className="cine-int-a" style={{ opacity: stage >= 2 ? 1 : 0.25, transition: "opacity 0.7s ease" }}>{t.a}</p>

          <div className="cine-int-checks" aria-label={lang === "ar" ? "تقييم الإجابة" : "Answer evaluation"}>
            {t.checks.map((c, i) => (
              <span key={c.l} className="cine-int-check" data-on={stage >= i + 3 ? "" : undefined} data-ok={c.ok ? "" : undefined} data-miss={!c.ok ? "" : undefined}>
                {c.ok ? "✓" : "!"} {c.l}
              </span>
            ))}
          </div>

          <p className="cine-int-gap" style={{ opacity: stage >= 8 ? 1 : 0, transition: "opacity 0.5s ease" }}>{t.gap}</p>

          <div className="cine-star" aria-hidden={stage < 8}>
            {t.star.map((s, i) => (
              <span key={s} data-hot={stage >= 8 && i === t.star.length - 1 ? "" : undefined}>{s}</span>
            ))}
          </div>

          <p className="cine-never" style={{ maxWidth: "52ch" }}>{t.note}</p>
        </div>
      </div>
    </section>
  );
}
