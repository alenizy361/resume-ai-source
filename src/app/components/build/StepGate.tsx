"use client";

/**
 * What a step says when it cannot do its job yet — for every step, from one place.
 *
 * ── why this is not a special case in one section ──
 *
 * The reported bug was the Skills step announcing "Enter a job title first" to someone who had
 * entered one. Fixing it inside `SkillsBody` fixed that screen. It did nothing for the other ten,
 * which have exactly the same shape of problem and would each solve it their own way — which is how
 * the product ended up with a section that says "the assistant is busy" for an empty answer and
 * another that says nothing at all.
 *
 * So the prerequisite check moves out of the section and above it. Every step is asked the same
 * question by the same function, and one banner answers it in one voice.
 *
 * ── what it does NOT do ──
 *
 * It does not block. The step's own content renders underneath, always. A user who opened
 * `/builder/<id>/skills` directly with no target can still read the section, still type, still
 * navigate — they simply also see, at the top, which field is missing and a way back to it.
 *
 * Refusing to render would be the same error the bug was: a step deciding on its own that the user
 * has not earned it. Someone who bookmarked a step and came back tomorrow needs to see their form,
 * not a wall.
 */

import Link from "next/link";
import { stepReady } from "@/app/lib/stepReady";
import { missingLabel } from "@/app/lib/stepMessages";
import type { SectionId } from "@/app/lib/builderDoc";
import { stepHref } from "./steps";
import { useBuilder } from "./BuilderProvider";

const C = {
  en: {
    head: "This step needs something from an earlier one",
    back: "Go to",
  },
  ar: {
    head: "هذه الخطوة تحتاج شيئاً من خطوة سابقة",
    back: "اذهب إلى",
  },
};

export default function StepGate({ step }: { step: SectionId }) {
  const { lang, state, resumeId, hydrated } = useBuilder();

  /* Never on an unhydrated draft. Everything is missing before the draft is read, and announcing
     that is how a user gets told their finished CV is empty for 40 milliseconds. */
  if (!hydrated) return null;

  const gate = stepReady(step, state);
  if (gate.ready) return null;

  /*
   * Never blame the step you are standing on.
   *
   * `stepReady("target", …)` legitimately reports `no-title` — the Target step's readiness IS
   * whether its own fields are filled, and later steps depend on that answer. But rendering it
   * HERE produced, on step 1 of 11, a warning saying "the job title you are aiming for is
   * missing" above the empty Job title field, with a button offering to take the user to the
   * page they were already on. This banner exists to explain a dependency on an EARLIER step;
   * a field on this screen is explained by the field.
   *
   * So the current step's own entries are dropped, and if nothing else remains the banner does
   * not render at all.
   */
  const external = gate.missing.filter((m) => m.step !== step);
  if (external.length === 0) return null;

  /*
   * The steps to link back to, deduplicated and in the order they were reported. A step missing
   * three fields from one earlier step gets one link, not three.
   */
  const targets = [...new Set(external.map((m) => m.step))];
  const c = C[lang];

  return (
    <div
      className="mb-5 rounded-2xl p-4"
      style={{ background: "rgba(252,211,77,.07)", border: "1px solid rgba(252,211,77,.28)" }}
    >
      <p className="text-sm font-semibold" style={{ color: "#fcd34d" }}>{c.head}</p>

      {/* The FIELD, not the step. "Target job is incomplete" makes someone open a form and hunt. */}
      <ul className="mt-2 space-y-1 text-xs" style={{ color: "var(--muted)" }}>
        {external.map((m) => <li key={`${m.step}:${m.code}`}>· {missingLabel(m.code, lang)}</li>)}
      </ul>

      <div className="mt-3 flex flex-wrap gap-2">
        {targets.map((s) => (
          <Link
            key={s}
            href={stepHref(lang, resumeId, s)}
            scroll={false}
            className="btn-ghost rounded-xl px-4 py-2 text-xs font-semibold"
          >
            ← {c.back} {LABEL[lang][s] ?? s}
          </Link>
        ))}
      </div>
    </div>
  );
}

/**
 * Short step names for the link, kept here rather than imported from `SECTION_COPY`.
 *
 * Only the handful of steps a gate can point BACK to appear — `stepReady` never blames a step for
 * itself, and no gate depends on the design or review steps. Importing the whole copy table to use
 * three entries of it would tie this component to every future label change.
 */
const LABEL: Record<"ar" | "en", Partial<Record<SectionId, string>>> = {
  en: { target: "Target job", personal: "Contact", experience: "Experience" },
  ar: { target: "الوظيفة", personal: "التواصل", experience: "الخبرة" },
};
