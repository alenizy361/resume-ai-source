import { chromium } from 'playwright-core';
const OUT = '/tmp/claude-0/-home-user-resume-ai-source/396b21ba-a154-5a57-9e4c-7e4f8bb0b3b1/scratchpad/r2-ar';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, locale: 'ar-SA' });
const p = await ctx.newPage();
await p.goto('http://localhost:3000/ar/optimize', { waitUntil: 'networkidle' });
await p.waitForTimeout(800);

const r = await p.evaluate(() => {
  const foot = document.querySelector('footer.ps-footer p');
  const cs = getComputedStyle(foot);
  const S = 'خدمة سير ذاتية';
  function measure(fontFamily, size) {
    const c = document.createElement('canvas').getContext('2d');
    c.font = `600 ${size}px ${fontFamily}`;
    return c.measureText(S).width;
  }
  const monoStack = "ui-monospace, monospace";
  const sansStack = "'IBM Plex Sans Arabic', 'Inter', -apple-system, sans-serif";
  // real DOM measurement
  function domW(ff) {
    const s = document.createElement('span');
    s.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:600 11px/1.6 ${ff};`;
    s.textContent = S; document.body.appendChild(s);
    const w = s.getBoundingClientRect().width; s.remove(); return w;
  }
  const footRange = document.createRange();
  return {
    footerComputed: { ff: cs.fontFamily, fs: cs.fontSize, lh: cs.lineHeight, weight: cs.fontWeight, ta: cs.textAlign, dir: cs.direction },
    footerText: foot.textContent,
    monoW: +domW(monoStack).toFixed(2),
    sansW: +domW(sansStack).toFixed(2),
    canvasMono: +measure(monoStack, 11).toFixed(2),
    canvasSans: +measure(sansStack, 11).toFixed(2),
    // counter
    counter: (() => {
      const el = document.querySelector('p.mono-nums');
      if (!el) return null;
      const c = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { txt: el.textContent, ff: c.fontFamily, fs: c.fontSize, dir: c.direction, ta: c.textAlign, rect: { x: +r.x.toFixed(1), w: +r.width.toFixed(1) }, parentDir: getComputedStyle(el.parentElement).direction };
    })(),
    plexLoaded: [...document.fonts].map(f => f.family + ' ' + f.weight + ' ' + f.status).slice(0, 20),
  };
});
console.log(JSON.stringify(r, null, 1));

// zoom crop of footer
const foot = await p.$('footer.ps-footer');
await foot.scrollIntoViewIfNeeded();
await p.waitForTimeout(300);
await foot.screenshot({ path: `${OUT}/z-footer-mono.png` });
// side by side comparison render
await p.evaluate(() => {
  const d = document.createElement('div');
  d.id = 'cmp';
  d.style.cssText = 'position:fixed;inset:auto 0 0 0;z-index:99999;background:#fff;color:#000;padding:12px;';
  d.innerHTML = `<div style="font:600 11px/1.6 ui-monospace,monospace">MONO: © 2026 سيرة · خدمة سير ذاتية من رابِط</div>
  <div style="font:600 11px/1.6 'IBM Plex Sans Arabic',Inter,sans-serif">SANS: © 2026 سيرة · خدمة سير ذاتية من رابِط</div>
  <div style="font:600 22px/1.6 ui-monospace,monospace">MONO22: خدمة سير ذاتية من رابِط</div>
  <div style="font:600 22px/1.6 'IBM Plex Sans Arabic',Inter,sans-serif">SANS22: خدمة سير ذاتية من رابِط</div>`;
  document.body.appendChild(d);
});
await p.waitForTimeout(200);
await (await p.$('#cmp')).screenshot({ path: `${OUT}/z-mono-vs-sans.png` });
await b.close();
