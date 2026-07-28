/**
 * Motion that cannot cost search traffic.
 *
 * ── why this suite exists at all ──
 *
 * The stated goal for this product is growth through organic search with no ad spend. Core Web Vitals
 * are a ranking input, so animation that costs INP or CLS costs traffic — it works directly against the
 * thing it decorates. That makes "is this animation cheap" a business assertion, not a taste one, and
 * business assertions belong in a test rather than in a comment somebody will overrule.
 *
 * It also protects the other direction. Earlier this session the old cinematic layer came out: a
 * blocking page transition, a canvas cosmos, a 1100ms step reveal. Nothing stops that returning one
 * `IntersectionObserver` at a time, and each addition would look individually reasonable.
 *
 * Asserted against the SOURCE, so a violation fails before it reaches a browser — a Lighthouse run
 * catches a regression after the fact and only if someone runs it.
 *
 *   node --experimental-strip-types ops/motion.test.mjs
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => {
  if (c) { pass++; console.log(`✅ ${n}`); }
  else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); }
};

const CSS = readFileSync("app/transitions.css", "utf8");
/**
 * Declarations only — a property named in a comment is documentation, not behaviour.
 *
 * This strips whole `/* … *\/` blocks rather than filtering lines that LOOK like comment lines, which
 * is what it did first and which failed immediately: the file's own header explains why animating
 * `filter: blur()` is banned, and a line-prefix filter left that sentence in the "declarations",
 * where a cross-line `[^;]*` match read it as an animated blur. A test that fires on the prose
 * forbidding a thing, rather than on the thing, is worse than no test — it trains you to delete the
 * explanation.
 */
const decls = CSS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/* A missing file reads as empty rather than throwing, so an assertion about its contents FAILS with
   its own name instead of taking the whole suite down with a stack trace. */
const read = (p) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };

/* ─────────── 1. only composited properties are animated ─────────── */

console.log("\n── nothing animated here can trigger layout ──");

/*
 * `transform` and `opacity` are composited: the compositor runs them off the main thread, so they cost
 * neither INP nor CLS. Everything else in this list moves boxes, and a box that moves after paint is
 * exactly what CLS measures.
 */
const LAYOUT_PROPS = ["width", "height", "top", "left", "right", "bottom", "margin", "padding",
  "font-size", "line-height", "inset", "gap", "flex-basis"];

