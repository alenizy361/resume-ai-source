"use client";

/**
 * The form-first builder.
 *
 * Replaces the conversation as the way a CV gets made. The form drives; the AI
 * suggests inside each section and nothing it writes reaches the document until the
 * user confirms it. That last part is not enforced here — it is a property of the
 * data model in `lib/builderDoc.ts`, where confirmed content lives in `profile` and
 * suggestions live somewhere the renderer cannot see.
 *
 * This file is the shell only: state, autosave, layout, progress, section framing.
 * Each section is its own component so they can be built and reviewed one at a time.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { track } from "@vercel/analytics";
import "../../build.css";

import ResumeTemplate from "../ResumeTemplate";
import OrbBrand from "../OrbBrand";
import { TEMPLATE_CATALOG } from "@/app/lib/templateCatalog";
import { assembleResume } from "@/app/lib/mergeProfile";
import { computeProgress } from "@/app/lib/interviewGuards";
import { readDraft, writeDraft } from "@/app/lib/draftStore";
import {
  type BuilderState, type SectionId,
  EMPTY_BUILDER, cvLang,
} from "@/app/lib/builderDoc";
import { reducer } from "./builderState";
import { useOnline } from "./useOnline";
import { type Lifecycle, lifecycleLabel, lifecycleTone, mayWrite } from "@/app/lib/lifecycle";
import {
  StartCards, TargetFields, PersonalFields, BlueprintBody, SkillsBody,
} from "./FormSections";
import ExperienceSection from "./ExperienceSection";
import { EducationBlock, CredentialsBlock, LanguagesBlock } from "./DetailSections";
import AskAi from "./AskAi";
import SummarySection from "./SummarySection";
import ReviewSection from "./ReviewSection";
import DesignSection from "./DesignSection";

/* ───────────────────────── copy ───────────────────────── */

const T = {
  en: {
    brand: "Sira", chat: "Talk to the AI instead",
    h1a: "You fill the facts.", h1b: "AI completes the professional wording.",
    promise: "Suggested skills and responsibilities for your profession — grouped, editable, and never added until you approve them.",
    trust: [
      "Never invents an employer, a date, a certification or a number",
      "ATS-ready structure — single column, standard headings",
      "Free, no signup, works with the AI switched off",
    ],
    offline: "Offline — your work is saved on this device",
    cont: "Save & continue", edit: "Edit", preview: "Preview",
    sections: {
      start: "Where do you want to start?",
      target: "The job you are aiming for",
      personal: "How employers reach you",
      experience: "Your work experience",
      education: "Education",
      credentials: "Licences & certifications",
      skills: "Skills",
      languages: "Languages",
      summary: "Professional summary",
      review: "Review",
      blueprint: "What we know about this job",
      design: "Design & download",
    } satisfies Record<SectionId, string>,
    subs: {
      start: "Pick a starting point. Nothing is written until you confirm it.",
      target: "This comes first because everything the AI suggests is based on it.",
      personal: "Only what an employer needs. Nothing sensitive is requested.",
      experience: "One position at a time. AI drafts the duties; you keep what is true.",
      education: "AI may tidy the wording. It will not invent a degree.",
      credentials: "Suggestions start unchecked. Nothing is claimed on your behalf.",
      skills: "Choose what you actually do. Nothing is pre-selected.",
      languages: "You choose the level. Nothing is assumed.",
      summary: "Written last, from what you confirmed above.",
      review: "What is missing, and what would make this stronger.",
      blueprint: "Read it, then decide. Nothing here is on your CV yet.",
      design: "Content first, design last.",
    } satisfies Record<SectionId, string>,
    newCv: "Build a new CV",
    newCvSub: "Step by step. AI suggests skills and responsibilities for your profession — you approve everything.",
    upCv: "Upload and improve my CV",
    upCvSub: "We read your file, score it, and rewrite it without inventing anything.",
  },
  ar: {
    brand: "سيرة", chat: "أفضّل المحادثة",
    h1a: "أنت تكتب الحقائق.", h1b: "والذكاء يصوغها بلغة مهنية.",
    promise: "مهارات ومهام مقترحة لمهنتك — مجمّعة، قابلة للتعديل، ولا تُضاف قبل أن تعتمدها.",
    trust: [
      "لا يختلق جهة عمل ولا تاريخاً ولا شهادة ولا رقماً",
      "بنية تعبر أنظمة الفرز — عمود واحد وعناوين قياسية",
      "مجاناً، بلا تسجيل، ويعمل والذكاء مطفأ",
    ],
    offline: "بلا اتصال — عملك محفوظ على جهازك",
    cont: "احفظ وواصل", edit: "تعديل", preview: "معاينة",
    sections: {
      start: "من أين تبدأ؟",
      target: "الوظيفة التي تستهدفها",
      personal: "كيف يصل إليك أصحاب العمل",
      experience: "خبرتك العملية",
      education: "التعليم",
      credentials: "الرخص والشهادات",
      skills: "المهارات",
      languages: "اللغات",
      summary: "الملخص المهني",
      review: "المراجعة",
      blueprint: "ما نعرفه عن هذه الوظيفة",
      design: "التصميم والتنزيل",
    } satisfies Record<SectionId, string>,
    subs: {
      start: "اختر نقطة البداية. لا يُكتب شيء في سيرتك قبل أن تؤكّده.",
      target: "تأتي أولاً لأن كل ما يقترحه الذكاء مبني عليها.",
      personal: "ما يحتاجه صاحب العمل فقط. لا نطلب أي بيانات حسّاسة.",
      experience: "وظيفة واحدة كل مرة. الذكاء يكتب المهام، وأنت تُبقي الصحيح.",
      education: "قد يرتّب الذكاء الصياغة. لن يختلق شهادة.",
      credentials: "الاقتراحات تبدأ غير مختارة. لا يُنسب إليك شيء بلا تأكيدك.",
      skills: "اختر ما تفعله فعلاً. لا شيء محدَّد مسبقاً.",
      languages: "أنت تختار المستوى. لا شيء يُفترض.",
      summary: "يُكتب آخراً، من الذي أكّدته أعلاه.",
      review: "ما ينقص، وما يجعلها أقوى.",
      blueprint: "اقرأها ثم قرّر. لا شيء منها في سيرتك بعد.",
      design: "المحتوى أولاً، التصميم أخيراً.",
    } satisfies Record<SectionId, string>,
    newCv: "أنشئ سيرة جديدة",
    newCvSub: "خطوة بخطوة. الذكاء يقترح المهارات والمهام لمهنتك — وأنت تعتمد كل شيء.",
    upCv: "ارفع سيرتي وحسّنها",
    upCvSub: "نقرأ ملفك، نقيّمه، ونعيد صياغته دون اختلاق أي شيء.",
  },
};

