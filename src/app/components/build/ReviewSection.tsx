"use client";

/**
 * The review, before anything is downloaded.
 *
 * Everything here is computed locally by `lib/reviewChecks.ts` — no model call, no
 * network, no cost, no waiting. That is not an optimisation, it is the point: a
 * score that comes back from a model is a score that changes when the model has a
 * bad day, and one that arrives after a spinner is one the user cannot re-check
 * after each fix. These numbers recompute as they type.
 *
 * Two separations the shipped product got wrong, both structural here:
 *
 *  - Errors are not recommendations. A missing phone number and a weak verb were
 *    printed in the same list; only one of them loses the interview. Critical
 *    findings sit in their own block, above, in red, and the download section reads
 *    the same list.
 *  - The headline is named by the data. `review()` returns a quality report with no
 *    advert and a match report with one, so the label reads "CV Quality Score" or
 *    "Job Match Score" and can never claim a match against nothing.
 *
 * And the one thing this section deliberately cannot do: an advert requirement the
 * user has no evidence for appears under "Not supported by your CV" with no button
 * beside it. There is no "add anyway" because `reviewChecks` exports no function
 * that would write one — the same reason a suggestion cannot reach `profile`.
 */

import { useMemo, useState } from "react";
import { track } from "@vercel/analytics";
import ScoreRing from "../ScoreRing";
import { type BuilderState, type SectionId, hasUnconfirmed } from "@/app/lib/builderDoc";
import { type Dimension, type Finding, review } from "@/app/lib/reviewChecks";
import EnglishVersion from "./EnglishVersion";
import { localizeFinding, localizeDimension } from "@/app/lib/reviewMessages";

type Lang = "ar" | "en";

const C = {
  en: {
    quality: "CV Quality Score",
    match: "Job Match Score",
    qualitySub: "No job description added — this scores the CV itself.",
    matchSub: "Measured against the job description you pasted.",
    addJd: "Add a job description in the target section to get a match score instead.",
    fixFirst: "Fix these before downloading",
    better: "These would make it stronger",
    allClear: "Nothing critical. This CV is ready to download.",
    jump: "Go to section",
    breakdown: "How the score is made up",
    showWhy: "Show the breakdown",
    hideWhy: "Hide the breakdown",
    weight: "weight",
    supported: "Asked for, and on your CV",
    missing: "You have this — your CV does not show it",
    missingWhy: "Go back to the section and add it. The evidence is already yours.",
    unsupported: "Asked for, and not something you have told us you have",
    unsupportedWhy:
      "We will not add these. Claiming a requirement you cannot evidence is what loses the interview at the technical stage — and if you do hold one of them, add it in its own section so it is on your CV as a fact, not as a keyword.",
    pending: "You still have AI suggestions you have neither accepted nor dismissed. They are not on your CV, and they will not be.",
    recount: "Everything on this page recalculates as you edit. Nothing is stored.",
  },
  ar: {
    quality: "تقييم جودة السيرة",
    match: "تقييم المطابقة مع الوظيفة",
    qualitySub: "لم تُضف وصف الوظيفة — هذا تقييم للسيرة نفسها.",
    matchSub: "مقيس مقابل وصف الوظيفة الذي أضفته.",
    addJd: "أضف وصف الوظيفة في قسم الوظيفة المستهدفة لتحصل على تقييم مطابقة.",
    fixFirst: "أصلح هذه قبل التنزيل",
    better: "وهذه تجعلها أقوى",
    allClear: "لا يوجد خطأ حاسم. السيرة جاهزة للتنزيل.",
    jump: "اذهب للقسم",
    breakdown: "كيف تكوّن التقييم",
    showWhy: "اعرض التفصيل",
    hideWhy: "أخفِ التفصيل",
    weight: "الوزن",
    supported: "مطلوب، وموجود في سيرتك",
    missing: "تملكه — لكن سيرتك لا تُظهره",
    missingWhy: "ارجع للقسم وأضفه. الدليل عندك أصلاً.",
    unsupported: "مطلوب، ولم تخبرنا أنك تملكه",
    unsupportedWhy:
      "لن نضيفها. ادّعاء متطلب لا تستطيع إثباته هو ما يُسقطك في المقابلة الفنية — وإن كنت تملك أحدها فعلاً، أضفه في قسمه ليكون في سيرتك كحقيقة، لا ككلمة مفتاحية.",
    pending: "لا تزال هناك اقتراحات لم تقبلها ولم تستبعدها. ليست في سيرتك، ولن تكون.",
    recount: "كل ما في هذه الصفحة يُعاد حسابه وأنت تعدّل. لا شيء محفوظ.",
  },
};

