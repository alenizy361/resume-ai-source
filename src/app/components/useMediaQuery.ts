"use client";

import { useSyncExternalStore } from "react";

/**
 * A media query as React state, without a hydration mismatch.
 *
 * ── why this needs to exist ──
 *
 * The builder hid the live preview on a phone with a CSS class. `display: none` hides an
 * element; it does not unmount it. So on every phone, in edit mode, `ResumeTemplate` was
 * still mounted: parsing the CV text, laying out an A4 page, and holding a `ResizeObserver`
 * on a box the user could not see. Every keystroke in the form re-parsed and re-measured a
 * document that was not on screen. That is requirement 6 of the brief, and it cannot be
 * fixed in CSS — hiding is a paint decision and mounting is a React one, so React has to
 * know the viewport.
 *
 * ── why `useSyncExternalStore` and not an effect ──
 *
 * The obvious version reads `window.matchMedia` in an effect and calls `setState`. That
 * renders once with the wrong answer and once with the right one, and on a phone the wrong
 * answer is "desktop" — so the preview mounts, measures, and unmounts, which is worse than
 * leaving it mounted. `getServerSnapshot` returning `false` makes the server and the first
 * client render agree, and React re-reads on the client without ever claiming they were the
 * same.
 *
 * It also SUBSCRIBES, which matters more here than it looks: a tablet rotating from portrait
 * to landscape crosses the breakpoint, and a component that read the width once at mount
 * would show a phone layout on a landscape iPad for the rest of the session.
 */
function subscribe(query: string) {
  return (onChange: () => void): (() => void) => {
    const mq = window.matchMedia?.(query);
    if (!mq) return () => {};
    /* `addEventListener` is the modern spelling; Safari before 14 only had `addListener`,
       and this product still sees those devices in the Gulf. */
    if (mq.addEventListener) {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  };
}

export default function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    subscribe(query),
    () => window.matchMedia?.(query).matches === true,
    /*
     * The server has no viewport. `false` is the honest answer and it is also the SAFE one
     * for every current caller: "not desktop" means the preview does not mount, so the
     * first paint on a phone never contains a document nobody asked to see.
     */
    () => false,
  );
}

/** The breakpoint the builder's three-column layout turns on at. One place, so the CSS
 *  media query and the mount decision cannot drift apart. */
export const DESKTOP = "(min-width: 1024px)";
