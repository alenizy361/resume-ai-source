/**
 * Does the "the AI is working" feedback actually appear, and do the answers actually stagger?
 *
 * Same rule as the rest: observe the browser. `/api/generate` is intercepted so the reply is slow
 * and deterministic — the point is the three seconds of waiting, which is the thing that had no
 * feedback, and a real model call cannot be held open on demand.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:3311";
let pass = 0, fail = 0;
const ok = (n, c, d = "") => {
  if (c) { pass++; console.log(`✅ ${n}`); }
  else { fail++; console.log(`❌ ${n}${d ? ` — ${d}` : ""}`); }
};

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

/* A slow, canned blueprint. The delay is the experiment. */
await page.route("**/api/generate", async (route) => {
  await new Promise((r) => setTimeout(r, 1600));
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ok: true,
      data: {
        skills: ["CT imaging", "MRI safety", "Radiation protection", "PACS", "Patient positioning",
                 "Contrast administration", "Quality assurance", "Fluoroscopy"],
        credentials: [], duties: [],
      },
      usage: { in: 10, out: 10 },
    }),
  });
});

/* Seed a job title so the blueprint button is live, then land on the skills step. */
await page.goto(`${BASE}/builder`, { waitUntil: "load" });
await page.waitForTimeout(600);
await page.goto(`${BASE}/builder/probe-2/target`, { waitUntil: "load" });
await page.waitForTimeout(900);
const title = page.locator("input").first();
await title.fill("Radiology Technologist");
await title.blur();
await page.waitForTimeout(400);
await page.goto(`${BASE}/builder/probe-2/skills`, { waitUntil: "load" });
await page.waitForTimeout(900);

/* Any button that carries the busy ring when pressed. */
const suggest = page.locator("button").filter({ has: page.locator(".brand-orb") }).first();
const found = await suggest.count();
ok("the suggest control is on the skills step", found > 0);

if (found) {
  await suggest.scrollIntoViewIfNeeded();
  await suggest.click();
  await page.waitForTimeout(500);   // mid-flight

  const busy = await page.evaluate(() => {
    const el = document.querySelector(".t-busy");
    if (!el) return { present: false };
    const ring = getComputedStyle(el, "::after");
    return {
      present: true,
      anim: ring.animationName,
      running: ring.animationPlayState,
      orbBusy: Boolean(el.querySelector(".brand-orb.is-busy")),
    };
  });
  ok("the pressed control carries a running ring while it waits",
    busy.present && busy.anim === "t-busy-ring" && busy.running === "running", JSON.stringify(busy));
  ok("and the orb inside it says the same thing", busy.orbBusy === true, JSON.stringify(busy));

  const ghosts = await page.evaluate(() => {
    const els = [...document.querySelectorAll(".t-ghost")];
    return {
      count: els.length,
      sweeping: els.length ? getComputedStyle(els[0], "::after").animationName : "",
      width: els.length ? Math.round(els[0].getBoundingClientRect().width) : 0,
    };
  });
  ok("placeholder chips hold the space", ghosts.count >= 4, JSON.stringify(ghosts));
  ok("and a light sweeps across them", ghosts.sweeping === "t-ghost-sweep", ghosts.sweeping);

  /* Then the answer. */
  await page.waitForTimeout(1800);

  const arrival = await page.evaluate(() => {
    const box = document.querySelector(".t-stagger");
    if (!box) return { staggered: false };
    const kids = [...box.children].slice(0, 5);
    return {
      staggered: true,
      count: box.children.length,
      delays: kids.map((k) => getComputedStyle(k).animationDelay),
      names: [...new Set(kids.map((k) => getComputedStyle(k).animationName))],
    };
  });
  ok("the answers arrive in a staggered list", arrival.staggered && arrival.count >= 4,
    JSON.stringify(arrival));
  ok("each one a little after the last",
    arrival.delays && new Set(arrival.delays).size === arrival.delays.length,
    JSON.stringify(arrival.delays));
  ok("and they animate rather than merely being delayed",
    arrival.names?.every((n) => n === "t-enter-in"), JSON.stringify(arrival.names));

  const gone = await page.evaluate(() => document.querySelectorAll(".t-ghost").length);
  ok("the placeholders are gone once the real ones land", gone === 0, `${gone} left`);

  const ringGone = await page.evaluate(() => document.querySelectorAll(".t-busy").length);
  ok("and the ring stops when the request does", ringGone === 0, `${ringGone} left`);
}

await browser.close();
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
