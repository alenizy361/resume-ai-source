# The design pass: what was removed, what was kept, what is measured

Written 2026-07-26. Every number here came from `src/ops/design.test.mjs` run against a production
build, in a real browser, on eight device profiles. Re-run it after any change to a layout, a global
style or the builder shell:

```
cd src && npm run build && npx next start -p 3200 &
node ops/design.test.mjs http://localhost:3200
```

**Restart the server after building.** `next start` holds the build manifest it started with, so a
rebuild underneath a running server leaves it serving a CSS chunk that no longer exists — the page
renders completely unstyled and every computed-style assertion becomes meaningless. That happened
during this work: the suite reported that the brand orb had `pointer-events: auto`, which was true,
and told us nothing. The suite now aborts with exit code 2 rather than producing a plausible list of
false failures.

## What was actually running

Not one cinematic system. Five, layered, two of them on permanent animation loops:

| | What it did | Cost |
|---|---|---|
| `CosmosField` | A full-viewport `<canvas>` repainting a violet sky: 100 stars in three parallax layers, four nebula sprites | One `requestAnimationFrame` loop, forever, on every route |
| `AmbientField` | A light lerped toward the pointer; a DOM node created and removed per click; two 58vmax `filter: blur(90px)` circles on infinite keyframes | A second rAF loop, plus four blurred composite layers |
| `PageTransition` | `AnimatePresence mode="wait"` around every page | **The next page did not begin mounting until the previous one finished fading out** |
| The provider orb | Up to 380px, `position: fixed`, flying between routes on a spring | A `useMotionValue` re-rendering the tree on every frame of every size change |
| `.hero-ambient` / `.aurora-bg` / `.grain-overlay` | Per-page and global decorative layers | Seven more absolute/fixed layers |

`mode="wait"` is the single most important line in that table. It is, precisely, "wait for the
animation to finish before showing the page" — the blank pause the brief describes, implemented on
purpose.

## What replaced it

**One background.** `SpaceBackdrop`: one fixed element, `pointer-events: none`, a sky gradient plus
three tiled `radial-gradient` star layers. No canvas, no JavaScript, no rAF, no `filter`. It costs
one paint at load and nothing after it, and because it is `position: fixed` it cannot contribute a
single pixel of scroll height — which is where the empty space came from.

**One orb.** Three were shipping at once: `AiOrb` (the real black eclipse — a client component with
a 120-circle SVG field, two halo rings and an animated blurred bloom), `OrbBrand` (the nav logo,
which was **not** that orb but a violet-to-pink gradient disc), and the flying provider instance.

`BrandOrb` is one server component, three variants — `logo`, `button`, `decor`. `transform` and
`opacity` only. Specifically **not** `filter: blur()`, which the old bloom animated: a blur is
re-rasterised every frame, so the cheapest possible animation had been made the most expensive one.
Reduced motion is a CSS media query rather than a hook, because thirty-two of the call sites are
server-rendered and a media query is honoured before hydration.

`pointer-events: none` on the base class, not per variant. The orb is never the thing you press —
the logo's `<a>` takes the tap, the AI button's `<button>` takes the tap, a decoration takes
nothing. That line is the fix for "the buttons look flat, as if nothing is clickable."

## The builder

**Four progress indicators became one.** An eleven-segment rail in the header, the full step list
with all eleven names, "Step 4 of 11" above the form, and the step index again in a circle in the
heading. `StepBar` is number · name · one thin bar · a button that opens the list.

**A second scroll system is gone.** On a phone that step list was a horizontal scroller holding
eleven labels end to end in a 390px viewport — so a swipe starting on it scrolled the list instead
of the page, and the names appeared to run off the screen. It is a sheet now, and the sheet is the
one legitimate inner scroller in the product: it is modal, it is capped at `min(70dvh, 560px)`, and
it carries `overscroll-behavior: contain`.

**The preview is unmounted, not hidden.** It was hidden with `display: none`, which hides an element
without unmounting it. On every phone, in edit mode, `ResumeTemplate` was parsing the CV and
re-laying out an A4 page behind a `ResizeObserver` on every keystroke, for a box nobody could see.
`useMediaQuery` (a `useSyncExternalStore` over `matchMedia`, so no hydration mismatch and no
first-render-wrong) decides, and the server snapshot is `false` — the safe direction, because it
means a phone's first paint never contains a document nobody asked for.

**One fixed action bar.** Back and Continue were the last block in each step's scroll flow: off
screen on a long step, and under iOS Safari's own bottom bar on a short one. Now `position: fixed`
with `env(safe-area-inset-bottom)`, and `--bd-bar` is declared once and used twice — by the bar and
by the padding that reserves its height. The old code used `pb-24` (96px) against a bar measuring
68px, so the gap was wrong in both directions depending on the device.

