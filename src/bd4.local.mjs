import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const SEL = [".chip", ".tpl-card", ".glass-surface", ".dock"];
for (const path of ["/", "/resume-templates", "/templates", "/builder", "/pricing", "/resume-examples/registered-nurse"]) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto(`http://localhost:3330${path}`, { waitUntil: "load" }).catch(()=>{});
  await p.waitForTimeout(500);
  const r = await p.evaluate((sel) => {
    const per = {}; let px = 0, total = 0;
    for (const s of sel) { const e = [...document.querySelectorAll(s)];
      if (e.length) { per[s] = e.length; total += e.length;
        for (const el of e) { const q = el.getBoundingClientRect(); px += q.width*q.height; } } }
    return { total, mpx: +(px/1e6).toFixed(2), per };
  }, SEL);
  console.log(path.padEnd(38), JSON.stringify(r));
  await p.close();
}
await b.close();
