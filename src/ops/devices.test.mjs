/**
 * The whole journey at two sizes, on every step.
 *
 * What nothing else checked: the responsive contract *inside the builder*. `ops/routes.test.mjs`
 * checks horizontal overflow on marketing pages at one desktop width, and the step routes are
 * where the layout actually gets hard — a three-column grid collapsing to one, a sticky header
 * above a horizontally scrolling step navigation, and an A4 preview that has to disappear
 * entirely rather than shrink.
 *
 * Two bugs found by hand on these routes were of exactly this kind, both invisible to every
 * other suite, and both are now fixed with the measurement written next to the fix:
 *
 *   · a grid item's default `min-width: auto` refused to shrink below its content, so the step
 *     navigation sized itself to all eleven labels end to end — 1151px inside a 390px viewport
 *     — and pushed the PAGE sideways. `overflow-x: auto` on the list inside did nothing,
 *     because the list was never the constrained box. Fix: `min-width: 0` on every column
 *     (`app/build.css`).
 *   · Next scrolls the changed segment into view, and the changed segment is the step — so
 *     arriving at one left the Edit/Preview toggle at y = −31 and the navigation at y = 29
 *     under a 52px sticky header. Both present, both unreachable. Fix: scroll to top on a step
 *     change, and `scroll={false}` on the navigations so Next does not fight it
 *     (`BuilderShell.tsx`).
 *
 * So this walks all eleven steps at each size and measures three things on each: sideways
 * scroll, a first control sitting under the sticky header, and tap targets.
 *
 * The regression value is the point — those two were found once, by looking. Nothing would
 * have told anyone if a later change reintroduced either.
 *
 * ── WHAT THIS IS NOT ──
 *
 * It is NOT Mobile Safari. WebKit cannot be downloaded in this sandbox (`playwright install
 * webkit` fails on the network policy), so the mobile pass is Chromium driven with the
 * iPhone 13 device descriptor: the viewport, device pixel ratio, touch support and iOS user
 * agent are real, and the rendering engine is not. That covers layout, overflow, tap targets
 * and the flow. It does NOT cover WebKit text metrics, iOS Safari's 100vh behaviour, its
 * form-control styling, or its habit of discarding a backgrounded tab — which is the reason
 * `BuilderProvider` flushes on `visibilitychange`, and the one thing here that genuinely
 * needs a real device to confirm.
 *
 *   node ops/devices.test.mjs [baseUrl]
 */

import { chromium, devices } from "playwright";

const BASE = process.argv[2] || "http://localhost:3141";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };

const STEPS = [
  "target", "blueprint", "personal", "experience", "education",
  "credentials", "skills", "languages", "summary", "review", "design",
];

/**
 * Apple's own guidance, and the number this codebase's comments already cite — but it is a
 * guideline about FINGERS. A 33px row is not a defect under a mouse; it is a defect under a
 * thumb. So the floor is per profile, and the desktop number exists only to catch something
 * genuinely unclickable rather than to enforce a touch rule where there is no touch.
 */
const MIN_TAP_TOUCH = 44;
const MIN_TAP_POINTER = 30;

const PROFILES = [
  { name: "desktop-chrome", ctx: { viewport: { width: 1440, height: 900 } }, mobile: false },
  {
    name: "iphone-13",
    // The real descriptor: 390×844, DPR 3, touch, iOS UA. Chromium underneath — see above.
    ctx: devices["iPhone 13"],
    mobile: true,
  },
];

