/**
 * The Orb's renderer — one canvas, one rAF, no DOM churn.
 *
 * ── why canvas 2D and not WebGL, CSS, or SVG ──
 *
 * The look is layered translucency: an obsidian body, drifting nebula blobs, plasma
 * filaments, a few dozen particles, a soft rim. Canvas 2D with `lighter` compositing paints
 * all of it in one raster pass per frame with zero DOM nodes — where the SVG ancestor of
 * this component ("a 120-circle particle field") re-entered layout for every dot, and WebGL
 * would buy nothing at this size but a context the page has to keep alive. The engine is a
 * plain class, not a React tree: React mounts it once and calls `setState`; nothing here
 * re-renders anything.
 *
 * ── the performance contract (the lessons of F-7/F-8/F-10, honoured) ──
 *
 *   · No CSS scroll-driven animation, no `filter` animation, no backdrop blur. Everything is
 *     painted inside one canvas raster.
 *   · The rAF loop STOPS when the orb is off-screen (host uses IntersectionObserver), when
 *     the tab is hidden, and under prefers-reduced-motion (one static frame is drawn — the
 *     identity, without the motion).
 *   · Device pixel ratio is capped at 2; the particle budget scales with the orb's size
 *     (36 at hero size, 10 at chip size) and is allocated ONCE — no per-frame allocation.
 *   · State changes interpolate parameters (≈600ms critical damping), so no transition ever
 *     needs a second animation system.
 *
 * ── what it must never look like ──
 *
 * A spinner. Nothing here rotates fast or uniformly: filaments drift at seconds-per-cycle,
 * each at its own rate, and "progress" is expressed as internal energy, never as revolution.
 */

import { ORB_PALETTE as P, ORB_STATES, type OrbParams, type OrbState } from "./orbStates";

interface Particle { a: number; r: number; sp: number; ph: number; sz: number }
interface Pulse { color: string; t0: number }

const LERP_MS = 600;

export class OrbEngine {
  private ctx: CanvasRenderingContext2D;
  private size = 0;
  private dpr = 1;
  private cur: OrbParams;
  private target: OrbParams;
  private particles: Particle[] = [];
  private pulses: Pulse[] = [];
  private t = 0;
  private raf = 0;
  private running = false;
  private reduced: boolean;

