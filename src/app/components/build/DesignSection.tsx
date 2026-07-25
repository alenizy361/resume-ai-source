"use client";

/**
 * Design and download — the last section, and the only one that produces a file.
 *
 * Content first, design last, for a reason that is not taste: a template picked
 * against an empty CV is picked blind, and the one decision that actually matters
 * here (does this fit on two pages?) cannot be seen until the content exists.
 *
 * Nothing about exporting is reimplemented. `PdfExport`, `DocxExport`, `PublishLink`
 * and `ResumeTemplate`'s designed-PDF path are the shipped, paid-for, tested export
 * surface, and they all take flat resume text — which is exactly what
 * `assembleResume(profile)` produces. So the builder hands them the same string the
 * chat door hands them, and the paywall, the watermark and the Arabic behaviour stay
 * identical to production by construction rather than by re-derivation.
 *
 * Two honesty duties this section carries:
 *
 *  - The Arabic wall is named where it is hit. jsPDF cannot shape Arabic script, so
 *    an Arabic CV is offered Word (ATS-parseable) and the designed PDF (rasterised,
 *    shaped correctly) — and the plain PDF is not dangled in front of someone whose
 *    download would arrive as mojibake.
 *  - Critical review findings are repeated here, not swallowed. Download is still
 *    allowed: it is the user's CV, and a product that holds a file hostage over a
 *    missing LinkedIn URL has mistaken itself for the employer.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { track } from "@vercel/analytics";
import ResumeTemplate from "../ResumeTemplate";
import PdfExport from "../PdfExport";
import DocxExport from "../DocxExport";
import PublishLink from "../PublishLink";
import { TEMPLATE_CATALOG } from "@/app/lib/templateCatalog";
import { type BuilderState, type SectionId } from "@/app/lib/builderDoc";
import { review } from "@/app/lib/reviewChecks";

type Lang = "ar" | "en";

/** The three the product recommends, in order. `ats-pro` is already `best` in the catalogue. */
const RECOMMENDED = ["ats-pro", "azure", "executive"];

const C = {
  en: {
    pick: "Template",
    pickSub: "All of them are single-column with standard headings — the only structure every ATS parses reliably. The difference is typography.",
    best: "Recommended",
    showAll: "Show all templates", showLess: "Show fewer",
    downloads: "Download",
    ats: "For applying — ATS-readable",
    designed: "For sending to a person — designed",
    pdf: "↓ PDF", word: "↓ Word (.docx)",
    arabicPdf: "The plain PDF cannot shape Arabic script — an Arabic CV downloads as Word (which every ATS reads) or as the designed PDF below (which renders Arabic correctly).",
    mark: "Free downloads carry a small cv.rabit.sa mark.",
    unlock: "Remove it",
    stillWrong: (n: number) => `${n} thing${n === 1 ? "" : "s"} still needs fixing before this is ready to send.`,
    goFix: "Go and fix it",
    anyway: "You can still download — it is your CV.",
    empty: "There is nothing to download yet. Fill in the sections above.",
    share: "Share",
    cover: "Cover letter",
    coverSub: "Written from this CV and the job description you added.",
    coverNeedJd: "Add the job description in the target section first — a cover letter with no advert to answer is a form letter.",
    coverGo: "Write the cover letter",
    coverBusy: "Writing…",
    coverPaywall: "Cover letters are part of the paid pass.",
    coverErr: "Could not write the cover letter — try again.",
    copy: "Copy", copied: "Copied",
    prep: "Interview preparation",
    prepSub: "Likely questions for this role, and how to answer them from your own CV.",
    prepGo: "Open interview prep",
  },
  ar: {
    pick: "القالب",
    pickSub: "كلها بعمود واحد وعناوين قياسية — البنية الوحيدة التي تقرأها كل أنظمة التتبّع بثقة. الفرق في الخطوط فقط.",
    best: "موصى به",
    showAll: "اعرض كل القوالب", showLess: "اعرض أقل",
    downloads: "التنزيل",
    ats: "للتقديم — مقروء من أنظمة التتبّع",
    designed: "للإرسال لشخص — مصمّم",
    pdf: "↓ PDF", word: "↓ Word (.docx)",
    arabicPdf: "الـ PDF النصي لا يستطيع تشكيل الحرف العربي — السيرة العربية تُنزّل كـ Word (وكل أنظمة التتبّع تقرأه) أو كـ PDF المصمّم أدناه (ويُظهر العربية صحيحة).",
    mark: "التنزيل المجاني يحمل علامة صغيرة cv.rabit.sa.",
    unlock: "أزلها",
    stillWrong: (n: number) => `لا يزال ${n} أمراً يحتاج إصلاحاً قبل أن تكون جاهزة للإرسال.`,
    goFix: "اذهب وأصلحه",
    anyway: "وتستطيع التنزيل على أي حال — هي سيرتك.",
    empty: "لا يوجد ما يُنزّل بعد. اكمل الأقسام أعلاه.",
    share: "المشاركة",
    cover: "خطاب التقديم",
    coverSub: "يُكتب من هذه السيرة ومن وصف الوظيفة الذي أضفته.",
    coverNeedJd: "أضف وصف الوظيفة في قسم الوظيفة المستهدفة أولاً — خطاب بلا إعلان يجيبه هو خطاب عام.",
    coverGo: "اكتب خطاب التقديم",
    coverBusy: "يكتب…",
    coverPaywall: "خطابات التقديم جزء من الاشتراك المدفوع.",
    coverErr: "تعذّر كتابة الخطاب — جرّب ثانية.",
    copy: "نسخ", copied: "نُسخ",
    prep: "التحضير للمقابلة",
    prepSub: "الأسئلة المتوقعة لهذا الدور، وكيف تجيبها من سيرتك نفسها.",
    prepGo: "افتح التحضير للمقابلة",
  },
};

