"use client";

/**
 * The whole product in eight beats — profile → master resume → paste a posting → tailor →
 * ATS score → export → track → interview prep — auto-advancing, clickable, no page reload.
 *
 * This replaces the static six-label rail, which named the journey without SHOWING it — the exact
 * "explains too much, demonstrates too little" complaint. Each beat renders a small mockup card
 * whose lines materialize with the same `t-stagger t-materialize` arrival the REAL builder uses
 * when AI suggestions land, so the landing page's "wow" and the product's "wow" are one animation,
 * not a marketing imitation of it.
 *
 * ── honesty rules ──
 *
 * Every beat demonstrates a capability that actually exists (`/builder`, `/optimize`'s tailoring
 * and scoring, `/api/export`, the account tracker, `/interview`), the example person/employer are
 * generic placeholders, and the panel is labeled as an example. The 42→91 numbers match
 * `AtsScoreReveal`, which already labels itself illustrative.
 *
 * ── motion rules ──
 *
 * Auto-advance is a plain interval — not scroll-linked, so it is outside the class of effect
 * `transitions.css` §9 removed after the iPhone crashes. It does not run under
 * `prefers-reduced-motion` (the stepper still works by tap), it resets on manual navigation so it
 * never fights the user, and it pauses while the tab is hidden.
 */

import { useEffect, useState } from "react";

interface Beat {
  title: string;
  body: string;
  lines: string[];
}

const BEATS: Record<"en" | "ar", Beat[]> = {
  en: [
    { title: "Career Profile", body: "Your target role, languages and licenses — the facts everything else reads from.", lines: ["Target: Accountant", "Riyadh · Arabic + English", "License: SOCPA"] },
    { title: "Master Resume", body: "One confirmed document. Every line is yours — nothing invented.", lines: ["General ledger · 5 years", "Bank reconciliation", "Confirmed ✓"] },
    { title: "Paste a Job Posting", body: "Drop in a real advert — Sira reads what the employer actually asked for.", lines: ["Senior Accountant — ABC Trading", "Requires IFRS · SAP · CMA", "14 keywords detected"] },
    { title: "AI Tailors the Resume", body: "A version matched to this posting. Your master resume stays untouched.", lines: ["SAP experience moved up", "IFRS coverage added", "Draft ready for review"] },
    { title: "ATS Score Improves", body: "Scored with the same rules applicant-tracking systems apply.", lines: ["Before: 42", "After: 91", "+49 points"] },
    { title: "Export", body: "PDF and Word — both parseable by every tracking system.", lines: ["resume-tailored.pdf", "resume-tailored.docx", "ATS-safe ✓"] },
    { title: "Track the Application", body: "Logged with the exact resume version you sent.", lines: ["ABC Trading — Senior Accountant", "Status: Applied", "Resume: tailored v2"] },
    { title: "Interview Preparation", body: "Questions built from the resume you actually sent.", lines: ["“Walk me through your IFRS work”", "“Describe a month-end close”", "6 questions ready"] },
  ],
  ar: [
    { title: "الملف المهني", body: "دورك المستهدف ولغاتك وتراخيصك — الحقائق التي يقرأ منها كل ما بعدها.", lines: ["الهدف: محاسب", "الرياض · عربي + إنجليزي", "الرخصة: SOCPA"] },
    { title: "السيرة الرئيسية", body: "مستند واحد مؤكد. كل سطر منك أنت — لا شيء مختلق.", lines: ["دفتر الأستاذ العام · ٥ سنوات", "تسوية الحسابات البنكية", "مؤكد ✓"] },
    { title: "الصق إعلاناً وظيفياً", body: "ألصق إعلاناً حقيقياً — سيرة تقرأ ما طلبه صاحب العمل فعلاً.", lines: ["محاسب أول — شركة ABC للتجارة", "يتطلب IFRS · SAP · CMA", "رُصدت ١٤ كلمة مفتاحية"] },
    { title: "الذكاء يخصص السيرة", body: "نسخة مطابقة لهذا الإعلان — وسيرتك الرئيسية تبقى كما هي.", lines: ["خبرة SAP تقدمت للأعلى", "أُضيفت تغطية IFRS", "المسودة جاهزة للمراجعة"] },
    { title: "نتيجة ATS ترتفع", body: "تُقيَّم بنفس القواعد التي تطبقها أنظمة تتبع المتقدمين.", lines: ["قبل: ٤٢", "بعد: ٩١", "+٤٩ نقطة"] },
    { title: "التصدير", body: "PDF و Word — كلاهما مقروء لدى كل أنظمة الفرز.", lines: ["resume-tailored.pdf", "resume-tailored.docx", "متوافق مع ATS ✓"] },
    { title: "تتبّع الطلب", body: "يُسجَّل مع نسخة السيرة التي أرسلتها بالضبط.", lines: ["شركة ABC — محاسب أول", "الحالة: قدّمت", "السيرة: النسخة المخصصة ٢"] },
    { title: "تحضير المقابلة", body: "أسئلة مبنية من السيرة التي أرسلتها فعلاً.", lines: ["«حدثني عن خبرتك في IFRS»", "«صف لي إقفالاً شهرياً أنجزته»", "٦ أسئلة جاهزة"] },
  ],
};