/** Bands borrowed from the existing result screen so one number means one thing. */
function band(score: number): string {
  if (score >= 80) return "#34d399";
  if (score >= 60) return "#fbbf24";
  return "#f87171";
}

export default function ReviewSection({
  lang, state, referenceDate, onJump,
}: {
  lang: Lang;
  state: BuilderState;
  /** Passed in, never read from the clock: a score must not drift while nothing was edited. */
  referenceDate: string;
  onJump: (section: SectionId) => void;
}) {
  const c = C[lang];
  const [openWhy, setOpenWhy] = useState(false);

  /*
   * The findings follow the CV's language, not the interface's.
   *
   * The review is a statement about the DOCUMENT — "this bullet is too long", "this claim has no
   * evidence" — so it belongs in the language the document is written in. An Arabic-interface user
   * building an English CV wants English findings, because the lines being criticised are English.
   */
  const cv: "ar" | "en" = state.target.language === "ar" ? "ar" : "en";

  const report = useMemo(() => review(state, referenceDate), [state, referenceDate]);
  const critical = report.findings.filter((f) => f.severity === "critical");
  const advice = report.findings.filter((f) => f.severity !== "critical");
  // Narrowed to a variable rather than a boolean: `supported`/`missingFromCv`/
  // `unsupported` exist only on a match report, and the type is what guarantees the
  // three groups cannot be rendered against nothing.
  const match = report.kind === "match" ? report : null;

  return (
    <div>
      <div className="flex flex-col items-center gap-2">
        <ScoreRing
          value={report.score}
          color={band(report.score)}
          label={match ? c.match : c.quality}
          sub={match ? c.matchSub : c.qualitySub}
        />
        {!match && <p className="mt-1 text-center text-xs" style={{ color: "var(--faint)" }}>{c.addJd}</p>}
      </div>

      {/* ── errors: their own block, above everything ── */}
      <div className="mt-6">
        {critical.length > 0 ? (
          <>
            <div className="bd-label" style={{ color: "var(--danger)" }}>{c.fixFirst}</div>
            {critical.map((f) => <FindingRow key={f.id} f={f} tone="critical" jump={c.jump} onJump={onJump} cv={cv} />)}
          </>
        ) : (
          <p
            className="rounded-xl p-3 text-xs"
            style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.35)", color: "#6ee7b7" }}
          >
            {c.allClear}
          </p>
        )}
      </div>

      {advice.length > 0 && (
        <div className="mt-5">
          <div className="bd-label">{c.better}</div>
          {advice.map((f) => <FindingRow key={f.id} f={f} tone="advice" jump={c.jump} onJump={onJump} cv={cv} />)}
        </div>
      )}

      {hasUnconfirmed(state) && (
        <p className="mt-4 text-xs" style={{ color: "var(--faint)" }}>{c.pending}</p>
      )}

      {/* ── the three honest groups, only when there is an advert to compare against ── */}
      {match && (
        <div className="mt-6">
          <Group head={c.supported} tone="good" items={match.supported} empty />
          <Group head={c.missing} tone="warn" note={c.missingWhy} items={match.missingFromCv} />
          {/* No action beside these. Deliberately. */}
          <Group head={c.unsupported} tone="none" note={c.unsupportedWhy} items={match.unsupported} />
        </div>
      )}

      {/* ── why the number is the number ── */}
      <button
        onClick={() => { setOpenWhy((o) => !o); if (!openWhy) track("builder_score_breakdown", {}); }}
        className="mt-6 rounded-full px-3 text-xs font-semibold"
        style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
      >
        {openWhy ? c.hideWhy : c.showWhy}
      </button>
      {openWhy && (
        <div className="mt-3">
          <div className="bd-label">{c.breakdown}</div>
          {report.dimensions.map((d) => <DimensionRow key={d.id} d={d} weightLabel={c.weight} cv={cv} />)}
          <p className="mt-3 text-xs" style={{ color: "var(--faint)" }}>{c.recount}</p>
        </div>
      )}

      {/*
        Last on the page, deliberately.

        The English version is a thing you do to a FINISHED CV, so it sits after the score and the
        findings rather than competing with them. It renders nothing at all on an English CV — there is
        nothing to translate from — so it costs an English-authoring user no screen space.
      */}
      <EnglishVersion />
    </div>
  );
}

