import { chromium } from 'playwright-core';
import fs from 'node:fs';

const OUT = '/tmp/claude-0/-home-user-resume-ai-source/396b21ba-a154-5a57-9e4c-7e4f8bb0b3b1/scratchpad/r2-ar';
const BASE = 'http://localhost:3000';

const PAGES = process.env.PAGES ? JSON.parse(process.env.PAGES) : [
  ['home', '/ar'],
  ['optimize', '/ar/optimize'],
  ['pricing', '/ar/pricing'],
  ['builder', '/ar/builder'],
  ['templates', '/ar/templates'],
  ['account', '/ar/account'],
  ['login', '/ar/login'],
  ['terms', '/ar/terms'],
  ['privacy', '/ar/privacy'],
  ['interview', '/interview?lang=ar'],
  ['linkedin', '/linkedin?lang=ar'],
  ['interview-live', '/interview-live?lang=ar'],
];

const VW = process.env.VW ? JSON.parse(process.env.VW) : { width: 390, height: 844 };
const TAG = process.env.TAG || 'm';

const AUDIT = () => {
  const out = { url: location.href, dir: document.documentElement.dir, lang: document.documentElement.lang };
  const ARABIC = /[؀-ۿ]/;

  function parseColor(c) {
    const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  function lum({ r, g, b }) {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  function over(fg, bg) {
    const a = fg.a;
    return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
  }
  function effBg(el) {
    let n = el, stack = [];
    while (n && n.nodeType === 1) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return { grad: true, color: null, node: n };
      const c = parseColor(cs.backgroundColor);
      if (c && c.a > 0) { stack.push(c); if (c.a >= 0.999) break; }
      n = n.parentElement;
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
    return { grad: false, color: base };
  }
  function ratio(c1, c2) {
    const l1 = lum(c1), l2 = lum(c2);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  function sel(el) {
    if (!el) return '';
    let s = el.tagName.toLowerCase();
    if (el.id) return s + '#' + el.id;
    const cls = (el.className && typeof el.className === 'string') ? el.className.trim().split(/\s+/).slice(0, 6).join('.') : '';
    if (cls) s += '.' + cls;
    const p = el.parentElement;
    if (p && p.tagName !== 'BODY') {
      const pc = (p.className && typeof p.className === 'string') ? p.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
      s = p.tagName.toLowerCase() + (pc ? '.' + pc : '') + ' > ' + s;
    }
    return s;
  }

  // --- horizontal overflow
  out.docScroll = { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bsw: document.body.scrollWidth };
  out.overflowers = [];
  const vw = document.documentElement.clientWidth;
  document.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed') return;
    if (r.right > vw + 1 || r.left < -1) {
      const ox = cs.overflowX;
      out.overflowers.push({ sel: sel(el), left: +r.left.toFixed(1), right: +r.right.toFixed(1), w: +r.width.toFixed(1), overflowX: ox, txt: (el.textContent || '').trim().slice(0, 40) });
    }
  });
  out.overflowers = out.overflowers.slice(0, 25);

  // --- scroll containers / dir check
  out.scrollers = [];
  document.querySelectorAll('*').forEach(el => {
    const cs = getComputedStyle(el);
    const ox = cs.overflowX;
    if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 2) {
      out.scrollers.push({ sel: sel(el), sw: el.scrollWidth, cw: el.clientWidth, dir: cs.direction, attrDir: el.getAttribute('dir'), scrollLeft: el.scrollLeft, txt: (el.textContent || '').trim().slice(0, 40) });
    }
  });

  // --- transform scaled previews
  out.scaled = [];
  document.querySelectorAll('*').forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.transform && cs.transform !== 'none' && /matrix/.test(cs.transform)) {
      const m = cs.transform.match(/matrix\(([^)]+)\)/);
      if (m) {
        const p = m[1].split(',').map(Number);
        if (Math.abs(p[0]) !== 1 && Math.abs(p[0]) > 0.01) {
          out.scaled.push({ sel: sel(el), scale: p[0], dir: cs.direction, attrDir: el.getAttribute('dir'), origin: cs.transformOrigin });
        }
      }
    }
  });

  // --- typography on Arabic text
  out.typo = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  const arabicEls = new Set();
  while ((n = walker.nextNode())) {
    const t = n.nodeValue || '';
    if (!ARABIC.test(t)) continue;
    const el = n.parentElement;
    if (!el) continue;
    arabicEls.add(el);
  }
  out.arabicElCount = arabicEls.size;
  arabicEls.forEach(el => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const fs = parseFloat(cs.fontSize);
    const lh = cs.lineHeight === 'normal' ? fs * 1.2 : parseFloat(cs.lineHeight);
    const ls = cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing);
    const ff = cs.fontFamily;
    const mono = /mono|courier|consolas|menlo/i.test(ff);
    const issues = [];
    if (Math.abs(ls) > 0.05) issues.push('letter-spacing:' + cs.letterSpacing);
    if (mono) issues.push('mono-font');
    if (lh / fs < 1.25) issues.push('line-height-ratio:' + (lh / fs).toFixed(3));
    if (cs.wordSpacing !== 'normal' && Math.abs(parseFloat(cs.wordSpacing)) > 0.05) issues.push('word-spacing:' + cs.wordSpacing);
    if (issues.length) {
      const k = sel(el) + '|' + issues.join(',');
      if (seen.has(k)) return; seen.add(k);
      out.typo.push({ sel: sel(el), issues, fontSize: cs.fontSize, lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing, fontFamily: ff.slice(0, 90), txt: (el.textContent || '').trim().slice(0, 60), classes: typeof el.className === 'string' ? el.className : '', rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) } });
    }
  });

  // --- contrast on Arabic + all text leaves
  out.contrast = [];
  const cseen = new Set();
  document.querySelectorAll('*').forEach(el => {
    if (el.children.length > 0 && ![...el.childNodes].some(c => c.nodeType === 3 && c.nodeValue.trim())) return;
    const txt = (el.textContent || '').trim();
    if (!txt) return;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    if (r.bottom < 0 || r.top > document.documentElement.scrollHeight) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.opacity === '0' || cs.display === 'none') return;
    if (parseFloat(cs.opacity) < 0.95) return;
    const fg = parseColor(cs.color); if (!fg) return;
    const bg = effBg(el);
    if (bg.grad || !bg.color) return;
    const eff = fg.a < 1 ? over(fg, bg.color) : fg;
    const ra = ratio(eff, bg.color);
    const fsz = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight) >= 700;
    const large = fsz >= 24 || (bold && fsz >= 18.66);
    const need = large ? 3 : 4.5;
    if (ra < need) {
      const k = cs.color + '|' + bg.color.r + ',' + bg.color.g + ',' + bg.color.b + '|' + cs.fontSize;
      if (cseen.has(k)) return; cseen.add(k);
      out.contrast.push({ sel: sel(el), ratio: +ra.toFixed(2), need, color: cs.color, bg: `rgb(${Math.round(bg.color.r)}, ${Math.round(bg.color.g)}, ${Math.round(bg.color.b)})`, fontSize: cs.fontSize, weight: cs.fontWeight, txt: txt.slice(0, 60), classes: typeof el.className === 'string' ? el.className : '' });
    }
  });

  // --- touch targets
  out.touch = [];
  const tseen = new Set();
  document.querySelectorAll('a[href], button, input, select, textarea, [role="button"], [role="tab"], [onclick], label[for], summary').forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (el.type === 'hidden') return;
    // skip inline links inside paragraphs
    const p = el.parentElement;
    const inProse = el.tagName === 'A' && p && /^(P|LI|SPAN|SMALL)$/.test(p.tagName) && getComputedStyle(el).display === 'inline';
    if (r.width < 44 || r.height < 44) {
      const k = sel(el) + '|' + Math.round(r.width) + 'x' + Math.round(r.height);
      if (tseen.has(k)) return; tseen.add(k);
      out.touch.push({ sel: sel(el), w: +r.width.toFixed(1), h: +r.height.toFixed(1), inProse, tag: el.tagName, txt: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40), classes: typeof el.className === 'string' ? el.className : '', x: +r.x.toFixed(1), y: +r.y.toFixed(1) });
    }
  });

  // --- fixed elements + safe area
  out.fixed = [];
  document.querySelectorAll('*').forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') return;
    const r = el.getBoundingClientRect();
    if (r.height < 5 || r.width < 40) return;
    out.fixed.push({ sel: sel(el), pos: cs.position, top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), h: +r.height.toFixed(1), pt: cs.paddingTop, pb: cs.paddingBottom, styleAttr: el.getAttribute('style') || '', cssTop: cs.top, cssBottom: cs.bottom, z: cs.zIndex });
  });

  // --- latin words inside arabic blocks + digits
  out.mixed = [];
  const digSeen = new Set();
  document.querySelectorAll('p, li, h1, h2, h3, h4, span, div, button, a, label, small').forEach(el => {
    if (el.children.length > 3) return;
    const t = (el.textContent || '').trim();
    if (!t || t.length > 200) return;
    if (!ARABIC.test(t)) return;
    const hasLatin = /[A-Za-z]{2,}/.test(t);
    const hasWestDigit = /[0-9]/.test(t);
    const hasArabDigit = /[٠-٩]/.test(t);
    if (hasLatin || hasWestDigit || hasArabDigit) {
      const cs = getComputedStyle(el);
      const k = t.slice(0, 50);
      if (digSeen.has(k)) return; digSeen.add(k);
      out.mixed.push({ sel: sel(el), txt: t.slice(0, 120), hasLatin, hasWestDigit, hasArabDigit, unicodeBidi: cs.unicodeBidi, direction: cs.direction, textAlign: cs.textAlign });
    }
  });
  out.mixed = out.mixed.slice(0, 60);

  // --- text-align vs direction conflicts
  out.align = [];
  const aseen = new Set();
  arabicEls.forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.direction === 'rtl' && cs.textAlign === 'left') {
      const k = sel(el); if (aseen.has(k)) return; aseen.add(k);
      out.align.push({ sel: sel(el), textAlign: cs.textAlign, direction: cs.direction, txt: (el.textContent || '').trim().slice(0, 50), classes: typeof el.className === 'string' ? el.className : '' });
    }
    if (cs.direction === 'ltr') {
      const k = 'ltr' + sel(el); if (aseen.has(k)) return; aseen.add(k);
      out.align.push({ sel: sel(el), textAlign: cs.textAlign, direction: 'ltr-on-arabic', txt: (el.textContent || '').trim().slice(0, 50), classes: typeof el.className === 'string' ? el.className : '' });
    }
  });
  out.align = out.align.slice(0, 30);

  // --- untranslated english blocks (whole element is latin, no arabic)
  out.english = [];
  const eseen = new Set();
  document.querySelectorAll('p,h1,h2,h3,h4,button,label,li,span,a,small,th,td,option').forEach(el => {
    if (el.children.length > 0) return;
    const t = (el.textContent || '').trim();
    if (t.length < 4 || t.length > 160) return;
    if (ARABIC.test(t)) return;
    if (!/[A-Za-z]{3,}/.test(t)) return;
    if (/^[\d\s.,%+\-/$]+$/.test(t)) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0) return;
    if (eseen.has(t)) return; eseen.add(t);
    out.english.push({ sel: sel(el), txt: t, tag: el.tagName });
  });
  out.english = out.english.slice(0, 60);

  // --- line box overlap detection for arabic
  out.overlap = [];
  arabicEls.forEach(el => {
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize);
    const lh = cs.lineHeight === 'normal' ? fs * 1.2 : parseFloat(cs.lineHeight);
    if (lh / fs >= 1.25) return;
    const range = document.createRange();
    try {
      range.selectNodeContents(el);
      const rects = [...range.getClientRects()];
      if (rects.length < 2) return;
      out.overlap.push({ sel: sel(el), lines: rects.length, fs, lh, ratio: +(lh / fs).toFixed(3), inkOverlapPx: +(fs * 1.18 - lh).toFixed(2), txt: (el.textContent || '').trim().slice(0, 50) });
    } catch (e) { }
  });
  out.overlap = out.overlap.slice(0, 20);

  return out;
};

const results = {};
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: VW, deviceScaleFactor: 2, isMobile: VW.width < 500, hasTouch: true, locale: 'ar-SA' });
  const page = await ctx.newPage();
  const consoleErrs = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 200)); });

  for (const [name, path] of PAGES) {
    try {
      const errs = [];
      consoleErrs.length = 0;
      await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForTimeout(1200);
      const r = await page.evaluate(AUDIT);
      r.console = [...consoleErrs];
      r.path = path;
      results[name] = r;
      await page.screenshot({ path: `${OUT}/${TAG}-${name}.png`, fullPage: false });
      await page.screenshot({ path: `${OUT}/${TAG}-${name}-full.png`, fullPage: true });
      console.error('done', name);
    } catch (e) {
      results[name] = { error: String(e).slice(0, 300), path };
      console.error('FAIL', name, String(e).slice(0, 150));
    }
  }
  fs.writeFileSync(`${OUT}/${TAG}-results.json`, JSON.stringify(results, null, 1));
  await browser.close();
})();
