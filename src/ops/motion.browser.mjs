/**
 * Does the motion actually RUN?
 *
 * The rule this session keeps re-learning: an effect that is written is not an effect that runs.
 * A class can be present, spelled right, and never fire — the accept animation shipped for weeks
 * against a node that was removed in the same commit that added the class.
 *
 * So nothing here asserts that a class exists. Every check observes the browser: `animationstart`,
 * `transitionstart`, or a computed value read at a moment that matters.
 *
 * ── a sandbox limit worth knowing before you read a failure here ──
 *
 * This suite makes about twenty-three navigations. In a long-lived container it has been observed to
 * die at the last one with "Target page, context or browser has been closed" — including with a
 * freshly launched browser for that section, so it is the environment running out of something
 * (descriptors, /dev/shm, PIDs) rather than the suite or the page. The route in question answers in
 * 19ms to curl at the same moment.
 *
 * If the final section fails that way, restart the container or the server and re-run before
 * believing it. Everything up to it passing and only the last navigation failing is the signature.
 *
 * The iOS backdrop-filter budget deliberately lives in its own file, `ops/iosblur.browser.mjs`, for
 * the same reason — adding its navigations here killed this suite partway through, which made an
 * unrelated section look broken.
 */

import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:3311";
let pass = 0, fail = 0;
const ok = (n, c, d = "") => {
  if (c) { pass++; console.log(`✅ ${n}`); }
  else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); }
};

const browser = await chromium.launch({
  /* The pinned build (1228) is not on this machine; 1194 is. Scroll-driven animations and the
     independent `translate` property both predate it, so it answers the questions asked here. */
  executablePath: process.env.CHROME_PATH || undefined,
});

/* ── 1. the hero sequence, and the metric it must not cost ─────────────────── */
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    window.__anim = [];
    addEventListener("animationstart", (e) => {
      window.__anim.push({ name: e.animationName, cls: e.target.className?.toString?.().slice(0, 60) });
    }, true);
  });
  await page.goto(`${BASE}/`, { waitUntil: "load" });
  await page.waitForTimeout(900);
  const anim = await page.evaluate(() => window.__anim);

  const hero = anim.filter((a) => a.name === "t-hero-in");
  ok("the hero sequence fires", hero.length >= 4, `${hero.length} children animated`);

  /* The whole reason it rises instead of fading: LCP does not count an element at zero opacity. */
  const h1 = await page.evaluate(() => {
    const el = document.querySelector("h1");
    return { opacity: getComputedStyle(el).opacity, text: el.textContent.slice(0, 24) };
  });
  ok("the h1 is painted at full opacity throughout", h1.opacity === "1", `opacity ${h1.opacity}`);

  await page.close();
}

/* ── 2. every card on a page ends up visible ───────────────────────────────── */
/*
 * The failure this exists to catch is total and silent: `animation-fill-mode: both` on a
 * scroll-driven animation holds `opacity: 0` until the element enters its range. Get the range or
 * the scrollport wrong and the content is simply never there, with no error anywhere.
 */
const PAGES = [
  "/", "/ar", "/pricing", "/resume-examples", "/resume-examples/registered-nurse",
  "/resume-templates", "/ats-resume-checker", "/ar/pricing", "/builder",
];

