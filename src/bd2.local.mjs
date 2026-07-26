import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.goto("http://localhost:3330/resume-examples", { waitUntil: "load" });
await p.waitForTimeout(600);
console.log(await p.evaluate(() => {
  const el = document.querySelector(".card");
  const s = getComputedStyle(el);
  return JSON.stringify({
    cls: el.className,
    backdropFilter: s.backdropFilter,
    webkit: s.webkitBackdropFilter,
    supports: CSS.supports("backdrop-filter", "blur(14px)"),
    bg: s.backgroundColor,
    radius: s.borderRadius,
  }, null, 1);
}));
// Is the rule even in the served stylesheet?
const css = await p.evaluate(async () => {
  const link = [...document.querySelectorAll('link[rel=stylesheet]')].map(l=>l.href);
  const out = [];
  for (const h of link) { const t = await (await fetch(h)).text(); out.push(t); }
  return out.join("\n");
});
const i = css.indexOf("backdrop-filter");
console.log("served CSS contains backdrop-filter:", i !== -1);
if (i !== -1) console.log("context:", css.slice(Math.max(0,i-160), i+60).replace(/\n/g," "));
await b.close();
