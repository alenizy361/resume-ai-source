import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
for (const url of ['http://localhost:3000/ar/builder', 'http://localhost:3000/builder']) {
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.bd-grid.two > button' });
  if (!nodeId) { console.log(url, 'no button'); continue; }
  const mc = await cdp.send('CSS.getMatchedStylesForNode', { nodeId });
  const hits = [];
  for (const r of (mc.matchedCSSRules || [])) {
    const d = r.rule.style.cssProperties.find(x => x.name === 'display' || x.name === 'flex-direction');
    if (d) hits.push({ sel: r.rule.selectorList.text, origin: r.rule.origin, props: r.rule.style.cssProperties.filter(x => /display|flex/.test(x.name)).map(x => x.name + ':' + x.value) });
  }
  const geo = await p.evaluate(() => {
    const bt = document.querySelector('.bd-grid.two > button');
    const cs = getComputedStyle(bt);
    const k = [...bt.children].map(c => { const r = c.getBoundingClientRect(); return { t: c.textContent.slice(0, 22), x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1) }; });
    return { display: cs.display, fd: cs.flexDirection, k };
  });
  console.log('==', url, JSON.stringify(geo), '\n   rules:', JSON.stringify(hits));
}
await b.close();
