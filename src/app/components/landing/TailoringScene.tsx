"use client";

/**
 * Scene 3 — the job description arrives, the resume answers it, and the score explains
 * itself. The resume is never swapped wholesale: specific lines move up, gain emphasis,
 * quiet down, or enter — each change named in the "moves" list as it happens — and the
 * 61 → 83 → 91 meter steps ONLY as its reasons appear. Nothing unsupported is invented,
 * and the scene says so in plain text.
 */

import { useMemo } from "react";
import BrandOrb from "../brand-orb/BrandOrb";
import { LANDING_COPY } from "./copy";
import { useScene } from "./useScene";

const RESUME_LINES = {
  en: [
    { id: "ct", text: "CT imaging — 700+ studies, low-dose protocols", up: true },
    { id: "mri", text: "MRI imaging — routine and contrast studies" },
    { id: "pacs", text: "PACS administration and workflow", emph: true },
    { id: "xr", text: "General radiography", quiet: true },
    { id: "scfhs", text: "SCFHS registration — active", added: true },
  ],
  ar: [
    { id: "ct", text: "الأشعة المقطعية — أكثر من ٧٠٠ فحص وبروتوكولات جرعة منخفضة", up: true },
    { id: "mri", text: "الرنين المغناطيسي — فحوصات روتينية وبالصبغة" },
    { id: "pacs", text: "إدارة نظام PACS وسير العمل", emph: true },
    { id: "xr", text: "الأشعة العامة", quiet: true },
    { id: "scfhs", text: "تسجيل هيئة التخصصات الصحية — ساري", added: true },
  ],
};

export default function TailoringScene({ lang }: { lang: "ar" | "en" }) {
  const t = LANDING_COPY[lang].tailor;
  const ar = lang === "ar";
  /* Stages: 1 JD read (keywords light) · 2..5 the four moves · 6 settle. Score follows moves. */
  const { ref, on, stage } = useScene<HTMLElement>([900, 1000, 900, 900, 900, 600]);
  const score = stage >= 5 ? 91 : stage >= 3 ? 83 : stage >= 2 ? 71 : 61;

  const lines = useMemo(() => {
    const base = RESUME_LINES[lang];
    /* The reorder IS the story: past stage 1, CT leads. Rendered as a reordered list whose
       lines share stable keys, so the browser transitions each row's transform. */
    if (stage >= 2) return [...base].sort((a, b) => (b.up ? 1 : 0) - (a.up ? 1 : 0));
    return base;
  }, [lang, stage]);

  return (
    <section id="product" ref={ref} className="cine-scene cine-scene--below" data-on={on ? "" : undefined} aria-labelledby="tailor-h">
      <p className="cine-kicker cine-rise">{t.kicker}</p>
      <h2 id="tailor-h" className="cine-h2 cine-rise">{t.h2}</h2>

      <div className="cine-tailor-grid">
        <div className="cine-panel">
          <div className="flex items-center justify-between">
            <span className="cine-panel-title">{t.resumeTitle}</span>
            <BrandOrb size={30} state={!on ? "idle" : stage < 2 ? "analyzing" : stage < 5 ? "thinking" : "success"} lang={lang} pulse={stage >= 5 ? "success" : undefined} pulseKey={stage >= 5 ? 1 : 0} />
          </div>
          <div style={{ marginTop: 12 }}>
            {lines.map((l) => (
              <div
                key={l.id}
                className="cine-resume-line"
                data-up={stage >= 2 && l.up ? "" : undefined}
                data-quiet={stage >= 2 && l.quiet ? "" : undefined}
                data-new={stage >= 4 && l.added ? "" : undefined}
                style={stage < 4 && l.added ? { opacity: 0, transform: "translateY(6px)" } : undefined}
              >
                {l.text}
              </div>
            ))}
          </div>

          <div className="cine-match">
            <span className="cine-match-num" aria-live="polite">{score}%</span>
            <div className="cine-match-bar"><i className="cine-match-fill" style={{ width: `${score}%` }} /></div>
            <span style={{ fontSize: 14, color: "var(--cine-dim)", fontWeight: 700 }}>{t.match}</span>
          </div>

          {/* WHY the number moved — one reason per step, appearing with its step. */}
          <div style={{ marginTop: 14 }}>
            {t.moves.map((m, i) => (
              <p key={m} className="cine-move" data-on={stage >= i + 2 ? "" : undefined}>{m}</p>
            ))}
          </div>
          <p className="cine-never">{t.never}</p>
        </div>

        <div className="cine-panel cine-jd">
          <span className="cine-panel-title">{t.jdTitle}</span>
          <div style={{ marginTop: 12 }}>
            {t.jd.map((l, i) => (
              <p key={l.text} className="cine-jd-line" data-hot={stage >= 1 && l.k ? "" : undefined}>
                {l.k ? <mark>{l.text}</mark> : l.text}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
