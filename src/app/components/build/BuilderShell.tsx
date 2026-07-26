"use client";

/**
 * The frame every builder step renders inside.
 *
 * It owns what the steps must not each own a copy of: the header with the save indicator,
 * the one progress bar, the live preview, and the Edit/Preview toggle on a phone. Because it
 * is rendered by the layout it stays mounted across step navigations, so the preview does not
 * remount and re-measure an A4 page every time the user presses Continue.
 *
 * It also repairs the URL. `/builder/<id>/<step>` is addressable, which means the id can be
 * wrong — a stale bookmark, a shared link, a hand-typed guess. The stored draft is the truth,
 * so a mismatched id is rewritten with `router.replace` rather than either 404ing or silently
 * building a resume the user cannot find again.
 *
 * ── what changed, and why ──
 *
 * **Four progress indicators became one.** A rail of eleven segments in the header, the full
 * step list with all eleven names, "Step 4 of 11" in the form column, and the index again in
 * a circle in the step heading. `StepBar` replaces all four.
 *
 * **The step list is no longer a second scroll container.** On a phone it was a horizontal
 * scroller holding eleven labels end to end in a 390px viewport — so a swipe that started on
 * it scrolled the list instead of the page, and the names appeared to run off the screen. It
 * is a sheet now, opened from a button.
 *
 * **The preview is MOUNTED conditionally, not hidden with CSS.** It used to be hidden with
 * `display: none`, which hides an element without unmounting it: on every phone, in edit
 * mode, `ResumeTemplate` was parsing the CV and re-laying out an A4 page behind a
 * `ResizeObserver` on every keystroke, for a box nobody could see.
 *
 * **Back and Continue live in one fixed bar** (`StepActions`, rendered by the step), so they
 * cannot scroll under the browser's bottom chrome, and the page reserves exactly the bar's
 * height beneath the content rather than a guessed `pb-24`.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import ResumeTemplate from "../ResumeTemplate";
import BrandOrb from "../BrandOrb";
import useMediaQuery, { DESKTOP } from "../useMediaQuery";
import VersionSwitch from "./VersionSwitch";
import StepBar from "./StepBar";
import { useBuilder } from "./BuilderProvider";
import { lifecycleLabel, lifecycleTone } from "@/app/lib/lifecycle";
import { stepFromSlug, stepHref } from "./steps";

const CHROME = {
  en: {
    brand: "Sira",
    offline: "Offline — your work is saved on this device",
    edit: "Edit", preview: "Preview",
    emptyPreview: "Your CV appears here as you fill it in.",
  },
  ar: {
    brand: "سيرة",
    offline: "بلا اتصال — عملك محفوظ على جهازك",
    edit: "تعديل", preview: "معاينة",
    emptyPreview: "ستظهر سيرتك هنا وأنت تكتب.",
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
  const { state, lifecycle, online, resumeId, hydrated, previewText, cv, template } = useBuilder();
  const tone = lifecycleTone(lifecycle);
  const pathname = usePathname() || "";
  const router = useRouter();
  const isDesktop = useMediaQuery(DESKTOP);

  /* The last two segments of `/builder/<id>/<step>` — absent on the landing page. */
  const parts = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  const step = parts.length >= 2 ? stepFromSlug(parts[parts.length - 1]) : null;
  const urlId = step ? decodeURIComponent(parts[parts.length - 2]) : "";
  const onStep = step !== null;

  /*
   * Repair a wrong id in the URL, once hydration knows the right one.
   *
   * `replace`, not `push`: the wrong URL should not become a Back destination, or the user's
   * own Back button would bounce them straight into the redirect again.
   */
  useEffect(() => {
    if (!hydrated || !onStep || !resumeId || !step) return;
    if (urlId === resumeId) return;
    router.replace(stepHref(lang, resumeId, step));
  }, [hydrated, onStep, resumeId, urlId, step, lang, router]);

  /*
   * Start every step at the top.
   *
   * Next scrolls the changed SEGMENT into view, and the changed segment is the step — so
   * everything this layout renders above it went off-screen on arrival. Measured at 390px: the
   * Edit/Preview toggle sat at y = -31 and the step navigation at y = 29, under a 52px sticky
   * header. The navigations pass `scroll={false}` so Next does not fight this.
   *
   * `behavior: "auto"`, and the global `scroll-behavior: smooth` that used to override it is
   * gone: an animated scroll here meant the OLD content slid upward for 200-odd milliseconds
   * while the new step was already rendering, which is what made Continue feel slow.
   */
  useEffect(() => { window.scrollTo({ top: 0, behavior: "auto" }); }, [pathname]);

  /*
   * Which pane a phone is showing, reset on every step change.
   *
   * Arriving at a new step still in Preview mode shows a CV and no form, which reads as a
   * broken Continue rather than as a preference expressed two steps ago. The reset is carried
   * in the state itself — the path the choice was made on — rather than by an effect that
   * calls setState on every navigation.
   */
  const [pane, setPane] = useState({ path: pathname, view: "edit" as "edit" | "preview" });
  const mobileView = pane.path === pathname ? pane.view : "edit";
  const setMobileView = (view: "edit" | "preview") => setPane({ path: pathname, view });

  /*
   * THE mount decision, and the reason `useMediaQuery` exists.
   *
   * On a desktop the preview is a third column and is always there. On a phone it exists only
   * while the user is looking at it — unmounted, not hidden, so nothing parses the CV or
   * observes a box that is off screen.
   */
  const showPreview = onStep && (isDesktop || mobileView === "preview");
  const showForm = !onStep || isDesktop || mobileView === "edit";

  return (
    <div className="build-root" dir={ar ? "rtl" : "ltr"}>
      <main className="bd-page">
        <header className="bd-header">
          <div className="bd-header-in">
            <Link href={ar ? "/ar" : "/"} className="flex items-center gap-2">
              <BrandOrb size={26} />
              <span className="text-sm font-extrabold">{t.brand}</span>
            </Link>
            {/*
              One label, two questions, in the order that matters. A draft that could not be
              READ outranks a connection that dropped, which outranks the ordinary save state:
              each is a different answer to "is my work safe", and the most serious true one is
              the one to print. The draft is safe offline — every write is local — so that
              sentence says where it is rather than apologising.
            */}
            <span className={`bd-save${tone !== "quiet" ? " err" : ""}`}>
              {lifecycle === "invalidResume" ? lifecycleLabel(lifecycle, lang)
                : !online ? t.offline
                : lifecycleLabel(lifecycle, lang)}
            </span>
          </div>
        </header>

        <div className="bd-main">
          {!onStep ? children : (
            <>
              {/* The one progress indicator, and the only door to another step. */}
              <StepBar lang={lang} step={step} state={state} resumeId={resumeId || urlId} />

              <div className="bd-pane-toggle">
                {(["edit", "preview"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setMobileView(v)}
                    aria-pressed={mobileView === v}
                    className="bd-pane-btn"
                    data-on={mobileView === v ? "1" : undefined}
                  >
                    {v === "edit" ? t.edit : t.preview}
                  </button>
                ))}
              </div>

              <div className="bd-step-cols">
                {showForm && <div className="bd-form">{children}</div>}

                {showPreview && (
                  <aside className="bd-preview">
                    <div className="card overflow-hidden p-2">
                      {/* Above the preview, so the thing it controls is directly below it. */}
                      <VersionSwitch />
                      {previewText.trim() ? (
                        <ResumeTemplate
                          text={previewText}
                          name={state.profile.name || "resume"}
                          variant={template.variant}
                          accent={template.accent}
                          /* Explicit: detectDir guesses, and on a half-empty draft it flips the
                             whole preview mid-build. */
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
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
