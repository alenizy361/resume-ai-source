"use client";
import { useEffect, useState } from "react";

/**
 * When a results view is open, pressing Back should return to the scan form —
 * not exit the whole site (the results page pushes no history state on its own).
 * Pushes one history entry while `active` and clears the result on popstate.
 */
export function useBackToForm(active: boolean, onBack: () => void) {
  useEffect(() => {
    if (!active) return;
    window.history.pushState({ raResult: true }, "");
    const onPop = () => onBack();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // onBack is recreated each render; we only want to (re)arm when `active`
    // flips, so intentionally omit it from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

/**
 * Count-up toward `target` over ~900ms (easeOutCubic) so the score reveal feels
 * earned instead of popping in statically. Returns the current display value.
 */
export function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    /* Nothing to animate toward. The zero is DERIVED below rather than assigned here: a
       `setValue(0)` in an effect body is a second render to display a number we already know. */
    if (!target) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(eased * target));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  /* Clamped to the target so a lowered score never counts DOWN from the previous one's last
     frame — the animation restarts, and for one frame the old higher number would still be held. */
  return target ? Math.min(value, target) : 0;
}