function FindingRow({
  f, tone, jump, onJump, cv,
}: {
  f: Finding; tone: "critical" | "advice"; jump: string; onJump: (s: SectionId) => void;
  /** The CV's language, not the interface's — the review is about the document. */
  cv: "ar" | "en";
}) {
  const red = tone === "critical";
  /*
   * Localized by ID, with the English the check produced as the fallback.
   *
   * The review was the one stage that switched language on an Arabic user — at the exact moment they
   * are deciding whether their CV is finished. The checks themselves are untouched: they are
   * deterministic, already covered by 91 assertions, and doubling their strings would double the
   * surface of the file whose correctness matters most.
   */
  const t = localizeFinding(f, cv);
  return (
    <div
      className="mt-2 rounded-xl p-3"
      style={{
        background: red ? "rgba(248,113,113,0.07)" : "var(--surface)",
        border: `1px solid ${red ? "rgba(248,113,113,0.35)" : "var(--line)"}`,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="text-xs font-bold" style={{ color: red ? "#fca5a5" : "var(--fg)" }}>{t.title}</div>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>{t.detail}</p>
          {f.fixHint && (
            <p className="mt-1 text-xs" style={{ color: "var(--faint)" }}>{f.fixHint}</p>
          )}
        </div>
        <button
          onClick={() => onJump(f.section as SectionId)}
          className="rounded-full px-2.5 text-[11px] font-semibold"
          style={{ minHeight: 32, border: "1px solid var(--line)", color: "var(--muted)", whiteSpace: "nowrap" }}
        >
          {jump}
        </button>
      </div>
    </div>
  );
}

/**
 * One weighted dimension, with the sentence that explains its score.
 *
 * `why` is required by the type, which is what stops this from being a row of bare
 * verdicts. "Specificity 40" tells the user nothing; "4 of 10 bullets name a number,
 * a system or a named tool" tells them what to do this afternoon.
 */
function DimensionRow({ d, weightLabel, cv }: { d: Dimension; weightLabel: string; cv: "ar" | "en" }) {
  return (
    <div className="mt-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold">{localizeDimension(d.id, d.label, cv)}</span>
        <span className="font-mono text-xs tabular-nums" style={{ color: band(d.score) }}>
          {Math.round(d.score)}
          <span style={{ color: "var(--faint)" }}> · {weightLabel} {Math.round(d.weight * 100)}%</span>
        </span>
      </div>
      <div className="mt-1 h-1 w-full rounded-full" style={{ background: "var(--line)" }}>
        <div
          className="h-1 rounded-full"
          style={{ width: `${Math.max(0, Math.min(100, d.score))}%`, background: band(d.score) }}
        />
      </div>
      <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{d.why}</p>
    </div>
  );
}

function Group({
  head, items, tone, note, empty,
}: {
  head: string; items: string[]; tone: "good" | "warn" | "none"; note?: string; empty?: boolean;
}) {
  if (!items.length && !empty) return null;
  const color = tone === "good" ? "#6ee7b7" : tone === "warn" ? "#fcd34d" : "var(--muted)";
  return (
    <div className="mt-4">
      <div className="bd-label" style={{ color }}>{head} ({items.length})</div>
      {items.length > 0 ? (
        <div className="bd-chips">
          {items.map((x) => (
            <span
              key={x}
              className="bd-chip"
              style={{ cursor: "default", ...(tone === "good" ? { borderColor: "rgba(52,211,153,0.4)", color: "#a7f3d0" } : {}) }}
            >
              {x}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs" style={{ color: "var(--faint)" }}>—</p>
      )}
      {note && items.length > 0 && (
        <p className="mt-2 text-xs" style={{ color: "var(--faint)" }}>{note}</p>
      )}
    </div>
  );
}