  constructor(private canvas: HTMLCanvasElement, initial: OrbState, reducedMotion: boolean) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d unavailable");
    this.ctx = ctx;
    this.reduced = reducedMotion;
    this.cur = { ...ORB_STATES[initial] };
    this.target = this.cur;
  }

  /** Resize to the displayed square; reseeds the particle budget for the new size. */
  fit(cssSize: number): void {
    this.dpr = Math.min(2, typeof devicePixelRatio === "number" ? devicePixelRatio : 1);
    this.size = cssSize;
    this.canvas.width = Math.max(2, Math.round(cssSize * this.dpr));
    this.canvas.height = this.canvas.width;
    const budget = cssSize >= 220 ? 36 : cssSize >= 90 ? 22 : 10;
    this.particles = Array.from({ length: budget }, () => ({
      a: Math.random() * Math.PI * 2,
      r: 0.32 + Math.random() * 0.5,
      sp: (0.05 + Math.random() * 0.12) * (Math.random() < 0.5 ? -1 : 1),
      ph: Math.random() * Math.PI * 2,
      sz: 0.6 + Math.random() * 1.2,
    }));
    if (this.reduced || !this.running) this.drawFrame(0);
  }

  setState(s: OrbState): void {
    this.target = ORB_STATES[s];
    if (this.reduced) { this.cur = { ...this.target }; this.drawFrame(0); }
  }

  /** One-shot accent ring: "finished" (success) or "needs you" (warning). */
  pulse(kind: "success" | "warning"): void {
    this.pulses.push({ color: kind === "success" ? P.success : P.warning, t0: this.t });
    if (this.reduced) this.drawFrame(0);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    if (this.reduced) { this.drawFrame(0); return; } // identity without motion
    let last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(64, now - last);
      last = now;
      this.t += dt / 1000;
      const k = 1 - Math.exp(-dt / LERP_MS);
      for (const key of Object.keys(this.cur) as (keyof OrbParams)[]) {
        this.cur[key] += (this.target[key] - this.cur[key]) * k;
      }
      this.drawFrame(this.t);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  destroy(): void { this.stop(); }

  private drawFrame(t: number): void {
    const { ctx } = this;
    const s = this.size * this.dpr;
    if (!s) return;
    const c = s / 2;
    const p = this.cur;
    const breath = 1 + Math.sin(t * Math.PI * 2 * p.breathHz) * p.breathAmp;
    const R = c * 0.92 * breath;

    ctx.clearRect(0, 0, s, s);
    ctx.save();
    ctx.globalAlpha = p.dim;

    /* obsidian body */
    const body = ctx.createRadialGradient(c - R * 0.28, c - R * 0.32, R * 0.1, c, c, R);
    body.addColorStop(0, P.body1);
    body.addColorStop(1, P.body0);
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.fill();

    /* clip everything internal to the body */
    ctx.save();
    ctx.beginPath(); ctx.arc(c, c, R * 0.985, 0, Math.PI * 2); ctx.clip();
    ctx.globalCompositeOperation = "lighter";

    /* nebula — three drifting purple volumes */
    for (let i = 0; i < 3; i++) {
      const ang = t * (0.05 + i * 0.023) + (i * Math.PI * 2) / 3;
      const nx = c + Math.cos(ang) * R * 0.34;
      const ny = c + Math.sin(ang * 0.8) * R * 0.3;
      const nr = R * (0.42 + 0.1 * Math.sin(t * 0.11 + i * 2.1));
      const g = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
      const col = i === 1 ? P.nebulaB : P.nebulaA;
      g.addColorStop(0, col + "55");
      g.addColorStop(1, col + "00");
      ctx.globalAlpha = p.dim * p.nebula * 0.5;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(nx, ny, nr, 0, Math.PI * 2); ctx.fill();
    }

    /* plasma filaments — slow electric-blue arcs, each on its own clock */
    ctx.lineCap = "round";
    for (let i = 0; i < 4; i++) {
      const ph = t * (0.12 + i * 0.05) + i * 1.7;
      const a0 = ph;
      const sweep = 0.9 + 0.5 * Math.sin(t * 0.2 + i);
      const rr = R * (0.5 + 0.16 * Math.sin(t * 0.17 + i * 1.3));
      ctx.globalAlpha = p.dim * p.energy * 0.34;
      ctx.strokeStyle = i % 2 ? P.energy : P.nebulaA;
      ctx.lineWidth = Math.max(0.8, R * 0.02);
      ctx.beginPath(); ctx.arc(c, c, rr, a0, a0 + sweep); ctx.stroke();
    }

    /* cyan particles */
    ctx.fillStyle = P.spark;
    const lit = Math.round(this.particles.length * p.particles);
    for (let i = 0; i < lit; i++) {
      const pt = this.particles[i];
      const a = pt.a + t * pt.sp;
      const rad = pt.r * R * (1 + 0.04 * Math.sin(t * 0.5 + pt.ph));
      const x = c + Math.cos(a) * rad;
      const y = c + Math.sin(a) * rad;
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 1.7 + pt.ph));
      ctx.globalAlpha = p.dim * 0.7 * tw;
      ctx.beginPath(); ctx.arc(x, y, pt.sz * (R / 130), 0, Math.PI * 2); ctx.fill();
    }

    /* analysis band — a soft horizontal sweep, only while analyzing */
    if (p.scan > 0.02) {
      const y = c + Math.sin(t * 0.9) * R * 0.62;
      const g = ctx.createLinearGradient(0, y - R * 0.14, 0, y + R * 0.14);
      g.addColorStop(0, P.energy + "00");
      g.addColorStop(0.5, P.energy + "44");
      g.addColorStop(1, P.energy + "00");
      ctx.globalAlpha = p.dim * p.scan;
      ctx.fillStyle = g;
      ctx.fillRect(c - R, y - R * 0.14, R * 2, R * 0.28);
    }
    ctx.restore(); /* internal clip */

    /* rim light — static gradient stroke, upper-left */
    ctx.globalAlpha = p.dim * 0.5;
    const rim = ctx.createLinearGradient(c - R, c - R, c + R * 0.4, c + R * 0.4);
    rim.addColorStop(0, P.rim + "66");
    rim.addColorStop(0.5, P.rim + "0d");
    rim.addColorStop(1, "#00000000");
    ctx.strokeStyle = rim;
    ctx.lineWidth = Math.max(1, R * 0.02);
    ctx.beginPath(); ctx.arc(c, c, R * 0.99, 0, Math.PI * 2); ctx.stroke();

    /* one-shot pulses — expanding, fading rings */
    const now = t;
    this.pulses = this.pulses.filter((pl) => now - pl.t0 < 1.1);
    for (const pl of this.pulses) {
      const age = this.reduced ? 0.35 : (now - pl.t0) / 1.1;
      ctx.globalAlpha = (1 - age) * 0.55 * p.dim;
      ctx.strokeStyle = pl.color;
      ctx.lineWidth = Math.max(1.2, R * 0.025) * (1 - age * 0.5);
      ctx.beginPath(); ctx.arc(c, c, R * (1.02 + age * 0.28), 0, Math.PI * 2); ctx.stroke();
    }

    ctx.restore();
  }
}