export default function DesignSection({
  lang, state, cv, referenceDate, onTemplate, onJump,
}: {
  lang: Lang;
  state: BuilderState;
  /** The assembled resume text — the same string every export path already takes. */
  cv: string;
  referenceDate: string;
  onTemplate: (slug: string) => void;
  onJump: (section: SectionId) => void;
}) {
  const c = C[lang];
  const ar = lang === "ar";
  const arabicCv = state.target.language === "ar";

  const [showAll, setShowAll] = useState(false);
  /** Watermark policy is the server's, not ours — `hasAccess` is the one flag. */
  const [paid, setPaid] = useState<boolean | null>(null);
  const [cover, setCover] = useState("");
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverErr, setCoverErr] = useState("");
  const [coverPaywall, setCoverPaywall] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => { if (live) setPaid(Boolean(d?.hasAccess)); })
      // A failed check must not hand out unwatermarked files: unknown means free.
      .catch(() => { if (live) setPaid(false); });
    return () => { live = false; };
  }, []);

  const critical = useMemo(
    () => review(state, referenceDate).findings.filter((f) => f.severity === "critical"),
    [state, referenceDate],
  );

  const tpl = TEMPLATE_CATALOG.find((x) => x.slug === state.template) ?? TEMPLATE_CATALOG[0];
  const shown = showAll ? TEMPLATE_CATALOG : TEMPLATE_CATALOG.filter((x) => RECOMMENDED.includes(x.slug));
  const watermark = paid !== true;

  async function writeCover() {
    setCoverBusy(true); setCoverErr(""); setCoverPaywall(false);
    try {
      const res = await fetch("/api/cover-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume: cv, jobDescription: state.target.jobAdText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 402 || data?.paywall) { setCoverPaywall(true); return; }
        throw new Error("failed");
      }
      setCover(String(data?.coverLetter || ""));
      track("builder_cover_letter", {});
    } catch { setCoverErr(c.coverErr); } finally { setCoverBusy(false); }
  }

  if (!cv.trim()) {
    return <p className="text-xs" style={{ color: "var(--faint)" }}>{c.empty}</p>;
  }

  return (
    <div>
      {/* ── what still needs fixing, repeated where the file is produced ── */}
      {critical.length > 0 && (
        <div
          className="mb-5 rounded-xl p-3"
          style={{ background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.35)" }}
        >
          <p className="text-xs font-bold" style={{ color: "#fca5a5" }}>{c.stillWrong(critical.length)}</p>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{c.anyway}</p>
          <button
            onClick={() => onJump("review")}
            className="mt-2 rounded-full px-3 text-xs font-semibold"
            style={{ border: "1px solid rgba(248,113,113,0.4)", color: "#fca5a5" }}
          >
            {c.goFix}
          </button>
        </div>
      )}

      {/* ── template ── */}
      <div className="bd-label">{c.pick}</div>
      <p className="mb-2 text-xs" style={{ color: "var(--faint)" }}>{c.pickSub}</p>
      <div className="bd-chips">
        {shown.map((x) => (
          <button
            key={x.slug}
            className={`bd-chip${x.slug === state.template ? " on" : ""}`}
            onClick={() => { onTemplate(x.slug); track("builder_template_picked", { slug: x.slug }); }}
          >
            <span
              aria-hidden
              style={{ width: 10, height: 10, borderRadius: 999, background: x.accent, display: "inline-block" }}
            />
            {ar ? x.nameAr : x.name}
            {x.best && <span style={{ color: "#6ee7b7", fontSize: 10, fontWeight: 700 }}>· {c.best}</span>}
          </button>
        ))}
      </div>
      <button
        onClick={() => setShowAll((s) => !s)}
        className="mt-2 rounded-full px-3 text-xs"
        style={{ border: "1px solid var(--line)", color: "var(--faint)" }}
      >
        {showAll ? c.showLess : c.showAll}
      </button>

      {/* ── the ATS downloads ── */}
      <div className="mt-6">
        <div className="bd-label">{c.downloads}</div>
        <p className="mb-2 text-xs" style={{ color: "var(--faint)" }}>{c.ats}</p>
        <div className="flex flex-wrap items-center gap-2">
          {/* Arabic is offered Word rather than a PDF that would arrive as mojibake. */}
          {!arabicCv && (
            <PdfExport text={cv} watermark={watermark} lang={lang} label={c.pdf} />
          )}
          <DocxExport
            text={cv} watermark={watermark} lang={lang} label={c.word}
            filename={arabicCv ? "resume-ar.docx" : "resume.docx"}
          />
        </div>
        {arabicCv && <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>{c.arabicPdf}</p>}
        {watermark && (
          <p className="mt-2 text-xs" style={{ color: "var(--faint)" }}>
            {c.mark}{" "}
            <Link href={ar ? "/ar/pricing" : "/pricing"} style={{ color: "var(--accent)", fontWeight: 600 }}>
              {c.unlock}
            </Link>
          </p>
        )}
      </div>

      {/* ── the designed page: its own toolbar carries the rasterised PDF ── */}
      <div className="mt-6">
        <p className="mb-2 text-xs" style={{ color: "var(--faint)" }}>{c.designed}</p>
        <ResumeTemplate
          text={cv}
          name={state.profile.name || "resume"}
          variant={tpl.variant}
          accent={tpl.accent}
          dir={arabicCv ? "rtl" : "ltr"}
          fitWidth
        />
      </div>

      {/* ── share ── */}
      <div className="mt-6">
        <div className="bd-label">{c.share}</div>
        <PublishLink ar={ar} text={cv} name={state.profile.name} role={state.profile.role} />
      </div>

      {/* ── cover letter ── */}
      <div className="mt-6">
        <div className="bd-label">{c.cover}</div>
        <p className="mb-2 text-xs" style={{ color: "var(--faint)" }}>{c.coverSub}</p>
        {!state.target.jobAdText.trim() ? (
          <p className="text-xs" style={{ color: "var(--muted)" }}>{c.coverNeedJd}</p>
        ) : (
          <button
            onClick={writeCover} disabled={coverBusy}
            className="btn-ghost rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
          >
            {coverBusy ? c.coverBusy : c.coverGo}
          </button>
        )}
        {coverPaywall && (
          <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
            {c.coverPaywall}{" "}
            <Link href={ar ? "/ar/pricing" : "/pricing"} style={{ color: "var(--accent)", fontWeight: 600 }}>
              {c.unlock}
            </Link>
          </p>
        )}
        {coverErr && <p className="mt-2 text-xs" style={{ color: "#fca5a5" }}>{coverErr}</p>}
        {cover && (
          <div className="mt-3">
            <textarea
              className="bd-textarea" style={{ minHeight: 220 }} value={cover}
              onChange={(e) => setCover(e.target.value)}
            />
            <button
              onClick={() => {
                navigator.clipboard?.writeText(cover);
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              }}
              className="mt-2 rounded-full px-3 text-xs font-semibold"
              style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
            >
              {copied ? c.copied : c.copy}
            </button>
          </div>
        )}
      </div>

      {/* ── interview prep: an existing page, linked rather than rebuilt ── */}
      <div className="mt-6">
        <div className="bd-label">{c.prep}</div>
        <p className="mb-2 text-xs" style={{ color: "var(--faint)" }}>{c.prepSub}</p>
        <Link
          href={ar ? "/ar/interview" : "/interview"}
          onClick={() => track("builder_interview_prep", {})}
          className="btn-ghost inline-flex items-center rounded-xl px-4 text-sm font-semibold"
        >
          {c.prepGo}
        </Link>
      </div>
    </div>
  );
}