/** The journey, in order. The rail and the cinema both read this. */
const ORDER: SectionId[] = [
  "start", "target", "blueprint", "personal", "experience", "education",
  "credentials", "skills", "languages", "summary", "review", "design",
];

/* ───────────────────────── state ───────────────────────── */

/*
 * The reducer lives in `builderState.ts`, not here.
 *
 * It moved the moment a second surface needed it: the step routes under /builder run
 * the same eleven transitions this page does, and a second copy would drift. Nothing
 * about the transitions changed in the move.
 */

/* ───────────────────────── shell ───────────────────────── */

export default function Builder({ lang }: { lang: "ar" | "en" }) {
  const t = T[lang];
  const ar = lang === "ar";
  const [state, dispatch] = useReducer(reducer, EMPTY_BUILDER);
  /*
   * The same lifecycle the step routes use, in the long-page shell.
   *
   * Two vocabularies for one situation is how a product ends up telling a user "Saved" on one
   * surface and nothing at all on the other for the identical state.
   */
  const [life, setLife] = useState<Lifecycle>("loading");
  /** Set once at hydration: the stored draft could not be parsed, so nothing may overwrite it. */
  const damaged = useRef(false);
  const online = useOnline();
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const hydrated = useRef(false);

  const cinema = useSectionCinemaSafe(ORDER.length);
  // Read once per mount and passed down: an expiry check that re-reads the clock on
  // every render makes the same draft render differently for no reason.
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  /* hydrate once — a refresh must not cost the user their work */
  useEffect(() => {
    const d = readDraft(lang);
    const saved = (d as unknown as { builder?: BuilderState }).builder;
    if (saved?.schemaVersion) {
      dispatch({ t: "hydrate", state: { ...EMPTY_BUILDER, ...saved } });
      cinema.restore(Math.max(0, saved.sectionsDone.length));
    } else if (d.profile?.role || d.profile?.name) {
      // A draft started in the chat: carry the confirmed resume across, which is
      // the entire point of sharing the key.
      dispatch({ t: "hydrate", state: { ...EMPTY_BUILDER, profile: d.profile } });
      cinema.restore(1);
    }
    hydrated.current = true;
    /* A stored draft that would not parse. Recorded in a ref and acted on by the autosave effect
       below rather than set from here: this effect runs once on mount, and a `setState` in it is a
       cascading render for a fact the very next effect is about to read anyway. */
    damaged.current = d.damaged === true;
    track("builder_started", { lang });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  /* autosave — debounced, local-first, never blocking, and never over an unreadable draft */
  useEffect(() => {
    if (!hydrated.current) return;
    /* The first run of this effect is also where a damaged draft becomes visible — it fires
       immediately after hydration, and holding the write is exactly what this state means. */
    setLife((l) => (damaged.current ? "invalidResume" : mayWrite(l) ? "saving" : l));
    const id = setTimeout(() => {
      setLife((l) => {
        if (damaged.current || !mayWrite(l)) return l;
        try {
          writeDraft(lang, {
            profile: state.profile,
            door: "form",
            // Nested so the chat's own keys and the builder's cannot collide.
            ...({ builder: state } as unknown as Record<string, unknown>),
          });
          return "saved";
        } catch { return "saveError"; }
      });
    }, 450);
    return () => clearTimeout(id);
     
  }, [state, lang]);

  /* The preview is expensive: ResumeTemplate re-parses and re-measures on every
   * text change, so binding it to raw keystrokes re-lays out an A4 page per letter. */
  const [previewText, setPreviewText] = useState("");
  /** The document's language. Everything written INTO the CV is chosen by this. */
  const cv = cvLang(state.target);
  const resumeRtl = cv === "ar";
  useEffect(() => {
    const id = setTimeout(() => setPreviewText(assembleResume(state.profile, resumeRtl)), 250);
    return () => clearTimeout(id);
  }, [state.profile, resumeRtl]);

  const tpl = useMemo(
    () => TEMPLATE_CATALOG.find((x) => x.slug === state.template) ?? TEMPLATE_CATALOG[0],
    [state.template],
  );
  const progress = useMemo(() => computeProgress(state.profile), [state.profile]);

  const finish = useCallback((section: SectionId, index: number) => {
    dispatch({ t: "done", section });
    track("builder_section_completed", { section });
    cinema.open(index + 1);
     
  }, [cinema]);

  /*
   * The drop-off signal.
   *
   * `builder_section_completed` alone cannot say where a build died — it only fires
   * for the steps someone finished. Pairing it with "reached" turns the funnel into
   * arithmetic: reached(experience) minus completed(experience) is the number of
   * people the experience section lost. Fired once per section, guarded by a ref so
   * a re-render or a restored draft cannot inflate the count.
   */
  const reported = useRef(-1);
  useEffect(() => {
    if (cinema.reached <= reported.current) return;
    for (let i = reported.current + 1; i <= cinema.reached; i++) {
      track("builder_section_reached", { section: ORDER[i], index: i });
    }
    reported.current = cinema.reached;
  }, [cinema.reached]);

  /** Review findings name the section they belong to; this is how "go there" works. */
  const jump = useCallback((section: SectionId) => {
    const i = ORDER.indexOf(section);
    if (i >= 0) cinema.scrollTo(i);
     
  }, [cinema]);

  const sectionProps = (id: SectionId, i: number) => ({
    id, index: i, lang,
    title: t.sections[id], sub: t.subs[id],
    locked: i > cinema.reached,
    done: state.sectionsDone.includes(id),
    justOpened: cinema.justOpened === i,
    setRef: cinema.setRef(i),
    onDone: () => finish(id, i),
    contLabel: t.cont,
  });

  return (
    <div className="build-root" dir={ar ? "rtl" : "ltr"}>
      <main className="min-h-screen" style={{ background: "var(--bg)", color: "var(--fg)" }}>
        <header
          className="sticky top-0 z-50"
          style={{ background: "linear-gradient(180deg, rgba(5,7,13,0.92), rgba(5,7,13,0.72))", backdropFilter: "blur(8px)" }}
        >
          <div className="mx-auto max-w-6xl px-5 py-3">
            <div className="flex items-center justify-between gap-3">
              <Link href={ar ? "/ar" : "/"} className="flex items-center gap-2">
                <OrbBrand size={26} />
                <span className="text-sm font-extrabold">{t.brand}</span>
              </Link>
              <div className="flex items-center gap-3">
                {/* Offline outranks the save label: both are about whether the work is safe, and
                    "Saved" beside a dead connection reads as a promise about the wrong thing. The
                    draft IS safe — every write is local — so the sentence says where it is. */}
                <span className={`bd-save${lifecycleTone(life) !== "quiet" ? " err" : ""}`}>
                  {life === "invalidResume" ? lifecycleLabel(life, lang)
                    : !online ? t.offline
                    : lifecycleLabel(life, lang)}
                </span>
              </div>
            </div>
            <div className="bd-rail mt-2.5" aria-label={`${progress}%`}>
              {ORDER.map((s, i) => <i key={s} className={i <= cinema.reached ? "on" : ""} />)}
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-6xl px-5 pb-24 pt-6">
          {/* The page's claim, as a heading rather than as decoration. This is also the
              homepage now, and a homepage with no h1 leaves the strongest on-page signal
              in the product unused. */}
          <header className="mb-6">
            <h1 className="text-xl font-extrabold leading-snug sm:text-2xl" style={{ letterSpacing: "-0.02em" }}>
              {t.h1a}{" "}
              <span style={{ color: "var(--accent)" }}>{t.h1b}</span>
            </h1>
            <p className="mt-2 max-w-2xl text-sm" style={{ color: "var(--muted)" }}>{t.promise}</p>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--faint)" }}>
              {t.trust.map((x) => <li key={x}>✓ {x}</li>)}
            </ul>
          </header>

          {/* Mobile: never show the CV beside the form — neither would be usable. */}
          <div className="mb-4 flex gap-2 lg:hidden">
            {(["edit", "preview"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setMobileView(v)}
                className="flex-1 rounded-full px-3 text-xs font-semibold"
                style={mobileView === v
                  ? { background: "var(--accent)", color: "#fff" }
                  : { background: "var(--surface)", color: "var(--muted)", border: "1px solid var(--line)" }}
              >
                {v === "edit" ? t.edit : t.preview}
              </button>
            ))}
          </div>

          <div className="bd-cols">
            <div className={`bd-form${mobileView === "preview" ? " hide" : ""}`}>
              {/* The bodies come from FormSections, which the step routes render too.
                  This page supplies the heading, the locked state and the Continue
                  button; the step routes supply a page. Neither owns the fields. */}
              <SectionShell {...sectionProps("start", 0)}>
                <StartCards lang={lang} state={state} dispatch={dispatch}
                  onPicked={() => finish("start", 0)} />
              </SectionShell>
              <SectionShell {...sectionProps("target", 1)}>
                <TargetFields lang={lang} state={state} dispatch={dispatch} />
                <ContinueButton onClick={() => finish("target", 1)} label={t.cont} />
              </SectionShell>
              <SectionShell {...sectionProps("blueprint", 2)}>
                <BlueprintBody lang={lang} state={state} dispatch={dispatch} />
                <ContinueButton onClick={() => finish("blueprint", 2)} label={t.cont} />
              </SectionShell>
              <SectionShell {...sectionProps("personal", 3)}>
                <PersonalFields lang={lang} state={state} dispatch={dispatch} />
                <ContinueButton onClick={() => finish("personal", 3)} label={t.cont} />
              </SectionShell>
              {ORDER.slice(4).map((id, k) => {
                const props = sectionProps(id, k + 4);
                if (id === "experience") {
                  return (
                    <SectionShell key={id} {...props}>
                      <ExperienceSection
                        lang={lang} cv={cv} state={state} target={state.target}
                        dispatch={dispatch as unknown as React.Dispatch<{ t: string; [k: string]: unknown }>}
                      />
                      <AskAi lang={lang} section="experience" targetRole={state.target.title}
                        current={(state.profile.wovenLines || []).join("\n")} />
                      <ContinueButton onClick={props.onDone} label={props.contLabel} />
                    </SectionShell>
                  );
                }
                if (id === "skills") {
                  return (
                    <SectionShell key={id} {...props}>
                      <SkillsBody lang={lang} state={state} dispatch={dispatch} />
                      <ContinueButton onClick={props.onDone} label={props.contLabel} />
                    </SectionShell>
                  );
                }
                if (id === "education") {
                  return (
                    <SectionShell key={id} {...props}>
                      <EducationBlock lang={lang} cv={cv} state={state} dispatch={dispatch as never} targetRole={state.target.title} />
                      <AskAi lang={lang} section="education" targetRole={state.target.title}
                        current={state.profile.education} />
                      <ContinueButton onClick={props.onDone} label={props.contLabel} />
                    </SectionShell>
                  );
                }
                if (id === "credentials") {
                  return (
                    <SectionShell key={id} {...props}>
                      <CredentialsBlock lang={lang} cv={cv} state={state} dispatch={dispatch as never} referenceDate={today} />
                      {/* The question this section actually gets asked is "do I put my
                          licence number on a CV?" — which a form cannot answer and a
                          one-line AI answer can. */}
                      <AskAi lang={lang} section="credentials" targetRole={state.target.title}
                        current={state.profile.certifications} />
                      <ContinueButton onClick={props.onDone} label={props.contLabel} />
                    </SectionShell>
                  );
                }
                if (id === "summary") {
                  return (
                    <SectionShell key={id} {...props}>
                      <SummarySection lang={lang} state={state} dispatch={dispatch as never} />
                      <ContinueButton onClick={props.onDone} label={props.contLabel} />
                    </SectionShell>
                  );
                }
                if (id === "review") {
                  return (
                    <SectionShell key={id} {...props}>
                      <ReviewSection lang={lang} state={state} referenceDate={today} onJump={jump} />
                      <ContinueButton onClick={props.onDone} label={props.contLabel} />
                    </SectionShell>
                  );
                }
                if (id === "design") {
                  return (
                    <SectionShell key={id} {...props}>
                      <DesignSection
                        lang={lang} state={state} cv={previewText} referenceDate={today}
                        onTemplate={(slug) => dispatch({ t: "template", slug })}
                        onJump={jump}
                        onTailorCopy={() => { dispatch({ t: "tailorCopy" }); jump("target"); }}
                      />
                    </SectionShell>
                  );
                }
                if (id === "languages") {
                  return (
                    <SectionShell key={id} {...props}>
                      <LanguagesBlock lang={lang} cv={cv} state={state} dispatch={dispatch as never} />
                      <ContinueButton onClick={props.onDone} label={props.contLabel} />
                    </SectionShell>
                  );
                }
                // Every id in ORDER is handled above; this is the exhaustiveness tail.
                return null;
              })}
            </div>

            <aside className={`bd-preview${mobileView === "edit" ? " hide" : ""}`}>
              <div className="card overflow-hidden p-2">
                {previewText.trim() ? (
                  <ResumeTemplate
                    text={previewText}
                    name={state.profile.name || "resume"}
                    variant={tpl.variant}
                    accent={tpl.accent}
                    /* Explicit: detectDir guesses, and on a half-empty draft it flips
                       the whole preview mid-build. */
                    dir={resumeRtl ? "rtl" : "ltr"}
                    fitWidth
                  />
                ) : (
                  <div className="p-8 text-center text-xs" style={{ color: "var(--faint)" }}>
                    {ar ? "ستظهر سيرتك هنا وأنت تكتب." : "Your CV appears here as you fill it in."}
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}

/* Imported lazily below the component so the hook file stays a separate module. */
import { useSectionCinema } from "./useSectionCinema";
function useSectionCinemaSafe(total: number) { return useSectionCinema(total); }

/* ───────────────────── section framing ───────────────────── */

interface ShellProps {
  id: SectionId; index: number; lang: "ar" | "en";
  title: string; sub: string;
  locked: boolean; done: boolean; justOpened: boolean;
  setRef: (el: HTMLElement | null) => void;
  onDone: () => void; contLabel: string;
}

function SectionShell({
  title, sub, locked, done, justOpened, setRef, children,
}: ShellProps & { children: React.ReactNode }) {
  return (
    <section
      ref={setRef as (el: HTMLElement | null) => void}
      className={`bd-section${locked ? " locked" : ""}${justOpened ? " just-opened" : ""}`}
      aria-hidden={locked}
    >
      <div className="bd-head">
        <span className={`bd-num${done ? " done" : ""}`}>{done ? "✓" : ""}</span>
        <div>
          <h2 className="bd-title">{title}</h2>
          <p className="bd-sub">{sub}</p>
        </div>
      </div>
      {/*
        Children of a section the user has not reached are not rendered at all, not
        merely hidden. The review section recomputes the whole report from `profile`,
        so mounting it early would run a full CV analysis on every keystroke typed
        eight sections above it, invisibly. Safe because `reached` is monotonic — a
        section never goes back to locked, so nothing mounted is ever torn down.
      */}
      <div className="bd-body">{locked ? null : children}</div>
    </section>
  );
}

function ContinueButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="btn-accent mt-5 rounded-xl px-5 text-sm font-bold">
      {label}
    </button>
  );
}
