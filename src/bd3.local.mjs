import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
/* Chromium cannot report these, so count by SELECTOR instead: every selector that the built CSS
   gives a backdrop-filter to, matched against the live DOM. That is what iOS will actually blur. */
const SEL = [".card", ".ps-header", ".bd-header", ".bd-sheet-scrim", ".glass-surface", ".dock"];
for (const path of ["/resume-examples", "/", "/resume-examples/registered-nurse", "/pricing", "/builder"]) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto(`http://localhost:3340${path}`, { waitUntil: "load" });
  await p.waitForTimeout(500);
  const r = await p.evaluate((sel) => {
    let total = 0, px = 0; const per = {};
    for (const s of sel) {
      const els = [...document.querySelectorAll(s)];
      if (els.length) per[s] = els.length;
      total += els.length;
      for (const el of els) { const q = el.getBoundingClientRect(); px += q.width * q.height; }
    }
    return { total, blurredMPx: +(px / 1e6).toFixed(2), per };
  }, SEL);
  console.log(path.padEnd(36), JSON.stringify(r));
  await p.close();
}
await b.close();
