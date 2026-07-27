/**
 * The root-layout half of the funnel beacon, as a `<script>` string — not a React component.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS REPLACES, AND WHY THE EARLIER ATTEMPT AT IT FAILED
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * `RootShell` rendered `<FunnelBeacon />` (no `step`) and `<Analytics />`, both `"use client"`, in
 * the root layout every route shares. A client component anywhere in a page's tree needs React's
 * client runtime to hydrate — not "more JS", the whole runtime — so having either one at the ROOT put
 * it on all 357 static catalogue pages that would otherwise ship none. Measured: 409–810 KB of JS on
 * pages carrying 34–70 KB of HTML.
 *
 * An earlier attempt replaced both with hand-written inline `<script>` tags and reported two
 * failures: the beacon never wrote `ra_funnel_entry` on any page, and the measured saving did not
 * reproduce. The second was a measurement problem — `ops/jsweight.mjs` now takes a median over
 * repeated builds instead of one noisy pair, because Turbopack's chunk splitting varies build to
 * build. The first had a real, findable cause: `@vercel/analytics`'s own `track()` calls `window.va`
 * with optional chaining and NO fallback —
 *
 *     window.va?.call(window, "event", { name, data: props });
 *
 * `window.va` is only ever DEFINED by `initQueue()`, which the React `<Analytics />` component calls
 * on mount before anything else. Drop `<Analytics />` and replace the beacon with a bare script, and
 * the very first `track()` call — the landing event, fired as early as the page can run JS — hits
 * `window.va === undefined` and silently no-ops forever, because nothing ever queues it for a retry.
 * Nothing about the failure looked like an error: no throw, no console line, just an event that
 * never arrived. So this module installs the same queueing stub `<Analytics />` used to install,
 * synchronously, before anything can call `window.va` — same shape `@vercel/analytics`'s own
 * `queue.ts` uses, so `/_vercel/insights/script.js` (loaded as a plain deferred `<script>` by
 * `RootShell`) drains `window.vaq` exactly as if the React component had injected it.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * A SECOND FAILURE, FOUND HERE, BEFORE IT SHIPPED
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * The first version of this file called `.toString()` on `lib/funnel.ts`'s composed functions —
 * `stamp`, `pageFamily`, `pageSlug`, `pageLang`, `referrerClass` — separately, and reassembled them
 * under their own names. It read correctly straight out of Node. Built through Next's own minifier
 * and inspected in the ACTUAL served HTML, it was broken the same way the original bug was: minified
 * `stamp` called `pageFamily` under a renamed identifier (its own internal reference, consistent
 * within the module Next minified), and the reassembled script declared that helper under the
 * ORIGINAL name — a name `stamp`'s compiled body never used. The script parsed and ran and threw a
 * `ReferenceError` inside the `try/catch` wrapping it. Silently. The exact failure mode this item set
 * out to fix, reproduced by the fix.
 *
 * `lib/funnel.ts#standaloneEntryStamp` is the correction: ONE function with every helper it needs
 * inlined as a local closure, so there is nothing left at module scope for a per-function extraction
 * to lose track of. A minifier's renaming is only ever inconsistent ACROSS functions extracted
 * independently; within one function's own body, declaration and call site are always renamed
 * together, because that is what makes the renaming correct at all. `.toString()` on that one
 * function is self-contained regardless of what the minifier called anything.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * "KEPT IN ONE PLACE" — MADE LITERAL, THEN BACKED BY A TEST
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * `standaloneEntryStamp` is a genuine second implementation, not a mechanical extraction of the
 * composed one — the minification boundary above is exactly why a mechanical share was not
 * available. `ops/funnel.test.mjs` runs both against the same large matrix of inputs and asserts
 * byte-identical output, so an edit to `pageFamily` that is not mirrored there fails a test on the
 * next `npm test` instead of drifting silently into a dashboard where a wrong classification looks
 * exactly like a right one. That is the guarantee this module's "kept in one place" is actually
 * standing on — see the longer note beside `standaloneEntryStamp` itself.
 */

import { ENTRY_KEY, FUNNEL, standaloneEntryStamp } from "./funnel.ts";

/**
 * The whole inline script, as a string, ready for `dangerouslySetInnerHTML`.
 *
 * An IIFE so nothing it declares leaks into the global scope of a page that may also carry the Meta
 * Pixel snippet or a future third script — the same reason every other inline script in `RootShell`
 * is self-contained.
 */
export function funnelBootstrapScript(): string {
  return `(function(){
var standaloneEntryStamp=${standaloneEntryStamp.toString()};
/* The queueing stub \`<Analytics />\` used to install on mount — see the header above for why a
   missing one is a silent no-op rather than an error. */
if(!window.va){window.va=function(){(window.vaq=window.vaq||[]).push(arguments);};}
try{
  var k=${JSON.stringify(ENTRY_KEY)};
  if(!sessionStorage.getItem(k)){
    var entry=standaloneEntryStamp(location.pathname,document.referrer,location.hostname);
    sessionStorage.setItem(k,JSON.stringify(entry));
    window.va("event",{name:${JSON.stringify(FUNNEL.landing)},data:{family:entry.family,slug:entry.slug,lang:entry.lang,from:entry.from}});
  }
}catch(e){}
})();`;
}
