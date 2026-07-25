"use client";

/**
 * One step of the builder, as a page.
 *
 * The section bodies are the same components the long scrolling page renders — imported,
 * not reimplemented. What this file owns is the part that only exists once a step is a
 * route: the heading, the Back and Continue rules, and the flush-before-navigate that
 * keeps the two honest.
 *
 * The Continue contract, in order, because the order is the whole point:
 *
 *   1. mark the step done          — so the rail and the navigation ticks agree
 *   2. flush the draft to storage  — synchronously, before anything can unmount
 *   3. navigate                    — `push`, so Back is the browser's Back
 *
 * Reversing 2 and 3 is the bug this design exists to prevent: React batches, the router
 * does not wait, and the 450 ms autosave loses the race. A user who typed a phone number
 * and pressed Continue would arrive at the next step with the field they just filled
 * missing from a cold reload.
 *
 * Back does NOT mark anything done and does not need to flush — the provider is mounted
 * by the layout, so going back one step is a re-render, not a reload, and the autosave
 * catches up on its own.
 */

import { useRouter } from "next/navigation";
import Link from "next/link";
import { track } from "@vercel/analytics";

import { type SectionId } from "@/app/lib/builderDoc";
import { toArabicDigits } from "@/app/lib/plans";
import { useBuilder } from "./BuilderProvider";
import {
  SECTION_COPY, nextStep, prevStep, stepHref, stepIndex, builderHome,
} from "./steps";
import { stepReady } from "@/app/lib/stepReady";
import StepGate from "./StepGate";
import { TargetFields, PersonalFields, BlueprintBody, SkillsBody } from "./FormSections";
import ExperienceSection from "./ExperienceSection";
import { EducationBlock, CredentialsBlock, LanguagesBlock } from "./DetailSections";
import AskAi from "./AskAi";
import SummarySection from "./SummarySection";
import ReviewSection from "./ReviewSection";
import DesignSection from "./DesignSection";

const T = {
  en: { back: "Back", cont: "Save & continue", done: "Finish", start: "Start over" },
  ar: { back: "رجوع", cont: "احفظ وواصل", done: "إنهاء", start: "ابدأ من جديد" },
};

export default function BuilderStep({ step }: { step: SectionId }) {
  const { lang, resumeId, state, hydrated, flush, markDone } = useBuilder();
  const router = useRouter();
  const t = T[lang];
  const copy = SECTION_COPY[lang];
  const back = prevStep(step);
  const forward = nextStep(step);

  /** Go to a step, saving first. Everything that leaves this page goes through here. */
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
    <section className="bd-section bd-step">
      <div className="bd-head">
        {/* Validated, not merely visited — see `stepReady.ts`. */}
        <span className={`bd-num${stepReady(step, state).ready && state.sectionsDone.includes(step) ? " done" : ""}`}>
          {stepReady(step, state).ready && state.sectionsDone.includes(step) ? "✓"
            : lang === "ar" ? toArabicDigits(stepIndex(step) + 1) : stepIndex(step) + 1}
        </span>
        <div>
          {/* An h1 per step, not an h2 under a page-level h1: each step IS its own page,
              and a page whose only heading is a site name has no on-page signal at all. */}
          <h1 className="bd-title">{copy.sections[step]}</h1>
          <p className="bd-sub">{copy.subs[step]}</p>
        </div>
      </div>

      <div className="bd-body">
        {/* Nothing renders over an unhydrated draft. A form that mounted empty and filled
            in 40 ms later invites the user to type into a field that is about to be
            replaced by their own saved answer. */}
        {!hydrated ? <Skeleton /> : (
          <>
            {/* Above the content, never instead of it — see StepGate for why refusing to render
                would repeat the bug rather than fix it. */}
            <StepGate step={step} />
            <StepContent step={step} />
          </>
        )}
      </div>

      <div className="bd-step-foot">
        {back ? (
          <button className="bd-back" onClick={() => goto(back, false)}>← {t.back}</button>
        ) : (
          <Link className="bd-back" href={builderHome(lang)}>← {t.start}</Link>
        )}
        <button onClick={onContinue} className="btn-accent rounded-xl px-5 py-2.5 text-sm font-bold">
          {forward ? t.cont : t.done}
        </button>
      </div>
    </section>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-xl" style={{ height: 42, background: "var(--surface)" }} />
      ))}
    </div>
  );
}

/**
 * Which section body belongs to which step.
 *
 * A switch rather than a lookup table because the bodies genuinely take different props —
 * three of them need the CV's language, two need today's date, one needs the assembled
 * preview text. A table would need every prop for every entry, which is how a component
 * ends up receiving arguments it has no use for.
 */
function StepContent({ step }: { step: SectionId }) {
  const {
    lang, resumeId, state, dispatch, cv, previewText, today, flush,
  } = useBuilder();
  const router = useRouter();

  /** Review and design findings name a section; this is how "fix it" navigates. */
  const jump = (to: SectionId) => { flush(); router.push(stepHref(lang, resumeId, to), { scroll: false }); };

  switch (step) {
    case "target":
      return <TargetFields lang={lang} state={state} dispatch={dispatch} />;
    case "blueprint":
      return <BlueprintBody lang={lang} state={state} dispatch={dispatch} />;
    case "personal":
      return <PersonalFields lang={lang} state={state} dispatch={dispatch} />;
    case "experience":
      return (
        <>
          <ExperienceSection
            lang={lang} cv={cv} state={state} target={state.target}
            dispatch={dispatch as unknown as React.Dispatch<{ t: string; [k: string]: unknown }>}
          />
          <AskAi lang={lang} section="experience" targetRole={state.target.title}
            current={(state.profile.wovenLines || []).join("\n")} />
        </>
      );
    case "education":
      return (
        <>
          <EducationBlock lang={lang} cv={cv} state={state} dispatch={dispatch as never}
            targetRole={state.target.title} />
          <AskAi lang={lang} section="education" targetRole={state.target.title}
            current={state.profile.education} />
        </>
      );
    case "credentials":
      return (
        <>
          <CredentialsBlock lang={lang} cv={cv} state={state} dispatch={dispatch as never}
            referenceDate={today} />
          {/* The question this section actually gets asked is "do I put my licence number
              on a CV?" — which a form cannot answer and a one-line AI answer can. */}
          <AskAi lang={lang} section="credentials" targetRole={state.target.title}
            current={state.profile.certifications} />
        </>
      );
    case "skills":
      return <SkillsBody lang={lang} state={state} dispatch={dispatch} />;
    case "languages":
      return <LanguagesBlock lang={lang} cv={cv} state={state} dispatch={dispatch as never} />;
    case "summary":
      return <SummarySection lang={lang} state={state} dispatch={dispatch as never} />;
    case "review":
      return <ReviewSection lang={lang} state={state} referenceDate={today} onJump={jump} />;
    case "design":
      return (
        <DesignSection
          lang={lang} state={state} cv={previewText} referenceDate={today}
          onTemplate={(slug) => dispatch({ t: "template", slug })}
          onJump={jump}
          onTailorCopy={() => { dispatch({ t: "tailorCopy" }); jump("target"); }}
        />
      );
    // `start` is the /builder landing, not a step; `stepFromSlug` never returns it.
    default:
      return null;
  }
}
