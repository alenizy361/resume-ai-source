import { notFound } from "next/navigation";

/**
 * Why an Arabic 404 needs a route of its own.
 *
 * `app/ar/not-found.tsx` exists, and for an unmatched URL it was never reached: Next renders a
 * segment's `not-found` boundary when something INSIDE that segment calls `notFound()`, and a URL
 * like `/ar/anything-wrong` matches no segment at all — so the ROOT boundary answered, in English,
 * to a reader who had asked for Arabic. Measured, not assumed: `ops/failures.test.mjs` caught the
 * English page being served at an `/ar` address.
 *
 * A catch-all that does nothing but call `notFound()` is the fix. It matches only what no real
 * route claimed — catch-alls have the lowest priority in the router — and it puts the request
 * inside the `/ar` segment, which is what makes the Arabic boundary the one that renders.
 *
 * `dynamic = "force-static"` because there is nothing dynamic here: every request ends in the same
 * 404, and pre-rendering it keeps a mistyped URL from waking a server function.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * KNOWN, MEASURED, AND NOT FIXED HERE: this route's 404 arrives as an EMPTY DOCUMENT
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * `/ar/zzz` answers 404 with `<html id="__next_error__">` — no `lang`, no `dir`, no stylesheet, an
 * empty body without JS, and the ENGLISH HOMEPAGE `<title>`. The Arabic 404 above ships only inside
 * the flight payload and is painted by hydration, so a visitor who mistypes an Arabic URL sees a
 * blank white page and a crawler sees a blank page wearing the homepage's title.
 *
 * ── what it is NOT ──
 *
 * Two hypotheses were tried against a production build and both were measured to change nothing:
 * removing `force-static` (a page whose whole body is `notFound()` has nothing to prerender), and
 * adding a `not-found.tsx` as a direct sibling of this file rather than one segment up.
 *
 * ── what it actually is ──
 *
 * EVERY page-level `notFound()` in this app renders that shell, in BOTH languages:
 *
 *     /resume-examples/no-such-job   404  <html id="__next_error__">
 *     /resume-skills/nope            404  <html id="__next_error__">
 *     /resume-templates/nope         404  <html id="__next_error__">
 *     /zzz                           404  <html lang="en" dir="ltr">   ← router-level, correct
 *
 * So this is not an Arabic regression and this file is not its cause. `notFound()` finds no boundary
 * anywhere in this app — plausibly because there is no `app/not-found.tsx` above the two route
 * groups, leaving the lookup with two root layouts and no way to choose. Only the ROUTER-level 404
 * (an unmatched path, which resolves a group's own boundary) renders correctly.
 *
 * What this file does contribute is turning `/ar/*` from the working case into the broken one: it
 * matches the URL, so a router-level 404 becomes a page-level one. Deleting it would restore a real
 * styled document at the cost of serving it in English — the exact bug it was written to fix. A
 * blank page and a wrong-language page are both wrong, so the swap is not worth making blind.
 *
 * The fix belongs one level up (a shared `not-found` boundary above the groups, or a single root
 * layout), which is a structural change to the route-group split and wants its own pass rather than
 * a 7am guess on a live revenue product. Tracked in `docs/known-issues.md`.
 *
 * `ops/failures.test.mjs` asserted this boundary "renders" and passed throughout — it checks the
 * hydrated DOM, which is exactly where the markup does arrive.
 */
export const dynamic = "force-static";

export default function ArabicCatchAll(): never {
  notFound();
}
