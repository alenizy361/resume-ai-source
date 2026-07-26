"use client";

import { useSyncExternalStore } from "react";

/**
 * Does this person want motion kept to a minimum?
 *
 * ── why a store and not a render-time read ──
 *
 * Eight components in this codebase read `window.matchMedia("(prefers-reduced-motion: reduce)")`,
 * and every one of them does it inside an effect or a callback — which is correct, because reading
 * it DURING render is a trap: on the server there is no `window`, so the server renders the
 * animated branch and a reduced-motion client renders the still one, and the two disagree about
 * the DOM. That is a hydration mismatch, and the user it hits is precisely the one who asked not
 * to be surprised by movement.
 *
 * `useSyncExternalStore` is the shape that has no such trap. The server snapshot is `false` — the
 * server has no preference to report and answering "animate" matches what it actually rendered —
 * and React then re-reads on the client and re-renders once with the truth, without ever claiming
 * the two were the same.
 *
 * It also SUBSCRIBES, which none of the existing reads do: the preference can be changed while the
 * page is open (macOS and Windows both allow it), and a component that read it once at mount keeps
 * animating at someone who has just asked it to stop.
 */

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia?.(QUERY);
  if (!mq) return () => {};
  /* `addEventListener` on a MediaQueryList is the modern spelling; Safari before 14 only had
     `addListener`, and this product still sees those devices in the Gulf. */
  if (mq.addEventListener) {
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }
  mq.addListener(onChange);
  return () => mq.removeListener(onChange);
}

export default function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia?.(QUERY).matches === true,
    /* The server has no preference. `false` is what it rendered, so hydration matches. */
    () => false,
  );
}
