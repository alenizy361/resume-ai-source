"use client";

/**
 * The one question a broad job title earns.
 *
 * "معلم" is six jobs with six toolkits. "فني" is half a job. Generating suggestions from either
 * produces a confident blend the user cannot separate — radiology mixed with IT, primary teaching
 * mixed with university lecturing — and the failure is invisible to them because every line looks
 * plausible on its own.
 *
 * ── the rules this component follows ──
 *
 * ONE question. A form that asks twice before showing anything is a form people leave. `resolveOccupation`
 * decides whether to ask at all, and it asks about the title as a whole rather than field by field.
 *
 * It NEVER blocks. There is a dismiss, the answer is optional, and a title that resolves to nothing
 * shows no question at all. A clarification that gates the builder would turn a helpful prompt into
 * the screenshot bug with better manners — a step insisting on data the user has already supplied in
 * a form it does not recognise.
 *
 * It does NOT rewrite the CV headline. Answering stores `occupationId` and leaves `target.title`
 * exactly as typed. Those answer different questions: the title is what appears on the document, the
 * occupation is what the suggestion engine reasons about. Silently replacing someone's own words with
 * a dropdown label they touched once is the kind of edit nobody notices until it is printed.
 */

import { useMemo } from "react";
import { resolveOccupation } from "@/app/lib/occupations";
import { useBuilder } from "./BuilderProvider";

const C = {
  en: {
    other: "None of these — keep what I typed",
    resolved: "Suggestions will be tailored to",
    change: "Change",
  },
  ar: {
    other: "لا شيء منها — أبقِ ما كتبته",
    resolved: "ستُصاغ الاقتراحات على أساس",
    change: "تغيير",
  },
};

export default function OccupationClarify() {
  const { lang, state, dispatch, cv } = useBuilder();
  const c = C[lang];

  const res = useMemo(
    () => resolveOccupation(state.target.title, { cvLang: cv }),
    [state.target.title, cv],
  );

  /* Already answered — show what the engine is using, and a way to change it. Not a badge for its
     own sake: a user who picked "معلم رياضيات" needs to see that it stuck. */
  if (state.occupationId) {
    const chosen = res.clarification?.options.find((o) => o.occupationId === state.occupationId)
      ?? (res.occupationId === state.occupationId ? { occupationId: res.occupationId, display: res.display } : null);
    if (!chosen) return null;
    return (
      <p className="mt-2 text-xs" style={{ color: "var(--faint)" }}>
        {c.resolved} <strong style={{ color: "var(--muted)" }}>{chosen.display[cv]}</strong>
        {" · "}
        <button
          onClick={() => dispatch({ t: "occupation", id: "" })}
          className="underline"
          style={{ color: "var(--muted)" }}
        >
          {c.change}
        </button>
      </p>
    );
  }

  if (!res.clarificationRequired || !res.clarification) return null;

  return (
    <div
      className="mt-3 rounded-2xl p-4"
      style={{ background: "rgba(252,211,77,.07)", border: "1px solid rgba(252,211,77,.28)" }}
    >
      <p className="text-sm font-semibold" style={{ color: "#fcd34d" }}>
        {res.clarification.question[lang]}
      </p>

      <div className="bd-chips mt-3">
        {res.clarification.options.map((o) => (
          <button
            key={o.occupationId}
            className="bd-chip"
            onClick={() => dispatch({ t: "occupation", id: o.occupationId })}
          >
            {/* The option is displayed in the CV's language, not the interface's — these are
                occupation names the user will recognise from their own market. */}
            {o.display[cv]}
          </button>
        ))}
      </div>

      {/*
        The escape hatch, and it is not decoration. Some people genuinely are "a teacher" in a way none
        of seven options captures, and a question with no way past it is a gate. Dismissing keeps their
        title and simply leaves the engine working from the raw words, which is what it did before this
        component existed.
      */}
      <button
        onClick={() => dispatch({ t: "occupation", id: "none" })}
        className="mt-3 text-xs underline"
        style={{ color: "var(--faint)" }}
      >
        {c.other}
      </button>
    </div>
  );
}
