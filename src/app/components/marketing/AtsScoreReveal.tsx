"use client";

/**
 * The score-ring count-up and bar fill. Plays once on mount — NOT gated behind an
 * `IntersectionObserver`, on purpose: `transitions.css` documents three real iPhone crashes traced
 * to scroll-driven reveals on this product, and removed every one of them. A number ticking up
 * before the visitor has scrolled to it costs nothing; a scroll listener watching for when they
 * arrive is the exact pattern that got removed. `prefers-reduced-motion` jumps straight to the
 * end values, matching every other animation in this product.
 *
 * The dimensions and their labels are the real ones `reviewChecks.ts` scores every CV on —
 * not made-up bar names — so this stays an honest illustration of what the review measures, not a
 * claim about a specific person's resume.
 */

import { useEffect, useRef, useState } from "react";

const DIMENSIONS: Array<{ key: string; before: number; after: number }> = [
  { key: "atsStructure", before: 54, after: 96 },
  { key: "evidence", before: 38, after: 87 },
  { key: "readability", before: 61, after: 92 },
  { key: "completeness", before: 47, after: 90 },
];

const T = {
  en: {
    atsStructure: "ATS-safe structure", evidence: "Evidence strength", readability: "Readability", completeness: "Completeness",
    label: "Illustrative example", scoreLabel: "ATS match",
  },
  ar: {
    atsStructure: "البنية المتوافقة مع الفرز", evidence: "قوة الأدلة", readability: "سهولة القراءة", completeness: "الاكتمال",
    label: "مثال توضيحي", scoreLabel: "التوافق مع الفرز",
  },
};

const CIRCUMFERENCE = 2 * Math.PI * 112;

export default function AtsScoreReveal({ lang, before = 42, after = 91 }: { lang: "ar" | "en"; before?: number; after?: number }) {
  const t = T[lang];
  const [n, setN] = useState(before);
  const [played, setPlayed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { setN(after); setPlayed(true); return; }
    if (played) return;
    setPlayed(true);
    const start = performance.now();
    const duration = 1400;
    function tick(now: number) {
      const p = Math.min(1, (now - start) / duration);
      setN(Math.round(before + (after - before) * p));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const offset = CIRCUMFERENCE - (CIRCUMFERENCE * n) / 100;

  return (
    <div ref={ref} className="ats-wrap">
      <div>
        <div className="score-ring">
          <svg width="260" height="260" viewBox="0 0 260 260">
            <circle cx="130" cy="130" r="112" fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="14" />
            <circle
              cx="130" cy="130" r="112" fill="none" stroke="url(#ats-g)" strokeWidth="14"
              strokeLinecap="round" strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={played ? offset : CIRCUMFERENCE - (CIRCUMFERENCE * before) / 100}
              style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%", transition: "stroke-dashoffset 1.4s cubic-bezier(.16,1,.3,1)" }}
            />
            <defs>
              <linearGradient id="ats-g" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#7c3aed" /><stop offset="100%" stopColor="#c4b5fd" />
              </linearGradient>
            </defs>
          </svg>
          <div className="score-num"><b>{n}</b><span>{t.scoreLabel}</span></div>
        </div>
        <p style={{ textAlign: "center", marginTop: 16, fontSize: 14, color: "var(--muted)", fontFamily: "var(--font-mono, monospace)", letterSpacing: ".04em", textTransform: "uppercase" }}>
          {t.label}
        </p>
      </div>
      <div className="ats-bars">
        {DIMENSIONS.map((d) => (
          <div key={d.key} className="ats-bar-row">
            <div className="lbl">{t[d.key as keyof typeof t]}</div>
            <div className="ats-bar-track">
              <div className="ats-bar-fill" style={{ width: played ? `${d.after}%` : `${d.before}%` }} />
            </div>
            <div className="pct">{played ? d.after : d.before}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}
