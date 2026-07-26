/**
 * The design brief, as assertions, on seven devices.
 *
 * ── why a browser and not a code review ──
 *
 * Every item in that brief is a claim about a rendered page, and most of them are invisible to a
 * type-checker and to every existing suite:
 *
 *   · "no double scroll" is a question about how many elements have a scrollable overflow.
 *   · "the buttons must not disappear" is a question about where `getBoundingClientRect()` puts
 *     them relative to the visual viewport.
 *   · "don't load the preview while it is hidden" is a question about what is MOUNTED, which
 *     `display: none` deliberately hides from anyone reading the CSS.
 *   · "no huge empty space" is `scrollHeight` against content height.
 *   · "the orb must not cover the text" is `elementFromPoint` over the headings.
 *
 * All five passed a code review before this suite existed, and four of them were false.
 *
 * Needs the app running.
 *
 *   node ops/design.test.mjs [baseUrl]
 */

import { chromium, devices } from "playwright";

const BASE = process.argv[2] || "http://localhost:3141";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };

/*
 * The matrix the brief asks for. Small and large phones, both engines' viewport shapes, a
 * tablet, and a desktop — plus one deliberately tiny screen, because 320px is where a fixed
 * bar and a step name compete for the same row and it is the width nobody tests.
 */
const PROFILES = [
  { name: "iphone-se (small)", ctx: { ...devices["iPhone SE"] } },
  { name: "iphone-13 (safari)", ctx: { ...devices["iPhone 13"] } },
  { name: "iphone-13 (chrome ua)", ctx: { ...devices["iPhone 13"], userAgent: `${devices["iPhone 13"].userAgent} CriOS/122.0` } },
  { name: "iphone-15-pro-max (large)", ctx: { viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
  { name: "pixel-7 (android)", ctx: { ...devices["Pixel 7"] } },
  { name: "ipad (tablet)", ctx: { ...devices["iPad (gen 7)"] } },
  { name: "desktop", ctx: { viewport: { width: 1440, height: 900 } } },
  { name: "narrow-320", ctx: { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true } },
];

/** Pages a visitor meets, in both languages. */
const PAGES = [
  "/", "/ar", "/optimize", "/ar/optimize", "/pricing", "/ar/pricing",
  "/login", "/account", "/builder", "/ar/builder",
  "/resume-examples", "/resume-examples/category/technology",
];

/* ── the probes, run inside the page ── */

const PROBE = `(() => {
  const doc = document.documentElement;

  /*
   * Every element that can actually scroll, other than the document.
   *
   * The test is not "is overflow auto" — a box with \`overflow: auto\` and no excess content is
   * harmless and common. It is "does this box have MORE content than it shows AND a scrolling
   * overflow", which is what makes a swipe land in it instead of on the page.
   */
  const scrollers = [];
  for (const el of document.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    const canY = /auto|scroll/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4;
    const canX = /auto|scroll/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 4;
    if (canY || canX) {
      scrollers.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && String(el.className).slice(0, 40)) || "",
        y: canY, x: canX,
      });
    }
  }

  /* A fixed layer that is neither the header, the action bar, a menu nor a dialog is a
     leftover overlay — the class of thing the brief asks to be removed. */
  const fixed = [...document.querySelectorAll("*")]
    .filter((el) => getComputedStyle(el).position === "fixed")
    .map((el) => ({
      cls: (el.className && String(el.className).slice(0, 40)) || el.tagName.toLowerCase(),
      z: getComputedStyle(el).zIndex,
      events: getComputedStyle(el).pointerEvents,
      h: Math.round(el.getBoundingClientRect().height),
    }));

  /* Anything that paints a purple/pink FULL-SCREEN wash over the content. The old intro. */
  const bigTinted = [...document.querySelectorAll("body *")].filter((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < innerWidth * 0.8 || r.height < innerHeight * 0.8) return false;
    const cs = getComputedStyle(el);
    if (cs.pointerEvents === "none") return false;      // decoration, cannot block anything
    const bg = cs.backgroundColor;
    const m = /rgba?\\((\\d+), ?(\\d+), ?(\\d+)(?:, ?([\\d.]+))?\\)/.exec(bg);
    if (!m) return false;
    const [r0, g0, b0, a0] = [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
    /* violet/pink: blue and red both well above green, and actually opaque enough to hide text */
    return a0 > 0.5 && b0 > g0 + 40 && r0 > g0 + 20;
  }).map((el) => (el.className && String(el.className).slice(0, 40)) || el.tagName);

  /* Is the first heading readable, or is something painted on top of it? */
  let headingBlocked = "";
  const h = document.querySelector("h1, h2");
  if (h) {
    const r = h.getBoundingClientRect();
    if (r.width > 0 && r.top > 0 && r.top < innerHeight) {
      const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      if (hit && hit !== h && !h.contains(hit) && !hit.contains(h)) {
        headingBlocked = (hit.className && String(hit.className).slice(0, 40)) || hit.tagName;
      }
    }
  }

  /*
   * Emptiness: how much taller the document is than the tallest thing in it.
   *
   * Walks \`body *\`, not \`main *\`. The first version used \`main\` and reported 2132px of
   * "nothing" on /optimize — where the layout renders the tool inside <main> and then the
   * server-rendered SEO section AFTER it, outside <main>. The page was correct and the
   * measurement was blind to half of it.
   */
  let contentBottom = 0;
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.position === "fixed" || cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.height === 0 || r.width === 0) continue;
    contentBottom = Math.max(contentBottom, r.bottom + scrollY);
  }

  return {
    scrollers,
    fixed,
    bigTinted,
    headingBlocked,
    docHeight: doc.scrollHeight,
    contentBottom: Math.round(contentBottom),
    overflowX: doc.scrollWidth - innerWidth,
    canvases: document.querySelectorAll("canvas").length,
    backdrops: document.querySelectorAll(".space-backdrop").length,
    orbs: document.querySelectorAll(".brand-orb").length,
    /* Any orb that is NOT transparent to the pointer would swallow a tap. */
    orbsClickable: [...document.querySelectorAll(".brand-orb")]
      .filter((el) => getComputedStyle(el).pointerEvents !== "none").length,
    a4: document.querySelectorAll("[data-resume-page], .resume-page").length,
  };
})()`;

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

/*
 * ── the guard that has to come first ──
 *
 * Every assertion below reads computed styles, so all of them are meaningless if the
 * stylesheet did not load. And that is not hypothetical: `next start` holds the build
 * manifest it started with, so rebuilding without restarting leaves the server pointing at
 * a CSS chunk that no longer exists. Its request 500s, the page renders completely unstyled,
 * and this suite then reported that the brand orb had `pointer-events: auto` — which was
 * true, and told us nothing about the CSS, because there was none.
 *
 * A run against an unstyled page must abort loudly rather than produce a plausible list of
 * failures. Checking one rule that only this product's own stylesheet defines is enough.
 */
{
  const probe = await browser.newPage();
  await probe.goto(`${BASE}/`, { waitUntil: "load" });
  await probe.waitForTimeout(300);
  const styled = await probe.evaluate(() => {
    const el = document.querySelector(".brand-orb");
    return el ? getComputedStyle(el).position === "relative" : false;
  });
  await probe.close();
  if (!styled) {
    console.error(
      "\nABORT: the stylesheet is not applied — `.brand-orb` computes as unstyled.\n" +
      "Almost always a server holding a stale build manifest: restart `next start` after\n" +
      "`next build`. Every measurement in this suite would be meaningless.\n");
    await browser.close();
    process.exit(2);
  }
}

for (const prof of PROFILES) {
  console.log(`\n── ${prof.name} ──`);
  const ctx = await browser.newContext(prof.ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));

  for (const path of PAGES) {
    errors.length = 0;
    /* `load`, not `networkidle`: these pages hold an analytics beacon open, so networkidle
       waits out a timeout on every one of ninety-six page loads for no extra certainty —
       everything measured here is laid out by `load` plus the settle below. */
    await page.goto(`${BASE}${path}`, { waitUntil: "load" }).catch(() => null);
    await page.waitForTimeout(350);
    const m = await page.evaluate(PROBE);

    /* 1 & 2 — the old cinematic layer is gone. */
    ok(`${path}: no full-screen purple wash over the content`, m.bigTinted.length === 0, m.bigTinted.join(","));
    ok(`${path}: no animation canvas`, m.canvases === 0, String(m.canvases));

    /* 3 — the orb is present, and inert. */
    ok(`${path}: no orb can swallow a tap`, m.orbsClickable === 0, String(m.orbsClickable));
    ok(`${path}: the orb does not cover the heading`, m.headingBlocked === "", m.headingBlocked);

    /* 4 — one scroll system. */
    ok(`${path}: the document is the only scroller`, m.scrollers.length === 0,
      m.scrollers.map((s) => `${s.tag}.${s.cls}${s.x ? "(x)" : ""}`).join(" · "));
    ok(`${path}: no sideways scroll`, m.overflowX <= 1, `${m.overflowX}px`);

    /* 7 — one background, adding no height. */
    ok(`${path}: exactly one backdrop`, m.backdrops === 1, String(m.backdrops));
    /* 240px of slack covers a footer's bottom margin and the fixed bar's reserved space. */
    ok(`${path}: no huge empty space below the content`,
      m.docHeight - m.contentBottom < 240, `${m.docHeight - m.contentBottom}px of nothing`);

    /* 15 — every fixed layer is a named layer, and decoration cannot block. */
    const strayFixed = m.fixed.filter((f) =>
      !/space-backdrop|ps-header|bd-header|bd-actions|bd-sheet|grain|toast/.test(f.cls) &&
      f.events !== "none" && f.h > 40);
    ok(`${path}: no unaccounted fixed overlay`, strayFixed.length === 0,
      strayFixed.map((f) => `${f.cls}@z${f.z}`).join(" · "));

    ok(`${path}: no page errors`, errors.length === 0, errors[0] || "");
  }

  await ctx.close();
}

/* ── the builder, which is where most of the brief lives ── */

for (const prof of [PROFILES[1], PROFILES[4], PROFILES[6]]) {
  console.log(`\n── builder · ${prof.name} ──`);
  const ctx = await browser.newContext(prof.ctx);
  const page = await ctx.newPage();
  const isPhone = (prof.ctx.viewport?.width ?? 1440) < 1024;

  await page.goto(`${BASE}/builder`, { waitUntil: "load" });
  await page.waitForTimeout(600);

  /* Enter the builder the way a user does. */
  const start = page.locator("button", { hasText: /Start|Continue/ }).first();
  if (await start.count()) await start.click();
  await page.waitForTimeout(800);

  const onStep = /\/builder\/[^/]+\/[^/]+/.test(new URL(page.url()).pathname);
  ok(`${prof.name}: pressing Start reaches a step route`, onStep, page.url());

  if (onStep) {
    /* 5 — only the current step is mounted. Eleven h1s would mean eleven steps rendered. */
    const heads = await page.locator(".bd-step h1").count();
    ok(`${prof.name}: exactly one step is rendered`, heads === 1, String(heads));

    /* 10 — one progress indicator. */
    const bars = await page.locator('[role="progressbar"]').count();
    ok(`${prof.name}: exactly one progress indicator`, bars === 1, String(bars));
    ok(`${prof.name}: the old eleven-segment rail is gone`, (await page.locator(".bd-rail").count()) === 0);
    ok(`${prof.name}: the old step-list column is gone`, (await page.locator(".bd-nav").count()) === 0);

    /* 8 — the mobile step bar shows a number, a name, a bar and a button. Nothing else. */
    const bar = await page.evaluate(() => {
      const el = document.querySelector(".bd-stepbar");
      if (!el) return null;
      return {
        num: el.querySelector(".bd-stepbar-num")?.textContent?.trim() ?? "",
        name: el.querySelector(".bd-stepbar-name")?.textContent?.trim() ?? "",
        track: !!el.querySelector(".bd-stepbar-track"),
        btn: !!el.querySelector(".bd-stepbar-btn"),
        /* One line, always: a wrapped name changes the strip's height per step. */
        lines: Math.round((el.querySelector(".bd-stepbar-name")?.getBoundingClientRect().height ?? 0) / 22),
      };
    });
    ok(`${prof.name}: the step bar has a number`, /\d|[٠-٩]/.test(bar?.num ?? ""), bar?.num);
    ok(`${prof.name}: the step bar names the current step`, (bar?.name?.length ?? 0) > 1, bar?.name);
    ok(`${prof.name}: the step bar has one small progress bar`, bar?.track === true);
    ok(`${prof.name}: the step bar has a button for the full list`, bar?.btn === true);
    ok(`${prof.name}: the step name is on one line`, (bar?.lines ?? 9) <= 1, String(bar?.lines));

    /* 6 — no A4 preview mounted while the phone is in edit mode. */
    const previewMounted = await page.locator(".bd-preview").count();
    if (isPhone) {
      ok(`${prof.name}: the preview is NOT mounted in edit mode`, previewMounted === 0, String(previewMounted));
      /* And it appears when asked for — and unmounts again on the way back. */
      await page.locator(".bd-pane-btn").nth(1).click();
      await page.waitForTimeout(500);
      ok(`${prof.name}: pressing Preview mounts it`, (await page.locator(".bd-preview").count()) === 1);
      await page.locator(".bd-pane-btn").nth(0).click();
      await page.waitForTimeout(400);
      ok(`${prof.name}: pressing Edit unmounts it again`, (await page.locator(".bd-preview").count()) === 0);
    } else {
      ok(`${prof.name}: the preview is a column on a desktop`, previewMounted === 1, String(previewMounted));
      ok(`${prof.name}: the Edit/Preview toggle is not shown`,
        !(await page.locator(".bd-pane-toggle").first().isVisible().catch(() => false)));
    }

    /* 9 — the action bar is fixed, above the browser chrome, and covers no field. */
    const act = await page.evaluate(() => {
      const bar = document.querySelector(".bd-actions");
      if (!bar) return null;
      const r = bar.getBoundingClientRect();
      const cs = getComputedStyle(bar);
      /* The lowest interactive element in the form. If the bar overlaps it, it is covered. */
      let lowest = null;
      for (const el of document.querySelectorAll(".bd-form input, .bd-form textarea, .bd-form select, .bd-form button")) {
        const er = el.getBoundingClientRect();
        if (er.height === 0) continue;
        if (!lowest || er.bottom > lowest.bottom) lowest = er;
      }
      /*
       * "Is anything visible through the bar?" answered by hit-testing INSIDE it: a point in the
       * middle of the bar, away from the two buttons, must resolve to the bar or its own wrapper —
       * never to a form field that happens to be underneath.
       */
      const probeX = Math.round(r.left + r.width / 2);
      const probeY = Math.round(r.top + Math.min(12, r.height / 3));
      const under = document.elementFromPoint(probeX, probeY);
      const inBar = under ? bar.contains(under) || under === bar : false;
      const bg = cs.backgroundColor;
      const alpha = /rgba\([^)]*,\s*([\d.]+)\)/.exec(bg);
      return {
        position: cs.position,
        z: cs.zIndex,
        bottom: Math.round(r.bottom),
        top: Math.round(r.top),
        viewport: innerHeight,
        padBottom: cs.paddingBottom,
        overlapsField: lowest ? lowest.bottom > r.top + 1 : false,
        docPad: getComputedStyle(document.querySelector(".bd-main")).paddingBottom,
        bg,
        opaque: !alpha || Number(alpha[1]) >= 1,
        seeThrough: !inBar,
        seeThroughWhat: inBar ? "" : ((under?.className && String(under.className).slice(0, 40)) || under?.tagName || "none"),
      };
    });
    ok(`${prof.name}: the action bar is fixed`, act?.position === "fixed", act?.position);
    /*
     * OPAQUE. Two assertions this suite did not have, and both caught a real defect in a
     * screenshot rather than in a test — which is the whole reason they are here now.
     *
     * The bar was `rgba(7,5,20,0.72)` plus a backdrop blur, and a form label underneath was
     * plainly legible through it: a field's text reading through the Continue button. A blur is
     * also not something to rely on — it is skipped under some GPU-blocklist and
     * reduced-transparency settings, and then the bar is simply 28% transparent.
     */
    ok(`${prof.name}: the action bar is opaque`, act?.opaque === true, act?.bg);
    ok(`${prof.name}: nothing shows through the action bar`, act?.seeThrough === false, act?.seeThroughWhat);
    /*
     * And the step heading must own the width. `.bd-head` was `display: flex` because it once
     * held a step-number circle beside the text; with the number removed the title and the
     * subtitle became two side-by-side columns and the h1 was squeezed into half the space.
     */
    const head = await page.evaluate(() => {
      const h = document.querySelector(".bd-step h1");
      const box = document.querySelector(".bd-form") || document.querySelector(".bd-step");
      if (!h || !box) return null;
      return {
        ratio: h.getBoundingClientRect().width / box.getBoundingClientRect().width,
        display: getComputedStyle(h.parentElement).display,
      };
    });
    ok(`${prof.name}: the step heading spans the form, not half of it`,
      (head?.ratio ?? 0) > 0.6, `${Math.round((head?.ratio ?? 0) * 100)}% (parent ${head?.display})`);
    ok(`${prof.name}: the action bar sits at the bottom of the viewport`,
      Math.abs((act?.bottom ?? 0) - (act?.viewport ?? 0)) <= 2, `${act?.bottom} vs ${act?.viewport}`);
    ok(`${prof.name}: the action bar covers no field`, act?.overlapsField === false);
    ok(`${prof.name}: the page reserves room for the bar`,
      parseFloat(act?.docPad ?? "0") >= 60, act?.docPad);

    /* Both controls are actually reachable and hit-testable, which is the complaint that
       started this: controls that look present and do nothing. */
    for (const sel of [".bd-back", ".bd-continue"]) {
      const hit = await page.evaluate((s) => {
        const el = document.querySelector(s);
        if (!el) return "missing";
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
        return top === el || el.contains(top) ? "ok" : ((top?.className && String(top.className).slice(0, 30)) || top?.tagName || "none");
      }, sel);
      ok(`${prof.name}: ${sel} is on top and pressable`, hit === "ok", String(hit));
    }

    /* 8 — the sheet opens, lists every step, and closes. */
    await page.locator(".bd-stepbar-btn").click();
    await page.waitForTimeout(300);
    const sheetLinks = await page.locator(".bd-sheet-list a").count();
    ok(`${prof.name}: the step sheet lists all eleven steps`, sheetLinks === 11, String(sheetLinks));
    /* And it is a modal: the page behind it must not be a second scroller. */
    const sheetScrollers = await page.evaluate(() => [...document.querySelectorAll("*")].filter((el) => {
      const cs = getComputedStyle(el);
      return /auto|scroll/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4 && !el.classList.contains("bd-sheet");
    }).length);
    ok(`${prof.name}: the open sheet is the only scroller`, sheetScrollers === 0, String(sheetScrollers));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    ok(`${prof.name}: Escape closes the sheet`, (await page.locator(".bd-sheet").count()) === 0);

    /* 16 — Continue is fast, and there is no full-screen loader in between. */
    const before = page.url();
    const t0 = Date.now();
    await page.locator(".bd-continue").click();
    await page.waitForFunction((u) => location.href !== u, before, { timeout: 5000 });
    const ms = Date.now() - t0;
    ok(`${prof.name}: Continue navigates in under 900ms`, ms < 900, `${ms}ms`);
    await page.waitForTimeout(300);
    ok(`${prof.name}: the next step is rendered, not a loading screen`,
      (await page.locator(".bd-step h1").count()) === 1);
    ok(`${prof.name}: still exactly one progress indicator after navigating`,
      (await page.locator('[role="progressbar"]').count()) === 1);

    /* 17 — the browser's own Back and Forward. */
    await page.goBack();
    await page.waitForTimeout(500);
    ok(`${prof.name}: browser Back returns to the previous step`, page.url() === before, page.url());
    ok(`${prof.name}: and does not replay an intro`, (await page.locator("canvas").count()) === 0);
    await page.goForward();
    await page.waitForTimeout(500);
    ok(`${prof.name}: browser Forward works`, page.url() !== before);

    /* And a refresh mid-build must not replay anything either. */
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(500);
    ok(`${prof.name}: a refresh renders the step directly`, (await page.locator(".bd-step h1").count()) === 1);
    ok(`${prof.name}: a refresh replays no cinematic layer`, (await page.locator("canvas").count()) === 0);
  }

  await ctx.close();
}

await browser.close();
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