const T = {
  en: { step: (n: number, of: number) => `Step ${n} of ${of}`, tag: "Example", note: "Illustrative example — every step is a real product capability." },
  ar: { step: (n: number, of: number) => `الخطوة ${n} من ${of}`, tag: "مثال", note: "مثال توضيحي — وكل خطوة قدرة حقيقية في المنتج." },
};

export default function DemoWalkthrough({ lang, compact = false }: { lang: "ar" | "en"; compact?: boolean }) {
  const beats = BEATS[lang];
  const t = T[lang];
  const [active, setActive] = useState(0);
  /* Bumps on every manual tap; the effect below re-arms its interval when it changes, so the
     auto-advance always restarts its full delay from the user's own choice. */
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      if (document.hidden) return;
      setActive((a) => (a + 1) % beats.length);
    }, compact ? 2200 : 3600);
    return () => clearInterval(id);
  }, [beats.length, epoch, compact]);

  const beat = beats[active];

  /*
   * `compact` is the hero-side preview: the same eight-beat cycle, same data, same materialize
   * arrival, at a faster tempo and with the tab strip and step counter stripped out — a glance
   * beside the headline, not a second navigable demo. No second data source, no second timer
   * logic; only the JSX around it is thinner.
   */
  if (compact) {
    return (
      <div className="walk-card walk-card-compact" key={active}>
        <div className="walk-card-head">
          <span className="walk-tag">{t.tag} · {beat.title}</span>
          <span className="walk-dot" />
        </div>
        {/* No `t-stagger`/`t-materialize` here on purpose — see the note above the `compact`
            branch below: this exact per-line delayed-keyframe arrival, remounted every 2200ms
            beside the orb's own always-running glow/corona/ring animations, was found to paint
            blank on real mobile-viewport captures (verified in a real browser, not just built) —
            the elements were correct by every computed-style/layout check, just not painted. The
            card-level swap (tag, lines, progress dots all changing every 2.2s) is still a live,
            auto-cycling preview without it. */}
        <div className="walk-lines">
          {beat.lines.map((line) => <div key={line} className="walk-line">{line}</div>)}
        </div>
        <div className="walk-progress walk-progress-compact" aria-hidden>
          {beats.map((_, i) => <i key={i} className={i <= active ? "done" : ""} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="walk">
      <div className="walk-progress" aria-hidden>
        {beats.map((_, i) => <i key={i} className={i <= active ? "done" : ""} />)}
      </div>
      <div className="walk-nav" role="tablist">
        {beats.map((b, i) => (
          <button
            key={b.title}
            role="tab"
            aria-selected={i === active}
            className={`walk-tab${i === active ? " active" : ""}`}
            onClick={() => { setActive(i); setEpoch((e) => e + 1); }}
          >
            {i + 1}. {b.title}
          </button>
        ))}
      </div>
      {/* Keyed on the beat so every step change remounts the panel and the materialize
          arrival replays — the same replay-by-remount trick `t-pop` documents. */}
      <div className="walk-body" key={active}>
        <div>
          <div className="walk-step">{t.step(active + 1, beats.length)}</div>
          <h3 className="walk-title">{beat.title}</h3>
          <p className="walk-lede">{beat.body}</p>
        </div>
        <div className="walk-card">
          <div className="walk-card-head">
            <span className="walk-tag">{t.tag} · {beat.title}</span>
            <span className="walk-dot" />
          </div>
          <div className="t-stagger t-materialize walk-lines">
            {beat.lines.map((line) => <div key={line} className="walk-line">{line}</div>)}
          </div>
        </div>
      </div>
      <p className="walk-note">{t.note}</p>
    </div>
  );
}
