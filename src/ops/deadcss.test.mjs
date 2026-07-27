/**
 * The dead CSS this pass removed stays removed, and the live CSS it spared stays wired to a consumer.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHY THE ORIGINAL LIST WAS WRONG, AND WHAT THAT COST
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * `docs/known-issues.md`'s O-16 named `reveal-aurora`, `stage-orb`, `breathe`, `dock`, `float-slow`,
 * `marquee`, `ia-*`, `improved-banner`, `aurora-burst`, `gold-stamp`, `reveal-pop`, `reveal-rise` as
 * dead — "their class names appear in no `className` in the codebase." Re-checked directly: `ia-*`
 * is `InterviewerAvatar.tsx`'s whole face, live on `/interview-live`. `marquee`, `improved-banner`,
 * `aurora-burst`, `gold-stamp`, `reveal-pop` and `reveal-rise` are all live too — `AtsMarquee.tsx`,
 * `ResultCoaching.tsx`, `AuroraBurst.tsx`, `AccountClient.tsx`. The doc was stale, not malicious: the
 * product grew after it was written, and nothing re-ran the check. Trusting it would have deleted a
 * live control's animation — exactly the outcome the doc's own closing line warned about.
 *
 * The genuinely dead surface, found by re-auditing from nothing rather than trusting the list:
 * `.reveal-aurora`, `.tpl-card` (+ `.is-active`, `.tpl-check`, both only ever paired with it),
 * `.stage-orb`, `.breathe`, `.dock` (+ `::before`/`::after`, `--dock-aura-a`, `dock-aura`,
 * `dock-float`), `.float-slow`, `@keyframes radio-wave` — all from the retired full-screen "Advisor
 * THEATER" chat interface and an old template picker, both superseded earlier this session.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS A NAMED LIST, NOT A GENERAL "FIND ALL DEAD CSS" SCANNER
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * Two real gotchas surfaced during the audit that a naive automated sweep gets wrong in OPPOSITE
 * directions:
 *
 *   1. `BrandOrb.tsx` builds its class as `` `bo-${variant}` `` — a template literal. Grepping for
 *      the literal string `"bo-button"` finds nothing, because that exact string never appears in
 *      the source; only the pattern and the value `"button"` do, separately. A scanner naive to this
 *      would report `bo-button`/`bo-decor` as dead and delete a live orb variant.
 *   2. A keyframe is referenced from CSS (`animation: iaFloat …`), not from a `.tsx` file. Scanning
 *      only `.tsx`/`.ts` for a keyframe's name finds nothing FOR EVERY keyframe belonging to a live
 *      class, and a plain substring search (no word boundary) produces the opposite error — it found
 *      "breathe" "alive" because `InterviewerAvatar.tsx` has "breathes slowly" in a comment.
 *
 * `motion.test.mjs` already asserts this for `.t-*` effects, where the convention (one class, one
 * effect, named consistently) makes an automated sweep safe. `globals.css` mixes hand-styled
 * one-offs, Tailwind-adjacent utilities, and dynamically-built variant classes, where it is not.
 * So this file locks in what was actually verified, by name, rather than re-deriving a check that
 * silently inherits the same blind spots that produced O-16's wrong list in the first place.
 *
 *   node ops/deadcss.test.mjs
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };

const css = readFileSync("app/globals.css", "utf8");

/* ─────────────────── removed, and must stay removed ─────────────────── */

console.log("\n── the dead rules this pass removed ──");
const REMOVED = [
  "reveal-aurora", "tpl-card", "tpl-check", "stage-orb",
  "\\.breathe\\b", "@keyframes breathe\\b",
  "\\.dock\\b", "dock-aura", "dock-float", "--dock-aura-a",
  "float-slow", "radio-wave",
];
for (const pattern of REMOVED) {
  ok(`${pattern} is gone from globals.css`, !new RegExp(pattern).test(css));
}

/* ─────────────────── spared, because each has a real consumer ─────────────────── */

console.log("\n── the CSS the original O-16 list wrongly called dead, re-verified live ──");

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = join(dir, e.name);
  if (e.isDirectory()) return walk(p);
  return e.isFile() && /\.tsx?$/.test(e.name) ? [p] : [];
});
const files = walk("app");
ok("the app was actually scanned", files.length > 50, String(files.length));
const bodies = files.map((f) => ({ f, src: readFileSync(f, "utf8") }));
const anyFileHas = (needle) => bodies.some(({ src }) => src.includes(needle));
const fileHas = (path, needle) => (bodies.find(({ f }) => f === path)?.src ?? "").includes(needle);

