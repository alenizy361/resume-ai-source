import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.goto("http://localhost:3340/resume-examples", { waitUntil: "load" });
await p.waitForTimeout(400);
const r = await p.evaluate(async () => {
  const hrefs = [...document.querySelectorAll('link[rel="stylesheet"]')].map(l => l.href);
  let css = "";
  for (const h of hrefs) { try { css += await (await fetch(h)).text(); } catch {} }
  for (const el of document.querySelectorAll("style")) css += el.textContent || "";
  const sels = new Set();
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (/backdrop-filter\s*:\s*(?!none)/.test(m[2])) {
      for (const part of m[1].split(",")) { const t = part.trim();
        if (t && !t.startsWith("@") && !t.includes("%")) sels.add(t); }
    }
  }
  let total = 0, px = 0; const per = {};
  for (const sel of sels) { let els = [];
    try { els = [...document.querySelectorAll(sel)]; } catch { continue; }
    if (!els.length) continue; per[sel] = els.length; total += els.length;
    for (const el of els) { const q = el.getBoundingClientRect(); px += q.width*q.height; } }
  return { cssBytes: css.length, sels: [...sels], total, mpx: +(px/1e6).toFixed(2), per };
});
console.log(JSON.stringify(r, null, 1));
await b.close();
