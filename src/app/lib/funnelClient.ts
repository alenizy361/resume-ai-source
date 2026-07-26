import { track } from "@vercel/analytics";
import { ENTRY_KEY, FUNNEL, type Entry, stepPayload } from "./funnel.ts";

/**
 * Reporting a funnel step from inside an event handler.
 *
 * `FunnelBeacon` covers steps that are "the page loaded". This covers the ones that are "the user
 * finished something" — a completed scan, a checkout that was opened, a confirmed payment — which
 * cannot be a component because they happen in a callback, not on mount.
 *
 * Kept out of `funnel.ts` because that file is pure and loaded by `ops/funnel.test.mjs` in plain
 * Node; this one imports the analytics client and reads `sessionStorage`.
 */

function readEntry(): Entry | null {
  try {
    const raw = window.sessionStorage.getItem(ENTRY_KEY);
    return raw ? (JSON.parse(raw) as Entry) : null;
  } catch { return null; }
}

/**
 * Report a step with the session's entry attached.
 *
 * `extra` exists for the one or two coarse facts a step legitimately adds — a score band, a plan
 * name. It is typed as strings only, and every call site below passes a bucketed or enumerated
 * value: the rule that no user content reaches analytics is enforced by what callers pass, so the
 * callers are few and each one is visible here.
 */
export function trackStep(step: keyof typeof FUNNEL, extra: Record<string, string> = {}): void {
  try {
    track(FUNNEL[step], { ...stepPayload(readEntry(), window.location.pathname), ...extra });
  } catch { /* analytics must never break a flow the user is in the middle of */ }
}

/**
 * A completed scan, reported as a band rather than a number.
 *
 * The exact score is a fact about one person's resume; the band answers the only question analytics
 * needs to ask of it — whether people arriving from a given page are landing in the range where the
 * product has something worth selling them.
 */
export function trackScanDone(score: number): void {
  const band = score >= 80 ? "80+" : score >= 60 ? "60-79" : score >= 40 ? "40-59" : "under-40";
  trackStep("scanDone", { band });
}
