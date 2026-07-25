"use client";

/**
 * `/builder` — the one decision before the journey starts.
 *
 * Three ways in, and the third one is the reason this page exists rather than dropping
 * people straight onto the first step: a returning user with a half-built CV must be
 * shown it, not silently resumed into the middle of it. Being dropped at step 7 of 11
 * with fields already filled is indistinguishable from someone else's data.
 *
 * So a saved draft is offered explicitly, with what it contains and how far it got. The
 * two fresh starts sit beside it, unchanged from the long page's own start section —
 * `StartCards` is shared, not copied.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { track } from "@vercel/analytics";

import { useBuilder } from "./BuilderProvider";
import { StartCards } from "./FormSections";
import { STEPS, stepHref, SECTION_COPY } from "./steps";
import { toArabicDigits } from "@/app/lib/plans";

const T = {
  en: {
    h1: "Build your CV",
    sub: "Eleven short steps. Everything the AI suggests is a suggestion until you approve it.",
    resumeHead: "Continue where you left off",
    resumeSub: (n: number) => `${n} of ${STEPS.length} steps done`,
    resumeGo: "Continue →",
    untitled: "Untitled CV",
    fresh: "Or start something new",
    firstStep: "Start →",
  },
  ar: {
    h1: "ابنِ سيرتك الذاتية",
    sub: "إحدى عشرة خطوة قصيرة. كل ما يقترحه الذكاء يظل اقتراحاً حتى تعتمده.",
    resumeHead: "واصل من حيث توقفت",
    resumeSub: (n: number) => `أكملت ${toArabicDigits(n)} من ${toArabicDigits(STEPS.length)} خطوات`,
    resumeGo: "واصل ←",
    untitled: "سيرة بلا عنوان",
    fresh: "أو ابدأ من جديد",
    firstStep: "ابدأ ←",
  },
};

export default function BuilderStart({ lang }: { lang: "ar" | "en" }) {
  const { state, dispatch, resumeId, hydrated, flush } = useBuilder();
  const router = useRouter();
  const t = T[lang];
  const nav = SECTION_COPY[lang].nav;
  /* An Arabic page counts in Arabic-Indic digits. Same rule the prices already follow. */
  const num = (n: number) => lang === "ar" ? toArabicDigits(n) : String(n);

  const done = state.sectionsDone.filter((s) => (STEPS as string[]).includes(s));
  /* Where "continue" goes: the first step not yet finished, or the last one if all are. */
  const resumeAt = STEPS.find((s) => !state.sectionsDone.includes(s)) ?? STEPS[STEPS.length - 1];
  const hasDraft = hydrated && (done.length > 0 || Boolean(state.target.title || state.personal.fullName));

  const enter = (step = STEPS[0]) => {
    flush();
    router.push(stepHref(lang, resumeId, step), { scroll: false });
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-extrabold leading-snug" style={{ letterSpacing: "-0.02em" }}>{t.h1}</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>{t.sub}</p>

      {hasDraft && (
        <div className="card mt-6 p-5" style={{ borderColor: "rgba(139,92,246,0.4)", background: "rgba(139,92,246,0.05)" }}>
          <div className="text-xs font-semibold" style={{ color: "var(--accent)" }}>{t.resumeHead}</div>
          <div className="mt-1.5 text-sm font-bold">
            {state.target.title || state.personal.fullName || t.untitled}
          </div>
          <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            {t.resumeSub(done.length)} · {nav[resumeAt]}
          </div>
          <button
            onClick={() => { track("builder_resumed", { at: resumeAt }); enter(resumeAt); }}
            className="btn-accent mt-4 rounded-xl px-5 py-2.5 text-sm font-bold"
          >
            {t.resumeGo}
          </button>
        </div>
      )}

      <div className="mt-8">
        {hasDraft && <div className="bd-label">{t.fresh}</div>}
        <StartCards
          lang={lang} state={state} dispatch={dispatch}
          onPicked={() => enter()}
        />
      </div>

      {!hasDraft && (
        <button onClick={() => enter()} className="btn-accent mt-6 rounded-xl px-5 py-2.5 text-sm font-bold">
          {t.firstStep}
        </button>
      )}

      {/*
        The step list, visible before committing to it. A form that hides its own length
        feels longer than one that shows it.

        Rendered only once the id is known. `resumeId` is empty until the draft has been
        read, and `stepHref(lang, "", s)` builds `/builder//target` — a URL that is not
        this route and that a fast click would actually follow. Plain text until then,
        rather than a link that goes somewhere wrong.
      */}
      <ol className="mt-8 flex flex-wrap gap-x-2 gap-y-1 text-xs" style={{ color: "var(--faint)" }}>
        {STEPS.map((s, i) => (
          <li key={s}>
            {resumeId
              ? <Link href={stepHref(lang, resumeId, s)} scroll={false} style={{ color: "inherit" }}>{num(i + 1)}. {nav[s]}</Link>
              : <span>{num(i + 1)}. {nav[s]}</span>}
            {i < STEPS.length - 1 && <span aria-hidden> ·</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