const run = async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });

  for (const prof of PROFILES) {
    console.log(`\n── ${prof.name} ──`);
    const ctx = await browser.newContext(prof.ctx);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));

    /* Suggestions are stubbed: this suite is about layout, and a real call would make the
       measurements depend on how long a model took. */
    await page.route("**/api/suggest", (r) => r.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ items: ["A suggested responsibility line for measurement"] }),
    }));
    await page.route("**/api/optimize", (r) => r.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ matchScore: 60, missingKeywords: [], presentKeywords: [], improvements: [], skillsGap: [] }),
    }));

    /* ── the landing page ── */
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    const land = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      h1: document.querySelectorAll("h1").length,
    }));
    ok(`${prof.name}: the landing page does not scroll sideways`, land.overflow <= 1, `${land.overflow}px`);
    ok(`${prof.name}: and has exactly one h1`, land.h1 === 1);

    /* ── into the builder ── */
    await page.goto(`${BASE}/builder`, { waitUntil: "networkidle" });
    const enter = page.locator('a[href^="/builder/r"][href$="/target"]').first();
    await enter.waitFor({ timeout: 25_000 });
    await enter.click();
    await page.waitForURL(/\/target$/);
    await page.waitForSelector(".bd-form input.bd-input");
    const id = new URL(page.url()).pathname.split("/").filter(Boolean).at(-2);
    // A title, so the later steps have content to lay out rather than empty states.
    await page.fill(".bd-form input.bd-input >> nth=0", "Radiology Technologist");
    await page.waitForTimeout(800);

    /* ── every step, at this size ── */
    const overflowing = [];
    const covered = [];
    const tooSmall = [];

    for (const step of STEPS) {
      await page.goto(`${BASE}/builder/${id}/${step}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(500);

      const m = await page.evaluate((MIN) => {
        const vw = window.innerWidth;
        const header = document.querySelector("header.sticky");
        const headerBottom = header ? header.getBoundingClientRect().bottom : 0;

        /*
         * "Covered" means the first thing the user must interact with sits underneath the
         * sticky header, or above the fold's top edge. Both were real: arriving at a step
         * scrolled the chrome off, and a shorter header still overlaps if the scroll
         * position is wrong.
         */
        const firstControl = document.querySelector(".bd-form input, .bd-form textarea, .bd-form select, .bd-form button");
        const fc = firstControl ? firstControl.getBoundingClientRect() : null;

        /* Primary controls only: Continue, Back, and the step navigation links. A 24px
           inline "remove" pill inside a card is not a primary control and holding it to
           44px would make the cards unusable. */
        const primaries = [
          ...document.querySelectorAll(".bd-step-foot button, .bd-step-foot a, .bd-nav a"),
        ];
        const small = primaries
          .filter((el) => el.getBoundingClientRect().height > 0)
          .filter((el) => el.getBoundingClientRect().height < MIN)
          .map((el) => `${(el.textContent || "").trim().slice(0, 18)}@${Math.round(el.getBoundingClientRect().height)}px`);

        return {
          overflow: document.documentElement.scrollWidth - vw,
          headerBottom: Math.round(headerBottom),
          firstTop: fc ? Math.round(fc.top) : null,
          small: [...new Set(small)],
          navVisible: !!document.querySelector(".bd-nav a"),
          previewShown: (() => {
            const el = document.querySelector(".bd-preview");
            return !!el && getComputedStyle(el).display !== "none";
          })(),
          toggleShown: (() => {
            const el = document.querySelector(".lg\\:hidden");
            return !!el && getComputedStyle(el).display !== "none";
          })(),
        };
      }, prof.mobile ? MIN_TAP_TOUCH : MIN_TAP_POINTER);

      if (m.overflow > 1) overflowing.push(`${step}:${m.overflow}px`);
      if (m.firstTop !== null && m.firstTop < m.headerBottom) covered.push(`${step}:${m.firstTop}<${m.headerBottom}`);
      if (m.small.length) tooSmall.push(`${step}:${m.small.join(",")}`);

      if (step === "target") {
        ok(`${prof.name}: the step navigation is present`, m.navVisible);
        if (prof.mobile) {
          ok(`${prof.name}: the Edit/Preview toggle is shown`, m.toggleShown);
          ok(`${prof.name}: and the CV is NOT beside the form`, !m.previewShown);
        } else {
          ok(`${prof.name}: the CV sits beside the form`, m.previewShown);
          ok(`${prof.name}: and there is no mobile toggle`, !m.toggleShown);
        }
      }
    }

    ok(`${prof.name}: no step scrolls sideways`, overflowing.length === 0, overflowing.join(" · "));
    ok(`${prof.name}: no step's first control is hidden under the sticky header`,
      covered.length === 0, covered.join(" · "));
    ok(`${prof.name}: every primary control is at least ${prof.mobile ? MIN_TAP_TOUCH : MIN_TAP_POINTER}px tall`,
      tooSmall.length === 0, tooSmall.slice(0, 3).join(" · "));

    /* ── the mobile toggle actually reveals the CV ── */
    if (prof.mobile) {
      await page.goto(`${BASE}/builder/${id}/personal`, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await page.fill(".bd-form input.bd-input >> nth=0", "Aisha Al-Otaibi");
      await page.waitForTimeout(700);
      await page.locator('.lg\\:hidden button', { hasText: "Preview" }).click();
      await page.waitForTimeout(600);
      const shown = await page.evaluate(() => {
        const el = document.querySelector(".bd-preview");
        return el && getComputedStyle(el).display !== "none" ? el.innerText : "";
      });
      ok(`${prof.name}: tapping Preview shows the CV`, shown.includes("Aisha Al-Otaibi"), shown.slice(0, 80));
      const formHidden = await page.evaluate(() => {
        const el = document.querySelector(".bd-form");
        return !el || getComputedStyle(el).display === "none";
      });
      ok(`${prof.name}: and hides the form, so neither is half-usable`, formHidden);

      /*
       * Arriving at the next step must come back to Edit. Showing a CV and no form after a
       * Continue reads as a broken button rather than as a preference from two steps ago.
       */
      await page.locator('.lg\\:hidden button', { hasText: "Edit" }).click();
      await page.locator(".bd-step-foot button.btn-accent").click();
      await page.waitForURL(/\/experience$/);
      await page.waitForTimeout(500);
      const backToEdit = await page.evaluate(() => {
        const el = document.querySelector(".bd-form");
        return !!el && getComputedStyle(el).display !== "none";
      });
      ok(`${prof.name}: the next step opens on the form, not the preview`, backToEdit);

      /*
       * ── the rail has to follow the user ──
       *
       * Eleven steps in a 390px viewport fits about three. Pressing Continue moves to a step that is
       * off-screen to the right, so without intervention the rail keeps showing the steps already
       * finished — and the one piece of orientation it exists to give is the one thing it stops
       * giving. Invisible on a desktop, where all eleven sit in a visible column, which is exactly why
       * it survived until someone photographed a phone.
       *
       * Measured rather than asserted structurally: the active item's centre against the scroller's
       * centre. A class name would prove the code ran; this proves the pixel moved.
       */
      const rail = async () => page.evaluate(() => {
        const nav = document.querySelector(".bd-nav ol");
        const active = document.querySelector('.bd-nav a[aria-current="step"]');
        if (!nav || !active) return null;
        const n = nav.getBoundingClientRect();
        const a = active.getBoundingClientRect();
        return {
          /* Is it inside the scroller's visible box at all? */
          visible: a.left >= n.left - 1 && a.right <= n.right + 1,
          /* How far its centre is from the scroller's, as a share of the scroller's width. */
          offCentre: Math.abs((a.left + a.width / 2) - (n.left + n.width / 2)) / n.width,
          scrollable: nav.scrollWidth > nav.clientWidth + 4,
        };
      });

      /* Walk far enough that the active step is genuinely past the fold. */
      for (let i = 0; i < 4; i++) {
        await page.locator(".bd-step-foot button.btn-accent").click();
        await page.waitForTimeout(500);
      }
      const r = await rail();
      ok(`${prof.name}: the step rail is a real horizontal scroller`, r?.scrollable === true, JSON.stringify(r));
      ok(`${prof.name}: the active step is scrolled into view after four Continues`,
        r?.visible === true, JSON.stringify(r));
      /* Centred, not merely on screen. "Just inside the right edge" is where it would sit with no
         intervention at all, so a visibility check alone would pass on the broken behaviour. */
      ok(`${prof.name}: and it is near the centre of the rail, not clinging to an edge`,
        (r?.offCentre ?? 1) < 0.3, `offCentre=${r?.offCentre?.toFixed(3)}`);

      /*
       * ── the step controls clear the browser's own chrome ──
       *
       * iOS Safari draws its bottom bar over whatever the page put there, and Back/Continue are the
       * two controls a step exists to reach. `env(safe-area-inset-bottom)` is 0 in a headless
       * Chromium, so what is checked here is that the RULE is applied and resolves — a typo'd
       * `env()` computes to nothing and would leave the padding at 0 with no error anywhere.
       */
      const footPad = await page.evaluate(() => {
        const el = document.querySelector(".bd-step-foot");
        return el ? getComputedStyle(el).paddingBottom : "";
      });
      ok(`${prof.name}: the step footer reserves space below the buttons`,
        parseFloat(footPad) >= 8, footPad);
    }

    ok(`${prof.name}: no page errors across all eleven steps`, errors.length === 0, errors[0] ?? "");
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
