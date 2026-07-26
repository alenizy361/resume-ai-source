"use client";

/**
 * One step of the builder, as a page.
 *
 * The section bodies are the same components the long scrolling page renders — imported,
 * not reimplemented. What this file owns is the heading and which body belongs to which step.
 *
 * Back and Continue used to be here too, and they moved to `StepActions`, rendered by the shell.
 * The reason is structural rather than tidiness: once the mobile preview began being unmounted
 * instead of hidden, the shell stopped rendering the step in preview mode — and the step's footer
 * went with it, leaving no way to continue from the preview. A bar that must appear on every step
 * cannot belong to something that is not always rendered.
 */

import { useRouter } from "next/navigation";

import { type SectionId } from "@/app/lib/builderDoc";
import { useBuilder } from "./BuilderProvider";
import { SECTION_COPY, stepHref } from "./steps";
import StepGate from "./StepGate";
import { TargetFields, PersonalFields, BlueprintBody, SkillsBody } from "./FormSections";
import ExperienceSection from "./ExperienceSection";
import { EducationBlock, CredentialsBlock, LanguagesBlock } from "./DetailSections";
import AskAi from "./AskAi";
import SummarySection from "./SummarySection";
import ReviewSection from "./ReviewSection";
import DesignSection from "./DesignSection";

export default function BuilderStep({ step }: { step: SectionId }) {
  const { lang, hydrated } = useBuilder();
  const copy = SECTION_COPY[lang];

  return (
    <section className="bd-section bd-step">
      {/*
        No step number here. It used to sit in a circle beside the title, which made it the
        fourth place on one screen telling the user which step they were on — after the header
        rail, the eleven-name navigation, and "Step 4 of 11" above this heading. `StepBar` is
        the one that survived; a heading's job is to name the step, not to count it.
      */}
      <div className="bd-head">
        {/* An h1 per step, not an h2 under a page-level h1: each step IS its own page, and a
            page whose only heading is a site name has no on-page signal at all. */}
        <h1 className="bd-title">{copy.sections[step]}</h1>
        <p className="bd-sub">{copy.subs[step]}</p>
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
    lang, resumeId, state, dispatch, cv, previewText, viewLang, today, flush,
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
          lang={lang} state={state} cv={previewText} viewLang={viewLang} referenceDate={today}
          onRecord={(patch) => dispatch({ t: "record", ...patch })}
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
