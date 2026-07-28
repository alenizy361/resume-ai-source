"use client";

/**
 * The frame every builder step renders inside.
 *
 * It owns what the steps must not each own a copy of: the header with the save indicator,
 * the one progress bar, the live preview, and the Edit/Preview toggle on a phone. Because it
 * is rendered by the layout it stays mounted across step navigations, so the preview does not
 * remount and re-measure an A4 page every time the user presses Continue.
 *
 * ── the URL "repair" that used to live here, and why it is gone ──
 *
 * `/builder/<id>/<step>` is addressable, which means the id can be wrong — a stale bookmark, a
 * shared link, a hand-typed guess. This component used to watch for `urlId !== resumeId` (its own
 * `usePathname()` parse against the context's loaded id) and `router.replace` the URL to match.
 *
 * That was safe only as long as `BuilderProvider` never actually reacted to the URL — which, until
 * it was fixed, it never did (see `BuilderProvider.tsx`'s own note: its `resumeId` prop was accepted
 * but never once passed by anything that rendered it). Once `BuilderProvider` was fixed to hydrate
 * FOR the URL's id — which is what makes switching resumes work at all — the two mechanisms started
 * fighting: on the render right after a navigation to a new id, this component's effect (a CHILD,
 * so its effects commit before the parent's) still read the STALE `resumeId` from the previous
 * resume, saw a "mismatch" against the new URL, and replaced the URL back to the old id before
 * `BuilderProvider`'s own hydration effect — the parent, committing after — had a chance to catch
 * up. The result was a `router.replace` racing a `router.push`, and the replace, running first,
 * always won: "Build a new CV" and "Duplicate → tailor for a job" would write a new draft, navigate
 * to it, and immediately get bounced back to the old one.
 *
 * `BuilderProvider` hydrating FOR whatever id is in the URL (creating an empty draft under an id it
 * does not recognise rather than refusing it) makes this component's OWN correction unreachable in
 * every legitimate case: `wanted` there always resolves to `urlId` first, whenever the URL has one.
 * A second, independent "corrector" wasn't defending against a real remaining case — it was a stale
 * duplicate of a mechanism that had already moved to where the id resolution actually happens, and
 * it was actively wrong exactly when a switch was in flight.
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
 * **Back and Continue live in one fixed bar** — `StepActions`, rendered HERE rather than by the
 * step. That placement is load-bearing: switching to the preview unmounts the step, and while the
 * bar lived inside it the two controls vanished with it, leaving no way to continue from the
 * preview at all. The page reserves exactly the bar's height beneath the content (`--bd-bar`)
 * rather than the guessed `pb-24` it used to.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import ResumeTemplate from "../ResumeTemplate";
import BrandOrb from "../BrandOrb";
import useMediaQuery, { DESKTOP } from "../useMediaQuery";
import VersionSwitch from "./VersionSwitch";
import StepBar from "./StepBar";
import StepActions from "./StepActions";
import { useBuilder } from "./BuilderProvider";
import { lifecycleLabel, lifecycleTone } from "@/app/lib/lifecycle";
import { useEntitlement } from "@/app/lib/useEntitlement";
import { shouldShowWatermark } from "@/app/lib/entitlement";
import { stepFromSlug } from "./steps";

const CHROME = {
  en: {
    brand: "Sira",
    offline: "Offline — your work is saved on this device",
    keepIt: "Sign in to keep this CV",
    keepWhy: "Without an account this CV is kept on this device for this visit only.",
    edit: "Edit", preview: "Preview",
    emptyPreview: "Your CV appears here as you fill it in.",
  },
  ar: {
    brand: "سيرة",
    offline: "بلا اتصال — عملك محفوظ على جهازك",
    keepIt: "سجّل الدخول لتحتفظ بهذه السيرة",
    keepWhy: "بدون حساب، تبقى هذه السيرة على هذا الجهاز لهذه الزيارة فقط.",
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
  const { state, lifecycle, online, resumeId, owner, previewText, viewLang, template } = useBuilder();
  /*
   * The pane's ResumeTemplate has a real, working designed-PDF button, so it needs the same two
   * facts DesignSection's instance already wires: whether this visitor has paid (the component
   * fail-closes to a watermark when the prop is absent — right for free users, wrong for paying
   * ones, who were getting a marked file from this button on every step), and — via `viewLang`
   * below — which language is actually being RENDERED, not merely declared.
   */
  const { entitlement, loading: entLoading } = useEntitlement();
  const tone = lifecycleTone(lifecycle);
  const pathname = usePathname() || "";
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
  /* One expression, named, so the `key` above and the text below cannot disagree. */
  const saveLabel = lifecycle === "invalidResume" ? lifecycleLabel(lifecycle, lang)
    : !online ? t.offline
      : lifecycleLabel(lifecycle, lang);

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
            {/* Keyed on the label so React remounts it when the words change: Saving → Saved reads as a
                transition rather than a silent substitution. `t-swap` is a fade-and-rise, no layout. */}
            <span key={saveLabel} className={`bd-save t-swap${tone !== "quiet" ? " err" : ""}`}>
              {saveLabel}
            </span>
          </div>
          {/*
            ── the one thing an anonymous visitor must be told ──

            Anonymous work now lasts the visit and no longer reappears weeks later, which is the
            right behaviour and is also a promise quietly withdrawn. Saying "Saved" and nothing else
            would be the product knowing that and letting the user find out by losing a CV.

            So it is stated where the save label is — the exact place someone looks to ask "is my
            work safe" — and it is a LINK, because the sentence is only fair if the remedy is one
            tap away. It is not shown to a signed-in user, for whom none of it is true.

            `owner` is `""` until the session is known, so nothing is claimed before there is an
            answer: the line appears only once `anon` is established, never as a flash.
          */}
          {owner === "anon" && onStep && (
            <div className="bd-keep">
              <span>{t.keepWhy}</span>
              <Link href={ar ? "/ar/login" : "/login"} className="bd-keep-link t-tap">{t.keepIt}</Link>
            </div>
          )}
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
                             whole preview mid-build. From `viewLang`, NOT the declared `cv` —
                             `previewText` follows the active version (the VersionSwitch directly
                             above), and reading the declared language here rendered the English
                             version of an Arabic CV right-to-left. Same rule DesignSection
                             already states: direction follows the version being VIEWED. */
                          dir={viewLang === "ar" ? "rtl" : "ltr"}
                          watermark={entLoading || shouldShowWatermark(entitlement)}
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

              {/*
                One action bar for every step, and it lives HERE rather than inside the step so
                that switching to the preview — which unmounts the step — cannot take it away.
              */}
              <StepActions step={step} />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
