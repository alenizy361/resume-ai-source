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
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { track } from "@vercel/analytics";
import { trackStep } from "@/app/lib/funnelClient.ts";
import { TEMPLATE_CATALOG } from "@/app/lib/templateCatalog";
import { EMPTY_BUILDER, type SectionId } from "@/app/lib/builderDoc";
import { listResumes, mayRestore, newResumeId, readResume, writeResume } from "@/app/lib/resumeStore";

import { useBuilder } from "./BuilderProvider";
import { StartCards } from "./FormSections";
import { STEPS, stepHref, SECTION_COPY } from "./steps";
import { toArabicDigits } from "@/app/lib/plans";

const T = {
  en: {
    h1: "Build your CV",
    sub: "Eleven short steps. Everything the AI suggests is a suggestion until you approve it.",
    resumeHead: "Continue where you left off",
    /* Plural, because there can be more than one — and until this screen listed them, a second
       resume existed in storage with nothing anywhere able to open it. */
    resumesHead: "Your CVs here",
    resumeSub: (n: number) => `${n} of ${STEPS.length} steps done`,
    resumeGo: "Continue →",
    untitled: "Untitled CV",
    fresh: "Or start something new",
    firstStep: "Start →",
    /* "Duplicate and tailor": clone this CV into a new one before customising it for a
       different job, so the original stays intact for the application it already fits. */
    duplicate: "Duplicate → tailor for a job",
    copySuffix: " (copy)",
    tailoredFrom: (title: string) => `Tailored from “${title}”`,
    statusLabel: "Application status",
    status: {
      saved: "Interested", applied: "Applied", interview: "Interview", offer: "Offer", rejected: "Rejected",
    } as Record<string, string>,
  },
  ar: {
    h1: "ابنِ سيرتك الذاتية",
    sub: "إحدى عشرة خطوة قصيرة. كل ما يقترحه الذكاء يظل اقتراحاً حتى تعتمده.",
    resumeHead: "واصل من حيث توقفت",
    resumesHead: "سِيَرك هنا",
    resumeSub: (n: number) => `أكملت ${toArabicDigits(n)} من ${toArabicDigits(STEPS.length)} خطوات`,
    resumeGo: "واصل ←",
    untitled: "سيرة بلا عنوان",
    fresh: "أو ابدأ من جديد",
    firstStep: "ابدأ ←",
    duplicate: "نسخ ← وخصّصها لوظيفة",
    copySuffix: " (نسخة)",
    tailoredFrom: (title: string) => `مخصّصة من «${title}»`,
    statusLabel: "حالة التقديم",
    status: {
      saved: "مهتم", applied: "تم التقديم", interview: "مقابلة", offer: "عرض عمل", rejected: "رُفض",
    } as Record<string, string>,
  },
};

/**
 * What the static HTML contains while the interactive start is still resolving.
 *
 * ── why this exists at all ──
 *
 * `BuilderStart` reads `useSearchParams()`, which is a client-only value. Without a Suspense
 * boundary above it, `/builder` and `/ar/builder` cannot be prerendered — the build fails outright
 * with `missing-suspense-with-csr-bailout`. Both pages were being rendered on demand instead, and
 * nothing said so, because `headers()` in the root layout had already opted every route out of
 * static generation. Removing that made the real error visible.
 *
 * The heading and the subtitle are here rather than in a spinner for two reasons. They are the same
 * strings the real component renders, so the prerendered response carries the page's actual `h1` —
 * which is what a crawler reads and what LCP measures. And reserving the height of the cards below
 * keeps the swap from moving anything, because a fallback shorter than its content is CLS by
 * construction, on the one route the whole funnel starts at.
 */
function StartFallback({ lang }: { lang: "ar" | "en" }) {
  const t = T[lang];
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-extrabold leading-snug"
        style={lang === "ar" ? undefined : { letterSpacing: "-0.02em" }}>{t.h1}</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>{t.sub}</p>
      {/* The two start cards plus their button, reserved. `aria-hidden` because there is nothing
          here to read yet, and a screen reader announcing an empty box is worse than silence. */}
      <div className="mt-8" style={{ minHeight: 320 }} aria-hidden />
    </div>
  );
}

/**
 * The start screen, wrapped in the boundary the search-params read requires.
 *
 * Exported as the default so every caller gets the boundary — the two pages that render this had no
 * reason to know about it, and a boundary a caller has to remember is one a caller will forget.
 */
export default function BuilderStart({ lang }: { lang: "ar" | "en" }) {
  return (
    <Suspense fallback={<StartFallback lang={lang} />}>
      <BuilderStartInner lang={lang} />
    </Suspense>
  );
}

