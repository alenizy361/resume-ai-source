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
  const read = (p) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };
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

  /* Nothing here should be defined and unused — an effect with no gesture is maintenance with no
     payoff, which is the reason this is 8 effects and not the reference's 18. */
  const classes = [...new Set([...decls.matchAll(/^\.(t-[a-z-]+)/gm)].map((m) => m[1]))];
  const all = readdirSync("app/components/build")
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => read(join("app/components/build", f))).join("\n")
    + read("app/components/build/FormSections.tsx");
  const unused = classes.filter((c) => !all.includes(c));
  ok("no effect is defined and never used", unused.length === 0, unused.join(", "));
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