for (const path of PAGES) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${BASE}${path}`, { waitUntil: "load" });
  await page.waitForTimeout(400);

  /* Scroll the whole document in viewport-sized steps, so every card passes through its range. */
  await page.evaluate(async () => {
    const step = innerHeight * 0.8;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      scrollTo(0, y);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
    scrollTo(0, document.body.scrollHeight);
    await new Promise((r) => setTimeout(r, 120));
  });

  const invisible = await page.evaluate(() =>
    [...document.querySelectorAll(".card, .t-enter")]
      .filter((el) => Number(getComputedStyle(el).opacity) < 0.99)
      .map((el) => `${el.tagName}.${el.className}`.slice(0, 70)));
  const total = await page.evaluate(() => document.querySelectorAll(".card, .t-enter").length);
  ok(`${path}: all ${total} revealed elements visible after scrolling`, invisible.length === 0,
    invisible.slice(0, 3).join(" | "));
  await page.close();
}

/* ── 2b. and the reveal does not cost a compositor layer per item ──────────── */
/*
 * ── the check this suite did not have, and the bug it did not catch ──
 *
 * The first version of the scroll entrance was applied to every `.card`. All eighteen checks here
 * passed: the motion ran, nothing was left invisible, the presses worked. It was still a crash.
 *
 * A scroll-driven animation with `fill: both` never finishes. It stays attached for the life of the
 * page, so every element carrying one is promoted to its own compositor layer PERMANENTLY, on or off
 * screen. On `/resume-examples` — fifty cards — that took the layer count from 11 to 62, and it was
 * reported from a real phone as the browser closing the tab on open, which is what a phone running
 * out of GPU memory looks like to the person it happens to.
 *
 * "Does it run" and "what does running it cost" are different questions, and this suite was only
 * asking the first one. The reveal is now on the SECTION rather than on each card in it, and this
 * budget is what stops it drifting back: a page may reveal its sections, not its items.
 */
{
  /*
   * Two numbers, because one of them is the real invariant and the other is only a smoke alarm.
   *
   * The absolute cap catches a runaway. What actually went wrong, though, was that the cost SCALED
   * with the content: fifty cards meant fifty layers, so the busiest page in the catalogue was the
   * most expensive one, and every new catalogue page made it worse. A page may reveal its sections —
   * a fixed handful — and must never reveal its items.
   */
  const BUDGET = 32;
  for (const path of ["/resume-examples", "/", "/resume-examples/registered-nurse", "/ar"]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("LayerTree.enable");
    let layers = [];
    cdp.on("LayerTree.layerTreeDidChange", (e) => { layers = e.layers || layers; });
    await page.goto(`${BASE}${path}`, { waitUntil: "load" });
    await page.waitForTimeout(900);
    await page.evaluate(() => scrollTo(0, 600));
    await page.waitForTimeout(900);
    const { live, cards } = await page.evaluate(() => ({
      live: document.getAnimations().length,
      cards: document.querySelectorAll(".card").length,
    }));
    ok(`${path}: ${layers.length} compositor layers, under the budget of ${BUDGET}`,
      layers.length > 0 && layers.length <= BUDGET, `${layers.length} layers, ${live} live animations`);
    /* Only meaningful where there are enough items for the difference to show. */
    if (cards >= 20) {
      ok(`${path}: ${live} live animations for ${cards} cards — the cost does not follow the content`,
        live < cards / 2, `${live} vs ${cards}`);
    }
    await ctx.close();
  }
}

/* ── 3. a card actually animates on the way in ─────────────────────────────── */
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  /* The landing page, not the catalogue index: the index is one section and it is all above the
     fold, so there would be nothing below the fold to find and the check would report `found: false`
     rather than a verdict. */
  await page.goto(`${BASE}/`, { waitUntil: "load" });
  await page.waitForTimeout(400);

  /* A SECTION, not a card — the reveal moved up a level when the per-card version turned out to cost
     a permanent compositor layer each. Pointing this at `.card` would now pass vacuously by finding
     nothing hidden, which is the wrong kind of green. */
  const before = await page.evaluate(() => {
    const els = [...document.querySelectorAll(".t-enter")];
    const below = els.find((c) => c.getBoundingClientRect().top > innerHeight + 50);
    return below ? { opacity: getComputedStyle(below).opacity, found: true } : { found: false };
  });
  ok("a section below the fold starts hidden", before.found && Number(before.opacity) < 0.2,
    JSON.stringify(before));

  const after = before.found ? await page.evaluate(async () => {
    const els = [...document.querySelectorAll(".t-enter")];
    const below = els.find((c) => c.getBoundingClientRect().top > innerHeight + 50);
    below.scrollIntoView({ block: "center" });
    await new Promise((r) => setTimeout(r, 250));
    return getComputedStyle(below).opacity;
  }) : "0";
  ok("and is fully visible once scrolled to", Number(after) > 0.99, `opacity ${after}`);
  await page.close();
}

/* ── 4. the press — measured on a real pointer, not asserted from a class ──── */
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${BASE}/pricing`, { waitUntil: "load" });
  await page.waitForTimeout(400);

  const btn = page.locator(".btn-accent").first();
  const box = await btn.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(120);
  const hovered = await btn.evaluate((el) => getComputedStyle(el).transform);
  await page.mouse.down();
  await page.waitForTimeout(140);
  const pressed = await btn.evaluate((el) => getComputedStyle(el).transform);
  await page.mouse.up();

  ok("the primary button lifts on hover", hovered !== "none", hovered);
  ok("and visibly changes under the press", pressed !== hovered, `${hovered} → ${pressed}`);
  /* The specific failure it had: a scale that is really a no-op because something out-specified it. */
  ok("the press is a scale, not a no-op", /matrix\(0\.9/.test(pressed), pressed);
  await page.close();
}

/* ── 5. a builder card presses too — the half a phone could never reach ────── */
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await page.goto(`${BASE}/`, { waitUntil: "load" });
  await page.waitForTimeout(500);
  const card = page.locator("a.card").first();
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const box = await card.boundingBox();
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.waitForTimeout(140);
  const pressed = await card.evaluate((el) => getComputedStyle(el).transform);
  await page.mouse.up();
  ok("an offer card presses", pressed !== "none" && /matrix/.test(pressed), pressed);
  await page.close();
}

/* ── 6. the step transition still fires on a real navigation ───────────────── */
/* `/builder/target` is NOT a step route — a step is `/builder/<resumeId>/<step>`. The first version
   of this check used the short form, got no `bdStepIn`, and reported a working animation as broken.
   A probe pointed at the wrong URL fails the same way a missing effect does. */
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    window.__anim = [];
    addEventListener("animationstart", (e) => window.__anim.push(e.animationName), true);
  });
  await page.goto(`${BASE}/builder/probe-1/target`, { waitUntil: "load" });
  await page.waitForTimeout(1200);
  const seen = await page.evaluate(() => window.__anim);
  ok("the step transition fires on arrival", seen.includes("bdStepIn"), seen.slice(0, 6).join(", "));
  await page.close();
}

await browser.close();
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