function BuilderStartInner({ lang }: { lang: "ar" | "en" }) {
  const { state, dispatch, resumeId, owner, hydrated, flush } = useBuilder();
  const router = useRouter();
  const params = useSearchParams();

  /*
   * "Use this template" from the gallery, honoured for the first time.
   *
   * The template pages have linked to `?template=<slug>` since they were written, and nothing has
   * ever read it: the old long-page builder ignored the query, and the step builder never saw it
   * because the link pointed at the other route. So a user picked a template, arrived at a builder
   * showing the default one, and had to pick it again — which reads as the product not listening.
   *
   * Applied once, only for a slug the catalogue actually has, and only while the resume still has
   * the default: a stored choice the user made inside the builder outranks a query parameter from
   * a page they left ten minutes ago.
   */
  const wanted = params.get("template") ?? "";
  const applied = useRef(false);
  useEffect(() => {
    if (!hydrated || applied.current || !wanted) return;
    applied.current = true;
    const known = TEMPLATE_CATALOG.some((x) => x.slug === wanted);
    if (known && state.template === EMPTY_BUILDER.template) dispatch({ t: "template", slug: wanted });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, wanted]);
  const t = T[lang];
  const nav = SECTION_COPY[lang].nav;
  /* An Arabic page counts in Arabic-Indic digits. Same rule the prices already follow. */
  const num = (n: number) => lang === "ar" ? toArabicDigits(n) : String(n);

  const done = state.sectionsDone.filter((s) => (STEPS as string[]).includes(s));
  /* Where "continue" goes: the first step not yet finished, or the last one if all are. */
  const resumeAt = STEPS.find((s) => !state.sectionsDone.includes(s)) ?? STEPS[STEPS.length - 1];
  const hasDraft = hydrated && (done.length > 0 || Boolean(state.target.title || state.personal.fullName));

  /*
   * ══════════════════════════════════════════════════════════════════════════════════
   * EVERY resume this owner has, not just the newest one
   * ══════════════════════════════════════════════════════════════════════════════════
   *
   * `resumeStore` has kept a per-owner index since it was written, and until now nothing rendered
   * it: this screen, `ContinueDraft` and `BuilderProvider` all took `listResumes(owner)[0]`. So a
   * second resume was a record in storage with no screen anywhere able to open it.
   *
   * That was survivable while only the builder created resumes. It stopped being survivable when
   * `/optimize`'s hand-off started writing a real record (see `lib/handoff.ts`): adding a CV that
   * cannot be reached is not adding a CV, and the alternative — overwriting the one in progress —
   * is the silent replacement the hand-off was measured doing.
   *
   * Read in an effect because `localStorage` does not exist during the server render, and gated on
   * `mayRestore` so a lapsed anonymous visit is offered nothing — the same answer the provider and
   * the landing banner give, from the same function.
   */
  interface SavedRow {
    id: string; title: string; steps: number; at: SectionId;
    tailoredFrom?: { sourceResumeId: string; sourceTitle: string; applicationStatus?: string };
  }
  const [saved, setSaved] = useState<SavedRow[]>([]);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!hydrated || !owner || !mayRestore(owner)) return;
    try {
      const list = listResumes(owner);
      // Read every record's state once, so a tailored copy can look up its source's title
      // without a second pass of storage reads per row.
      const states = new Map(list.map((r) => [r.resumeId, readResume(owner, r.resumeId).record?.state]));
      setSaved(list.map((r) => {
        const st = states.get(r.resumeId);
        const sections = (st?.sectionsDone ?? []).filter((s) => (STEPS as string[]).includes(s));
        const tf = st?.tailoredFrom;
        return {
          id: r.resumeId,
          title: r.title || st?.target.title || st?.personal.fullName || "",
          steps: sections.length,
          at: STEPS.find((s) => !sections.includes(s)) ?? STEPS[STEPS.length - 1],
          tailoredFrom: tf ? {
            sourceResumeId: tf.sourceResumeId,
            // The source may since have been deleted — fall back to the untitled label rather
            // than showing a blank "Tailored from "".
            sourceTitle: states.get(tf.sourceResumeId)?.target.title
              || states.get(tf.sourceResumeId)?.personal.fullName || t.untitled,
            applicationStatus: tf.applicationStatus,
          } : undefined,
        };
      }));
    } catch { setSaved([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, owner]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /** Patch just the application status on a tailored resume's stored record. */
  const setApplicationStatus = (id: string, applicationStatus: string) => {
    const { record } = readResume(owner, id);
    if (!record?.state.tailoredFrom) return;
    writeResume(owner, id, record.lang, {
      ...record.state,
      tailoredFrom: { ...record.state.tailoredFrom, applicationStatus: applicationStatus as never },
    });
    setSaved((prev) => prev.map((r) => r.id === id && r.tailoredFrom
      ? { ...r, tailoredFrom: { ...r.tailoredFrom, applicationStatus } }
      : r));
    track("builder_application_status", { status: applicationStatus });
  };

  /*
   * The live state outranks the stored index for the resume currently loaded.
   *
   * The index is written by autosave, so between a keystroke and the debounce it is behind by one
   * edit. Reading the row for `resumeId` from `state` instead means the card never shows a step
   * count the user has already passed — and it is also what stops a freshly minted, never-saved
   * resume from being absent from its own list.
   */
  const rows = saved.map((r) => r.id === resumeId
    ? { ...r, title: state.target.title || state.personal.fullName || r.title, steps: done.length, at: resumeAt }
    : r);
  if (hasDraft && !rows.some((r) => r.id === resumeId)) {
    rows.unshift({
      id: resumeId,
      title: state.target.title || state.personal.fullName || "",
      steps: done.length,
      at: resumeAt,
    });
  }

  /*
   * Duplicate and tailor: clone a saved CV under a fresh id, so a second job application
   * can diverge from the original without touching the resume that already fits its job.
   *
   * Reads the stored record rather than `state`, so duplicating a row other than the one
   * currently loaded copies THAT resume's own content, not whatever is live in the reducer.
   * Lands on the target step — tailoring starts with the job, which is the whole point.
   */
  const duplicate = (id: string) => {
    const { record } = readResume(owner, id);
    if (!record) return;
    const copyId = newResumeId();
    const copyTitle = record.state.target.title
      ? `${record.state.target.title}${t.copySuffix}`
      : record.state.target.title;
    /*
     * The new job's own details — employer, title, job description, eventual match score — are
     * NOT stamped here. They belong to `target`/`snapshot`, which the target-job step this
     * navigates to is about to fill in for the FIRST time on this copy; carrying the source
     * resume's own old target forward would make the duplicate look pre-tailored to a job nobody
     * pasted yet. What genuinely dates from this moment — which resume this came from, and when —
     * is `tailoredFrom`, and only that.
     */
    writeResume(owner, copyId, record.lang, {
      ...record.state,
      target: { ...record.state.target, title: copyTitle },
      tailoredFrom: { sourceResumeId: id, tailoredAt: Date.now() },
    });
    track("builder_duplicated", { source: id });
    trackStep("builderStarted", { at: STEPS[0], resumed: "1" });
    router.push(stepHref(lang, copyId, STEPS[0]), { scroll: false });
  };

  /*
   * "Build a new CV", made to actually mean it.
   *
   * `enter()` below navigates using the CURRENT `resumeId` from context — correct for continuing a
   * draft or for a genuinely empty visit, and silently wrong here: `BuilderFrame` never threads the
   * URL's resumeId down to `BuilderProvider` (it resolves the draft from storage — "the most
   * recently updated one, or a fresh one if none exist" — never from the address bar), so navigating
   * to a new URL changes nothing about which draft loads. Without this, "Build a new CV" pressed
   * with an existing draft open returned to that SAME draft, mid-fill, under a "new CV" label — a
   * user's old title/experience/summary still sitting in the fields. Fixed the same way `duplicate`
   * above already had to: mint a fresh id, WRITE it as the newest record so "most recently updated"
   * actually resolves to it, then navigate.
   */
  const startNew = () => {
    /*
     * ── no write here, and that IS the phantom-CV fix ──
     *
     * This used to `writeResume` an empty record before navigating, so that "most recently updated"
     * would resolve to the new id. `BuilderProvider`'s autosave now refuses to write an untouched
     * document — but this call site bypassed that gate entirely, so pressing "Build a new CV" twice
     * still put two "Untitled · 0 of 11 steps done" rows under "Your CVs here" for somebody who had
     * created nothing. The gate was real and this was the hole in it.
     *
     * The write is no longer needed for its original purpose: we navigate to `stepHref(…, id, …)`,
     * which puts the id IN THE URL, and the provider prefers `urlId` over any "most recent" lookup.
     * That resolution order is what the original bug was really about.
     *
     * `entry: "new"` goes with it, harmlessly — its one consumer reads `state.entry || "new"`
     * (`DesignSection`), so the default already says what the field was carrying.
     */
    const id = newResumeId();
    track("builder_entry_selected", { entry: "new" });
    trackStep("builderStarted", { at: STEPS[0], resumed: "0" });
    router.push(stepHref(lang, id, STEPS[0]), { scroll: false });
  };

  const enter = (step = STEPS[0]) => {
    /*
     * Nothing to enter yet. `resumeId` is "" until the owner is known and the draft read — a
     * multi-hundred-ms window on a slow connection for a browser holding signed-in records — and
     * `stepHref(lang, "", step)` builds `/builder//target`, which either 404s or is parsed back
     * with "builder" as the resume id. The step list below already guards its links against
     * exactly this (`resumeId ? <Link> : <span>`); the Start button and the start cards route
     * through here, so this is their guard.
     */
    if (!resumeId) return;
    /*
     * The funnel's builder step belongs HERE and not on the front door: viewing the landing page is
     * a page view, and every path into the builder — resume, a start card, the first-step button —
     * goes through this one function, so one call covers all of them and cannot drift apart.
     */
    trackStep("builderStarted", { at: step, resumed: step === STEPS[0] ? "0" : "1" });
    flush();
    router.push(stepHref(lang, resumeId, step), { scroll: false });
  };

  return (
    <div className="mx-auto max-w-3xl">
      {/* Tracking is LTR-only: Arabic letters join, and spacing them — in either direction —
          fights the joins rather than the rhythm. An inline style beats every stylesheet rule,
          so the global RTL reset cannot save this one; it has to be conditional here. */}
      <h1 className="text-2xl font-extrabold leading-snug"
        style={lang === "ar" ? undefined : { letterSpacing: "-0.02em" }}>{t.h1}</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>{t.sub}</p>

      {rows.length > 0 && (
        <div className="mt-6">
          {/* One heading when there is one CV, another when there are several. The singular used to
              be the only case the screen could express, which is why the second CV was invisible. */}
          <div className="bd-label">{rows.length > 1 ? t.resumesHead : t.resumeHead}</div>
          <div className="mt-2 flex flex-col gap-2 t-stagger">
            {rows.map((r) => (
              <div
                key={r.id}
                className="card p-5 t-enter"
                style={r.id === resumeId
                  ? { borderColor: "rgba(139,92,246,0.4)", background: "rgba(139,92,246,0.05)" }
                  : undefined}
              >
                {/* `dir="auto"` — the title comes from the CV, which may be in either script
                    whatever the interface is set to. */}
                <div className="text-sm font-bold" dir="auto">{r.title || t.untitled}</div>
                <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                  {t.resumeSub(r.steps)} · {nav[r.at]}
                </div>
                {/* Only a tailored copy carries this — the primitive "duplicate and tailor" is
                    built from, see `tailoredFrom` on BuilderState. */}
                {r.tailoredFrom && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                      style={{ background: "rgba(139,92,246,0.12)", color: "var(--accent-deep)" }}>
                      {t.tailoredFrom(r.tailoredFrom.sourceTitle)}
                    </span>
                    <select
                      aria-label={t.statusLabel}
                      value={r.tailoredFrom.applicationStatus || "saved"}
                      onChange={(e) => setApplicationStatus(r.id, e.target.value)}
                      className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                      style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--muted)" }}
                    >
                      {Object.entries(t.status).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                    </select>
                  </div>
                )}
                <button
                  onClick={() => {
                    track("builder_resumed", { at: r.at });
                    /*
                     * `flush()` before leaving, because the resume being left may hold an
                     * un-debounced edit — and then navigate by id rather than through `enter()`,
                     * which only ever knew about the currently loaded resume.
                     */
                    flush();
                    trackStep("builderStarted", { at: r.at, resumed: "1" });
                    router.push(stepHref(lang, r.id, r.at), { scroll: false });
                  }}
                  className="btn-accent t-tap mt-4 rounded-xl px-5 py-2.5 text-sm font-bold"
                >
                  {t.resumeGo}
                </button>
                {/* Only for a resume actually on disk — the in-progress row for `resumeId` before
                    its first write has nothing to read a copy from yet. */}
                {saved.some((s) => s.id === r.id) && (
                  <button
                    onClick={() => duplicate(r.id)}
                    className="t-tap mt-4 ms-2 rounded-xl px-5 py-2.5 text-sm font-bold"
                    style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
                  >
                    {t.duplicate}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8">
        {rows.length > 0 && <div className="bd-label">{t.fresh}</div>}
        <StartCards
          lang={lang} state={state} dispatch={dispatch} owner={owner}
          /* `?entry=upload` comes from the home page's upload card. One addressable entry per
             door means the landing can point at the right one instead of at another product. */
          openImport={params.get("entry") === "upload"}
          onPicked={() => enter()}
          onNew={startNew}
        />
      </div>

      {rows.length === 0 && (
        <button onClick={() => enter()} className="btn-accent t-tap mt-6 rounded-xl px-5 py-2.5 text-sm font-bold">
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
