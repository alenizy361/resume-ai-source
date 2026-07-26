/**
 * Does the motion actually RUN?
 *
 * The rule this session keeps re-learning: an effect that is written is not an effect that runs.
 * A class can be present, spelled right, and never fire — the accept animation shipped for weeks
 * against a node that was removed in the same commit that added the class.
 *
 * So nothing here asserts that a class exists. Every check observes the browser: `animationstart`,
 * `transitionstart`, or a computed value read at a moment that matters.
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
    [...document.querySelectorAll(".card")]
      .filter((el) => Number(getComputedStyle(el).opacity) < 0.99)
      .map((el) => `${el.tagName}.${el.className}`.slice(0, 70)));
  const total = await page.evaluate(() => document.querySelectorAll(".card").length);
  ok(`${path}: all ${total} cards visible after scrolling`, invisible.length === 0,
    invisible.slice(0, 3).join(" | "));
  await page.close();
}

/* ── 3. a card actually animates on the way in ─────────────────────────────── */
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${BASE}/resume-examples`, { waitUntil: "load" });
  await page.waitForTimeout(300);

  const before = await page.evaluate(() => {
    const cards = [...document.querySelectorAll(".card")];
    const below = cards.find((c) => c.getBoundingClientRect().top > innerHeight + 50);
    return below ? { opacity: getComputedStyle(below).opacity, found: true } : { found: false };
  });
  ok("a card below the fold starts hidden", before.found && Number(before.opacity) < 0.2,
    JSON.stringify(before));

  const after = await page.evaluate(async () => {
    const cards = [...document.querySelectorAll(".card")];
    const below = cards.find((c) => c.getBoundingClientRect().top > innerHeight + 50);
    below.scrollIntoView({ block: "center" });
    await new Promise((r) => setTimeout(r, 200));
    return getComputedStyle(below).opacity;
  });
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