{
  /* Only what a transition or animation actually drives — `width: 100%` as a static declaration is
     fine, `transition: width` is not. */
  const transitions = [...decls.matchAll(/transition:\s*([^;]+);/g)].map((m) => m[1]);
  const offenders = [];
  for (const t of transitions) {
    for (const p of LAYOUT_PROPS) {
      if (new RegExp(`(^|[,\\s])${p}([\\s,]|$)`).test(t)) offenders.push(`transition: ${t.trim()}`);
    }
  }
  ok("no transition drives a layout property", offenders.length === 0, offenders.slice(0, 3).join(" · "));

  /* `transition: all` is the same hazard wearing a shortcut: it animates every animatable property,
     including the layout ones, including ones added later by someone who never read this file. */
  ok("no `transition: all` anywhere", !/transition:\s*all\b/.test(decls));

  /* And inside keyframes. */
  const inKeyframes = [...decls.matchAll(/@keyframes[^{]*\{([\s\S]*?)\n\}/g)].map((m) => m[1]).join("\n");
  const kfOffenders = LAYOUT_PROPS.filter((p) => new RegExp(`^\\s*${p}\\s*:`, "m").test(inKeyframes));
  ok("no keyframe animates a layout property", kfOffenders.length === 0, kfOffenders.join(", "));
}

{
  /* Animating a blur re-rasterises the element every frame — the one paint-bound property expensive
     enough to show up on a mid-range Android. It was removed from this codebase once already. */
  ok("no animated filter/blur", !/(transition|animation)[^;]*filter/.test(decls));
  ok("and no blur inside a keyframe", !/@keyframes[\s\S]*?filter:\s*blur/.test(decls));
}

/* ─────────── 2. no JavaScript is involved ─────────── */

console.log("\n── the motion layer ships no JavaScript ──");

{
  /* The whole point. A scroll listener, a rAF loop or an IntersectionObserver reveal is main-thread
     work inside the window INP measures, and it is how a "small animation" becomes a ranking cost. */
  const files = readdirSync("app/components/build").filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"));
  const banned = [];
  for (const f of files) {
    const src = readFileSync(join("app/components/build", f), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
    if (/new IntersectionObserver|requestAnimationFrame|addEventListener\(\s*["']scroll/.test(code)) {
      banned.push(f);
    }
  }
  ok("no builder component runs a scroll listener, rAF loop or IntersectionObserver",
    banned.length === 0, banned.join(", "));

  /* No animation dependency either. */
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const libs = ["framer-motion", "motion", "gsap", "@react-spring/web", "lenis", "locomotive-scroll",
    "animejs", "aos", "react-transition-group"];
  const found = libs.filter((l) => deps[l]);
  ok("no animation library is installed", found.length === 0, found.join(", "));
}

/* ─────────── 3. entrances need no JS, via @starting-style ─────────── */

console.log("\n── entrances are declarative ──");

{
  ok("@starting-style carries the entrances", /@starting-style/.test(decls));
  /* Each entering effect needs BOTH the settled state and a starting-style block, or it either never
     animates or stays stuck at the start value. */
  for (const cls of ["t-reveal", "t-sheet", "t-scrim"]) {
    ok(`${cls} declares a settled state`, new RegExp(`\\.${cls}\\s*\\{`).test(decls));
    ok(`${cls} has a @starting-style`, new RegExp(`@starting-style[\\s\\S]{0,200}\\.${cls}`).test(decls));
  }
}

/* ─────────── 4. reduced motion switches everything OFF ─────────── */

console.log("\n── prefers-reduced-motion removes decoration, never information ──");

{
  const guard = decls.slice(decls.indexOf("prefers-reduced-motion"));
  ok("the guard exists", guard.length > 0);

  /* Every effect class must be named in it. An effect added below the guard would silently escape. */
  const classes = [...new Set([...decls.matchAll(/^\.(t-[a-z-]+)/gm)].map((m) => m[1]))];
  const missed = classes.filter((c) => !guard.includes(c));
  ok("every t-* class is switched off", missed.length === 0, missed.join(", "));
  ok("there is at least one effect to switch off", classes.length >= 7, `${classes.length} classes`);

  /* Off, not merely shortened: a 1ms shake is still a shake. */
  ok("animations are set to none, not to a tiny duration",
    /animation:\s*none/.test(guard) && !/animation-duration:\s*0?\.?0*1?ms/.test(guard));
  ok("transitions are set to none", /transition:\s*none/.test(guard));
  /*
   * And the settled values are restated. `@starting-style` supplies the pre-transition value; with the
   * transition removed the element would otherwise be stuck at opacity 0 — motion preferences would
   * make content INVISIBLE, which is the worst possible reading of an accessibility feature.
   */
  ok("the settled state is restored so nothing is left invisible",
    /\.t-reveal[^{]*\{[^}]*opacity:\s*1/.test(guard) || /t-reveal[\s\S]{0,120}opacity:\s*1/.test(guard));
}

/* ─────────── 5. the effects are wired to real gestures ─────────── */

console.log("\n── every effect is used, and used where something happens ──");

{
  const chip = read("app/components/build/SuggestionChip.tsx");
  const bar = read("app/components/build/StepBar.tsx");
  const shell = read("app/components/build/BuilderShell.tsx");

  /*
   * ── the rule this section exists to enforce now ──
   *
   * The core gesture of the builder had an animation and it never ran, for a reason no source check
   * here could see and no browser test was looking for: `onAdd()` removes the chip in the same commit
   * that adds the class, so the class lands on a node that is already gone. Proved by adding a class
   * and removing the element in one task — zero `animationstart`.
   *
   * The general rule is: AN EFFECT MUST NOT BE ATTACHED TO AN ELEMENT THAT THE SAME HANDLER REMOVES.
   * It cannot be checked in general from source, so it is checked at the one place it was broken, in
   * the shape that broke it — a local flag set beside the callback that unmounts the element.
   */
  ok("the chip does not animate itself on a click that removes it",
    !/setAccepted|t-accept/.test(chip), "the acknowledgement must be on the arrival, not the chip");
  ok("and the accept still fires immediately, so nothing is delayed", /onClick=\{onAdd\}/.test(chip));

  /* Where it went instead: a newly mounted row, which animates by construction. */
  const arrived = read("app/components/build/useJustArrived.ts");
  const details = read("app/components/build/DetailSections.tsx");
  const forms = read("app/components/build/FormSections.tsx");
  ok("the arrival animates", /\.t-land\s*\{/.test(decls));
  ok("via @starting-style, so no class toggle can race an unmount",
    /@starting-style[\s\S]{0,200}\.t-land/.test(decls));
  ok("gated to rows that were not there a render ago", /useJustArrived/.test(arrived));
  ok("and it is computed during render, or the class would arrive after the mount",
    !/useEffect/.test(arrived), "an effect runs one render too late for @starting-style");
  ok("wired where accepted credentials land", /t-land/.test(details));
  ok("and where accepted skills land", /t-land/.test(forms));

  /* iOS Safari does not apply `:active` on tap unless the element reads as interactive. Without this
     the press state never renders on the platform most of this product is used on. */
  ok("the tap class carries the iOS `:active` enabler", /\.t-tap\s*\{[^}]*cursor:\s*pointer/.test(decls));

  /* A number that changed must look changed — which needs the `key`, not the class. */
  ok("the step counter pops", /t-pop/.test(bar));
  ok("keyed on the value so React remounts it", /key=\{done\}/.test(bar));

  /* The save label, same mechanism. */
  ok("the save label swaps", /t-swap/.test(shell) && /key=\{saveLabel\}/.test(shell));

  /* The sheet had no entrance at all. */
  ok("the steps sheet enters", /t-sheet/.test(bar) && /t-scrim/.test(bar));

  /*
   * Nothing here should be defined and unused — an effect with no gesture is maintenance with no
   * payoff, which is the reason this is a dozen effects and not the reference's 18.
   *
   * ── the scan reads the whole app, and it did not always ──
   *
   * This used to list `app/components/build` only, which was true while every effect was a builder
   * effect. It stopped being true the moment motion reached the landing page and the catalogue, and
   * a scan with the wrong root does not report that an effect is unused — it reports that a USED
   * effect is unused, which is a failing test with nothing wrong behind it. Worse in the other
   * direction: had the sweep been narrowed again later, a genuinely dead effect in the builder would
   * still have been caught, so the fault would have looked like a flake rather than a hole.
   *
   * So it walks `app` entirely. Slower by a few milliseconds, and it cannot go stale when a
   * component moves.
   */
  const classes = [...new Set([...decls.matchAll(/^\.(t-[a-z-]+)/gm)].map((m) => m[1]))];
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.isFile() && /\.(tsx|ts|css)$/.test(e.name) && p !== "app/transitions.css" ? [p] : [];
  });
  const scanned = walk("app");
  /* A scan that found nothing would pass this assertion vacuously — the same failure mode that
     `ops/draftstore.test.mjs` shipped with earlier this session. */
  ok("the usage scan actually read the app", scanned.length > 50, `${scanned.length} files`);
  const all = scanned.map(read).join("\n");
  const unused = classes.filter((c) => !all.includes(c));
  ok("no effect is defined and never used", unused.length === 0, unused.join(", "));
}

/* ─────────── 6. the four traps in the scroll-driven and press work ─────────── */

console.log("\n── the entrance cannot switch off the press, and cannot cost the metric ──");

{
  const BUILD = read("app/build.css");
  const GLOBALS = read("app/globals.css");

  /*
   * ── trap 1: a filling animation outranks a normal declaration ──
   *
   * `.card` gets a scroll-driven entrance and, one section later, a hover lift and an `:active`
   * press. Written as `transform: translateY(20px) → none` with `animation-fill-mode: both`, the
   * entrance holds `transform: none` for the rest of the page's life and BEATS both gestures in the
   * cascade — so the same commit that added the press feedback would have removed it, on every card
   * in the product, invisibly.
   *
   * `translate` is an independent transform property: it composes with `transform` instead of
   * replacing it. This asserts the entrance keyframes never touch `transform`.
   */
  const entrance = [...decls.matchAll(/@keyframes\s+(t-enter-in|t-hero-in)[^{]*\{([\s\S]*?)\n\}/g)];
  ok("both entrance keyframes exist", entrance.length === 2, `${entrance.length} found`);
  const usesTransform = entrance.filter(([, name, body]) => /transform\s*:/.test(body)).map(([, n]) => n);
  ok("the entrance moves with `translate`, so it cannot cancel a press",
    usesTransform.length === 0, usesTransform.join(", "));

  /*
   * ── trap 2: LCP does not count an element painted at zero opacity ──
   *
   * The landing page's `<h1>` is its Largest Contentful Paint element and it sits inside `t-hero`.
   * A fade there moves this page's LCP later by the delay plus the duration — on the page the whole
   * no-advertising strategy depends on. The hero therefore rises WITHOUT fading.
   */
  const hero = entrance.find(([, n]) => n === "t-hero-in")?.[2] ?? "";
  ok("the hero entrance does not animate opacity", hero !== "" && !/opacity\s*:/.test(hero));

  /*
   * ── trap 3: no scroll-driven animation, at all ──
   *
   * `t-enter` was `animation-timeline: view()`. It was named in three crash reports from a real
   * iPhone, the last one specifically on scroll, with 9 live `ViewTimeline`s on the page. The
   * technique is cheap on Chromium and cannot be verified on WebKit from here, and WebKit is where
   * the crash was — so it is banned rather than tuned.
   *
   * This is a source rule because it has to be: no Chromium runtime check can measure the thing that
   * made it unsafe. Same reasoning as the backdrop-filter rule below.
   */
  const timelines = [...decls.matchAll(/animation-timeline\s*:/g)];
  ok("no scroll-driven animation anywhere", timelines.length === 0,
    `${timelines.length} animation-timeline declarations`);
  ok("and no view() or scroll() timeline function", !/\b(view|scroll)\(\s*\)/.test(decls));

  /* And the replacement must still be a real entrance rather than nothing: a settled state plus a
     `@starting-style`, like every other entrance in this file. */
  ok("t-enter declares a settled state", /^\.t-enter\s*\{/m.test(decls));
  ok("t-enter has a @starting-style", /@starting-style\s*\{[^}]*\.t-enter/.test(decls));

  /*
   * ── and the answer to page weight, which was asked for directly ──
   *
   * A catalogue page is nearly eight screens tall. `content-visibility: auto` lets the browser skip
   * rendering an off-screen section entirely while leaving it in the DOM, so it costs nothing for
   * search. It is useless without an intrinsic size — every deferred section would collapse to zero
   * height and the page would have no length — so both are asserted together.
   */
  const enterRule = decls.match(/^\.t-enter\s*\{([\s\S]*?)\n\}/m)?.[1] ?? "";
  ok("off-screen sections are not rendered", /content-visibility:\s*auto/.test(enterRule));
  ok("and they still have a height before they are", /contain-intrinsic-size:\s*auto/.test(enterRule));

  /*
   * ── trap 4: a stronger selector elsewhere silently replacing the shared press ──
   *
   * `.build-root .bd-continue:active` out-specifies `.t-tap:active`, so a `transform` written there
   * does not ADD to the shared press state, it replaces it — which is exactly what had happened on
   * the two most pressed buttons in the product, under a comment claiming to add feedback.
   */
  ok("build.css does not out-specify the shared press",
    !/\.build-root[^{]*:active[^{]*\{[^}]*transform/.test(BUILD.replace(/\/\*[\s\S]*?\*\//g, "")));

  /* And the ghost's counterpart: `.btn-ghost` needs `transform` in ITS transition, because this file
     is @import-ed at the top of globals.css and loses every same-specificity tie to it. */
  const ghost = GLOBALS.replace(/\/\*[\s\S]*?\*\//g, "").match(/\.btn-ghost\s*\{([^}]*)\}/)?.[1] ?? "";
  ok("the ghost button can ease its press", /transition:[^;]*transform/.test(ghost));

  /*
   * ── trap 5: a blur on an element that repeats, which no Chromium check can see ──
   *
   * `.card` carried `backdrop-filter: blur(14px)`. It is the most repeated element in the product —
   * 50 on one catalogue page, across 357 catalogue pages — so that single declaration asked iOS for
   * fifty backdrop snapshots and fifty blur passes on one screen. Measured by selector: 51 blurred
   * elements, 1.42 megapixels, at 390px wide. It closed the browser on a real iPhone.
   *
   * It was invisible to every check that ran, and not by accident. The build emits ONLY the
   * prefixed form — `-webkit-backdrop-filter` — which Blink ignores and WebKit requires. So the
   * browser sweep, which has Chromium and nothing else, measured zero blurs on a page that renders
   * fifty of them on the device the product is actually used on. A cross-engine hole a runtime
   * check cannot close is one the SOURCE has to.
   *
   * The rule is the COUNT, not the effect. A blur on a page's single sticky header is one snapshot
   * and is fine. A blur on a class that appears once per list item is a cost that grows with the
   * content, and the busiest page becomes the most expensive one.
   */
  const REPEATS = ["card", "tpl-card", "bd-sug", "bd-chip", "bd-confirmed", "bd-chip-group"];
  const cssFiles = ["app/globals.css", "app/build.css", "app/transitions.css"];
  const blurred = [];
  for (const f of cssFiles) {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const cls of REPEATS) {
      /* The declaration must fall inside THIS class's own block, so a blur three rules later does
         not read as this rule's. */
      const m = src.match(new RegExp(`\\.${cls}\\s*\\{([^}]*)\\}`));
      if (m && /backdrop-filter/.test(m[1])) blurred.push(`${f} .${cls}`);
    }
  }
  ok("no blur on a class that repeats per item", blurred.length === 0, blurred.join(", "));

  /* And the positive half, so the assertion above cannot pass by the blurs simply being gone: the
     singleton surfaces that legitimately blur must still do so. */
  const g = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
  ok("the one-per-page surfaces still blur",
    /\.ps-header\s*\{[^}]*backdrop-filter/.test(g) && /\.glass-surface\s*\{[^}]*backdrop-filter/.test(g));

  /* The two infinite animations are the only thing saying a request is still open, so the guard must
     replace them rather than merely stopping them — a stopped ring mid-fade is invisible. */
  const guard = decls.slice(decls.indexOf("prefers-reduced-motion: reduce"));
  ok("the busy ring survives reduced motion as a static ring", /\.t-busy::after\s*\{[^}]*opacity/.test(guard));
}


/*
 * ── the full-screen scene must contain focus, not merely claim to ──
 *
 * `CinematicIntro` is a `role="dialog"` covering the whole viewport in black. It locked scroll and
 * put initial focus on Skip, and stopped there: one Tab press walked focus into the navigation
 * underneath — links that are covered, unreadable and still focusable and clickable. `aria-modal`
 * without a barrier is a claim the markup does not honour, so both halves are asserted together.
 *
 * Source-asserted rather than measured in a browser because the intro plays once per tab session and
 * a Playwright run that has already seen it never mounts it again.
 */
{
  const src = read("app/components/landing/CinematicIntro.tsx");
  ok("the intro still declares itself a dialog", /role="dialog"/.test(src));
  ok("and now says it is modal", /aria-modal="true"/.test(src));
  ok("everything outside it is made inert while it plays", /setAttribute\("inert", ""\)/.test(src));
  ok("and inert is lifted again on the way out", /removeAttribute\("inert"\)/.test(src));
  /* The barrier is only honest if it goes up for the whole scene: applied in the same effect that
     locks scroll, removed in the same cleanup that restores it. */
  const eff = src.slice(src.indexOf("document.body.style.overflow = \"hidden\""));
  ok("the barrier and the scroll lock share one lifetime",
    eff.indexOf("setAttribute(\"inert\"") > 0
    && eff.indexOf("removeAttribute(\"inert\"") > eff.indexOf("style.overflow = prevB"));
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
