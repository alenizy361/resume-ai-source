"use client";

/**
 * The finale — the Orb returns to the center, awake, and the story closes on the promise
 * it opened with: everything starts from what the user already knows. One statement, one
 * instruction, one CTA.
 */

import Link from "next/link";
import BrandOrb from "../brand-orb/BrandOrb";
import { LANDING_COPY } from "./copy";
import { useScene } from "./useScene";

export default function FinalScene({ lang }: { lang: "ar" | "en" }) {
  const t = LANDING_COPY[lang].final;
  const ar = lang === "ar";
  const { ref, on, stage } = useScene<HTMLElement>([700]);

  return (
    <section ref={ref} className="cine-scene cine-scene--below cine-final" data-on={on ? "" : undefined} aria-labelledby="final-h">
      <BrandOrb size={140} state={on ? "awakening" : "sleeping"} lang={lang} pulse={stage >= 1 ? "success" : undefined} pulseKey={stage} />
      <h2 id="final-h" className="cine-final-s1 cine-rise">{t.s1}</h2>
      <p className="cine-final-s2 cine-rise">{t.s2}</p>
      <div className="cine-rise">
        <Link href={ar ? "/ar/builder" : "/builder"} className="cine-cta cine-cta--energy" style={{ fontSize: 17, padding: "15px 32px" }}>
          {t.cta}
        </Link>
      </div>
    </section>
  );
}
