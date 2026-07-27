import type { CSSProperties } from "react";
import OrbCore from "./OrbCore";

/**
 * The black pulsing orb — one component, four jobs, no client bundle.
 *
 * ── what it replaces ──
 *
 * Three separate orbs were shipping at once. `AiOrb` was the real one: a black eclipse with a
 * rotating silver corona, a 120-circle SVG particle field, two halo rings and a blurred bloom.
 * `OrbBrand` was the nav logo and was *not* that orb at all — a violet-to-pink gradient disc, so
 * the mark in the header and the identity in the product were different objects. And `OrbProvider`
 * mounted a third instance, up to 380px wide, `position: fixed`, flying between routes on a spring
 * with a `useMotionValue` re-rendering the tree on every frame of every size change.
 *
 * The orb is the identity and it stays. What goes is the cinema around it.
 *
 * ── why this is a server component ──
 *
 * Thirty-two of the call sites are server-rendered pages. `AiOrb` is `"use client"`, so every one
 * of those pages shipped a client component to draw a 26px circle in a header — and the header is
 * the first thing painted, so it was also blocking the part of the page a visitor sees first.
 *
 * Nothing here needs JavaScript: the pulse is a CSS animation and the reduced-motion rule is a
 * media query in `globals.css`. `usePrefersReducedMotion` exists for components that must *branch*
 * in JS; a component whose only motion is CSS should let CSS answer, because CSS answers before
 * hydration and this one has no hydration at all.
 *
 * ── the motion contract ──
 *
 * `transform` and `opacity` only, both compositor-only properties, so a pulse costs no layout and
 * no paint. Specifically NOT animated: `filter: blur()`, which the old bloom animated and which is
 * re-rasterised every frame — on a mid-range Android that single property was the difference
 * between a composited animation and a repainting one. The glow here is a static radial-gradient
 * that scales; scaling a gradient is free.
 *
 * ── and the decoration rule ──
 *
 * `decor` is the only variant that can sit over content, so it is the only one that is
 * unconditionally `pointer-events: none` and behind (`z-index: 0`) — the class name carries it,
 * asserted in `ops/design.test.mjs`. A decorative orb that swallows a tap is worse than no
 * decoration: the button looks live and does nothing, which is the exact complaint this work
 * started from.
 */

export type OrbVariant =
  /** Nav mark, 20–32px. Sits inline beside the wordmark, breathes slowly. */
  | "logo"
  /** Inside an AI button, 14–20px. Pulses a little faster to read as "this one thinks". */
  | "button"
  /** Large, dim, behind card content. Never interactive, never above text. */
  | "decor"
  /**
   * The landing page's hero centerpiece, 400–650px. A deeper, slower breathe than `decor` and a
   * second, counter-phased glow ring layered behind the first — depth from two static gradients
   * animating out of sync, not from a brighter or faster version of the same one. Still `transform`
   * and `opacity` only; still no `filter` animation. Not "flying between routes" — this one is
   * static in the hero, which is the difference between this and the thing `bo-decor`'s own header
   * already says was removed for re-rendering the tree every frame.
   */
  | "hero";

export default function BrandOrb({
  size = 26,
  variant = "logo",
  busy = false,
  className = "",
  style,
}: {
  size?: number;
  variant?: OrbVariant;
  /** A live AI call. Speeds the pulse and lifts the glow — no spinner, no extra layer. */
  busy?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className={`brand-orb bo-${variant}${busy ? " is-busy" : ""} ${className}`}
      style={{ ["--bo-size" as string]: `${size}px`, ...style }}
    >
      {/* Order is paint order: corona behind everything (the outer bloom — already tinted violet/
          cyan, never white, so it stays), then glow, then the core on top.
          `hero` swaps the flat CSS sphere+crescent for `OrbCore`'s canvas-drawn volumetric core —
          the fix for "looks like a washed-out white rotating ring". Every other variant (nav logo,
          AI-button, card decoration) keeps the plain CSS sphere: those 30+ server-rendered call
          sites must not gain a client bundle just to draw a small circle. */}
      {variant === "hero" && <span className="bo-corona" />}
      <span className="bo-glow" />
      {variant === "hero" ? (
        <OrbCore size={size} />
      ) : (
        <span className="bo-sphere">
          <span className="bo-crescent" />
        </span>
      )}
    </span>
  );
}
