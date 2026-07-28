"use client";

/**
 * Scene 6 — Mission Control. The Career Profile is the identity at the center; the Master
 * Resume and three live opportunities connect to it, each with a status a user can act on.
 * Clarity outranks the metaphor: what is active, what needs attention, and the next action
 * are readable at a glance. The examples are the realistic set the story promises — three
 * applications, one interview tomorrow, follow-ups, a tailoring need, one ATS gap.
 */

import Link from "next/link";
import BrandOrb from "../brand-orb/BrandOrb";
import { LANDING_COPY } from "./copy";
import { useScene } from "./useScene";

export default function MissionControlScene({ lang }: { lang: "ar" | "en" }) {
  const t = LANDING_COPY[lang].mission;
  const ar = lang === "ar";
  const { ref, on, stage } = useScene<HTMLElement>([400, 400, 400, 500]);

  return (
    <section ref={ref} className="cine-scene cine-scene--below" data-on={on ? "" : undefined} aria-labelledby="mc-h">
      <p className="cine-kicker cine-rise">{t.kicker}</p>
      <h2 id="mc-h" className="cine-h2 cine-rise">{t.h2}</h2>

      <div className="cine-mc">
        <div className="cine-mc-core cine-rise">
          <div style={{ display: "grid", placeItems: "center" }}>
            <BrandOrb size={72} state={stage >= 4 ? "warning" : "idle"} lang={lang} pulse={stage >= 4 ? "warning" : undefined} pulseKey={stage} />
          </div>
          <div className="cine-mc-core-t">{t.identity}</div>
          <div className="cine-mc-core-s">{t.master}</div>
          <div className="cine-mc-stats">
            {t.stats.map((s) => (
              <div key={s.l} className="cine-mc-stat"><b>{s.n}</b><span>{s.l}</span></div>
            ))}
          </div>
        </div>

        <div className="cine-mc-jobs">
          {t.jobs.map((j, i) => (
            <div key={j.role} className="cine-mc-job" data-on={stage >= i + 1 ? "" : undefined}>
              <div>
                <div className="cine-mc-job-role">{j.role}</div>
                <div className="cine-mc-job-org">{j.org}</div>
              </div>
              <span className="cine-mc-status" data-tone={j.tone}>{j.status}</span>
            </div>
          ))}
          <div className="cine-mc-alert cine-mc-job" data-on={stage >= 4 ? "" : undefined} role="note">
            <span aria-hidden>!</span>
            <span>{t.alert}</span>
          </div>
          <div style={{ marginTop: 6 }}>
            <Link href={ar ? "/ar/account" : "/account"} style={{ fontSize: 15, fontWeight: 700, color: "var(--cine-mut)", textDecoration: "underline", textUnderlineOffset: 4 }}>
              {t.cta}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
