/**
 * The step map, checked without a browser.
 *
 * `ops/steps.test.mjs` drives the real journey and is the test that matters, but it needs
 * a running server and forty seconds. These are the assertions that can be made in
 * milliseconds and that fail for the reason a heading went blank on the homepage: a
 * `SectionId` with no copy behind it.
 *
 * TypeScript already catches a MISSING key — `SECTION_COPY` is written with `satisfies`,
 * so omitting one is a build error. What it cannot catch is a key that is present and
 * empty, a nav label long enough to break the rail, an alias pointing at a step that no
 * longer exists, or the order drifting out of the URL space. Those are here.
 *
 *   node --experimental-strip-types ops/stepmap.test.mjs
 */

import {
  STEPS, ORDER, SECTION_COPY, stepFromSlug, stepIndex, nextStep, prevStep,
  stepHref, builderHome,
} from "../app/components/build/steps.ts";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };

/* ── the order ── */

ok("there are eleven steps", STEPS.length === 11, String(STEPS.length));
ok("`start` is not one of them — it is the /builder landing", !STEPS.includes("start"));
ok("ORDER is start plus the steps", ORDER.length === 12 && ORDER[0] === "start");
ok("the target job comes first, because everything else is suggested from it",
  STEPS[0] === "target");
ok("download comes last", STEPS[STEPS.length - 1] === "design");
ok("no step appears twice", new Set(STEPS).size === STEPS.length);

/* ── copy ── */

for (const lang of ["en", "ar"]) {
  const c = SECTION_COPY[lang];
  const blank = [];
  for (const s of ORDER) {
    if (!c.sections[s]?.trim()) blank.push(`sections.${s}`);
    if (!c.subs[s]?.trim()) blank.push(`subs.${s}`);
    if (!c.nav[s]?.trim()) blank.push(`nav.${s}`);
  }
  ok(`${lang}: every section has a heading, a subtitle and a nav label`,
    blank.length === 0, blank.join(" · "));

  const long = ORDER.filter((s) => c.nav[s].length > 14);
  // The nav labels sit in a 208px column and in a horizontal scroller on a tablet. A
  // sentence in that slot wraps and pushes the column, which is how a rail stops
  // reading as a rail.
  ok(`${lang}: nav labels are short enough for the rail`, long.length === 0,
    long.map((s) => `${s}="${c.nav[s]}"`).join(" · "));
}

/*
 * The blank heading this whole guard exists for.
 *
 * `blueprint` was in the order and in neither copy table, and the cast said `as` rather
 * than `satisfies`, so the compiler stopped checking and `/` shipped an empty `<h2>`.
 * Named explicitly because a general "no key is empty" check would still pass if someone
 * removed the step from ORDER instead of fixing the copy.
 */
ok("the blueprint step has real copy in both languages",
  SECTION_COPY.en.sections.blueprint.length > 4 && SECTION_COPY.ar.sections.blueprint.length > 4);

/* ── slugs ── */

ok("every step resolves from its own name",
  STEPS.every((s) => stepFromSlug(s) === s));
ok("slugs are case-insensitive", stepFromSlug("TARGET") === "target");
ok("`export` is an alias for the download step", stepFromSlug("export") === "design");
ok("`download` too", stepFromSlug("download") === "design");
ok("an unknown slug resolves to nothing", stepFromSlug("qualifications") === null);
ok("and so does an empty one", stepFromSlug("") === null);
ok("`start` is not addressable as a step", stepFromSlug("start") === null);

/* ── walking ── */

ok("the first step has nothing before it", prevStep(STEPS[0]) === null);
ok("the last step has nothing after it", nextStep(STEPS[STEPS.length - 1]) === null);
ok("next and prev are inverses all the way along",
  STEPS.slice(0, -1).every((s) => prevStep(nextStep(s)) === s));
ok("stepIndex agrees with the array", STEPS.every((s, i) => stepIndex(s) === i));

/* ── hrefs ── */

ok("an English step href", stepHref("en", "r1", "summary") === "/builder/r1/summary");
ok("an Arabic step href", stepHref("ar", "r1", "summary") === "/ar/builder/r1/summary");
ok("the landing pages", builderHome("en") === "/builder" && builderHome("ar") === "/ar/builder");
/* A resume id reaches this from a URL segment, so it is already user-influenced. */
ok("an id with a slash in it cannot escape its segment",
  stepHref("en", "a/b", "target") === "/builder/a%2Fb/target");

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
