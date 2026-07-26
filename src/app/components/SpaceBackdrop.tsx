/**
 * The one background. Every page, every route, nothing else.
 *
 * ── what it replaces ──
 *
 * Five background systems were live at the same time, three of them animating:
 *
 *   `CosmosField`   — a full-viewport `<canvas>` repainting a violet sky, 100 stars in three
 *                     parallax layers and four nebula sprites, on a `requestAnimationFrame` loop
 *                     that never stopped while the tab was open.
 *   `AmbientField`  — a second rAF loop lerping a light toward the pointer, plus a DOM node
 *                     created and removed for every click (`amb-ripple`), plus two 58vmax
 *                     `filter: blur(90px)` circles on infinite keyframes.
 *   `.hero-ambient` — per-page, `position: absolute; inset: 0`, on seven pages.
 *   `.aurora-bg`    — two more blurred blobs on a 24s loop.
 *   `.grain-overlay` — a fixed overlay in the root layout.
 *
 * Two rAF loops and four blurred layers, composited under every page, on phones. That is the
 * "slow and laggy" this work started from, and none of it was visible enough to be worth the cost.
 *
 * ── what this is instead ──
 *
 * One fixed element, `pointer-events: none`, painted once and never repainted: a vertical sky
 * gradient plus three tiled `radial-gradient` star layers. No canvas, no JavaScript, no rAF, no
 * `filter`. The stars are in the CSS as gradient stops, so they cost one paint at page load and
 * nothing after it.
 *
 * ── "adds no page height" ──
 *
 * That is the whole reason it is `position: fixed` with `inset: 0` and lives at the top of `<body>`
 * rather than inside `<main>`. A decorative section placed in the flow — which is how the old
 * per-page `.hero-ambient` blocks behaved once their parent was not `position: relative` — makes
 * the page taller than its content and produces exactly the huge empty space the brief describes.
 * Fixed to the viewport, it cannot contribute a single pixel of scroll height, and
 * `ops/design.test.mjs` asserts that the document is no taller than its content.
 */
export default function SpaceBackdrop() {
  return (
    <div className="space-backdrop" aria-hidden>
      <span className="sb-stars sb-1" />
      <span className="sb-stars sb-2" />
      <span className="sb-stars sb-3" />
      <span className="sb-horizon" />
    </div>
  );
}
