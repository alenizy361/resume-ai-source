"use client";

/**
 * The builder's ONE progress indicator, and the only way to reach another step.
 *
 * ── what it replaces ──
 *
 * Four representations of the same fact were on screen at once:
 *
 *   1. `bd-rail` — eleven segments in the header, filled / amber / empty.
 *   2. `bd-nav`  — the full step list with all eleven names. A column on a desktop and,
 *                  on a phone, a horizontal scroller: eleven labels laid end to end in a
 *                  390px viewport, so the user saw about three of them and had to swipe
 *                  sideways *inside the page* to see the rest. That is the second scroll
 *                  system the brief asks to remove, and the reason the step names appeared
 *                  to run off the screen.
 *   3. `bd-step-count` — "Step 4 of 11", in the form column.
 *   4. `bd-num`  — the step's index again, in a circle, in the step heading.
 *
 * Four answers to "where am I", none of which agreed about how much space it deserved.
 * This is one: the number, the name, a thin bar, and a button that opens the list when the
 * user actually wants it.
 *
 * ── why a sheet and not an always-visible list ──
 *
 * Jumping between steps is rare and orientation is constant. An always-visible list pays
 * the cost of the rare action on every screen — on a phone it cost a sideways scroller, on
 * a desktop a 208px column beside a form that wanted the width. Behind a button, the list
 * is one tap away and costs nothing until it is asked for.
 *
 * The sheet is `position: fixed` at `--z-menu`, above the action bar and below dialogs, and
 * it closes on Escape, on a tap outside, and on choosing a step. It is only rendered when
 * open — a closed sheet holding eleven links is eleven links a screen reader still walks
 * through.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { type SectionId } from "@/app/lib/builderDoc";
import { stepMark } from "@/app/lib/stepReady";
import { toArabicDigits } from "@/app/lib/plans";
import { STEPS, SECTION_COPY, stepHref } from "./steps";
import type { BuilderState } from "@/app/lib/builderDoc";

const T = {
  en: { steps: "All steps", close: "Close", of: (i: number, n: number) => `${i} / ${n}` },
  ar: { steps: "كل الخطوات", close: "إغلاق", of: (i: number, n: number) => `${toArabicDigits(i)} / ${toArabicDigits(n)}` },
};

export default function StepBar({
  lang, step, state, resumeId,
}: {
  lang: "ar" | "en";
  step: SectionId;
  state: BuilderState;
  resumeId: string;
}) {
  const t = T[lang];
  const ar = lang === "ar";
  const copy = SECTION_COPY[lang];
  const [open, setOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  const n = STEPS.length;
  /*
   * Progress is measured in steps whose data VALIDATES, not steps that were visited.
   * `stepMark` is the same validator the sheet's ticks use, so the bar and the list can
   * never disagree — which is exactly what the old rail and the old nav managed to do.
   */
  const done = STEPS.filter((s) => stepMark(s, state, step) === "done").length;
  const pct = Math.round((done / n) * 100);

  /*
   * ── the number and the bar have to measure the SAME thing ──
   *
   * This read `stepIndex(step) + 1` — the current POSITION — while the bar beside it filled to
   * `done / n`, the count of steps whose data validates. A screenshot from a real phone caught the
   * consequence: "٦ / ١١" printed against a bar filled to 91%, because the user had visited ten
   * steps and walked back to the sixth. Both numbers were true. Together they read as a fault in the
   * product.
   *
   * The fraction is the one that gives way, because it is the redundant one: the step NAME sits
   * between them and already answers "where am I". So the number now answers "how much is finished",
   * which is what the bar was answering all along, and the two can no longer disagree.
   *
   * Keeping the bar on validated steps rather than switching both to position is deliberate — a bar
   * that advances for a step you walked through without filling in is the reason the old rail could
   * report 60% on a resume with no job title.
   */

  /* Escape closes it. A sheet that can only be dismissed by tapping a small × is a trap
     on a phone and unreachable by keyboard. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  /* Move focus into the sheet when it opens, so a keyboard user is not left behind. */
  useEffect(() => { if (open) sheetRef.current?.focus(); }, [open]);

  return (
    <>
      <div className="bd-stepbar">
        <span className="bd-stepbar-num" aria-hidden>{t.of(done, n)}</span>
        <div className="bd-stepbar-mid">
          <span className="bd-stepbar-name">{copy.nav[step]}</span>
          {/*
            One bar, and it is the accessible one too: `progressbar` with the real numbers,
            so the assistive-technology answer and the visual answer come from one place.
          */}
          <span
            className="bd-stepbar-track"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={copy.nav[step]}
            /* The visible fraction is `aria-hidden`, so this is the only place a screen reader can
               learn the count rather than the percentage. Same two numbers, said once. */
            aria-valuetext={t.of(done, n)}
          >
            <span className="bd-stepbar-fill" style={{ width: `${pct}%` }} />
          </span>
        </div>
        <button
          type="button"
          className="bd-stepbar-btn"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          {t.steps}
        </button>
      </div>

      {open && (
        <div className="bd-sheet-scrim" onClick={() => setOpen(false)}>
          <div
            ref={sheetRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={t.steps}
            className="bd-sheet"
            dir={ar ? "rtl" : "ltr"}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bd-sheet-head">
              <strong className="text-sm">{t.steps}</strong>
              <button type="button" onClick={() => setOpen(false)} className="bd-sheet-x" aria-label={t.close}>×</button>
            </div>
            <ol className="bd-sheet-list">
              {STEPS.map((s, idx) => {
                const mark = stepMark(s, state, step);
                const here = s === step;
                return (
                  <li key={s}>
                    <Link
                      href={stepHref(lang, resumeId, s)}
                      scroll={false}
                      onClick={() => setOpen(false)}
                      className={here ? "on" : undefined}
                      aria-current={here ? "step" : undefined}
                    >
                      <span className={`bd-tick${mark === "done" ? " done" : mark === "warn" ? " warn" : ""}`}>
                        {mark === "done" ? "✓" : mark === "warn" ? "!" : ar ? toArabicDigits(idx + 1) : idx + 1}
                      </span>
                      {copy.nav[s]}
                    </Link>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
