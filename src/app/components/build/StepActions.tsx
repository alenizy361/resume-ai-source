"use client";

/**
 * Back and Continue — one bar, owned by the shell rather than by the step.
 *
 * ── why it moved ──
 *
 * It lived inside `BuilderStep`, which was fine while the step was always rendered. It stopped
 * being fine the moment the mobile preview started being UNMOUNTED rather than hidden: in preview
 * mode the shell does not render the step, so the step's footer went with it and there was no way
 * to continue from the preview at all. Found in a screenshot, not by a test.
 *
 * The brief asks for "one action bar for every step", and this is what that has to mean
 * structurally: the bar belongs to the frame, so it cannot be affected by which pane the phone is
 * showing. `BuilderShell` renders it whenever there is a step in the URL.
 *
 * ── the Continue contract, unchanged, because the order is the whole point ──
 *
 *   1. mark the step done          — so the progress bar and the sheet's ticks agree
 *   2. flush the draft to storage  — synchronously, before anything can unmount
 *   3. navigate                    — `push`, so Back is the browser's Back
 *
 * Reversing 2 and 3 is the bug this design exists to prevent: React batches, the router does not
 * wait, and the 450ms autosave loses the race. A user who typed a phone number and pressed
 * Continue would arrive at the next step with the field they just filled missing from a cold
 * reload.
 *
 * Back does NOT mark anything done and does not need to flush — the provider is mounted by the
 * layout, so going back one step is a re-render, not a reload, and the autosave catches up.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { track } from "@vercel/analytics";

import type { SectionId } from "@/app/lib/builderDoc";
import { useBuilder } from "./BuilderProvider";
import { builderHome, nextStep, prevStep, stepHref } from "./steps";

const T = {
  en: { back: "Back", cont: "Save & continue", done: "Finish", start: "Start over" },
  ar: { back: "رجوع", cont: "احفظ وواصل", done: "إنهاء", start: "ابدأ من جديد" },
};

export default function StepActions({ step }: { step: SectionId }) {
  const { lang, resumeId, flush, markDone } = useBuilder();
  const router = useRouter();
  const t = T[lang];
  /* The arrow follows the writing direction: `→` points backwards on an Arabic page. */
  const arrow = lang === "ar" ? "→" : "←";
  const back = prevStep(step);
  const forward = nextStep(step);

  const goto = (to: SectionId, completing: boolean) => {
    if (completing) markDone(step);
    flush();
    router.push(stepHref(lang, resumeId, to), { scroll: false });
  };

  const onContinue = () => {
    if (forward) { goto(forward, true); return; }
    // The last step has nothing after it. Finishing it is still worth recording.
    markDone(step);
    flush();
    track("builder_finished", { lang });
  };

  return (
    <div className="bd-actions">
      <div className="bd-actions-in">
        {back ? (
          <button className="bd-back" onClick={() => goto(back, false)}>{arrow} {t.back}</button>
        ) : (
          <Link className="bd-back" href={builderHome(lang)}>{arrow} {t.start}</Link>
        )}
        <button onClick={onContinue} className="bd-continue">
          {forward ? t.cont : t.done}
        </button>
      </div>
    </div>
  );
}
