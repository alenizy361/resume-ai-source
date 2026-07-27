"use client";

/**
 * Phase 2 of the cinematic brief: the hero's live preview is no longer a generic cycling card —
 * it is ONE continuous four-step story, the same shape the brief describes as "the hero transforms
 * into the product" plus "job description → tailoring → ATS score, with reasons": a Career Profile
 * fills in, a job posting arrives, the resume visibly tailors to it, and the match score rises WITH
 * the reason for each rise shown, not just the number. `HeroExperience.tsx` owns the step timer and
 * feeds the same `step` into both this card and the orb's `orbState` — this is the first real
 * caller of `OrbCore`'s state machine (idle while reading, analyzing while the posting is parsed,
 * thinking while tailoring, success when the score lands), built in the prior pass but unused until
 * now.
 *
 * The example (Radiology Technologist, CT/MRI/PACS, a City Medical Center posting) is the exact one
 * the brief itself specified — reused rather than invented, and distinct from the Accountant example
 * the rest of the landing page already uses, so the two don't read as copy-pasted.
 *
 * Same non-negotiables as every other reveal in this codebase: no scroll-linked animation (a plain
 * `setInterval`, off under `prefers-reduced-motion`, paused while the tab is hidden — see
 * `DemoWalkthrough.tsx` for the identical, already-proven pattern), no `t-materialize` on this
 * specific card (F-41 found that exact animation painting blank on a real mobile viewport in this
 * hero position, next to the orb's own always-animating layers — these lines render as plain,
 * unanimated content for the same reason), no `filter: blur()` anywhere.
 */

import { useEffect, useState } from "react";

export type SceneStep = 0 | 1 | 2 | 3;

interface Beat {
  tag: string;
  rows: [string, string][];
  scorePct?: number;
  scoreReason?: string;
}

const T: Record<"en" | "ar", { beats: Beat[]; scoreLabel: string }> = {
  en: {
    beats: [
      {
        tag: "Career Profile",
        rows: [["Job Title", "Radiology Technologist"], ["Experience", "4 Years"], ["Skills", "CT · MRI · PACS"]],
      },
      {
        tag: "Job Posting",
        rows: [["Role", "Senior Radiology Technologist"], ["Employer", "City Medical Center"], ["Requires", "CT · MRI · PACS · Patient care"]],
      },
      {
        tag: "Tailoring",
        rows: [["CT protocol experience", "moved up"], ["PACS workflow", "added to summary"], ["Draft", "ready for review"]],
      },
      {
        tag: "ATS Match",
        rows: [],
        scorePct: 91,
        scoreReason: "+22 for CT · MRI · PACS keywords, +8 for reordered experience",
      },
    ],
    scoreLabel: "ATS match",
  },
  ar: {
    beats: [
      {
        tag: "الملف المهني",
        rows: [["المسمى الوظيفي", "أخصائي أشعة"], ["الخبرة", "٤ سنوات"], ["المهارات", "CT · MRI · PACS"]],
      },
      {
        tag: "الإعلان الوظيفي",
        rows: [["الدور", "أخصائي أشعة أول"], ["الجهة", "مركز المدينة الطبي"], ["يتطلب", "CT · MRI · PACS · رعاية المرضى"]],
      },
      {
        tag: "التخصيص",
        rows: [["خبرة بروتوكول CT", "انتقلت للأعلى"], ["سير عمل PACS", "أُضيف للملخص"], ["المسودة", "جاهزة للمراجعة"]],
      },
      {
        tag: "التوافق مع ATS",
        rows: [],
        scorePct: 91,
        scoreReason: "+٢٢ لكلمات CT · MRI · PACS، +٨ لإعادة ترتيب الخبرة",
      },
    ],
    scoreLabel: "التوافق مع ATS",
  },
};

const SCORE_STAGES = [61, 83, 91];

export function stepToOrbState(step: SceneStep): "idle" | "analyzing" | "thinking" | "success" {
  return step === 1 ? "analyzing" : step === 2 ? "thinking" : step === 3 ? "success" : "idle";
}

export default function CareerProfileScene({ lang, step }: { lang: "ar" | "en"; step: SceneStep }) {
  const t = T[lang];
  const beat = t.beats[step];
  const [scoreN, setScoreN] = useState(SCORE_STAGES[0]);

  useEffect(() => {
    if (step !== 3) { setScoreN(SCORE_STAGES[0]); return; }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { setScoreN(SCORE_STAGES[SCORE_STAGES.length - 1]); return; }
    let i = 0;
    setScoreN(SCORE_STAGES[0]);
    const id = setInterval(() => {
      i += 1;
      if (i >= SCORE_STAGES.length) { clearInterval(id); return; }
      setScoreN(SCORE_STAGES[i]);
    }, 550);
    return () => clearInterval(id);
  }, [step]);

  return (
    <div className="walk-card walk-card-compact" key={step}>
      <div className="walk-card-head">
        <span className="walk-tag">Example · {beat.tag}</span>
        <span className="walk-dot" />
      </div>
      {step === 3 ? (
        <div className="scene-score">
          <div className="scene-score-num">{scoreN}<span>%</span></div>
          <div className="scene-score-track"><div className="scene-score-fill" style={{ width: `${scoreN}%` }} /></div>
          <p className="scene-score-why">{beat.scoreReason}</p>
        </div>
      ) : (
        <div className="walk-lines">
          {beat.rows.map(([k, v]) => (
            <div key={k} className="walk-line scene-row">
              <span className="scene-row-k">{k}</span>
              <span className="scene-row-v">{v}</span>
            </div>
          ))}
        </div>
      )}
      <div className="walk-progress walk-progress-compact" aria-hidden>
        {t.beats.map((_, i) => <i key={i} className={i <= step ? "done" : ""} />)}
      </div>
    </div>
  );
}
