/**
 * Cinematic-landing acceptance verification — the prompt's own criteria, measured.
 *   node ops/_tmp_cine_verify.mjs
 */
import { chromium } from "playwright-core";

const BASE = "http://localhost:3000";
const REC = "/tmp/claude-0/-home-user-resume-ai-source/396b21ba-a154-5a57-9e4c-7e4f8bb0b3b1/scratchpad/recordings";
let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); } };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

/* ── viewport battery: overflow + content + min font ── */
for (const [w, h] of [[1440, 1000], [1280, 800], [430, 932], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  for (const path of ["/", "/ar"]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    const m = await page.evaluate(() => {
      const doc = document.scrollingElement;
      let tiny = 0;
      for (const el of document.querySelectorAll(".cine-root *")) {
        const txt = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 2);
        if (!txt) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 13.5) tiny++;
      }
      return { over: doc.scrollWidth - innerWidth, h1: !!document.querySelector("h1"), tiny, intro: !!document.querySelector(".cine-intro") };
    });
    ok(`${w}x${h} ${path}: no horizontal overflow`, m.over <= 0, `${m.over}px`);
    ok(`${w}x${h} ${path}: h1 present`, m.h1);
    ok(`${w}x${h} ${path}: no meaningful text under 14px`, m.tiny === 0, `${m.tiny} tiny`);
    ok(`${w}x${h} ${path}: reduced-motion shows NO intro overlay`, !m.intro);
  }
  await ctx.close();
}

/* ── the film: plays once, skippable, keyboard-first ── */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const hasIntro = await page.evaluate(() => !!document.querySelector(".cine-intro"));
  ok("first visit: the intro plays", hasIntro);
  const focusOnSkip = await page.evaluate(() => document.activeElement?.className.includes("cine-skip"));
  ok("keyboard: initial focus is the Skip control", !!focusOnSkip);
  const line1 = await page.evaluate(() => !!document.querySelector('.cine-intro-line span[data-on]'));
  ok("intro: a statement is on screen", line1);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(900);
  ok("Escape skips the film", await page.evaluate(() => !document.querySelector(".cine-intro")));
  const scrollable = await page.evaluate(() => { window.scrollTo(0, 400); return new Promise((r) => setTimeout(() => r(scrollY > 0), 120)); });
  ok("the page scrolls normally after the film", scrollable);
  /* same tab session, second navigation → no replay */
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  ok("same session: the film does not replay", await page.evaluate(() => !document.querySelector(".cine-intro")));
  /* nav + focus visibility */
  const navLinks = await page.evaluate(() => [...document.querySelectorAll(".cine-nav-links a")].map((a) => a.textContent.trim()));
  ok("public nav: Explore/Product/Templates/Pricing/Login present", ["Explore", "Product", "Templates", "Pricing", "Login"].every((l) => navLinks.includes(l)), navLinks.join("|"));
  await page.keyboard.press("Tab");
  const focusVisible = await page.evaluate(() => {
    const el = document.activeElement;
    const st = getComputedStyle(el);
    return el.tagName === "A" && (st.outlineStyle !== "none" || st.boxShadow !== "none");
  });
  ok("keyboard focus is visible on the black theme", focusVisible);
  await ctx.close();
}

/* ── the story delivers: scenes + orb canvases + score reasons ── */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const orbs = await page.evaluate(() => document.querySelectorAll('[role="img"] canvas').length);
  ok("the Orb is everywhere the story needs it (≥6 instances)", orbs >= 6, `${orbs}`);
  /* hero demo plays */
  await page.waitForTimeout(5200);
  const typed = await page.evaluate(() => document.body.innerText.includes("Radiology Technologist"));
  ok("hero: the Career Profile fills itself", typed);
  /* tailoring: scroll it into view, watch the score step and the reasons appear */
  await page.evaluate(() => document.querySelector("#product").scrollIntoView({ block: "start" }));
  await page.waitForTimeout(5400);
  const { score, reasons } = await page.evaluate(() => ({
    score: document.querySelector(".cine-match-num")?.textContent ?? "",
    reasons: document.querySelectorAll(".cine-move[data-on]").length,
  }));
  ok("tailoring: the score reaches 91%", score.includes("91"), score);
  ok("tailoring: the score's REASONS are shown (4 moves)", reasons >= 4, `${reasons}`);
  /* road + mission + interview + pricing render on the way down */
  /* textContent, not innerText: below-fold scenes carry content-visibility:auto, whose
     un-rendered (but fully present, crawler-readable) subtrees innerText reports empty. */
  for (const selText of ["Master Resume", "Mission control", "trained a team", "SAR 35", "Start Building"]) {
    const found = await page.evaluate((s) => (document.documentElement.textContent ?? "").includes(s), selText);
    ok(`story contains: "${selText}"`, found);
  }
  await ctx.close();
}

/* ── recordings: desktop + mobile ── */
for (const [name, vp] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vp, recordVideo: { dir: REC, size: vp } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(9200);           // the film
  await page.waitForTimeout(4500);           // hero demo
  const step = vp.height * 0.85;
  for (let y = step; y < 6200; y += step) {  // the scroll journey
    await page.evaluate((yy) => window.scrollTo({ top: yy, behavior: "smooth" }), y);
    await page.waitForTimeout(1150);
  }
  await page.waitForTimeout(800);
  await ctx.close();
  console.log(`🎬 recorded ${name}`);
}

await browser.close();
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
