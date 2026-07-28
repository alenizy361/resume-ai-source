import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = '/tmp/claude-0/-home-user-resume-ai-source/396b21ba-a154-5a57-9e4c-7e4f8bb0b3b1/scratchpad/r2-ar';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ar-SA' });
const p = await ctx.newPage();
p.on('console', m => { if (m.type() === 'error') console.error('CONSOLE', m.text().slice(0, 160)); });
await p.goto('http://localhost:3000/ar/builder', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);

// inspect the start cards
const cards = await p.evaluate(() => {
  const btns = [...document.querySelectorAll('.bd-grid.two > button')];
  return btns.map(bt => {
    const cs = getComputedStyle(bt);
    const r = bt.getBoundingClientRect();
    const kids = [...bt.children].map(k => {
      const kr = k.getBoundingClientRect(); const kc = getComputedStyle(k);
      return { cls: k.className, x: +kr.x.toFixed(1), y: +kr.y.toFixed(1), w: +kr.width.toFixed(1), h: +kr.height.toFixed(1), display: kc.display, ta: kc.textAlign, dir: kc.direction, txt: k.textContent.slice(0, 40) };
    });
    return { cls: bt.className, display: cs.display, ta: cs.textAlign, dir: cs.direction, flexDir: cs.flexDirection, gtc: cs.gridTemplateColumns, rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }, kids };
  });
});
console.log('STARTCARDS', JSON.stringify(cards, null, 1));

const c0 = await p.$('.bd-grid.two');
if (c0) await c0.screenshot({ path: `${OUT}/z-startcards.png` });

// click ابدأ
await p.click('text=ابدأ ←').catch(async () => { await p.click('.btn-accent'); });
await p.waitForTimeout(2500);
console.log('URL after start:', p.url());
fs.writeFileSync(`${OUT}/z-builder-cards.json`, JSON.stringify(cards, null, 1));
await p.screenshot({ path: `${OUT}/z-step-target.png`, fullPage: true });

const STEPS = ['target', 'blueprint', 'personal', 'experience', 'education', 'credentials', 'skills', 'languages', 'summary', 'review', 'design'];
const m = p.url().match(/builder\/([^/]+)\//);
const rid = m ? m[1] : null;
console.log('resumeId', rid);
fs.writeFileSync(`${OUT}/z-rid.txt`, String(rid));
await b.close();
