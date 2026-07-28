"use client";

/**
 * The LIVE Orb — the assistant, rendered by `OrbEngine`, addressable by state.
 *
 * ── two orbs, one identity, and why that is deliberate ──
 *
 * `app/components/BrandOrb.tsx` (the CSS orb) stays exactly what it is: a zero-JS server
 * component drawing the 20–32px mark in thirty-plus server-rendered headers. Making THAT
 * canvas-backed would put a client component and a rAF loop into every static SEO page —
 * the measured regression class F-23 exists to prevent. This component is the same identity
 * (same obsidian/nebula/energy palette, same breathing) wherever the orb is an ACTOR rather
 * than a mark: the landing story, the builder, the dashboard, analysis, interview prep,
 * empty states. Chrome gets the mark; surfaces where the assistant works get this.
 *
 * ── contract ──
 *
 *   state     one of the ten `OrbState`s; transitions are interpolated by the engine.
 *   pulse     pass "success" / "warning" WITH a changing `pulseKey` to fire the one-shot ring.
 *   size      css pixels (square).
 *
 * Accessibility: `role="img"` with a state-aware label; the canvas itself is aria-hidden.
 * Under prefers-reduced-motion the engine draws one static frame — identity, no motion.
 * The rAF stops off-screen (IntersectionObserver) and on tab hide (the engine's own check).
 */

import { useEffect, useRef } from "react";
import { OrbEngine } from "./OrbEngine";
import type { OrbState } from "./orbStates";

export type { OrbState };

const LABELS: Record<OrbState, { en: string; ar: string }> = {
  dormant: { en: "Sira assistant, dormant", ar: "مساعد سيرة، خامل" },
  awakening: { en: "Sira assistant, waking", ar: "مساعد سيرة، يستيقظ" },
  idle: { en: "Sira assistant", ar: "مساعد سيرة" },
  thinking: { en: "Sira assistant, thinking", ar: "مساعد سيرة، يفكّر" },
  analyzing: { en: "Sira assistant, analyzing", ar: "مساعد سيرة، يحلّل" },
  listening: { en: "Sira assistant, listening", ar: "مساعد سيرة، يستمع" },
  suggestion: { en: "Sira assistant, has a suggestion", ar: "مساعد سيرة، لديه اقتراح" },
  success: { en: "Sira assistant, done", ar: "مساعد سيرة، أنجز" },
  warning: { en: "Sira assistant, needs attention", ar: "مساعد سيرة، يحتاج انتباهك" },
  sleeping: { en: "Sira assistant, asleep", ar: "مساعد سيرة، نائم" },
};

export default function BrandOrb({
  size = 120,
  state = "idle",
  lang = "en",
  className,
  pulse,
  pulseKey,
}: {
  size?: number;
  state?: OrbState;
  lang?: "ar" | "en";
  className?: string;
  /** One-shot accent ring; re-fires whenever `pulseKey` changes. */
  pulse?: "success" | "warning";
  pulseKey?: number | string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<OrbEngine | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current, host = hostRef.current;
    if (!canvas || !host) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const engine = new OrbEngine(canvas, "dormant", reduced);
    engineRef.current = engine;
    engine.fit(host.clientWidth);

    /* Run only while visible; a story page can hold several orbs and only the one on screen
       may spend frames. Tab visibility rides the same switch. */
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && document.visibilityState === "visible") engine.start();
      else engine.stop();
    }, { threshold: 0.05 });
    io.observe(host);
    const onVis = () => {
      if (document.visibilityState === "hidden") engine.stop();
      else engine.start();
    };
    document.addEventListener("visibilitychange", onVis);

    const ro = new ResizeObserver(() => engine.fit(host.clientWidth));
    ro.observe(host);

    return () => {
      io.disconnect(); ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => { engineRef.current?.setState(state); }, [state]);
  useEffect(() => { if (pulse) engineRef.current?.pulse(pulse); }, [pulse, pulseKey]);

  return (
    <div
      ref={hostRef}
      role="img"
      aria-label={LABELS[state][lang]}
      className={className}
      style={{ width: size, height: size, borderRadius: "50%", position: "relative", flexShrink: 0 }}
    >
      {/* The pre-hydration/no-JS face: the obsidian body, so SSR shows the identity, not a hole. */}
      <canvas
        ref={canvasRef}
        aria-hidden
        style={{
          position: "absolute", inset: 0, width: "100%", height: "100%", borderRadius: "50%",
          background: "radial-gradient(circle at 38% 34%, #12142a 0%, #05060a 70%)",
        }}
      />
    </div>
  );
}
