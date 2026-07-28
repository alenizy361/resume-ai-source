import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = '/tmp/claude-0/-home-user-resume-ai-source/396b21ba-a154-5a57-9e4c-7e4f8bb0b3b1/scratchpad/r2-ar';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'ar-SA' });
const p = await ctx.newPage();
const pages = ['/ar', '/ar/optimize', '/ar/pricing', '/ar/builder', '/ar/templates', '/ar/account', '/ar/login', '/ar/terms', '/ar/privacy', '/interview?lang=ar', '/linkedin?lang=ar', '/interview-live?lang=ar'];
const all = {};
for (const path of pages) {
  await p.goto('http://localhost:3000' + path, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1000);
  all[path] = await p.evaluate(() => {
    const res = [];
    document.querySelectorAll('a[href],button,[role="button"],input:not([type=hidden]),select,summary').forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      if (r.height >= 44 && r.width >= 44) return;
      const parentTags = [];
      let n = el.parentElement, i = 0;
      while (n && i++ < 4) { parentTags.push(n.tagName.toLowerCase() + (typeof n.className === 'string' && n.className ? '.' + n.className.trim().split(/\s+/)[0] : '')); n = n.parentElement; }
      res.push({
        tag: el.tagName, cls: typeof el.className === 'string' ? el.className : '',
        w: +r.width.toFixed(1), h: +r.height.toFixed(1), x: +r.x.toFixed(1), y: +r.y.toFixed(1),
        hasTTap: el.classList.contains('t-tap'), minH: cs.minHeight, disp: cs.display,
        parents: parentTags.join(' < '),
        txt: (el.textContent || el.getAttribute('aria-label') || el.placeholder || '').trim().slice(0, 40),
      });
    });
    return res;
  });
}
fs.writeFileSync(`${OUT}/touch.json`, JSON.stringify(all, null, 1));
for (const [k, v] of Object.entries(all)) {
  console.log('### ' + k);
  v.forEach(t => console.log(`  ${t.w}x${t.h} ttap=${t.hasTTap} minH=${t.minH} disp=${t.disp} | ${JSON.stringify(t.txt)} | ${t.cls.slice(0, 60)} | ${t.parents}`));
}
await b.close();
