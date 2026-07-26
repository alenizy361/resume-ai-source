"use client";

import { useEffect } from "react";
import { track } from "@vercel/analytics";
import { ENTRY_KEY, FUNNEL, type Entry, stamp, stepPayload } from "@/app/lib/funnel.ts";

/**
 * The stamp at the door, and at every till after it.
 *
 * ── one component, two jobs ──
 *
 * Dropped on a content page (`step` omitted) it records the entry: the first page of this session
 * writes `ra_funnel_entry` and fires `funnel_landing`. Dropped on a tool, the builder or the
 * payment confirmation (`step` given) it reads that record and reports the step with the entry
 * attached — which is what turns twenty-eight builder events into a funnel.
 *
 * ── why sessionStorage and not a query parameter ──
 *
 * The alternative is appending `?from=` to every internal link, which means editing hundreds of
 * hrefs, splitting each page's URL into variants that then need canonicals, and losing the
 * attribution the moment someone opens a link in a new tab. `sessionStorage` is per-tab, expires
 * with the tab, is invisible to the server, and holds five short strings.
 *
 * ── why the write happens once ──
 *
 * The ENTRY is the page they arrived on, so a second content page in the same session must not
 * overwrite it — otherwise every funnel would appear to start wherever the visitor happened to stop
 * browsing. `if (!existing)` is the whole rule, and it is why `funnel_landing` fires once per
 * session rather than once per page view: page views are already counted by Vercel Analytics, and
 * an event that duplicates them adds noise and cost without adding an answer.
 */
export default function FunnelBeacon({ step }: { step?: keyof typeof FUNNEL }) {
  useEffect(() => {
    /*
     * Everything here touches `sessionStorage` and `document.referrer`, so it lives in an effect
     * rather than in render: on the server neither exists, and a component that reads them during
     * render sends the server one answer and the client another. Analytics is also the one thing
     * that must never break a page — hence the single try/catch around the lot.
     */
    try {
      const path = window.location.pathname;
      const raw = window.sessionStorage.getItem(ENTRY_KEY);
      let entry: Entry | null = null;
      if (raw) {
        try { entry = JSON.parse(raw) as Entry; } catch { entry = null; }
      }

      if (!entry) {
        entry = stamp(path, document.referrer, window.location.hostname);
        window.sessionStorage.setItem(ENTRY_KEY, JSON.stringify(entry));
        /* The landing event carries the entry itself, flattened — `stepPayload` would report it as
           both the entry and the current step, which is true and useless. */
        track(FUNNEL.landing, {
          family: entry.family, slug: entry.slug, lang: entry.lang, from: entry.from,
        });
      }

      if (step) track(FUNNEL[step], stepPayload(entry, path));
    } catch { /* an analytics failure is not a page failure */ }
  }, [step]);

  return null;
}
