"use client";

/**
 * The volumetric core rendered inside `BrandOrb`'s `hero` variant only — replaces the flat CSS
 * "sphere + rotating crescent" with a canvas-drawn obsidian core: internal purple/blue plasma
 * drifting on its own paths, a thin colored (never white) rim light, a soft inner vignette for
 * depth, and a few particles drawn inward toward the center. `logo`/`button`/`decor` never import
 * this file — those 30+ server-rendered call sites keep costing zero client JS, exactly as before.
 *
 * Canvas over WebGL: the brief for particles + drifting plasma + a rim light does not need a GPU
 * shader pipeline, and canvas keeps this in one small, auditable file with no build-time asset.
 * Canvas over CSS: the "organic internal movement" the brief asks for is drift along independent
 * paths, not a single value scaling — CSS custom-property-driven positions would mean N compositor
 * layers redrawing every frame, canvas costs one.
 *
 * The BREATHING pulse (scale 0.97→1.04) is intentionally NOT drawn here — it is a CSS animation on
 * the wrapping element in `globals.css` (`.orb-core-wrap`), because `transform: scale` on an element
 * is a free compositor operation and redrawing the whole canvas to simulate a scale would not be.
 * This file only ever draws at its native, unscaled size.
 */

import { useEffect, useRef } from "react";

function spawnParticle(r: number) {
  const angle = Math.random() * Math.PI * 2;
  return { angle, dist: r * (1.15 + Math.random() * 0.55), speed: r * (0.006 + Math.random() * 0.006), size: 0.6 + Math.random() * 1.1 };
}

export default function OrbCore({ size }: { size: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2;

    const small = size < 120;
    const blobs = Array.from({ length: small ? 3 : 4 }, (_, i) => ({
      phase: (i / 4) * Math.PI * 2,
      speedX: 0.00028 + i * 0.00007,
      speedY: 0.00021 + i * 0.00009,
      radius: r * (0.3 + i * 0.09),
      colorIn: ["rgba(124,58,237,0.55)", "rgba(109,40,217,0.5)", "rgba(37,99,235,0.34)", "rgba(34,211,238,0.2)"][i % 4],
      colorOut: ["rgba(76,29,149,0)", "rgba(76,29,149,0)", "rgba(37,99,235,0)", "rgba(34,211,238,0)"][i % 4],
    }));
    const particles = small ? [] : Array.from({ length: 10 }, () => spawnParticle(r));

    // Subtle desktop-only mouse response: a couple of px of translate toward the pointer,
    // applied to the WRAPPER (compositor-only), never to canvas content.
    const hoverCapable = window.matchMedia("(hover: hover)").matches;
    let targetX = 0, targetY = 0, curX = 0, curY = 0;
    function onMove(e: PointerEvent) {
      const rect = wrap!.getBoundingClientRect();
      const dx = (e.clientX - (rect.left + rect.width / 2)) / rect.width;
      const dy = (e.clientY - (rect.top + rect.height / 2)) / rect.height;
      targetX = Math.max(-1, Math.min(1, dx)) * 5;
      targetY = Math.max(-1, Math.min(1, dy)) * 5;
    }
    if (hoverCapable && !reduced) window.addEventListener("pointermove", onMove, { passive: true });

    let raf = 0;
    function draw(t: number) {
      ctx!.clearRect(0, 0, size, size);
      ctx!.save();
      ctx!.beginPath();
      ctx!.arc(cx, cy, r, 0, Math.PI * 2);
      ctx!.clip();

      const base = ctx!.createRadialGradient(cx - r * 0.28, cy - r * 0.3, r * 0.05, cx, cy, r);
      base.addColorStop(0, "#0e0b1c");
      base.addColorStop(0.55, "#050309");
      base.addColorStop(1, "#020207");
      ctx!.fillStyle = base;
      ctx!.fillRect(0, 0, size, size);

      const time = reduced ? 0 : t;
      for (const b of blobs) {
        const bx = cx + Math.cos(b.phase + time * b.speedX) * r * 0.36;
        const by = cy + Math.sin(b.phase * 1.4 + time * b.speedY) * r * 0.32;
        const grad = ctx!.createRadialGradient(bx, by, 0, bx, by, b.radius);
        grad.addColorStop(0, b.colorIn);
        grad.addColorStop(1, b.colorOut);
        ctx!.fillStyle = grad;
        ctx!.beginPath();
        ctx!.arc(bx, by, b.radius, 0, Math.PI * 2);
        ctx!.fill();
      }

      if (!reduced) {
        for (const p of particles) {
          p.dist -= p.speed;
          if (p.dist < r * 0.08) Object.assign(p, spawnParticle(r));
          const px = cx + Math.cos(p.angle) * p.dist;
          const py = cy + Math.sin(p.angle) * p.dist;
          const alpha = Math.max(0, Math.min(0.85, (r - p.dist) / (r * 0.35)));
          ctx!.fillStyle = `rgba(196,181,253,${alpha})`;
          ctx!.beginPath();
          ctx!.arc(px, py, p.size, 0, Math.PI * 2);
          ctx!.fill();
        }
      }

      const vign = ctx!.createRadialGradient(cx, cy, r * 0.42, cx, cy, r);
      vign.addColorStop(0, "rgba(0,0,0,0)");
      vign.addColorStop(1, "rgba(0,0,0,0.5)");
      ctx!.fillStyle = vign;
      ctx!.fillRect(0, 0, size, size);

      const spec = ctx!.createRadialGradient(cx - r * 0.3, cy - r * 0.35, 0, cx - r * 0.3, cy - r * 0.35, r * 0.4);
      spec.addColorStop(0, "rgba(255,255,255,0.14)");
      spec.addColorStop(1, "rgba(255,255,255,0)");
      ctx!.fillStyle = spec;
      ctx!.beginPath();
      ctx!.arc(cx, cy, r, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.restore();

      // Rim light — a thin colored ring, deliberately never white (the "washed-out ring" this
      // component exists to replace).
      ctx!.save();
      ctx!.beginPath();
      ctx!.arc(cx, cy, r - 0.75, 0, Math.PI * 2);
      const rim = ctx!.createLinearGradient(0, 0, size, size);
      rim.addColorStop(0, "rgba(167,139,250,0.55)");
      rim.addColorStop(0.5, "rgba(34,211,238,0.22)");
      rim.addColorStop(1, "rgba(37,99,235,0.4)");
      ctx!.strokeStyle = rim;
      ctx!.lineWidth = Math.max(1, size / 260);
      ctx!.stroke();
      ctx!.restore();

      curX += (targetX - curX) * 0.08;
      curY += (targetY - curY) * 0.08;
      /* `translate`, not `transform` — the wrapper's own CSS breathing pulse animates `scale`
         (see globals.css `.orb-core-wrap`). Independent transform properties compose; using the
         `transform` shorthand here would fight the animation and lose every frame. */
      wrap!.style.translate = `${curX.toFixed(2)}px ${curY.toFixed(2)}px`;
    }

    function loop(t: number) {
      if (!document.hidden) draw(t);
      if (!reduced) raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      if (hoverCapable) window.removeEventListener("pointermove", onMove);
    };
  }, [size]);

  return (
    <span ref={wrapRef} className="orb-core-wrap" style={{ width: size, height: size }} aria-hidden>
      <canvas ref={canvasRef} style={{ width: size, height: size, display: "block", borderRadius: "50%" }} />
    </span>
  );
}
