"use client";

/**
 * The frame every builder step renders inside.
 *
 * It owns four things the individual steps must not each own a copy of: the header with
 * the save indicator and the chat door, the step navigation, the live preview, and the
 * Edit/Preview toggle on mobile. Because it is rendered by the layout it stays mounted
 * across step navigations, so the preview does not remount and re-measure an A4 page
 * every time the user presses Continue.
 *
 * It also repairs the URL. `/builder/<id>/<step>` is addressable, which means the id can
 * be wrong — a stale bookmark, a shared link, a hand-typed guess. The stored draft is
 * the truth, so a mismatched id is rewritten to the real one with `router.replace`
 * rather than either 404ing or silently building a resume the user cannot find again.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { track } from "@vercel/analytics";

import ResumeTemplate from "../ResumeTemplate";
import OrbBrand from "../OrbBrand";
import { stepMark } from "@/app/lib/stepReady";
import VersionSwitch from "./VersionSwitch";
import { setBuilderMode } from "@/app/lib/flags";
import { useBuilder } from "./BuilderProvider";
import { STEPS, SECTION_COPY, stepFromSlug, stepHref, stepIndex } from "./steps";
import { toArabicDigits } from "@/app/lib/plans";

const CHROME = {
  en: {
    brand: "Sira",
    chat: "Talk to the AI instead",
    saving: "Saving…", saved: "Saved", failed: "Save failed — your work is still on screen",
    edit: "Edit", preview: "Preview",
    emptyPreview: "Your CV appears here as you fill it in.",
    steps: "Steps",
    of: (i: number, n: number) => `Step ${i} of ${n}`,
  },
  ar: {
    brand: "سيرة",
    chat: "أفضّل المحادثة",
    saving: "يحفظ…", saved: "محفوظ", failed: "تعذّر الحفظ — عملك لا يزال أمامك",
    edit: "تعديل", preview: "معاينة",
    emptyPreview: "ستظهر سيرتك هنا وأنت تكتب.",
    steps: "الخطوات",
    of: (i: number, n: number) => `الخطوة ${toArabicDigits(i)} من ${toArabicDigits(n)}`,
  },
};

export default function BuilderShell({
  lang, children,
}: {
  lang: "ar" | "en";
  children: React.ReactNode;
}) {
  const t = CHROME[lang];
  const ar = lang === "ar";
  const { state, save, resumeId, hydrated, previewText, cv, template, progress } = useBuilder();
  const pathname = usePathname() || "";
  const router = useRouter();

  /* The last two segments of `/builder/<id>/<step>` — absent on the landing page. */
  const parts = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  const step = parts.length >= 2 ? stepFromSlug(parts[parts.length - 1]) : null;
  const urlId = step ? decodeURIComponent(parts[parts.length - 2]) : "";
  const onStep = step !== null;

  /*
   * Repair a wrong id in the URL, once hydration knows the right one.
   *
   * `replace`, not `push`: the wrong URL should not become a Back destination, or the
   * user's own Back button would bounce them straight into the redirect again.
   */
  useEffect(() => {
    if (!hydrated || !onStep || !resumeId || !step) return;
    if (urlId === resumeId) return;
    router.replace(stepHref(lang, resumeId, step));
  }, [hydrated, onStep, resumeId, urlId, step, lang, router]);

  /*
   * Which pane a phone is showing, reset on every step change.
   *
   * Arriving at a new step still in Preview mode shows a CV and no form, which reads as
   * a broken Continue rather than as a preference expressed two steps ago.
   *
   * The reset is carried in the state itself — the path the choice was made on — rather
   * than by an effect that calls setState on every navigation. Same behaviour, one fewer
   * render, and the invariant is visible in the value instead of living in a hook.
   */
  /*
   * Start every step at the top of the page.
   *
   * Next scrolls the changed SEGMENT into view, and the changed segment is the step — so
   * everything this layout renders above it went off-screen on arrival. Measured at 390px:
   * the Edit/Preview toggle sat at y = -31 and the step navigation at y = 29, underneath a
   * 52px sticky header. Both present, both unreachable without scrolling up, which reads as
   * a builder with no navigation at all on a phone.
   *
   * The navigations themselves pass `scroll={false}` so Next does not fight this.
   */
  useEffect(() => { window.scrollTo({ top: 0, behavior: "auto" }); }, [pathname]);

  const [pane, setPane] = useState({ path: pathname, view: "edit" as "edit" | "preview" });
  const mobileView = pane.path === pathname ? pane.view : "edit";
  const setMobileView = (view: "edit" | "preview") => setPane({ path: pathname, view });

  const nav = SECTION_COPY[lang].nav;

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
                <span className={`bd-save${save === "failed" ? " err" : ""}`}>
                  {save === "saving" ? t.saving : save === "saved" ? t.saved : save === "failed" ? t.failed : ""}
                </span>
                <Link
                  href={ar ? "/ar/journey" : "/journey"}
                  onClick={() => { setBuilderMode("chat"); track("builder_chose_chat_door", {}); }}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold"
                  style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
                >
                  {t.chat}
                </Link>
              </div>
            </div>
            {/* The rail reports how much of the CV exists, which is not the same as how
                many steps have been visited — a visited step with nothing typed into it
                has produced nothing, and the rail should not claim otherwise. */}
            {/* A visited step whose data does not validate gets a WARNING segment, not a filled
                one. Drawing both from `sectionsDone` alone is half of the contradiction a user
                photographed: Target Job ticked, and Skills saying the job title was missing. */}
            <div className="bd-rail mt-2.5" aria-label={`${progress}%`}>
              {STEPS.map((s) => {
                const mark = stepMark(s, state, step ?? "start");
                return <i key={s} className={mark === "done" ? "on" : mark === "warn" ? "warn" : ""} />;
              })}
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-6xl px-5 pb-24 pt-6">
          {!onStep ? children : (
            <>
              <div className="mb-4 flex gap-2 lg:hidden">
                {(["edit", "preview"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setMobileView(v)}
                    className="flex-1 rounded-full px-3 py-2 text-xs font-semibold"
                    style={mobileView === v
                      ? { background: "var(--accent)", color: "#fff" }
                      : { background: "var(--surface)", color: "var(--muted)", border: "1px solid var(--line)" }}
                  >
                    {v === "edit" ? t.edit : t.preview}
                  </button>
                ))}
              </div>

              <div className="bd-step-cols">
                <nav className={`bd-nav${mobileView === "preview" ? " hide" : ""}`} aria-label={t.steps}>
                  <ol>
                    {STEPS.map((s, i) => {
                      /*
                       * `done` is now DERIVED, and that is the fix rather than a refinement.
                       *
                       * `sectionsDone` records that the user pressed Continue. It never checked
                       * whether the step's data could support the claim, so pressing Continue on an
                       * empty form earned a tick — and a later step that genuinely needed that data
                       * had to contradict the tick out loud. One validator now answers both.
                       */
                      const mark = stepMark(s, state, step ?? "start");
                      const done = mark === "done";
                      const warn = mark === "warn";
                      const here = s === step;
                      return (
                        <li key={s}>
                          <Link
                            href={stepHref(lang, resumeId || urlId, s)}
                            scroll={false}
                            className={here ? "on" : undefined}
                            aria-current={here ? "step" : undefined}
                          >
                            <span className={`bd-tick${done ? " done" : warn ? " warn" : ""}`}>
                              {done ? "✓" : warn ? "!" : ar ? toArabicDigits(i + 1) : i + 1}
                            </span>
                            {nav[s]}
                          </Link>
                        </li>
                      );
                    })}
                  </ol>
                </nav>

                <div className={`bd-form${mobileView === "preview" ? " hide" : ""}`}>
                  <p className="bd-step-count mb-2">
                    {t.of(stepIndex(step) + 1, STEPS.length)}
                  </p>
                  {children}
                </div>

                <aside className={`bd-preview${mobileView === "edit" ? " hide" : ""}`}>
                  <div className="card overflow-hidden p-2">
                    {/* Above the preview, so the thing it controls is directly below it. */}
                    <VersionSwitch />
                    {previewText.trim() ? (
                      <ResumeTemplate
                        text={previewText}
                        name={state.profile.name || "resume"}
                        variant={template.variant}
                        accent={template.accent}
                        /* Explicit: detectDir guesses, and on a half-empty draft it flips
                           the whole preview mid-build. */
                        dir={cv === "ar" ? "rtl" : "ltr"}
                        fitWidth
                      />
                    ) : (
                      <div className="p-8 text-center text-xs" style={{ color: "var(--faint)" }}>
                        {t.emptyPreview}
                      </div>
                    )}
                  </div>
                </aside>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

