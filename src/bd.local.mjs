import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
for (const path of ["/resume-examples", "/", "/resume-examples/registered-nurse", "/pricing"]) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto(`http://localhost:3330${path}`, { waitUntil: "load" });
  await p.waitForTimeout(700);
  const r = await p.evaluate(() => {
    const all = [...document.querySelectorAll("*")];
    const bd = all.filter(el => { const s = getComputedStyle(el);
      return (s.backdropFilter && s.backdropFilter !== "none") || (s.webkitBackdropFilter && s.webkitBackdropFilter !== "none"); });
    let px = 0; for (const el of bd) { const q = el.getBoundingClientRect(); px += q.width * q.height; }
    return { cards: document.querySelectorAll(".card").length, backdrops: bd.length,
      backdropMPx: +(px/1e6).toFixed(2),
      orbs: document.querySelectorAll(".brand-orb").length,
      infinite: document.getAnimations().filter(a => a.effect?.getComputedTiming?.().iterations === Infinity).length };
  });
  console.log(path.padEnd(36), JSON.stringify(r));
  await p.close();
}
await b.close();
