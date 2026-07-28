import { chromium } from "playwright-core";

export const EXEC = "/opt/pw-browsers/chromium";
export const BASE = "http://localhost:3000";

export async function browser() {
  return chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
}

export async function ctx(b, opts = {}) {
  return b.newContext({
    viewport: opts.viewport || { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: opts.mobile !== false && (opts.viewport?.width ?? 390) < 700,
    hasTouch: opts.mobile !== false && (opts.viewport?.width ?? 390) < 700,
    userAgent: opts.ua,
    ...opts.extra,
  });
}

export async function overflow(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const out = { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, offenders: [] };
    if (de.scrollWidth <= de.clientWidth + 1) return out;
    const vw = de.clientWidth;
    for (const el of document.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || cs.position === "fixed") continue;
      if (r.right > vw + 1) {
        // only report if no scrollable ancestor absorbs it
        let anc = el.parentElement, absorbed = false;
        while (anc) {
          const acs = getComputedStyle(anc);
          if (/auto|scroll/.test(acs.overflowX) && anc.scrollWidth > anc.clientWidth) { absorbed = true; break; }
          anc = anc.parentElement;
        }
        if (!absorbed) out.offenders.push({
          tag: el.tagName, cls: (el.className || "").toString().slice(0, 110),
          right: Math.round(r.right), w: Math.round(r.width), left: Math.round(r.left),
          text: (el.textContent || "").trim().slice(0, 50),
        });
      }
    }
    out.offenders = out.offenders.slice(0, 12);
    return out;
  });
}

export async function touchTargets(page, min = 44) {
  return page.evaluate((min) => {
    const sel = 'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=switch], summary, label[for]';
    const bad = [];
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || cs.pointerEvents === "none") continue;
      if (r.top > (window.innerHeight * 6)) continue;
      // ignore inline links inside paragraphs (not tap targets per se)
      const inFlowText = el.tagName === "A" && el.closest("p,li") && cs.display.startsWith("inline");
      if (r.height < min || r.width < min) {
        bad.push({
          tag: el.tagName, cls: (el.className || "").toString().slice(0, 90),
          w: +r.width.toFixed(1), h: +r.height.toFixed(1),
          text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 40),
          inlineTextLink: !!inFlowText,
          y: Math.round(r.top),
        });
      }
    }
    return bad;
  }, min);
}

const lum = ([r, g, b]) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
export function ratio(a, b) {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

export async function contrast(page) {
  return page.evaluate(() => {
    const parse = (c) => {
      const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null;
    };
    const over = (fg, bg) => {
      const a = fg[3];
      return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a));
    };
    const lum = ([r, g, b]) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a, b) => { const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05); };
    const bgOf = (el) => {
      let n = el, stack = [];
      while (n && n !== document.documentElement) {
        const cs = getComputedStyle(n);
        if (/gradient/.test(cs.backgroundImage)) return { grad: true };
        const c = parse(cs.backgroundColor);
        if (c && c[3] > 0) { stack.push(c); if (c[3] === 1) break; }
        n = n.parentElement;
      }
      let base = [255, 255, 255];
      for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
      return { rgb: base };
    };
    const out = [];
    for (const el of document.querySelectorAll("*")) {
      if (el.children.length && ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const t = (el.textContent || "").trim();
      if (!t) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || +cs.opacity === 0) continue;
      const bg = bgOf(el);
      if (bg.grad) continue;
      const fgp = parse(cs.color); if (!fgp) continue;
      const fg = over(fgp, bg.rgb);
      const size = parseFloat(cs.fontSize), wt = +cs.fontWeight || 400;
      const large = size >= 24 || (size >= 18.66 && wt >= 700);
      const need = large ? 3 : 4.5;
      const cr = ratio(fg, bg.rgb);
      if (cr < need) out.push({
        ratio: +cr.toFixed(2), need, size, wt, text: t.slice(0, 46),
        color: cs.color, bg: `rgb(${bg.rgb.map(Math.round).join(",")})`,
        cls: (el.className || "").toString().slice(0, 80), tag: el.tagName, y: Math.round(r.top),
      });
    }
    return out;
  });
}

export async function truncation(page) {
  return page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      const clipping = cs.textOverflow === "ellipsis" || cs.webkitLineClamp !== "none" || (cs.overflow === "hidden" && cs.whiteSpace === "nowrap");
      if (!clipping) continue;
      const t = (el.textContent || "").trim();
      if (!t) continue;
      if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) {
        out.push({ tag: el.tagName, cls: (el.className || "").toString().slice(0, 80), text: t.slice(0, 60), sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight });
      }
    }
    return out.slice(0, 15);
  });
}
