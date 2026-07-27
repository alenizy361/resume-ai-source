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
 *
 * ── the state machine ──
 *
 * `state` is read every frame, not diffed — an "energy" value (how bright/fast the internal plasma
 * is) and an optional color "tint" (success green, warning amber) each EASE toward a per-state
 * target every frame, rather than jumping. That is what makes switching from `idle` to `thinking` to
 * `success` read as one living thing reacting, not a sprite swap — and it means any state transition
 * is smooth for free, with no per-transition animation to write. `dormant`/`sleeping` render as
 * almost-inert (low energy, no particles) for the cinematic intro's pre-awakening frame.
 */

import { useEffect, useRef } from "react";

export type OrbState =
  | "dormant" | "awakening" | "idle" | "thinking" | "analyzing"
  | "listening" | "suggestion" | "success" | "warning" | "sleeping";

function energyFor(state: OrbState): number {
  switch (state) {
    case "dormant":
    case "sleeping": return 0.12;
    case "awakening": return 0.65;
    case "thinking":
    case "analyzing":
    case "listening": return 1.35;
    case "suggestion": return 1.2;
    case "success":
    case "warning": return 1.1;
    default: return 1; // idle
  }
}
/** Success/warning tint the rim and one plasma blob toward a color; every other state stays purple/blue/cyan. */
function tintFor(state: OrbState): [number, number, number] | null {
  if (state === "success") return [52, 211, 153];
  if (state === "warning") return [245, 184, 64];
  return null;
}

function spawnParticle(r: number) {
  const angle = Math.random() * Math.PI * 2;
  return { angle, dist: r * (1.15 + Math.random() * 0.55), speed: r * (0.006 + Math.random() * 0.006), size: 0.6 + Math.random() * 1.1 };
}

export default function OrbCore({ size, state = "idle" }: { size: number; state?: OrbState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  /* Hoisted OUTSIDE the effect below, which re-runs on every state change (see its dependency
     array): if `energy`/`tint` lived inside the effect, each state change would re-initialize
     them straight to the new state's target, and the "eases smoothly between states" behavior
     `energyFor`/`tintFor`'s doc comment describes would only ever apply within a single,
     unchanging state — never across the transition that is the entire point. Refs persist the
     last-drawn value across the restart, so easing continues from wherever it actually was. */
  const energyValRef = useRef(energyFor(state));
  const tintValRef = useRef<[number, number, number]>([0, 0, 0]);
  const tintAmtRef = useRef(0);

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
      colorIn: [124, 58, 237] as [number, number, number],
      colorTail: [
        [124, 58, 237], [109, 40, 217], [37, 99, 235], [34, 211, 238],
      ][i % 4] as [number, number, number],
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
      const targetEnergy = energyFor(state);
      energyValRef.current += (targetEnergy - energyValRef.current) * (reduced ? 1 : 0.03);
      const energy = energyValRef.current;
      const wantTint = tintFor(state);
      const targetTintAmt = wantTint ? 1 : 0;
      tintAmtRef.current += (targetTintAmt - tintAmtRef.current) * (reduced ? 1 : 0.04);
      const tintAmt = tintAmtRef.current;
      if (wantTint) tintValRef.current = wantTint;
      const tint = tintValRef.current;

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
        const bx = cx + Math.cos(b.phase + time * b.speedX * energy) * r * 0.36;
        const by = cy + Math.sin(b.phase * 1.4 + time * b.speedY * energy) * r * 0.32;
        const c = tintAmt > 0.02
          ? b.colorTail.map((v, i) => Math.round(v + (tint[i] - v) * tintAmt * 0.7)) as [number, number, number]
          : b.colorTail;
        const alphaIn = Math.min(0.65, 0.55 * energy);
        const grad = ctx!.createRadialGradient(bx, by, 0, bx, by, b.radius * (0.7 + 0.3 * energy));
        grad.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${alphaIn})`);
        grad.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
        ctx!.fillStyle = grad;
        ctx!.beginPath();
        ctx!.arc(bx, by, b.radius, 0, Math.PI * 2);
        ctx!.fill();
      }

      if (!reduced && energy > 0.25) {
        for (const p of particles) {
          p.dist -= p.speed * energy;
          if (p.dist < r * 0.08) Object.assign(p, spawnParticle(r));
          const px = cx + Math.cos(p.angle) * p.dist;
          const py = cy + Math.sin(p.angle) * p.dist;
          const alpha = Math.max(0, Math.min(0.85, (r - p.dist) / (r * 0.35))) * Math.min(1, energy);
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
      spec.addColorStop(0, `rgba(255,255,255,${0.14 * Math.min(1, 0.4 + energy * 0.6)})`);
      spec.addColorStop(1, "rgba(255,255,255,0)");
      ctx!.fillStyle = spec;
      ctx!.beginPath();
      ctx!.arc(cx, cy, r, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.restore();

      // Rim light — a thin colored ring, deliberately never white (the "washed-out ring" this
      // component exists to replace). Blends toward the state tint (success/warning) when set.
      ctx!.save();
      ctx!.beginPath();
      ctx!.arc(cx, cy, r - 0.75, 0, Math.PI * 2);
      const rim = ctx!.createLinearGradient(0, 0, size, size);
      if (tintAmt > 0.02) {
        const [tr, tg, tb] = tint;
        rim.addColorStop(0, `rgba(${tr},${tg},${tb},${0.55 * tintAmt + 0.2 * (1 - tintAmt)})`);
        rim.addColorStop(0.5, `rgba(${tr},${tg},${tb},${0.3 * tintAmt})`);
        rim.addColorStop(1, `rgba(${tr},${tg},${tb},${0.4 * tintAmt + 0.15 * (1 - tintAmt)})`);
      } else {
        rim.addColorStop(0, "rgba(167,139,250,0.55)");
        rim.addColorStop(0.5, "rgba(34,211,238,0.22)");
        rim.addColorStop(1, "rgba(37,99,235,0.4)");
      }
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
      // Reduced motion: draw exactly one frame at this state's settled values, then stop —
      // "still lit, simply still," not a live loop burning battery on an unchanging image. The
      // effect re-runs (see the dependency array below) on every `state` change, which draws
      // exactly one fresh frame for the new state — so a reduced-motion user still SEES a state
      // change (idle → success, say), just without any motion getting them there.
      if (!reduced) raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      if (hoverCapable) window.removeEventListener("pointermove", onMove);
    };
    // Depends on `state` too: a state change restarts the loop with fresh blob phases and
    // particles. That is a deliberate, minor visual reshuffle at the moment something changed —
    // acceptable because state changes are discrete, infrequent, user/system-driven events, not
    // a per-frame value — in exchange for never running a perpetual idle rAF loop under reduced
    // motion just to stay ready for a state change that may not come for a long time.
  }, [size, state]);

  return (
    <span ref={wrapRef} className="orb-core-wrap" style={{ width: size, height: size }} aria-hidden>
      <canvas ref={canvasRef} style={{ width: size, height: size, display: "block", borderRadius: "50%" }} />
    </span>
  );
}