**The step transition is 180ms.** It was `bdReveal`: 1100ms of opacity + translate + an animated
`filter: blur(6px)`, with `both`, which holds the invisible FROM state before the animation starts.
Four to seven times longer than the brief asks for, on the most expensive property available, and
invisible until it began.

## One design system, not two

- **Two colour palettes were live.** `--cosmos-bg` / `--cosmos-text` / `--cosmos-muted` had
  *different values* from the global ones (`#05070d` against `#0b0626`, `#8a93a8` against
  `rgba(245,246,250,0.68)`) and were used by login, both 404s and the payment callback. Those four
  screens were a slightly different product and nothing said which was correct. Removed, not
  renamed.
- **Two `:root` token blocks** re-declared `--aurora-1/2/3` and `--gold`. The duplicates are gone
  along with the gradients that used them; what remains is the light-surface palette, which is real
  — a published resume and the paid confirmation card are deliberately light, because a printed
  document on a black page is the one place a dark theme is wrong.
- **Nineteen files** repeated the same sticky-header markup with a hardcoded
  `rgba(5,7,13,0.85)` gradient and their own vertical padding, from `py-3` to `py-6`. So content
  began at a different height on each page and moving between them made the layout jump. `PageShell`
  plus `.ps-header` / `.ps-header-in` / `.ps-body` is one place now.
- **`scroll-behavior: smooth` on `html` is gone.** It turned every programmatic scroll into an
  animation, including the builder's own "start each step at the top" — so pressing Continue slid
  the old content upward for 200-odd milliseconds while the new step was already rendering.
- **`min-h-screen` → `min-h-dvh`** in 38 files. On iOS Safari `100vh` excludes the address bar, so
  every one of those pages was 60–90px taller than the screen: a scrollbar on a page with nothing to
  scroll, and a bottom bar pushed under the browser chrome.

## The layer contract

Seven named steps in `globals.css`, replacing four numbers in circulation (1, 10, 30, 50 and one
`z-[100]`) with no statement of what they meant:

```
--z-backdrop: 0     the sky
--z-decor: 1        decorative orbs in cards — always pointer-events: none
--z-content: 10     everything a reader reads or presses
--z-header: 40      the sticky header
--z-actionbar: 45   the builder's Back / Continue bar
--z-menu: 60        the step sheet, the mobile menu
--z-dialog: 80      checkout
```

Enforced once — `main { position: relative; z-index: var(--z-content) }` — rather than remembered per
page. It had to be: the old contract was a comment, twenty-seven pages never opted in, and CSS paints
a positioned decorative layer above all non-positioned content in the same stacking context. Those
pages rendered as an empty purple field with only the header visible, and because the layer was
`pointer-events: none` every button still worked and every automated check still passed.

## Deleted

`AiOrb`, `OrbBrand`, `OrbProvider`, `OrbSceneSetter`, `AmbientField`, `CosmosField`, `AuroraBlobs`,
`GlassCard`, `GoldField`, `useSectionCinema` — plus ~300 lines of CSS. `framer-motion` stays in
`package.json` and now has no importer; the brief says not to remove a library merely for existing,
and the next thing that needs a spring should not have to re-add it.

Kept deliberately: `AuroraBurst`, a one-shot 2.2s particle burst on a confirmed payment. It is a
celebration on one page, not a background, and it does not run behind anything.

## What the suite asserts, per device

Eight profiles — iPhone SE, iPhone 13 (Safari and a Chrome user agent), a 430×932 large phone,
Pixel 7, iPad, desktop, and a deliberate 320px screen, because that is where a fixed bar and a step
name compete for one row and nobody tests it.

Per page: no full-screen purple wash; no animation canvas; no orb that can swallow a tap; the orb
does not cover the heading (`elementFromPoint` over it); the document is the only scroller (measured
as "has a scrolling overflow **and** more content than it shows" — not merely `overflow: auto`); no
sideways scroll; exactly one backdrop; no large gap between the document height and the lowest
content; no unaccounted fixed overlay; no page errors.

In the builder: exactly one step rendered; exactly one `role="progressbar"`; the old rail and step
column absent; the step bar has a number, a name on one line, a bar and a button; the preview is
**not** mounted in mobile edit mode and mounts and unmounts with the toggle; the action bar is fixed
at the bottom of the viewport, covers no field, and both controls pass a hit test; the sheet lists
eleven steps, is the only scroller while open, and closes on Escape; Continue navigates in under
900ms to a rendered step, not a loader; browser Back and Forward work and replay nothing; a refresh
mid-build renders the step directly.