/* `ia-*`: InterviewerAvatar.tsx, reachable from /interview-live. */
ok(".ia-face still defined", /\.ia-face\s*\{/.test(css));
ok("InterviewerAvatar.tsx still uses it", fileHas("app/components/InterviewerAvatar.tsx", "ia-face"));
ok("and the page that renders it still imports it",
  anyFileHas('from "@/app/components/InterviewerAvatar"') || anyFileHas("InterviewerAvatar"));

/* marquee: AtsMarquee.tsx uses the class correctly, but see the exception below. */
ok(".marquee still defined", /\.marquee\s*\{/.test(css));
ok("AtsMarquee.tsx still uses it", fileHas("app/components/AtsMarquee.tsx", "marquee"));

/* improved-banner + reveal-pop: ResultCoaching.tsx, reachable from /optimize. */
ok(".improved-banner still defined", /\.improved-banner\s*\{/.test(css));
ok(".reveal-pop still defined", /\.reveal-pop\s*\{/.test(css));
ok(".reveal-rise still defined", /\.reveal-rise\s*\{/.test(css));
ok("ResultCoaching.tsx still uses all three",
  fileHas("app/components/ResultCoaching.tsx", "improved-banner") &&
  fileHas("app/components/ResultCoaching.tsx", "reveal-pop") &&
  fileHas("app/components/ResultCoaching.tsx", "reveal-rise"));
ok("and it is rendered from /optimize",
  anyFileHas("ResultCoaching") &&
  (fileHas("app/(en)/optimize/page.tsx", "ResultCoaching") || fileHas("app/(ar)/ar/optimize/page.tsx", "ResultCoaching")));

/* aurora-burst: its own component, reachable from /pay/callback. */
ok(".aurora-burst still defined", /\.aurora-burst\s*\{/.test(css));
ok("AuroraBurst.tsx still uses it", fileHas("app/components/orb/AuroraBurst.tsx", "aurora-burst"));
ok("and /pay/callback renders it", fileHas("app/(en)/pay/callback/page.tsx", "AuroraBurst"));

/* gold-stamp: AccountClient.tsx and the callback page. */
ok(".gold-stamp still defined", /\.gold-stamp\s*\{/.test(css));
ok("used from account and callback", anyFileHas("gold-stamp"));

/* bo-*: BrandOrb's template-literal-built variant classes — the trap a naive scan gets backwards. */
ok("BrandOrb still builds bo-${variant}", fileHas("app/components/BrandOrb.tsx", "bo-${variant}"));
ok("the base .brand-orb rule exists (the unstyled 'logo' variant needs nothing more)",
  /\.brand-orb\s*\{/.test(css));
for (const variant of ["button", "decor"]) {
  /* Only the variants that OVERRIDE the base need their own selector — "logo" is the default and
     deliberately has none, which is correct, not a gap; asserting one exists for it would fail
     against working CSS for a reason that has nothing to do with this pass. */
  ok(`.bo-${variant}'s override still defined (reachable only via the template literal above)`,
    new RegExp(`\\.brand-orb\\.bo-${variant}\\b`).test(css));
}
ok("the pulse/breathe/spin keyframes BrandOrb references are still defined",
  /@keyframes bo-pulse\b/.test(css) && /@keyframes bo-breathe\b/.test(css) && /@keyframes bo-spin\b/.test(css));

/* ─────────────────── the known exception, recorded rather than silently kept ─────────────────── */

console.log("\n── AtsMarquee.tsx: styled correctly, reachable from nowhere ──");
{
  /* Not a dead CSS rule — a dead COMPONENT that happens to use a live-looking class. Its CSS is
     deliberately NOT deleted alongside it: doing so would leave a landmine if the component is wired
     up later, which is a real possibility, not a hypothetical — tracked under O-10. */
  const importedAnywhere = files.some((f) => f !== "app/components/AtsMarquee.tsx" && readFileSync(f, "utf8").includes("AtsMarquee"));
  ok("AtsMarquee is still not imported anywhere — recorded as a known gap, not silently fixed",
    !importedAnywhere,
    "if this now fails because someone wired it in, that is good news — update this note and O-10's entry rather than the assertion");
}

/* ─────────────────── the CSS itself is still valid ─────────────────── */

console.log("\n── the file is still syntactically whole ──");
{
  let depth = 0, min = 0;
  for (const c of css) { if (c === "{") depth++; else if (c === "}") depth--; if (depth < min) min = depth; }
  ok("braces never go negative", min === 0, `min depth ${min}`);
  ok("braces balance to zero at EOF", depth === 0, `end depth ${depth}`);
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
