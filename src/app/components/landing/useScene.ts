"use client";

/**
 * A scene's clock: entered-the-viewport once, then a staged timeline.
 *
 * Every scene animates the same way — nothing until the section is actually looked at, then
 * a handful of discrete stages (a field fills, a chip lands, a score steps). One hook owns
 * that so no scene grows its own observer or its own idea of reduced motion:
 *
 *   `on`     true once ~35% of the section has been seen (never reverts — a story beat that
 *            un-plays when you scroll back reads as broken, not cinematic).
 *   `stage`  0 → stages.length, advancing on the given delays after activation.
 *
 * Under prefers-reduced-motion, `on` is true from the first paint and `stage` starts AT the
 * end: the finished scene, no motion. The server render is stage 0 with `on` false — plain
 * readable content — so hydration mismatches cannot occur and no-JS readers get everything.
 */

import { useEffect, useRef, useState } from "react";

export function useScene<T extends HTMLElement>(stageDelays: number[] = []) {
  const ref = useRef<T | null>(null);
  const [on, setOn] = useState(false);
  const [stage, setStage] = useState(0);
  const total = stageDelays.length;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduced) { setOn(true); setStage(total); return; }

    let timers: ReturnType<typeof setTimeout>[] = [];
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      setOn(true);
      let acc = 0;
      stageDelays.forEach((d, i) => {
        acc += d;
        timers.push(setTimeout(() => setStage(i + 1), acc));
      });
    }, { threshold: 0.35 });
    io.observe(el);
    return () => { io.disconnect(); timers.forEach(clearTimeout); timers = []; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ref, on, stage };
}
