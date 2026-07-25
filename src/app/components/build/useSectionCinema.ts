"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The section navigation the chat builder already uses, extracted so the form can
 * have the same motion.
 *
 * Ported from `Journey.tsx:425-435` — a monotonic "highest section reached", a short
 * delay so the reveal animation starts before the scroll, and `scrollIntoView` with
 * `block: "start"`. Deliberately NOT ported: the rAF loop at Journey.tsx:340-406,
 * which drives four marketing scenes and has nothing to do with sections.
 *
 * Monotonic matters. A user who finishes section 5 and scrolls back to section 2 to
 * fix a typo must not have sections 3-5 re-lock behind them — going back is normal
 * editing, not undoing progress.
 */
export function useSectionCinema(total: number, initial = 0) {
  const [reached, setReached] = useState(initial);
  const [justOpened, setJustOpened] = useState(-1);
  const reachedRef = useRef(initial);
  const refs = useRef<(HTMLElement | null)[]>([]);
  const reduce = useRef(false);

  useEffect(() => {
    // Respect the OS setting rather than animating over someone who asked us not to.
    reduce.current = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  }, []);

  const setRef = useCallback((i: number) => (el: HTMLElement | null) => {
    refs.current[i] = el;
  }, []);

  /** Scroll to a section without changing what is unlocked — used for going back. */
  const scrollTo = useCallback((i: number) => {
    refs.current[i]?.scrollIntoView({
      behavior: reduce.current ? "auto" : "smooth",
      block: "start",
    });
  }, []);

  /** Reveal up to section `i`. Never retreats. */
  const open = useCallback((i: number) => {
    const target = Math.min(Math.max(i, 0), total - 1);
    if (target <= reachedRef.current) { scrollTo(target); return; }
    reachedRef.current = target;
    setReached(target);
    setJustOpened(target);
    // 300ms lets the reveal begin before the page moves, so the new section is
    // already fading in when it arrives rather than appearing after the scroll.
    const t1 = setTimeout(() => scrollTo(target), 300);
    const t2 = setTimeout(() => setJustOpened(-1), 1400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [total, scrollTo]);

  const next = useCallback(() => open(reachedRef.current + 1), [open]);

  /** Re-hydrating a saved draft should not animate through every section. */
  const restore = useCallback((i: number) => {
    const target = Math.min(Math.max(i, 0), total - 1);
    reachedRef.current = target;
    setReached(target);
  }, [total]);

  return { reached, justOpened, open, next, setRef, scrollTo, restore };
}
